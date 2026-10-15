import assert from 'node:assert/strict';
import {documentLibrary} from '../production/document-library.js';
const file=(id,name)=>({id,name,kind:'file'}),tab=(files)=>({id:'tab',name:'기획',modules:[{id:'module',kind:'file',files}]}),w={productions:[{id:'parent',name:'프로젝트',customTabs:[tab([file('doc','계획.docx'),file('image','사진.png')])],archives:[{outputs:[file('frozen','완료 사본.docx')]}]}],projects:[{id:'child',productionId:'parent',title:'업무 그룹',customTabs:[tab([file('sheet','예산.xlsx')])]},{id:'deleted',title:'휴지통',deleted:true,customTabs:[tab([file('gone','삭제.docx')])]}]};
const references=[{id:'ref',title:'참고 문서',modules:[{id:'rm',kind:'file',files:[file('doc','계획.docx'),file('pdf','설명.PDF')]}]},{id:'source',title:'원본',recordType:'source',modules:[{id:'sm',kind:'file',files:[file('text','메모.txt')]}]},{id:'hidden',title:'삭제 자료',deleted:true,modules:[{id:'hm',kind:'file',files:[file('trash','휴지통.docx')]}]}];
w.projects.push({id:'linked',title:'예전 연결',customTabs:[{id:'linked-tab',name:'불러오기',modules:[{id:'link',kind:'file',source:{kind:'production',ownerId:'parent',moduleId:'module'}}]}]});
const before=JSON.stringify({w,references}),lib=documentLibrary(w,references);
assert.equal(lib.count,4);assert.equal(lib.entries.length,5);
assert(!lib.entries.some(e=>['image','frozen','gone','trash'].includes(e.id)||e.origin.ownerId==='linked'));
assert.deepEqual(lib.entries.find(e=>e.id==='sheet').path.map(p=>p.name),['프로젝트','프로젝트','업무 그룹','기획']);
assert.equal(lib.entries.find(e=>e.id==='text').path[0].name,'소스');
assert.equal(lib.entries.filter(e=>e.id==='doc').length,2);
assert.equal(JSON.stringify({w,references}),before);
console.log('Document library: project/work-group/reference/source folders, office/PDF/text types, shared locations, archive and trash exclusion, immutable source passed');

assert.equal(documentLibrary(w,references,[{fileId:'doc',deleted:true}]).entries.some(f=>f.id==='doc'),false);
assert.equal(documentLibrary(w,references,[{fileId:'doc',deleted:true,purged:true}]).entries.some(f=>f.id==='doc'),false);
assert.equal(JSON.stringify({w,references}),before);
console.log('Document catalog trash hides every placement while preserving shared originals');
