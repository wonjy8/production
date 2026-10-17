import {readFile} from 'node:fs/promises';
export async function buildShareViewer(){
 const root=new URL('../',import.meta.url),names=['tokens','typography','buttons','navigation','surfaces','motion','columns','project-identity','scheduling','module-language','time-grid','workflow'];
 const design=(await Promise.all(names.map(n=>readFile(new URL('ui/design-system/'+n+'.css',root),'utf8')))).join('\n');
 return (await readFile(new URL('ui/share-view.html',root),'utf8')).replace('{{DESIGN_CSS}}',design).replace('{{VIEWER_JS}}',await readFile(new URL('ui/share-view.js',root),'utf8'));
}
