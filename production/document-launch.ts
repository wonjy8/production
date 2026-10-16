import {appFeatures,documentEditorUnavailable} from '../ui/design-system/features.js';
import { documentFormat, DOCX_MIME } from "./document-types";
import { loadDocumentTools } from "./load-document-tools";
import { storeFile } from "./files";
export function documentURL(
  file: any,
  scope?: { ownerId: string; tabId?: string } | null,
) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("document", file.id);
  if(new URLSearchParams(location.search).has("embedded"))url.searchParams.set("embedded","1");
  url.searchParams.set("name", file.name || "문서.docx");
  if (file.mime) url.searchParams.set("mime", file.mime);
  const context =
    scope !== undefined
      ? scope
        ? { projectId: scope.ownerId, section: scope.tabId || "assets" }
        : null
      : (window as any).referenceEditorOpen
        ? null
        : window.productionSearchContext;
  if (context?.projectId || context?.productionId) {
    url.searchParams.set(
      "owner",
      context.projectId || context.productionId || "",
    );
    url.searchParams.set("tab", context.section || "materials");
  }
  return url.href;
}
export function openDocument(file: any) {
  if (!appFeatures.documentEditor || !documentFormat(file)) return;
  if ((window as any).openInlineDocument) void (window as any).openInlineDocument(documentURL(file)).catch(()=>{});
  else window.open(documentURL(file), "_blank", "noopener,noreferrer");
}
export async function convertTextDocument(
  module: any,
  onChange: (fn: any) => any,
) {
  if(!appFeatures.documentEditor)throw Error(documentEditorUnavailable);
  const inline = (window as any).openInlineDocument;
  const tab = inline ? null : window.open("about:blank", "_blank");
  if (!tab && !inline) throw Error("새 탭 열기를 허용한 뒤 다시 시도하세요.");
  if(tab){tab.opener = null;
  tab.document.body.textContent = "문서를 준비하는 중…";}
  try {
    const { saveDocument } = await loadDocumentTools();
    const content = {
        type: "doc",
        content: String(module.text || "")
          .split(/\r?\n/)
          .map((text) => ({
            type: "paragraph",
            content: text ? [{ type: "text", text }] : [],
          })),
      },
      blob = await saveDocument(content, "docx", null, "", ""),
      name =
        (module.title || "문서")
          .replace(/[\\/\r\n]/g, " ")
          .replace(/\.docx$/i, "") + ".docx",
      file = {
        id: crypto.randomUUID(),
        name,
        kind: "file",
        mime: DOCX_MIME,
        size: blob.size,
      };
    await storeFile(file.id, new File([blob], name, { type: DOCX_MIME }));
    await onChange((old: any) => {
      const { text, ...rest } = old;
      return { ...rest, kind: "file", files: [file] };
    });
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await (window as any).flushDocumentModules?.();
    if(tab)tab.location.replace(documentURL(file));
    else await inline(documentURL(file));
    return file;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
