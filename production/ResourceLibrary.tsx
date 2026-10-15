import { createRoot } from "react-dom/client";
import { observeUI } from "../ui/decorate.js";
import { ResourceDatabase } from "./DatabaseModule";
import { useState } from "react";
import { DocumentLibrary } from "./DocumentLibrary";
import { Icon } from "./Icon";
import { createNote, resourceFile } from "./resources";
import { documentURL } from "./document-launch";
function ResourceLibrary() {
  const [type, setType] = useState(
    () => localStorage.getItem("pn-resource-type") || "all",
  );
  return (
    <section className="resource-library">
      <h1>자료</h1>
      <nav className="resource-type-tabs" aria-label="자료 유형">
        {[
          ["all", "전체", "projects"],
          ["documents", "문서", "file"],
          ["image", "이미지", "reference"],
          ["video", "영상", "video"],
          ["link", "링크", "link"],
          ["audio", "오디오", "music"],
          ["file", "파일", "folder"],
        ].map(([id, label, icon]) => (
          <button
            className="keep-label"
            key={id}
            aria-pressed={type === id}
            onClick={() => {
              setType(id);
              localStorage.setItem("pn-resource-type", id);
            }}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>
      {type === "documents" ? (
        <DocumentLibrary />
      ) : (
        <ResourceDatabase global filterType={type} />
      )}
    </section>
  );
}
(window as any).openBlankDocument = async (popup: Window | null) => {
  try {
    const row = await createNote({ title: "제목 없는 문서", properties: {} });
    if (popup) popup.location.replace(documentURL(resourceFile(row), null));
  } catch (e: any) {
    popup?.close();
    throw e;
  }
};
(window as any).mountResourceLibrary = (host: HTMLElement, css: string) => {
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  const style = document.createElement("style");
  style.textContent = css;
  const target = document.createElement("div");
  shadow.append(style, target);
  const root = createRoot(target);
  root.render(<ResourceLibrary />);
  const stop = observeUI(shadow);
  return () => {
    stop();
    root.unmount();
  };
};
