const gestures=new WeakMap(),suppressed=new WeakMap(),installed=new WeakSet();
export const TOUCH_DRAG_DELAY=350;
export function delayedPointerDrag(bindings){
 function eventFor(g,event,point){return {currentTarget:g.target,target:g.origin,button:0,isPrimary:true,pointerType:'touch',pointerId:g.id,clientX:point?.clientX??g.x,clientY:point?.clientY??g.y,preventDefault:()=>event?.preventDefault?.(),stopPropagation:()=>event?.stopPropagation?.()}}
 function forward(g,key,event){
  if(g.bindings[key])return g.bindings[key](event);
  // Some DOM sorters attach move/up handlers to the parent after pointerdown.
  g.forwarding=true;
  const type={onPointerMove:'pointermove',onPointerUp:'pointerup',onPointerCancel:'pointercancel'}[key];
  if(type)g.target.dispatchEvent(new PointerEvent(type,{bubbles:true,composed:true,cancelable:true,pointerId:g.id,pointerType:'touch',isPrimary:true,button:0,clientX:event.clientX,clientY:event.clientY}));
  g.forwarding=false;
 }
 function finish(target,cancel,event){const g=gestures.get(target);if(!g)return;clearTimeout(g.timer);g.remove();if(g.active){suppressed.set(target,Date.now()+1000);target.setAttribute?.('data-touch-drag-suppress',String(Date.now()+1000));forward(g,cancel?'onPointerCancel':'onPointerUp',eventFor(g,event,g.last));}target.removeAttribute?.('data-touch-drag-active');gestures.delete(target)}
 return {...bindings,'data-touch-drag':true,
  onPointerDown(e){
   if(e.pointerType!=='touch')return bindings.onPointerDown?.(e);
   if(e.isPrimary===false||e.button!==0)return;
   if(e.target.closest?.('input,textarea,select,a,video,audio,[contenteditable]'))return bindings.onPointerDown?.(e);
   const target=e.currentTarget;finish(target,true,e);
   const doc=target.ownerDocument||document;
   const g={target,origin:e.target,id:e.pointerId,x:e.clientX,y:e.clientY,last:{clientX:e.clientX,clientY:e.clientY},bindings,active:false,moved:false,forwarding:false,timer:null,remove:null};
   gestures.set(target,g);
   const pointer=event=>{if(g.active&&!g.forwarding&&event.pointerType==='touch'&&event.pointerId===g.id)event.stopPropagation()};
   const move=event=>{if(event.touches.length!==1){finish(target,true,event);return}const touch=event.touches[0];g.last=touch;if(!g.active){if(Math.hypot(touch.clientX-g.x,touch.clientY-g.y)>8)finish(target,true,event);return}g.moved=true;event.preventDefault();forward(g,'onPointerMove',eventFor(g,event,touch))};
   const end=event=>finish(target,event.type==='touchcancel',event);
   for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])doc.addEventListener(type,pointer,true);
   doc.addEventListener('touchmove',move,{capture:true,passive:false});doc.addEventListener('touchend',end,true);doc.addEventListener('touchcancel',end,true);
   g.remove=()=>{for(const type of ['pointermove','pointerup','pointercancel','lostpointercapture'])doc.removeEventListener(type,pointer,true);doc.removeEventListener('touchmove',move,true);doc.removeEventListener('touchend',end,true);doc.removeEventListener('touchcancel',end,true)};
   g.timer=setTimeout(()=>{if(gestures.get(target)!==g||target.isConnected===false)return finish(target,true,e);g.active=true;target.setAttribute?.('data-touch-drag-active','true');bindings.onPointerDown?.(eventFor(g,null));},TOUCH_DRAG_DELAY);
  },
  onPointerMove(e){const g=gestures.get(e.currentTarget);if(g?.forwarding)return bindings.onPointerMove?.(e);if(e.pointerType==='touch'){if(g&&!g.active&&Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)finish(e.currentTarget,true,e);return}return bindings.onPointerMove?.(e)},
  onPointerUp(e){const g=gestures.get(e.currentTarget);if(g?.forwarding)return bindings.onPointerUp?.(e);if(e.pointerType==='touch'){if(g&&!g.active)finish(e.currentTarget,true,e);return}return bindings.onPointerUp?.(e)},
  onPointerCancel(e){const g=gestures.get(e.currentTarget);if(g?.forwarding)return bindings.onPointerCancel?.(e);if(e.pointerType==='touch'){if(g&&!g.active)finish(e.currentTarget,true,e);return}return bindings.onPointerCancel?.(e)},
  onLostPointerCapture(e){if(gestures.get(e.currentTarget)?.active)return;return bindings.onLostPointerCapture?.(e)},
  onClickCapture(e){if((suppressed.get(e.currentTarget)||0)>Date.now()){e.preventDefault();e.stopPropagation();return}bindings.onClickCapture?.(e)},
  onContextMenu(e){if(gestures.get(e.currentTarget)?.active||(suppressed.get(e.currentTarget)||0)>Date.now()){e.preventDefault();e.stopPropagation();return}bindings.onContextMenu?.(e)},
  onDragStart(e){if(gestures.get(e.currentTarget)?.active){e.preventDefault();return}bindings.onDragStart?.(e)},
 };
}
export function installDelayedPointerDrag(target){
 if(installed.has(target))return;installed.add(target);
 const bindings={};for(const key of ['Down','Move','Up','Cancel'])bindings['onPointer'+key]=target['onpointer'+key.toLowerCase()];bindings.onLostPointerCapture=target.onlostpointercapture;
 const wrapped=delayedPointerDrag(bindings);target.setAttribute('data-touch-drag','true');
 for(const key of ['Down','Move','Up','Cancel'])target['onpointer'+key.toLowerCase()]=wrapped['onPointer'+key];target.onlostpointercapture=wrapped.onLostPointerCapture;
 target.addEventListener('click',wrapped.onClickCapture,true);target.addEventListener('contextmenu',wrapped.onContextMenu,true);
}
