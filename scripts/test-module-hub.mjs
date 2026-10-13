import assert from 'node:assert/strict';
import {moduleTemplates,tabTemplates,createHubModule,createHubTab} from '../production/module-hub.js';
const removed=['class-roster','assignments','offering','class-plan','school-calendar','requests','meeting','budget','accounting','volunteers','prayer','service-plan'];
for(const id of removed)assert.ok(!moduleTemplates.some(t=>t.id===id));
for(const tab of tabTemplates)for(const id of tab.modules)assert.ok(moduleTemplates.some(t=>t.id===id));
assert.deepEqual(createHubTab('blank').modules,[]);
const first=createHubTab('work-board'),second=createHubTab('work-board');assert.notEqual(first.id,second.id);assert.notEqual(first.modules[0].id,second.modules[0].id);
assert.equal(createHubModule('divider').kind,'divider');assert.ok(!moduleTemplates.some(t=>t.kind==='wordcraft'));
console.log('Hub: removed presets, valid tab dependencies, blank tab, isolated IDs and divider passed');
