import {Icon,IconButton} from './Icon';

export function TrackerModule({module,onChange}:{module:any;onChange:(fn:any)=>void}){
 const fields=module.fields||['항목','상태','메모'],states=module.states||['대기','진행 중','완료'];
 const rows=module.rows||[];
 function update(id:string,patch:any){onChange((old:any)=>({...old,rows:(old.rows||[]).map((row:any)=>row.id===id?{...row,...patch}:row)}))}
 return <div className="tracker-module"><div className="tracker-head"><span>{fields[0]}</span><span>{fields[1]}</span><span>{fields[2]}</span><span/></div>{rows.map((row:any)=><div className="tracker-row" key={row.id}><input aria-label={fields[0]} value={row.name||''} onChange={e=>update(row.id,{name:e.target.value})}/><select aria-label={fields[1]} value={row.state||states[0]} onChange={e=>update(row.id,{state:e.target.value})}>{states.map((state:string)=><option key={state}>{state}</option>)}</select><input aria-label={fields[2]} value={row.note||''} onChange={e=>update(row.id,{note:e.target.value})}/><IconButton name="close" label="항목 삭제" onClick={()=>onChange((old:any)=>({...old,rows:(old.rows||[]).filter((item:any)=>item.id!==row.id)}))}/></div>)}<button className="button keep-label" onClick={()=>onChange((old:any)=>({...old,rows:[...(old.rows||[]),{id:crypto.randomUUID(),name:'',state:states[0],note:''}]}))}><Icon name="plus"/>항목 추가</button></div>;
}

export function ChecklistModule({module,onChange}:{module:any;onChange:(fn:any)=>void}){
 const items=module.items||[];
 return <div className="checklist-module">{items.map((item:any)=><div className="checklist-row" key={item.id}><input type="checkbox" aria-label="완료" checked={!!item.done} onChange={e=>onChange((old:any)=>({...old,items:(old.items||[]).map((entry:any)=>entry.id===item.id?{...entry,done:e.target.checked}:entry)}))}/><input aria-label="체크리스트 항목" value={item.text||''} onChange={e=>onChange((old:any)=>({...old,items:(old.items||[]).map((entry:any)=>entry.id===item.id?{...entry,text:e.target.value}:entry)}))}/><IconButton name="close" label="항목 삭제" onClick={()=>onChange((old:any)=>({...old,items:(old.items||[]).filter((entry:any)=>entry.id!==item.id)}))}/></div>)}<button className="button keep-label" onClick={()=>onChange((old:any)=>({...old,items:[...(old.items||[]),{id:crypto.randomUUID(),text:'',done:false}]}))}><Icon name="plus"/>항목 추가</button></div>;
}
