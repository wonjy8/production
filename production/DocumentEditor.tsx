import {
  Alignment,
  ParagraphControls,
  ListControls,
} from "./ParagraphControls";
import { ColorControl, TablePicker, shapeImage } from "./EditorControls";
import {
  Highlight,
  scripts,
  editorAttributes,
  DocumentTableView,
  ListLevels,
} from "./document-extensions";
import { addResourceFile } from "./resources";
import { readFile } from "./files";
import { ResourceImagePicker } from "./ResourceImagePicker";
import {
  currentCustomFonts,
  prepareCustomFonts,
  watchCustomFonts,
  customFontBytes,
  usedFontFamilies,
} from "./custom-fonts";
import { documentPagination } from "./document-pagination";
import { listResources, saveResource } from "./resources";
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
    session = useRef<any>(null),
    pendingOperations = useRef(0);
  const [ready, setReady] = useState(false),
    [oldRecovery, setOldRecovery] = useState<Blob | null>(null),
    [status, setStatus] = useState("문서를 불러오는 중…"),
    [error, setError] = useState(""),
    [active, setActive] = useState(0),
    [showLayout, setShowLayout] = useState(
      () => !window.matchMedia("(max-width: 720px)").matches,
    ),
    [panel, setPanel] = useState("properties"),
    [showImages, setShowImages] = useState(false),
    [customFonts, setCustomFonts] = useState(currentCustomFonts()),
    [name, setName] = useState(file.name),
    [titleDraft, setTitleDraft] = useState(file.name.replace(/\.[^.]+$/, "")),
    [editingTitle, setEditingTitle] = useState(false),
    [exporting, setExporting] = useState(false),
    [zoom, setZoom] = useState("fit"),
    [fitScale, setFitScale] = useState(1),
    [pageInfo, setPageInfo] = useState({ current: 1, total: 1 }),
    [outlineOpen, setOutlineOpen] = useState(false),
    [updateAvailable, setUpdateAvailable] = useState(false),
    [marginMarks] = useState(true);
  const dismissedUpdate = useRef("");
  const deviceImage = useRef<HTMLInputElement>(null),
    deviceFile = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const available = () => {
      const updates = (window as any).appUpdates;
      setUpdateAvailable(
        !!updates?.available &&
          dismissedUpdate.current !== (updates.version || "pending"),
      );
    };
    const failure = (e: any) => setError(e.detail);
    available();
    window.addEventListener("app-update-ready", available);
    window.addEventListener("app-update-error", failure);
    return () => {
      window.removeEventListener("app-update-ready", available);
      window.removeEventListener("app-update-error", failure);
    };
  }, []);
  useEffect(() => {
    const sheet = host.current,
      viewport = scroll.current;
    if (!sheet || !viewport) return;
    const measure = () => {
      const total = Number(sheet.dataset.pageCount) || 1;
      const rect = sheet.getBoundingClientRect(),
        scale = rect.width / sheet.offsetWidth || 1;
      const current = Math.max(
        1,
        Math.min(
          total,
          Math.floor(
            Math.max(0, viewport.getBoundingClientRect().top - rect.top + 80) /
              (((layout.height * 96) / 25.4 + 28) * scale),
          ) + 1,
        ),
      );
      setPageInfo((old) =>
        old.total === total && old.current === current
          ? old
          : { total, current },
      );
    };
    const observer = new MutationObserver(measure);
    observer.observe(sheet, {
      attributes: true,
      attributeFilter: ["data-page-count"],
    });
    viewport.addEventListener("scroll", measure);
    measure();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", measure);
    };
  }, [ready, zoom, fitScale, active]);
  const headings: any[] = [];
  editor.current?.state.doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim())
      headings.push({
        pos,
        level: node.attrs.level,
        text: node.textContent || "제목",
      });
  });
  const currentHeading = [...headings]
    .reverse()
    .find((h) => h.pos <= (editor.current?.state.selection.from || 0))?.pos;
  const words =
    editor.current?.getText().trim().split(/\s+/).filter(Boolean).length || 0;
  function insertImage(src: string, width: number, height: number, alt = "") {
    const ratio = Math.min(
      1,
      ((layout.width - layout.left - layout.right) * 96) / 25.4 / width,
      ((layout.height - layout.top - layout.bottom) * 96) / 25.4 / height,
    );
    editor.current
      ?.chain()
      .focus()
      .setImage({
        src,
        alt,
        width: Math.round(width * ratio),
        height: Math.round(height * ratio),
      })
      .run();
  }
  async function uploadImage(file: File) {
    pendingOperations.current++;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw Error("10MB 이하 이미지를 선택하세요.");
      const url = URL.createObjectURL(file);
      try {
        const image = new window.Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d")!.drawImage(image, 0, 0);
        insertImage(canvas.toDataURL("image/png"), canvas.width, canvas.height);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      pendingOperations.current--;
    }
  }
  async function attachFile(file: File) {
    pendingOperations.current++;
    try {
      if (file.size > 25 * 1024 * 1024)
        throw Error("25MB 이하 파일을 선택하세요.");
      const row = await addResourceFile(file),
        href = new URL("api/ref-files/" + row.fileId, document.baseURI).href;
      const target = new URL(href);
      target.searchParams.set("mime", file.type || "application/octet-stream");
      target.searchParams.set("name", file.name);
      editor.current
        ?.chain()
        .focus()
        .insertContent([
          {
            type: "text",
            text: file.name,
            marks: [
              { type: "link", attrs: { href: target.href, target: "_blank" } },
            ],
          },
          { type: "text", text: " " },
        ])
        .run();
    } catch (e: any) {
      setError(e.message);
    } finally {
      pendingOperations.current--;
    }
  }
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
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>(
      ".document-settings-body",
    );
    if (sidebar) sidebar.scrollTop = 0;
  }, [panel, showLayout]);
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
  }, [active, ready, showLayout, panel, customFonts.length]);

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
      if (!target.closest(".document-outline")) setOutlineOpen(false);
      document
        .querySelectorAll<HTMLDetailsElement>(".document-menu[open]")
        .forEach((menu) => {
          if (!menu.contains(target)) menu.open = false;
        });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOutlineOpen(false);
        document
          .querySelectorAll<HTMLDetailsElement>(".document-menu[open]")
          .forEach((menu) => (menu.open = false));
      }
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
    pendingOperations.current++;
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
    } finally {
      pendingOperations.current--;
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
  function menuAction(event: any, run: () => any) {
    event.currentTarget.closest("details")?.removeAttribute("open");
    run();
  }

  function applyLayout(key: string, value: string) {
    const next = documentLayout({ ...layout, [key]: Number(value) });
    editor.current?.commands.command(({ tr }: any) => {
      tr.setDocAttribute("docxLayout", next);
      return true;
    });
    setActive((v) => v + 1);
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
      setActive((v) => v + 1);
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
            ListLevels,
            commentMark,
            Highlight,
            ...scripts,
            editorAttributes,
            documentPagination,
            StarterKit.configure({
              link: { openOnClick: false, protocols: ["https", "http"] },
            }),
            TextStyleKit,
            documentFontRendering,
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            TableKit.configure({ table: { View: DocumentTableView } }),
            Image.configure({ inline: true, allowBase64: true }),
            preserve,
            documentNavigation,
            runProperties,
            opaque,
          ],
          content,
          editorProps: {
            handleClick: (_view, _pos, event) => {
              const link = (event.target as HTMLElement).closest("a");
              if (!link) return false;
              const url = new URL(link.href, location.href),
                match = /\/api\/ref-files\/([a-f0-9-]+)$/.exec(url.pathname);
              if (match && url.origin === location.origin) {
                event.preventDefault();
                const popup = window.open("about:blank", "_blank");
                if (popup) popup.opener = null;
                readFile(match[1])
                  .then((blob) => {
                    const mime = url.searchParams.get("mime") || blob.type;
                    const inline =
                      /^(text\/plain|application\/pdf|image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|mp4|ogg|wav))(;|$)/i.test(
                        mime,
                      );
                    const safe = inline
                      ? new Blob([blob], { type: mime })
                      : /^(text\/html|application\/xhtml\+xml|image\/svg\+xml)/i.test(
                            blob.type,
                          )
                        ? new Blob([blob], { type: "text/plain" })
                        : blob;
                    const src = URL.createObjectURL(safe);
                    if (popup) popup.location.href = src;
                    else
                      downloadBlob(
                        blob,
                        link.textContent?.replace(/^📎 /, "") || "첨부 파일",
                      );
                    setTimeout(() => URL.revokeObjectURL(src), 60000);
                  })
                  .catch((e) => {
                    popup?.close();
                    setError(e.message);
                  });
                return true;
              }
              return false;
            },
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
      if (dirty() || s.composing || pendingOperations.current) {
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
      if (!editor.current || s.composing || pendingOperations.current)
        return false;
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
                "아래 첨자": "subscript",
                "위 첨자": "superscript",
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
        <button
          className="keep-label document-settings-toggle"
          aria-label="사이드바"
          title="사이드바"
          aria-expanded={showLayout}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setShowLayout(!showLayout);
            if (showLayout) editor.current?.view.focus();
          }}
        >
          <Icon name="menu" />
        </button>
      </header>
      <div className="document-toolbar" role="toolbar" aria-label="문서 삽입">
        {command("실행 취소", (ed) => ed.chain().focus().undo().run())}
        {command("다시 실행", (ed) => ed.chain().focus().redo().run())}
        {format !== "text" && (
          <>
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
            <details className="document-menu">
              <summary aria-label="이미지 추가" title="이미지 추가">
                <Icon name="reference" />
              </summary>
              <div role="menu">
                <button
                  className="keep-label"
                  onClick={(e) => menuAction(e, () => setShowImages(true))}
                >
                  자료에서 이미지 추가
                </button>
                <button
                  className="keep-label"
                  onClick={(e) =>
                    menuAction(e, () => deviceImage.current?.click())
                  }
                >
                  장치에서 추가
                </button>
              </div>
            </details>
            <TablePicker
              onInsert={(rows, cols) =>
                editor.current
                  ?.chain()
                  .focus()
                  .insertTable({ rows, cols, withHeaderRow: false })
                  .run()
              }
            />
            <button
              className="keep-label document-tool"
              aria-label="파일 추가"
              title="파일 추가"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => deviceFile.current?.click()}
            >
              <Icon name="attachment" />
            </button>
            <details className="document-menu">
              <summary aria-label="도형 추가" title="도형 추가">
                <Icon name="shapes" />
              </summary>
              <div role="menu">
                {[
                  ["rectangle", "사각형"],
                  ["ellipse", "타원"],
                  ["triangle", "삼각형"],
                  ["arrow", "화살표"],
                ].map(([id, label]) => (
                  <button
                    className="keep-label"
                    key={id}
                    onClick={(e) =>
                      menuAction(e, () =>
                        insertImage(shapeImage(id), 320, 200, "도형: " + label),
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </details>
          </>
        )}
      </div>
      <input
        ref={deviceImage}
        type="file"
        accept="image/*"
        hidden
        aria-label="장치 이미지 선택"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadImage(f);
          e.target.value = "";
        }}
      />
      <input
        ref={deviceFile}
        type="file"
        hidden
        aria-label="첨부 파일 선택"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) attachFile(f);
          e.target.value = "";
        }}
      />
      {showImages && (
        <ResourceImagePicker
          onClose={() => setShowImages(false)}
          onSelect={async (src, width, height) => {
            insertImage(src, width, height);
            setShowImages(false);
          }}
        />
      )}
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
      <div
        className={"document-workspace" + (showLayout ? " has-sidebar" : "")}
      >
        {headings.length > 0 && (
          <aside
            className="document-outline"
            onMouseEnter={() => setOutlineOpen(true)}
            onMouseLeave={() => setOutlineOpen(false)}
            aria-label="문서 목차"
          >
            <div
              className="outline-rail"
              role="navigation"
              aria-label="목차"
              tabIndex={0}
              onFocus={() => setOutlineOpen(true)}
              onClick={() => setOutlineOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOutlineOpen(true);
                }
              }}
            >
              {headings.map((h) => (
                <i
                  key={h.pos}
                  className={h.pos === currentHeading ? "active" : ""}
                  style={{ width: Math.max(10, 28 - h.level * 4) }}
                />
              ))}
            </div>
            {outlineOpen && (
              <nav aria-label="목차 항목">
                <strong>목차</strong>
                {headings.length ? (
                  headings.map((h) => (
                    <button
                      className="keep-label"
                      key={h.pos}
                      aria-current={
                        h.pos === currentHeading ? "location" : undefined
                      }
                      style={{ paddingLeft: 12 + (h.level - 1) * 14 }}
                      onClick={() => {
                        editor.current
                          ?.chain()
                          .focus()
                          .setTextSelection(h.pos + 1)
                          .scrollIntoView()
                          .run();
                        setOutlineOpen(false);
                      }}
                    >
                      {h.text}
                    </button>
                  ))
                ) : (
                  <p>제목 스타일을 적용하면 목차가 표시됩니다.</p>
                )}
              </nav>
            )}
          </aside>
        )}
        <div className="document-scroll" ref={scroll}>
          <div
            className={
              "document-sheet" + (marginMarks ? " show-margin-marks" : "")
            }
            ref={host}
            style={{
              width: layout.width + "mm",
              maxWidth: "none",
              zoom: zoom === "fit" ? fitScale : Number(zoom) / 100,
              "--page-height": (layout.height * 96) / 25.4 + "px",
              "--page-top": layout.top + "mm",
              "--page-left": layout.left + "mm",
              "--page-right": layout.right + "mm",
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
            <nav
              className="editor-panel-tabs"
              aria-label="문서 설정 종류"
              style={
                {
                  "--panel-index": ["page", "properties"].indexOf(panel),
                } as React.CSSProperties
              }
            >
              {[
                ["page", "문서", "file"],
                ["properties", "속성", "sliders"],
              ].map(([id, label, icon]) => (
                <button
                  key={id}
                  className="keep-label"
                  aria-pressed={panel === id}
                  onClick={() => setPanel(id)}
                >
                  <Icon name={icon} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="document-settings-body">
              {panel === "properties" && (
                <section
                  className="document-properties"
                  aria-label="선택 항목 속성"
                >
                  <h3>
                    {editor.current?.isActive("image")
                      ? editor.current
                          ?.getAttributes("image")
                          .alt?.startsWith("도형:")
                        ? "도형"
                        : "이미지"
                      : editor.current?.isActive("table")
                        ? "표 및 텍스트"
                        : "텍스트"}
                  </h3>
                  {(editor.current?.isActive("image") ||
                    editor.current?.isActive("table")) && (
                    <Alignment
                      object
                      value={
                        editor.current?.isActive("table")
                          ? editor.current.getAttributes("table").objectAlign ||
                            "left"
                          : editor.current?.getAttributes("paragraph")
                              .textAlign || "left"
                      }
                      onChange={(value) => {
                        const ed = editor.current;
                        if (ed?.isActive("table"))
                          ed.chain()
                            .focus()
                            .updateAttributes("table", { objectAlign: value })
                            .run();
                        else ed?.chain().focus().setTextAlign(value).run();
                      }}
                    />
                  )}
                  {editor.current?.isActive("table") && (
                    <label>
                      표 너비 (%)
                      <input
                        type="number"
                        aria-label="표 너비 (%)"
                        min="10"
                        max="100"
                        value={
                          editor.current.getAttributes("table").objectWidth ||
                          100
                        }
                        onChange={(e) => {
                          const value = Number(e.target.value);
                          if (value >= 10 && value <= 100)
                            editor.current
                              ?.chain()
                              .focus()
                              .updateAttributes("table", { objectWidth: value })
                              .run();
                        }}
                      />
                    </label>
                  )}
                  {editor.current?.isActive("image") ? (
                    <>
                      {["width", "height"].map((key) => (
                        <label key={key}>
                          {key === "width" ? "이미지 너비" : "이미지 높이"}
                          <input
                            type="number"
                            min="1"
                            max="2000"
                            aria-label={
                              key === "width" ? "이미지 너비" : "이미지 높이"
                            }
                            value={
                              editor.current?.getAttributes("image")[key] || ""
                            }
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              if (value > 0 && value <= 2000) {
                                const ed = editor.current;
                                if (ed)
                                  ed.chain()
                                    .updateAttributes("image", { [key]: value })
                                    .setNodeSelection(ed.state.selection.from)
                                    .run();
                                setActive((v) => v + 1);
                              }
                            }}
                          />
                        </label>
                      ))}
                      <button
                        className="keep-label danger"
                        onClick={() =>
                          editor.current
                            ?.chain()
                            .focus()
                            .deleteSelection()
                            .run()
                        }
                      >
                        이미지 삭제
                      </button>
                    </>
                  ) : (
                    <>
                      <select
                        className="keep-label"
                        aria-label="문단 스타일"
                        disabled={!ready || format === "text"}
                        value={
                          editor.current?.isActive("heading")
                            ? "heading" +
                              editor.current.getAttributes("heading").level
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
                              .setHeading({
                                level: Number(e.target.value.slice(-1)) as any,
                              })
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
                          <ParagraphControls editor={editor.current} />
                          <hr />
                          <h3>글자</h3>
                          <select
                            aria-label="글꼴"
                            className="keep-label"
                            disabled={!ready}
                            value={
                              editor.current?.getAttributes("textStyle")
                                .fontFamily || "Arial"
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
                                editor.current?.getAttributes("textStyle")
                                  .fontFamily || "Arial",
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
                          <select
                            aria-label="글자 크기"
                            className="keep-label"
                            value={
                              editor.current?.getAttributes("textStyle")
                                .fontSize || "11pt"
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
                          {command("bold", (ed) =>
                            ed.chain().focus().toggleBold().run(),
                          )}
                          {command("italic", (ed) =>
                            ed.chain().focus().toggleItalic().run(),
                          )}
                          {command("underline", (ed) =>
                            ed.chain().focus().toggleUnderline().run(),
                          )}
                          {command("strike", (ed) =>
                            ed.chain().focus().toggleStrike().run(),
                          )}
                          <ColorControl
                            label="글자색"
                            value={
                              editor.current?.getAttributes("textStyle")
                                .color || "#242424"
                            }
                            onChange={(color) =>
                              editor.current
                                ?.chain()
                                .focus()
                                .setColor(color)
                                .run()
                            }
                          />
                          <ColorControl
                            label="하이라이트"
                            value={
                              editor.current?.getAttributes("highlight")
                                .color || "#fff29a"
                            }
                            onChange={(color) =>
                              editor.current
                                ?.chain()
                                .focus()
                                .setMark("highlight", { color })
                                .run()
                            }
                            onClear={() => {
                              editor.current
                                ?.chain()
                                .focus()
                                .unsetMark("highlight")
                                .run();
                            }}
                          />
                          {command("아래 첨자", (ed) =>
                            ed.chain().focus().toggleMark("subscript").run(),
                          )}
                          {command("위 첨자", (ed) =>
                            ed.chain().focus().toggleMark("superscript").run(),
                          )}
                          <hr />
                          <ListControls editor={editor.current} />
                        </>
                      )}
                      {editor.current?.isActive("table") && (
                        <>
                          <hr />
                          <h3>표 구성</h3>
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
                </section>
              )}
              {panel === "page" && (
                <section className="document-page-controls">
                  <h3>레이아웃</h3>
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
                  <hr />
                  <section className="editor-control-section">
                    <h3>내보내기</h3>
                    <section className="document-export">
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
                    </section>
                  </section>
                </section>
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="document-footer">
        <span aria-live="polite">
          페이지 {pageInfo.current}/{pageInfo.total}{" "}
          <span className="footer-divider">|</span> 단어{" "}
          {words.toLocaleString()}개
        </span>
        <div className="document-zoom-controls">
          <button
            className="keep-label"
            aria-label="축소"
            onClick={() =>
              setZoom(
                String(
                  Math.max(
                    25,
                    Math.round(
                      (zoom === "fit" ? fitScale * 100 : Number(zoom)) - 10,
                    ),
                  ),
                ),
              )
            }
          >
            −
          </button>
          <input
            type="range"
            min="25"
            max="200"
            step="5"
            aria-label="문서 확대·축소"
            value={zoom === "fit" ? fitScale * 100 : Number(zoom)}
            onChange={(e) => setZoom(e.target.value)}
          />
          <button
            className="keep-label"
            aria-label="확대"
            onClick={() =>
              setZoom(
                String(
                  Math.min(
                    200,
                    Math.round(
                      (zoom === "fit" ? fitScale * 100 : Number(zoom)) + 10,
                    ),
                  ),
                ),
              )
            }
          >
            +
          </button>
          <select
            className="keep-label"
            aria-label="문서 배율"
            value={zoom}
            onChange={(e) => setZoom(e.target.value)}
          >
            <option value="fit">화면 맞춤</option>
            {Array.from(
              new Set([
                25,
                50,
                75,
                100,
                125,
                150,
                200,
                ...(zoom === "fit" ? [] : [Number(zoom)]),
              ]),
            )
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
          </select>
        </div>
      </footer>
      {updateAvailable && (
        <div className="document-update-toast" role="status">
          <button
            className="keep-label"
            onClick={() => {
              (window as any).appUpdates?.apply();
            }}
          >
            <Icon name="refresh" />
            <span>새 버전이 있습니다. 새로고침</span>
          </button>
          <button
            className="keep-label"
            aria-label="업데이트 알림 닫기"
            onClick={() => {
              dismissedUpdate.current =
                (window as any).appUpdates?.version || "pending";
              setUpdateAvailable(false);
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </main>
  );
}
export function mountDocumentEditor(file: any, host: HTMLElement) {
  createRoot(host).render(<DocumentEditor file={file} />);
}
