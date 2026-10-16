/* Shared UI/worker policy. The NAS repeats these checks authoritatively. */
(()=>{
 const owners=w=>[...(w.productions||[]),...(w.projects||[])];
 const locked=(w,p)=>p?.status==='완료'||(w.productions||[]).some(g=>g.id===p?.productionId&&g.status==='완료');
 function clean(p,allowed){const entries=Object.entries(p).filter(([k])=>!allowed.includes(k)).sort(([a],[b])=>a.localeCompare(b));return JSON.stringify(Object.fromEntries(entries))}
 function validate(before,after){
  const next=new Map(owners(after).map(p=>[p.id,p]));
  for(const old of owners(before))if(locked(before,old)){
   const item=next.get(old.id),allowed=old.status==='완료'&&!(before.productions||[]).some(p=>p.id===old.productionId&&p.status==='완료')?['status','updatedAt','completionRequested']:[];
   if(!item||clean(old,allowed)!==clean(item,allowed))throw Error('완료된 프로젝트는 읽기 전용입니다. 먼저 다시 진행으로 전환하세요.');
  }
  const oldIds=new Set(owners(before).map(p=>p.id)),parents=new Set((before.productions||[]).filter(p=>p.status==='완료').map(p=>p.id));
  for(const p of owners(after)){
   if(!oldIds.has(p.id)&&parents.has(p.productionId))throw Error('완료 프로젝트에 업무 그룹을 추가할 수 없습니다.');
   const old=owners(before).find(v=>v.id===p.id);
   if(JSON.stringify(p.completion)!==JSON.stringify(old?.completion))throw Error('완료 보존 정보는 서버에서 관리합니다.');
  }
  const lockedIds=new Set(owners(before).filter(p=>locked(before,p)).map(p=>p.id)),oldRows=new Map((before.timetableSchedules||[]).map(s=>[s.id,s])),newRows=new Map((after.timetableSchedules||[]).map(s=>[s.id,s]));
  for(const id of new Set([...oldRows.keys(),...newRows.keys()]))if(JSON.stringify(oldRows.get(id))!==JSON.stringify(newRows.get(id))&&[oldRows.get(id),newRows.get(id)].some(s=>lockedIds.has(s?.projectId)||lockedIds.has(s?.productionId)))throw Error('완료 프로젝트의 일정은 수정할 수 없습니다.');
 }
 function fileIds(value,known){const result=new Set();const walk=node=>{if(Array.isArray(node))node.forEach(walk);else if(node&&typeof node==='object'){if(node.fileId)result.add(node.fileId);if(known.has(node.id)||node.id&&!['files','groups','modules','blocks'].some(k=>k in node)&&(['file','document','image','video','audio','pdf'].includes(node.kind)||node.mime)&&(node.name||node.originalName||node.mime))result.add(node.id);Object.entries(node).forEach(([k,v])=>{if(k!=='source')walk(v)})}else if(typeof node==='string')for(const match of node.matchAll(/\/api\/ref-files\/([a-f0-9-]{36})/g))result.add(match[1])};walk(value);return result}
 globalThis.productionCompletionPolicy={owners,locked,validate,fileIds};
})();
