import assert from 'node:assert/strict';
import '../ui/completion-policy.js';
import {archiveProject} from '../production/project-lifecycle.js';
const policy=globalThis.productionCompletionPolicy,copy=x=>structuredClone(x);
const w={projects:[{id:'child',name:'업무 그룹',productionId:'parent',tasks:[]}],productions:[{id:'parent',name:'프로젝트',status:'완료',tasks:[]}],timetableSchedules:[{id:'schedule',productionId:'parent',title:'보존'}]};
for(const mutate of [n=>n.productions[0].name='변경',n=>n.projects[0].tasks.push({id:'new'}),n=>n.projects.push({id:'new',productionId:'parent'}),n=>n.timetableSchedules[0].title='변경',n=>n.productions[0].completion={}]){const n=copy(w);mutate(n);assert.throws(()=>policy.validate(w,n));}
const resume=copy(w);resume.productions[0].status='진행 중';assert.doesNotThrow(()=>policy.validate(w,resume));
const doneChild=copy(w);doneChild.projects[0].status='완료';const bad=copy(doneChild);bad.projects[0].status='진행 중';assert.throws(()=>policy.validate(doneChild,bad));
const file='a'.repeat(36);assert.deepEqual([...policy.fileIds({kind:'file',id:'module',files:[{id:file,name:'a.txt',mime:'text/plain',kind:'file'}]},new Set([file]))],[file]);
const linked={projects:[],productions:[{id:'source',name:'원본',customTabs:[{id:'source-tab',modules:[{id:'original',kind:'file',files:[{id:file,name:'a.txt',mime:'text/plain',kind:'file'}]},{id:'planning-data',kind:'group-list',planData:{entries:[{id:'entry',title:'보존할 내용'}]}}]}]},{id:'target',name:'대상',status:'진행 중',customTabs:[{id:'target-tab',modules:[{id:'placement',kind:'file',source:{kind:'production',ownerId:'source',moduleId:'original'}},{id:'plan-view',kind:'group-list',dataModuleId:'planning-data'}]}]}]};
const archived=archiveProject(linked,'production','target',{outputs:[],exceptionReason:'기록'},[],{idFactory:()=> 'archive'}),modules=archived.productions[1].customTabs[0].modules;
assert.equal(modules[0].source,undefined);assert.equal(modules[0].files[0].id,file);assert.equal(modules[0].id,'placement');assert.equal(modules[1].dataModuleId,null);assert.equal(modules[1].planData.entries[0].title,'보존할 내용');
linked.productions[0].customTabs[0].modules[0].files[0].name='changed';assert.equal(modules[0].files[0].name,'a.txt');
assert.ok(linked.productions[1].customTabs[0].modules[0].source);
console.log('Completion policy: readonly parent/child/schedule/marker guards, resume, physical file detection and independent live-module/data snapshots passed');
