import assert from 'node:assert/strict';
import {createHubModule,createHubTab} from '../production/module-hub.js';
import {planningKinds,planningSource,planningSnapshot,removePlanningModule,planningGroups,planningTeams,planningMembers,planningEquipment,movePlanningEntry,visiblePlanningFields} from '../production/planning-model.js';
import {applyImportedContent,importedModule} from '../production/imported-modules.js';
import {resetModule} from '../production/project-lifecycle.js';
for(const kind of ['section-heading',...planningKinds])assert.equal(createHubModule(kind).kind,kind);
for(const id of ['filming-operations','event-operations','lesson-plan','travel-plan']){
 const tab=createHubTab(id),other=createHubTab(id);assert.equal(tab.modules.length,8);assert.notEqual(tab.modules[1].id,other.modules[1].id);
 const root=tab.modules[1],view=tab.modules[3];assert.equal(planningSource(view,tab.modules),root);root.planData.entries[0].title='수정';assert.equal(planningSource(view,tab.modules).planData.entries[0].title,'수정');
 const snapshot=planningSnapshot(view,tab.modules);snapshot.planData.entries[0].title='사본';assert.equal(root.planData.entries[0].title,'수정');assert.equal(snapshot.dataModuleId,null);
 const remaining=removePlanningModule(tab.modules,root.id),kept=remaining.find(m=>m.id===view.id);assert.equal(kept.planData.entries[0].title,'수정');assert.equal(kept.dataModuleId,null);
 const imported=importedModule(planningSnapshot(view,tab.modules),{id:'copy',source:{kind:'project',ownerId:'p',moduleId:view.id}});assert.equal(imported.dataModuleId,null);assert.ok(imported.sourceCopy);assert.equal(applyImportedContent(view,imported).dataModuleId,null);
 assert.equal(visiblePlanningFields(root.planData,root.hiddenPlanFields).some(f=>f.id==='time'),false);
}
const modules=[{id:'a',kind:'group-list',dataModuleId:'b'},{id:'b',kind:'group-list',dataModuleId:'a'}];assert.equal(planningSource(modules[0],modules),null);
const w={productions:[{id:'p',name:'공연',teams:[{id:'a',name:'준비팀',members:[{memberId:'one'}]},{id:'b',name:'진행팀',members:[{memberId:'two'}]}]}],members:[{id:'one',name:'하나'},{id:'two',name:'둘'},{id:'gone',deleted:true}],equipment:[{id:'gear',ownerId:'one',inventory:[{id:'mic',name:'마이크'}]}]};
assert.equal(planningTeams(w)[0].key,'p:a');assert.deepEqual(planningMembers(w,'p:a').map(m=>m.id),['one']);assert.equal(planningEquipment(w)[0].key,'gear:mic');
const data={fields:[{id:'team',type:'team'}],groups:[],entries:[{id:'1',values:{team:'p:a'}},{id:'2',values:{team:'p:b'}},{id:'3',values:{}}]};
assert.deepEqual(planningGroups(data,'field:team',w).map(g=>g.entries.length),[1,1,1]);assert.equal(planningGroups(data,'field:team',w)[0].name,'공연 / 준비팀');
assert.equal(movePlanningEntry(data,'1',1).entries[1].id,'1');assert.equal(data.entries[0].id,'1');
const module={kind:'assignment-table',planData:{groups:[{id:'g',teamId:'p:a'}],fields:[{id:'team',type:'team'},{id:'person',type:'member'},{id:'day',type:'date'},{id:'done',type:'check'}],entries:[{id:'r',values:{team:'p:a',person:'one',day:'2026-10-15',done:true}}]}};
assert.deepEqual(resetModule(module,{owners:true,dates:true,done:true}).planData.entries[0].values,{team:'',person:'',day:'',done:false});assert.equal(module.planData.entries[0].values.person,'one');
console.log('Planning: reusable templates, shared records, independent copies, source deletion, cycles, team grouping/member scope, equipment, order and archive reset passed');

const groupedOrder={fields:[],groups:[{id:'one',name:'하나'},{id:'two',name:'둘'}],entries:[{id:'a',groupId:'one'},{id:'b',groupId:'two'},{id:'c',groupId:'one'}]};assert.equal(movePlanningEntry(groupedOrder,'a',1).entries[2].id,'a');assert.equal(movePlanningEntry(groupedOrder,'a',-1),groupedOrder);
