import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { FormattingTools, FormatMenu, editLink } from "./EditorFormatting";
import { TablePicker } from "./EditorControls";
import { Icon } from "./Icon";

type Props = {
  editor: Editor | null;
  rich: boolean;
  onProperties: () => void;
  onLibrary: () => void;
  onDeviceImage: () => void;
  onFile: () => void;
  onShape: (kind: string, label: string) => void;
};
export function EditorSelectionUI({
  editor,
  rich,
  onProperties,
  onLibrary,
  onDeviceImage,
  onFile,
  onShape,
}: Props) {
  const [ui, setUI] = useState({
      mobile: false,
      focused: false,
      selected: false,
      left: 12,
      top: 12,
      above: true,
    }),
    [context, setContext] = useState<{ x: number; y: number } | null>(null),
    [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null),
    bubble = useRef<HTMLDivElement>(null),
    menu = useRef<HTMLDivElement>(null),
    menuSelection = useRef<any>({ from: 0, to: 0 }),
    dragging = useRef(false),
    refreshUI = useRef(() => {});
  useEffect(() => {
    if (!editor) return;
    let raf = 0;
    const media = window.matchMedia("(max-width: 720px)"),
      viewport = window.visualViewport;
    const update = () => {
      raf = 0;
      if (editor.isDestroyed) return;
      const mobile = media.matches,
        selection = editor.state.selection,
        active = document.activeElement as HTMLElement | null;
      const own = !!active?.closest(".editor-selection-ui"),
        focused = editor.isFocused || own,
        selected =
          !editor.view.composing &&
          !selection.empty &&
          !!selection.$from.parent.isTextblock &&
          !editor.isActive("image");
      let left = 12,
        top = 12,
        above = true;
      const safeTop = viewport?.offsetTop || 0,
        safeBottom = safeTop + (viewport?.height || innerHeight);
      if (selected) {
        try {
          const start = editor.view.coordsAtPos(selection.from),
            end = editor.view.coordsAtPos(selection.to),
            width = bubble.current?.offsetWidth || 410,
            height = bubble.current?.offsetHeight || 44;
          left = Math.max(
            8,
            Math.min(
              (start.left + end.right) / 2 - width / 2,
              innerWidth - width - 8,
            ),
          );
          top = start.top - height - 10;
          above = top >= safeTop + 8;
          if (!above) top = end.bottom + 10;
          top = Math.max(safeTop + 8, Math.min(top, safeBottom - height - 8));
        } catch {}
      }
      const inset = Math.max(
        0,
        innerHeight -
          (viewport?.height || innerHeight) -
          (viewport?.offsetTop || 0),
      );
      const main = editor.view.dom.closest<HTMLElement>(".document-editor");
      main?.style.setProperty("--document-keyboard-inset", inset + "px");
      main?.style.setProperty(
        "--document-visible-height",
        (viewport?.height || innerHeight) + "px",
      );
      setUI((old) => {
        const next = {
          mobile,
          focused,
          selected: selected && focused && !dragging.current,
          left,
          top,
          above,
        };
        return Object.keys(next).every(
          (key) => (old as any)[key] === (next as any)[key],
        )
          ? old
          : next;
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    refreshUI.current = schedule;
    const down = (e: PointerEvent) => {
      if (editor.view.dom.contains(e.target as Node)) {
        dragging.current = true;
        setContext(null);
      } else if (!root.current?.contains(e.target as Node)) setContext(null);
      schedule();
    };
    const up = () => {
      dragging.current = false;
      schedule();
    };
    const contextMenu = (event: MouseEvent) => {
      if (media.matches) return;
      event.preventDefault();
      event.stopPropagation();
      menuSelection.current = {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
        bookmark: editor.state.selection.getBookmark(),
        doc: editor.state.doc,
      };
      setContext({
        x: Math.max(8, Math.min(event.clientX, innerWidth - 188)),
        y: Math.max(8, Math.min(event.clientY, innerHeight - 150)),
      });
      setError("");
    };
    editor.on("selectionUpdate", schedule);
    editor.on("transaction", schedule);
    editor.on("focus", schedule);
    editor.on("blur", schedule);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    media.addEventListener("change", schedule);
    editor.view.dom.addEventListener("contextmenu", contextMenu);
    const observer = new ResizeObserver(schedule);
    observer.observe(editor.view.dom);
    if (bubble.current) observer.observe(bubble.current);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      editor.off("selectionUpdate", schedule);
      editor.off("transaction", schedule);
      editor.off("focus", schedule);
      editor.off("blur", schedule);
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      media.removeEventListener("change", schedule);
      editor.view.dom.removeEventListener("contextmenu", contextMenu);
    };
  }, [editor]);
  useLayoutEffect(() => {
    const node = bubble.current;
    if (!node) return;
    refreshUI.current();
    const observer = new ResizeObserver(() => refreshUI.current());
    observer.observe(node);
    return () => observer.disconnect();
  }, [ui.selected, ui.mobile, context]);
  useEffect(() => {
    if (context)
      menu.current
        ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
  }, [context]);
  if (!editor) return null;
  async function clipboard(action: "cut" | "copy" | "paste") {
    const beforeDoc = menuSelection.current.doc || editor!.state.doc,
      bookmark =
        menuSelection.current.bookmark || editor!.state.selection.getBookmark();
    const restore = () => {
      if (editor!.isDestroyed || editor!.state.doc !== beforeDoc)
        throw Error("changed");
      editor!.view.dispatch(
        editor!.state.tr.setSelection(bookmark.resolve(editor!.state.doc)),
      );
      editor!.view.focus();
    };
    try {
      restore();
      if (action === "paste") {
        if (navigator.clipboard?.read) {
          const items = await navigator.clipboard.read();
          let inserted = false;
          for (const item of items) {
            if (item.types.includes("text/html")) {
              const html = await (await item.getType("text/html")).text();
              restore();
              editor!.view.pasteHTML(html);
              inserted = true;
              break;
            }
            if (item.types.includes("text/plain")) {
              const text = await (await item.getType("text/plain")).text();
              restore();
              editor!.view.pasteText(text);
              inserted = true;
              break;
            }
          }
          if (!inserted) throw Error("empty");
        } else if (navigator.clipboard?.readText) {
          const text = await navigator.clipboard.readText();
          restore();
          editor!.view.pasteText(text);
        } else throw Error("unsupported");
      } else {
        if (editor!.state.selection.empty) return;
        const content = editor!.view.serializeForClipboard(
          editor!.state.selection.content(),
        );
        let copied = false;
        try {
          if (
            navigator.clipboard?.write &&
            typeof ClipboardItem !== "undefined"
          ) {
            await navigator.clipboard.write([
              new ClipboardItem({
                "text/plain": new Blob([content.text], { type: "text/plain" }),
                "text/html": new Blob([content.dom.innerHTML], {
                  type: "text/html",
                }),
              }),
            ]);
            copied = true;
          } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(content.text);
            copied = true;
          }
        } catch {}
        if (!copied) {
          restore();
          copied = document.execCommand("copy");
        }
        if (!copied) throw Error("denied");
        if (action === "cut") {
          restore();
          editor!.chain().focus().deleteSelection().run();
        }
      }
      setContext(null);
    } catch (error: any) {
      setError(
        error.message === "changed"
          ? "문서가 변경되어 클립보드 작업을 중단했습니다."
          : action === "paste"
            ? "붙여넣기를 허용하지 않았습니다. Ctrl/⌘+V를 사용하세요."
            : "복사하지 못했습니다. Ctrl/⌘+C 또는 X를 사용하세요.",
      );
      setContext(null);
    }
  }
  function closeInsertion() {
    root.current
      ?.querySelectorAll<HTMLDetailsElement>("details[open]")
      .forEach((node) => (node.open = false));
  }
  function imageChoices() {
    return (
      <FormatMenu label="이미지 추가">
        {[
          <Icon name="reference" />,
          <div
            className="editor-format-popup"
            role="menu"
            aria-label="이미지 추가 방법"
          >
            <button
              className="keep-label"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                onLibrary();
                closeInsertion();
              }}
            >
              자료에서 이미지 추가
            </button>
            <button
              className="keep-label"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                onDeviceImage();
                closeInsertion();
              }}
            >
              장치에서 추가
            </button>
          </div>,
        ]}
      </FormatMenu>
    );
  }
  return (
    <div
      className="editor-selection-ui"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setContext(null);
          root.current
            ?.querySelectorAll<HTMLDetailsElement>("details[open]")
            .forEach((d) => (d.open = false));
          editor.view.focus();
        }
      }}
    >
      {rich && !ui.mobile && ui.selected && !context && (
        <div
          ref={bubble}
          className={
            "editor-selection-menu" + (!ui.above ? " opens-below" : "")
          }
          style={{ left: ui.left, top: ui.top }}
          role="toolbar"
          aria-label="선택 텍스트 서식"
        >
          <FormattingTools editor={editor} />
        </div>
      )}
      {ui.mobile && (ui.focused || ui.selected) && (
        <div
          className="editor-mobile-dock"
          role="toolbar"
          aria-label={rich && ui.selected ? "선택 텍스트 서식" : "입력 도구"}
        >
          {rich && ui.selected ? (
            <FormattingTools editor={editor} />
          ) : (
            <>
              {rich && (
                <FormatMenu label="삽입">
                  {[
                    <Icon name="plus" />,
                    <div
                      className="editor-format-popup mobile-insert-popup"
                      role="group"
                      aria-label="문서에 삽입"
                    >
                      {rich && (
                        <>
                          {imageChoices()}
                          <button
                            className="keep-label"
                            aria-label="링크"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              closeInsertion();
                              editLink(editor);
                            }}
                          >
                            <Icon name="link" />
                          </button>
                          <TablePicker
                            onInsert={(rows, cols) => {
                              editor
                                .chain()
                                .focus()
                                .insertTable({
                                  rows,
                                  cols,
                                  withHeaderRow: false,
                                })
                                .run();
                              closeInsertion();
                            }}
                          />
                          <button
                            className="keep-label"
                            aria-label="파일 추가"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              onFile();
                              closeInsertion();
                            }}
                          >
                            <Icon name="attachment" />
                            파일
                          </button>
                          <FormatMenu label="도형 추가">
                            {[
                              <Icon name="shapes" />,
                              <div className="editor-format-popup">
                                {[
                                  ["rectangle", "사각형"],
                                  ["ellipse", "타원"],
                                  ["triangle", "삼각형"],
                                  ["arrow", "화살표"],
                                ].map(([id, label]) => (
                                  <button
                                    key={id}
                                    className="keep-label"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      onShape(id, label);
                                      closeInsertion();
                                    }}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>,
                            ]}
                          </FormatMenu>
                        </>
                      )}
                    </div>,
                  ]}
                </FormatMenu>
              )}
              {rich && (
                <>
                  <button
                    className="keep-label"
                    aria-label="서식 패널"
                    title="서식 패널"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={onProperties}
                  >
                    Aa
                  </button>
                  {imageChoices()}
                </>
              )}
              <button
                className="keep-label"
                aria-label="실행 취소"
                title="실행 취소"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().undo().run()}
              >
                <Icon name="undo" />
              </button>
              <button
                className="keep-label"
                aria-label="다시 실행"
                title="다시 실행"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().redo().run()}
              >
                <Icon name="redo" />
              </button>
            </>
          )}
          <button
            className="keep-label mobile-keyboard-close"
            aria-label="키보드 닫기"
            title="키보드 닫기"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.view.dom.blur()}
          >
            <Icon name="keyboard" />
          </button>
        </div>
      )}
      {context && (
        <div
          ref={menu}
          className="editor-clipboard-menu"
          role="menu"
          aria-label="클립보드"
          style={{ left: context.x, top: context.y }}
          onKeyDown={(e) => {
            const buttons = [
              ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              buttons[
                (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length
              ]?.focus();
            }
          }}
        >
          {[
            ["cut", "잘라내기"],
            ["copy", "복사"],
            ["paste", "붙여넣기"],
          ].map(([id, label]) => (
            <button
              type="button"
              className="keep-label"
              role="menuitem"
              key={id}
              disabled={
                id !== "paste" &&
                menuSelection.current.from === menuSelection.current.to
              }
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => clipboard(id as any)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div className="editor-clipboard-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
