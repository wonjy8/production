import { createRoot } from "react-dom/client";
import { FullDocumentEditor } from "./FullDocumentEditor";
import { documentFormat } from "./document-types";
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
  if (
    documentFormat(file) === "docx" &&
    localStorage.getItem("production-document-editor") !== "basic"
  )
    createRoot(host).render(<FullDocumentEditor file={file} />);
  else {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/document-basic";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(Error("문서 편집기를 불러오지 못했습니다."));
      document.head.append(script);
    });
    (window as any).startBasicDocumentEditor(file, host);
  }
};
