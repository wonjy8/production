import { InlineRemove } from "./InlineRemove";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { observeUI } from "../ui/decorate.js";
import { listResources, resourceFile, saveResource } from "./resources";
import { documentLibrary } from "./document-library.js";
import { documentFormat } from "./document-types";
import { documentURL } from "./document-launch";
import { Icon } from "./Icon";
export function DocumentLibrary({showCompleted=false}:{showCompleted?:boolean}) {
  const [error, setError] = useState("");
  const [resources, setResources] = useState<any[]>([]);
  const [data, setData] = useState(() => window.sourceGalleryBridge.read()),
    [path, setPath] = useState<string[]>([]),
    [query, setQuery] = useState("");
  useEffect(() => {
    const update = () => {
      setData(window.sourceGalleryBridge.read());
      listResources(true)
        .then((rows) =>
          setResources(
            rows
              .filter((r: any) => r.fileId)
              .map((r: any) => ({ ...r, file: resourceFile(r) })),
          ),
        )
        .catch(() => {});
    };
    update();
    window.addEventListener("resources-changed", update);
    window.addEventListener("references-changed", update);
    window.addEventListener("gallery-changed", update);
    return () => {
      window.removeEventListener("resources-changed", update);
      window.removeEventListener("references-changed", update);
      window.removeEventListener("gallery-changed", update);
    };
  }, []);
  const library = documentLibrary(data.workspace, data.references, resources,{showCompleted}),
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
      {error && <p role="alert">{error}</p>}
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
          <div className="document-file-entry" key={f.key}>
            <a
              className="document-library-row"
              key={f.key}
              href={address(f)}
              onClick={event=>{if(documentFormat(f)&&(window as any).openInlineDocument&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();void (window as any).openInlineDocument(address(f)).catch(()=>{});}}}
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
            {resources.find((row: any) => row.fileId === f.id)?.canEdit && (
              <InlineRemove
                triggerText="휴지통"
                label={f.name + " 휴지통으로 이동"}
                onDelete={async () => {
                  try {
                    const row = resources.find(
                      (row: any) => row.fileId === f.id,
                    );
                    if (row) await saveResource({ ...row, deleted: true });
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              />
            )}
          </div>
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
