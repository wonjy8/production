async function localCatalogScan(workspace,references){
 const rows=new Map();
 async function walk(value,origin,tags=[]){
  if(Array.isArray(value)){for(const node of value)await walk(node,origin,tags);return}
  if(!value||typeof value!=='object'||value.deleted||value.hidden)return;
  tags=[...new Set([...tags,...(Array.isArray(value.tags)?value.tags:[])].filter(t=>typeof t==='string'))];
  let fileId=value.fileId||((['image','video','audio','pdf','file','document'].includes(value.kind)||value.mime)?value.id:null),url=['link','youtube','embed'].includes(value.kind)&&/^https?:\/\//.test(value.url||'')?value.url:'';
  const textOnly=value.kind==='text'&&typeof value.text==='string'&&value.id;
  if(fileId||url||textOnly){let id=fileId;if(!id){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(textOnly?'text:'+origin.ownerId+':'+value.id:url))),hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,32);id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20)}const row=rows.get(id)||{id,fileId:fileId||null,url:fileId?'':url,...(textOnly?{content:value.text}:{}),title:value.name||value.originalName||value.title||(textOnly?'텍스트':url?'링크':'파일'),filename:value.name||value.originalName||'',mime:value.mime||'',size:value.size||0,kind:value.kind||'file',tags:[],properties:value.resourceProperties||{},propertyLabels:value.resourcePropertyLabels||{},origins:[]};row.tags=[...new Set([...row.tags,...tags])].slice(0,30);if(!row.origins.some(o=>JSON.stringify(o)===JSON.stringify(origin)))row.origins.push(origin);rows.set(id,row)}
  for(const [field,node] of Object.entries(value)){if(['source','photoEdit','archives','resourceProperties','resourcePropertyLabels'].includes(field))continue;if(['tabs','customTabs'].includes(field)&&Array.isArray(node)){for(const tab of node)await walk(tab,{...origin,tabId:tab.id,tabName:tab.name},tags)}else if(['modules','blocks'].includes(field)&&Array.isArray(node)){for(const module of node)await walk(module,{...origin,moduleId:module.id,moduleName:module.title},tags)}else await walk(node,origin,tags)}
 }
 for(const [key,kind] of [['projects','project'],['productions','production']])for(const owner of workspace[key]||[])await walk(owner,{ownerKind:kind,ownerId:owner.id,ownerName:owner.name||owner.title||''});
 for(const owner of references)await walk(owner,{ownerKind:'reference',ownerId:owner.id,ownerName:owner.title||''});return rows;
}
async function localResourceTransaction(fn){const db=await localOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('resources','readwrite'),store=tx.objectStore('resources'),read=store.getAll();let result;read.onsuccess=()=>{try{result=fn(store,read.result)}catch(error){reject(error);tx.abort()}};tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('자료 저장 실패'))}})}
async function localEnsureResources(){
 const workspace=(await localRead('workspace','current'))?.data||localEmptyWorkspace(),references=await localRead('references'),discovered=await localCatalogScan(workspace,references);
 let rows=await localResourceTransaction((store,existing)=>{for(const row of discovered.values()){const old=existing.find(r=>r.id===row.id);if(old){if(row.kind==='text'&&old.content!==row.content){old.content=row.content;old.version++;old.updatedAt=new Date().toISOString();store.put(old,old.id)}continue}const {origins,...data}=row,item={...data,version:1,updatedAt:new Date().toISOString()};store.put(item,item.id);existing.push(item)}return existing});
 return {rows,discovered};
}
async function localResources(request,id){
 const {rows,discovered}=await localEnsureResources();
 if(request.method==='GET'&&!id){const result=[];for(const row of rows){const f=row.fileId?await localRead('files',row.fileId):null;if(row.fileId&&!f)continue;result.push({...row,...(f?{size:f.blob.size,mime:f.mime,sha256:f.sha256}:{}),origins:discovered.get(row.id)?.origins||[],canEdit:true})}return localJson(result)}
 if(request.method==='PUT'&&localId.test(id||'')){
  const data=await request.json(),fileId=rows.find(r=>r.id===id)?.fileId||data.fileId,url=data.url||'';
  if(fileId&&(id!==fileId||!await localRead('files',fileId)))return localJson({error:'파일을 먼저 업로드하세요'},400);
  if(!fileId&&!rows.some(r=>r.id===id)&&!/^https?:\/\//.test(url))return localJson({error:'올바른 자료 주소가 필요합니다'},400);
  if(typeof data.title!=='string'||!data.title.trim()||data.title.length>200||!Array.isArray(data.tags)||data.tags.length>30||data.tags.some(t=>typeof t!=='string'||t.length>100)||!data.properties||typeof data.properties!=='object'||Array.isArray(data.properties)||Object.keys(data.properties).length>50||Object.entries(data.properties).some(([k,v])=>k.length>80||typeof v!=='string'||v.length>2000))return localJson({error:'자료 속성을 확인하세요'},400);
  return localResourceTransaction((store,existing)=>{const old=existing.find(r=>r.id===id),version=old?.version||0;if(request.headers.get('If-Match')!==localRevision(version))return localJson({error:'자료가 다른 곳에서 변경되었습니다. 새로고침 후 다시 시도하세요.'},409);const item={...(old||{id,fileId:fileId||null,url,kind:data.kind||'file',mime:data.mime||'',filename:String(data.filename||'').slice(0,250)}),title:data.title.trim(),tags:data.tags,properties:data.properties,propertyLabels:data.propertyLabels||old?.propertyLabels||{},deleted:!!data.deleted,version:version+1,updatedAt:new Date().toISOString()};store.put(item,id);return localJson({...item,canEdit:true,origins:discovered.get(id)?.origins||[]})})
 }
 return localJson({error:'Method not allowed'},405);
}

/* Browser-only storage. Private workspace data and files stay in this origin's IndexedDB. */
const localDbName = 'production-local:' + self.registration.scope;
const localEmptyWorkspace = () => ({projects:[], productions:[], members:[], equipment:[], rentalShops:[], locations:[]});
const localCollections = {members:'members', equipment:'equipment', 'rental-shops':'rentalShops', locations:'locations'};
const localId = /^[a-f0-9-]{36}$/i;

function localOpen() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(localDbName,2);
    request.onupgradeneeded = () => {for (const name of ['workspace','references','files','account','resources']) if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name)};
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
function localReferenceFileIds(item){const ids=new Set();const walk=v=>{if(!v||typeof v!=='object')return;if(v.fileId)ids.add(v.fileId);if(['image','video','audio','pdf','file','document'].includes(v.kind)&&v.id)ids.add(v.id);if(Array.isArray(v))v.forEach(walk);else Object.values(v).forEach(walk)};walk(item);return ids}
async function localDeleteReferences(ids){
 const db=await localOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(['references','workspace','files','resources'],'readwrite'),records=tx.objectStore('references'),refsRequest=records.getAll(),workspaceRequest=tx.objectStore('workspace').get('current'),catalogRequest=tx.objectStore('resources').getAll();let refs,workspace,catalog;const finish=()=>{if(!refs||workspace===undefined||!catalog)return;const removed=refs.filter(r=>ids.includes(r.id)),remaining=refs.filter(r=>!ids.includes(r.id)),used=JSON.stringify([workspace,remaining,catalog.filter(r=>!r.deleted)]),files=tx.objectStore('files');removed.forEach(r=>{records.delete(r.id);localReferenceFileIds(r).forEach(id=>{if(localId.test(id)&&!used.includes(id))files.delete(id)})})};catalogRequest.onsuccess=()=>{catalog=catalogRequest.result;finish()};refsRequest.onsuccess=()=>{refs=refsRequest.result;finish()};workspaceRequest.onsuccess=()=>{workspace=workspaceRequest.result||null;finish()};tx.oncomplete=()=>{db.close();resolve()};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}})
}
async function localPurgeReferenceTrash(){const rows=await localRead('references'),cutoff=Date.now()-30*86400000,expired=rows.filter(r=>r.deleted&&Date.parse(r.deletedAt||r.updatedAt||r.createdAt)<=cutoff);if(expired.length)await localDeleteReferences(expired.map(r=>r.id));return rows.filter(r=>!expired.some(v=>v.id===r.id))}
function localJson(value,status=200,headers={}) {return Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}})}
function localRevision(value) {return '"'+value+'"'}
async function localWorkspace(request) {
  if(request.method==='GET') {
    await localEnsureResources();
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
    tx.oncomplete=async()=>{db.close();if(!conflict)await localEnsureResources().catch(()=>{});resolve(conflict?localJson({error:'다른 탭에서 데이터가 변경되었습니다. 새로고침해 주세요.'},409):localJson({ok:true},200,{'ETag':localRevision(revision)}))};
    tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)};
  });
}
async function localFile(request,id,url) {
  if(!localId.test(id))return localJson({error:'잘못된 파일 ID'},400);
  if(request.method==='PUT') {
    const blob=await request.blob();if(blob.size>25*1024*1024)return localJson({error:'파일당 25MB 이하여야 합니다'},413);
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
    const before=await localRead('files',id),expected=request.headers.get('If-Match');
    const previousHash=before&&!before.sha256?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await before.blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join(''):before?.sha256;
    const db=await localOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite'),store=tx.objectStore('files'),read=store.get(id);let conflict=false;read.onsuccess=()=>{const row=read.result;if(expected&&(!row||expected!==localRevision(row.sha256||previousHash))){conflict=true;return}if(row&&!expected){conflict=true;return}store.put({blob,sha256,mime:request.headers.get('Content-Type')||blob.type||'application/octet-stream'},id)};tx.oncomplete=()=>{db.close();resolve(conflict?localJson({error:'원본 파일이 변경되었습니다.'},409):localJson({id,sha256},200,{'ETag':localRevision(sha256)}))};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}});
  }
  if(!['GET','HEAD'].includes(request.method))return localJson({error:'Method not allowed'},405);
  const row=await localRead('files',id);if(!row)return localJson({error:'파일 없음'},404);
  const sha256=row.sha256||Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await row.blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
  const safe=/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg)|application\/pdf)$/.test(row.mime);
  const headers=new Headers({'Content-Type':safe?row.mime:'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes','ETag':localRevision(sha256),'X-File-SHA256':sha256,'Content-Security-Policy':"default-src 'none'; sandbox"});
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
  if(part==='resources'||part.startsWith('resources/'))return localResources(request,part.split('/')[1]);
  const [collection,id]=part.split('/'),key=localCollections[collection];if(!key||id&&!localId.test(id))return localJson({error:'알 수 없는 목록'},404);
  if(request.method==='GET'&&!id){const rows=((await localRead('workspace','current'))?.data?.[key]||[]).filter(row=>!row.deleted),q=(url.searchParams.get('q')||'').toLocaleLowerCase();return localJson(rows.filter(row=>!q||JSON.stringify(row).toLocaleLowerCase().includes(q)))}
  if(request.method==='PUT'&&id){const item=await request.json();if(!item||typeof item!=='object'||Array.isArray(item))return localJson({error:'잘못된 항목'},400);item.id=id;const db=await localOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),read=store.get('current');read.onsuccess=()=>{const saved=read.result||{data:localEmptyWorkspace()},rows=saved.data[key]||[];saved.data[key]=rows.some(row=>row.id===id)?rows.map(row=>row.id===id?item:row):[...rows,item];saved.revision=crypto.randomUUID();store.put(saved,'current')};tx.oncomplete=()=>{db.close();resolve(localJson(item))};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}})}
  return localJson({error:'Method not allowed'},405);
}

