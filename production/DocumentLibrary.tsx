import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { observeUI } from "../ui/decorate.js";
import { documentLibrary } from "./document-library.js";
import { documentFormat } from "./document-files";
import { documentURL } from "./document-launch";
import { Icon } from "./Icon";
function DocumentLibrary() {
  const [data, setData] = useState(() => window.sourceGalleryBridge.read()),
    [path, setPath] = useState<string[]>([]),
    [query, setQuery] = useState("");
  useEffect(() => {
    const update = () => setData(window.sourceGalleryBridge.read());
    window.addEventListener("references-changed", update);
    window.addEventListener("gallery-changed", update);
    return () => {
      window.removeEventListener("references-changed", update);
      window.removeEventListener("gallery-changed", update);
    };
  }, []);
  const library = documentLibrary(data.workspace, data.references),
    crumbs = [library.root];
  let folder = library.root;
  for (const id of path) {
    const next = folder.folders.find((f: any) => f.id === id);
    if (!next) break;
    folder = next;
    crumbs.push(next);
  }
  const needle = query.trim().toLocaleLowerCase(),
    rows = needle
      ? library.entries.filter((f: any) =>
          [f.name, ...f.path.map((p: any) => p.name)]
            .join(" ")
            .toLocaleLowerCase()
            .includes(needle),
        )
      : folder.files;
  function address(file: any) {
    const o = file.origin;
    return documentFormat(file)
      ? documentURL(
          file,
          o.ownerKind === "reference"
            ? null
            : {
                ownerId: o.ownerId,
                tabId: o.tabId ? "tab:" + o.tabId : "assets",
              },
        )
      : "/api/ref-files/" + file.id + "?name=" + encodeURIComponent(file.name);
  }
  return (
    <section className="document-library">
      <header className="document-library-heading">
        <div>
          <h1>문서</h1>
          <p>{library.count}개 문서</p>
        </div>
        <input
          type="search"
          aria-label="문서 검색"
          placeholder="문서 이름 또는 폴더 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </header>
      <nav className="document-library-path" aria-label="문서 폴더 경로">
        {crumbs.map((c: any, i: number) => (
          <span key={c.id}>
            {i > 0 && <span aria-hidden="true">/</span>}
            <button
              className="keep-label"
              onClick={() => {
                setPath(path.slice(0, i));
                setQuery("");
              }}
            >
              {c.name}
            </button>
          </span>
        ))}
      </nav>
      <div className="document-library-list">
        {!needle &&
          folder.folders.map((f: any) => (
            <button
              className="document-library-row keep-label"
              key={f.id}
              aria-label={f.name + " 폴더 열기"}
              onClick={() =>
                setPath([...path.slice(0, crumbs.length - 1), f.id])
              }
            >
              <Icon name="folder" />
              <strong>{f.name}</strong>
              <small>{f.count}개 문서</small>
              <Icon name="chevronRight" />
            </button>
          ))}
        {rows.map((f: any) => (
          <a
            className="document-library-row"
            key={f.key}
            href={address(f)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="file" />
            <div>
              <strong>{f.name}</strong>
              {needle && (
                <small>{f.path.map((p: any) => p.name).join(" / ")}</small>
              )}
            </div>
            <small>
              {documentFormat(f)
                ? "문서편집기로 열기"
                : /\.pdf$/i.test(f.name)
                  ? "PDF 열기"
                  : "내려받기"}
            </small>
            <Icon name="link" />
          </a>
        ))}
      </div>
      {!rows.length && (needle || !folder.folders.length) && (
        <p className="document-library-empty">
          {needle ? "검색 결과가 없습니다." : "이 폴더에 문서가 없습니다."}
        </p>
      )}
    </section>
  );
}
(window as any).mountDocumentLibrary = (host: HTMLElement, css: string) => {
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  const style = document.createElement("style");
  style.textContent = css;
  const target = document.createElement("div");
  shadow.append(style, target);
  const root = createRoot(target);
  root.render(<DocumentLibrary />);
  const stop = observeUI(shadow);
  return () => {
    stop();
    root.unmount();
  };
};
