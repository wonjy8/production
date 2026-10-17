import {scheduleOwners,upgradeSchedule,syncEventGroups} from './event-groups.js';
import {productionTaskView,updateProductionTasks} from './taskAggregation';
import {productionMembers} from './people-model.js';
import {ProjectWorkspace} from './ProjectWorkspace';
import type {Workspace,Project,Schedule} from './data';
export function productionCalendarView(w:Workspace,id:string){
 const view=productionTaskView(w,id),origins=new Map<string,{projectId:string|null,id:string}>(),sources={...view.sources},colors={...view.colors};
 const schedules:Schedule[]=[];
 for(const [key,origin] of view.origins)if(!origin.projectId)sources[key]='';
 function append(s:Schedule,projectId:string|null,label:string){if((s as any).calendarExcluded)return;const key=JSON.stringify([projectId,s.id]);origins.set(key,{projectId,id:s.id});sources[key]=label;colors[key]=w.projects.find(p=>p.id===projectId)?.iconColor||w.productions.find(p=>p.id===id)?.iconColor||"#444444";schedules.push({...s,id:key,taskId:s.taskId?JSON.stringify([projectId,s.taskId]):''})}
 for(const s of (w.timetableSchedules||[]).filter(s=>s.productionId===id&&!(s as any).calendarExcluded)){const key=JSON.stringify(['standalone',s.id]);origins.set(key,{projectId:null,id:s.id,standalone:true});sources[key]='';colors[key]=s.color||w.productions.find(g=>g.id===id)?.iconColor||'#444444';schedules.push({...s,id:key})}
 const production=w.productions.find(g=>g.id===id)!;
 (production.schedules||[]).forEach(s=>append(s,null,''));
 w.projects.filter(p=>p.productionId===id).forEach(p=>p.schedules.forEach(s=>append(s,p.id,p.name)));
 return {...view,sources,colors,origins,taskOrigins:view.origins,project:{...view.project,schedules}};
}
export function updateProductionCalendar(w:Workspace,id:string,fn:(p:Project)=>Project){
 const view=productionCalendarView(w,id),next=fn(view.project);
 let result=updateProductionTasks(w,id,p=>({...p,tasks:next.tasks}));
 const own:Schedule[]=[],standalone:Workspace["timetableSchedules"]=[],byProject=new Map<string,Schedule[]>();w.projects.filter(p=>p.productionId===id).forEach(p=>byProject.set(p.id,[]));
 for(const s of next.schedules){const origin=view.origins.get(s.id);let taskId=s.taskId||'';if(taskId){try{const pair=JSON.parse(taskId);if(Array.isArray(pair))taskId=pair[1]}catch{}}
 const {_ownerKey,...stored}=s as any,actual={...stored,id:origin?.id||s.id,taskId};const target=_ownerKey?.startsWith('project:')?_ownerKey.slice(8):_ownerKey?.startsWith('production:')?null:origin?.projectId;if(origin?.standalone&&!_ownerKey)standalone.push(actual as any);else if(target&&byProject.has(target))byProject.get(target)!.push(actual);else own.push(actual)}
 return {...result,timetableSchedules:[...(w.timetableSchedules||[]).filter(s=>s.productionId!==id||(s as any).calendarExcluded),...standalone],productions:result.productions.map(g=>g.id===id?{...g,schedules:[...(g.schedules||[]).filter((s:any)=>s.calendarExcluded),...own]}:g),projects:result.projects.map(p=>byProject.has(p.id)?{...p,schedules:[...p.schedules.filter((s:any)=>s.calendarExcluded),...byProject.get(p.id)!]}:p)};
}
export function ProductionCalendar({workspace:w,productionId:id,onChange,onAddMember,ownerId='',section='schedule',preferences,onPreferences}:any){
 const view=productionCalendarView(w,id),production=w.productions.find((g:any)=>g.id===id)!,owner=ownerId?w.projects.find((p:any)=>p.id===ownerId):production;
 const ownerKey=ownerId?'project:'+ownerId:'production:'+id,origins:any={};
 for(const [key,origin] of [...view.taskOrigins,...view.origins])origins[key]=origin.projectId?'project:'+origin.projectId:'production:'+id;
 function updateOwner(field:string,value:any){onChange((old:any)=>({...old,[ownerId?'projects':'productions']:old[ownerId?'projects':'productions'].map((p:any)=>p.id===owner.id?{...p,[field]:value}:p)}))}
 const context={sources:scheduleOwners(w,id),ownerKey,origins,value:preferences||owner.calendarPreferences||{},onPreferences:onPreferences||((v:any)=>updateOwner('calendarPreferences',v)),templates:owner.scheduleTemplates||[],onTemplates:(v:any,key=ownerKey)=>onChange((old:any)=>{const at=key.indexOf(':'),collection=key.slice(0,at)==='production'?'productions':'projects';return {...old,[collection]:old[collection].map((p:any)=>p.id===key.slice(at+1)?{...p,scheduleTemplates:v}:p)}}),canEdit:(item:any,kind:string)=>{const key=origins[item.repeatBaseId||item.id]||ownerKey,sourceId=key.slice(key.indexOf(':')+1),source=[...w.productions,...w.projects].find((p:any)=>p.id===sourceId);return !(globalThis as any).productionCompletionPolicy?.locked(w,source)&&(window as any).accountCan?.(sourceId,kind==='task'?'tasks':'schedule','edit')!==false},onUpgrade:(item:any)=>{const origin=view.origins.get(item.repeatBaseId||item.id);if(!origin)return;onChange((old:any)=>upgradeSchedule(old,origin.standalone?'standalone:'+origin.id:origins[item.repeatBaseId||item.id],{...item,id:origin.id,repeatBaseId:item.repeatBaseId?origin.id:undefined}))}};
 return <ProjectWorkspace key={owner.id+':'+section} calendarContext={context} project={{...view.project,id:owner.id,name:owner.name,iconColor:owner.iconColor||production.iconColor}} members={productionMembers(w,production)} allowMemberAdd={false} taskStageOptions={view.stageOptions} taskStageGroups={view.stageGroups} taskMemberOptions={view.memberOptions} stageOptions={['기획','진행','검토','완료']} taskSources={view.sources} itemColors={view.colors} hideNavigation section={section} onSectionChange={()=>{}} onAddMember={onAddMember} onChange={(fn:any)=>onChange((old:any)=>syncEventGroups(updateProductionCalendar(old,id,p=>{const next=fn({...p,id:owner.id,name:owner.name});return {...next,tasks:next.tasks.map((t:any)=>!p.tasks.some((v:any)=>v.id===t.id)?{...t,_ownerKey:ownerKey}:t),schedules:next.schedules.map((s:any)=>!p.schedules.some((v:any)=>v.id===s.id)?{...s,_ownerKey:s._ownerKey||ownerKey}:s)}})))}/>;
}
