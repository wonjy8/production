import {readFile,writeFile} from 'node:fs/promises';
// UI files are the editable source; worker/index.js is a generated distribution artifact.
const releaseVersion=(await readFile('VERSION','utf8')).trim();
if(!/^\d+\.\d+\.\d+$/.test(releaseVersion))throw Error('Invalid VERSION');
let page=await readFile('ui/page.html','utf8');
const paths=[...page.matchAll(/\{\{source:([^}]+)\}\}/g)].map(m=>m[1]);
for(const path of new Set(paths)){if(!/^(ui|production)\/[\w.-]+\.js$/.test(path))throw Error('Invalid page source: '+path);page=page.replaceAll('{{source:'+path+'}}',await readFile(path,'utf8'))}
if(page.includes('{{source:'))throw Error('Unresolved UI source');
page=page.replaceAll('{{APP_RELEASE_VERSION}}',releaseVersion);
const server=await readFile('worker/server.template.js','utf8');
await writeFile('worker/index.js',server.replace('{{PAGE_BODY}}',()=>page));
