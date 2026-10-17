import {changeRepeating} from './recurrence.js';
export const ownerKey=(kind,id)=>kind+':'+id;
export function scheduleOwners(w,productionId=''){
 return [...(w.productions||[]).filter(p=>!p.deleted&&(!productionId||p.id===productionId)).map(p=>({id:ownerKey('production',p.id),ownerId:p.id,label:p.name,kind:'production',templates:p.scheduleTemplates||[],color:p.iconColor||'#444444'})),...(w.projects||[]).filter(p=>!p.deleted&&(!productionId||p.productionId===productionId)).map(p=>({id:ownerKey('project',p.id),ownerId:p.id,label:[(w.productions||[]).find(g=>g.id===p.productionId)?.name,p.name||p.title].filter(Boolean).join(' / ')+(p.groupType==='event'?' · 행사':''),kind:'project',templates:p.scheduleTemplates||[],color:p.iconColor||(w.productions||[]).find(g=>g.id===p.productionId)?.iconColor||'#444444'}))];
}
export function saveOwnedSchedule(w,key,schedule,previousKey=key,scope='one'){
 const split=k=>{const at=k.indexOf(':');return [k.slice(0,at),k.slice(at+1)]},[kind,id]=split(key),collection=kind==='production'?'productions':'projects';
 if(!w[collection]?.some(p=>p.id===id))throw Error('일정을 저장할 프로젝트를 선택하세요.');
 let next=w;
 if(previousKey!==key){if(schedule.repeat||schedule.repeatBaseId)throw Error('반복 일정은 원래 프로젝트에서 수정하세요.');const [oldKind,oldId]=split(previousKey),oldCollection=oldKind==='production'?'productions':'projects';next={...next,[oldCollection]:next[oldCollection].map(p=>p.id===oldId?{...p,schedules:(p.schedules||[]).filter(s=>s.id!==schedule.id)}:p)}}
 return {...next,[collection]:next[collection].map(p=>p.id===id?{...p,schedules:(p.schedules||[]).some(s=>s.id===(schedule.repeatBaseId||schedule.id))?changeRepeating(p.schedules,schedule,schedule,scope):[...(p.schedules||[]),schedule]}:p)};
}
export function upgradeSchedule(w,key,item,groupId=crypto.randomUUID()){
 const at=key.indexOf(':'),kind=key.slice(0,at),id=key.slice(at+1),list=kind==='production'?'productions':'projects',standalone=kind==='standalone',owner=standalone?(w.timetableSchedules||[]).find(s=>s.id===id):w[list]?.find(p=>p.id===id),productionId=kind==='production'?id:owner?.productionId;
 if(!owner||!productionId)throw Error('프로젝트 안의 일정에서 행사 그룹을 만들 수 있습니다.');
 if(item.eventGroupId)return w;
 const original=standalone?owner:(owner.schedules||[]).find(s=>s.id===(item.repeatBaseId||item.id));if(!original)throw Error('원본 일정을 찾을 수 없습니다.');
 const {_ownerKey,...edited}=item,source={...original,...edited,id:original.id};
 if(source.repeat||item.repeatBaseId)throw Error('반복 일정은 반복을 해제한 뒤 행사 그룹으로 전환하세요.');
 const group={id:groupId,productionId,groupType:'event',name:source.title,icon:'calendar',iconColor:source.color||owner.iconColor,status:'기획 중',due:source.endDate||source.date,eventScheduleId:source.id,description:source.note||'',tasks:[],schedules:[{...source,eventGroupId:groupId}],assets:[],feedback:[],customTabs:[],teamIds:[]};
 const next=standalone?{...w,timetableSchedules:w.timetableSchedules.filter(s=>s.id!==id)}:{...w,[list]:w[list].map(p=>p.id===id?{...p,schedules:(p.schedules||[]).filter(s=>s.id!==source.id)}:p)};
 const previous=JSON.stringify([kind,standalone?'':id,source.id]),replacement=JSON.stringify(['project',groupId,source.id]),relink=p=>({...p,...(p.customTabs?{customTabs:p.customTabs.map(t=>({...t,modules:t.modules.map(m=>m.scheduleKeys?{...m,scheduleKeys:m.scheduleKeys.map(k=>k===previous?replacement:k)}:m)}))}:{})});
 return {...next,productions:next.productions.map(relink),projects:[...next.projects.map(relink),group]};
}
export function syncEventGroups(w,previous){return {...w,projects:(w.projects||[]).map(p=>{if(p.groupType!=='event')return p;const s=(p.schedules||[]).find(s=>s.id===p.eventScheduleId);if(!s)return p;const old=previous?.projects.find(g=>g.id===p.id),before=old?.schedules.find(v=>v.id===p.eventScheduleId),changed=before?{...s,...(p.due&&old.due!==p.due&&before.endDate===s.endDate?{endDate:p.due,date:p.due<s.date?p.due:s.date}:{}),...(old.name!==p.name&&before.title===s.title?{title:p.name}:{}),...(old.description!==p.description&&before.note===s.note?{note:p.description}:{})}:s;return {...p,due:changed.endDate||changed.date,name:changed.title,description:changed.note||'',schedules:p.schedules.map(v=>v.id===changed.id?changed:v)}})};}
// Templates contain structure, never live file references, people, permissions or completion records.
export function groupTemplate(group,name){
 const clean=m=>{const copy={...m};for(const key of ['source','importSource','dataModuleId','projectId','config','files','groups','rows','planData','scheduleKeys'])delete copy[key];if(copy.items)copy.items=copy.items.map(i=>({...i,done:false}));return copy};
 return {id:crypto.randomUUID(),name,sourceOwnerId:group.id,sourceTabIds:(group.customTabs||[]).map(t=>t.id),description:group.description||'',icon:group.icon,iconColor:group.iconColor,categoryId:group.categoryId,customTabs:(group.customTabs||[]).map(t=>({...t,modules:(t.modules||[]).map(clean)})),tasks:(group.tasks||[]).map(t=>({title:t.title,stage:t.stage,priority:t.priority,description:t.description})),scheduleProperties:(group.scheduleTemplates||[]).map(t=>({...t}))};
}
export function applyGroupTemplate(group,template){if(!template)return group;const ids=new Map(),id=old=>{if(!ids.has(old))ids.set(old,crypto.randomUUID());return ids.get(old)};for(const t of template.customTabs||[]){id(t.id);for(const m of t.modules||[]){id(m.id);for(const s of m.columnSlots||[])id(s)}}return {...group,description:template.description||'',icon:template.icon,iconColor:template.iconColor,categoryId:template.categoryId,customTabs:(template.customTabs||[]).map(t=>({...t,id:id(t.id),modules:t.modules.map(m=>({...m,id:id(m.id),...(m.parentSlot?{parentSlot:id(m.parentSlot)}:{}),...(m.columnSlots?{columnSlots:m.columnSlots.map(id)}:{}),...(m.columnId?{columnId:id(m.columnId)}:{}),...(m.items?{items:m.items.map(i=>({...i,id:crypto.randomUUID(),done:false}))}:{})}))})),tasks:(template.tasks||[]).map(t=>({...t,id:crypto.randomUUID(),done:false,due:'',owner:'미지정',ownerId:'',priority:t.priority||'보통'})),scheduleTemplates:structuredClone(template.scheduleProperties||[])};}
