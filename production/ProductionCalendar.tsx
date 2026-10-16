import {productionTaskView,updateProductionTasks} from './taskAggregation';
import {productionMembers} from './people-model.js';
import {ProjectWorkspace} from './ProjectWorkspace';
import type {Workspace,Project,Schedule} from './data';
export function productionCalendarView(w:Workspace,id:string){
 const view=productionTaskView(w,id),origins=new Map<string,{projectId:string|null,id:string}>(),sources={...view.sources},colors={...view.colors};
 const schedules:Schedule[]=[];
 for(const [key,origin] of view.origins)if(!origin.projectId)sources[key]='';
 function append(s:Schedule,projectId:string|null,label:string){if((s as any).calendarExcluded)return;const key=JSON.stringify([projectId,s.id]);origins.set(key,{projectId,id:s.id});sources[key]=label;colors[key]=w.projects.find(p=>p.id===projectId)?.iconColor||w.productions.find(p=>p.id===id)?.iconColor||"#444444";schedules.push({...s,id:key,taskId:s.taskId?JSON.stringify([projectId,s.taskId]):''})}
 for(const s of (w.timetableSchedules||[]).filter(s=>s.productionId===id&&!(s as any).calendarExcluded)){const key=JSON.stringify(['standalone',s.id]);origins.set(key,{projectId:null,id:s.id,standalone:true});sources[key]='';schedules.push({...s,id:key})}
 const production=w.productions.find(g=>g.id===id)!;
 (production.schedules||[]).forEach(s=>append(s,null,''));
 w.projects.filter(p=>p.productionId===id).forEach(p=>p.schedules.forEach(s=>append(s,p.id,p.name)));
 return {...view,sources,colors,origins,project:{...view.project,schedules}};
}
export function updateProductionCalendar(w:Workspace,id:string,fn:(p:Project)=>Project){
 const view=productionCalendarView(w,id),next=fn(view.project);
 let result=updateProductionTasks(w,id,p=>({...p,tasks:next.tasks}));
 const own:Schedule[]=[],standalone:Workspace["timetableSchedules"]=[],byProject=new Map<string,Schedule[]>();w.projects.filter(p=>p.productionId===id).forEach(p=>byProject.set(p.id,[]));
 for(const s of next.schedules){const origin=view.origins.get(s.id);let taskId=s.taskId||'';if(taskId){try{const pair=JSON.parse(taskId);if(Array.isArray(pair))taskId=pair[1]}catch{}}
 const actual={...s,id:origin?.id||s.id,taskId};if(origin?.standalone)standalone.push(actual as any);else if(origin?.projectId)byProject.get(origin.projectId)!.push(actual);else own.push(actual)}
 return {...result,timetableSchedules:[...(w.timetableSchedules||[]).filter(s=>s.productionId!==id||(s as any).calendarExcluded),...standalone],productions:result.productions.map(g=>g.id===id?{...g,schedules:[...(g.schedules||[]).filter((s:any)=>s.calendarExcluded),...own]}:g),projects:result.projects.map(p=>byProject.has(p.id)?{...p,schedules:[...p.schedules.filter((s:any)=>s.calendarExcluded),...byProject.get(p.id)!]}:p)};
}
export function ProductionCalendar({workspace:w,productionId:id,onChange,onAddMember}:{workspace:Workspace;productionId:string;onChange:(fn:(w:Workspace)=>Workspace)=>void;onAddMember:(name:string)=>void}){
 const view=productionCalendarView(w,id),production=w.productions.find(g=>g.id===id)!;
 return <ProjectWorkspace key={id} project={view.project} members={productionMembers(w,production)} allowMemberAdd={false} taskStageOptions={view.stageOptions} taskStageGroups={view.stageGroups} taskMemberOptions={view.memberOptions} stageOptions={['기획','진행','검토','완료']} taskSources={view.sources} itemColors={view.colors} hideNavigation section="schedule" onSectionChange={()=>{}} onAddMember={onAddMember} onChange={fn=>onChange(w=>updateProductionCalendar(w,id,fn))}/>;
}
