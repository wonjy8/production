// Civil dates in UTC: recurrence never depends on DST or the browser's timezone.
import { calendarDate, shiftCalendarDate } from './calendar-drag.js';
const dayMs=86400000;
export const repeatFrequencies=['daily','weekly','monthly','yearly'];
export const baseId=item=>item.repeatBaseId||item.id;
const keyFor=item=>item.date!==undefined?'date':'due';
const days=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/dayMs);
export function repeatRule(value,anchor){
 if(!value?.frequency)return undefined;
 if(!repeatFrequencies.includes(value.frequency)||!calendarDate(anchor))throw Error('반복 시작 날짜를 입력하세요.');
 const interval=Number(value.interval??1);
 if(!Number.isInteger(interval)||interval<1||interval>999)throw Error('반복 간격은 1~999 사이의 정수로 입력하세요.');
 if(value.until&&(!calendarDate(value.until)||value.until<anchor))throw Error('반복 종료일은 시작일 이후여야 합니다.');
 return {...value,frequency:value.frequency,interval,until:value.until||''};
}
function dateAt(anchor,frequency,interval,n){
 if(frequency==='once')return anchor;
 if(frequency==='daily'||frequency==='weekly'){const date=shiftCalendarDate(anchor,n*interval*(frequency==='weekly'?7:1));return calendarDate(date)?date:'9999-12-32';}
 const d=new Date(anchor+'T12:00:00Z'),months=n*interval*(frequency==='yearly'?12:1),y=d.getUTCFullYear(),m=d.getUTCMonth()+months;
 if(y+Math.floor(m/12)>9999)return '9999-12-32';
 const last=new Date(Date.UTC(y,m+1,0,12)).getUTCDate();
 return new Date(Date.UTC(y,m,Math.min(d.getUTCDate(),last),12)).toISOString().slice(0,10);
}
function clean(item){const {repeatBaseId,repeatDate,repeat,...rest}=item;return rest;}
export function repeatAt(base,at){const segment=(base.repeat?.segments||[]).filter(s=>s.from<=at).sort((a,b)=>a.from.localeCompare(b.from)).at(-1);return segment?.rule||base.repeat;}
export function sameRepeat(a,b){return JSON.stringify([a?.frequency==='once'?'':a?.frequency||'',a?.interval||1,a?.until||''])===JSON.stringify([b?.frequency==='once'?'':b?.frequency||'',b?.interval||1,b?.until||'']);}
function occurrence(base,at,patch={}){
 const field=keyFor(base),start=base[field],duration=base.endDate&&calendarDate(start)?days(start,base.endDate):0;
 const rule=repeatAt(base,at),repeat=rule&&rule.frequency!=='once'?{...base.repeat,frequency:rule.frequency,interval:rule.interval,until:rule.until}:undefined;
 return {...base,repeat,[field]:at,...(field==='date'?{endDate:shiftCalendarDate(at,duration)}:{}),...patch,
   id:base.id+'::repeat::'+at,repeatBaseId:base.id,repeatDate:at};
}
export function expandRepeats(items,from,to,options={}){
 const result=[];
 for(const base of items||[]){
  const field=keyFor(base),anchor=base[field];
  if(!base.repeat?.frequency||!calendarDate(anchor)){result.push(base);continue;}
  let accepted=0;
  const original=base.repeat,segments=[{from:anchor,patch:{},rule:original},...(original.segments||[]).filter(s=>s.from>=anchor).sort((a,b)=>a.from.localeCompare(b.from))];
  const exceptions=original.exceptions||{},emitted=new Set();
  for(let index=0;index<segments.length;index++){
   if(options.limit&&accepted>=options.limit)break;
   const segment=segments[index],end=segments[index+1]?.from,rule=segment.rule||original;
   const effective={...base,...segment.patch},origin=effective[field]!==anchor?effective[field]:segment.from;
   if(segment.deleted||!calendarDate(origin))continue;
   const duration=field==='date'&&effective.endDate?Math.max(0,days(effective[field],effective.endDate)):0;
   const lower=shiftCalendarDate(from,-duration);
   const rough=rule.frequency==='once'?0:rule.frequency==='daily'?days(origin,lower)/rule.interval:rule.frequency==='weekly'?days(origin,lower)/(rule.interval*7):((Number(lower.slice(0,4))-Number(origin.slice(0,4)))*12+Number(lower.slice(5,7))-Number(origin.slice(5,7)))/(rule.interval*(rule.frequency==='yearly'?12:1));
   for(let n=Math.max(0,Math.floor(rough)-2),count=0;count<5000+Object.keys(exceptions).length;n++,count++){
    if(rule.frequency==='once'&&n>0)break;
    const at=dateAt(origin,rule.frequency,rule.interval||1,n);
    if(at>to||rule.until&&at>rule.until||end&&at>=end)break;
    if(at<segment.from)continue;
    const patch=exceptions[at];if(patch?.deleted)continue;
    const item=occurrence(effective,at,patch||{});emitted.add(at);
    if(item[field]<=to&&(item.endDate||item[field])>=from&&(!options.pendingOnly||!item.done)){result.push(item);if(!options.pendingOnly||item[field]===at)accepted++;if(options.limit&&accepted>=options.limit)break;}
   }
  }
  // Individually moved occurrences can cross the visible window's boundary.
  for(const [at,patch] of Object.entries(exceptions))if(!emitted.has(at)&&!patch.deleted){
   const item=occurrence(base,at,patch);if(item[field]<=to&&(item.endDate||item[field])>=from&&(!options.pendingOnly||!item.done))result.push(item);
  }
 }
 return result;
}
export function taskOccurrences(items,today){
 const out=[];
 for(const base of items||[]){
  if(!base.repeat?.frequency){out.push(base);continue;}
  // Only one pending occurrence per series in lists; completed occurrences remain in history.
  const completed=Object.entries(base.repeat.exceptions||{}).filter(([,v])=>v.done&&!v.deleted).map(([at,patch])=>occurrence(base,at,patch));
  out.push(...completed);
  const start=base.due;if(!calendarDate(start))continue;
  const pending=expandRepeats([base],start,'9999-12-31',{pendingOnly:true,limit:1}).sort((a,b)=>a.due.localeCompare(b.due))[0];
  if(pending)out.push(pending);
 }
 return out;
}
export function changeRepeating(items,item,patch,scope='one',remove=false){
 const id=baseId(item),base=items.find(i=>i.id===id);if(!base)return remove?items:[...items,cleanWithRepeat({...item,...patch})];
 if(!base.repeat?.frequency||!item.repeatDate){return remove?items.filter(i=>i.id!==id):items.map(i=>i.id===id?cleanWithRepeat({...base,...patch,id}):i);}
 const at=item.repeatDate,field=keyFor(base),repeat={...base.repeat};
 const requestedRule=Object.prototype.hasOwnProperty.call(patch,'repeat')?patch.repeat:repeatAt(base,at);
 const previousSegment=[...(repeat.segments||[])].sort((a,b)=>a.from.localeCompare(b.from)).filter(s=>s.from<=at).at(-1);
 const previous=occurrence({...base,...previousSegment?.patch},at,repeat.exceptions?.[at]||{});
 const changed=Object.fromEntries(Object.entries(clean(patch)).filter(([key,value])=>key!=='id'&&JSON.stringify(value)!==JSON.stringify(previous[key])));
 let next=base;
 if(scope==='all'){
  if(remove)return items.filter(i=>i.id!==id);
  const shift=patch[field]&&calendarDate(patch[field])?days(previous[field],patch[field]):0;
  const content={...changed};
  if(content[field])content[field]=shiftCalendarDate(base[field],shift);
  if(field==='date'&&patch.endDate)content.endDate=shiftCalendarDate(content[field]||base[field],days(patch[field]||item[field],patch.endDate));
  const rule=requestedRule?{...repeat,frequency:requestedRule.frequency,interval:requestedRule.interval,until:requestedRule.until}:undefined;
  if(rule){const ordinary={...content};delete ordinary[field];delete ordinary.endDate;rule.exceptions=Object.fromEntries(Object.entries(repeat.exceptions||{}).map(([key,value])=>[key,{...value,...ordinary}]));rule.segments=(repeat.segments||[]).map(segment=>({...segment,patch:{...segment.patch,...ordinary},rule:{...segment.rule,frequency:rule.frequency,interval:rule.interval,until:rule.until}}));}
  if(rule&&shift){rule.exceptions=Object.fromEntries(Object.entries(rule.exceptions||{}).map(([key,value])=>[shiftCalendarDate(key,shift),{...value,...(value[field]?{[field]:shiftCalendarDate(value[field],shift)}:{}),...(value.endDate?{endDate:shiftCalendarDate(value.endDate,shift)}:{})}]));rule.segments=(rule.segments||[]).map(s=>({...s,from:shiftCalendarDate(s.from,shift),patch:{...s.patch,...(s.patch?.[field]?{[field]:shiftCalendarDate(s.patch[field],shift)}:{}),...(s.patch?.endDate?{endDate:shiftCalendarDate(s.patch.endDate,shift)}:{})}}));}
  next={...base,...content,repeat:rule};
 }else if(scope==='future'){
  const content={...changed};
  content[field]=patch[field]||previous[field];if(field==='date')content.endDate=patch.endDate||previous.endDate;
  const segments=(repeat.segments||[]).filter(s=>s.from<at);
  segments.push({from:at,patch:content,rule:requestedRule?{frequency:requestedRule.frequency,interval:requestedRule.interval,until:requestedRule.until}:{frequency:'once',interval:1},deleted:remove});
  next={...base,repeat:{...repeat,segments,exceptions:Object.fromEntries(Object.entries(repeat.exceptions||{}).filter(([key])=>key<at))}};
 }else{
  const content=clean(patch);delete content.id;
  next={...base,repeat:{...repeat,exceptions:{...repeat.exceptions,[at]:remove?{deleted:true}:{...(repeat.exceptions?.[at]||{}),...content}}}};
 }
 return items.map(i=>i.id===id?next:i);
}
function cleanWithRepeat(item){const {repeatBaseId,repeatDate,...rest}=item;return rest;}

export function readRepeat(data,anchor,previous){return repeatRule({...previous,frequency:String(data.get("repeatFrequency")||""),interval:Number(data.get("repeatInterval")||1),until:String(data.get("repeatUntil")||"")},anchor)}
