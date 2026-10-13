import assert from 'node:assert/strict';
import {parseMemberLines} from '../production/member-import.js';
const rows=parseMemberLines('\uFEFF이름,직급·별명,소속,연락처,이메일\r\n사용자A,팀장,예시회사;예시팀,연락처A,a@example.com\r\n"예시,사용자",별명,"팀 A;팀 B",연락처C,\r\n사용자B,,,,');
assert.equal(rows.length,3);assert.deepEqual(rows[0].affiliations,['예시회사','예시팀']);assert.equal(rows[0].contact,'연락처A');assert.equal(rows[1].name,'예시,사용자');assert.equal(rows[2].email,'');assert.equal(parseMemberLines('사용자A,,,,\n사용자A,,,,').length,1);assert.throws(()=>parseMemberLines('예시,별명,팀,전화,메일,초과'));assert.throws(()=>parseMemberLines('"예시'));console.log('CSV import: fixed columns, headers, BOM, CRLF, quoted commas, multiple affiliations, blanks, duplicates and malformed rows passed');
