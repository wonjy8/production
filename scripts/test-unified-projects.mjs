import * as hub from '../production/module-hub.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import * as menus from '../ui/item-menu.js';
import * as structure from '../production/project-structure.js';
import * as shared from '../production/shared-modules.js';
import * as timetable from '../production/timetable-model.js';
import {adminHomeData,completeHomeTask} from '../production/admin-home-model.js';

const w={schemaVersion:2,members:[],productions:[{id:'event',name:'G2A',memberIds:['member'],teams:[{id:'team',members:[{memberId:'member'}]}],tasks:[{id:'parent-task',title:'현장',due:'2026-10-13'}],customTabs:[{id:'old',name:'기존 자료',modules:[{id:'photo',kind:'image',files:[{id:'file',name:'a.jpg'}]}]}],unknown:'retain'}],projects:[{id:'design',name:'디자인',productionId:'event',tasks:[{id:'child-task',title:'포스터',due:'2026-10-13'}],assets:[{id:'asset'}],schedules:[],customTabs:[]},{id:'solo',name:'개인',productionId:'',tasks:[],customTabs:[]},{id:'orphan',name:'별도',productionId:'deleted-parent',tasks:[]},{id:'removed',deleted:true}]};
const before=JSON.stringify(w),entries=structure.projectEntries(w);
assert.deepEqual(entries.map(p=>p.id),['event','solo','orphan']);
assert.equal(entries[0].groups[0].id,'design');
assert.deepEqual(entries[0].tasks.map(t=>t.id),['parent-task','child-task']);
assert.equal(JSON.stringify(w),before);
const emptyBoard=structure.projectBoard(w.productions[0],'production');
assert.equal(emptyBoard.modules.length,0);
const next=structure.updateProjectBoard(w,'event','production',tab=>({...tab,modules:[{id:'linked',kind:'image',source:{kind:'production',ownerId:'event',moduleId:'photo'}}]}));
assert.equal(next.productions[0].customTabs.length,2);
assert.equal(next.productions[0].customTabs[1],w.productions[0].customTabs[0]);
assert.equal(next.productions[0].memberIds,w.productions[0].memberIds);
assert.equal(next.productions[0].teams,w.productions[0].teams);
assert.equal(next.projects,w.projects);
assert.equal(next.productions[0].unknown,'retain');
assert.equal(shared.resolveSharedModule(next.productions[0].customTabs[0].modules[0],next,[]).files[0].id,'file');
const twice=structure.updateProjectBoard(next,'event','production',t=>({...t,modules:[]}));
assert.equal(twice.productions[0].customTabs.length,2);
assert.equal(structure.referenceProjectKey({projectId:'design'},w),'production:event');
assert.equal(structure.referenceProjectKey({projectId:'solo'},w),'project:solo');
assert.deepEqual(structure.assignReferenceProject({id:'r',projectId:'design',blocks:[{id:'f'}]},'production:event'),{id:'r',projectId:'',productionId:'event',blocks:[{id:'f'}]});
assert.equal(structure.assignReferenceProject({id:'r',productionId:'event'},'').productionId,'');
const day=adminHomeData(w,{today:'2026-10-13'});
assert.equal(day.active.length,3);assert.equal(day.active[0].origin.productionId,'event');
assert.deepEqual(day.tasks.map(t=>t.id).sort(),['child-task','parent-task']);
const childRow=day.tasks.find(t=>t.id==='child-task'),done=completeHomeTask(w,childRow,true);
assert.equal(done.projects[0].tasks[0].done,true);assert.equal(done.productions,w.productions);
assert.equal(adminHomeData(w,{today:'2026-10-13',productionId:'solo'}).active[0].id,'solo');

// Exercise the real add action on a project with no work groups.
const require=createRequire(import.meta.url),esbuild=require('esbuild');
const jsx=(type,props,key)=>({type,props,key}),nodes=n=>[n,...[n?.props?.children].flat(Infinity).filter(v=>v&&typeof v==='object').flatMap(nodes)];
let tab={id:'content',name:'내용',modules:[]},cursor=0,values=['',null,true];
const ctx={module:{exports:{}},exports:{},crypto:{randomUUID:()=> 'new-content'},window:{},require(name){
 if(name==='../ui/item-menu.js')return menus;if(name==='react')return {useRef:v=>({current:v}),useEffect(){},useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>values[i]=v]}};
 if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
 if(name==='./shared-modules.js')return shared;if(name==='./module-hub.js')return hub;
 if(name==='./timetable-model.js')return timetable;
 return new Proxy({},{get:(_,key)=>key});
}};
vm.runInNewContext(esbuild.transformSync(readFileSync('production/ModuleTab.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,ctx);
function render(){cursor=0;return ctx.module.exports.ModuleTab({tab,workspace:{members:[],projects:[],productions:[w.productions[0]]},defaultIds:[],productionId:'event',parentScope:true,onTabChange:fn=>tab=fn(tab),onChange(){},onOpen(){},onAddMember(){}})}
let tree=render();nodes(tree).find(n=>n.type==='HubSidebar').props.onAddModule('tasks');
assert.equal(tab.modules[0].kind,'tasks');assert.equal(tab.modules[0].projectId,'');
tree=render();const canvas=nodes(tree).find(n=>n.type==='SnapCanvas');
const item=canvas.props.renderItem(tab.modules[0],0,{onPointerDown(){},onPointerMove(){},onPointerUp(){},onPointerCancel(){}});
assert.ok(nodes(item).some(n=>n.type==='ProductionTasks'&&n.props.productionId==='event'));

// The shell's actual click handler preserves the fixed menu order and routes each button.
const worker=readFileSync('worker/index.js','utf8'),start=worker.indexOf('const sidebarFixedTop='),end=worker.indexOf('\nconst sidebarFixedBottom',start),elements=[],calls=[];
function element(){const el={className:'',hidden:false,innerHTML:'',setAttribute(){},append(){},prepend(){}};elements.push(el);return el}
const nav={window:{appAccount:{role:'admin'}},document:{createElement:element},$:element,spacePicker:{},adminHomeButton:{},packIcon:n=>'<i>'+n+'</i>',closeSpaceMenu(){},openProduction:(...a)=>calls.push(['home',...a]),openRefs:()=>calls.push(['references']),openDatabase:()=>calls.push(['database'])};
nav.closeHub=()=>{};vm.runInNewContext(worker.slice(worker.indexOf('const workspaceDefinitions='),worker.indexOf("let refTagFilter="))+worker.slice(start,end),nav);
assert.ok(nav.window.sidebarMainNav.innerHTML.indexOf('data-main-space="home"')<nav.window.sidebarMainNav.innerHTML.indexOf('data-main-space="references"'));
for(const mainSpace of ['home','references','database'])nav.window.sidebarMainNav.onclick({target:{closest:()=>({dataset:{mainSpace}})}});
assert.deepEqual(calls,[['home',undefined,'dashboard'],['references'],['database']]);
nav.window.appAccount.role='viewer';nav.window.sidebarMainNav.onclick({target:{closest:()=>({dataset:{mainSpace:'home'}})}});
assert.equal(calls.at(-1)[2],'overview');
console.log('Unified projects: one project level, preserved IDs/members/files, exact task origins, board insertion without groups, reference scope and real navigation actions passed');
