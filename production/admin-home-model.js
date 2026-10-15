import {projectEntries} from './project-structure.js';
export function localDay(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function weekRange(day){const d=new Date(day+'T12:00:00'),offset=(d.getDay()+6)%7,start=new Date(d);start.setDate(start.getDate()-offset);const end=new Date(start);end.setDate(end.getDate()+6);return {start:localDay(start),end:localDay(end)}}
export function adminHomeData(w,{today=localDay(),period='today',productionId='',mine=false,memberId='',memberName=''}={}){const week=weekRange(today),start=period==='week'?week.start:today,end=period==='week'?week.end:today,projects=(w.projects||[]).filter(p=>!p.deleted&&(!productionId||p.productionId===productionId||p.id===productionId)),groups=(w.productions||[]).filter(g=>!g.deleted&&(!productionId||g.id===productionId)),tasks=[],allTasks=[],allSchedules=[],schedules=[],seen=new Set();for(const [kind,owners] of [['project',projects],['production',groups]])for(const owner of owners){const origin={projectId:kind==='project'?owner.id:'',productionId:kind==='project'?owner.productionId:owner.id,label:owner.name||owner.title||'',kind};for(const task of owner.tasks||[])if(!task.deleted){const row={...origin,...task,origin,key:kind+':'+owner.id+':'+task.id};allTasks.push(row);if(!task.done)tasks.push(row)};for(const stored of owner.schedules||[]){if(stored.deleted)continue;const schedule=stored.projectLinked?{...stored,title:owner.name,endDate:owner.due||stored.endDate}:stored;const key=kind+':'+owner.id+':'+schedule.id;seen.add(key);const row={...origin,...schedule,done:schedule.done===true||(owner.tasks||[]).find(t=>t.id===schedule.taskId)?.done?true:schedule.done,origin,key};allSchedules.push(row);schedules.push(row)}}
 for(const s of w.timetableSchedules||[]){const p=projects.find(p=>p.id===s.projectId);if(s.deleted||productionId&&(s.productionId||p?.productionId)!==productionId&&s.projectId!==productionId)continue;if(s.projectId&&!p)continue;const key='standalone:'+s.id;if(!seen.has(key)){seen.add(key);const row={...s,key,origin:{projectId:s.projectId||'',productionId:s.productionId||'',label:p?.name||s.title||'일정',kind:'standalone'}};schedules.push(row);allSchedules.push(row)}}
 const filteredTasks=tasks.filter(t=>!mine||((memberId&&(t.ownerId||t.owner)===memberId)||(memberName&&t.owner===memberName))),sort=(a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||(a.title||'').localeCompare(b.title||'','ko'),active=projectEntries(w).filter(p=>(!productionId||p.id===productionId)&&!['완료','취소'].includes(p.status)).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
 return {start,end,active,allTasks:allTasks.sort(sort),allSchedules:allSchedules.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.startTime||'').localeCompare(b.startTime||'')),tasks:filteredTasks.filter(t=>period==='all'||period==='week'&&t.flagged||t.due>=start&&t.due<=end).sort(sort),overdue:filteredTasks.filter(t=>t.due&&t.due<today).sort(sort),unassigned:tasks.filter(t=>!(t.ownerId||t.owner)),upcoming:active.filter(p=>p.due&&p.due>=today&&p.due<=week.end),overdueProjects:active.filter(p=>p.due&&p.due<today),schedules:schedules.filter(s=>period==='all'||s.date<=end&&(s.endDate||s.date)>=start).sort((a,b)=>a.date.localeCompare(b.date)||(a.startTime||'').localeCompare(b.startTime||'')),productions:groups}}
export function completeHomeTask(w,row,done){const key=row.origin.kind==='project'?'projects':'productions',id=row.origin.projectId||row.origin.productionId;return {...w,[key]:w[key].map(owner=>owner.id===id?{...owner,tasks:owner.tasks.map(t=>t.id===row.id?{...t,done}:t)}:owner)}}

// All-day events remain visible through their final date; timed events end at endTime (or startTime).
export function upcomingSchedulePreview(rows,now=new Date(),limit=5){
 const today=localDay(now),time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
 return rows.filter(s=>{if(s.done)return false;if(s.done===false)return true;const day=s.endDate||s.date;if(!day)return true;if(day!==today)return day>today;const end=s.endTime||s.startTime;return !end||end>time}).slice(0,limit);
}

export function completeHomeSchedule(w,row,done){
 if(row.taskId){const task={...row,id:row.taskId};w=completeHomeTask(w,task,done)}
 if(row.origin.kind==='standalone')return {...w,timetableSchedules:(w.timetableSchedules||[]).map(s=>s.id===row.id?{...s,done}:s)};
 const key=row.origin.kind==='project'?'projects':'productions',id=row.origin.projectId||row.origin.productionId;
 return {...w,[key]:w[key].map(owner=>owner.id===id?{...owner,schedules:(owner.schedules||[]).map(s=>s.id===row.id?{...s,done}:s)}:owner)}
}

export function scheduleCompleted(row,now=new Date()){
 if(typeof row.done==='boolean')return row.done;
 const today=localDay(now),end=row.endDate||row.date;if(!end)return false;if(end!==today)return end<today;
 const time=row.endTime||row.startTime;return !!time&&time<=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
}
