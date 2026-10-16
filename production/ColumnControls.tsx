import { useState, useEffect, useRef } from 'react';
import { moduleTemplates } from './module-hub.js';
import { mergeColumn, validColumns } from './column-layout.js';
import { Icon } from './Icon';
export function ColumnControls({items,layout,onChange,onTemplateDrop}:any){
  const [adding,setAdding]=useState('');
  const resizeCleanup=useRef<null|(()=>void)>(null);
  useEffect(()=>{
    const dismiss=(e:any)=>{if(e.type==='keydown'&&e.key!=='Escape')return;if(e.type==='keydown'||!e.composedPath().some((n:any)=>n.matches?.('.column-add,.column-add-menu')))setAdding('');};
    const cancel=(e:any)=>{if(e.type==='blur'||e.key==='Escape')resizeCleanup.current?.();};
    window.addEventListener('pointerdown',dismiss,true);window.addEventListener('keydown',dismiss);window.addEventListener('blur',cancel);window.addEventListener('keydown',cancel);
    return ()=>{resizeCleanup.current?.();window.removeEventListener('pointerdown',dismiss,true);window.removeEventListener('keydown',dismiss);window.removeEventListener('blur',cancel);window.removeEventListener('keydown',cancel);};
  },[]);
  const blocked=(e:any)=>(window as any).appAccount?.role==='viewer'||!!e.currentTarget.closest('[data-project-readonly="true"]');
  function canAdd(template:any,slot:string){
    if(template.kind!=='columns')return true;
    const trial={id:'__column_trial__',kind:'columns',columnSlots:Array.from({length:template.count},(_,n)=>'__trial_'+n),parentSlot:slot};
    return validColumns([...items,trial]);
  }
  function resize(e:any,guide:any){
    if(e.button!==0||blocked(e))return;
    e.preventDefault();const group=items.find((i:any)=>i.id===guide.id);
    const widths=group.columnSlots.map((key:string)=>layout.slots[key].width);
    const total=widths[guide.index]+widths[guide.index+1],start=e.clientX;
    const target=e.currentTarget;target.setPointerCapture(e.pointerId);
    const move=(ev:any)=>{if(ev.pointerId!==e.pointerId)return;const min=Math.min(48,total/3),left=Math.max(min,Math.min(total-min,widths[guide.index]+ev.clientX-start));
      // Preview is local DOM geometry; persist only on release.
      target.style.transform=`translateX(${left-widths[guide.index]}px)`;
    };
    const end=(ev:any)=>{if(ev.pointerId!==e.pointerId)return;target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',cancel);target.style.transform='';resizeCleanup.current=null;if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);
      const min=Math.min(48,total/3),left=Math.max(min,Math.min(total-min,widths[guide.index]+ev.clientX-start)),weights=[...widths];weights[guide.index]=left;weights[guide.index+1]=total-left;
      onChange((old:any[])=>old.map(i=>i.id===guide.id?{...i,columnWeights:weights}:i));
    };
    const cancel=(ev:any)=>{if(ev.pointerId!==e.pointerId)return;target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',cancel);target.style.transform='';resizeCleanup.current=null;if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);};
    resizeCleanup.current=()=>cancel({pointerId:e.pointerId});
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',cancel);
  }
  if ((window as any).appAccount?.role === "viewer") return null;
  return <>
    {Object.values(layout.slots||{}).map((slot:any)=>{
      const children=items.filter((i:any)=>i.parentSlot===slot.id);
      return <div key={slot.id} className={'column-slot-tools'+(!children.length?' column-slot-empty':'')} style={{left:slot.left,top:slot.top+(!children.length?0:Math.max(0,slot.height-24)),width:slot.width,height:!children.length?slot.height:24}}>
        {onTemplateDrop&&<button type="button" className="column-add keep-label" aria-label="열에 모듈 추가" onClick={e=>{if(!blocked(e))setAdding(adding===slot.id?'':slot.id);}}><Icon name="plus"/></button>}
        {adding===slot.id&&<div className="column-add-menu" role="menu" aria-label="열에 추가할 모듈">{moduleTemplates.map((template:any)=><button role="menuitem" className="keep-label" type="button" key={template.id} disabled={!canAdd(template,slot.id)} title={!canAdd(template,slot.id)?'중첩을 포함해 최대 4칸까지 나눌 수 있습니다.':template.description} onClick={()=>{onTemplateDrop?.(template.id,{x:slot.left+slot.width/2,y:slot.top+slot.height,placement:{mode:'block',parentSlot:slot.id}},layout.boxes);setAdding('');}}><Icon name={template.icon}/>{template.name}</button>)}</div>}
      </div>;
    })}
    {(layout.guides||[]).map((g:any)=><div key={g.id+g.index} className="column-boundary" style={{left:g.left-8,top:g.top,width:16,height:g.height}}>
      <div className="column-boundary-line" role="separator" aria-label="열 너비 조절" aria-orientation="vertical" tabIndex={0} onPointerDown={e=>resize(e,g)} onKeyDown={e=>{if(blocked(e)||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const group=items.find((i:any)=>i.id===g.id),weights=group.columnSlots.map((s:string)=>layout.slots[s].width),total=weights[g.index]+weights[g.index+1],left=Math.max(32,Math.min(total-32,weights[g.index]+(e.key==='ArrowRight'?16:-16)));weights[g.index]=left;weights[g.index+1]=total-left;onChange((old:any[])=>old.map(i=>i.id===g.id?{...i,columnWeights:weights}:i));}}/>
      <button type="button" className="column-merge keep-label" aria-label="열 구분선 삭제 · 오른쪽 모듈을 왼쪽 아래로 합치기" title="모듈을 유지하고 열 합치기" onClick={e=>{if(blocked(e))return;setAdding('');onChange((old:any[])=>mergeColumn(old,g.id,g.index));}}><Icon name="close"/></button>
    </div>)}
  </>;
}
