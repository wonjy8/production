import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildShareViewer} from './share-view-build.mjs';
import {documentFonts,documentFontLicense} from '../worker/document-font-assets.js';
import {application} from '../worker/index.js';

const releaseVersion=(await readFile(new URL('../VERSION',import.meta.url),'utf8')).trim();
const config = JSON.parse(await readFile(new URL('../pages.config.json', import.meta.url), 'utf8'));
const base = process.env.PAGES_BASE_PATH || config.basePath;
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw Error('Invalid PAGES_BASE_PATH');
const output = 'dist/pages';
await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});
await writeFile(output+'/share-view.html',await buildShareViewer());
execFileSync('python3',['scripts/package-nas.py','--output-dir',output],{stdio:'inherit'});
const routes = {'/':'app.html', '/document-app':'document-app.js', '/document-pdf':'document-pdf.js', '/document-tools':'document-tools.js', '/document-style':'document-style.css', '/production-app':'production-app.js', '/production-style':'production-style.css', '/ui-app':'ui-app.js', '/ui-style':'ui-style.css', '/account-app':'account-app.js'};
for (const name of Object.keys(documentFonts)) await writeFile(output+'/document-font-'+name+'.ttf',Buffer.from(documentFonts[name],'base64'));
await writeFile(output+'/document-font-licenses.txt',documentFontLicense);
const rendered = {};
for (const [route, file] of Object.entries(routes)) {
  if(file.endsWith('.ttf'))continue;
  const response = await application.fetch(new Request('https://build.invalid' + route), {});
  if (!response.ok) throw Error('Failed to render ' + route);
  rendered[file] = await response.text();
}
const versions = Object.fromEntries(Object.entries(rendered).filter(([file]) => file !== 'app.html').map(([file, contents]) => [file, createHash('sha256').update(contents).digest('hex').slice(0, 12)]));
function rewrite(text) {
  text = text.replaceAll('/api/', base + 'api/');
  text = text.replaceAll('\"/document-font-\"',JSON.stringify(base+'document-font-'));

  for (const [route, file] of Object.entries(routes)) {
    if (route !== '/') text = text.replaceAll(route, base + file + '?v=' + (versions[file] || releaseVersion));
  }
  return text.replaceAll("location.origin+'/?invite='", `location.origin+location.pathname+'?invite='`).replaceAll("location.origin+'/'", `location.origin+location.pathname`);
}
for (const [route, file] of Object.entries(routes)) {
  if(file.endsWith('.ttf'))continue;
  let text = rewrite(rendered[file]);
  await writeFile(output+'/'+file, text);
}
for (const file of ['completion-policy.js', 'pages-sw.js', 'pages-local.js', 'pages-loader.js', 'pages-updates.js', 'pages-route.js']) {
  await writeFile(output+'/'+file, await readFile('ui/'+file, 'utf8'));
}
await writeFile(output+'/.nojekyll', '');
const helpers = {};
for (const file of ['completion-policy.js','pages-sw.js','pages-local.js','pages-loader.js','pages-updates.js','pages-route.js','index.html']) {
  helpers[file] = await readFile(file==='index.html'?'ui/pages-index.html':output+'/'+file,'utf8');
}
const hash = text => createHash('sha256').update(text).digest('hex');
helpers['pages-loader.js']=helpers['pages-loader.js'].replace('./pages-route.js','./pages-route.js?v='+hash(helpers['pages-route.js']).slice(0,12));
await writeFile(output+'/pages-loader.js',helpers['pages-loader.js']);
const version = hash(JSON.stringify({rendered,helpers,base}));
const worker = helpers['pages-sw.js'].replace("'./completion-policy.js'",JSON.stringify('./completion-policy.js?v='+hash(helpers['completion-policy.js']).slice(0,12))).replace("'./pages-route.js'",JSON.stringify('./pages-route.js?v='+hash(helpers['pages-route.js']).slice(0,12))).replace("'./pages-local.js'", JSON.stringify('./pages-local.js?v='+hash(helpers['pages-local.js']).slice(0,12)));
await writeFile(output+'/pages-sw.js',worker);
const app = await readFile(output+'/app.html','utf8');
await writeFile(output+'/app.html',app.replace('</head>', '<base href="'+base+'"><meta name="pn-base" content="'+base+'"><meta name="pn-build" content="'+version+'"><meta name="pn-release" content="'+releaseVersion+'"><script src="'+base+'pages-updates.js?v='+hash(helpers['pages-updates.js']).slice(0,12)+'"></script></head>'));
const entry=helpers['index.html'].replaceAll('__PRODUCTION_BASE__',base).replace('./pages-loader.js','./pages-loader.js?v='+hash(helpers['pages-loader.js']).slice(0,12));
await writeFile(output+'/index.html',entry);
await writeFile(output+'/404.html',entry);
await writeFile(output+'/version.json',JSON.stringify({version,releaseVersion})+'\n');
console.log('GitHub Pages built: '+output+' (URL selects browser storage or NAS)');
