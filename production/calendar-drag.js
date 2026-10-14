export const CALENDAR_DRAG_TYPE='application/x-production-calendar';
export function calendarDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value}
export function shiftCalendarDate(value,days){if(!calendarDate(value))return value;const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
export function moveCalendarItem(project,kind,id,target,anchor){if(!calendarDate(target))return project;if(kind==='task')return {...project,tasks:project.tasks.map(t=>t.id===id?{...t,due:target}:t)};if(kind!=='schedule')return project;const schedule=project.schedules.find(s=>s.id===id);if(!schedule)return project;const start=calendarDate(anchor)?anchor:schedule.date;if(!calendarDate(start))return project;const delta=Math.round((Date.parse(target+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);return {...project,schedules:project.schedules.map(s=>s.id===id?{...s,date:shiftCalendarDate(s.date,delta),endDate:shiftCalendarDate(s.endDate||s.date,delta)}:s)} }

// Give Safari and shadow-root calendars a rendered block to carry with the cursor.
export function setCalendarDragImage(event){
 const source=event.currentTarget,rect=source.getBoundingClientRect(),preview=source.cloneNode(true);
 const originals=[source,...source.querySelectorAll('*')],copies=[preview,...preview.querySelectorAll('*')];
 originals.forEach((node,i)=>{const computed=getComputedStyle(node);for(const property of computed)copies[i].style.setProperty(property,computed.getPropertyValue(property));});
 Object.assign(preview.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',pointerEvents:'none',zIndex:'2147483647'});
 preview.setAttribute('aria-hidden','true');preview.removeAttribute('id');preview.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));document.body.append(preview);
 event.dataTransfer.setDragImage(preview,Math.max(0,Math.min(rect.width,event.clientX-rect.left)),Math.max(0,Math.min(rect.height,event.clientY-rect.top)));
 requestAnimationFrame(()=>preview.remove());
}
