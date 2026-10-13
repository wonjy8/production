import {fluidBoxes,reorderItems} from './fluid-layout.js';
export const moduleSpans=[3,4,6,8,9,12];
export function snapSpan(value){return moduleSpans.reduce((best,s)=>Math.abs(s-value)<Math.abs(best-value)?s:best,3)}
export function moduleSpan(item){return snapSpan(item.span||((item.width||100)/100*12))}
export function snapBoxes(items,heights,width){return fluidBoxes(items.map(i=>({id:i.id,width:((width+12)*moduleSpan(i)/12-12)/width*100,height:i.frameHeight})),heights,width,12)}
export function resizeSpan(box,dx,width){return snapSpan((box.width+dx+12)/(width+12)*12)}
export function dropModule(items,boxes,id,x,y){const others=items.filter(i=>i.id!==id);if(!others.length)return items;let target=others.find(i=>{const b=boxes[i.id];return x>=b.left&&x<=b.left+b.width&&y>=b.top&&y<=b.top+b.height});if(!target)target=others.reduce((a,b)=>{const distance=i=>{const r=boxes[i.id];return Math.hypot(x-(r.left+r.width/2),y-(r.top+r.height/2))};return distance(a)<distance(b)?a:b});const r=boxes[target.id],full=r.width>Math.max(...Object.values(boxes).map(b=>b.left+b.width))*.7,after=full?y>r.top+r.height/2:x>r.left+r.width/2;const before=after?others[others.indexOf(target)+1]?.id:target.id;return reorderItems(items,id,before).map(i=>{const {x,y,width,height,...item}=i;return {...item,span:moduleSpan(i)}})}

export function resizeHeight(height,dy){return Math.max(160,Math.round((height+dy)/16)*16)}
