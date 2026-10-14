export const CALENDAR_DRAG_TYPE='application/x-production-calendar';
export function calendarDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value}
export function shiftCalendarDate(value,days){if(!calendarDate(value))return value;const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
export function moveCalendarItem(project,kind,id,target,anchor){if(!calendarDate(target))return project;if(kind==='task')return {...project,tasks:project.tasks.map(t=>t.id===id?{...t,due:target}:t)};if(kind!=='schedule')return project;const schedule=project.schedules.find(s=>s.id===id);if(!schedule)return project;const start=calendarDate(anchor)?anchor:schedule.date;if(!calendarDate(start))return project;const delta=Math.round((Date.parse(target+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);return {...project,schedules:project.schedules.map(s=>s.id===id?{...s,date:shiftCalendarDate(s.date,delta),endDate:shiftCalendarDate(s.endDate||s.date,delta)}:s)} }

// Keep a live, pointer-transparent block above both document and shadow-root calendars.
let activePreview;
export function clearCalendarDragImage(){activePreview?.();activePreview=null}
export function setCalendarDragImage(event){
 clearCalendarDragImage();
 const source=event.currentTarget,rect=source.getBoundingClientRect(),preview=source.cloneNode(true);
 const originals=[source,...source.querySelectorAll('*')],copies=[preview,...preview.querySelectorAll('*')];
 originals.forEach((node,i)=>{const computed=getComputedStyle(node);for(const property of computed)copies[i].style.setProperty(property,computed.getPropertyValue(property));});
 Object.assign(preview.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',pointerEvents:'none',zIndex:'2147483647',opacity:'.9',boxShadow:'0 6px 20px #0002',transition:'none',transform:'none'});
 preview.setAttribute('aria-hidden','true');preview.dataset.dragPreview='true';preview.removeAttribute('id');preview.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));document.body.append(preview);
 const offsetX=Math.max(0,Math.min(rect.width,event.clientX-rect.left)),offsetY=Math.max(0,Math.min(rect.height,event.clientY-rect.top));
 let frame=0,x=event.clientX,y=event.clientY;
 const move=e=>{if(!e.clientX&&!e.clientY)return;x=e.clientX;y=e.clientY;if(frame)return;frame=requestAnimationFrame(()=>{frame=0;preview.style.left=x-offsetX+'px';preview.style.top=y-offsetY+'px'})};
 const doc=source.ownerDocument,events=['dragover','drag','pointermove','touchmove'];
 const track=e=>move(e.touches?.[0]||e);
 for(const name of events)doc.addEventListener(name,track,true);
 const finish=()=>clearCalendarDragImage(),endEvents=event.dataTransfer?['drop','dragend']:['pointerup','pointercancel','touchend','touchcancel'];
 for(const name of endEvents)doc.addEventListener(name,finish,true);
 const blank=document.createElement('canvas');blank.width=blank.height=1;blank.style.cssText='position:fixed;left:0;top:0;pointer-events:none';doc.body.append(blank);event.dataTransfer?.setDragImage(blank,0,0);
 activePreview=()=>{cancelAnimationFrame(frame);preview.remove();blank.remove();for(const name of events)doc.removeEventListener(name,track,true);for(const name of endEvents)doc.removeEventListener(name,finish,true)};
}
