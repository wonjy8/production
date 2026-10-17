export async function storeFile(id: string, file: File, scope?:{reference?:boolean;ownerId?:string;tab?:string}) {
  const context=scope?.reference||(window as any).referenceEditorOpen?undefined:window.productionSearchContext;
  const response = await fetch('/api/ref-files/' + id + '?name=' + encodeURIComponent(file.name), {method:'PUT', headers:{'Content-Type':file.type || 'application/octet-stream',...(scope?.ownerId?{'X-Scope-Owner':scope.ownerId,'X-Scope-Tab':scope.tab||'schedule'}:context?.projectId||context?.productionId?{'X-Scope-Owner':context.projectId||context.productionId||'','X-Scope-Tab':context.section||'materials'}:{})}, body:file});
  if (!response.ok) throw new Error('파일 업로드 실패');
  window.dispatchEvent(new Event('resources-changed'));
}
export async function readFile(id: string): Promise<Blob> {
  const response = await fetch('/api/ref-files/' + id);
  if (!response.ok) throw new Error('파일 불러오기 실패');
  return response.blob();
}
export function downloadBlob(blob: Blob, name: string) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function fileSize(bytes:number) {return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`;}
