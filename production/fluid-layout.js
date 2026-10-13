const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function itemWidth(item){return clamp(Number(item.width)||((Number(item.span)||12)/12*100),12,100)}
export function reorderItems(items,id,before){const item=items.find(i=>i.id===id);if(!item||id===before)return items;const next=items.filter(i=>i.id!==id),index=next.findIndex(i=>i.id===before);next.splice(index<0?next.length:index,0,item);return next}
export function fluidBoxes(items,heights={},canvasWidth=1000,gap=12){
 const unit=canvasWidth/100,boxes={},placed=[];
 const intersects=(a,b)=>a.left<b.left+b.width+gap&&a.left+a.width+gap>b.left&&a.top<b.top+b.height+gap&&a.top+a.height+gap>b.top;
 for(const item of items){if(!Number.isFinite(item.x)||!Number.isFinite(item.y))continue;const width=itemWidth(item)*unit,box={left:clamp(item.x*unit,0,Math.max(0,canvasWidth-width)),top:Math.max(0,item.y),width,height:Number(item.height)||heights[item.id]||220};boxes[item.id]=box;placed.push(box)}
 for(const item of items){if(boxes[item.id])continue;const width=itemWidth(item)*unit,height=Number(item.height)||heights[item.id]||220;const candidates=[{left:0,top:0},...placed.flatMap(b=>[{left:b.left+b.width+gap,top:b.top},{left:0,top:b.top+b.height+gap},{left:b.left,top:b.top+b.height+gap}])].filter(p=>p.left+width<=canvasWidth+.5).sort((a,b)=>a.top-b.top||a.left-b.left);
 const point=candidates.find(p=>!placed.some(b=>intersects({...p,width,height},b)))||{left:0,top:Math.max(0,...placed.map(b=>b.top+b.height+gap))};const box={...point,width,height};boxes[item.id]=box;placed.push(box)}
 return {boxes,height:Math.max(80,...placed.map(b=>b.top+b.height))+gap};
}
export function moveFluid(box,dx,dy,canvasWidth){const width=box.width/canvasWidth*100;return {x:clamp((box.left+dx)/canvasWidth*100,0,100-width),y:Math.max(0,box.top+dy),width}}
export function resizeFluid(box,dx,dy,canvasWidth,heightEnabled=false){const width=clamp((box.width+dx)/canvasWidth*100,12,100-box.left/canvasWidth*100);return {x:box.left/canvasWidth*100,y:box.top,width,...(heightEnabled?{height:Math.max(100,box.height+dy)}:{})}}
export function fileLabel(file){const ext=(file.name||'').split('.').at(-1)?.toUpperCase();return ext&&ext.length<=8?ext:'FILE'}
