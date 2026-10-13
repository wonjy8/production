/* Browser-only storage. Private workspace data and files stay in this origin's IndexedDB. */
const localDbName = 'production-local:' + self.registration.scope;
const localEmptyWorkspace = () => ({projects:[], productions:[], members:[], equipment:[], rentalShops:[], locations:[]});
const localCollections = {members:'members', equipment:'equipment', 'rental-shops':'rentalShops', locations:'locations'};
const localId = /^[a-f0-9-]{36}$/i;

function localOpen() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(localDbName,1);
    request.onupgradeneeded = () => {for (const name of ['workspace','references','files','account']) request.result.createObjectStore(name)};
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
async function localRead(store,key) {
  const db=await localOpen();
  return new Promise((resolve,reject) => {
    const tx=db.transaction(store,'readonly'),request=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);
    let value;request.onsuccess=()=>{value=request.result};tx.oncomplete=()=>{db.close();resolve(value)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)};
  });
}
async function localWrite(store,key,value) {
  const db=await localOpen();
  return new Promise((resolve,reject) => {
    const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);
    tx.oncomplete=()=>{db.close();resolve(value)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)};
  });
}
function localJson(value,status=200,headers={}) {return Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}})}
function localRevision(value) {return '"'+value+'"'}
async function localWorkspace(request) {
  if(request.method==='GET') {
    const saved=await localRead('workspace','current');
    return localJson(saved?.data||localEmptyWorkspace(),200,{'ETag':localRevision(saved?.revision||'0')});
  }
  if(request.method!=='PUT')return localJson({error:'Method not allowed'},405);
  const data=await request.json();if(!data||typeof data!=='object'||Array.isArray(data))return localJson({error:'잘못된 데이터'},400);
  const db=await localOpen();
  return new Promise((resolve,reject) => {
    const tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),read=store.get('current');
    let conflict=false,revision='';
    read.onsuccess=()=>{const current=read.result,expected=request.headers.get('If-Match');if(expected&&expected!==localRevision(current?.revision||'0')){conflict=true;return}revision=crypto.randomUUID();store.put({data,revision},'current')};
    tx.oncomplete=()=>{db.close();resolve(conflict?localJson({error:'다른 탭에서 데이터가 변경되었습니다. 새로고침해 주세요.'},409):localJson({ok:true},200,{'ETag':localRevision(revision)}))};
    tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)};
  });
}
async function localFile(request,id,url) {
  if(!localId.test(id))return localJson({error:'잘못된 파일 ID'},400);
  if(request.method==='PUT') {
    const blob=await request.blob();if(blob.size>25*1024*1024)return localJson({error:'파일당 25MB 이하여야 합니다'},413);
    await localWrite('files',id,{blob,mime:request.headers.get('Content-Type')||blob.type||'application/octet-stream'});
    return localJson({ok:true});
  }
  if(!['GET','HEAD'].includes(request.method))return localJson({error:'Method not allowed'},405);
  const row=await localRead('files',id);if(!row)return localJson({error:'파일 없음'},404);
  const safe=/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg)|application\/pdf)$/.test(row.mime);
  const headers=new Headers({'Content-Type':safe?row.mime:'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes','Content-Security-Policy':"default-src 'none'; sandbox"});
  if(url.searchParams.has('download')||!safe){const name=(url.searchParams.get('name')||'file').replace(/[\r\n"\\]/g,'_').slice(0,250);headers.set('Content-Disposition','attachment; filename="'+name+'"')}
  let body=row.blob,status=200;const range=request.headers.get('Range');
  if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return localJson({error:'잘못된 범위'},416);const start=match[1]?Number(match[1]):Math.max(0,body.size-Number(match[2])),end=match[1]?(match[2]?Number(match[2]):body.size-1):body.size-1;if(start>=body.size||end<start)return localJson({error:'잘못된 범위'},416);headers.set('Content-Range',`bytes ${start}-${Math.min(end,body.size-1)}/${body.size}`);body=body.slice(start,Math.min(end+1,body.size));status=206}
  headers.set('Content-Length',String(body.size));return new Response(request.method==='HEAD'?null:body,{status,headers});
}
async function localAuth(request,part) {
  if(part==='me'&&request.method==='GET') {
    const profile=await localRead('account','profile')||{name:'내 브라우저',contact:'',email:''};
    return localJson({id:'local',email:'',role:'superadmin',memberId:'local',profile,mfaRequired:false,mfaEnrolled:false,permissions:[],localMode:true});
  }
  if(part==='member-status'&&request.method==='GET')return localJson(((await localRead('workspace','current'))?.data?.members||[]).filter(row=>!row.deleted).map(row=>({memberId:row.id,registered:false})));
  if(part==='users'&&request.method==='GET')return localJson([]);
  if(part==='profile'&&request.method==='PUT'){const data=await request.json();const profile={name:String(data.name||'내 브라우저').slice(0,254),contact:String(data.contact||'').slice(0,254),email:String(data.email||'').slice(0,254)};await localWrite('account','profile',profile);return localJson({ok:true})}
  if(part==='logout'&&request.method==='POST')return localJson({ok:true});
  if(part==='tab-permissions'&&request.method==='GET')return localJson([]);
  return localJson({error:'브라우저 저장 모드에서는 계정 관리가 필요하지 않습니다.'},400);
}
async function localDatabase(request,part,url) {
  const [collection,id]=part.split('/'),key=localCollections[collection];if(!key||id&&!localId.test(id))return localJson({error:'알 수 없는 목록'},404);
  if(request.method==='GET'&&!id){const rows=((await localRead('workspace','current'))?.data?.[key]||[]).filter(row=>!row.deleted),q=(url.searchParams.get('q')||'').toLocaleLowerCase();return localJson(rows.filter(row=>!q||JSON.stringify(row).toLocaleLowerCase().includes(q)))}
  if(request.method==='PUT'&&id){const item=await request.json();if(!item||typeof item!=='object'||Array.isArray(item))return localJson({error:'잘못된 항목'},400);item.id=id;const db=await localOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),read=store.get('current');read.onsuccess=()=>{const saved=read.result||{data:localEmptyWorkspace()},rows=saved.data[key]||[];saved.data[key]=rows.some(row=>row.id===id)?rows.map(row=>row.id===id?item:row):[...rows,item];saved.revision=crypto.randomUUID();store.put(saved,'current')};tx.oncomplete=()=>{db.close();resolve(localJson(item))};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}})}
  return localJson({error:'Method not allowed'},405);
}

