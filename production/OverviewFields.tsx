import {useState} from 'react';
export function overviewStatus(status:string,due?:string){return !due&&status!=='완료'?'상시':status}
export function DueField({value,onChange,name,label='마감일',ariaLabel=label}:{value?:string;onChange?:(value:string)=>void;name?:string;label?:string;ariaLabel?:string}){
 const [local,setLocal]=useState(''),[none,setNone]=useState(!value),date=value??local;
 function update(next:string){setLocal(next);onChange?.(next)}
 return <div className="overview-due-field"><label>{label}<input type="date" name={none?undefined:name} aria-label={ariaLabel} value={none?'':date} disabled={none} onChange={e=>update(e.target.value)}/></label><label className="overview-no-due"><input type="checkbox" checked={none} onChange={e=>{setNone(e.target.checked);if(e.target.checked)update('')}}/>마감일 없음</label>{none&&name&&<input type="hidden" name={name} value=""/>}</div>
}
export function CategoryChoices({categories,selected,onChange}:{categories:{id:string;name:string}[];selected:string[];onChange:(ids:string[])=>void}){return <fieldset className="overview-category-options"><legend>구분</legend>{categories.map(c=><label key={c.id}><input type="checkbox" aria-label={c.name+' 구분'} checked={selected.includes(c.id)} onChange={e=>onChange(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset>}
