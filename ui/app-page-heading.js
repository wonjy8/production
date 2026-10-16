// One title and a compact directory for every app workspace.
const appHeadingStack=document.createElement('div');appHeadingStack.className='app-heading-stack';
const appPageHeading=document.createElement('h1');appPageHeading.id='app-page-title';
const appHeadingLabel=document.createElement('span');appHeadingLabel.className='app-page-title-label';
const appDocumentTitleButton=document.createElement('button');appDocumentTitleButton.className='keep-label app-document-title';appDocumentTitleButton.setAttribute('aria-label','문서 이름 바꾸기');appDocumentTitleButton.hidden=true;
const appDocumentTitleInput=document.createElement('input');appDocumentTitleInput.className='app-document-title-input';appDocumentTitleInput.setAttribute('aria-label','문서 제목');appDocumentTitleInput.maxLength=190;appDocumentTitleInput.hidden=true;
appPageHeading.append(appHeadingLabel,appDocumentTitleButton,appDocumentTitleInput);appHeadingStack.append(appPageHeading);document.querySelector('.topbar .brand').append(appHeadingStack);
let editingAppDocumentTitle=false,renamingAppDocument=false;
const appDocumentTools=document.createElement('div');appDocumentTools.className='app-document-tools';appDocumentTools.hidden=true;
const appDocumentStatus=document.createElement('span');appDocumentStatus.className='app-document-status';appDocumentStatus.setAttribute('role','status');appDocumentStatus.setAttribute('aria-live','polite');
const appDocumentPanelToggle=document.createElement('button');appDocumentPanelToggle.className='keep-label';appDocumentPanelToggle.dataset.navigationIcon='sliders';appDocumentPanelToggle.setAttribute('aria-label','문서 속성');appDocumentPanelToggle.title='문서 속성';appDocumentPanelToggle.innerHTML=packIcon('sliders');appDocumentTools.append(appDocumentStatus,appDocumentPanelToggle);document.querySelector('.topbar .tools').prepend(appDocumentTools);
window.productionUI?.hydrateSidebarIcons(appDocumentTools);window.addEventListener('production-ui-ready',()=>window.productionUI?.hydrateSidebarIcons(appDocumentTools));
appDocumentPanelToggle.onclick=()=>window.inlineDocumentChrome?.toggleSettings();
appDocumentTitleButton.onclick=()=>{if(!window.inlineDocumentChrome?.canRename)return;editingAppDocumentTitle=true;appDocumentTitleInput.value=window.inlineDocumentChrome.title;appDocumentTitleInput.hidden=false;appDocumentTitleButton.hidden=true;appDocumentTitleInput.focus();appDocumentTitleInput.select()};
async function finishAppDocumentTitle(cancel=false){if(!editingAppDocumentTitle||renamingAppDocument)return;renamingAppDocument=true;try{if(!cancel&&appDocumentTitleInput.value.trim()!==window.inlineDocumentChrome?.title){appDocumentTitleInput.disabled=true;const saved=await window.inlineDocumentChrome?.rename(appDocumentTitleInput.value);if(!saved)toast('원본 수정 권한과 문서 이름을 확인하세요.')}}finally{renamingAppDocument=false;editingAppDocumentTitle=false;appDocumentTitleInput.disabled=false;appDocumentTitleInput.hidden=true;window.refreshAppPageHeading()}}
appDocumentTitleInput.onblur=()=>finishAppDocumentTitle();appDocumentTitleInput.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();finishAppDocumentTitle()}else if(event.key==='Escape'){event.preventDefault();finishAppDocumentTitle(true)}};
window.updateInlineDocumentChrome=(source,chrome)=>{if(source!==window.getInlineDocumentWindow?.())return;window.inlineDocumentChrome=chrome;if(window.inlineDocumentActive)syncBreadcrumbs()};
window.inlineDocumentBreadcrumbs=()=>{const child=window.getInlineDocumentWindow?.();let owner='';try{owner=new URL(child?.location.href||location.href).searchParams.get('owner')||''}catch{}const project=state.projects.find(p=>p.id===owner),group=(state.productions||[]).find(p=>p.id===(project?.productionId||owner));const items=project||group?[{label:'홈',action:'home'},...(group?[{label:group.name,action:'production',id:group.id}]:[]),...(project?[{label:project.title||project.name,action:'project',id:project.id}]:[]),{label:'자료',action:project?'section':'production',id:project?.id||group?.id,section:'assets'}]:[{label:'자료',action:'references'},{label:'보관함',action:'document-library'}];items.push({label:window.inlineDocumentChrome?.title||'문서 편집기',action:'current'});return items};
function headingIsInActiveWorkspace(element,root){if(element.closest('[hidden],dialog,[role=dialog]'))return false;const host=root.host;return host?!host.closest('[hidden]')&&!!host.closest('.canvas'):!!element.closest('.canvas')}
window.refreshAppPageHeading=()=>{
 if(document.body.classList.contains('document-mode'))return;
 const isDocument=!!window.inlineDocumentActive,items=window.appBreadcrumbItems||[];let title=items.at(-1)?.label||'홈';
 if(!isDocument){for(const root of window.appPageHeadingRoots||[]){const headings=[...root.querySelectorAll(window.appPageHeadingSelector)].filter(h=>headingIsInActiveWorkspace(h,root));if(!headings.length)continue;const heading=headings[0];title=heading.textContent.trim()||title;for(const h of headings){if(!h.hasAttribute('data-app-page-title'))h.setAttribute('data-app-page-title','');const wrapper=h.closest('.workspace-page-heading,.document-library-heading,.gallery-heading,.owner-editor-head,header');if(wrapper){const empty=wrapper.children.length===1&&wrapper.firstElementChild===h;if(empty&&!wrapper.hasAttribute('data-app-heading-empty'))wrapper.setAttribute('data-app-heading-empty','');else if(!empty&&wrapper.hasAttribute('data-app-heading-empty'))wrapper.removeAttribute('data-app-heading-empty')}}}}
 else title=window.inlineDocumentChrome?.title||'문서 편집기';
 if(document.title!==title+' · Production')document.title=title+' · Production';
 if(appHeadingLabel.textContent!==title)appHeadingLabel.textContent=title;
 if(appDocumentTitleButton.textContent!==title)appDocumentTitleButton.textContent=title;
 appHeadingLabel.hidden=isDocument;appDocumentTitleButton.hidden=!isDocument||editingAppDocumentTitle;appDocumentTitleButton.disabled=!window.inlineDocumentChrome?.canRename;appDocumentTools.hidden=!isDocument;
 if(!isDocument){editingAppDocumentTitle=false;appDocumentTitleInput.hidden=true}
 const status=window.inlineDocumentChrome?.status||'문서를 불러오는 중…';if(appDocumentStatus.textContent!==status)appDocumentStatus.textContent=status;
 appDocumentPanelToggle.setAttribute('aria-expanded',String(!!window.inlineDocumentChrome?.settingsOpen));
 if(typeof breadcrumbNav!=='undefined'&&breadcrumbNav.parentNode!==appHeadingStack)appHeadingStack.append(breadcrumbNav);
};
