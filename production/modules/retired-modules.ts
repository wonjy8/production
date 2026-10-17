// Canonical TypeScript implementation; ../retired-modules.js is a compatibility export.
import {planningSnapshot} from '../planning-model.js';
export const retiredModuleKinds=new Set(['database','materials','checklist','group-list','progress-table','info-cards','assignment-table']);
// One inert JSON string preserves every original field without duplicating live file references.
// Existing IDs, originals, placements and permissions are retained. No files are deleted.
export function migrateRetiredModules(modules,universe=modules,resolve=m=>m){
 if(!modules.some(m=>retiredModuleKinds.has(m.kind)))return modules;
 return modules.flatMap(placement=>{
  if(!retiredModuleKinds.has(placement.kind))return [placement];
  const source=resolve(placement),original=source?planningSnapshot(source,universe):placement;
  const files=new Map();
  function collect(value){if(Array.isArray(value)){value.forEach(collect);return}if(!value||typeof value!=='object')return;if(value.id&&(value.mime||['file','image','video','pdf','document'].includes(value.kind))&&!value.files)files.set(value.id,value);for(const [key,child] of Object.entries(value))if(!['source','importSource','sourceMetadata'].includes(key))collect(child);}
  collect(original.files||[]);for(const group of original.groups||[])collect(group.items||[]);
  const text=[original.title||placement.title||'보존된 내용',original.text||'',JSON.stringify(Object.fromEntries(Object.entries(original).filter(([key])=>!['files','source','importSource','id','span','frameHeight','columnId','parentSlot'].includes(key))),null,2)].filter(Boolean).join('\n\n');
  const {source:oldSource,sourceCopy,files:oldFiles,groups,planData,dataModuleId,items,...rest}=placement;
  const memo={...rest,kind:'text',title:(placement.title||'')+' · 메모',text,retiredSnapshot:JSON.stringify(original),...(oldSource?{importSource:oldSource,sourceCopy:true}:{})};
  if(!files.size)return [memo];
  const columnId=placement.columnId||(!placement.parentSlot?placement.id+':preserved':undefined);
  return [{...memo,...(columnId?{columnId}:{})},{id:placement.id+':files',kind:'file',title:(placement.title||'')+' · 파일',files:[...files.values()],span:placement.span,blockLayout:placement.blockLayout,parentSlot:placement.parentSlot,...(columnId?{columnId}:{})}];
 });
}
