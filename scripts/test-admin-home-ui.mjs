import * as structure from '../production/project-structure.js';
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import * as model from '../production/admin-home-model.js';
const require=createRequire(import.meta.url),esbuild=require(process.env.PRODUCTION_ESBUILD||'esbuild'),jsx=(type,props,key)=>({type,props,key});
const account={role:'admin',memberId:'m'},state=[];let cursor=0;
const ctx={module:{exports:{}},exports:{},window:{appAccount:account},require(name){if(name==='react')return {useState:v=>{const i=cursor++;if(!(i in state))state[i]=typeof v==='function'?v():v;return [state[i],v=>state[i]=v]},useEffect(){},useRef:()=>({current:null}),useLayoutEffect(){}};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='./project-structure.js')return structure;if(name==='./admin-home-model.js')return model;if(name==='./people-model.js')return {memberLabel:m=>m?.name||''};return new Proxy({},{get:(_,key)=>key})}};
vm.runInNewContext(esbuild.transformSync(fs.readFileSync('production/AdminHome.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,ctx);
function nodes(n){return [n,...[n?.props?.children].flat(Infinity).filter(v=>v&&typeof v==='object').flatMap(nodes)]}
let w={members:[{id:'m',name:'사용자A'}],productions:[{id:'g',name:'제작',tasks:[]}],projects:[{id:'p',name:'프로젝트',productionId:'g',status:'진행 중',due:model.localDay(),updatedAt:'2026-10-13T00:00:00Z',tasks:[{id:'t',title:'편집',due:model.localDay(),owner:'m'}],schedules:[]}]},opened;
const render=()=>{cursor=0;return ctx.module.exports.AdminHome({workspace:w,onChange:fn=>w=fn(w),onOpen:(...a)=>opened=a,onReferences(){}})};
let tree=render();assert.equal(nodes(tree).filter(n=>n.type==='h1').length,0);const period=nodes(tree).find(n=>n.props?.className==='admin-home-heading');assert.equal(period.props.children.props.className,'admin-segment');const check=nodes(tree).find(n=>n.props?.['aria-label']==='편집 완료');assert.ok(check);nodes(tree).find(n=>n.props?.className==='admin-task-title').props.onClick();assert.equal(opened[0].projectId,'p');assert.equal(opened[1],'task');
assert.equal(nodes(tree).find(n=>n.props?.['aria-label']==='홈 프로젝트 필터'),undefined);check.props.onClick();assert.equal(w.projects[0].tasks[0].done,true);tree=render();assert.equal(nodes(tree).filter(n=>n.props?.['aria-label']==='편집 완료').length,0);
assert.match(fs.readFileSync('ui/decorate.js','utf8'),/\.admin-home button/);
assert.match(fs.readFileSync('production/entry.tsx','utf8'),/section==='dashboard'\|\|section==='overview'/);
assert.match(fs.readFileSync('production/entry.tsx','utf8'),/await \(window as any\)\.openRefs/);
console.log('Admin home UI: render, source navigation, completion updates, filter, administrator guard and preserved text buttons passed');

const homeSource=fs.readFileSync('production/AdminHome.tsx','utf8');assert.ok(homeSource.indexOf("진행 중 프로젝트")<homeSource.indexOf('<h2>할 일</h2>'));assert.match(homeSource,/\[\s*['"]프로젝트['"]\s*,\s*data\.allProjects\.length\s*,\s*['"]projects['"]/);
