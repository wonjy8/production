import {useState} from 'react';
import type {Project,Workspace} from './data';
import {statuses} from './data';
import {Icon} from './Icon';
import {memberLabel,assigneeLabel,categoryFor,projectCatalog,projectMembers,changeProjectCategory} from './people-model.js';
export function ProjectOverview({workspace:w,project:p,onChange,onTitle}:{workspace:Workspace;project:Project;onChange:(fn:(p:Project)=>Project)=>void;onTitle:(name:string)=>void}){
 const [draft,setDraft]=useState<Project|null>(null);
 const shown=draft||p, group=w.productions.find(g=>g.id===shown.productionId), teams=group?.teams||[], members=projectMembers(w,shown);
 const selectedTeams=teams.filter(t=>(shown.teamIds||[]).includes(t.id));
 function patch(value:Partial<Project>){setDraft(d=>d?{...d,...value}:d)}
 function confirm(){if(!draft?.name.trim())return;const metadata={name:draft.name.trim(),description:draft.description,productionId:draft.productionId,status:draft.status,owner:draft.owner,due:draft.due,categoryId:draft.categoryId,teamIds:(draft.teamIds||[]).filter(id=>teams.some(t=>t.id===id))};onChange(latest=>changeProjectCategory(w,{...latest,...metadata},metadata.categoryId));onTitle(metadata.name);setDraft(null)}
 return <section className="project-overview"><div className="overview-heading"><div><small>{group?.name||'프로젝트'}</small><h2>{p.name}</h2></div>{!draft&&<button className="button keep-label" onClick={()=>setDraft({...p,categoryId:categoryFor(w,p).id,teamIds:[...(p.teamIds||[])]})}><Icon name="edit"/>수정</button>}</div>
 {draft?<form className="overview-edit" onSubmit={e=>{e.preventDefault();confirm()}}><div className="overview-fields">
 <label>이름<input aria-label="프로젝트 이름" value={draft.name} required maxLength={160} onChange={e=>patch({name:e.target.value})}/></label>
 <label>프로젝트<select value={draft.productionId} onChange={e=>patch({productionId:e.target.value,teamIds:[],owner:''})}><option value="">독립 프로젝트</option>{w.productions.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
 <label>상태<select value={draft.status} onChange={e=>patch({status:e.target.value as Project['status']})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>
 <label>마감일<input type="date" value={draft.due} onChange={e=>patch({due:e.target.value})}/></label>
 <label>구분<select value={draft.categoryId} onChange={e=>patch({categoryId:e.target.value})}>{projectCatalog(w.projectCatalog).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>담당자<select value={draft.owner||''} onChange={e=>patch({owner:e.target.value})}><option value="">미지정</option>{draft.owner&&!members.some(m=>m.name===draft.owner)&&<option value={draft.owner}>{draft.owner}</option>}{members.map(m=><option key={m.id} value={m.name}>{memberLabel(m)}</option>)}</select></label>
 </div><label>메모<textarea aria-label="프로젝트 메모" value={draft.description||''} onChange={e=>patch({description:e.target.value})} maxLength={2000}/></label>{group&&<fieldset className="overview-team-options"><legend>팀</legend>{teams.length?teams.map(t=><label key={t.id}><input type="checkbox" checked={(draft.teamIds||[]).includes(t.id)} onChange={e=>patch({teamIds:e.target.checked?[...(draft.teamIds||[]),t.id]:(draft.teamIds||[]).filter(id=>id!==t.id)})}/><span>{t.name}</span><small>{t.members.length}명</small></label>):<span className="muted">등록된 팀 없음</span>}</fieldset>}<div className="overview-actions"><button type="button" className="button keep-label" onClick={()=>setDraft(null)}>취소</button><button type="submit" className="button primary keep-label" disabled={!draft.name.trim()}>완료</button></div></form>:<>
 {p.description?.trim()&&<p className="overview-note">{p.description}</p>}<dl className="overview-facts">{[['상태',p.status],['마감일',p.due],['구분',categoryFor(w,p).name],['담당자',p.owner?assigneeLabel(w.members,p.owner):'']].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
 {selectedTeams.length>0&&<section className="overview-team-section"><h3>팀 <span className="group-count">{selectedTeams.length}</span></h3><div className="overview-team-grid">{selectedTeams.map(t=><article key={t.id}><header><strong>{t.name}</strong><span>{t.members.length}명</span></header><div className="team-summary-members">{t.members.map(a=>{const m=members.find(m=>m.id===a.memberId);return m?<span key={m.id}>{memberLabel(m)}{(t.leaderId===m.id||a.role)&&<small>{t.leaderId===m.id?'팀장':a.role}</small>}</span>:null})}</div></article>)}</div></section>}
 {!selectedTeams.length&&members.length>0&&<section className="overview-team-section"><h3>멤버 <span className="group-count">{members.length}</span></h3><div className="team-summary-members">{members.map(m=><span key={m.id}>{memberLabel(m)}</span>)}</div></section>}
 </>}
 </section>
}
