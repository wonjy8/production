// One title and a compact directory for every app workspace.
const appHeadingStack=document.createElement('div');appHeadingStack.className='app-heading-stack';
const appPageHeading=document.createElement('h1');appPageHeading.id='app-page-title';
const appHeadingLabel=document.createElement('span');appHeadingLabel.className='app-page-title-label';
const appDocumentTitleButton=document.createElement('button');appDocumentTitleButton.className='keep-label app-document-title';appDocumentTitleButton.setAttribute('aria-label','페이지 제목 편집');appDocumentTitleButton.title='페이지 제목 편집';appDocumentTitleButton.innerHTML='<span class="app-editable-title-label"></span>';appDocumentTitleButton.hidden=true;
const appDocumentTitleInput=document.createElement('input');appDocumentTitleInput.className='app-document-title-input';appDocumentTitleInput.setAttribute('aria-label','페이지 제목');appDocumentTitleInput.maxLength=190;appDocumentTitleInput.hidden=true;
const appPageIconHost=document.createElement('span');appPageIconHost.className='app-page-icon';window.appPageIconHost=appPageIconHost;appPageHeading.append(appPageIconHost);
appPageHeading.append(appHeadingLabel,appDocumentTitleButton,appDocumentTitleInput);appHeadingStack.append(appPageHeading);document.querySelector('.topbar .brand').append(appHeadingStack);
let appPageTitleEditor=null;
const appDocumentTools=document.createElement('div');appDocumentTools.className='app-document-tools';appDocumentTools.hidden=true;
const appDocumentStatus=document.createElement('span');appDocumentStatus.className='app-document-status';appDocumentStatus.setAttribute('role','status');appDocumentStatus.setAttribute('aria-live','polite');
const appDocumentPanelToggle=document.createElement('button');appDocumentPanelToggle.className='keep-label';appDocumentPanelToggle.dataset.navigationIcon='sliders';appDocumentPanelToggle.setAttribute('aria-label','문서 속성');appDocumentPanelToggle.title='문서 속성';appDocumentPanelToggle.innerHTML=packIcon('sliders');appDocumentTools.append(appDocumentStatus,appDocumentPanelToggle);document.querySelector('.topbar .tools').prepend(appDocumentTools);
window.productionUI?.hydrateSidebarIcons(appDocumentTools);window.addEventListener('production-ui-ready',()=>window.productionUI?.hydrateSidebarIcons(appDocumentTools));
appDocumentPanelToggle.onclick=()=>window.inlineDocumentChrome?.toggleSettings();
function installAppPageTitleEditor(){if(appPageTitleEditor||!window.productionUI?.createPageTitleEditor)return;appDocumentTitleButton.insertAdjacentHTML('beforeend',packIcon('edit'));appPageTitleEditor=window.productionUI.createPageTitleEditor({button:appDocumentTitleButton,input:appDocumentTitleInput,label:appHeadingLabel,getTarget:()=>window.currentPageTitleTarget?.(),onRefresh:()=>window.refreshAppPageHeading(),onError:message=>toast(message)});window.refreshAppPageHeading?.()}
window.addEventListener('production-ui-ready',installAppPageTitleEditor);
window.commitAppPageTitle=()=>appPageTitleEditor?.finish()??true;
window.showDocumentEditorUnavailable=async()=>{sessionStorage.setItem('pn-document-disabled','1');const url=new URL(location.href);url.search='';url.hash='/home';location.replace(url.href)};
window.currentPageTitleTarget=()=>{
 if(!loaded)return null;
 if(window.inlineDocumentActive){const chrome=window.inlineDocumentChrome;return chrome?{key:'document',title:chrome.title,canEdit:chrome.canRename,maxLength:190,rename:chrome.rename}:null}
 if(!databasePanel.hidden&&databasePanel.classList.contains('owner-editor')){const field=databasePanel.querySelector('#db-name');if(field)return {key:'member:'+databasePanel.dataset.searchOwnerId,permissionOwner:databasePanel.dataset.searchOwnerId,permissionTab:'materials',title:field.value,canEdit:!field.readOnly&&!field.disabled&&window.accountCan?.(databasePanel.dataset.searchOwnerId,'materials')!==false,rename:async name=>{const previous=field.value;field.value=name;field.dispatchEvent(new Event('input',{bubbles:true}));try{if(memberEditorAutosave)await memberEditorAutosave.flush()}catch(error){if(field.value===name){field.value=previous;field.dispatchEvent(new Event('input',{bubbles:true}))}throw error}databaseEditingName=name;syncBreadcrumbs();return true}}}
 if(refPage&&window.activeReferenceId){const row=refs.find(r=>r.id===window.activeReferenceId&&!r.deleted);if(row)return {key:'reference:'+row.id,permissionOwner:row.id,permissionTab:'materials',title:row.title,canEdit:window.accountCan?.(row.id,'materials')!==false,rename:async name=>{if(window.accountCan?.(row.id,'materials')===false)throw Error('편집 권한이 없습니다.');const latest=window.referenceBridge.get(row.id),previous=latest.title;try{await window.referenceBridge.save({...latest,title:name})}catch(error){const current=window.referenceBridge.get(row.id);if(current?.title===name)cacheReference({...current,title:previous});throw error}syncBreadcrumbs();return true}}}
 if(!productionPage||!settingsPanel.hidden||!databasePanel.hidden||refPage)return null;
 const project=selected?state.projects.find(p=>p.id===selected&&!p.deleted):null;
 const group=!project&&localStorage.getItem('pn-production-view')==='production'?(state.productions||[]).find(p=>p.id===localStorage.getItem('pn-active-production')&&!p.deleted):null;
 const owner=project||group;if(!owner)return null;
 const freshOwner=()=>project?state.projects.find(p=>p.id===owner.id&&!p.deleted):(state.productions||[]).find(p=>p.id===owner.id&&!p.deleted);
 const allowed=()=>!!freshOwner()&&window.accountCan?.(owner.id,'overview')!==false&&!window.productionCompletionPolicy?.locked(state,freshOwner());
 return {key:(project?'project:':'production:')+owner.id,permissionOwner:owner.id,permissionTab:'overview',title:project?owner.title:owner.name,canEdit:allowed(),rename:async name=>{if(!allowed())throw Error('편집 권한을 확인하거나 완료된 프로젝트를 다시 진행하세요.');await flushWorkspace();if(!allowed())throw Error('현재 편집 권한을 확인하세요.');const latest=freshOwner(),previous=project?latest.title:latest.name;snapshot();if(project)latest.title=name;else latest.name=name;latest.updatedAt=new Date().toISOString();changed();try{await flushWorkspace()}catch(error){const current=freshOwner();if(current&&(project?current.title:current.name)===name){if(project)current.title=previous;else current.name=previous;changed();window.productionRefresh?.();syncSidebar()}throw error}window.productionRefresh?.();syncSidebar();syncBreadcrumbs();window.appNavigation?.changed();return true}};
};
window.updateInlineDocumentChrome=(source,chrome)=>{if(source!==window.getInlineDocumentWindow?.())return;window.inlineDocumentChrome=chrome;if(window.inlineDocumentActive)syncBreadcrumbs()};
window.inlineDocumentBreadcrumbs=()=>{const child=window.getInlineDocumentWindow?.();let owner='';try{owner=new URL(child?.location.href||location.href).searchParams.get('owner')||''}catch{}const project=state.projects.find(p=>p.id===owner),group=(state.productions||[]).find(p=>p.id===(project?.productionId||owner));const items=project||group?[{label:workspaceDefinitions[0].label,action:'home'},...(group?[{label:group.name,action:'production',id:group.id}]:[]),...(project?[{label:project.title||project.name,action:'project',id:project.id}]:[]),{label:'자료',action:project?'section':'production',id:project?.id||group?.id,section:'assets'}]:[{label:'자료',action:'references'},{label:'보관함',action:'document-library'}];items.push({label:window.inlineDocumentChrome?.title||'문서 편집기',action:'current'});return items};
function headingIsInActiveWorkspace(element,root){if(element.closest('[hidden],dialog,[role=dialog]'))return false;const host=root.host;return host?!host.closest('[hidden]')&&!!host.closest('.canvas'):!!element.closest('.canvas')}
window.refreshAppPageHeading=()=>{
 if(document.body.classList.contains('document-mode'))return;
 appPageIconHost.hidden=!productionPage||refPage||!settingsPanel.hidden||!databasePanel.hidden||(!selected&&localStorage.getItem('pn-production-view')!=='production');
 const isDocument=!!window.inlineDocumentActive,items=window.appBreadcrumbItems||[];let title=items.at(-1)?.label||'홈';
 if(!isDocument){for(const root of window.appPageHeadingRoots||[]){const headings=[...root.querySelectorAll(window.appPageHeadingSelector)].filter(h=>headingIsInActiveWorkspace(h,root));if(!headings.length)continue;const heading=headings[0];title=heading.textContent.trim()||title;for(const h of headings){if(!h.hasAttribute('data-app-page-title'))h.setAttribute('data-app-page-title','');const wrapper=h.closest('.workspace-page-heading,.document-library-heading,.gallery-heading,.owner-editor-head,header');if(wrapper){const empty=wrapper.children.length===1&&wrapper.firstElementChild===h;if(empty&&!wrapper.hasAttribute('data-app-heading-empty'))wrapper.setAttribute('data-app-heading-empty','');else if(!empty&&wrapper.hasAttribute('data-app-heading-empty'))wrapper.removeAttribute('data-app-heading-empty')}}}}
 else title=window.inlineDocumentChrome?.title||'문서 편집기';
 const titleTarget=window.currentPageTitleTarget();if(titleTarget?.title)title=titleTarget.title;
 if(appPageHeading.getAttribute('aria-label')!==title)appPageHeading.setAttribute('aria-label',title);
 if(document.title!==title+' · Production')document.title=title+' · Production';
 if(appHeadingLabel.textContent!==title)appHeadingLabel.textContent=title;
 installAppPageTitleEditor();
 if(titleTarget?.permissionOwner){appHeadingStack.dataset.permissionOwner=titleTarget.permissionOwner;appHeadingStack.dataset.permissionTab=titleTarget.permissionTab||'overview'}else{delete appHeadingStack.dataset.permissionOwner;delete appHeadingStack.dataset.permissionTab}
 if(appPageTitleEditor)appPageTitleEditor.sync(title,titleTarget);else appHeadingLabel.hidden=false;
 appDocumentTools.hidden=!isDocument;
 const status=window.inlineDocumentChrome?.status||'문서를 불러오는 중…';if(appDocumentStatus.textContent!==status)appDocumentStatus.textContent=status;
 appDocumentPanelToggle.setAttribute('aria-expanded',String(!!window.inlineDocumentChrome?.settingsOpen));
 if(typeof breadcrumbNav!=='undefined'&&breadcrumbNav.parentNode!==appHeadingStack)appHeadingStack.append(breadcrumbNav);
};
