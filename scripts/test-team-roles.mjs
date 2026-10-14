import assert from 'node:assert/strict';
import {teamRole,setTeamRole,teamMemberOrder} from '../production/team-roles.js';
const people=[{id:'z',name:'Z'},{id:'a',name:'A'},{id:'b',name:'B'}],team={leaderId:'z',members:[{memberId:'a',role:''},{memberId:'b',role:'감독'},{memberId:'z',role:'팀장'}]};
assert.equal(teamRole(team,team.members[0]),'멤버');for(const mode of ['name','name-desc','registered','registered-desc','custom'])assert.equal(teamMemberOrder(people,team,mode)[0].id,'z');
const next=setTeamRole(team,'a','팀장');assert.equal(next.leaderId,'a');assert.equal(teamRole(next,next.members[2]),'멤버');assert.equal(team.members[2].role,'팀장');
const custom=setTeamRole(next,'a','촬영감독');assert.equal(custom.leaderId,'');assert.equal(custom.members[0].role,'촬영감독');assert.throws(()=>setTeamRole(team,'a','x'.repeat(81)),/80/);
console.log('Team roles: default member, unique leader, leader pinned for every sort, custom role and independent updates passed');
