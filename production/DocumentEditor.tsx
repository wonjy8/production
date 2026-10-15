import { FontManager } from "./FontManager";
import {
  currentCustomFonts,
  prepareCustomFonts,
  watchCustomFonts,
  customFontBytes,
  usedFontFamilies,
} from "./custom-fonts";
import { documentPagination } from "./document-pagination";
import {
  listResources,
  saveResource,
  createNote,
  resourceFile,
} from "./resources";
import { documentURL } from "./document-launch";
import { loadDocumentPDF } from "./load-document-tools";
import { legacyDraft } from "./legacy-document-drafts";
import { documentLayout } from "./document-layout";
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
const documentFontRendering = Extension.create({
  name: "documentFontRendering",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontFamily: {
            default: null,
            parseHTML: (el) =>
              el.style.fontFamily
                ?.split(",")[0]
                .replace(/^["']|["']$/g, "")
                .trim() || null,
            renderHTML: (attrs) =>
              attrs.fontFamily
                ? {
                    style:
                      "font-family:" +
                      JSON.stringify(attrs.fontFamily) +
                      ',Arial,"Noto Sans KR"',
                  }
                : {},
          },
        },
      },
    ];
  },
});
const preserve = Extension.create({
  name: "docxProperties",
  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: { docxLayout: { default: null, rendered: false } },
      },
      {
        types: ["bulletList", "orderedList"],
        attributes: {
          docxNumId: { default: null, rendered: false },
          docxNumKind: { default: null, rendered: false },
        },
      },
      {
        types: [
          "paragraph",
          "heading",
          "table",
          "tableRow",
          "tableCell",
          "tableHeader",
        ],
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
    return {
      xml: { default: null, rendered: false },
      preview: { default: "", rendered: false },
    };
  },
  parseHTML() {
    return [];
  },
  renderHTML() {
    return ["span", 0];
  },
});
const commentMark = Mark.create({
  name: "docxComment",
  inclusive: false,
  addAttributes() {
    return {
      id: { default: "" },
      text: { default: "" },
      author: { default: "" },
      date: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "mark[data-comment-id]" }];
  },
  renderHTML({ mark }) {
    return [
      "mark",
      {
        class: "docx-comment",
        "data-comment-id": mark.attrs.id,
        title: mark.attrs.text,
      },
      0,
    ];
  },
});
const opaque = TiptapNode.create({
  name: "docxOpaque",
  group: "block",
  atom: true,
  draggable: false,
  addAttributes() {
    return {
      xml: { default: null, rendered: false },
      preview: { default: "", rendered: false },
    };
  },
  parseHTML() {
    return [];
  },
  renderHTML({ node }) {
    return [
      "div",
      { class: "document-preserved", contenteditable: "false" },
      node.attrs.preview || "이 요소는 원본 형식으로 보존됩니다.",
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
    [oldRecovery, setOldRecovery] = useState<Blob | null>(null),
    [status, setStatus] = useState("문서를 불러오는 중…"),
    [error, setError] = useState(""),
    [active, setActive] = useState(0),
    [comment, setComment] = useState<any>(null),
    [showLayout, setShowLayout] = useState(false),
    [panel, setPanel] = useState("page"),
    [customFonts, setCustomFonts] = useState(currentCustomFonts()),
    [name, setName] = useState(file.name),
    [titleDraft, setTitleDraft] = useState(file.name.replace(/\.[^.]+$/, "")),
    [editingTitle, setEditingTitle] = useState(false),
    [exporting, setExporting] = useState(false),
    [zoom, setZoom] = useState("fit"),
    [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      prepareCustomFonts(usedFontFamilies(host.current))
        .then((rows) => {
          if (alive) {
            setCustomFonts(rows);
            setActive((v) => v + 1);
            editor.current?.view.dom.dispatchEvent(
              new Event("document-layout-change"),
            );
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    refresh();
    const stop = watchCustomFonts(refresh);
    return () => {
      alive = false;
      stop();
    };
  }, [ready]);
  function openPanel(tab: string) {
    setPanel(tab);
    setShowLayout(true);
  }
  const layout = documentLayout(editor.current?.getJSON().attrs?.docxLayout);
  const scroll = useRef<HTMLDivElement>(null),
    titleInput = useRef<HTMLInputElement>(null);
  const resource = useRef<any>(null);
  useEffect(() => {
    editor.current?.view.dom.dispatchEvent(new Event("document-layout-change"));
  }, [ready, zoom, fitScale, showLayout]);

  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>(
        ".document-editor button,.document-editor select,.document-editor label,.document-editor summary",
      )
      .forEach((el) => {
        if (!el.title) {
          const label = el.getAttribute("aria-label") || el.textContent?.trim();
          if (label) el.title = label;
        }
      });
  }, [active, ready, showLayout, panel, comment, customFonts.length]);

  useEffect(() => {
    listResources()
      .then((rows) => {
        const row = rows.find((r: any) => r.fileId === file.id);
        if (row) {
          resource.current = row;
          const ext = file.name.match(/\.[^.]+$/)?.[0] || "";
          file.name = row.title.toLowerCase().endsWith(ext.toLowerCase())
            ? row.title
            : row.title + ext;
          setName(file.name);
          setTitleDraft(file.name.replace(/\.[^.]+$/, ""));
          document.title = file.name + " · 문서";
        }
      })
      .catch(() => {});
  }, [file.id]);
  useEffect(() => {
    if (!scroll.current) return;
    const update = () => {
      const next = Math.min(
        1,
        (scroll.current!.clientWidth - 24) / ((layout.width * 96) / 25.4),
      );
      setFitScale((old) => (Math.abs(old - next) < 0.001 ? old : next));
    };
    const observer = new ResizeObserver(update);
    observer.observe(scroll.current);
    update();
    return () => observer.disconnect();
  }, [ready, layout.width]);
  useEffect(() => {
    if (editingTitle) {
      titleInput.current?.focus();
      titleInput.current?.select();
    }
  }, [editingTitle]);
  useEffect(() => {
    const close = (event: Event) => {
      const target = event.target as Element;
      document
        .querySelectorAll<HTMLDetailsElement>(".document-menu[open]")
        .forEach((menu) => {
          if (!menu.contains(target)) menu.open = false;
        });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        document
          .querySelectorAll<HTMLDetailsElement>(".document-menu[open]")
          .forEach((menu) => (menu.open = false));
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  async function rename() {
    if (!editingTitle) return;
    const title = titleDraft.trim().replace(/[\/\\\r\n]/g, " ");
    if (!title) {
      setTitleDraft(name.replace(/\.[^.]+$/, ""));
      setEditingTitle(false);
      return;
    }
    try {
      const rows = await listResources(),
        row = rows.find((r: any) => r.fileId === file.id);
      if (!row) throw Error("문서 정보를 찾을 수 없습니다.");
      const saved = await saveResource({ ...row, title });
      resource.current = saved;
      file.name = title + (name.match(/\.[^.]+$/)?.[0] || "");
      setName(file.name);
      setTitleDraft(title);
      document.title = title + " · 문서";
      const url = new URL(location.href);
      url.searchParams.set("name", file.name);
      history.replaceState(null, "", url);
      window.opener?.dispatchEvent(new Event("resources-changed"));
      setEditingTitle(false);
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function exportPDF() {
    if (exporting) return;
    setExporting(true);
    setError("");
    editor.current?.setEditable(false);
    try {
      await prepareCustomFonts(usedFontFamilies(host.current));
      await document.fonts.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const exportPDF = await loadDocumentPDF();
      const blob = await exportPDF(
        host.current!,
        editor.current?.getJSON().attrs?.docxLayout,
        { fonts: currentCustomFonts(), bytes: customFontBytes },
      );
      downloadBlob(blob, file.name.replace(/\.[^.]+$/, "") + ".pdf");
    } catch (e: any) {
      setError(e.message);
    } finally {
      editor.current?.setEditable(true);
      setExporting(false);
    }
  }
  async function newDocument() {
    const popup = window.open("about:blank", "_blank");
    if (popup) {
      popup.opener = null;
      popup.document.body.textContent = "문서를 준비하는 중…";
    }
    try {
      const row = await createNote({ title: "제목 없는 문서", properties: {} });
      if (popup) popup.location.replace(documentURL(resourceFile(row), null));
    } catch (e: any) {
      popup?.close();
      setError(e.message);
    }
  }
  function menuAction(event: any, run: () => any) {
    event.currentTarget.closest("details")?.removeAttribute("open");
    run();
  }

  const comments = new Map<string, any>();
  editor.current?.state.doc.descendants((node: any, pos: number) =>
    node.marks.forEach((m: any) => {
      if (m.type.name === "docxComment" && !comments.has(m.attrs.id))
        comments.set(m.attrs.id, { ...m.attrs, pos });
    }),
  );
  function applyLayout(key: string, value: string) {
    const next = documentLayout({ ...layout, [key]: Number(value) });
    editor.current?.commands.command(({ tr }: any) => {
      tr.setDocAttribute("docxLayout", next);
      return true;
    });
    setActive((v) => v + 1);
  }
  function addComment() {
    const ed = editor.current;
    if (!ed) return;
    const { from, to, $from, $to } = ed.state.selection;
    if (from === to || !$from.sameParent($to)) {
      setError("주석을 달 한 문단 안의 텍스트를 선택하세요.");
      return;
    }
    setComment({ from, to, text: "" });
    openPanel("comments");
  }

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
          if (s.legacyKey) {
            await legacyDraft(s.legacyKey, true);
            s.legacyKey = null;
          }
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
        if (!localStorage.getItem(draftKey)) {
          const key = location.pathname + ":" + file.id + ":" + sessionId,
            old = await legacyDraft(key);
          if (old?.blob) {
            if (old.version === s.version) {
              const recovered = await loadDocument(old.blob, format);
              content = recovered.content;
              s.zip = recovered.zip;
              restored = true;
              s.legacyKey = key;
            } else setOldRecovery(old.blob);
          }
        }
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
            commentMark,
            documentPagination,
            StarterKit.configure({
              link: { openOnClick: false, protocols: ["https", "http"] },
            }),
            TextStyleKit,
            documentFontRendering,
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
          ([
            "표 삽입",
            "행 추가",
            "열 추가",
            "행 삭제",
            "열 삭제",
            "셀 병합",
            "셀 분할",
            "표 삭제",
          ].includes(name)
            ? " document-tool-text"
            : "") +
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
        title={
          (
            {
              bold: "굵게",
              italic: "기울임",
              underline: "밑줄",
              strike: "취소선",
              bulletList: "글머리 기호",
              orderedList: "번호 목록",
            } as any
          )[name] || name
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
        <Icon
          name={
            (
              {
                bold: "bold",
                italic: "italic",
                underline: "underline",
                strike: "strike",
                bulletList: "list",
                orderedList: "listOrdered",
                "실행 취소": "undo",
                "다시 실행": "redo",
                링크: "link",
                "표 삽입": "table",
                "행 추가": "rowPlus",
                "열 추가": "columnPlus",
                "행 삭제": "rowDelete",
                "열 삭제": "columnDelete",
                "셀 병합": "mergeCells",
                "셀 분할": "splitCells",
                "표 삭제": "trash",
              } as any
            )[name] || "settings"
          }
        />
        {[
          "표 삽입",
          "행 추가",
          "열 추가",
          "행 삭제",
          "열 삭제",
          "셀 병합",
          "셀 분할",
          "표 삭제",
        ].includes(name) && <span>{name}</span>}
      </button>
    );
  }
  return (
    <main className="document-editor" data-selection={active}>
      <header className="document-header">
        <span className="document-logo" title="문서 편집기">
          <Icon name="file" />
        </span>
        <div className="document-heading">
          {editingTitle ? (
            <input
              ref={titleInput}
              className="document-title-input"
              aria-label="문서 제목"
              value={titleDraft}
              maxLength={190}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={rename}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setTitleDraft(name.replace(/\.[^.]+$/, ""));
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <h1>
              <button
                className="document-title keep-label"
                title="문서 이름 바꾸기"
                aria-label="문서 이름 바꾸기"
                onClick={() => setEditingTitle(true)}
              >
                {name.replace(/\.[^.]+$/, "")}
              </button>
            </h1>
          )}
        </div>
        <button
          className="keep-label document-title-edit"
          aria-label="문서 제목 편집"
          title="문서 제목 편집"
          onClick={() => setEditingTitle(true)}
        >
          <Icon name="edit" />
        </button>
        <span className="document-save-status" role="status" aria-live="polite">
          {status}
        </span>
        <details className="document-export document-menu">
          <summary aria-label="내보내기">
            <Icon name="download" />
            <span>{exporting ? "PDF 만드는 중…" : "내보내기"}</span>
            <Icon name="down" />
          </summary>
          <div role="menu">
            <button
              className="keep-label"
              role="menuitem"
              disabled={!ready || exporting}
              onClick={(e) => menuAction(e, exportPDF)}
            >
              <Icon name="file" />
              PDF (.pdf)
            </button>
            <button
              className="keep-label"
              role="menuitem"
              disabled={!ready || exporting}
              onClick={(e) =>
                menuAction(e, () =>
                  session.current
                    ?.download()
                    .catch((err: any) => setError(err.message)),
                )
              }
            >
              <Icon name="file" />
              {format === "docx" ? "Word (.docx)" : "원본 파일"}
            </button>
          </div>
        </details>
        <button
          className="keep-label document-settings-toggle"
          aria-label="문서 설정"
          title="문서 설정"
          aria-expanded={showLayout}
          onClick={() => setShowLayout(!showLayout)}
        >
          <Icon name="settings" />
        </button>
      </header>
      <div className="document-toolbar" role="toolbar" aria-label="문서 서식">
        <button
          className="keep-label document-tool-text"
          title="새 문서"
          onClick={newDocument}
        >
          <Icon name="plus" />새 문서
        </button>
        <span className="document-tool-divider" />

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
              aria-label="글꼴"
              className="keep-label"
              disabled={!ready}
              value={
                editor.current?.getAttributes("textStyle").fontFamily || "Arial"
              }
              onChange={(e) => {
                editor.current
                  ?.chain()
                  .focus()
                  .setFontFamily(e.target.value)
                  .run();
                prepareCustomFonts([e.target.value])
                  .then((rows) => {
                    setCustomFonts(rows);
                    editor.current?.view.dom.dispatchEvent(
                      new Event("document-layout-change"),
                    );
                  })
                  .catch((err) => setError(err.message));
                setActive((v) => v + 1);
              }}
            >
              {[
                ...new Set([
                  ...customFonts.map((font) => font.family),
                  editor.current?.getAttributes("textStyle").fontFamily ||
                    "Arial",
                  "Arial",
                  "맑은 고딕",
                  "Noto Sans KR",
                  "바탕",
                  "Times New Roman",
                  "Calibri",
                ]),
              ].map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
            <button
              className="keep-label document-tool-text"
              title="글꼴 추가·관리"
              onClick={() => openPanel("fonts")}
            >
              글꼴 추가
            </button>
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
            <span className="document-tool-divider" />
            {command("링크", (ed) => {
              const href = window.prompt(
                "HTTPS 링크",
                ed.getAttributes("link").href || "https://",
              );
              if (href === null) return;
              if (!href) {
                ed.chain().focus().unsetLink().run();
                return;
              }
              if (!/^https?:\/\//i.test(href)) {
                setError("HTTP 또는 HTTPS 주소를 입력하세요.");
                return;
              }
              ed.chain().focus().setLink({ href }).run();
            })}
            {command("bold", (ed) => ed.chain().focus().toggleBold().run())}
            {command("italic", (ed) => ed.chain().focus().toggleItalic().run())}
            {command("underline", (ed) =>
              ed.chain().focus().toggleUnderline().run(),
            )}
            {command("strike", (ed) => ed.chain().focus().toggleStrike().run())}
            <label className="document-color" title="글자색">
              <Icon name="text" />
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
            <span className="document-tool-divider" />
            <label className="document-tool keep-label" title="이미지 추가">
              <Icon name="reference" />
              <span className="sr-only">이미지 추가</span>
              <input
                style={{ display: "none" }}
                type="file"
                accept="image/png,image/jpeg,image/gif"
                aria-label="문서 이미지 추가"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (
                    !/^image\/(png|jpeg|gif)$/.test(file.type) ||
                    file.size > 10 * 1024 * 1024
                  ) {
                    setError("PNG, JPEG, GIF 이미지를 10MB 이하로 선택하세요.");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const image = new window.Image();
                    image.onload = () => {
                      const maxWidth =
                          ((layout.width - layout.left - layout.right) * 96) /
                          25.4,
                        maxHeight =
                          ((layout.height - layout.top - layout.bottom) * 96) /
                          25.4;
                      const ratio = Math.min(
                        1,
                        maxWidth / image.naturalWidth,
                        maxHeight / image.naturalHeight,
                      );
                      editor.current
                        ?.chain()
                        .focus()
                        .setImage({
                          src: String(reader.result),
                          width: Math.round(image.naturalWidth * ratio),
                          height: Math.round(image.naturalHeight * ratio),
                        })
                        .run();
                    };
                    image.onerror = () => setError("이미지를 읽지 못했습니다.");
                    image.src = String(reader.result);
                  };
                  reader.onerror = () => setError("이미지를 읽지 못했습니다.");
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            <button
              className="keep-label document-tool-text"
              aria-label="주석"
              title="주석 보기·추가"
              aria-expanded={showLayout && panel === "comments"}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => openPanel("comments")}
            >
              <Icon name="feedback" />
              주석{comments.size > 0 ? " " + comments.size : ""}
            </button>
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
                {command("행 삭제", (ed) =>
                  ed.chain().focus().deleteRow().run(),
                )}
                {command("열 삭제", (ed) =>
                  ed.chain().focus().deleteColumn().run(),
                )}
                {command("셀 병합", (ed) =>
                  ed.chain().focus().mergeCells().run(),
                )}
                {command("셀 분할", (ed) =>
                  ed.chain().focus().splitCell().run(),
                )}
                {command("표 삭제", (ed) =>
                  ed.chain().focus().deleteTable().run(),
                )}
              </>
            )}
          </>
        )}
      </div>
      {oldRecovery && (
        <div className="document-error" role="alert">
          이전 편집기의 복구본이 있습니다. 원본 버전이 달라 자동 적용하지
          않았습니다.
          <button
            className="keep-label"
            onClick={() => downloadBlob(oldRecovery, file.name)}
          >
            이전 복구본 내려받기
          </button>
        </div>
      )}
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
      <div className="document-workspace">
        <div className="document-scroll" ref={scroll}>
          <div
            className="document-sheet"
            ref={host}
            style={{
              width: layout.width + "mm",
              maxWidth: "none",
              zoom: zoom === "fit" ? fitScale : Number(zoom) / 100,
              "--page-height": (layout.height * 96) / 25.4 + "px",
              "--page-top": layout.top + "mm",
              "--page-bottom": layout.bottom + "mm",
              "--page-body-height":
                layout.height - layout.top - layout.bottom + "mm",
              paddingTop: layout.top + "mm",
              paddingRight: layout.right + "mm",
              paddingBottom: layout.bottom + "mm",
              paddingLeft: layout.left + "mm",
            }}
          />
        </div>
        {showLayout && (
          <aside className="document-settings" aria-label="문서 설정 패널">
            <header>
              <h2>문서 설정</h2>
              <button
                className="keep-label"
                aria-label="페이지 설정 닫기"
                title="설정 닫기"
                onClick={() => setShowLayout(false)}
              >
                <Icon name="close" />
              </button>
            </header>
            <nav aria-label="문서 설정 종류">
              {[
                ["page", "페이지"],
                ["comments", "주석"],
                ["fonts", "글꼴"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className="keep-label"
                  aria-pressed={panel === id}
                  onClick={() => setPanel(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {panel === "page" && (
              <fieldset className="document-layout-controls">
                <legend>페이지 설정 · mm</legend>
                <label>
                  용지 크기
                  <select
                    className="keep-label"
                    aria-label="용지 크기"
                    value={
                      (layout.width === 210 && layout.height === 297) ||
                      (layout.width === 297 && layout.height === 210)
                        ? "a4"
                        : (layout.width === 148 && layout.height === 210) ||
                            (layout.width === 210 && layout.height === 148)
                          ? "a5"
                          : (layout.width === 215.9 &&
                                layout.height === 279.4) ||
                              (layout.width === 279.4 &&
                                layout.height === 215.9)
                            ? "letter"
                            : "custom"
                    }
                    onChange={(e) => {
                      const sizes: any = {
                        a4: [210, 297],
                        a5: [148, 210],
                        letter: [215.9, 279.4],
                      };
                      if (sizes[e.target.value]) {
                        const [width, height] = sizes[e.target.value];
                        editor.current?.commands.command(({ tr }: any) => {
                          tr.setDocAttribute("docxLayout", {
                            ...layout,
                            width,
                            height,
                          });
                          return true;
                        });
                        setActive((v) => v + 1);
                      }
                    }}
                  >
                    <option value="a4">A4 (210 × 297)</option>
                    <option value="a5">A5 (148 × 210)</option>
                    <option value="letter">Letter (215.9 × 279.4)</option>
                    <option value="custom">사용자 지정</option>
                  </select>
                </label>
                <button
                  className="keep-label"
                  aria-label="용지 방향 전환"
                  onClick={() => {
                    editor.current?.commands.command(({ tr }: any) => {
                      tr.setDocAttribute("docxLayout", {
                        ...layout,
                        width: layout.height,
                        height: layout.width,
                      });
                      return true;
                    });
                    setActive((v) => v + 1);
                  }}
                >
                  <Icon name="refresh" />
                  가로·세로 전환
                </button>
                {[
                  ["width", "쪽 너비"],
                  ["height", "쪽 높이"],
                  ["top", "위 여백"],
                  ["right", "오른쪽 여백"],
                  ["bottom", "아래 여백"],
                  ["left", "왼쪽 여백"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      aria-label={label}
                      min={["width", "height"].includes(key) ? 100 : 0}
                      max={["width", "height"].includes(key) ? 600 : 80}
                      step="0.1"
                      value={Math.round((layout as any)[key] * 10) / 10}
                      onChange={(e) => applyLayout(key, e.target.value)}
                    />
                  </label>
                ))}
              </fieldset>
            )}
            {panel === "comments" && comment && (
              <form
                className="document-comment-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const id = String(
                    crypto.getRandomValues(new Uint32Array(1))[0] & 0x3fffffff,
                  );
                  editor.current
                    ?.chain()
                    .focus()
                    .setTextSelection({ from: comment.from, to: comment.to })
                    .setMark("docxComment", {
                      id,
                      text: comment.text,
                      author:
                        (window as any).appAccount?.profile?.name || "사용자",
                      date: new Date().toISOString(),
                    })
                    .run();
                  setComment(null);
                  setActive((v) => v + 1);
                }}
              >
                <label>
                  주석
                  <input
                    aria-label="주석 내용"
                    autoFocus
                    required
                    maxLength={2000}
                    value={comment.text}
                    onChange={(e) =>
                      setComment({ ...comment, text: e.target.value })
                    }
                  />
                </label>
                <button className="keep-label">주석 적용</button>
                <button
                  type="button"
                  className="keep-label"
                  onClick={() => setComment(null)}
                >
                  취소
                </button>
              </form>
            )}
            {panel === "comments" && (
              <section className="document-comments" aria-label="문서 주석">
                <button
                  className="keep-label document-tool-text"
                  title="선택한 텍스트에 주석 추가"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={addComment}
                >
                  <Icon name="plus" />
                  주석 추가
                </button>
                {[...comments.values()].map((c) => (
                  <div key={c.id}>
                    <button
                      className="keep-label"
                      onClick={() =>
                        editor.current
                          ?.chain()
                          .focus()
                          .setTextSelection(c.pos)
                          .run()
                      }
                    >
                      {c.author}: {c.text}
                    </button>
                    <button
                      className="keep-label danger"
                      aria-label={"주석 삭제 " + c.text}
                      onClick={() => {
                        const ed = editor.current;
                        if (!ed) return;
                        ed.commands.command(({ tr, doc }: any) => {
                          doc.descendants((n: any, pos: number) => {
                            for (const m of n.marks)
                              if (
                                m.type.name === "docxComment" &&
                                m.attrs.id === c.id
                              )
                                tr.removeMark(pos, pos + n.nodeSize, m);
                          });
                          return true;
                        });
                        setActive((v) => v + 1);
                      }}
                    >
                      삭제
                    </button>
                  </div>
                ))}
                {!comments.size && (
                  <p>선택한 텍스트에 주석을 추가할 수 있습니다.</p>
                )}
              </section>
            )}
            {panel === "fonts" && <FontManager />}
            {panel === "page" && (
              <section className="document-view-controls">
                <h3>보기</h3>
                <label>
                  확대·축소
                  <select
                    className="keep-label document-zoom"
                    aria-label="문서 배율"
                    value={zoom}
                    onChange={(e) => setZoom(e.target.value)}
                  >
                    <option value="fit">너비 맞춤</option>
                    {[50, 75, 100, 125, 150, 200].map((n) => (
                      <option key={n} value={n}>
                        {n}%
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="keep-label"
                  title="전체 선택"
                  onClick={() =>
                    editor.current?.chain().focus().selectAll().run()
                  }
                >
                  전체 선택
                </button>
                <button
                  className="keep-label"
                  title="선택 영역 서식 지우기"
                  onClick={() =>
                    editor.current
                      ?.chain()
                      .focus()
                      .unsetAllMarks()
                      .clearNodes()
                      .run()
                  }
                >
                  서식 지우기
                </button>
              </section>
            )}
          </aside>
        )}
      </div>
      <footer className="document-footer">
        원본 파일에 자동으로 저장됩니다.
        {format === "text" && " · 텍스트 파일은 글 내용만 저장됩니다."}
      </footer>
    </main>
  );
}
export function mountDocumentEditor(file: any, host: HTMLElement) {
  createRoot(host).render(<DocumentEditor file={file} />);
}
