import assert from 'node:assert/strict';
import {figmaFileURL,savedFigmaFile,saveFigmaFile} from '../production/figma-connection.js';
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};globalThis.window={appAccount:{id:'one'},dispatchEvent:()=>{}};
const url='https://www.figma.com/design/Ab123/Design?node-id=1-2';
assert.equal(saveFigmaFile(url),url);assert.equal(savedFigmaFile(),url);
window.appAccount={id:'two'};assert.equal(savedFigmaFile(),'');window.appAccount={id:'one'};assert.equal(savedFigmaFile(),url);
for(const bad of ['http://www.figma.com/design/abc','https://figma.com.evil.test/design/abc','https://user:secret@figma.com/design/abc','https://figma.com/login','javascript:alert(1)']){assert.equal(figmaFileURL(bad),'');assert.throws(()=>saveFigmaFile(bad));}
saveFigmaFile('');assert.equal(savedFigmaFile(),'');
console.log('Figma connection: browser persistence, account isolation, URL validation and disconnect passed');
