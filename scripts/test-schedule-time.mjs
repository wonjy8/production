import assert from 'node:assert/strict';
import {parseTimeInput,stepTime,defaultScheduleTimes,shiftScheduleDates} from '../production/schedule-time.js';
assert.equal(parseTimeInput('오전 12:05'),'00:05');assert.equal(parseTimeInput('오후 12:30'),'12:30');assert.equal(parseTimeInput('11:55 pm'),'23:55');assert.equal(parseTimeInput('23:17'),'23:17');assert.equal(parseTimeInput('25:00'),null);assert.equal(parseTimeInput('오후 14:00'),null);assert.equal(stepTime('09:00',5),'09:05');assert.equal(stepTime('00:00',-5),'00:00');
assert.deepEqual(defaultScheduleTimes('2026-10-14',new Date(2026,9,14,23,20)),{date:'2026-10-14',endDate:'2026-10-15',startTime:'23:20',endTime:'00:20'});
const shifted=shiftScheduleDates({date:'2026-10-14',endDate:'2026-10-17',note:'preserve'},'2026-11-01');assert.equal(shifted.endDate,'2026-11-04');assert.equal(shifted.note,'preserve');
console.log('Schedule time: AM/PM and 24-hour input, five-minute stepping, midnight defaults and preserved date interval passed');
