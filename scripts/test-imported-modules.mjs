import assert from 'node:assert/strict';
import {importedModule,applyImportedContent} from '../production/imported-modules.js';
import {resolveSharedModule} from '../production/shared-modules.js';
const original={id:'original',kind:'text',text:'Original',span:6,x:3,tags:['shared']},source={kind:'reference',ownerId:'ref',moduleId:'original'};
const copy=importedModule(original,{id:'copy',source,span:3,x:0});copy.text='Draft';copy.tags.push('local');
assert.equal(original.text,'Original');assert.deepEqual(original.tags,['shared']);assert.equal(copy.sourceCopy,true);assert.equal(copy.source,undefined);assert.deepEqual(copy.importSource,source);assert.equal(resolveSharedModule(copy,{projects:[],productions:[]},[]),copy);
const saved=applyImportedContent(original,copy);assert.equal(saved.text,'Draft');assert.equal(saved.id,'original');assert.equal(saved.span,6);assert.equal(saved.x,3);assert.equal(saved.source,undefined);assert.equal(saved.sourceCopy,undefined);assert.equal(original.text,'Original');
console.log('Imported content: independent snapshot, missing-origin editing and explicit save preserve source identity and layout');
