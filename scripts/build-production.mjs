import './build-page.mjs';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const esbuild=process.env.PRODUCTION_ESBUILD?require(process.env.PRODUCTION_ESBUILD):require('esbuild');
const result=await esbuild.build({entryPoints:['production/entry.tsx'],bundle:true,write:false,minify:true,format:'iife',target:['es2020'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},nodePaths:process.env.PRODUCTION_NODE_PATH?[process.env.PRODUCTION_NODE_PATH]:[]});
const fixes=await readFile('ui/fixes.css','utf8')+'\n'+await readFile('ui/motion.css','utf8')+'\n'+await readFile('ui/home.css','utf8')+'\n'+await readFile('ui/theme.css','utf8');
const css=await readFile('production/styles.css','utf8')+'\n'+await readFile('ui/controls.css','utf8')+'\n'+await readFile('production/merged.css','utf8')+'\n'+await readFile('production/timetable.css','utf8')+'\n'+fixes+'\n'+await readFile('production/document-library.css','utf8');
const ui=await esbuild.build({entryPoints:['ui/dom.js'],bundle:true,write:false,minify:true,format:'iife',target:['es2020']});
const uiCSS=await readFile('ui/controls.css','utf8')+'\n'+await readFile('ui/layout.css','utf8')+'\n'+fixes;
await writeFile('worker/production-assets.js','export const productionJS='+JSON.stringify(result.outputFiles[0].text)+';\nexport const productionCSS='+JSON.stringify(css)+';\n');
await writeFile('worker/ui-assets.js','export const uiJS='+JSON.stringify(ui.outputFiles[0].text)+';\nexport const uiCSS='+JSON.stringify(uiCSS)+';\n');
console.log('Production UI built');

await writeFile('worker/account-assets.js','export const accountJS='+JSON.stringify(await readFile('ui/account.js','utf8'))+';\n');

const editor=await esbuild.build({entryPoints:['production/document-entry.tsx'],bundle:true,write:false,minify:true,format:'iife',target:['es2020'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const tools=await esbuild.build({entryPoints:['production/document-tools.ts'],bundle:true,write:false,minify:true,format:'iife',target:['es2020']});
const pdf=await esbuild.build({entryPoints:['production/document-pdf.ts'],bundle:true,write:false,minify:true,format:'iife',target:['es2020']});
await writeFile('worker/document-assets.js','export const documentPDFJS='+JSON.stringify(pdf.outputFiles[0].text)+';\nexport const documentJS='+JSON.stringify(editor.outputFiles[0].text)+';\nexport const documentToolsJS='+JSON.stringify(tools.outputFiles[0].text)+';\nexport const documentCSS='+JSON.stringify(await readFile('production/document-editor.css','utf8'))+';\n');
