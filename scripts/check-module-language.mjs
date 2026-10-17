import {readdir,readFile} from 'node:fs/promises';
const directory=new URL('../production/modules/',import.meta.url),files=(await readdir(directory)).filter(n=>n.endsWith('.ts')&&n!=='types.ts');
for(const name of files){const entry=new URL('../production/'+name.replace(/\.ts$/,'.js'),import.meta.url);const code=await readFile(entry,'utf8'),implementation=code.replace(/^\s*\/\/.*$/gm,'').trim();if(implementation!==`export * from './modules/${name}';`)throw Error('Module logic must live in TypeScript: '+entry.pathname)}
console.log(`${files.length} module implementations use TypeScript; JavaScript entries only re-export.`);
