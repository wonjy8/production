import {PlanningPanel} from './PlanningFields';
import {validateProject} from './event-operations.js';
import {DueField,CategoryChoices,overviewStatus} from './OverviewFields';
import {ProjectIconPicker} from './ProjectIconPicker';
import {ProjectHealth} from './ProjectHealth';
import {useState} from 'react';
import type {Project,Workspace} from './data';
import {statuses} from './data';
import {Icon} from './Icon';
import {memberLabel,assigneeLabel,categoryFor,projectCatalog,projectMembers,changeProjectCategory} from './people-model.js';
export function ProjectOverview({workspace:w,project:p,onOpen,onChange,onTitle}:{onOpen?:(origin:any,kind:string,id:string)=>void;workspace:Workspace;project:Project;onChange:(fn:(p:Project)=>Project)=>void;onTitle:(name:string)=>void}){
 const [draft,setDraft]=useState<Project|null>(null);
 const shown=draft||p, group=w.productions.find(g=>g.id===shown.productionId), teams=group?.teams||[], members=projectMembers(w,shown);
 const selectedTeams=teams.filter(t=>(shown.teamIds||[]).includes(t.id));
 function patch(value:Partial<Project>){setDraft(d=>d?{...d,...value}:d)}
 function confirm(){if(!draft?.name.trim())return;const metadata={name:draft.name.trim(),description:draft.description,productionId:draft.productionId,status:overviewStatus(draft.status,draft.due) as Project['status'],owner:draft.owner,due:draft.due,categoryId:draft.categoryId,categoryIds:draft.categoryIds||[draft.categoryId],teamIds:(draft.teamIds||[]).filter(id=>teams.some(t=>t.id===id))};onChange(latest=>changeProjectCategory(w,{...latest,...metadata},metadata.categoryId));onTitle(metadata.name);setDraft(null)}
 return <section className={"project-overview project-overview-compact"+(draft?" overview-is-editing":"")}><div className="overview-heading"><div className="overview-identity"><div><small>{group?.name||'업무 그룹'}</small><h2>{p.name}</h2></div></div>{draft&&<div className="overview-actions overview-top-actions"><button type="button" className="button keep-label overview-cancel" onClick={()=>setDraft(null)}>취소</button><button type="submit" form={"project-overview-"+p.id} className="button keep-label overview-confirm" disabled={!draft.name.trim()}>확인</button></div>}{!draft&&<button className="button keep-label" onClick={()=>setDraft({...p,status:overviewStatus(p.status,p.due) as Project['status'],categoryId:categoryFor(w,p).id,teamIds:[...(p.teamIds||[])]})}><Icon name="edit"/>수정</button>}</div>
 {draft?<form id={"project-overview-"+p.id} className="overview-edit" onSubmit={e=>{e.preventDefault();confirm()}}><div className="overview-fields">
 <label>이름<input aria-label="프로젝트 이름" value={draft.name} required maxLength={160} onChange={e=>patch({name:e.target.value})}/></label>
 <label>상태<select value={draft.status} onChange={e=>patch({status:e.target.value as Project['status']})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>
 <DueField label={p.groupType==='event'?'행사 종료일':'마감일'} value={draft.due} onChange={due=>patch({due,status:draft.status})}/>
 <label>프로젝트<select value={draft.productionId} onChange={e=>patch({productionId:e.target.value,teamIds:[],owner:''})}><option value="">독립 프로젝트</option>{w.productions.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
 <CategoryChoices categories={projectCatalog(w.projectCatalog)} selected={draft.categoryIds||[draft.categoryId!]} onChange={ids=>patch({categoryIds:ids,categoryId:ids[0]||draft.categoryId})}/>
 <label>담당자<select value={draft.owner||''} onChange={e=>patch({owner:e.target.value})}><option value="">미지정</option>{draft.owner&&!members.some(m=>m.name===draft.owner)&&<option value={draft.owner}>{draft.owner}</option>}{members.map(m=><option key={m.id} value={m.name}>{memberLabel(m)}</option>)}</select></label>
 </div><label className="overview-memo-field">메모<textarea aria-label="프로젝트 메모" value={draft.description||''} onChange={e=>patch({description:e.target.value})} maxLength={2000}/></label>{group&&<fieldset className="overview-team-options"><legend>팀</legend>{teams.length?teams.map(t=><label key={t.id}><input type="checkbox" checked={(draft.teamIds||[]).includes(t.id)} onChange={e=>patch({teamIds:e.target.checked?[...(draft.teamIds||[]),t.id]:(draft.teamIds||[]).filter(id=>id!==t.id)})}/><span>{t.name}</span><small>{t.members.length}명</small></label>):<span className="muted">등록된 팀 없음</span>}</fieldset>}</form>:<>
 <ProjectHealth workspace={w} kind="project" id={p.id} onOpen={onOpen}/>{p.description?.trim()&&<p className="overview-note">{p.description}</p>}<dl className="overview-facts">{[['상태',p.status],['마감일',p.due],['구분',projectCatalog(w.projectCatalog).filter(c=>(p.categoryIds||[p.categoryId]).includes(c.id)).map(c=>c.name).join(' · ')||categoryFor(w,p).name],['담당자',p.owner?assigneeLabel(w.members,p.owner):'']].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
 {(selectedTeams.length>0||members.length>0)&&<div className="overview-compact-people">{selectedTeams.length>0&&<span><Icon name="users"/>{selectedTeams.map(t=>t.name).join(' · ')}</span>}{members.length>0&&<span>멤버 {members.length}명</span>}</div>}

 </>}
 <PlanningPanel owner={p} members={w.members} onChange={onChange}/></section>
}
