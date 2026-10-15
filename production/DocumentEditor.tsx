import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Editor, Extension, Mark, Node as TiptapNode } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { documentFormat, loadDocument, saveDocument } from "./document-files";
import { Icon } from "./Icon";
import { downloadBlob } from "./files";
const preserve = Extension.create({
  name: "docxProperties",
  addGlobalAttributes() {
    return [
      {
        types: ["bulletList", "orderedList"],
        attributes: {
          docxNumId: { default: null, rendered: false },
          docxNumKind: { default: null, rendered: false },
        },
      },
      {
        types: ["paragraph", "heading", "table", "tableCell", "tableHeader"],
        attributes: {
          docxProperties: { default: null, rendered: false },
          docxHeading: { default: null, rendered: false },
        },
      },
      {
        types: ["table"],
        attributes: { docxGrid: { default: null, rendered: false } },
      },
      {
        types: ["image"],
        attributes: { docxXml: { default: null, rendered: false } },
      },
    ];
  },
});
const documentNavigation = Extension.create({
  name: "documentNavigation",
  addKeyboardShortcuts() {
    return {
      "Mod-End": () => this.editor.commands.focus("end"),
      "Mod-Home": () => this.editor.commands.focus("start"),
    };
  },
});
const runProperties = Mark.create({
  name: "docxRun",
  inclusive: false,
  addAttributes() {
    return { xml: { default: null, rendered: false } };
  },
  parseHTML() {
    return [];
  },
  renderHTML() {
    return ["span", 0];
  },
});
const opaque = TiptapNode.create({
  name: "docxOpaque",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    return { xml: { default: null, rendered: false } };
  },
  parseHTML() {
    return [];
  },
  renderHTML() {
    return [
      "div",
      { class: "document-preserved", contenteditable: "false" },
      "이 요소는 원본 형식으로 보존됩니다.",
    ];
  },
});
function documentSession() {
  try {
    const key = "production-document-session";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
function DocumentEditor({ file }: { file: any }) {
  const host = useRef<HTMLDivElement>(null),
    editor = useRef<Editor | null>(null),
    session = useRef<any>(null);
  const [ready, setReady] = useState(false),
    [status, setStatus] = useState("문서를 불러오는 중…"),
    [error, setError] = useState(""),
    [active, setActive] = useState(0);
  const [sessionId] = useState(documentSession);
  const format = documentFormat(file),
    draftKey =
      "production-document-draft:" +
      location.pathname +
      ":" +
      file.id +
      ":" +
      sessionId;
  useEffect(() => {
    let disposed = false;
    const s: any = {
      generation: 0,
      saved: 0,
      version: "",
      zip: null,
      timer: null,
      maxTimer: null,
      inflight: null,
      conflict: false,
      composing: false,
    };
    session.current = s;
    function dirty() {
      return s.generation !== s.saved;
    }
    function backup() {
      if (!editor.current || !dirty()) return;
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            version: s.version,
            content: editor.current.getJSON(),
            date: Date.now(),
          }),
        );
      } catch {}
    }
    async function flush() {
      clearTimeout(s.timer);
      clearTimeout(s.maxTimer);
      s.timer = s.maxTimer = null;
      if (s.inflight) {
        await s.inflight;
        if (dirty() && !s.conflict) return flush();
        return !dirty();
      }
      if (!dirty() || !editor.current) return true;
      if (s.conflict || s.composing) return false;
      s.inflight = (async () => {
        while (dirty() && !s.conflict && !s.composing) {
          const generation = s.generation,
            ed = editor.current!;
          const content = ed.getJSON(),
            html = ed.getHTML(),
            text = ed.getText({ blockSeparator: "\n" });
          setStatus("저장 중…");
          const blob = await saveDocument(content, format!, s.zip, html, text);
          if (blob.size > 25 * 1024 * 1024)
            throw Error("문서가 25MB를 넘어서 저장할 수 없습니다.");
          const params = new URLSearchParams(location.search),
            owner = params.get("owner");
          const response = await fetch("/api/ref-files/" + file.id, {
            method: "PUT",
            headers: {
              "Content-Type": blob.type,
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
          if (!response.ok) {
            if (response.status === 409 || response.status === 412) {
              s.conflict = true;
              throw Error(
                "다른 탭에서 원본이 변경되어 자동저장을 중단했습니다. 현재 내용을 사본으로 보관한 뒤 원본을 다시 열어주세요.",
              );
            }
            throw Error(
              response.status === 403
                ? "이 문서를 편집할 권한이 없습니다."
                : "저장하지 못했습니다. 연결을 확인하고 다시 시도하세요.",
            );
          }
          const result = await response.json();
          s.version =
            response.headers.get("ETag") ||
            (result.sha256 ? '"' + result.sha256 + '"' : "");
          if (!s.version) throw Error("저장 버전을 확인할 수 없습니다.");
          s.saved = generation;
          setError("");
          if (!dirty()) {
            try {
              localStorage.removeItem(draftKey);
            } catch {}
            setStatus("모든 변경사항 저장됨");
          } else backup();
        }
      })();
      try {
        await s.inflight;
        return !dirty();
      } catch (e: any) {
        backup();
        setError(e.message);
        setStatus("저장되지 않음");
        return false;
      } finally {
        s.inflight = null;
      }
    }
    s.flush = flush;
    s.download = async () => {
      const ed = editor.current;
      if (!ed) return;
      const blob = await saveDocument(
        ed.getJSON(),
        format!,
        s.zip,
        ed.getHTML(),
        ed.getText({ blockSeparator: "\n" }),
      );
      downloadBlob(blob, file.name);
    };
    const change = () => {
      s.generation++;
      backup();
      setStatus(s.conflict ? "저장 중단됨" : "변경사항 저장 대기");
      clearTimeout(s.timer);
      s.timer = setTimeout(flush, 800);
      if (!s.maxTimer) s.maxTimer = setTimeout(flush, 5000);
    };
    async function start() {
      try {
        if (!format)
          throw Error("DOCX, TXT, Markdown, HTML 문서를 편집할 수 있습니다.");
        const response = await fetch("/api/ref-files/" + file.id, {
          cache: "no-store",
        });
        if (!response.ok) throw Error("원본 문서를 불러오지 못했습니다.");
        const blob = await response.blob();
        s.version =
          response.headers.get("ETag") ||
          (response.headers.get("X-File-SHA256")
            ? '"' + response.headers.get("X-File-SHA256") + '"'
            : "");
        if (!s.version)
          throw Error(
            "원본의 저장 버전을 확인할 수 없습니다. NAS 설치 파일을 최신 버전으로 업데이트하세요.",
          );
        const loaded = await loadDocument(blob, format);
        s.zip = loaded.zip;
        if (disposed) return;
        let content = loaded.content,
          restored = false;
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
          if (draft?.content) {
            content = draft.content;
            restored = true;
            s.conflict = draft.version !== s.version;
          }
        } catch {}
        editor.current = new Editor({
          element: host.current!,
          extensions: [
            StarterKit.configure({
              link: { openOnClick: false, protocols: ["https", "http"] },
            }),
            TextStyleKit,
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            TableKit,
            Image.configure({ inline: true, allowBase64: true }),
            preserve,
            documentNavigation,
            runProperties,
            opaque,
          ],
          content,
          editorProps: {
            attributes: {
              "aria-label": "문서 본문",
              role: "textbox",
              "aria-multiline": "true",
              spellcheck: "true",
            },
            handleDOMEvents: {
              compositionstart: () => {
                s.composing = true;
                return false;
              },
              compositionend: () => {
                s.composing = false;
                if (dirty()) s.timer = setTimeout(flush, 800);
                return false;
              },
            },
          },
          onUpdate: change,
          onSelectionUpdate: () => setActive((v) => v + 1),
        });
        setReady(true);
        document.title = file.name + " · 문서";
        if (restored) {
          s.generation++;
          setStatus("이전 편집 내용 복구됨");
          if (s.conflict)
            setError(
              "복구한 내용과 원본의 버전이 다릅니다. 현재 내용을 사본으로 보관한 뒤 원본을 다시 열어주세요.",
            );
          else s.timer = setTimeout(flush, 800);
        } else setStatus("모든 변경사항 저장됨");
      } catch (e: any) {
        setError(e.message);
        setStatus("문서를 열지 못했습니다.");
      }
    }
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty()) {
        backup();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const visibility = () => {
        if (document.hidden) flush();
      },
      blur = () => flush(),
      online = () => flush(),
      key = (event: KeyboardEvent) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          flush();
        }
      };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("online", online);
    window.addEventListener("keydown", key);
    (window as any).prepareAppUpdate = async () => {
      if (!editor.current || s.composing) return false;
      return flush();
    };
    start();
    return () => {
      disposed = true;
      backup();
      clearTimeout(s.timer);
      clearTimeout(s.maxTimer);
      editor.current?.destroy();
      editor.current = null;
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("online", online);
      window.removeEventListener("keydown", key);
    };
  }, [file.id]);
  function command(name: string, fn: (ed: Editor) => any) {
    return (
      <button
        className={
          "keep-label document-tool" +
          (editor.current?.isActive(name) ? " selected" : "")
        }
        disabled={!ready}
        type="button"
        aria-label={
          {
            bold: "굵게",
            italic: "기울임",
            underline: "밑줄",
            strike: "취소선",
            bulletList: "글머리 기호",
            orderedList: "번호 목록",
          }[name] || name
        }
        aria-pressed={editor.current?.isActive(name) || false}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (editor.current) {
            fn(editor.current);
            setActive((v) => v + 1);
          }
        }}
      >
        {(
          {
            bold: <b>B</b>,
            italic: <i>I</i>,
            underline: <u>U</u>,
            strike: <s>S</s>,
            bulletList: "• 목록",
            orderedList: "1. 목록",
          } as any
        )[name] || name}
      </button>
    );
  }
  return (
    <main className="document-editor" data-selection={active}>
      <header className="document-header">
        <span className="document-logo">
          <Icon name="file" />
        </span>
        <div className="document-heading">
          <h1>{file.name}</h1>
          <span role="status" aria-live="polite">
            {status}
          </span>
        </div>
        <span className="document-autosave-label">자동저장</span>
        {format === "docx" && (
          <button
            className="keep-label"
            onClick={async () => {
              if (!(await session.current?.flush())) return;
              localStorage.setItem("production-document-editor", "full");
              location.reload();
            }}
          >
            전체 기능
          </button>
        )}
      </header>
      <div className="document-toolbar" role="toolbar" aria-label="문서 서식">
        {command("실행 취소", (ed) => ed.chain().focus().undo().run())}
        {command("다시 실행", (ed) => ed.chain().focus().redo().run())}
        <span className="document-tool-divider" />
        <select
          className="keep-label"
          aria-label="문단 스타일"
          disabled={!ready || format === "text"}
          value={
            editor.current?.isActive("heading")
              ? "heading" + editor.current.getAttributes("heading").level
              : "paragraph"
          }
          onChange={(e) => {
            const ed = editor.current;
            if (!ed) return;
            if (e.target.value === "paragraph")
              ed.chain().focus().setParagraph().run();
            else
              ed.chain()
                .focus()
                .setHeading({ level: Number(e.target.value.slice(-1)) as any })
                .run();
            setActive((v) => v + 1);
          }}
        >
          <option value="paragraph">본문</option>
          {[1, 2, 3].map((level) => (
            <option key={level} value={"heading" + level}>
              제목 {level}
            </option>
          ))}
        </select>
        {format !== "text" && (
          <>
            <select
              aria-label="글자 크기"
              className="keep-label"
              value={
                editor.current?.getAttributes("textStyle").fontSize || "11pt"
              }
              onChange={(e) => {
                editor.current
                  ?.chain()
                  .focus()
                  .setFontSize(e.target.value)
                  .run();
                setActive((v) => v + 1);
              }}
            >
              {[9, 10, 11, 12, 14, 16, 18, 24, 32].map((size) => (
                <option key={size} value={size + "pt"}>
                  {size}
                </option>
              ))}
            </select>
            {command("bold", (ed) => ed.chain().focus().toggleBold().run())}
            {command("italic", (ed) => ed.chain().focus().toggleItalic().run())}
            {command("underline", (ed) =>
              ed.chain().focus().toggleUnderline().run(),
            )}
            {command("strike", (ed) => ed.chain().focus().toggleStrike().run())}
            <label className="document-color">
              글자색
              <input
                type="color"
                aria-label="글자색"
                value={
                  editor.current?.getAttributes("textStyle").color || "#242424"
                }
                onChange={(e) =>
                  editor.current?.chain().focus().setColor(e.target.value).run()
                }
              />
            </label>
            <select
              className="keep-label"
              aria-label="문단 정렬"
              value={
                editor.current?.getAttributes("paragraph").textAlign ||
                editor.current?.getAttributes("heading").textAlign ||
                "left"
              }
              onChange={(e) => {
                editor.current
                  ?.chain()
                  .focus()
                  .setTextAlign(e.target.value)
                  .run();
                setActive((v) => v + 1);
              }}
            >
              <option value="left">왼쪽 정렬</option>
              <option value="center">가운데 정렬</option>
              <option value="right">오른쪽 정렬</option>
              <option value="justify">양쪽 정렬</option>
            </select>
            {command("bulletList", (ed) =>
              ed.chain().focus().toggleBulletList().run(),
            )}
            {command("orderedList", (ed) =>
              ed.chain().focus().toggleOrderedList().run(),
            )}
            {command("표 삽입", (ed) =>
              ed
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: false })
                .run(),
            )}
            {editor.current?.isActive("table") && (
              <>
                {command("행 추가", (ed) =>
                  ed.chain().focus().addRowAfter().run(),
                )}
                {command("열 추가", (ed) =>
                  ed.chain().focus().addColumnAfter().run(),
                )}
                {command("표 삭제", (ed) =>
                  ed.chain().focus().deleteTable().run(),
                )}
              </>
            )}
          </>
        )}
      </div>
      {error && (
        <div className="document-error" role="alert">
          <span>{error}</span>
          {ready && (
            <>
              {!session.current?.conflict && (
                <button
                  className="keep-label"
                  onClick={() => session.current?.flush()}
                >
                  저장 다시 시도
                </button>
              )}
              <button
                className="keep-label"
                onClick={() =>
                  session.current
                    ?.download()
                    .catch((e: any) => setError(e.message))
                }
              >
                현재 내용 사본 저장
              </button>
            </>
          )}
        </div>
      )}
      <div className="document-scroll">
        <div className="document-sheet" ref={host} />
      </div>
      <footer className="document-footer">
        원본 파일에 자동으로 저장됩니다.
        {format === "text" && " · 텍스트 파일은 글 내용만 저장됩니다."}
      </footer>
    </main>
  );
}
(window as any).startBasicDocumentEditor = (file:any,host:HTMLElement) => {createRoot(host).render(<DocumentEditor file={file}/>)};
