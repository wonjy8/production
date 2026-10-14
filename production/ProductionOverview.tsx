import {ProjectIconPicker} from './ProjectIconPicker';
import {ProjectHealth} from './ProjectHealth';
import type {ReactNode} from 'react';
import {useState} from 'react';
import {Icon} from './Icon';
import {statuses} from './data';
import type {Production,Workspace} from './data';
export function ProductionOverview({workspace:w,production:p,onOpen,onChange,onTitle,actions}:{onOpen?:(origin:any,kind:string,id:string)=>void;workspace:Workspace;actions?:ReactNode;production:Production;onChange:(fn:(p:Production)=>Production)=>void;onTitle:(name:string)=>void}){
 const [draft,setDraft]=useState<Pick<Production,'name'|'description'|'status'|'due'>|null>(null);

 return <section className="production-overview project-overview-home"><div className="overview-heading"><div className="overview-identity"><ProjectIconPicker icon={p.icon} onChange={icon=>onChange(latest=>({...latest,icon}))}/><div><small>프로젝트</small><h2>{p.name}</h2></div></div><div className="production-heading-actions">{actions}{!draft&&<button className="button keep-label" onClick={()=>setDraft({name:p.name,description:p.description||'',status:p.status||'진행 중',due:p.due||''})}><Icon name="edit"/>수정</button>}</div></div>
 {draft?<form className="overview-edit" onSubmit={e=>{e.preventDefault();if(!draft.name.trim())return;onChange(p=>({...p,...draft,name:draft.name.trim()}));onTitle(draft.name.trim());setDraft(null)}}><div className="overview-fields"><label>이름<input aria-label="프로젝트 이름" value={draft.name} required maxLength={160} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>상태<select aria-label="프로젝트 상태" value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as Production['status']})}>{statuses.map(status=><option key={status}>{status}</option>)}</select></label><label>마감일<input type="date" aria-label="프로젝트 마감일" value={draft.due} onChange={e=>setDraft({...draft,due:e.target.value})}/></label></div><label>메모<textarea aria-label="프로젝트 메모" value={draft.description} maxLength={2000} onChange={e=>setDraft({...draft,description:e.target.value})}/></label><div className="overview-actions"><button type="button" className="button keep-label" onClick={()=>setDraft(null)}>취소</button><button className="button primary keep-label">저장</button></div></form>:<><ProjectHealth workspace={w} kind="production" id={p.id} onOpen={onOpen}/>{p.description?.trim()&&<p className="overview-note">{p.description}</p>}{(p.status||p.due)&&<dl className="overview-facts">{p.status&&<div><dt>상태</dt><dd>{p.status}</dd></div>}{p.due&&<div><dt>마감일</dt><dd>{p.due}</dd></div>}</dl>}</>}
 </section>;
}
