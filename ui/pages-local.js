async function localCatalogScan(workspace,references,includeHidden=false){
 const rows=new Map();
 async function walk(value,origin,tags=[]){
  if(Array.isArray(value)){for(const node of value)await walk(node,origin,tags);return}
  if(!value||typeof value!=='object'||value.deleted||(!includeHidden&&value.hidden))return;
  tags=[...new Set([...tags,...(Array.isArray(value.tags)?value.tags:[])].filter(t=>typeof t==='string'))];
  let fileId=value.fileId||((['image','video','audio','pdf','file','document'].includes(value.kind)||value.mime)?value.id:null),url=['link','youtube','embed'].includes(value.kind)&&/^https?:\/\//.test(value.url||'')?value.url:'';
  const textOnly=value.kind==='text'&&typeof value.text==='string'&&value.id;
  if(fileId||url||textOnly){let id=fileId;if(!id){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(textOnly?'text:'+origin.ownerId+':'+value.id:url))),hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,32);id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20)}id=value.resourceId||id;const row=rows.get(id)||{id,fileId:fileId||null,url:fileId?'':url,...(textOnly?{content:value.text,sourceTextKey:origin.ownerId+':'+value.id}:{}),title:value.name||value.originalName||value.title||(textOnly?'텍스트':url?'링크':'파일'),filename:value.name||value.originalName||'',mime:value.mime||'',size:value.size||0,kind:value.kind||'file',tags:[],properties:value.resourceProperties||{},propertyLabels:value.resourcePropertyLabels||{},origins:[]};row.tags=[...new Set([...row.tags,...tags])].slice(0,30);if(!row.origins.some(o=>JSON.stringify(o)===JSON.stringify(origin)))row.origins.push(origin);rows.set(id,row)}
  for(const [field,node] of Object.entries(value)){if(['source','photoEdit','archives','resourceProperties','resourcePropertyLabels'].includes(field))continue;if(['tabs','customTabs'].includes(field)&&Array.isArray(node)){for(const tab of node)await walk(tab,{...origin,tabId:tab.id,tabName:tab.name},tags)}else if(['modules','blocks'].includes(field)&&Array.isArray(node)){for(const module of node)await walk(module,{...origin,moduleId:module.id,moduleName:module.title},tags)}else await walk(node,origin,tags)}
 }
 for(const [key,kind] of [['projects','project'],['productions','production']])for(const owner of workspace[key]||[])await walk(owner,{ownerKind:kind,ownerId:owner.id,ownerName:owner.name||owner.title||''});
 for(const owner of references)await walk(owner,{ownerKind:'reference',ownerId:owner.id,ownerName:owner.title||''});return rows;
}
function localOriginalInUse(row,workspace,references){
 const walk=(value,ownerId)=>{
  if(typeof value==='string')return !!row.fileId&&value.startsWith('/api/ref-files/')&&value.split('/api/ref-files/')[1].split('?')[0]===row.fileId;
  if(!value||typeof value!=='object'||value.deleted)return false;
  if(Array.isArray(value))return value.some(v=>walk(v,ownerId));
  const fileId=value.fileId||((['image','video','audio','pdf','file','document'].includes(value.kind)||value.mime)?value.id:null);
  if(row.fileId&&fileId===row.fileId)return true;
  if(row.url&&(!value.resourceId||value.resourceId===row.id)&&['link','youtube','embed'].includes(value.kind)&&value.url===row.url)return true;
  if(row.kind==='text'&&(!value.resourceId||value.resourceId===row.id)&&value.kind==='text'&&row.sourceTextKey===ownerId+':'+value.id)return true;
  return Object.entries(value).some(([key,v])=>!['source','photoEdit','resourceProperties','resourcePropertyLabels'].includes(key)&&walk(v,ownerId));
 };
 return [...(workspace?.projects||[]),...(workspace?.productions||[]),...(references||[])].some(owner=>walk(owner,owner.id));
}
function localResourceOrigins(row,discovered,workspace,references){
 const origins=[...(discovered.get(row.id)?.origins||[])];
 for(const [kind,owners] of [['project',workspace.projects||[]],['production',workspace.productions||[]],['reference',references]])for(const owner of owners){
  if(origins.some(o=>o.ownerKind===kind&&o.ownerId===owner.id))continue;
  if(localOriginalInUse(row,kind==='reference'?{}:{projects:[owner]},kind==='reference'?[owner]:[]))origins.push({ownerKind:kind,ownerId:owner.id,ownerName:owner.name||owner.title||''});
 }
 return origins;
}
async function localResourceTransaction(fn){const db=await localOpen();return new Promise((resolve,reject)=>{
 const tx=db.transaction(['resources','workspace','references'],'readwrite'),store=tx.objectStore('resources'),read=store.getAll(),workspaceRead=tx.objectStore('workspace').get('current'),refsRead=tx.objectStore('references').getAll();
 let result,rows,workspace,references,ready=0;
 const run=()=>{if(++ready!==3)return;try{result=fn(store,rows,workspace?.data||localEmptyWorkspace(),references)}catch(error){reject(error);tx.abort()}};
 read.onsuccess=()=>{rows=read.result;run()};workspaceRead.onsuccess=()=>{workspace=workspaceRead.result;run()};refsRead.onsuccess=()=>{references=refsRead.result;run()};
 tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('자료 저장 실패'))};
})}
let localOriginalsReady=false;
async function localRegisterOriginals(){
 if(localOriginalsReady)return;
 const db=await localOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(['files','resources'],'readwrite'),files=tx.objectStore('files').openCursor(),catalog=tx.objectStore('resources');files.onsuccess=()=>{const cursor=files.result;if(!cursor)return;const id=cursor.key,file=cursor.value,read=catalog.get(id);read.onsuccess=()=>{if(!read.result){const mime=file.mime||'application/octet-stream';catalog.put({id,fileId:id,title:file.filename||id,filename:file.filename||'',mime,kind:mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'file',tags:[],properties:{},propertyLabels:{},catalogSeed:true,libraryPinned:true,version:0,updatedAt:new Date().toISOString()},id)}cursor.continue()}};tx.oncomplete=()=>{localOriginalsReady=true;db.close();resolve()};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}})
}
async function localEnsureResources(){
 await localRegisterOriginals();
 const workspace=(await localRead('workspace','current'))?.data||localEmptyWorkspace(),references=await localRead('references'),discovered=await localCatalogScan(workspace,references,true);
 let rows=await localResourceTransaction((store,existing)=>{for(const row of discovered.values()){const old=existing.find(r=>r.id===row.id);if(old){if(old.completionOwner)continue;if(old.catalogSeed){const {origins,...data}=row;Object.assign(old,data,{catalogSeed:false,version:old.version+1,updatedAt:new Date().toISOString()});store.put(old,old.id)}else if(row.kind==='text'&&!old.sourceTextKey){old.sourceTextKey=row.sourceTextKey;old.version++;old.updatedAt=new Date().toISOString();store.put(old,old.id)}else if(old.deleted&&!old.purged){old.deleted=false;delete old.deletedAt;old.version++;old.updatedAt=new Date().toISOString();store.put(old,old.id)}else if(row.kind==='text'&&old.content!==row.content){old.content=row.content;old.version++;old.updatedAt=new Date().toISOString();store.put(old,old.id)}continue}const {origins,...data}=row,item={...data,version:1,updatedAt:new Date().toISOString()};store.put(item,item.id);existing.push(item)}return existing});
 return {rows,discovered,workspace,references};
}
async function localPurgeResource(request,id){
 const db=await localOpen();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['resources','files','workspace','references'],'readwrite'),store=tx.objectStore('resources'),read=store.get(id),wr=tx.objectStore('workspace').get('current'),rr=tx.objectStore('references').getAll();let result,row,workspace,references,ready=0;
  const finish=()=>{if(++ready!==3)return;if(row?.completionOwner){result=localJson({error:'완료 보존본은 수정하거나 삭제할 수 없습니다.'},409);return}if(!row||row.purged){result=localJson({error:'Not found'},404);return}if(localOriginalInUse(row,workspace?.data,references)){result=localJson({error:'사용 중인 원본은 영구 삭제할 수 없습니다.'},409);return}if(!row.deleted||request.headers.get('If-Match')!=='"'+row.version+'"'){result=localJson({error:'자료가 변경되었거나 휴지통에 없습니다.'},409);return}
   store.put({id:row.id,fileId:row.fileId,title:'',tags:[],properties:{},deleted:true,purged:true,version:row.version+1,updatedAt:new Date().toISOString()},id);
   if(row.fileId&&!JSON.stringify([workspace,references]).includes(row.fileId))tx.objectStore('files').delete(row.fileId);result=localJson({ok:true});};
  read.onsuccess=()=>{row=read.result;finish()};wr.onsuccess=()=>{workspace=wr.result;finish()};rr.onsuccess=()=>{references=rr.result;finish()};tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)};
 })
}
async function localResources(request,id){
 const {rows,discovered,workspace,references}=await localEnsureResources();for(const row of rows)if(row.deleted&&!row.purged&&Date.parse(row.deletedAt||row.updatedAt)<=Date.now()-30*86400000){const response=await localPurgeResource(new Request(request.url,{method:'DELETE',headers:{'If-Match':'"'+row.version+'"'}}),row.id);if(response.ok)row.purged=true;}
 if(request.method==='GET'&&!id){const result=[];for(const row of rows){if(row.purged&&!new URL(request.url).searchParams.has('includePurged'))continue;const f=row.fileId?await localRead('files',row.fileId):null;if(row.fileId&&!f)continue;result.push({...row,...(f?{size:f.blob.size,mime:f.mime,sha256:f.sha256}:{}),origins:localResourceOrigins(row,discovered,workspace,references),canEdit:!row.completionOwner,canTrash:!row.completionOwner&&!localOriginalInUse(row,workspace,references)})}return localJson(result)}
 if(request.method==='DELETE'&&id)return localPurgeResource(request,id);
 if(request.method==='PUT'&&localId.test(id||'')){
  const data=await request.json(),fileId=rows.find(r=>r.id===id)?.fileId||data.fileId,url=data.url||'';
  if(fileId&&(id!==fileId||!await localRead('files',fileId)))return localJson({error:'파일을 먼저 업로드하세요'},400);
  if(!fileId&&!rows.some(r=>r.id===id)&&!/^https?:\/\//.test(url))return localJson({error:'올바른 자료 주소가 필요합니다'},400);
  if(typeof data.title!=='string'||!data.title.trim()||data.title.length>200||!Array.isArray(data.tags)||data.tags.length>30||data.tags.some(t=>typeof t!=='string'||t.length>100)||!data.properties||typeof data.properties!=='object'||Array.isArray(data.properties)||Object.keys(data.properties).length>50||Object.entries(data.properties).some(([k,v])=>k.length>80||typeof v!=='string'||v.length>2000))return localJson({error:'자료 속성을 확인하세요'},400);
  return localResourceTransaction((store,existing,workspace,references)=>{const old=existing.find(r=>r.id===id),version=old?.version||0;if(old?.completionOwner)return localJson({error:'완료 보존본은 수정할 수 없습니다. 사본을 만들어 편집하세요.'},409);if(data.deleted&&localOriginalInUse(old||{fileId,url},workspace,references))return localJson({error:'사용 중인 원본입니다. 프로젝트·보관함의 연결을 먼저 해제하세요.'},409);if(old?.purged)return localJson({error:'영구 삭제된 자료입니다.'},409);if(request.headers.get('If-Match')!==localRevision(version))return localJson({error:'자료가 다른 곳에서 변경되었습니다. 새로고침 후 다시 시도하세요.'},409);const item={...(old||{id,fileId:fileId||null,url,kind:data.kind||'file',mime:data.mime||'',filename:String(data.filename||'').slice(0,250)}),title:data.title.trim(),tags:data.tags,properties:data.properties,propertyLabels:data.propertyLabels||old?.propertyLabels||{},catalogSeed:false,deleted:!!data.deleted,version:version+1,updatedAt:new Date().toISOString()};if(item.deleted)item.deletedAt=old?.deletedAt||item.updatedAt;else delete item.deletedAt;store.put(item,id);return localJson({...item,canEdit:true,canTrash:!localOriginalInUse(item,workspace,references),origins:discovered.get(id)?.origins||[]})})
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
function localReferenceFileIds(item){const ids=new Set();const walk=v=>{if(typeof v==='string'&&v.startsWith('/api/ref-files/')){ids.add(v.split('/api/ref-files/')[1].split('?')[0]);return}if(!v||typeof v!=='object')return;if(v.fileId)ids.add(v.fileId);if(['image','video','audio','pdf','file','document'].includes(v.kind)&&v.id)ids.add(v.id);if(Array.isArray(v))v.forEach(walk);else Object.values(v).forEach(walk)};walk(item);return ids}
async function localDeleteReferences(ids){
 const db=await localOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(['references','workspace','files','resources'],'readwrite'),records=tx.objectStore('references'),refsRequest=records.getAll(),workspaceRequest=tx.objectStore('workspace').get('current'),catalogRequest=tx.objectStore('resources').getAll();let refs,workspace,catalog;const finish=()=>{if(!refs||workspace===undefined||!catalog)return;const removed=refs.filter(r=>ids.includes(r.id)),remaining=refs.filter(r=>!ids.includes(r.id)),used=JSON.stringify([workspace,remaining,catalog.filter(r=>!r.deleted)]),files=tx.objectStore('files');removed.forEach(r=>{records.delete(r.id);localReferenceFileIds(r).forEach(id=>{if(localId.test(id)&&!used.includes(id))files.delete(id)})})};catalogRequest.onsuccess=()=>{catalog=catalogRequest.result;finish()};refsRequest.onsuccess=()=>{refs=refsRequest.result;finish()};workspaceRequest.onsuccess=()=>{workspace=workspaceRequest.result||null;finish()};tx.oncomplete=()=>{db.close();resolve()};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}})
}
async function localPurgeReferenceTrash(){const rows=await localRead('references'),cutoff=Date.now()-30*86400000,expired=rows.filter(r=>r.deleted&&Date.parse(r.deletedAt||r.updatedAt||r.createdAt)<=cutoff);if(expired.length)await localDeleteReferences(expired.map(r=>r.id));return rows.filter(r=>!expired.some(v=>v.id===r.id))}
function localJson(value,status=200,headers={}) {return Response.json(value,{status,headers:{'Cache-Control':'no-store',...headers}})}
function localRevision(value) {return '"'+value+'"'}
async function localCompletionPlan(before,next,resources,references){
 const policy=globalThis.productionCompletionPolicy;policy.validate(before,next);
 const staged=[],updates=new Map(),expected=new Map();
 for(const owner of policy.owners(next)){
  const old=policy.owners(before).find(p=>p.id===owner.id);
  if(old?.completion&&old.status==='완료'&&owner.status!=='완료'){
   for(const row of resources)if(row.completionOwner?.id===owner.id){const copy={...row,version:row.version+1};delete copy.completionOwner;delete copy.completedAt;updates.set(copy.id,copy);expected.set(row.id,row.version)}
   owner.archives=(owner.archives||[]).filter(a=>!(old.completion.archiveIds||[]).includes(a.id));delete owner.completion;
  }
 }
 for(const key of ['productions','projects'])for(const owner of next[key]||[]){
  const old=policy.owners(before).find(p=>p.id===owner.id),requested=owner.completionRequested;delete owner.completionRequested;
  if(owner.status!=='완료'||old?.status==='완료'&&!(requested&&!old.completion))continue;
  if(key==='projects'&&(next.productions||[]).some(p=>p.id===owner.productionId&&p.status==='완료'))continue;
  const scoped=[owner,...(key==='productions'?(next.projects||[]).filter(p=>p.productionId===owner.id&&!p.deleted&&p.status!=='완료'):[])],scope={productions:key==='productions'?[owner]:[],projects:key==='productions'?scoped.slice(1):scoped};
  if(scoped.some(p=>(p.customTabs||[]).some(t=>(t.modules||[]).some(m=>m.source&&!m.sourceCopy||m.dataModuleId))))throw Error('연결된 모듈의 사본 준비가 필요합니다. 앱의 완료 점검을 통해 다시 완료하세요.');
  const catalog=await localCatalogScan(scope,[],true);
  const fileIds=policy.fileIds(scoped,new Set(resources.filter(r=>r.fileId).map(r=>r.fileId)));for(const [id,entry] of catalog)if(entry.fileId&&!fileIds.has(entry.fileId))catalog.delete(id);for(const id of fileIds)if(!catalog.has(id))catalog.set(id,{id,fileId:id,origins:[]});
  const mapping=new Map(),urls=new Map(),texts=new Map(),folder={id:owner.id,kind:key==='productions'?'production':'project',name:owner.name||owner.title||'프로젝트'};
  for(const [id,entry] of catalog){
   const row=resources.find(r=>r.id===id)||entry,copy=structuredClone(row),newId=crypto.randomUUID();mapping.set(id,newId);if(row.version!==undefined)expected.set(id,row.version);
   if(row.fileId){const file=await localRead('files',row.fileId);if(!file)throw Error('보존할 원본 파일을 찾을 수 없습니다.');staged.push({id:newId,file,sourceId:row.fileId,sha256:file.sha256});copy.fileId=newId;mapping.set(row.fileId,newId)}
   else if(row.url)urls.set(row.url,newId);
   if(entry.sourceTextKey)texts.set(entry.sourceTextKey,newId);
   Object.assign(copy,{id:newId,completionOwner:folder,completionOf:id,completedAt:new Date().toISOString(),libraryPinned:false,version:1});for(const field of ['deleted','deletedAt','purged','catalogSeed','origins','canEdit','canTrash'])delete copy[field];updates.set(newId,copy);
  }
  const rewrite=(value,ownerId)=>{
   if(Array.isArray(value))return value.map(v=>rewrite(v,ownerId));
   if(value&&typeof value==='object'){const result=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,ownerId)]));if(['link','youtube','embed'].includes(value.kind)&&urls.has(value.url))result.resourceId=urls.get(value.url);if(value.kind==='text'&&texts.has(ownerId+':'+value.id))result.resourceId=texts.get(ownerId+':'+value.id);return result}
   if(typeof value==='string'){if(mapping.has(value))return mapping.get(value);for(const [id,newId] of mapping)value=value.replaceAll('/ref-files/'+id,'/ref-files/'+newId)}return value;
  };
  for(const p of scoped){const updated=rewrite(p,p.id);for(const key of Object.keys(p))delete p[key];Object.assign(p,updated)}
  owner.completion={completedAt:new Date().toISOString(),resourceIds:[...mapping.values()],archiveIds:(owner.archives||[]).filter(a=>!(old?.archives||[]).some(b=>b.id===a.id)).map(a=>a.id)};
  for(const id of mapping.keys()){const row=resources.find(r=>r.id===id);if(row&&row.libraryPinned===false&&!row.properties?.category&&!localOriginalInUse(row,next,references)){expected.set(id,row.version);updates.set(id,{...row,deleted:true,deletedAt:new Date().toISOString(),version:row.version+1})}}
 }
 return {next,staged,updates,expected};
}
async function localWorkspace(request){
 if(request.method==='GET'){await localEnsureResources();const saved=await localRead('workspace','current');return localJson(saved?.data||localEmptyWorkspace(),200,{'ETag':localRevision(saved?.revision||'0')})}
 if(request.method!=='PUT')return localJson({error:'Method not allowed'},405);
 const next=await request.json();if(!next||typeof next!=='object'||Array.isArray(next))return localJson({error:'잘못된 데이터'},400);
 const saved=await localRead('workspace','current'),baseRevision=saved?.revision||'0',expected=request.headers.get('If-Match');if(expected&&expected!==localRevision(baseRevision))return localJson({error:'다른 탭에서 데이터가 변경되었습니다.'},409);
 const {rows,references}=await localEnsureResources();const submitted=JSON.stringify(next);let plan;
 try{plan=await localCompletionPlan(saved?.data||localEmptyWorkspace(),next,rows,references)}catch(e){return localJson({error:e.message},409)}
 const db=await localOpen();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['workspace','files','resources','references'],'readwrite'),store=tx.objectStore('workspace'),read=store.get('current'),rr=tx.objectStore('resources').getAll(),refs=tx.objectStore('references').getAll();let current,resources,currentRefs,ready=0,result,fileRows=new Map();
  const done=()=>{if(++ready!==3+plan.staged.length)return;
   if((current?.revision||'0')!==baseRevision||JSON.stringify(currentRefs)!==JSON.stringify(references)||[...plan.expected].some(([id,version])=>resources.find(r=>r.id===id)?.version!==version)||plan.staged.some(p=>fileRows.get(p.sourceId)?.sha256!==p.sha256)){result=localJson({error:'보존 중 자료가 변경되었습니다. 새로고침 후 다시 시도하세요.'},409);return}
   const revision=crypto.randomUUID();for(const p of plan.staged)tx.objectStore('files').put(p.file,p.id);for(const row of plan.updates.values())tx.objectStore('resources').put(row,row.id);store.put({data:next,revision},'current');result=localJson({ok:true,...(JSON.stringify(next)!==submitted?{workspace:next}:{})},200,{'ETag':localRevision(revision)});
  };
  read.onsuccess=()=>{current=read.result;done()};rr.onsuccess=()=>{resources=rr.result;done()};refs.onsuccess=()=>{currentRefs=refs.result;done()};for(const p of plan.staged){const fr=tx.objectStore('files').get(p.sourceId);fr.onsuccess=()=>{fileRows.set(p.sourceId,fr.result);done()}}
  tx.oncomplete=async()=>{db.close();if(result?.ok)await localEnsureResources().catch(()=>{});resolve(result)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)};
 });
}
async function localFile(request,id,url) {
  if(!localId.test(id))return localJson({error:'잘못된 파일 ID'},400);
  if(request.method==='PUT') {
    const blob=await request.blob();if(blob.size>25*1024*1024)return localJson({error:'파일당 25MB 이하여야 합니다'},413);
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');
    const before=await localRead('files',id),expected=request.headers.get('If-Match');
    const previousHash=before&&!before.sha256?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await before.blob.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join(''):before?.sha256;
    const db=await localOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(['files','resources'],'readwrite'),store=tx.objectStore('files'),read=store.get(id);let conflict=false;const catalogRead=tx.objectStore('resources').get(id);let fileRow,resourceRow,ready=0,lockedFile=false;const finish=()=>{if(++ready!==2)return;const row=fileRow;if(resourceRow?.completionOwner){lockedFile=true;return}if(expected&&(!row||expected!==localRevision(row.sha256||previousHash))){conflict=true;return}if(row&&!expected){conflict=true;return}const mime=request.headers.get('Content-Type')||blob.type||'application/octet-stream';let filename='';try{filename=(url.searchParams.get('name')||'').slice(0,250)}catch{}store.put({blob,sha256,mime,filename:filename||row?.filename||''},id);if(!row)tx.objectStore('resources').put({id,fileId:id,title:filename.slice(0,200)||id,filename,mime,kind:mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'file',tags:[],properties:{},propertyLabels:{},catalogSeed:true,libraryPinned:!request.headers.get('X-Scope-Owner'),version:0,updatedAt:new Date().toISOString()},id)};read.onsuccess=()=>{fileRow=read.result;finish()};catalogRead.onsuccess=()=>{resourceRow=catalogRead.result;finish()};tx.oncomplete=()=>{db.close();resolve(lockedFile?localJson({error:'완료 보존본은 수정할 수 없습니다. 사본을 만들어 편집하세요.'},409):conflict?localJson({error:'원본 파일이 변경되었습니다.'},409):localJson({id,sha256},200,{'ETag':localRevision(sha256)}))};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error)}});
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
