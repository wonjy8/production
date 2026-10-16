// Columns are structural blocks. Content stays in the tab's flat module collection,
// keeping file ownership, search, completion and permission checks unchanged.
export const columnGap = 16;
export const isBlockLayout = items => items.some(i => i.blockLayout || i.kind === 'columns');
export function columnModule(count) {
  return {id:crypto.randomUUID(),kind:'columns',title:`${count}단 열`,blockLayout:true,span:12,
    columnSlots:Array.from({length:count},()=>crypto.randomUUID())};
}
export function descendants(items,id) {
  const ids=new Set([id]);
  for(let n=0;n<items.length;n++) {
    let changed=false;
    const slots=new Set(items.filter(i=>ids.has(i.id)).flatMap(i=>i.columnSlots||[]));
    for(const i of items) if(slots.has(i.parentSlot)&&!ids.has(i.id)){ids.add(i.id);changed=true;}
    if(!changed)break;
  }
  return ids;
}
function parentGroup(items,item){return items.find(i=>i.kind==='columns'&&i.columnSlots?.includes(item?.parentSlot));}
export function columnRoot(items,item){let root=item;const seen=new Set();while(root&&!seen.has(root.id)){seen.add(root.id);const p=parentGroup(items,root);if(!p)break;root=p;}return root;}
// Sequential blocks occupy the same lane: count the widest child, not their sum.
export function columnLanes(items,item,seen=new Set()) {
  if(item?.kind!=='columns'||seen.has(item.id))return 1;
  const next=new Set(seen).add(item.id);
  return (item.columnSlots||[]).reduce((n,slot)=>n+Math.max(1,...items.filter(i=>i.parentSlot===slot).map(i=>columnLanes(items,i,next))),0);
}
export function validColumns(items){return items.filter(i=>i.kind==='columns'&&!parentGroup(items,i)).every(i=>columnLanes(items,i)<=4);}
export function mergeColumn(items,id,boundary) {
  const group=items.find(i=>i.id===id), slots=group?.columnSlots;
  if(!slots||boundary<0||boundary>=slots.length-1)return items;
  const left=slots[boundary],right=slots[boundary+1];
  const l=items.filter(i=>i.parentSlot===left),r=items.filter(i=>i.parentSlot===right);
  const remaining=slots.filter(s=>s!==right),members=new Set([...l,...r].map(i=>i.id));
  let next=items.filter(i=>!members.has(i.id));
  const at=next.findIndex(i=>i.id===id)+1;
  next.splice(at,0,...[...l,...r].map(i=>({...i,parentSlot:left,span:12})));
  if(remaining.length===1){
    next=next.filter(i=>i.id!==id).map(i=>i.parentSlot===left?{...i,parentSlot:group.parentSlot}:i);
  }else next=next.map(i=>i.id===id?{...i,columnSlots:remaining,columnWeights:undefined}:i);
  return next;
}
export function blockBoxes(items,heights,width) {
  const boxes={}, slots={},guides=[];
  const known=new Set(items.filter(i=>i.kind==='columns').flatMap(i=>i.columnSlots||[]));
  const roots=items.filter(i=>!i.parentSlot||!known.has(i.parentSlot));
  const visited=new Set();
  function stack(list,left,top,w){let y=top;for(const i of list){if(visited.has(i.id))continue;visited.add(i.id);
    let h;
    if(i.kind==='columns'){
      const keys=i.columnSlots||[],weights=keys.map((_,n)=>Math.max(.1,i.columnWeights?.[n]||1)),sum=weights.reduce((a,b)=>a+b,0);
      let x=left;const slotBoxes=[];
      for(let n=0;n<keys.length;n++){
        const sw=Math.max(1,(w-columnGap*(keys.length-1))*weights[n]/sum);
        const sh=stack(items.filter(child=>child.parentSlot===keys[n]),x,y,sw);
        slotBoxes.push({id:keys[n],left:x,top:y,width:sw,height:Math.max(80,sh)});x+=sw+columnGap;
      }
      h=Math.max(80,...slotBoxes.map(s=>s.height));
      for(const s of slotBoxes)slots[s.id]={...s,height:h,groupId:i.id};
      for(let n=0;n<slotBoxes.length-1;n++)guides.push({id:i.id,index:n,left:slotBoxes[n].left+slotBoxes[n].width+columnGap/2,top:y,height:h});
    }else h=i.kind==='divider'?32:i.frameHeight||heights[i.id]||220;
    boxes[i.id]={left,top:y,width:w,height:h};y+=h+12;
  }return list.length?y-top-12:0;}
  const height=stack(roots,0,0,width);
  return {boxes,slots,guides,height:Math.max(80,height)};
}
export function blockDropTarget(items,boxes,id,x,y,width) {
  const excluded=descendants(items,id),eligible=items.filter(i=>!excluded.has(i.id));
  const layout=blockBoxes(items,Object.fromEntries(Object.entries(boxes).map(([key,b])=>[key,b.height])),width);
  const slot=Object.values(layout.slots).filter(s=>!excluded.has(s.groupId)&&x>=s.left&&x<=s.left+s.width&&y>=s.top&&y<=s.top+s.height)
    .sort((a,b)=>a.width-b.width)[0];
  const parentSlot=slot?.id;
  const peers=eligible.filter(i=>(i.parentSlot||undefined)===parentSlot);
  const anchor=peers.find(i=>boxes[i.id]&&y<boxes[i.id].top+boxes[i.id].height/2);
  const last=peers.at(-1),b=anchor?boxes[anchor.id]:last?boxes[last.id]:slot;
  const top=anchor?b.top:last?b.top+b.height+6:slot?.top||0;
  return {mode:'block',parentSlot,targetId:anchor?.id,line:{left:slot?.left||0,top,width:slot?.width||width,height:3},label:'여기에 모듈 놓기'};
}
export function applyBlockDrop(items,id,target) {
  const moving=items.find(i=>i.id===id);if(!moving||!target)return items;
  const nested=descendants(items,id),parent=items.find(i=>i.columnSlots?.includes(target.parentSlot));
  if(parent&&nested.has(parent.id))return items;
  const group=items.filter(i=>nested.has(i.id)).map(i=>i.id===id?{...i,parentSlot:target.parentSlot,blockLayout:true,span:12}:i);
  const next=items.filter(i=>!nested.has(i.id));
  let at=target.targetId?next.findIndex(i=>i.id===target.targetId):-1;
  if(at<0){const peers=next.filter(i=>(i.parentSlot||undefined)===target.parentSlot);const last=peers.at(-1);at=last?Math.max(...next.map((i,n)=>descendants(next,last.id).has(i.id)?n:-1))+1:parent?next.indexOf(parent)+1:next.length;}
  next.splice(at,0,...group);
  return validColumns(next)?next:items;
}
// Preserve existing row/column order and IDs when adopting explicit containers.
export function migrateColumns(items,legacyBoxes){
  if(!items.length||isBlockLayout(items))return items;
  const rows=[];
  for(const i of items){const b=legacyBoxes[i.id];if(!b)continue;
    let row=rows.find(r=>Math.abs(r.top-b.top)<3||i.columnId&&r.items.some(m=>m.columnId===i.columnId));
    if(!row){row={top:b.top,items:[]};rows.push(row);}row.items.push(i);
  }
  const out=[];
  for(const row of rows.sort((a,b)=>a.top-b.top)){
    const lanes=[];
    for(const i of row.items){let lane=lanes.find(l=>i.columnId&&l.some(m=>m.columnId===i.columnId));if(!lane){lane=[];lanes.push(lane);}lane.push(i);}
    lanes.sort((a,b)=>legacyBoxes[a[0].id].left-legacyBoxes[b[0].id].left);
    const group=lanes.length>1?columnModule(Math.min(4,lanes.length)):null;
    if(group){group.id='columns:'+row.items[0].id;group.columnSlots=group.columnSlots.map((_,n)=>group.id+':'+n);group.columnWeights=lanes.slice(0,4).map(l=>legacyBoxes[l[0].id].width);out.push(group);}
    lanes.forEach((lane,n)=>lane.forEach(i=>{const {columnId,rowBreakBefore,rowBreakAfter,x,y,width,height,...rest}=i;out.push({...rest,span:12,blockLayout:true,...(group?{parentSlot:group.columnSlots[Math.min(n,3)]}:{})});}));
  }
  return out;
}

// A boundary snaps to eighths, with thirds for balanced three-column layouts.
export const columnStops=[1/8,1/4,1/3,3/8,1/2,5/8,2/3,3/4,7/8];
export function snapColumnWidths(widths,index,delta,direction=0){
 const sum=widths.reduce((a,b)=>a+b,0),before=widths.slice(0,index).reduce((a,b)=>a+b,0),pair=widths[index]+widths[index+1],current=before+widths[index],min=sum/8;
 const choices=columnStops.map(f=>f*sum).filter(v=>v>=before+min-.01&&v<=before+pair-min+.01);
 const next=direction?choices.filter(v=>direction>0?v>current+.1:v<current-.1).sort((a,b)=>direction>0?a-b:b-a)[0]:choices.sort((a,b)=>Math.abs(a-current-delta)-Math.abs(b-current-delta))[0];
 if(next===undefined)return widths;
 return widths.map((v,i)=>i===index?next-before:i===index+1?pair-next+before:v);
}