self.handleLocalRequest=async request=>{
  try {
    const url=new URL(request.url),base=new URL('api/',self.registration.scope).pathname,part=url.pathname.slice(base.length);
    if(part==='data')return localWorkspace(request);
    if(part==='references'&&request.method==='GET'){const rows=await localPurgeReferenceTrash();return localJson(rows.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))))}
    if(part.startsWith('references/')&&request.method==='PUT'){const id=part.slice(11),item=await request.json();if(!localId.test(id)||item?.id!==id||!String(item?.title||'').trim())return localJson({error:'잘못된 자료'},400);const old=await localRead('references',id);item.updatedAt=new Date().toISOString();item.createdAt=item.createdAt||old?.createdAt||item.updatedAt;if(item.deleted)item.deletedAt=old?.deletedAt||(old?.deleted?old.updatedAt:null)||item.updatedAt;else delete item.deletedAt;await localWrite('references',id,item);await localEnsureResources();return localJson(item)}
    if(part.startsWith('references/')&&request.method==='DELETE'){const id=part.slice(11);if(!localId.test(id))return localJson({error:'잘못된 자료'},400);const item=await localRead('references',id);if(!item)return localJson({error:'자료 없음'},404);if(!item.deleted)return localJson({error:'휴지통으로 먼저 이동하세요'},409);await localDeleteReferences([id]);return localJson({ok:true})}
    if(part.startsWith('ref-files/'))return localFile(request,part.slice(10),url);
    if(part.startsWith('database/'))return localDatabase(request,part.slice(9),url);
    if(part.startsWith('auth/'))return localAuth(request,part.slice(5));
    if(part==='storage'||part==='storage/check')return localJson({mode:'browser',configured:false,ok:true});
    if(part==='youtube-meta'){const id=url.searchParams.get('id')||'';if(!/^[\w-]{11}$/.test(id))return localJson({error:'잘못된 영상 ID'},400);try{const response=await fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+id),{signal:AbortSignal.timeout(8000)});const data=await response.json();return localJson({id,title:typeof data.title==='string'?data.title.slice(0,500):'',thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'})}catch{return localJson({id,title:'',thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'})}}
    return localJson({error:'Not found'},404);
  } catch(error) {return localJson({error:error?.name==='QuotaExceededError'?'브라우저 저장 공간이 부족합니다.':'브라우저 저장에 실패했습니다.'},error?.name==='QuotaExceededError'?507:500)}
};
