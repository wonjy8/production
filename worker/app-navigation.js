// Screen routes use query parameters so the pathname remains the NAS connection address.
export const appNavigationScript=String.raw`
(()=>{
 const keys=['view','section','project','group','record','tab','landing'];
 let ready=false,replaying=false,pending=0,timer,last='',databaseRecord='';
 const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 function read(){const params=new URLSearchParams(location.search);if(!['home','references','database','settings'].includes(params.get('view')))return null;return Object.fromEntries(keys.map(key=>[key,params.get(key)||'']))}
 function route(){
  if(mobileLandingSpace)return {view:mobileLandingSpace,landing:'1'};
  if(!settingsPanel.hidden)return {view:'settings',section:settingsCategory};
  if(!databasePanel.hidden)return {view:'database',section:databaseCollection,record:databasePanel.classList.contains('owner-editor')?databasePanel.dataset.searchOwnerId:databaseRecord};
  if(refPage)return {view:'references',section:sourceSection,record:window.activeReferenceId||'',tab:window.activeReferenceId?window.activeReferenceTabId||'':'',...(window.sourceGalleryVisible?{section:'gallery'}:{})};
  const context=window.productionSearchContext||{};
  return {view:'home',project:context.projectId||'',group:context.productionId||'',section:context.projectId||context.productionId?context.section:productionSection==='dashboard'?'dashboard':'overview'};
 }
 function url(value){const result=new URL(location.href);keys.forEach(key=>{result.searchParams.delete(key);if(value[key])result.searchParams.set(key,value[key])});return result.pathname+result.search+result.hash}
 function commit(replace=false){if(!ready||replaying||pending||document.body.classList.contains('document-mode'))return;const next=url(route());if(next===last&&!replace)return;history[replace?'replaceState':'pushState']({...history.state,productionNavigation:true},'',next);last=next}
 function changed(){clearTimeout(timer);timer=setTimeout(()=>commit(),60)}
 async function restore(value){
  window.productionSearchTarget=undefined;
  window.closeAppPanels?.();if($('#dialog').open)$('#dialog').close();
  if(value.landing==='1'&&isMobileViewport()){await openMobileWorkspaceHome(value.view);return}
  if(value.view==='home'){
   const project=(state.projects||[]).find(p=>p.id===value.project&&!p.deleted),group=(state.productions||[]).find(p=>p.id===value.group&&!p.deleted);
   await openProduction(project?.id,value.section||'overview',false,project?undefined:group?.id);
  }else if(value.view==='settings')await openSettings(value.section||'general');
  else if(value.view==='database'){
   await openDatabase(['members','rental-shops','locations'].includes(value.section)?value.section:'members');
   const record=databaseRows.find(r=>r.id===value.record&&!r.deleted);if(record)await databaseForm(record);
  }else{
   sourceSection=['references','sources','portfolios','gallery'].includes(value.section)?value.section:'references';localStorage.setItem('pn-source-section',sourceSection);
   await openRefs();const record=refs.find(r=>r.id===value.record&&!r.deleted);
   if(record){window.productionSearchTarget={referenceId:record.id,tabId:value.tab};await openReferenceModules(record)}
  }
  await frames();
 }
 function wrap(get,set){const original=get();set(async function(...args){pending++;try{return await original.apply(this,args)}finally{pending--;changed()}})}
 wrap(()=>openProduction,value=>openProduction=value);
 wrap(()=>openRefs,value=>openRefs=value);
 wrap(()=>openReferenceModules,value=>openReferenceModules=value);
 wrap(()=>openSettings,value=>openSettings=value);
 const databaseOpen=openDatabase;openDatabase=async function(...args){databaseRecord='';pending++;try{return await databaseOpen(...args)}finally{pending--;changed()}};
 const form=databaseForm;databaseForm=async function(existing){pending++;try{const result=await form(existing);databaseRecord=existing?.id||'';return result}finally{pending--;changed()}};
 const closeReferences=closeReferenceModules;closeReferenceModules=function(...args){window.activeReferenceTabId='';const result=closeReferences(...args);changed();return result};
 const mobileHome=openMobileWorkspaceHome;openMobileWorkspaceHome=async function(...args){pending++;try{return await mobileHome(...args)}finally{pending--;changed()}};
 $('#dialog').addEventListener('close',()=>{if(databaseRecord){databaseRecord='';changed()}});
 let restoreQueue=Promise.resolve(),queued=0;
 window.addEventListener('popstate',()=>{
  if(!ready||document.body.classList.contains('document-mode'))return;
  const target=read(),targetURL=location.pathname+location.search+location.hash;
  queued++;replaying=true;clearTimeout(timer);
  restoreQueue=restoreQueue.then(async()=>{try{await prepareWorkspaceNavigation();if(target)await restore(target);last=targetURL}catch(error){toast(error.message||'화면 이동 실패')}finally{queued--;if(!queued){replaying=false;commit(true)}}});
 });
 window.appNavigation={changed,start:async fallback=>{replaying=true;try{const initial=read();if(initial)await restore(initial);else{await fallback();await frames()}}finally{ready=true;replaying=false;commit(true)}}};
})();
`;
