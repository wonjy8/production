import {registerPageHeadingRoot} from './design-system/page-heading.js';
import {iconSVG,inferIcon} from './icons.js';
import {installDropdowns} from './dropdowns.js';
const exclude='.source-gallery button,.admin-home button,.merge-project,.sidebar-project,.refopen,.task-title,.calendar-event,.calendar-task,.assignee-trigger,.assignee-popover button,.status-options button,.navlink,.keep-label,.space-switch,.space-option,.sidebar-ref-link';
export function decorateUI(root){
 root.querySelectorAll('button,input,textarea,select,[contenteditable]').forEach(el=>{
  const locked=!!el.closest?.('[data-project-readonly="true"],[data-document-frozen="true"]');
  const label=el.getAttribute('aria-label')||el.textContent||'';
  const navigation=el.closest?.('.merge-sections,.resource-view-switch,.resource-type-tabs')||/사본|다운로드|다시 진행|보존본 준비|사용처|미리보기|열기|닫기|보기|필터|검색|정렬|내보내기/.test(label);
  const mutable=!navigation&&(el.matches?.('input:not([type=search]),textarea,select,[contenteditable]')||/추가|삭제|수정|편집|저장|제거|이름|업로드|완료|체크|구성|그룹 관리/.test(label));
  if(locked&&mutable&&!el.disabled){el.disabled=true;el.dataset.completionDisabled='true'}else if(!locked&&el.dataset.completionDisabled==='true'){el.disabled=false;delete el.dataset.completionDisabled}
 });
root.querySelectorAll('button').forEach(b=>{
 const actionLabel=b.getAttribute('aria-label')||b.textContent.trim();
 // Keep the complete accessible name and permission semantics, shorten only visible add labels.
 if(!b.matches('.calendar-event,.calendar-task,.calendar-task-check,.task-title,.sg-event,.sg-all-day-item,.tt-event,.tt-all-day-item,.refopen,.merge-project,.sidebar-project,.hub-card')&&/추가\s*$/.test(b.textContent.trim())&&b.textContent.trim()!=='추가'&&(/추가/.test(actionLabel)||b.dataset.controlIcon==='plus')&&!b.closest('.item-context-menu')){if(!b.hasAttribute('aria-label'))b.setAttribute('aria-label',actionLabel);const walker=document.createTreeWalker(b,NodeFilter.SHOW_TEXT);let node,last;while(node=walker.nextNode())if(node.textContent.trim())last=node;if(last&&/추가\s*$/.test(last.textContent)){last.textContent=last.textContent.replace(/\s*추가\s*$/,'');if(b.matches('.keep-label')&&!b.querySelector('svg')&&!/^[＋+]/.test(b.textContent.trim()))b.insertAdjacentHTML('afterbegin',iconSVG('plus'));}}

 b.classList.toggle('ui-add-action',/추가|^[＋+]$/.test(actionLabel)&&!b.matches('.hub-card,.module-tab-empty,.calendar-event,.calendar-task,.calendar-task-check,.task-title,.tt-event,.tt-all-day-item,.sg-event,.sg-all-day-item,.tt-slot,.calendar-add'));
 if(b.matches(exclude))return;
 const svg=b.querySelector('svg');
 if(!svg&&b.matches('[data-newblock]'))b.childNodes.forEach(n=>{if(n.nodeType===3){const clean=n.textContent.replace(/^\s*[＋+]\s*/, '');if(clean!==n.textContent)n.textContent=clean;}});
 const text=b.textContent.trim();
 const label=b.dataset.uiAutoLabel==='true'?text:b.getAttribute('aria-label')||text;
 if(!label)return;
 if(!b.hasAttribute('aria-label')||b.dataset.uiAutoLabel==='true'){b.dataset.uiAutoLabel='true';b.setAttribute('aria-label',label);}
 b.title=label;
 b.dataset.controlIcon=b.dataset.controlIcon||b.dataset.iconName||inferIcon(label);
 const compact=b.matches('.workspace-tabs button,.project-sections button,.merge-sections button,[data-newblock],.choice');
 b.classList.toggle('compact-nav',compact);b.classList.toggle('ui-icon-button',!compact);
 if(svg){b.classList.remove('has-pack-icon');b.style.removeProperty('--button-icon');delete b.dataset.uiIconLabel;}
 else if(b.dataset.uiIconLabel!==label+'|'+(b.dataset.iconName||'')||!b.classList.contains('has-pack-icon')){b.dataset.uiIconLabel=label+'|'+(b.dataset.iconName||'');b.classList.add('has-pack-icon');b.style.setProperty('--button-icon','url("data:image/svg+xml,'+encodeURIComponent(iconSVG(b.dataset.iconName||inferIcon(label)).replace('currentColor','#111'))+'")');}
 });}
export function observeUI(root){const stopHeadings=registerPageHeadingRoot(root);installDropdowns(root);decorateUI(root);let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorateUI(root);window.refreshAppPageHeading?.()})});observer.observe(root,{childList:true,subtree:true,characterData:true});return ()=>{observer.disconnect();stopHeadings()};}
