import { useEffect, useRef, useState } from "react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Search,
  Settings2,
  ChevronDown,
  WrapText,
} from "lucide-react";
function Icon({ name }: { name: string }) {
  const Component =
    (
      {
        undo: Undo2,
        redo: Redo2,
        bold: Bold,
        italic: Italic,
        underline: Underline,
        alignLeft: AlignLeft,
        alignCenter: AlignCenter,
        alignRight: AlignRight,
        search: Search,
        settings: Settings2,
        down: ChevronDown,
        wrap: WrapText,
      } as any
    )[name] || Search;
  return (
    <Component
      className="ui-icon"
      size={18}
      strokeWidth={1.75}
      aria-hidden="true"
    />
  );
}
import JSZip from "jszip";
import { wordcraftBridge } from "./wordcraft-bridge";
import { downloadBlob } from "./files";
async function fingerprint(blob: Blob) {
  const zip = await JSZip.loadAsync(blob),
    parts = [];
  for (const name of Object.keys(zip.files).sort()) {
    if (zip.files[name].dir) continue;
    let bytes = await zip.files[name].async("uint8array");
    if (name === "docProps/core.xml") {
      const text = new TextDecoder()
        .decode(bytes)
        .replace(/<dcterms:(modified|created)\b[^>]*>.*?<\/dcterms:\1>/g, "");
      bytes = new TextEncoder().encode(text);
    }
    parts.push(
      name +
        ":" +
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
          .map((n) => n.toString(16).padStart(2, "0"))
          .join(""),
    );
  }
  return parts.join("|");
}
async function draftStore(action: string, key: string, value?: any) {
  return new Promise<any>((resolve, reject) => {
    const request = indexedDB.open("production-wordcraft-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result,
        tx = db.transaction(
          "drafts",
          action === "get" ? "readonly" : "readwrite",
        ),
        store = tx.objectStore("drafts"),
        operation =
          action === "get"
            ? store.get(key)
            : action === "delete"
              ? store.delete(key)
              : store.put(value, key);
      let result: any;
      operation.onsuccess = () => (result = operation.result);
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
export function FullDocumentEditor({ file }: any) {
  const frame = useRef<HTMLIFrameElement>(null),
    session = useRef<any>(null),
    [status, setStatus] = useState("전체 문서 편집기를 불러오는 중…"),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [detached, setDetached] = useState(false),
    [recovery, setRecovery] = useState<Blob | null>(null);
  const [tools, setTools] = useState(true);
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (surface.current) surface.current.scrollLeft = 0;
  }, [tools]);
  const url = new URL("./modules/wordcraft/0.6.1/app.html", document.baseURI)
    .href;
  useEffect(() => {
    let closed = false,
      adapter: any,
      bootTimer: any;
    const s: any = {
      generation: 0,
      saved: 0,
      version: "",
      signature: "",
      latest: null,
      conflict: false,
      detached: false,
      booted: false,
      timer: null,
      max: null,
      queue: Promise.resolve(),
    };
    session.current = s;
    let sid = sessionStorage.getItem("production-document-session");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("production-document-session", sid);
    }
    const key = location.pathname + ":" + file.id + ":" + sid,
      dirty = () => s.generation > s.saved;
    function report(e: any) {
      if (closed) return;
      setError(e.message || "저장에 실패했습니다.");
      setStatus(
        s.conflict
          ? "원본 충돌 · 사본을 보관하세요"
          : s.booted
            ? "저장 실패 · 복구본 유지"
            : "문서를 열지 못했습니다.",
      );
    }
    function schedule() {
      clearTimeout(s.timer);
      s.timer = setTimeout(() => flush().catch(report), 800);
      if (!s.max) s.max = setTimeout(() => flush().catch(report), 5000);
    }
    async function flush() {
      clearTimeout(s.timer);
      clearTimeout(s.max);
      s.timer = s.max = null;
      if (!s.booted || s.detached || s.conflict) return false;
      if (!dirty()) {
        await s.queue;
        return true;
      }
      if (s.latest && s.latestGeneration === s.generation)
        await capture(s.latest, file.name, s.generation, false);
      else await adapter.snapshot();
      await s.queue;
      return !dirty();
    }
    s.flush = flush;
    s.edit = (key: string, shift = false) => adapter?.edit(key, shift);
    s.reflow = () => adapter?.reflow();
    s.pdf = async () =>
      downloadBlob(
        await adapter.pdf(),
        file.name.replace(/\.docx$/i, "") + ".pdf",
      );
    s.download = async () => {
      if (
        s.booted &&
        dirty() &&
        !s.detached &&
        s.latestGeneration !== s.generation
      )
        await adapter.snapshot();
      if (s.latest) downloadBlob(s.latest, file.name);
    };
    async function capture(
      blob: Blob,
      name: string,
      generation: number,
      boot: boolean,
    ) {
      s.latest = blob;
      s.latestGeneration = generation;
      if (boot) {
        s.signature = await fingerprint(blob);
        s.booted = true;
        return;
      }
      if (generation <= s.saved) return;
      s.queue = s.queue
        .catch(() => {})
        .then(async () => {
          if (s.detached || closed) return;
          const signature = await fingerprint(blob);
          if (signature === s.signature) {
            s.saved = Math.max(s.saved, generation);
            if (!closed) setStatus(dirty() ? "저장 대기" : "저장됨");
            return;
          }
          await draftStore("put", key, {
            blob,
            version: s.version,
            name: file.name,
            date: Date.now(),
          });
          if (s.conflict) return;
          const exported = await JSZip.loadAsync(blob);
          const protectedParts = Object.keys(
            s.originalParts?.files || {},
          ).filter(
            (name) =>
              !(s.originalParts?.files || {})[name].dir &&
              /^(customXml\/|word\/embeddings\/)|vbaProject\.bin$|^_xmlsignatures\//i.test(
                name,
              ),
          );
          if (protectedParts.some((name) => !exported.file(name))) {
            s.conflict = true;
            throw Error(
              "Word의 고급 개체를 보존하기 위해 원본 자동저장을 중단했습니다. 편집 내용은 Word 또는 PDF 사본으로 내보내세요.",
            );
          }
          if (blob.size > 25 * 1024 * 1024)
            throw Error("문서가 25MB를 넘어서 저장할 수 없습니다.");
          if (!s.version)
            throw Error(
              "NAS 파일 버전 확인이 필요합니다. 현재 내용은 사본으로 내려받을 수 있습니다.",
            );
          if (!closed) setStatus("저장 중…");
          const params = new URLSearchParams(location.search),
            owner = params.get("owner"),
            response = await fetch("/api/ref-files/" + file.id, {
              method: "PUT",
              headers: {
                "Content-Type":
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "If-Match": s.version,
                ...(owner
                  ? {
                      "X-Scope-Owner": owner,
                      "X-Scope-Tab": params.get("tab") || "materials",
                    }
                  : {}),
              },
              body: blob,
            });
          if (response.status === 409 || response.status === 412) {
            s.conflict = true;
            throw Error(
              "다른 곳에서 원본이 변경되었습니다. 현재 내용 사본을 내려받은 뒤 문서를 다시 여세요.",
            );
          }
          if (!response.ok)
            throw Error(
              response.status === 403
                ? "원본에 저장할 권한이 없습니다."
                : "원본에 저장하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.",
            );
          const metadata = await response.json();
          s.version =
            response.headers.get("ETag") ||
            (metadata.sha256 ? '"' + metadata.sha256 + '"' : "");
          s.signature = signature;
          s.saved = Math.max(s.saved, generation);
          if (!dirty()) await draftStore("delete", key);
          else schedule();
          if (!closed) {
            setError("");
            setStatus(dirty() ? "저장 대기" : "저장됨");
          }
        });
      await s.queue;
    }
    (async () => {
      try {
        const recovered = await draftStore("get", key).catch(() => null);
        let blob: Blob;
        try {
          const response = await fetch("/api/ref-files/" + file.id, {
            cache: "no-store",
          });
          if (!response.ok) throw Error("문서를 불러오지 못했습니다.");
          s.version =
            response.headers.get("ETag") ||
            (response.headers.get("X-File-SHA256")
              ? '"' + response.headers.get("X-File-SHA256") + '"'
              : "");
          blob = await response.blob();
          s.originalParts = await JSZip.loadAsync(blob);
        } catch (e) {
          if (!recovered) throw e;
          blob = recovered.blob;
          s.version = recovered.version;
        }
        let restoring = false;
        if (recovered) {
          setRecovery(recovered.blob);
          if (recovered.version === s.version) {
            blob = recovered.blob;
            restoring = true;
          } else
            setError(
              "원본이 변경되어 이전 복구본을 자동 적용하지 않았습니다. 복구본을 내려받아 확인할 수 있습니다.",
            );
        }
        if (closed) return;
        adapter = wordcraftBridge(
          frame.current!,
          new File([blob], file.name, {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }),
          {
            getGeneration: () => s.generation,
            onSnapshot: capture,
            onDirty: () => {
              if (!s.booted || s.detached) return;
              s.generation++;
              setStatus("저장 대기");
              schedule();
            },
            onDetach: (name: string) => {
              s.detached = true;
              setDetached(true);
              setStatus(name + " · 기기에 저장");
              setError(
                "편집기에서 별도로 연 문서는 기존 원본을 덮어쓰지 않습니다. 파일 메뉴에서 기기에 저장하세요.",
              );
            },
            onError: report,
            onReady: () => {
              clearTimeout(bootTimer);
              setReady(true);
              if (innerWidth < 600) setTimeout(() => adapter?.reflow(), 150);
              if (restoring) {
                s.signature = "";
                s.generation++;
                s.latestGeneration = s.generation;
                setStatus("복구본을 불러왔습니다.");
                schedule();
              } else setStatus("저장됨");
            },
          },
        );
        bootTimer = setTimeout(() => {
          if (!s.booted)
            report(
              Error(
                "전체 편집기를 시작하지 못했습니다. WebGL2/WebGPU 지원을 확인하거나 간단 편집으로 여세요.",
              ),
            );
        }, 90000);
      } catch (e) {
        report(e);
      }
    })();
    const engineError = (e: MessageEvent) => {
      if (
        e.origin === location.origin &&
        e.source === frame.current?.contentWindow &&
        e.data?.type === "wordcraft-load-error"
      ) {
        clearTimeout(bootTimer);
        report(Error(e.data.message));
      }
    };
    window.addEventListener("message", engineError);
    const unload = (e: BeforeUnloadEvent) => {
        if (dirty() && !s.detached) {
          e.preventDefault();
          e.returnValue = "";
          flush().catch(report);
        }
      },
      blur = () => {
        if (dirty()) flush().catch(report);
      },
      visibility = () => {
        if (document.hidden) blur();
      },
      online = () => {
        if (dirty()) flush().catch(report);
      };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("blur", blur);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visibility);
    (window as any).productionWriting = true;
    (window as any).wordcraftOpenCount =
      ((window as any).wordcraftOpenCount || 0) + 1;
    return () => {
      closed = true;
      clearTimeout(bootTimer);
      clearTimeout(s.timer);
      clearTimeout(s.max);
      adapter?.dispose();
      window.removeEventListener("message", engineError);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("blur", blur);
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", visibility);
      (window as any).productionWriting = false;
      (window as any).wordcraftOpenCount = Math.max(
        0,
        ((window as any).wordcraftOpenCount || 0) - 1,
      );
    };
  }, [file.id]);
  async function basic() {
    if (
      session.current?.generation > session.current?.saved &&
      !(await session.current.flush())
    )
      return;
    localStorage.setItem("production-document-editor", "basic");
    location.reload();
  }
  return (
    <main className="full-document-editor" data-tools={tools}>
      <header className="document-header">
        <div className="document-heading">
          <h1>{file.name}</h1>
          <span role="status" aria-live="polite">
            {status}
          </span>
        </div>
        <span className="document-autosave-label">
          {detached ? "별도 문서" : "자동저장"}
        </span>
        <button
          className="keep-label"
          disabled={!ready}
          onClick={() =>
            session.current?.download().catch((e: any) => setError(e.message))
          }
        >
          Word 내보내기
        </button>
        <button
          className="keep-label"
          disabled={!ready}
          onClick={() =>
            session.current?.pdf().catch((e: any) => setError(e.message))
          }
        >
          PDF 내보내기
        </button>
        <button className="keep-label" onClick={basic}>
          간단 편집
        </button>
      </header>
      <div
        className="app-document-toolbar"
        role="toolbar"
        aria-label="문서 편집 도구"
      >
        {[
          ["z", "실행 취소", "undo"],
          ["y", "다시 실행", "redo"],
          ["b", "굵게", "bold"],
          ["i", "기울임", "italic"],
          ["u", "밑줄", "underline"],
          ["l", "왼쪽 정렬", "alignLeft"],
          ["e", "가운데 정렬", "alignCenter"],
          ["r", "오른쪽 정렬", "alignRight"],
          ["f", "찾기", "search"],
        ].map(([key, label, icon]) => (
          <button
            className="keep-label"
            key={key}
            type="button"
            aria-label={label}
            title={label}
            disabled={!ready}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => session.current?.edit(key)}
          >
            <Icon name={icon} />
          </button>
        ))}
        <button
          className="keep-label document-mobile-view"
          disabled={!ready}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => session.current?.reflow()}
        >
          <Icon name="wrap" />
          맞춤 보기
        </button>
        <button
          className="keep-label document-all-tools"
          aria-expanded={tools}
          onClick={() => setTools(!tools)}
        >
          <Icon name="settings" />
          전체 도구
          <Icon name="down" />
        </button>
      </div>
      {error && (
        <div className="document-error" role="alert">
          <span>{error}</span>
          {!detached && (
            <button
              className="keep-label"
              onClick={() =>
                session.current?.flush().catch((e: any) => setError(e.message))
              }
            >
              저장 다시 시도
            </button>
          )}
          {recovery && (
            <button
              className="keep-label"
              onClick={() => downloadBlob(recovery, file.name)}
            >
              이전 복구본 내려받기
            </button>
          )}
        </div>
      )}
      {tools && (
        <label className="document-native-pan">
          전체 도구 좌우 이동
          <input
            type="range"
            aria-label="전체 도구 좌우 이동"
            min="0"
            max="100"
            defaultValue="0"
            onChange={(e) => {
              const el = surface.current;
              if (el)
                el.scrollLeft =
                  ((el.scrollWidth - el.clientWidth) * Number(e.target.value)) /
                  100;
            }}
          />
        </label>
      )}
      <p className="document-core-hint">
        Home: 글자·문단 · Insert: 표·주석 · Layout: 쪽·여백 · Review: 검토
      </p>
      <div className="full-editor-surface" ref={surface}>
        <iframe
          ref={frame}
          tabIndex={ready ? 0 : -1}
          style={{ pointerEvents: ready ? "auto" : "none" }}
          className="full-wordcraft-frame"
          src={url}
          title="WordCraft 전체 문서 편집기"
          allow="fullscreen; clipboard-read; clipboard-write"
          allowFullScreen
        />
        {!ready && (
          <div
            className="full-editor-loading"
            role="progressbar"
            aria-label="전체 문서 편집기 준비 중"
          >
            전체 문서 편집기를 준비하고 있습니다…
          </div>
        )}
      </div>
      <footer className="document-footer">
        {detached
          ? "별도로 연 문서는 파일 메뉴에서 기기에 저장하세요."
          : "원본 파일에 자동으로 저장됩니다."}
      </footer>
    </main>
  );
}
