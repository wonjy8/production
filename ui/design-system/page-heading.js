// Register DOM and shadow workspaces without moving React-owned elements.
export function registerPageHeadingRoot(root){
 if(typeof window==='undefined')return ()=>{};
 window.appPageHeadingSelector=pageHeadingSelector;
 const roots=window.appPageHeadingRoots||(window.appPageHeadingRoots=new Set());roots.add(root);
 window.refreshAppPageHeading?.();
 return ()=>{roots.delete(root);window.refreshAppPageHeading?.()};
}
export const pageHeadingSelector='.workspace-page-heading h1,.gallery-heading h1,.document-library-heading h1,.archive-page>header h1,.owner-editor-head h1,.workspace-landing>header h1';
