import {fluidBoxes,reorderItems} from './fluid-layout.js';
export const moduleSpans=[3,4,6,8,9,12];
export function snapSpan(value){return moduleSpans.reduce((best,s)=>Math.abs(s-value)<Math.abs(best-value)?s:best,3)}
export function moduleSpan(item){if(item.kind==='divider')return 12;return snapSpan(item.span||((item.width||100)/100*12))}
export function snapBoxes(items,heights,width){
 const boxes={};let offset=0,section=[];
 const flush=()=>{if(!section.length)return;const layout=fluidBoxes(section.map(i=>({id:i.id,width:((width+12)*moduleSpan(i)/12-12)/width*100,height:i.frameHeight})),heights,width,12);Object.entries(layout.boxes).forEach(([id,box])=>boxes[id]={...box,top:box.top+offset});offset+=layout.height;section=[]};
 for(const item of items){if(item.kind==='divider'){flush();boxes[item.id]={left:0,top:offset,width,height:32};offset+=44}else section.push(item)}flush();return {boxes,height:Math.max(80,offset)};
}
export function moveModule(items,id,direction){const index=items.findIndex(i=>i.id===id),target=index+direction;if(index<0||target<0||target>=items.length||items[index].kind!=='divider'&&items[target].kind==='divider')return items;const next=[...items];[next[index],next[target]]=[next[target],next[index]];return next}
export function resizeSpan(box,dx,width){return snapSpan((box.width+dx+12)/(width+12)*12)}
export function dropModule(items,boxes,id,x,y){const moving=items.find(i=>i.id===id);if(!moving)return items;
 if(moving.kind==='divider'){const others=items.filter(i=>i.id!==id),before=others.find(i=>{const box=boxes[i.id];return box&&y<box.top+box.height/2});return reorderItems(items,id,before?.id).map(i=>i.kind==='divider'?{...i,span:12}:i)}
 const index=items.findIndex(i=>i.id===id),start=items.slice(0,index).map(i=>i.kind).lastIndexOf('divider')+1,nextDivider=items.findIndex((i,n)=>n>index&&i.kind==='divider'),end=nextDivider<0?items.length:nextDivider;
 const fresh=!boxes[id],others=(fresh?items:items.slice(start,end)).filter(i=>i.id!==id);if(!others.length)return items;let target=others.find(i=>{const b=boxes[i.id];return x>=b.left&&x<=b.left+b.width&&y>=b.top&&y<=b.top+b.height});if(!target)target=others.reduce((a,b)=>{const distance=i=>{const r=boxes[i.id];return Math.hypot(x-(r.left+r.width/2),y-(r.top+r.height/2))};return distance(a)<distance(b)?a:b});const r=boxes[target.id],full=r.width>Math.max(...Object.values(boxes).map(b=>b.left+b.width))*.7,after=full?y>r.top+r.height/2:x>r.left+r.width/2;const before=after?others[others.indexOf(target)+1]?.id:target.id;return reorderItems(items,id,before||(fresh?undefined:items[end]?.id)).map(i=>{const {x,y,width,height,...item}=i;return {...item,span:moduleSpan(i)}})}

export function resizeHeight(height,dy){return Math.max(160,Math.round((height+dy)/16)*16)}
