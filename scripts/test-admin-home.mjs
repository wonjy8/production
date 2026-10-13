import assert from 'node:assert/strict';
import {adminHomeData,completeHomeTask,weekRange} from '../production/admin-home-model.js';
assert.deepEqual(weekRange('2026-10-13'),{start:'2026-10-12',end:'2026-10-18'});
assert.deepEqual(weekRange('2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
const w={members:[],productions:[{id:'g1',name:'P',tasks:[{id:'a',title:'제작',due:'2026-10-13',owner:'m1'}]},{id:'g2',tasks:[]}],projects:[{id:'p1',name:'사진',productionId:'g1',due:'2026-10-16',status:'진행 중',tasks:[{id:'b',title:'검수',due:'2026-10-12',owner:'m1'},{id:'c',title:'보정',due:'2026-10-13'},{id:'d',title:'완료',done:true,due:'2026-10-13'}],schedules:[{id:'s1',date:'2026-10-11',endDate:'2026-10-15',title:'촬영'},{id:'s2',date:'2026-10-13',taskId:'d'}]},{id:'p2',name:'완료',productionId:'g2',status:'완료',tasks:[]},{id:'deleted',deleted:true,tasks:[{id:'x',title:'삭제',due:'2026-10-13'}]}],timetableSchedules:[{id:'s3',projectId:'p1',date:'2026-10-13'},{id:'s4',date:'2026-10-13',productionId:'g2'}]};
const today=adminHomeData(w,{today:'2026-10-13',productionId:'g1'});
assert.equal(today.active.length,1);assert.equal(today.tasks.length,2);assert.equal(today.overdue.length,1);assert.equal(today.unassigned.length,1);assert.equal(today.schedules.length,2);assert.equal(today.upcoming.length,1);
assert.equal(adminHomeData(w,{today:'2026-10-13',productionId:'g1',mine:true,memberId:'m1'}).tasks.length,1);
assert.equal(adminHomeData(w,{today:'2026-10-13',mine:true}).tasks.length,0);
assert.equal(adminHomeData(w,{today:'2026-10-13',period:'week',productionId:'g1'}).tasks.length,3);
for(const row of today.tasks){const next=completeHomeTask(w,row,true);assert.equal(adminHomeData(next,{today:'2026-10-13',productionId:'g1'}).tasks.length,1);assert.equal(w.projects[0].tasks[1].done,undefined);assert.equal(next.projects[1],w.projects[1]);}
console.log('Admin home: week boundaries, active projects, date overlaps, owner/production filters, linked completion and immutable updates passed');
