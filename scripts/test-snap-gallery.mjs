import assert from 'node:assert/strict';
import {moduleSpan,snapBoxes,resizeSpan,resizeHeight,dropModule} from '../production/snap-layout.js';
import {justifiedRows} from '../production/justified-gallery.js';
assert.equal(moduleSpan({width:49}),6);assert.equal(resizeSpan({width:494},22,1000),6);assert.equal(resizeSpan({width:494},150,1000),8);
const items=[{id:'a',span:6,x:90,y:800},{id:'b',span:6},{id:'c',span:12}],layout=snapBoxes(items,{a:200,b:280,c:100},1000);
assert.equal(layout.boxes.a.top,0);assert.equal(layout.boxes.b.top,0);assert.ok(layout.boxes.c.top>=292);
const next=dropModule(items,layout.boxes,'c',0,0);assert.equal(next[0].id,'c');assert.equal(next[1].x,undefined);
for(const width of [320,700,1200])for(const ratios of [[1.5,1,.7,2,1.2],[.5,.5,.5],[2,2,2,2]]){const rows=justifiedRows(ratios,width);assert.equal(rows.at(-1).end,ratios.length);for(const r of rows){assert.ok(Math.abs(r.widths.reduce((a,b)=>a+b,0)+10*(r.widths.length-1)-width)<.001);r.widths.forEach((w,i)=>assert.ok(Math.abs(w/r.height-ratios[r.start+i])<.001))}}
console.log('Snapped sizes, legacy placement cleanup, non-overlapping grid, justified aspect-preserving rows passed');

assert.equal(resizeHeight(220,43),256);assert.equal(resizeHeight(200,-500),160);const fixed=snapBoxes([{id:"a",span:12,frameHeight:400},{id:"b",span:12}],{},1000);assert.equal(fixed.boxes.a.height,400);assert.equal(fixed.boxes.b.top,412);assert.equal(dropModule([{id:"a",frameHeight:400},{id:"b"}],fixed.boxes,"a",0,1000).find(i=>i.id==="a").frameHeight,400);
const {fittedRows,maximumGalleryHeight}=await import('../production/justified-gallery.js');for(const height of [150,400,1000,4000]){const ratios=[1.5,.7,2,1],rows=fittedRows(ratios,700,height),actual=rows.reduce((s,r)=>s+r.height,0)+10*(rows.length-1);assert.ok(Math.abs(actual-Math.min(height,maximumGalleryHeight(ratios,700)))<.001);for(const row of rows)row.widths.forEach((w,i)=>assert.ok(Math.abs(w/row.height-ratios[row.start+i])<.001))}console.log('Height fitting: grows/reflows to requested height, keeps aspect ratios and stops at single-image width limit');

assert.equal(resizeHeight(3000,5000),8000);assert.equal(resizeHeight(8000,32000),40000);console.log("Module height: no maximum, magnetic steps and minimum preserved");
