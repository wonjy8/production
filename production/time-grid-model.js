import {minutes,timeLabel,shiftDate,dateDistance} from './timetable-model.js';
export function moveGridItem(item,targetDate,targetMinute){
 const delta=dateDistance(item.date,targetDate),a=minutes(item.startTime),b=minutes(item.endTime);
 if(a===null||b===null)return {date:targetDate,endDate:shiftDate(item.endDate||item.date,delta)};
 const duration=dateDistance(item.date,item.endDate||item.date)*1440+b-a,start=Math.max(0,Math.min(item.kind==='task'?1440-duration:1430,Math.round(targetMinute/10)*10)),end=start+duration;
 return {date:targetDate,endDate:shiftDate(targetDate,Math.floor((end-1)/1440)),startTime:timeLabel(start),endTime:timeLabel(end%1440||1440)};
}
export function gridTicks(start,end,height){const step=height/((end-start)/60)<28?120:60;return Array.from({length:Math.ceil((end-start)/60)},(_,i)=>start+i*60).map(minute=>({minute,label:(minute-start)%step===0?timeLabel(minute):''}));}
