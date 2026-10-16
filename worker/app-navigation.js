// Word-based hash routes keep the pathname available for the NAS connection address or browser-local alias.
export const appNavigationScript=String.raw`
(()=>{
 const keys=['view','section','project','group','record','tab','landing'];
 let ready=false,replaying=false,pending=0,timer,last='',databaseRecord='';
 const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 function recordTabs(record){return Array.isArray(record.tabs)?record.tabs:[{id:record.id+'-main',name:'자료'}]}
 function slug(name){return String(name||'item').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-+|-+$/g,'').slice(0,64)||'item'}
 function token(item,items=[]){const id=String(item.id),short=id.slice(0,8);return slug(item.name||item.title)+'~'+(items.filter(other=>String(other.id).startsWith(short)).length>1?id:short)}
 function find(items,value){const id=String(value||'').split('~').at(-1);const exact=items.find(item=>item.id===value);if(exact)return exact;const matches=items.filter(item=>String(item.id).startsWith(id)&&!item.deleted);return id&&matches.length===1?matches[0]:undefined}
 function sectionPath(owner,section){if(!section?.startsWith('tab:'))return [section==='projects'?'overview':section||'overview'];const tabs=owner?.customTabs||[],tab=tabs.find(tab=>tab.id===section.slice(4));return tab?['tabs',token(tab,tabs)]:['overview']}
 function read(){
  if(location.hash.startsWith('#/')){
   let parts;try{parts=location.hash.slice(2).split('/').map(decodeURIComponent)}catch{return null}
   const [view,scope,record,tabType,tab]=parts;
   if(view==='home')return {view:'home',section:['tasks','schedule','projects'].includes(scope)?'home-'+scope:'dashboard'};
   if(view==='projects'||view==='work-groups'){
    const items=view==='projects'?state.productions||[]:state.projects||[],owner=find(items,scope),selectedTab=record==='tabs'?find(owner?.customTabs||[],tabType):null;
    return {view:'home',...(view==='projects'?{group:owner?.id}:{project:owner?.id}),section:selectedTab?'tab:'+selectedTab.id:record==='tabs'?'overview':record||'overview'};
   }
   if(view==='materials'&&['members','equipment','rental-shops','locations'].includes(scope))return {view:'database',section:scope,recordToken:record};
   if(view==='materials')return {view:'references',section:scope||'references',recordToken:record,tabToken:tabType==='tabs'?tab:'',landing:scope?'':'1'};
   if(view==='database')return {view,section:scope||'members',recordToken:record,landing:scope?'':'1'};
   if(view==='settings')return {view,section:scope||'general',landing:scope?'':'1'};
   return null;
  }
  const params=new URLSearchParams(location.search);if(!['home','references','database','settings'].includes(params.get('view')))return null;return Object.fromEntries(keys.map(key=>[key,params.get(key)||'']))
 }

 function route(){
  if(mobileLandingSpace)return {view:mobileLandingSpace,landing:'1'};
  if(!settingsPanel.hidden)return {view:'settings',section:settingsCategory};
  if(!databasePanel.hidden)return {view:'database',section:databaseCollection,record:databasePanel.classList.contains('owner-editor')?databasePanel.dataset.searchOwnerId:databaseRecord};
  if(refPage)return {view:'references',section:sourceSection,record:window.activeReferenceId||'',tab:window.activeReferenceId?window.activeReferenceTabId||'':'',...(window.sourceGalleryVisible?{section:'gallery'}:{})};
  const context=window.productionSearchContext||{};
  return {view:'home',project:context.projectId||'',group:context.productionId||'',section:context.projectId||context.productionId?context.section:productionSection==='dashboard'||productionSection.startsWith('home-')?productionSection:'overview'};
 }
 function url(value){
  const result=new URL(location.href);keys.forEach(key=>result.searchParams.delete(key));let parts;
  if(value.view==='home'){
   const owner=value.project?(state.projects||[]).find(item=>item.id===value.project):(state.productions||[]).find(item=>item.id===value.group);
   parts=owner?[value.project?'work-groups':'projects',token(owner,value.project?state.projects:state.productions),...sectionPath(owner,value.section)]:value.section?.startsWith('home-')?['home',value.section.slice(5)]:['home'];
  }else if(value.view==='references'){
   parts=['materials'];if(!value.landing){parts.push(value.section||'references');const record=refs.find(item=>item.id===value.record);if(record){parts.push(token(record,refs));const tabs=recordTabs(record),tab=tabs.find(item=>item.id===value.tab);if(tab)parts.push('tabs',token(tab,tabs))}}
  }else{
   parts=[value.view==='database'?'materials':value.view];if(!value.landing){parts.push(value.section);if(value.view==='database'){const record=databaseRows.find(item=>item.id===value.record);if(record)parts.push(token(record,databaseRows))}}
  }
  result.hash='/'+parts.map(encodeURIComponent).join('/');return result.pathname+result.search+result.hash
 }

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
   await openDatabase(['members','equipment','rental-shops','locations'].includes(value.section)?value.section:'members');
   const record=value.recordToken?find(databaseRows,value.recordToken):databaseRows.find(r=>r.id===value.record&&!r.deleted);if(record)await databaseForm(record);
  }else{
   sourceSection=['references','sources','portfolios','gallery','documents','resources','archive','trash'].includes(value.section)?value.section:'references';localStorage.setItem('pn-source-section',sourceSection);
   await openRefs();const record=value.recordToken?find(refs,value.recordToken):refs.find(r=>r.id===value.record&&!r.deleted);
   if(record){window.productionSearchTarget={referenceId:record.id,tabId:value.tabToken?find(recordTabs(record),value.tabToken)?.id:value.tab};await openReferenceModules(record)}
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
