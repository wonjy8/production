import {readdir,readFile,lstat,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Only these repository documentation families can be removed. Never walk data or licenses.
const families=[
 {dir:'nas',pattern:/^UPDATE-(\d+\.\d+\.\d+)\.md$/,canonical:'UPDATE.md'},
 {dir:'docs',pattern:/^(\d+\.\d+\.\d+)-VALIDATION\.md$/,canonical:'VALIDATION.md'},
 {dir:'docs',pattern:/^PRODUCT-AUDIT-(\d+\.\d+\.\d+)\.md$/,canonical:'PRODUCT-AUDIT.md'},
];
const markdownDirs=['.','docs','nas','production','ui','ui/design-system'];
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let n=0;n<3;n++)if(x[n]!==y[n])return x[n]-y[n];return 0};
async function files(root,dir){try{return (await readdir(path.join(root,dir),{withFileTypes:true})).filter(e=>e.isFile()).map(e=>e.name)}catch(e){if(e.code==='ENOENT')return [];throw e}}
async function regular(root,file){try{if(!(await lstat(path.join(root,file))).isFile())throw Error('Documentation path must be a regular file: '+file);return await readFile(path.join(root,file),'utf8')}catch(e){if(e.code==='ENOENT')return null;throw e}}
function latestRelease(text){const blocks=[...text.matchAll(/^## (\d+\.\d+\.\d+)\s*$/gm)];if(blocks.length<2)return text;const newest=blocks.reduce((a,b)=>compare(a[1],b[1])>0?a:b),at=blocks.indexOf(newest),end=blocks[at+1]?.index??text.length;return text.slice(0,blocks[0].index).trimEnd()+'\n\n'+text.slice(newest.index,end).trim()+'\n'}
export async function cleanDocs(root,{check=false}={}){
 const writes=new Map(),removals=new Set(),renames=new Map();
 for(const family of families){
  const candidates=(await files(root,family.dir)).map(name=>({name,match:name.match(family.pattern)})).filter(v=>v.match).sort((a,b)=>compare(b.match[1],a.match[1]));
  if(!candidates.length)continue;
  const target=path.join(family.dir,family.canonical),current=await regular(root,target),currentVersion=current?.split('\n')[0].match(/\b(\d+\.\d+\.\d+)\b/)?.[1],newest=candidates[0];
  // An unversioned canonical document may contain deliberate edits: fail instead of overwriting it.
  if(current!==null&&!currentVersion)throw Error('Add a version to the first heading before reconciling '+target);
  const incoming=await regular(root,path.join(family.dir,newest.name));
  if(current!==null&&compare(newest.match[1],currentVersion)===0&&current!==incoming)throw Error('Conflicting documentation for the same version: '+target);
  if(current===null||compare(newest.match[1],currentVersion)>0)writes.set(target,incoming);
  for(const candidate of candidates){removals.add(path.join(family.dir,candidate.name));renames.set(candidate.name,family.canonical)}
 }
 for(const dir of markdownDirs)for(const name of await files(root,dir)){
  if(!name.endsWith('.md'))continue;
  const file=path.join(dir,name);if(removals.has(file))continue;
  const original=await regular(root,file);let text=writes.get(file)??original;
  for(const [oldName,newName] of renames)text=text.replaceAll(oldName,newName);
  if(file==='RELEASES.md')text=latestRelease(text);
  if(text!==original)writes.set(file,text);
 }
 // Canonical files created in this pass were absent from the directory listing.
 for(const [file,contents] of writes){let text=contents;for(const [oldName,newName] of renames)text=text.replaceAll(oldName,newName);writes.set(file,text)}
 const changes=[...writes.keys()].map(file=>'write '+file).concat([...removals].map(file=>'remove '+file));
 if(!check){for(const [file,contents] of writes)await writeFile(path.join(root,file),contents);for(const file of removals)await unlink(path.join(root,file))}
 return changes;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const check=process.argv.includes('--check'),changes=await cleanDocs(fileURLToPath(new URL('../',import.meta.url)),{check});if(changes.length)console.log(changes.join('\n'));else console.log('Documentation is current.');if(check&&changes.length)process.exitCode=1}catch(e){console.error(e.message);process.exitCode=1}
}
