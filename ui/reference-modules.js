// The reference editor uses the same React module canvas as project tabs.
const referenceWrites=new Map();
function referenceSaveState(id,status,error=''){window.dispatchEvent(new CustomEvent('reference-save-state',{detail:{id,status,error}}))}
function cacheReference(r){const index=refs.findIndex(v=>v.id===r.id);if(index<0)refs.push(r);else refs[index]=r;refLoaded=true;window.dispatchEvent(new Event('references-changed'))}
function saveModuleReference(r){
 const previousItem=refs.find(v=>v.id===r.id);const item={...r,deletedAt:r.deleted?(previousItem?.deletedAt||new Date().toISOString()):undefined,title:r.title,description:(r.modules||[]).filter(m=>m.kind==='text').map(m=>m.text||'').join('\n'),blocks:[],updatedAt:new Date().toISOString()};
 window.appHistory?.record('reference:'+item.id,refs.find(v=>v.id===item.id)||{...item,deleted:true},item,async(patches,direction)=>{const latest=(await refApi('')).find(v=>v.id===item.id)||refs.find(v=>v.id===item.id);if(!latest)throw Error('레퍼런스를 찾을 수 없습니다');await saveModuleReference(window.applyHistoryPatch(latest,patches,direction))},{mergeKey:window.appHistory?.editKey});
 cacheReference(item);referenceSaveState(item.id,'저장 중');
 const previous=referenceWrites.get(item.id)||Promise.resolve();
 const pending=previous.catch(()=>{}).then(async()=>{if(referenceWrites.get(item.id)!==pending)return item;const saved=await refApi('/'+item.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(item)});if(referenceWrites.get(item.id)===pending){cacheReference(saved);referenceSaveState(item.id,'저장됨');if(refPage)drawRefs()}return saved}).catch(e=>{if(referenceWrites.get(item.id)===pending){referenceSaveState(item.id,'저장 실패',e.message);if(typeof toast==='function')toast('레퍼런스 저장 실패 · 다시 시도하세요')}throw e});
 referenceWrites.set(item.id,pending);return pending;
}
window.referenceBridge={
 refresh:async()=>{refs=await refApi('');refLoaded=true;return refs.slice()},tags:r=>allReferenceTags(r,state,refs),cached:()=>refs.slice(),list:async()=>{if(!refLoaded){refs=await refApi('');refLoaded=true}return refs.slice()},get:id=>refs.find(r=>r.id===id),save:saveModuleReference,
 create:async input=>{const r={id:uid(),title:input.title||'새 자료',category:'',tags:[],favorite:false,deleted:false,description:'',blocks:[],createdAt:new Date().toISOString(),recordType:typeof sourceSection!=='undefined'&&sourceSection==='portfolios'?'portfolio':sourceSection==='sources'?'source':'reference',...input};return saveModuleReference(r)},
 updateModule:async(id,moduleId,fn)=>{const r=refs.find(r=>r.id===id);if(!r)throw Error('레퍼런스를 찾을 수 없습니다');return saveModuleReference(window.updateReferenceModule(r,moduleId,fn))},
 openProject:(id,kind,entityId)=>{window.productionSearchTarget={projectId:id,kind,entityId};openProduction(id,kind==='task'?'tasks':kind==='schedule'?'schedule':'overview')}
};
let referenceEditorCleanup=null,referenceOpenRequest=0,archiveCleanup=null;
const archiveHost=document.createElement('div');archiveHost.id='reference-archive-host';archiveHost.hidden=true;$('#refpanel').append(archiveHost);
window.openReferencesArchive=async()=>{try{if(sourceSection==='gallery'){sourceSection='references';localStorage.setItem('pn-source-section',sourceSection)}await openRefs();if(!productionAssets){const response=await fetch('/production-style');productionAssets=await response.text()}if(!window.mountArchiveLibrary)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/production-app';script.onload=resolve;script.onerror=reject;document.head.append(script)});archiveHost.hidden=false;archiveCleanup=window.mountArchiveLibrary(archiveHost,productionAssets,()=>{archiveCleanup?.();archiveCleanup=null;archiveHost.hidden=true})}catch(e){toast(e.message||'아카이브를 열지 못했습니다')}};
const referenceModuleHost=document.createElement('div');referenceModuleHost.id='reference-module-host';referenceModuleHost.hidden=true;$('#refpanel').append(referenceModuleHost);
function closeReferenceModules(){archiveCleanup?.();archiveCleanup=null;archiveHost.hidden=true;window.sourceGalleryVisible=false;referenceOpenRequest++;referenceEditorCleanup?.();referenceEditorCleanup=null;referenceModuleHost.hidden=true;$('#refpanel').classList.remove('reference-open');window.activeReferenceId='';}
// Navigation wrappers keep the content area and editor lifecycle in sync.
const referenceHome=openRefs;openRefs=async function(...args){closeReferenceModules();if(sourceSection==='gallery')return openSourceGallery();if(sourceSection==='documents')return openDocumentLibrary();if(refLoaded){refs=await refApi('')}return referenceHome(...args)};
$('#references').onclick=()=>openRefs();
const referenceProduction=openProduction;openProduction=async function(...args){closeReferenceModules();return referenceProduction(...args)};
const referenceDatabase=openDatabase;openDatabase=async function(...args){closeReferenceModules();return referenceDatabase(...args)};
const referenceSettings=openSettings;openSettings=async function(...args){closeReferenceModules();return referenceSettings(...args)};
async function openReferenceModules(existing){
 const request=++referenceOpenRequest;
 try{
  if(!productionAssets){const res=await fetch('/production-style');if(!res.ok)throw Error('불러오기 실패');productionAssets=await res.text()}
  if(!window.mountReferenceEditor){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/production-app';s.onload=resolve;s.onerror=reject;document.head.append(s)})}
  const r=existing||await window.referenceBridge.create({title:sourceSection==='portfolios'?'새 포트폴리오':sourceSection==='sources'?'새 소스':'새 레퍼런스',recordType:sourceSection==='portfolios'?'portfolio':sourceSection==='sources'?'source':'reference',modules:[]});
  if(request!==referenceOpenRequest)return;
  referenceEditorCleanup?.();referenceEditorCleanup=null;
  leaveProduction();if(typeof closeSettings==='function')closeSettings();refPage=true;$('#paper').hidden=true;$('#refpanel').hidden=false;$('#refpanel').classList.add('reference-open');referenceModuleHost.hidden=false;window.sourceGalleryVisible=false;window.activeReferenceId=r.id;setTopTitle(r.title);syncSidebar();
  const close=()=>{closeReferenceModules();if(refPage){setTopTitle(sourceSection==='portfolios'?'포트폴리오':sourceSection==='sources'?'소스':'레퍼런스');drawRefs()}};
  referenceEditorCleanup=window.mountReferenceEditor(referenceModuleHost,productionAssets,r,close);
 }catch(e){toast(e.message||'레퍼런스 불러오기 실패')}
}
refForm=existing=>openReferenceModules(existing);
refDetail=id=>{const r=refs.find(r=>r.id===id);if(r)openReferenceModules(r)};
