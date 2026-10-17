// Canonical TypeScript implementation; ../timetable-gestures.js is a compatibility export.
import {normalizeConfig,orderedDates,shiftDate,dateDistance} from '../timetable-model.js';
export function slotZoom(height,scale){return Math.max(3,Math.min(48,Number(height||18)*scale))}
export function panDates(config,anchor,selected,delta){
 const c=normalizeConfig(config),dates=orderedDates(c,anchor,selected),sorted=[...dates].sort();
 const step=Math.max(-dateDistance(c.start,sorted[0]),Math.min(dateDistance(sorted.at(-1),c.end),delta));
 return {anchor:shiftDate(sorted[0],step),selectedDates:selected.length?dates.map(d=>shiftDate(d,step)):[],moved:step!==0};
}
export function installTimetableGestures(element,{getState,onZoom,onPan}){
 let horizontal=0,startHeight=18;
 function wheel(e){const s=getState();
  if(e.ctrlKey){e.preventDefault();onZoom(slotZoom(s.slotHeight,Math.exp(-e.deltaY*.007)),e.clientY);return}
  const dx=e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX;
  if(!dx||!e.shiftKey&&Math.abs(dx)<=Math.abs(e.deltaY))return;
  const max=element.scrollWidth-element.clientWidth,room=dx<0?element.scrollLeft>1:element.scrollLeft<max-1;
  if(room)return;
  e.preventDefault();horizontal+=dx;
  if(Math.abs(horizontal)<45)return;
  const next=panDates(s.config,s.anchor,s.selectedDates,horizontal>0?1:-1);horizontal=0;if(next.moved)onPan(next);
 }
 function gestureStart(e){e.preventDefault();startHeight=getState().slotHeight}
 function gestureChange(e){e.preventDefault();onZoom(slotZoom(startHeight,e.scale||1),e.clientY)}
 element.addEventListener('wheel',wheel,{passive:false});
 element.addEventListener('gesturestart',gestureStart,{passive:false});
 element.addEventListener('gesturechange',gestureChange,{passive:false});
 return ()=>{element.removeEventListener('wheel',wheel);element.removeEventListener('gesturestart',gestureStart);element.removeEventListener('gesturechange',gestureChange)};
}
