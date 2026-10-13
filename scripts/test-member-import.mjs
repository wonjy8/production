import assert from 'node:assert/strict';
import {parseMemberLines} from '../production/member-import.js';
const rows=parseMemberLines('\uFEFF이름,직급·별명,소속,연락처,이메일\r\n김민수,팀장,콤케드;미디어팀,010-1234-5678,a@example.com\r\n"김,종유",별명,"팀 A;팀 B",010-0012,\r\n이서연,,,,');
assert.equal(rows.length,3);assert.deepEqual(rows[0].affiliations,['콤케드','미디어팀']);assert.equal(rows[0].contact,'010-1234-5678');assert.equal(rows[1].name,'김,종유');assert.equal(rows[2].email,'');assert.equal(parseMemberLines('김민수,,,,\n김민수,,,,').length,1);assert.throws(()=>parseMemberLines('김,별명,팀,전화,메일,초과'));assert.throws(()=>parseMemberLines('"김'));console.log('CSV import: fixed columns, headers, BOM, CRLF, quoted commas, multiple affiliations, blanks, duplicates and malformed rows passed');
