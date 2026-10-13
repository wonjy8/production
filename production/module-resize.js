export function resizeModuleSpans(span,neighborSpan,delta,side='right'){
 const desired=Math.round(span+delta*(side==='left'?-1:1));
 const max=neighborSpan==null?12:span+neighborSpan-3;
 const next=Math.max(3,Math.min(max,desired));
 return {span:next,neighborSpan:neighborSpan==null?null:span+neighborSpan-next};
}
export function adjacentModule(id,side,boxes){
 const own=boxes.find(b=>b.id===id);if(!own)return null;
 return boxes.find(b=>b.id!==id&&Math.abs(b.rect.top-own.rect.top)<2&&(side==='right'?b.rect.left>=own.rect.right-1&&b.rect.left-own.rect.right<=32:b.rect.right<=own.rect.left+1&&own.rect.left-b.rect.right<=32))?.id||null;
}
