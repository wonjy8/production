const pending = new Map<string, Promise<any>>();
export function loadDocumentPDF() {
  return loadTool("/document-pdf", "productionDocumentPDF");
}
export function loadDocumentTools() {
  return loadTool("/document-tools", "productionDocumentTools");
}
function loadTool(path: string, name: string) {
  if ((window as any)[name]) return Promise.resolve((window as any)[name]);
  if (!pending.has(path))
    pending.set(
      path,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = path;
        script.onload = () => resolve((window as any)[name]);
        script.onerror = () => {
          pending.delete(path);
          script.remove();
          reject(Error("문서 도구를 불러오지 못했습니다. 다시 시도하세요."));
        };
        document.head.append(script);
      }),
    );
  return pending.get(path)!;
}
