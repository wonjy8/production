// Navigation geometry is shared with the standalone editor.
const sidebarRailDivider=document.createElement('hr');sidebarRailDivider.className='workspace-rail-divider';sidebarRailDivider.setAttribute('aria-label','문서 편집기 구분');
const sidebarDocumentEditor=document.createElement('button');sidebarDocumentEditor.className='sidebar-ref-link sidebar-document-editor keep-label';sidebarDocumentEditor.dataset.mainSpace='documents';sidebarDocumentEditor.dataset.navigationIcon='documentEdit';sidebarDocumentEditor.setAttribute('aria-label','문서 편집기');sidebarDocumentEditor.setAttribute('aria-pressed','false');sidebarDocumentEditor.innerHTML=railIcon('documentEdit')+'<span>문서 편집기</span>';window.sidebarDocumentEditor=sidebarDocumentEditor;
sidebarMainNav.insertBefore(sidebarRailDivider,sidebarSettingsButton);sidebarMainNav.insertBefore(sidebarDocumentEditor,sidebarSettingsButton);
sidebarDocumentEditor.dataset.openDocumentEditor='true';
window.refreshWorkspaceRail=()=>{for(const b of sidebarMainNav.querySelectorAll('[data-main-space]')){const active=b.getAttribute('aria-pressed')==='true';b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');b.setAttribute('title',b.disabled&&b.dataset.mainSpace==='documents'?'문서 편집기 · 준비 중':b.getAttribute('aria-label'));}window.productionUI?.hydrateSidebarIcons(sidebarMainNav)};
window.installDocumentRail=()=>{if(document.querySelector('.document-workspace-rail'))return;const rail=document.createElement('nav');rail.className='document-workspace-rail';rail.setAttribute('aria-label','워크스페이스');const buttons=sidebarMainNav.cloneNode(true);buttons.querySelectorAll('[data-main-space]').forEach(b=>{const on=b.dataset.mainSpace==='documents';b.setAttribute('aria-pressed',String(on));b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');b.setAttribute('title',b.getAttribute('aria-label'))});rail.append(buttons);document.body.append(rail);window.productionUI?.hydrateSidebarIcons(rail);
 rail.onclick=async event=>{const button=event.target.closest('[data-main-space]');if(!button||button.dataset.mainSpace==='documents')return;button.disabled=true;try{if(window.prepareAppUpdate&&await window.prepareAppUpdate()===false)throw Error('문서 저장을 마친 뒤 이동하세요.');const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('workspace',button.dataset.mainSpace);location.assign(url.href)}catch(error){button.disabled=false;window.appUndoError?.(error.message)}};
};
sidebarDocumentEditor.disabled=!window.appFeatures.documentEditor;sidebarDocumentEditor.setAttribute('aria-disabled',String(sidebarDocumentEditor.disabled));sidebarDocumentEditor.title='문서 편집기 · 준비 중';
window.refreshWorkspaceRail();

// Workspace navigation remains available outside the collapsible app sidebar.
sidebarFixedTop.classList.add('workspace-rail');
document.body.append($('#sidebar'));
const enableWorkspaceLayoutMotion=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>document.body.classList.add('workspace-layout-ready')));if(window.productionUI)enableWorkspaceLayoutMotion();else window.addEventListener('production-ui-ready',enableWorkspaceLayoutMotion,{once:true});
const sidebarWorkspaceHeading=document.createElement('div');sidebarWorkspaceHeading.className='sidebar-workspace-heading';sidebarWorkspaceHeading.textContent=workspaceDefinitions[0].label;window.sidebarWorkspaceHeading=sidebarWorkspaceHeading;sidebarScroll.prepend(sidebarWorkspaceHeading);adminHomeButton.classList.add('sidebar-home-link','keep-label');sidebarWorkspaceHeading.after(adminHomeButton);
const documentScope=document.createElement('div');documentScope.className='sidebar-document-scope';documentScope.hidden=true;sidebarScroll.append(documentScope);
documentScope.innerHTML='<button class="sidebar-ref-link keep-label" data-new-inline-document>'+packIcon('plus')+'<span>새 문서</span></button><button class="sidebar-ref-link keep-label" data-document-library>'+packIcon('folder')+'<span>보관함의 문서</span></button>';
const inlineDocumentPanel=document.createElement('section');inlineDocumentPanel.id='inline-document-panel';inlineDocumentPanel.hidden=true;inlineDocumentPanel.setAttribute('aria-label','문서 편집기');document.querySelector('.canvas').append(inlineDocumentPanel);
let inlineDocumentFrame=null,inlineDocumentOpening=false;
window.getInlineDocumentWindow=()=>inlineDocumentFrame?.contentWindow;
const inlineDocumentStorageKey='pn-open-document:'+location.pathname;
window.flushInlineDocument=async()=>{if(!inlineDocumentFrame)return;const child=inlineDocumentFrame.contentWindow;const prepare=child?.prepareDocumentNavigation||child?.prepareAppUpdate;if(prepare&&await prepare()===false)throw Error('문서 저장을 마친 뒤 이동하세요.');};
window.hideInlineDocument=()=>{window.inlineDocumentActive=false;document.body.classList.remove('inline-document-active');inlineDocumentPanel.hidden=true;documentScope.hidden=true};
window.openInlineDocument=async address=>{if(!window.appFeatures.documentEditor){toast('문서 편집기는 현재 준비 중입니다.');return false}
 try{
  await prepareWorkspaceNavigation();
  closeHub();closeSpaceMenu();dismissMobileWorkspaceHome();closeSettings();leaveProduction();refPage=false;
  $('#paper').hidden=true;$('#refpanel').hidden=true;$('#loading').hidden=true;productionHost.hidden=true;
  if(address){window.inlineDocumentChrome=null;const url=new URL(address,location.href);url.searchParams.set('embedded','1');const next=document.createElement('iframe');next.title='문서 편집기';next.src=url.href;localStorage.setItem(inlineDocumentStorageKey,url.href);next.onload=()=>{try{localStorage.setItem(inlineDocumentStorageKey,next.contentWindow.location.href)}catch{}};inlineDocumentFrame=next;inlineDocumentPanel.replaceChildren(next)}
  if(!inlineDocumentFrame)throw Error('열 문서가 없습니다.');
  inlineDocumentPanel.hidden=false;window.inlineDocumentActive=true;document.body.classList.add('inline-document-active');if(inlineDocumentFrame.contentWindow?.documentWorkspaceChrome)window.inlineDocumentChrome=inlineDocumentFrame.contentWindow.documentWorkspaceChrome;syncSpaceChrome();documentScope.hidden=false;setTopTitle('문서 편집기');
 }catch(error){toast(error.message||'문서를 열지 못했습니다');throw error}
};
window.showInlineDocument=async(create=false)=>{if(!window.appFeatures.documentEditor){toast('문서 편집기는 현재 준비 중입니다.');return false}
 if(inlineDocumentOpening)return;inlineDocumentOpening=true;
 try{const last=localStorage.getItem(inlineDocumentStorageKey);if(!inlineDocumentFrame&&!create&&last){const url=new URL(last,location.href);if(url.origin===location.origin&&url.pathname===location.pathname&&url.searchParams.has('document')){await window.openInlineDocument(url.href);return}}if(inlineDocumentFrame&&!create){await window.openInlineDocument();return}
  await window.flushInlineDocument();
  if(!window.openBlankDocument)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/production-app';script.onload=resolve;script.onerror=reject;document.head.append(script)});
  await window.openBlankDocument(null);
 }finally{inlineDocumentOpening=false}
};
documentScope.onclick=event=>{if(event.target.closest('[data-new-inline-document]'))window.showInlineDocument(true).catch(()=>{});else if(event.target.closest('[data-document-library]')){sourceSection='resources';localStorage.setItem('pn-resource-type','documents');openRefs()}};
window.setContextSidebarOpen=open=>{
 if(isMobileViewport()){$('#sidebar').classList.toggle('open',open);sidebarScrim.classList.toggle('active',open)}
 else document.body.classList.toggle('sidebar-collapsed',!open);
 const resize=$('#sidebar .sidebar-resize');if(resize){resize.tabIndex=open&&!isMobileViewport()?0:-1;resize.setAttribute('aria-disabled',String(!open||isMobileViewport()))}
 for(const button of sidebarMainNav.querySelectorAll('[data-main-space]'))button.setAttribute('aria-expanded',String(open&&button.getAttribute('aria-pressed')==='true'));
 if(!open&&typeof finishSidebarResize==='function')finishSidebarResize();
};
sidebarSettingsButton.onclick=null;sidebarDocumentEditor.onclick=null;
window.activateWorkspaceRail=async event=>{
 const button=event.target.closest('[data-main-space]');if(!button||button.disabled)return;
 const same=button.getAttribute('aria-pressed')==='true',open=isMobileViewport()?$('#sidebar').classList.contains('open'):!document.body.classList.contains('sidebar-collapsed');
 if(same){window.setContextSidebarOpen(!open);return}
 button.disabled=true;
 try{closeHub();closeSpaceMenu();const space=button.dataset.mainSpace;
  if(space==='documents')await window.showInlineDocument();
  else if(space==='home')await openProduction(undefined,'dashboard');
  else if(space==='references')await openRefs();
  else if(space==='settings')await openSettings();
  if(button.getAttribute('aria-pressed')==='true')window.setContextSidebarOpen(true);
 }catch(error){toast(error.message||'화면을 열지 못했습니다')}finally{button.disabled=false}
};
// Resize state must follow changes made by scrim, responsive layout and navigation.
function syncContextSidebarState(){const resize=$('#sidebar .sidebar-resize');if(!resize)return;const open=isMobileViewport()?$('#sidebar').classList.contains('open'):!document.body.classList.contains('sidebar-collapsed');resize.tabIndex=open&&!isMobileViewport()?0:-1;resize.setAttribute('aria-disabled',String(!open||isMobileViewport()));for(const button of sidebarMainNav.querySelectorAll('[data-main-space]'))button.setAttribute('aria-expanded',String(open&&button.getAttribute('aria-pressed')==='true'));}
new MutationObserver(syncContextSidebarState).observe(document.body,{attributes:true,attributeFilter:['class','data-workspace']});
new MutationObserver(syncContextSidebarState).observe($('#sidebar'),{attributes:true,attributeFilter:['class']});
window.matchMedia('(max-width:720px)').addEventListener('change',syncContextSidebarState);
