import assert from 'node:assert/strict';
import {nasStorage} from '../worker/nas-storage.js';
const req=(path,options)=>new Request('https://site.test'+path,options);
assert.equal(await nasStorage(req('/api/data'),{}),null);
assert.equal((await nasStorage(req('/api/database/members'),{})).status,503);
assert.equal((await nasStorage(req('/api/data'),{NAS_STORAGE_MODE:'nas'})).status,503);
const env={NAS_API_URL:'https://nas.test',NAS_API_TOKEN:'secret-not-for-browser',NAS_STORAGE_MODE:'nas'};
const original=globalThis.fetch;let called;
globalThis.fetch=async(url,options)=>{called={url:String(url),options};return new Response('file',{status:206,headers:{'Content-Range':'bytes 0-3/10','Content-Type':'video/mp4','Authorization':'must-not-leak'}})};
try{
 const response=await nasStorage(req('/api/ref-files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',{headers:{Range:'bytes=0-3'}}),env);
 assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 0-3/10');assert.equal(response.headers.get('Authorization'),null);
 assert.equal(called.options.headers.get('Authorization'),'Bearer secret-not-for-browser');assert.equal(called.options.headers.get('Range'),'bytes=0-3');assert.equal(called.options.redirect,'manual');
 assert.equal((await nasStorage(req('/api/data',{method:'PUT',headers:{Origin:'https://evil.test'},body:'{}'}),env)).status,403);
 assert.equal((await nasStorage(req('/api/storage/check'),{...env,NAS_API_URL:'http://nas.test'})).status,502);
 assert.equal(await nasStorage(req('/api/other'),env),null);
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://other.test'}});assert.equal((await nasStorage(req('/api/data'),env)).status,502);
 const objects={'production-note/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa':{body:'bytes',httpMetadata:{contentType:'video/mp4'}},'production-note/references/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.json':{text:async()=>'{"id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}'},'production-note/workspace.json':{text:async()=>'{"projects":[]}'}};
 const staged={...env,NAS_STORAGE_MODE:'r2',BUCKET:{list:async({prefix})=>({objects:Object.keys(objects).filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false}),get:async key=>objects[key]}};
 globalThis.fetch=async()=>Response.json({ok:true});
 let phase='files';for(let i=0;i<3;i++){const r=await nasStorage(req('/api/storage/copy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase})}),staged);assert.equal(r.status,200);const result=await r.json();if(i===2)assert.equal(result.done,true);phase=result.phase;}
 globalThis.fetch=async()=>new Response('existing data',{status:409});assert.equal((await nasStorage(req('/api/storage/copy',{method:'POST',body:'{"phase":"workspace"}'}),staged)).status,409);
}finally{globalThis.fetch=original}
console.log('NAS proxy: staging, authentication, HTTPS, origin, streaming headers and migration conflicts passed');
// Compression can weaken ETag on its way to the browser; NAS expects its exact hash.
try{globalThis.fetch=async(url,options)=>{called={url:String(url),options};return new Response('{}',{headers:{ETag:'W/"revision-hash"'}})};const response=await nasStorage(req('/api/data',{method:'PUT',headers:{'Content-Type':'application/json','If-Match':'W/"revision-hash"'},body:'{}'}),env);assert.equal(called.options.headers.get('If-Match'),'"revision-hash"');assert.equal(response.headers.get('X-Workspace-Revision'),'"revision-hash"');globalThis.fetch=async()=>new Response('{}',{status:409});assert.equal((await nasStorage(req('/api/data',{method:'PUT',headers:{'If-Match':'W/"stale-hash"'},body:'{}'}),env)).status,409)}finally{globalThis.fetch=original}
console.log('Weak ETag normalization, stable workspace revision and real conflict protection passed');
