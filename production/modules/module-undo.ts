// Canonical TypeScript implementation; ../module-undo.js is a compatibility export.
const deleted=new Map();
export function rememberDeletedModule(tab,id){const index=tab.modules.findIndex(m=>m.id===id);if(index<0)return false;const entry={module:structuredClone(tab.modules[index]),index,before:tab.modules[index+1]?.id,after:tab.modules[index-1]?.id};const history=deleted.get(tab.id)||[];history.push(entry);deleted.set(tab.id,history.slice(-30));return true}
export function takeDeletedModule(tabId){const history=deleted.get(tabId);return history?.pop()}
export function restoreDeletedModule(tab,entry){if(!entry||tab.modules.some(m=>m.id===entry.module.id))return tab;const modules=[...tab.modules],before=modules.findIndex(m=>m.id===entry.before),after=modules.findIndex(m=>m.id===entry.after),index=before>=0?before:after>=0?after+1:Math.min(entry.index,modules.length);modules.splice(index,0,entry.module);return {...tab,modules}}
export function moduleUndoShortcut(e){const path=e.composedPath?.()||[e.target];return (e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='z'&&!path.some(node=>node?.matches?.('input,textarea,select,[contenteditable=true],dialog'))}
