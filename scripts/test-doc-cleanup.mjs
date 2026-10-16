import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {cleanDocs} from './clean-docs.mjs';
const root=await mkdtemp(path.join(tmpdir(),'production-docs-'));
try{
 await Promise.all(['nas','docs','assets','ui/design-system'].map(dir=>mkdir(path.join(root,dir),{recursive:true})));
 const put=(file,text)=>writeFile(path.join(root,file),text),get=file=>readFile(path.join(root,file),'utf8');
 await Promise.all([put('nas/UPDATE-0.1.9.md','# NAS 0.1.9\nold'),put('nas/UPDATE-0.1.10.md','# NAS 0.1.10\nnew'),put('docs/0.1.9-VALIDATION.md','# 0.1.9\nold'),put('docs/0.1.10-VALIDATION.md','# 0.1.10\nnew'),put('README.md','[Update](nas/UPDATE-0.1.9.md) [Validation](docs/0.1.10-VALIDATION.md)'),put('RELEASES.md','# Policy\nKeep rollback tags.\n\n## 0.1.9\nold\n\n## 0.1.10\nnew\n'),put('nas/server.py','runtime'),put('nas/update.sh','runtime'),put('assets/LICENSE.md','legal'),put('nas/INSTALL.md','install')]);
 const before=await readdir(path.join(root,'nas'));assert.ok((await cleanDocs(root,{check:true})).length);assert.deepEqual(await readdir(path.join(root,'nas')),before);
 await cleanDocs(root);assert.match(await get('nas/UPDATE.md'),/0.1.10/);assert.match(await get('docs/VALIDATION.md'),/new/);assert.equal(await get('README.md'),'[Update](nas/UPDATE.md) [Validation](docs/VALIDATION.md)');assert.equal(await get('RELEASES.md'),'# Policy\nKeep rollback tags.\n\n## 0.1.10\nnew\n');assert.deepEqual(await cleanDocs(root),[]);
 await put('nas/UPDATE-0.1.2.md','# NAS 0.1.2\nolder');await cleanDocs(root);assert.match(await get('nas/UPDATE.md'),/0.1.10/);
 await put('nas/UPDATE-0.1.11.md','# NAS 0.1.11\nnext');await cleanDocs(root);assert.match(await get('nas/UPDATE.md'),/next/);
 for(const [file,text] of [['nas/server.py','runtime'],['nas/update.sh','runtime'],['assets/LICENSE.md','legal'],['nas/INSTALL.md','install']])assert.equal(await get(file),text);
 await put('nas/UPDATE-0.1.11.md','# NAS 0.1.11\nconflict');await assert.rejects(cleanDocs(root),/Conflicting documentation/);assert.match(await get('nas/UPDATE.md'),/next/);await rm(path.join(root,'nas/UPDATE-0.1.11.md'));
 await put('nas/UPDATE.md','# Untagged manual edits');await put('nas/UPDATE-0.1.12.md','# NAS 0.1.12');await assert.rejects(cleanDocs(root),/Add a version/);assert.equal(await get('nas/UPDATE.md'),'# Untagged manual edits');
 await rm(path.join(root,'nas/UPDATE.md'));await symlink(path.join(root,'nas/server.py'),path.join(root,'nas/UPDATE.md'));await assert.rejects(cleanDocs(root),/regular file/);assert.equal(await get('nas/server.py'),'runtime');
 console.log('Docs cleanup: numeric versions, preview, latest-only migration, links, release policy, idempotence, newer canonical, manual edits, runtime/license preservation and symlink refusal passed');
}finally{await rm(root,{recursive:true,force:true})}
