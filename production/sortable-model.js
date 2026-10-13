import {reorderItems} from './fluid-layout.js';
export function insertionTarget(rect,x){return x>rect.left+rect.width/2}
export function insertItem(items,id,target,after=false){const remaining=items.filter(i=>i.id!==id),index=remaining.findIndex(i=>i.id===target);if(index<0)return items;const before=after?remaining[index+1]?.id:target;return reorderItems(items,id,before).map(({x,y,width,height,...item})=>item)}
