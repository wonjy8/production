import {iconSVG,inferIcon} from './icons.js';
import {installDropdowns} from './dropdowns.js';
const exclude='.source-gallery button,.admin-home button,.merge-project,.sidebar-project,.refopen,.task-title,.calendar-event,.calendar-task,.assignee-trigger,.assignee-popover button,.status-options button,.navlink,.keep-label,.space-switch,.space-option,.sidebar-ref-link';
export function decorateUI(root){root.querySelectorAll('button').forEach(b=>{
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
export function observeUI(root){installDropdowns(root);decorateUI(root);let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorateUI(root)})});observer.observe(root,{childList:true,subtree:true,characterData:true});return ()=>observer.disconnect();}
