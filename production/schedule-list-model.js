import {changeRepeating} from './recurrence.js';
// Lists store origin keys, never copies of schedules. Calendar edits stay authoritative.
export function scheduleRows(workspace,{productionId='',projectIds=[]}={}) {
  const parents=(workspace.productions||[]).filter(p=>!p.deleted&&(!productionId&&!projectIds.length||p.id===productionId));
  const projects=(workspace.projects||[]).filter(p=>!p.deleted&&(productionId?p.productionId===productionId:!projectIds.length||projectIds.includes(p.id)));
  const rows=[];
  for(const [kind,owners] of [['production',parents],['project',projects]])for(const owner of owners)
    for(const s of owner.schedules||[])if(!s.deleted)rows.push({...s,
      title:s.projectLinked?(owner.name||owner.title):s.title,
      endDate:s.projectLinked?owner.due||s.endDate:s.endDate,
      key:JSON.stringify([kind,owner.id,s.id]),origin:{kind,ownerId:owner.id,id:s.id},ownerName:owner.name||owner.title});
  for(const s of workspace.timetableSchedules||[])if(!s.deleted&&(productionId?s.productionId===productionId:!projectIds.length||projectIds.includes(s.projectId)))
    rows.push({...s,key:JSON.stringify(['standalone','',s.id]),origin:{kind:'standalone',ownerId:'',id:s.id},ownerName:'일정'});
  return rows.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.startTime||'').localeCompare(b.startTime||'')||a.key.localeCompare(b.key));
}
export function updateListedSchedule(workspace,origin,update,scope='all') {
  if(origin.kind==='standalone')return {...workspace,timetableSchedules:(workspace.timetableSchedules||[]).map(s=>s.id===origin.id?{...s,...update,id:s.id}:s)};
  const key=origin.kind==='production'?'productions':'projects';
  return {...workspace,[key]:workspace[key].map(owner=>{
    if(owner.id!==origin.ownerId)return owner;
    const linked=(owner.schedules||[]).find(s=>s.id===origin.id)?.projectLinked;
    return {...owner,...(linked?{due:update.endDate||owner.due,description:update.note??owner.description}:{}),schedules:changeRepeating(owner.schedules||[],{...(owner.schedules||[]).find(s=>s.id===origin.id),repeatBaseId:origin.id,repeatDate:(owner.schedules||[]).find(s=>s.id===origin.id)?.date},update,scope)};
  })};
}
export function addListedSchedule(workspace,{productionId='',projectId=''},schedule) {
  const kind=productionId?'production':'project',ownerId=productionId||projectId,key=productionId?'productions':'projects';
  if(!ownerId||!workspace[key].some(p=>p.id===ownerId))throw Error('프로젝트를 선택하세요');
  return {workspace:{...workspace,[key]:workspace[key].map(p=>p.id===ownerId?{...p,schedules:[...(p.schedules||[]),schedule]}:p)},key:JSON.stringify([kind,ownerId,schedule.id])};
}
