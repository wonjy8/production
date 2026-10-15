import { installDocumentFonts } from './document-fonts';
installDocumentFonts();
import { mountDocumentEditor } from "./DocumentEditor";
(window as any).startDocumentEditor = async () => {
  const params = new URLSearchParams(location.search),
    id = params.get("document");
  if (!id || !/^[-a-f0-9]{36}$/.test(id))
    throw Error("올바른 문서 주소를 확인하세요.");
  document.body.classList.add("document-mode");
  document.documentElement.classList.add("document-html");
  const size = () => {
    const viewport = window.visualViewport;
    if (!viewport || viewport.scale === 1)
      document.documentElement.style.setProperty(
        "--document-height",
        Math.min(innerHeight, viewport?.height || innerHeight) + "px",
      );
  };
  size();
  window.visualViewport?.addEventListener("resize", size);
  const host = document.createElement("div");
  host.id = "document-editor-root";
  host.dataset.permissionOwner = params.get("owner") || "";
  host.dataset.permissionTab = params.get("tab") || "materials";
  document.body.append(host);
  const file = {
    id,
    name: params.get("name") || "문서.docx",
    mime: params.get("mime"),
  };
  mountDocumentEditor(file, host);
};
