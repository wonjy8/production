const materialDatabaseSections=[['members','멤버','users'],['equipment','장비','camera'],['rental-shops','대여처','folder'],['locations','장소','projects']];
const workspaceDefinitions=[
 {id:'home',label:'홈',icon:'home',sections:[['projects','프로젝트','projects']]},
 {id:'references',label:'자료',icon:'materials',sections:[['references','레퍼런스','reference'],['sources','소스','file'],['portfolios','포트폴리오','star'],['resources','모든 자료','table'],['archive','아카이브','folder'],...materialDatabaseSections,['trash','휴지통','trash']]},
 {id:'settings',label:'설정',icon:'settings',sections:[]},
];
window.appWorkspaces=workspaceDefinitions;
let mobileLandingSpace='';
let refTagFilter='';
let activeSpace='production';
let sourceSection=localStorage.getItem('pn-source-section')||'references';if(sourceSection==='documents')sourceSection='resources';if(!workspaceDefinitions[1].sections.some(([id])=>id===sourceSection)||materialDatabaseSections.some(([id])=>id===sourceSection))sourceSection='references';
const spacePicker=document.createElement('div');spacePicker.className='space-picker';spacePicker.innerHTML='<button class="space-switch" id="space-switch" aria-label="워크스페이스 전환" aria-haspopup="menu" aria-expanded="false"><span id="space-mark"></span><span id="space-name">홈</span><span id="space-chevron"></span></button><div class="space-menu" id="space-menu" role="menu" hidden><button class="space-option" role="menuitem" data-space="production">홈</button><button class="space-option" role="menuitem" data-space="references">자료</button></div>';
document.querySelector('.workspace-tabs').before(spacePicker);
const adminHomeButton=document.createElement('button');adminHomeButton.className='sidebar-ref-link admin-home-nav';adminHomeButton.setAttribute('aria-label','관리자 홈');adminHomeButton.hidden=true;spacePicker.after(adminHomeButton);adminHomeButton.onclick=()=>{localStorage.setItem('pn-production-view','dashboard');openProduction(undefined,'dashboard')};
const referenceScope=document.createElement('div');referenceScope.className='sidebar-reference-area';referenceScope.setAttribute('aria-label','자료 분류');referenceScope.hidden=true;sidebarProjects.after(referenceScope);
function closeSpaceMenu(){const menu=$('#space-menu');menu.hidden=true;$('#space-switch').setAttribute('aria-expanded','false');}
$('#space-switch').onclick=()=>{const menu=$('#space-menu');menu.hidden=!menu.hidden;$('#space-switch').setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('[data-space]')?.focus();};
$('#space-menu').onclick=e=>{const b=e.target.closest('[data-space]');if(!b)return;closeSpaceMenu();if(b.dataset.space==='settings')openSettings();else if(b.dataset.space==='database')openDatabase();else if(b.dataset.space==='references')openRefs();else switchProductionSpace();};
document.addEventListener('pointerdown',e=>{if(!spacePicker.contains(e.target))closeSpaceMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#space-menu').hidden){closeSpaceMenu();$('#space-switch').focus()}if(!$('#space-menu').hidden&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const options=[...$('#space-menu').querySelectorAll('[data-space]')],index=options.indexOf(document.activeElement);options[(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus()}});
function switchProductionSpace(){if((!localStorage.getItem('pn-production-view')||localStorage.getItem('pn-production-view')==='dashboard')&&['superadmin','admin'].includes(window.appAccount?.role)){return openProduction(undefined,'dashboard')}const id=localStorage.getItem('pn-project'),savedSection=localStorage.getItem('pn-production-section'),section=['overview','tasks','schedule','assets','feedback','operations'].includes(savedSection)?savedSection:'overview';const groupId=localStorage.getItem('pn-active-production');if(localStorage.getItem('pn-production-view')==='production'&&(state.productions||[]).some(g=>g.id===groupId&&!g.deleted)){return openProduction(undefined,'overview',false,groupId)}return openProduction(localStorage.getItem('pn-production-view')==='project'&&state.projects.some(p=>p.id===id&&!p.deleted)?id:undefined,section);}
function syncSpaceChrome(){
 if(!loaded)return;
 const isDatabase=typeof databasePanel!=='undefined'&&!databasePanel.hidden;
 const inSettings=typeof settingsPanel!=='undefined'&&!settingsPanel.hidden;
 const space=window.inlineDocumentActive?'documents':mobileLandingSpace?mobileLandingSpace:inSettings?'settings':isDatabase||refPage?'references':'production';
 activeSpace=space;window.activeWorkspace=space==='production'?'home':space;
 if(document.body?.dataset)document.body.dataset.workspace=window.activeWorkspace||'';
 window.sidebarMainNav?.querySelectorAll('[data-main-space]').forEach(b=>{const on=b.dataset.mainSpace===(space==='production'?'home':space);b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));if(on)b.removeAttribute('data-tooltip');else b.setAttribute('data-tooltip',b.getAttribute('aria-label'))});
 window.sidebarSettingsButton?.classList.toggle('active',space==='settings');
 if(typeof adminHomeButton!=='undefined'){adminHomeButton.hidden=true;adminHomeButton.innerHTML=packIcon('home')+'<span>홈</span>';adminHomeButton.classList.toggle('active',space==='production'&&productionSection==='dashboard')}
 const isReference=space==='references';localStorage.setItem('pn-space',space);
 const labels={production:'홈',references:'자료',settings:'설정',documents:'문서 편집기'},icons={production:'home',references:'reference',settings:'settings',documents:'documentEdit'};
 $('#space-name').textContent=labels[space];$('#space-mark').innerHTML=packIcon(icons[space]);$('#space-chevron').innerHTML=packIcon('down');
 $('#space-menu').querySelectorAll('[data-space]').forEach(b=>{const selected=b.dataset.space===space;b.innerHTML=packIcon(icons[b.dataset.space])+'<span>'+labels[b.dataset.space]+'</span>'+(selected?packIcon('check'):'');b.setAttribute('aria-current',String(selected))});
 sidebarProjects.hidden=space!=='production';referenceScope.hidden=!isReference;
 if(typeof databaseScope!=='undefined')databaseScope.hidden=true;
 if(typeof settingsScope!=='undefined')settingsScope.hidden=space!=='settings';
 if(isReference||space==='settings')$('#nav').innerHTML='';
 if(isReference){
  referenceScope.setAttribute('data-source-section',isDatabase?databaseCollection:sourceSection);
  const content=workspaceDefinitions[1].sections.filter(([id])=>id!=='trash'&&!materialDatabaseSections.some(([key])=>key===id));
  const link=([id,label,icon],database=false)=>'<button class="sidebar-ref-link '+((database?isDatabase&&databaseCollection===id:!isDatabase&&sourceSection===id)?'active':'')+'" '+(database?'data-db-scope':'data-source-section')+'="'+id+'" aria-current="'+((database?isDatabase&&databaseCollection===id:!isDatabase&&sourceSection===id)?'page':'false')+'">'+packIcon(icon)+'<span>'+label+'</span></button>';
  referenceScope.innerHTML='<div class="sidebar-source-sections">'+content.map(row=>link(row)).join('')+'</div><hr class="ui-divider materials-divider"><div class="sidebar-material-databases" aria-label="자료 데이터베이스">'+materialDatabaseSections.map(row=>link(row,true)).join('')+'</div>';
 }
 if(!window.sidebarMaterialsTrash){const trash=document.createElement('button');trash.className='sidebar-ref-link sidebar-materials-trash keep-label';trash.dataset.sourceSection='trash';trash.innerHTML=packIcon('trash')+'<span>휴지통</span>';trash.onclick=()=>window.openMaterialsTrash?.();window.sidebarMaterialsTrash=trash}
 window.sidebarMaterialsTrash.hidden=!isReference;
 const trashActive=isReference&&!isDatabase&&sourceSection==='trash';window.sidebarMaterialsTrash.classList.toggle('active',trashActive);window.sidebarMaterialsTrash.setAttribute('aria-current',trashActive?'page':'false');
 if(isReference&&typeof sidebarFixedBottom!=='undefined'){sidebarFixedBottom.append(window.sidebarMaterialsTrash)}
 window.refreshWorkspaceRail?.();window.syncMobileWorkspaceChrome?.(space);if(typeof syncHomeChrome==='function')syncHomeChrome();
}
referenceScope.onclick=async e=>{const database=e.target.closest('[data-db-scope]');if(database){await openDatabase(database.dataset.dbScope);return;}if(e.target.closest('[data-open-document-editor]')){try{await window.showInlineDocument()}catch(error){toast(error.message||'문서를 열지 못했습니다')}return;}const section=e.target.closest('button[data-source-section]');if(section){sourceSection=section.dataset.sourceSection;localStorage.setItem('pn-source-section',sourceSection);refFavorite=false;refTrash=false;refCategory='';refTagFilter='';openRefs();return}if(e.target.closest('#sidebar-ref-new')){refForm();return}const b=e.target.closest('[data-ref-scope],[data-ref-category],[data-ref-tag]');if(!b)return;if(b.dataset.refScope==='trash'){window.openMaterialsTrash?.();return;}refFavorite=b.dataset.refScope==='favorite';refTrash=b.dataset.refScope==='trash';refCategory=b.dataset.refCategory||'';refTagFilter=b.dataset.refTag?(refTagFilter===b.dataset.refTag?'':b.dataset.refTag):'';if(typeof settingsPanel!=='undefined'&&(!settingsPanel.hidden||typeof databasePanel!=='undefined'&&!databasePanel.hidden))openRefs();else{if(typeof closeReferenceModules==='function')closeReferenceModules();drawRefs();setTopTitle(sourceSection==='portfolios'?'포트폴리오':sourceSection==='sources'?'소스':'레퍼런스');}};
