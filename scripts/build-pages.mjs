import {mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {application} from '../worker/index.js';

const config = JSON.parse(await readFile(new URL('../pages.config.json', import.meta.url), 'utf8'));
const base = process.env.PAGES_BASE_PATH || config.basePath;
if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) throw Error('Invalid PAGES_BASE_PATH');
const output = 'dist/pages';
await rm(output, {recursive:true, force:true});
await mkdir(output, {recursive:true});
const routes = {'/':'app.html', '/production-app':'production-app.js', '/production-style':'production-style.css', '/ui-app':'ui-app.js', '/ui-style':'ui-style.css', '/account-app':'account-app.js'};
function rewrite(text) {
  text = text.replaceAll('/api/', base + 'api/');
  for (const [route, file] of Object.entries(routes)) {
    if (route !== '/') text = text.replaceAll(route, base + file);
  }
  return text.replaceAll("location.origin+'/?invite='", `location.origin+${JSON.stringify(base+"?invite=")}`).replaceAll("location.origin+'/'", `location.origin+${JSON.stringify(base)}`);
}
for (const [route, file] of Object.entries(routes)) {
  const response = await application.fetch(new Request('https://build.invalid' + route), {});
  if (!response.ok) throw Error('Failed to render ' + route);
  let text = rewrite(await response.text());
  if (file === 'app.html') text = text.replace('</body>', '<a href="./?connection=1" style="position:fixed;right:12px;bottom:8px;z-index:10000;font:12px system-ui;background:white;color:#555;padding:6px;border-radius:4px">서버 연결 설정</a></body>');
  await writeFile(output+'/'+file, text);
}
for (const file of ['pages-sw.js', 'pages-loader.js']) {
  await writeFile(output+'/'+file, await readFile('ui/'+file, 'utf8'));
}
await writeFile(output+'/.nojekyll', '');
await writeFile(output+'/index.html', await readFile('ui/pages-index.html', 'utf8'));
console.log('GitHub Pages built: '+output+' (server address is configured in the browser only)');