self.handleLocalRequest=async request=>{
  try {
    const url=new URL(request.url),base=new URL('api/',self.registration.scope).pathname,part=url.pathname.slice(base.length);
    if(part==='data')return localWorkspace(request);
    if(part==='references'&&request.method==='GET'){const rows=await localRead('references');return localJson(rows.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))))}
    if(part.startsWith('references/')&&request.method==='PUT'){const id=part.slice(11),item=await request.json();if(!localId.test(id)||item?.id!==id||!String(item?.title||'').trim())return localJson({error:'잘못된 자료'},400);item.updatedAt=new Date().toISOString();await localWrite('references',id,item);return localJson(item)}
    if(part.startsWith('ref-files/'))return localFile(request,part.slice(10),url);
    if(part.startsWith('database/'))return localDatabase(request,part.slice(9),url);
    if(part.startsWith('auth/'))return localAuth(request,part.slice(5));
    if(part==='storage'||part==='storage/check')return localJson({mode:'browser',configured:false,ok:true});
    if(part==='youtube-meta'){const id=url.searchParams.get('id')||'';if(!/^[\w-]{11}$/.test(id))return localJson({error:'잘못된 영상 ID'},400);try{const response=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+id),{signal:AbortSignal.timeout(8000)});const data=await response.json();return localJson({id,title:typeof data.title==='string'?data.title.slice(0,500):'',thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'})}catch{return localJson({id,title:'',thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'})}}
    return localJson({error:'Not found'},404);
  } catch(error) {return localJson({error:error?.name==='QuotaExceededError'?'브라우저 저장 공간이 부족합니다.':'브라우저 저장에 실패했습니다.'},error?.name==='QuotaExceededError'?507:500)}
};
