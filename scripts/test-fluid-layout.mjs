import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import * as model from '../production/fluid-layout.js';
import * as touchDrag from '../ui/touch-drag.js';
const items=[{id:'a',width:48},{id:'b',width:48},{id:'c',width:48}],heights={a:400,b:150,c:100};
let layout=model.fluidBoxes(items,heights,1000,12);assert.equal(layout.boxes.a.top,0);assert.equal(layout.boxes.b.top,0);assert.equal(layout.boxes.c.top,162);assert.equal(layout.boxes.c.left,492);
const moved=model.moveFluid(layout.boxes.a,350,100,1000);assert.equal(moved.x,35);assert.equal(moved.y,100);assert.equal(model.moveFluid(layout.boxes.a,2000,-100,1000).x,52);
const sized=model.resizeFluid(layout.boxes.a,73,53,1000,true);assert.ok(Math.abs(sized.width-55.3)<1e-8);assert.equal(sized.height,453);assert.equal(model.resizeFluid(layout.boxes.a,-2000,-2000,1000,true).width,12);
const custom=[{id:'a',width:33.5,x:20,y:145}];assert.equal(model.fluidBoxes(custom,{a:100},500).boxes.a.left,100);assert.equal(model.fluidBoxes(custom,{a:100},1000).boxes.a.left,200);assert.equal(model.fluidBoxes(custom,{a:100},500).boxes.a.top,145);
assert.deepEqual(model.reorderItems(items,'c','a').map(v=>v.id),['c','a','b']);assert.deepEqual(model.reorderItems(items,'a','a'),items);
// Exercise actual pointer handlers: preview, commit, continuous sizing and cancellation.
const require=createRequire(import.meta.url),esbuild=require(process.env.PRODUCTION_ESBUILD||'esbuild'),jsx=(type,props,key)=>({type,props,key});let values=[],cursor=0,refs=[],refCursor=0,writes=0,current=[{id:'a',width:48},{id:'b',width:48}];
const target={setPointerCapture(){},hasPointerCapture:()=>false},canvas={clientWidth:1000,getBoundingClientRect:()=>({width:1000})};
const context={module:{exports:{}},exports:{},require(name){if(name==='../ui/touch-drag.js')return touchDrag;if(name==='react')return {useEffect(){},useRef:v=>{const i=refCursor++;return refs[i]||(refs[i]={current:i===0?canvas:v})},useState:v=>{const i=cursor++;if(!(i in values))values[i]=v;return [values[i],n=>values[i]=typeof n==='function'?n(values[i]):n]}};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='./fluid-layout.js')return model;throw Error(name)}};
vm.runInNewContext(esbuild.transformSync(fs.readFileSync('production/FluidCanvas.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,context);
function nodes(n){return [n,...[n?.props?.children].flat(Infinity).filter(v=>v&&typeof v==='object').flatMap(nodes)]}
function render(){cursor=0;refCursor=0;return context.module.exports.FluidCanvas({items:current,onChange:fn=>{current=fn(current);writes++},renderItem:(item,index,drag)=>jsx('div',{...drag,'data-drag':item.id})})}
const event=(x,y=0)=>({button:0,pointerId:1,clientX:x,clientY:y,currentTarget:target,target:{closest:()=>null},preventDefault(){},stopPropagation(){}});
let tree=render(),drag=nodes(tree).find(n=>n.props?.['data-drag']==='a');drag.props.onPointerDown(event(0));drag.props.onPointerMove(event(125,80));assert.equal(writes,0);tree=render();assert.equal(nodes(tree).find(n=>n.props?.['data-fluid-id']==='a').props.style.left,'12.5%');drag.props.onPointerUp(event(125,80));assert.equal(writes,1);assert.equal(current[0].x,12.5);assert.equal(current[0].y,80);
tree=render();const edge=nodes(tree).find(n=>n.props?.['aria-label']==='너비 조절');edge.props.onPointerDown(event(0));edge.props.onPointerMove(event(73));edge.props.onPointerUp(event(73));assert.ok(Math.abs(current[0].width-55.3)<1e-8);
tree=render();drag=nodes(tree).find(n=>n.props?.['data-drag']==='a');drag.props.onPointerDown(event(0));drag.props.onPointerMove(event(400,100));drag.props.onPointerCancel(event(400,100));assert.equal(current[0].x,12.5);assert.equal(writes,2);
console.log('Fluid layout: masonry packing, percentage positions on viewport changes, continuous width/height bounds, reorder, drag preview/save and cancel passed');
import * as shared from '../production/shared-modules.js';
import * as projectStructure from '../production/project-structure.js';
const browserCtx={module:{exports:{}},exports:{},require(name){if(name==='react')return {useState:v=>[v,()=>{}]};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='./project-structure.js')return projectStructure;if(name==='./shared-modules.js')return shared;return {Icon:'Icon'}}};vm.runInNewContext(esbuild.transformSync(fs.readFileSync('production/ModuleBrowser.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,browserCtx);
const module={id:'m',kind:'image'},refsInput=[{id:'r',title:'촬영 참고',modules:[module]},{id:'s',title:'원본 촬영',recordType:'source',modules:[{...module,id:'source-m'}]},{id:'trash',title:'삭제',deleted:true,modules:[]}];const project={id:'p',name:'프로젝트',productionId:'prod',customTabs:[{id:'t',name:'일정표',modules:[{id:'tm',kind:'timetable'}]}]};
const folders=browserCtx.module.exports.moduleFolders({projects:[project],productions:[{id:'prod',name:'프로덕션'}]},refsInput);assert.deepEqual(Array.from(folders.map(f=>f.name)),['자료','소스','포트폴리오','프로젝트']);assert.equal(folders[0].folders.length,1);assert.equal(folders[1].folders[0].name,'원본 촬영');assert.equal(folders[1].folders[0].folders[0].items[0].source.ownerId,'s');assert.equal(folders[3].folders[0].folders[0].folders[0].items[0].source.kind,'project');
console.log('Module browser: separate reference/source roots, project groups and tabs, deleted records excluded and canonical import pointers passed');
current=[{id:'a',width:48,height:999}];tree=render();assert.equal(nodes(tree).find(n=>n.props?.['data-fluid-id']==='a').props.style.height,undefined);assert.ok(tree.props.style.height<999);
console.log('Content sizing: stale fixed height is ignored and measured content drives canvas height');
