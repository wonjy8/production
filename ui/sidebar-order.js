import {installDelayedPointerDrag} from './touch-drag.js';
import {setCalendarDragImage,clearCalendarDragImage} from '../production/calendar-drag.js';
const installed=new WeakSet();
export function installSidebarOrdering(root,onChange){
 if(!root||installed.has(root))return;installed.add(root);let moving='',target=null,after=false,until=0;
 const key=button=>button.dataset.productionId?'production:'+button.dataset.productionId:'project:'+button.dataset.projectId;
 const clear=()=>{root.querySelectorAll('.sidebar-insert-before,.sidebar-insert-after').forEach(b=>b.classList.remove('sidebar-insert-before','sidebar-insert-after'));target=null};
 const finish=()=>{clearCalendarDragImage();clear();moving='';until=Date.now()+600};
 const over=(button,y)=>{clear();if(!button||key(button)===moving)return;target=button;const rect=button.getBoundingClientRect();after=y>rect.top+rect.height/2;button.classList.add(after?'sidebar-insert-after':'sidebar-insert-before')};
 const commit=()=>{if(moving&&target){const ids=[...root.querySelectorAll('.sidebar-project')].map(key).filter(id=>id!==moving),at=ids.indexOf(key(target));if(at>=0){ids.splice(at+(after?1:0),0,moving);onChange(ids)}}finish()};
 root.addEventListener('click',e=>{if(Date.now()<until){e.preventDefault();e.stopImmediatePropagation()}},true);
 root.addEventListener('dragstart',e=>{const button=e.target.closest('.sidebar-project');if(!button)return;moving=key(button);e.dataTransfer.setData('application/x-sidebar-project',moving);e.dataTransfer.effectAllowed='move';setCalendarDragImage({...e,currentTarget:button,clientX:e.clientX,clientY:e.clientY,dataTransfer:e.dataTransfer})});
 root.addEventListener('dragover',e=>{if(!moving)return;e.preventDefault();e.dataTransfer.dropEffect='move';over(e.target.closest('.sidebar-project'),e.clientY)});
 root.addEventListener('drop',e=>{if(!moving)return;e.preventDefault();e.stopPropagation();commit()});root.addEventListener('dragend',finish);
 root.addEventListener('dragleave',e=>{const r=root.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)clear()});
 const prepare=()=>root.querySelectorAll('.sidebar-project').forEach(button=>{if(button.draggable)return;button.draggable=true;button.onpointerdown=e=>{if(e.pointerType!=='touch')return;moving=key(button);setCalendarDragImage(e)};button.onpointermove=e=>{if(e.pointerType!=='touch'||!moving)return;over(document.elementFromPoint(e.clientX,e.clientY)?.closest('.sidebar-project'),e.clientY)};button.onpointerup=e=>{if(e.pointerType==='touch'&&moving)commit()};button.onpointercancel=finish;installDelayedPointerDrag(button)});
 new MutationObserver(prepare).observe(root,{childList:true});prepare();
}
