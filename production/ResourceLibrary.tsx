import { createRoot } from "react-dom/client";
import { observeUI } from "../ui/decorate.js";
import { ResourceDatabase } from "./DatabaseModule";
(window as any).mountResourceLibrary = (host: HTMLElement, css: string) => {
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  const style = document.createElement("style");
  style.textContent = css;
  const target = document.createElement("div");
  shadow.append(style, target);
  const root = createRoot(target);
  root.render(
    <section className="resource-library">
      <h1>자료 DB</h1>
      <p>
        사진·파일·문서·링크를 모아 관리합니다. 속성은 자료 DB에, 원본은 파일로
        보관합니다.
      </p>
      <ResourceDatabase global />
    </section>,
  );
  const stop = observeUI(shadow);
  return () => {
    stop();
    root.unmount();
  };
};
