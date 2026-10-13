import assert from 'node:assert/strict';
let loads=0;global.Image=class{naturalWidth=1200;naturalHeight=800;set src(v){loads++;queueMicrotask(()=>this.onload())}decode(){return Promise.resolve()}};
const {preparePhoto,cachedPhoto,prefetchPhotos}=await import('../production/photo-cache.js');
const file={id:'a'};const [a,b]=await Promise.all([preparePhoto(file),preparePhoto(file)]);assert.equal(loads,1);assert.equal(a,b);assert.equal(a.width,1200);assert.equal(cachedPhoto(file),a);await prefetchPhotos([file,{id:'b'},file]);assert.equal(loads,2);assert.equal((await preparePhoto(file)).url,'/api/ref-files/a');
console.log('Photo decode deduplication, adjacent prefetch, ready cache and dimensions passed');
