import {moduleItemBindings} from './module-item-menu.js';
import {useRef,useState,useEffect} from 'react';
import {flushSync} from 'react-dom';
import {Photo} from './Photo';
import {SortableItems} from './SortableItems';
import {justifiedRows,fittedRows,maximumGalleryHeight} from './justified-gallery.js';
import {IconButton} from './Icon';
export function PhotoGallery({items,onChange,onEdit,layout='grid'}:any){
 const root=useRef<HTMLDivElement>(null),[metrics,setMetrics]=useState({width:800,height:0,fixed:false}),[ratios,setRatios]=useState<any>({});
 useEffect(()=>{const el=root.current;if(!el)return;const update=()=>{if(el.clientWidth){const next={width:el.clientWidth,height:el.clientHeight,fixed:!!el.closest('.module-fixed-height')};setMetrics(old=>JSON.stringify(old)===JSON.stringify(next)?old:next)}};update();const observer=new ResizeObserver(()=>flushSync(update));observer.observe(el);return ()=>observer.disconnect()},[]);
 const width=metrics.width;const values=items.map((f:any)=>ratios[f.id]||4/3),rows=metrics.fixed?layout==='list'?values.map((r:number,i:number)=>({start:i,end:i+1,height:width/r,widths:[width]})).map((row:any)=>{const scale=Math.min(1,Math.max(0,(metrics.height-10*(items.length-1))/(maximumGalleryHeight(values,width)-10*(items.length-1))));return {...row,height:row.height*scale,widths:row.widths.map((w:number)=>w*scale)}}):fittedRows(values,width,metrics.height):layout==='list'?values.map((r:number,i:number)=>({start:i,end:i+1,height:width/r,widths:[width]})):justifiedRows(values,width),boxes:any[]=[];let top=0;
 for(const row of rows){let left=Math.max(0,(width-row.widths.reduce((s:number,w:number)=>s+w,0)-10*(row.widths.length-1))/2);for(let i=row.start;i<row.end;i++){boxes[i]={position:'absolute',top,left,width:row.widths[i-row.start],height:row.height};left+=row.widths[i-row.start]+10}top+=row.height+10}
 return <div ref={root} className="photo-gallery-host" data-max-photo-height={items.length?maximumGalleryHeight(values,width):0}><SortableItems items={items} onChange={onChange} className="justified-gallery" style={{height:Math.max(0,top-10)}} itemStyle={(_:any,i:number)=>boxes[i]} renderItem={(f:any,i:number,drag:any)=><figure {...moduleItemBindings({file:f,items,onChange,onEdit},drag)} tabIndex={0} className="gallery-photo"><Photo file={f} onSize={(w:number,h:number)=>setRatios((old:any)=>Math.abs((old[f.id]||0)-w/h)<.001?old:{...old,[f.id]:w/h})}/><div className="photo-actions"><IconButton name="edit" label="사진 편집" onClick={()=>onEdit(f.id)}/><IconButton name="close" label="사진 제거" onClick={()=>onChange((old:any[])=>old.filter(v=>v.id!==f.id))}/></div></figure>}/></div>
}
