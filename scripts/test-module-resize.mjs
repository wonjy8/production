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
import * as itemMenu from '../ui/item-menu.js';import vm from 'node:vm';import fs from 'node:fs';import {createRequire} from 'node:module';import * as model from '../production/module-resize.js';
const require=createRequire(import.meta.url),esbuild=require(process.env.PRODUCTION_ESBUILD||'esbuild');
const jsx=(type,props,key)=>({type,props,key}),values=[];let hook=0,writes=0;
let tab={id:'t',name:'Test',modules:[{id:'a',kind:'materials',title:'Left',span:6},{id:'b',kind:'materials',title:'Right',span:6}]};
const grid={clientWidth:1016,querySelectorAll:()=>boxes.slice(0,2).map(b=>({dataset:{moduleId:b.id},getBoundingClientRect:()=>b.rect}))};const target={closest:()=>grid,setPointerCapture(){},releasePointerCapture(){}};
let resizing=false;const context={window:{},module:{exports:{}},exports:{},document:{documentElement:{classList:{add(){resizing=true},remove(){resizing=false}}}},getComputedStyle:()=>({columnGap:'16px'}),require(name){if(name==='./shared-modules.js')return sharedModules;if(name==='react')return {useRef:initial=>({current:initial}),useEffect(){},useState(initial){const i=hook++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>values[i]=v]}};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='./module-resize.js')return model;if(name==='../ui/item-menu.js')return itemMenu;return new Proxy({},{get:(_,k)=>k})}};
vm.runInNewContext(esbuild.transformSync(fs.readFileSync('production/ModuleTab.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,context);
function nodes(root){return [root,...[root?.props?.children].flat(Infinity).filter(x=>x&&typeof x==='object').flatMap(nodes)]}
function edge(){hook=0;const tree=context.module.exports.ModuleTab({tab,workspace:{projects:[]},defaultIds:[],onTabChange(fn){tab=fn(tab);writes++}});return nodes(tree).find(n=>n.props?.role==='separator'&&n.props['aria-label']==='Left 오른쪽 너비 조절')}
const event=x=>({button:0,clientX:x,pointerId:1,currentTarget:target,preventDefault(){},stopPropagation(){}});
let grip=edge();grip.props.onPointerDown(event(500));grip.props.onPointerMove(event(672));assert.equal(writes,0);assert.equal(resizing,true);grip.props.onPointerUp(event(672));assert.equal(writes,1);assert.equal(resizing,false);assert.deepEqual(JSON.parse(JSON.stringify(tab.modules.map(m=>m.span))),[8,4]);
grip=edge();grip.props.onPointerDown(event(500));grip.props.onPointerMove(event(250));grip.props.onPointerCancel(event(250));assert.equal(writes,1);assert.deepEqual(JSON.parse(JSON.stringify(tab.modules.map(m=>m.span))),[8,4]);assert.equal(resizing,false);
console.log('Module pointer handlers: preview avoids writes, release saves both widths, cancel preserves saved layout');
