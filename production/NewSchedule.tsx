import {useState} from 'react';
import {ScheduleForm} from './ProjectWorkspace';
import {Modal} from './Modal';
import {scheduleOwners,saveOwnedSchedule} from './event-groups.js';
import {localDay} from './admin-home-model.js';
export function NewSchedule({workspace:w,onChange,onClose,ownerKey}:any){
 const owners=scheduleOwners(w).filter((o:any)=>(window as any).accountCan?.(o.ownerId,'schedule','add')!==false&&!(globalThis as any).productionCompletionPolicy?.locked(w,[...w.productions,...w.projects].find((p:any)=>p.id===o.ownerId)));
 const [error,setError]=useState(''),[value]=useState(()=>({id:crypto.randomUUID(),title:'',date:localDay(),endDate:localDay(),location:'',note:''}));
 return <Modal title="일정 추가" onClose={onClose}>{owners.length?<ScheduleForm value={value} owners={owners} ownerKey={ownerKey&&owners.some((o:any)=>o.id===ownerKey)?ownerKey:owners[0].id} onTemplates={(templates:any[],key:string)=>onChange((old:any)=>{const at=key.indexOf(':'),collection=key.slice(0,at)==='production'?'productions':'projects';return {...old,[collection]:old[collection].map((p:any)=>p.id===key.slice(at+1)?{...p,scheduleTemplates:templates}:p)}})} onSave={(item:any)=>{try{const {_ownerKey,...schedule}=item;onChange((old:any)=>saveOwnedSchedule(old,_ownerKey,schedule));onClose()}catch(e:any){setError(e.message)}}}/>:<p>일정을 추가할 프로젝트를 먼저 만들어 주세요.</p>}{error&&<p role="alert">{error}</p>}</Modal>
}
