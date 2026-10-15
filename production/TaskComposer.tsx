import {useRef, useState} from 'react';
import {CalendarDays, Check, Circle, Flag, ListChecks} from 'lucide-react';
import {AssigneePicker} from './AssigneePicker';
import {newTask, priorities, stages} from './data';
import type {Member, Task} from './data';

export function TaskComposer({members,onAddMember,onAdd,stageOptions=stages as readonly string[],allowMemberAdd=true,stage=stageOptions[0]||'기획'}:{members:Member[];onAddMember:(name:string)=>void;onAdd:(task:Task)=>void;stage?:Task['stage'];stageOptions?:readonly string[];allowMemberAdd?:boolean}){
 const [title,setTitle]=useState(''),[expanded,setExpanded]=useState(false),[owner,setOwner]=useState('미지정');
 const input=useRef<HTMLInputElement>(null);
 return <form className={'task-composer'+(expanded?' is-expanded':'')} aria-label="할 일 바로 추가" onSubmit={e=>{
  e.preventDefault();const name=title.trim();if(!name)return;
  const form=e.currentTarget,d=new FormData(form);
  onAdd({...newTask(name),owner,ownerId:members.find(m=>m.name===owner)?.id||'',due:String(d.get('due')||''),stage:(d.get('stage')||stage) as Task['stage'],priority:(d.get('priority')||'보통') as Task['priority'],description:String(d.get('description')||'').trim(),flagged:d.has('flagged')});
  setTitle('');setOwner('미지정');form.reset();input.current?.focus();
 }}>
  <div className="task-composer-line"><Circle size={20} className="task-composer-circle" aria-hidden="true"/><input ref={input} name="title" aria-label="새 할 일" placeholder="할 일 입력" maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} onFocus={()=>setExpanded(true)} onKeyDown={e=>{if(e.key==='Enter'&&(e.nativeEvent.isComposing||e.keyCode===229))e.preventDefault()}}/><button type="submit" className="button primary ui-icon-button" aria-label="할 일 추가" disabled={!title.trim()}><Check size={18}/></button></div>
  {expanded&&<div className="task-composer-details"><textarea name="description" aria-label="할 일 메모" placeholder="메모 추가" rows={1} maxLength={2000}/><div className="task-composer-options"><label className="task-composer-option"><CalendarDays size={15}/><input type="date" name="due" aria-label="마감일"/></label><label className="member-check"><input type="checkbox" name="flagged"/>깃발</label><AssigneePicker allowAdd={allowMemberAdd} members={members} value={owner} onChange={setOwner} onAdd={onAddMember}/><label className="task-composer-option"><ListChecks size={15}/><select name="stage" aria-label="제작 단계" defaultValue={stage}>{stageOptions.map(s=><option key={s}>{s}</option>)}</select></label><label className="task-composer-option"><Flag size={15}/><select name="priority" aria-label="우선순위" defaultValue="보통">{priorities.map(s=><option key={s}>{s}</option>)}</select></label></div></div>}
 </form>;
}
