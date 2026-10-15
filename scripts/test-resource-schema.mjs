import assert from 'node:assert/strict';
import {resourceDefaults,resourcePresets,applyResourcePreset,resourceSearchText} from '../production/resource-schema.js';
import {adminHomeData} from '../production/admin-home-model.js';
assert.deepEqual(resourceDefaults.databaseCategories,[]);assert.ok(!JSON.stringify(resourceDefaults).includes('설교'));
const schema={databaseCategories:['기존'],databaseFields:[{id:'custom',label:'사용자 속성',type:'text'}]};
for(const preset of resourcePresets){const next=applyResourcePreset(schema,preset);assert.equal(next.databaseFields[0].id,'custom');assert.ok(next.databaseCategories.includes('기존'));assert.deepEqual(applyResourcePreset(next,preset),next);}
const w={projects:[{id:'p',name:'에피소드 업무',productionId:'g',status:'완료'}],productions:[{id:'g',name:'팟캐스트 시리즈',status:'완료'}]};
const text=resourceSearchText({title:'녹음',filename:'original.wav',url:'https://example.com/episode',origins:[{ownerId:'p'}],properties:{guest:'홍길동'}},w);
for(const needle of ['original.wav','example.com/episode','에피소드 업무','팟캐스트 시리즈','홍길동'])assert.ok(text.includes(needle));
assert.equal(adminHomeData({...w,members:[]}).allProjects.length,1);assert.equal(adminHomeData({...w,members:[]}).active.length,0);
console.log('Resource schema: generic defaults, additive/idempotent presets, filename/URL/project search and complete project visibility passed');
