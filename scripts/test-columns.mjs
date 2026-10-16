import assert from 'node:assert/strict';
import { columnModule, columnLanes, validColumns, blockBoxes, applyBlockDrop, mergeColumn, migrateColumns, descendants } from '../production/column-layout.js';
import {snapBoxes,moduleDropTarget} from '../production/snap-layout.js';
import {transferModule} from '../production/module-transfer.js';
const outer=columnModule(2),inner=columnModule(3);inner.parentSlot=outer.columnSlots[0];
let items=[outer,inner,{id:'a',kind:'text',text:'KEEP A',parentSlot:inner.columnSlots[0]},{id:'b',kind:'file',files:[{id:'original'}],parentSlot:outer.columnSlots[1]}];
assert.equal(columnLanes(items,outer),4);assert(validColumns(items));
const extra=columnModule(2);extra.parentSlot=outer.columnSlots[1];assert(!validColumns([...items,extra]));
const denied=applyBlockDrop([...items,{...extra,parentSlot:undefined}],extra.id,{mode:'block',parentSlot:outer.columnSlots[1]});assert.equal(denied.find(i=>i.id===extra.id).parentSlot,undefined);
assert.equal(applyBlockDrop(items,outer.id,{mode:'block',parentSlot:inner.columnSlots[0]}),items);
for(const width of [280,700,1200]){const layout=blockBoxes(items,{a:160,b:220},width);assert.equal(layout.guides.length,3);for(const b of Object.values(layout.boxes)){assert(b.left>=0);assert(b.left+b.width<=width+.01);}assert.equal(layout.boxes.a.top,0);assert.equal(layout.boxes.b.top,0);const slot=layout.slots[inner.columnSlots[1]],target=moduleDropTarget(items,layout.boxes,'b',slot.left+slot.width/2,30,width);assert.equal(target.parentSlot,slot.id);const moved=applyBlockDrop(items,'b',target);assert.equal(moved.find(i=>i.id==='b').parentSlot,slot.id);}
// Removing a boundary appends right-hand blocks after all left-hand blocks.
const group=columnModule(3),content=['a','b','c','d'].map((id,n)=>({id,kind:'text',text:id,parentSlot:group.columnSlots[n<2?0:n-1]}));
let merged=mergeColumn([group,...content],group.id,0);assert.deepEqual(merged.filter(i=>i.parentSlot===group.columnSlots[0]).map(i=>i.id),['a','b','c']);
merged=mergeColumn(merged,group.id,0);assert(!merged.some(i=>i.kind==='columns'));assert.deepEqual(merged.map(i=>i.id),['a','b','c','d']);assert(merged.every(i=>!i.parentSlot));
const nestedMerge=mergeColumn(items,outer.id,0);assert(!nestedMerge.some(i=>i.id===outer.id));assert.equal(nestedMerge.find(i=>i.id===inner.id).parentSlot,undefined);assert.equal(nestedMerge.find(i=>i.id==='b').files[0].id,'original');
const old=[{id:'x',kind:'text',span:6},{id:'y',kind:'file',span:6,files:[{id:'original'}]}];const migrated=migrateColumns(old,snapBoxes(old,{},1000).boxes);assert.equal(migrated[0].kind,'columns');assert.deepEqual(migrateColumns(old,snapBoxes(old,{},1000).boxes),migrated);assert.equal(migrated.filter(i=>i.parentSlot).length,2);assert.equal(migrated.find(i=>i.id==='y').files[0].id,'original');assert.equal(migrateColumns(migrated,{}),migrated);
const tabs=transferModule([{id:'from',modules:items},{id:'to',modules:[]}],'from','to',outer.id);assert.equal(tabs[0].modules.length,0);assert.equal(tabs[1].modules.length,items.length);assert.equal(descendants(tabs[1].modules,outer.id).size,items.length);
const childTransfer=transferModule([{id:'from',modules:items},{id:'to',modules:[]}],'from','to','a');assert(!childTransfer[1].modules[0].parentSlot);
console.log('Columns: nested four-lane budget, responsive geometry, empty-slot drops, cycle prevention, lossless merge/unwrap, migration and subtree/child transfers passed');

const oldDestination=[{id:'old-left',kind:'text',span:6},{id:'old-right',kind:'text',span:6}];
const migratedTransfer=transferModule([{id:'from',modules:items},{id:'to',modules:oldDestination}],'from','to','a');
assert.equal(migratedTransfer[1].modules.filter(i=>i.kind==='columns').length,1);
assert(migratedTransfer[1].modules.find(i=>i.id==='old-left').parentSlot);
