import * as columns from '../production/column-layout.js';
import * as sharedModules from '../production/shared-modules.js';
import assert from 'node:assert/strict';
import {resizeModuleSpans,adjacentModule} from '../production/module-resize.js';
assert.deepEqual(resizeModuleSpans(6,6,2),{span:8,neighborSpan:4});
assert.deepEqual(resizeModuleSpans(6,6,20),{span:9,neighborSpan:3});
assert.deepEqual(resizeModuleSpans(6,6,-20),{span:3,neighborSpan:9});
assert.deepEqual(resizeModuleSpans(6,6,2,'left'),{span:4,neighborSpan:8});
assert.deepEqual(resizeModuleSpans(12,null,-6),{span:6,neighborSpan:null});
const boxes=[{id:'a',rect:{left:0,right:500,top:0}},{id:'b',rect:{left:516,right:1016,top:0}},{id:'c',rect:{left:0,right:1016,top:400}}];
assert.equal(adjacentModule('a','right',boxes),'b');assert.equal(adjacentModule('b','left',boxes),'a');assert.equal(adjacentModule('c','right',boxes),null);
console.log('Module resize: paired widths preserve total, both minimums, independent edge resize, same-row neighbor detection');

// The rendered board now owns pointer resizing in SnapCanvas.
import vm from 'node:vm';import fs from 'node:fs';import {createRequire} from 'node:module';
import * as snap from '../production/snap-layout.js';import * as resize from '../production/module-resize.js';
import {delayedPointerDrag} from '../ui/touch-drag.js';
const require=createRequire(import.meta.url),esbuild=require('esbuild'),jsx=(type,props)=>({type,props});
let states=[],cursor=0,refs=[],rc=0,writes=0,items=[{id:'a',span:6,frameHeight:400},{id:'b',span:6}];
const context={window:{},cancelAnimationFrame(){},module:{exports:{}},exports:{},require(n){if(n==='react')return {useEffect(){},useMemo:fn=>fn(),useLayoutEffect(){},useRef:v=>refs[rc++]||(refs[rc-1]={current:v}),useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]}};if(n==='react/jsx-runtime')return {jsx,jsxs:jsx};return {...columns,...snap,...resize,delayedPointerDrag}}};
vm.runInNewContext(esbuild.transformSync(fs.readFileSync('production/SnapCanvas.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,context);
function nodes(n){return [n,...[n?.props?.children].flat(Infinity).filter(v=>v&&typeof v==='object').flatMap(nodes)]}
function edge(){cursor=0;rc=0;return nodes(context.module.exports.SnapCanvas({items,onChange:fn=>{writes++;items=fn(items)},renderItem:()=>null})).find(n=>n.props?.['aria-label']==='모듈 크기 단계 조절')}
const target={setPointerCapture(){},hasPointerCapture:()=>false},event=x=>({button:0,pointerId:1,currentTarget:target,target:{closest:()=>null},clientX:x,clientY:0,preventDefault(){},stopPropagation(){}});
let grip=edge();grip.props.onPointerDown(event(0));grip.props.onPointerMove(event(160));assert.equal(writes,0);grip=edge();grip.props.onPointerUp(event(160));assert.equal(writes,1);assert.equal(items[0].span,8);assert.equal(items[0].frameHeight,400);assert.equal(items[1].span,6);
grip=edge();grip.props.onPointerDown(event(0));grip.props.onPointerMove(event(-300));grip=edge();grip.props.onPointerCancel(event(-300));assert.equal(writes,1);assert.equal(items[0].span,8);
console.log('Board pointer width preview, persisted height, untouched neighbors and canceled resize passed');
