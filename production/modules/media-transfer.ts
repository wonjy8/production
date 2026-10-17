import type {ModuleFile,ModuleState} from './types';
// Canonical TypeScript implementation; ../media-transfer.js is a compatibility export.
export const MEDIA_ITEM_TYPE='application/x-production-media';
export function compatibleMedia(target:string,file:ModuleFile){return target==='file'||target==='image'&&(file.mime?.startsWith('image/')||file.kind==='image')||target==='video'&&(file.mime?.startsWith('video/')||['video','youtube'].includes(file.kind))}
export function moveModuleFile(modules:ModuleState[],from:string,to:string,fileId:string,before=''){
 const source=modules.find(m=>m.id===from),target=modules.find(m=>m.id===to),file=source?.files?.find(f=>f.id===fileId);
 if(!source||!target||source===target||!file||!['image','video','file'].includes(source.kind)||!['image','video','file'].includes(target.kind)||source.source&&!source.sourceCopy||target.source&&!target.sourceCopy||!compatibleMedia(target.kind,file)||target.files?.some(f=>f.id===fileId))return modules;
 const {x,y,width,height,...moved}=file,files=[...(target.files||[])],index=files.findIndex(f=>f.id===before);files.splice(index<0?files.length:index,0,moved);
 return modules.map(m=>m.id===from?{...m,files:m.files.filter(f=>f.id!==fileId)}:m.id===to?{...m,files}:m);
}
export function mediaDragStart(e,file){const source=e.currentTarget.closest('[data-media-module]');if(source)e.dataTransfer.setData(MEDIA_ITEM_TYPE,JSON.stringify({from:source.dataset.mediaModule,fileId:file.id}))}
export function mediaPointerTransfer(e,fileId){const source=e.currentTarget?.closest('[data-media-module]');if(!source)return false;const root=source.getRootNode(),hit=root.elementFromPoint?.(e.clientX,e.clientY)||document.elementFromPoint(e.clientX,e.clientY),target=hit?.closest('[data-media-module]');if(!target||target===source)return false;return !target.dispatchEvent(new CustomEvent('module-file-transfer',{bubbles:true,composed:true,cancelable:true,detail:{from:source.dataset.mediaModule,fileId,before:hit.closest('[data-sortable-id]')?.dataset.sortableId||''}}))}
