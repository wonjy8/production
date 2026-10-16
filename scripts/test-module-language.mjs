import assert from 'node:assert/strict';
import {migrateRetiredModules,retiredModuleKinds} from '../production/retired-modules.js';
import {moduleTemplates,hubCategories} from '../production/module-hub.js';
import {snapColumnWidths,columnStops} from '../production/column-layout.js';
import {contentHeightResize} from '../production/module-resize.js';
import {moveGridItem,gridTicks} from '../production/time-grid-model.js';
import {moveTimetableEntry,normalizeConfig,writeTimetableEntry} from '../production/timetable-model.js';
assert.deepEqual(hubCategories.map(c=>c.label),['전체','기본','일정','미디어','나누기']);
assert.deepEqual(moduleTemplates.map(c=>c.name),['메모','캘린더','타임테이블','일정 목록','할일','사진','영상','파일','링크','섹션 제목','섹션 제목 2','섹션 제목 3','섹션 제목 4','구분선','2단 열','3단 열','4단 열']);
for(const kind of retiredModuleKinds){
 const original={id:'old',kind,title:'기존 자료',parentSlot:'left',items:[{text:'보존할 메모'}],groups:[{name:'분류',items:[{id:'original',kind:'file',name:'자료.pdf',mime:'application/pdf'},{kind:'text',text:'모임 내용'}]}]};
 const copy=structuredClone(original),migrated=migrateRetiredModules([original]);assert.deepEqual(original,copy);assert.equal(migrated[0].kind,'text');assert.match(migrated[0].text,/모임 내용/);for(const [key,value] of Object.entries(original))assert.deepEqual(JSON.parse(migrated[0].retiredSnapshot)[key],value);assert.equal(migrated[1].files[0].id,'original');assert.equal(migrated[1].parentSlot,'left');assert.equal(migrateRetiredModules(migrated),migrated);
}
const plain=[{id:'memo',kind:'text',text:'안녕'}];assert.equal(migrateRetiredModules(plain),plain);
for(const target of columnStops){const w=snapColumnWidths([500,500],0,target*1000-500);assert.ok(Math.abs(w[0]-target*1000)<.001);assert.equal(w[0]+w[1],1000)}
assert.deepEqual(snapColumnWidths([500,500],0,0,1),[625,375]);assert.equal(contentHeightResize(600,-500,450).height,450);
assert.deepEqual(moveGridItem({date:'2026-10-16',endDate:'2026-10-17',startTime:'23:00',endTime:'01:00'},'2026-10-18',1380),{date:'2026-10-18',endDate:'2026-10-19',startTime:'23:00',endTime:'01:00'});
assert.equal(gridTicks(480,1080,400).filter(t=>t.label).length,10);assert.equal(gridTicks(480,1080,200).filter(t=>t.label).length,5);
const w={projects:[],timetableSchedules:[{id:'s',title:'행사',moduleId:'m',date:'2026-10-16',endDate:'2026-10-16',startTime:'09:00',endTime:'10:00',note:'보존'}]};let next=moveTimetableEntry(w,{id:'s',kind:'schedule'},moveGridItem(w.timetableSchedules[0],'2026-10-17',600));assert.equal(next.timetableSchedules[0].note,'보존');assert.equal(next.timetableSchedules[0].endTime,'11:00');assert.equal(w.timetableSchedules[0].startTime,'09:00');
next=writeTimetableEntry(next,{...next.timetableSchedules[0],color:'#ff00ff',calendarExcluded:true});assert.equal(next.timetableSchedules[0].color,'#ff00ff');assert.equal(next.timetableSchedules[0].calendarExcluded,true);assert.equal(normalizeConfig({}).showTasks,true);
console.log('Module language: ordered catalog, lossless retirement, snapped widths, content minimum, time-grid movement, hourly labels, colors and calendar exclusion passed');

const inherited=(await import('../production/timetable-model.js')).timetableItems({productions:[{id:'g',iconColor:'#8b5cf6'}],projects:[{id:'p',productionId:'g',schedules:[{id:'s',date:'2026-10-16',endDate:'2026-10-16'}],tasks:[]}]},['p']);assert.equal(inherited[0].color,'#8b5cf6');

assert.deepEqual(moveGridItem({kind:'schedule',date:'2026-10-16',endDate:'2026-10-16',startTime:'',endTime:''},'2026-10-17',600,{toTimed:true}),{date:'2026-10-17',endDate:'2026-10-17',startTime:'10:00',endTime:'11:00'});
assert.equal(moveGridItem({kind:'task',date:'2026-10-16',startTime:'',endTime:''},'2026-10-17',1430,{toTimed:true}).endTime,'24:00');
