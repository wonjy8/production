// Mobile workspace roots share the desktop routes and save queues.
const mobileLandingPanel=document.createElement('section');mobileLandingPanel.className='workspace-landing';mobileLandingPanel.hidden=true;document.querySelector('.canvas').append(mobileLandingPanel);
const mobileBottomNav=document.createElement('nav');mobileBottomNav.className='mobile-bottom-nav';mobileBottomNav.setAttribute('aria-label','하단 워크스페이스 탐색');document.body.append(mobileBottomNav);
const mobileWorkspaceBack=document.createElement('button');mobileWorkspaceBack.className='mobile-workspace-back keep-label';mobileWorkspaceBack.setAttribute('aria-label','워크스페이스 첫 화면으로 돌아가기');mobileWorkspaceBack.innerHTML=packIcon('chevronLeft');mobileWorkspaceBack.hidden=true;document.querySelector('.topbar .brand').prepend(mobileWorkspaceBack);
function isMobileViewport(){return window.matchMedia('(max-width:720px)').matches}
function dismissMobileWorkspaceHome(){mobileLandingSpace='';mobileLandingPanel.hidden=true;window.mobileWorkspaceHome=''}
async function openMobileWorkspaceHome(id){
 if(!loaded)return;
 try{await prepareWorkspaceNavigation()}catch(error){toast(error.message);return}
 closeHub();closeSpaceMenu();
 if(id==='home'){dismissMobileWorkspaceHome();return openProduction(undefined,'overview')}
 closeReferenceModules();closeSettings();leaveProduction();refPage=false;$('#paper').hidden=true;$('#refpanel').hidden=true;$('#loading').hidden=true;
 mobileLandingSpace=id;window.mobileWorkspaceHome=id;mobileLandingPanel.hidden=false;
 const workspace=workspaceDefinitions.find(w=>w.id===id),label=workspace?.label||'설정';
 const admin=['superadmin','admin'].includes(window.appAccount?.role);
 const sections=id==='settings'?settingsCategories.filter(c=>admin||['account','general','connections'].includes(c[0])):workspace.sections;
 mobileLandingPanel.innerHTML='<header><h1>'+label+'</h1><p>열 항목을 선택하세요.</p></header><div class="workspace-landing-items">'+sections.map(([key,title,icon])=>'<button class="workspace-landing-card keep-label" data-workspace-section="'+key+'">'+packIcon(icon)+'<span>'+title+'</span>'+packIcon('chevronRight')+'</button>').join('')+'</div>';
 mobileLandingPanel.onclick=event=>{const button=event.target.closest('[data-workspace-section]');if(!button)return;const section=button.dataset.workspaceSection;if(id==='settings')openSettings(section);else if(id==='database')openDatabase(section);else{sourceSection=section;localStorage.setItem('pn-source-section',section);refFavorite=false;refTrash=false;refCategory='';refTagFilter='';openRefs()}};
 localStorage.setItem('pn-space',id);setTopTitle(label);syncSpaceChrome();
}
mobileWorkspaceBack.onclick=()=>openMobileWorkspaceHome(window.activeWorkspace||'settings');
window.syncMobileWorkspaceChrome=space=>{mobileWorkspaceBack.hidden=!isMobileViewport()||!!mobileLandingSpace||(space==='production'&&!selected&&localStorage.getItem('pn-production-view')!=='production')};
function syncMobileNavigation(){
 const mobile=isMobileViewport();
 if(mobile){mobileBottomNav.append(sidebarMainNav);sidebarMainNav.append(sidebarSettingsButton);sidebarSettingsButton.dataset.mainSpace='settings';sidebarSettingsButton.setAttribute('aria-label','설정');sidebarSettingsButton.classList.add('keep-label')}
 else{sidebarFixedTop.append(sidebarMainNav);sidebarFixedBottom.append(sidebarSettingsButton);if(mobileLandingSpace){const space=mobileLandingSpace;dismissMobileWorkspaceHome();if(space==='settings')openSettings();else if(space==='database')openDatabase();else openRefs()}}
 if(loaded)syncSpaceChrome();
}
window.matchMedia('(max-width:720px)').addEventListener('change',syncMobileNavigation);syncMobileNavigation();
