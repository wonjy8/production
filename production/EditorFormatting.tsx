import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Icon } from "./Icon";
import { editorColors } from "./EditorControls";

type ColorChoice = { kind: "text" | "background"; name: string; color: string };
const recents = new WeakMap<
  Editor,
  { choices: ColorChoice[]; listeners: Set<() => void> }
>();
function colorHistory(editor: Editor) {
  let value = recents.get(editor);
  if (!value) {
    value = { choices: [], listeners: new Set() };
    recents.set(editor, value);
  }
  return value;
}
const backgrounds = [
  "#fce8e8",
  "#fff0df",
  "#fff8d7",
  "#e5f2e9",
  "#e5f1ff",
  "#e9e8f6",
  "#f1e7f8",
  "#f2eae4",
  "#e8e8e8",
  "#ffffff",
];
function normalized(color: string) {
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color || "");
  return rgb
    ? "#" +
        rgb
          .slice(1, 4)
          .map((n) => Number(n).toString(16).padStart(2, "0"))
          .join("")
    : (color || "").toLowerCase();
}
export function FormatMenu({
  label,
  children,
  className = "",
}: {
  label: string;
  children: any;
  className?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: Event) => {
      if (ref.current?.open && !e.composedPath().includes(ref.current))
        ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, []);
  return (
    <details
      ref={ref}
      onToggle={(e) => {
        if (e.target !== e.currentTarget || !ref.current?.open) return;
        const popup = ref.current.querySelector<HTMLElement>(
          ":scope > .editor-format-popup",
        );
        if (!popup) return;
        const rect = ref.current.getBoundingClientRect(),
          vv = window.visualViewport,
          top = vv?.offsetTop || 0,
          bottom = top + (vv?.height || innerHeight),
          height = popup.scrollHeight,
          below = bottom - rect.bottom - 12,
          above = rect.top - top - 12;
        const flip = height > below && above > below;
        popup.style.top = flip ? "auto" : "calc(100% + 8px)";
        popup.style.bottom = flip ? "calc(100% + 8px)" : "auto";
        popup.style.maxHeight = Math.max(90, flip ? above : below) + "px";
        popup.style.left =
          Math.min(0, innerWidth - 8 - rect.left - popup.offsetWidth) + "px";
        popup.style.right = "auto";
      }}
      className={"editor-format-menu " + className}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (ref.current) ref.current.open = false;
          ref.current?.querySelector<HTMLElement>("summary")?.focus();
        }
      }}
    >
      <summary
        aria-label={label}
        title={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const root = ref.current?.closest(
            ".editor-format-tools,.editor-mobile-dock",
          );
          root
            ?.querySelectorAll<HTMLDetailsElement>("details[open]")
            .forEach((node) => {
              if (node !== ref.current && !node.contains(ref.current))
                node.open = false;
            });
        }}
      >
        {children[0]}
      </summary>
      {children[1]}
    </details>
  );
}
function closeMenu(e: any) {
  e.currentTarget.closest("details")?.removeAttribute("open");
}
export function CombinedColors({ editor }: { editor: Editor }) {
  const [, refresh] = useState(0),
    history = colorHistory(editor);
  useEffect(() => {
    const update = () => refresh((v) => v + 1);
    history.listeners.add(update);
    return () => {
      history.listeners.delete(update);
    };
  }, [history]);
  const text = normalized(editor.getAttributes("textStyle").color),
    background = normalized(editor.getAttributes("highlight").color);
  function apply(choice: ColorChoice) {
    history.choices = [
      choice,
      ...history.choices.filter(
        (c) => c.kind !== choice.kind || c.color !== choice.color,
      ),
    ].slice(0, 5);
    history.listeners.forEach((fn) => fn());
    if (choice.kind === "text")
      editor.chain().focus().setColor(choice.color).run();
    else
      editor
        .chain()
        .focus()
        .setMark("highlight", { color: choice.color })
        .run();
  }
  function swatch(choice: ColorChoice, recent = false) {
    return (
      <button
        type="button"
        key={choice.kind + choice.color}
        className={
          "keep-label format-color-swatch " +
          (choice.kind === "text" ? "text-swatch" : "background-swatch")
        }
        title={(choice.kind === "text" ? "글자색 " : "배경색 ") + choice.name}
        aria-label={
          (recent ? "최근 " : "") +
          (choice.kind === "text" ? "글자색 " : "배경색 ") +
          choice.name
        }
        aria-pressed={
          (choice.kind === "text" ? text : background) === choice.color
        }
        style={
          {
            "--format-swatch-color":
              choice.kind === "text" ? choice.color : "#333",
            "--format-swatch-background":
              choice.kind === "text"
                ? choice.color === "#ffffff"
                  ? "#666"
                  : "#fff"
                : choice.color,
            "--format-swatch-border":
              choice.kind === "text" ? choice.color + "55" : "#ddd",
          } as any
        }
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          apply(choice);
          closeMenu(e);
        }}
      >
        {choice.kind === "text" ? (
          "A"
        ) : (
          <span className="color-background-chip" />
        )}
      </button>
    );
  }
  return (
    <FormatMenu label="색상" className="editor-combined-colors">
      {[
        <>
          <span
            className="format-color-symbol"
            style={{ borderBottomColor: text || "#242424" }}
          >
            A
          </span>
          <Icon name="down" />
        </>,
        <div
          className="editor-format-popup format-color-popup"
          role="group"
          aria-label="글자색과 배경색"
        >
          <h4>최근 사용</h4>
          <div className="format-color-grid">
            {history.choices.map((c) => swatch(c, true))}
          </div>
          {!history.choices.length && (
            <p className="format-color-empty">
              사용한 색상이 여기에 표시됩니다.
            </p>
          )}
          <h4>텍스트 색상</h4>
          <div className="format-color-grid">
            {editorColors.map(([name, color]) =>
              swatch({ kind: "text", name, color }),
            )}
          </div>
          <button
            type="button"
            className="keep-label format-color-reset"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              editor.chain().focus().unsetColor().run();
              closeMenu(e);
            }}
          >
            기본 글자색
          </button>
          <h4>배경 색상</h4>
          <div className="format-color-grid">
            {editorColors.map(([name], i) =>
              swatch({ kind: "background", name, color: backgrounds[i] }),
            )}
          </div>
          <button
            type="button"
            className="keep-label format-color-reset"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              editor.chain().focus().unsetMark("highlight").run();
              closeMenu(e);
            }}
          >
            배경 없음
          </button>
        </div>,
      ]}
    </FormatMenu>
  );
}
const paragraphKinds = [
  ["paragraph", "본문", "text"],
  ...[1, 2, 3, 4].map((n) => ["heading" + n, "제목 " + n, "H" + n]),
  ["bulletList", "글머리 기호 목록", "list"],
  ["orderedList", "번호 매기기 목록", "listOrdered"],
  ["blockquote", "인용", "quote"],
];
function paragraphKind(ed: Editor) {
  if (ed.isActive("bulletList")) return "bulletList";
  if (ed.isActive("orderedList")) return "orderedList";
  if (ed.isActive("blockquote")) return "blockquote";
  return ed.isActive("heading")
    ? "heading" + ed.getAttributes("heading").level
    : "paragraph";
}
export function ParagraphMenu({ editor }: { editor: Editor }) {
  const kind = paragraphKind(editor),
    current = paragraphKinds.find(([id]) => id === kind) || paragraphKinds[0];
  function apply(id: string) {
    if (id === "bulletList" || id === "orderedList") {
      if (editor.isActive("blockquote"))
        editor.chain().focus().unsetBlockquote().run();
      editor
        .chain()
        .focus()
        [id === "bulletList" ? "toggleBulletList" : "toggleOrderedList"]()
        .run();
      return;
    }
    if (editor.isActive("bulletList"))
      editor.chain().focus().toggleBulletList().run();
    if (editor.isActive("orderedList"))
      editor.chain().focus().toggleOrderedList().run();
    if (id === "blockquote") {
      editor.chain().focus().setParagraph().toggleBlockquote().run();
      return;
    }
    if (editor.isActive("blockquote"))
      editor.chain().focus().unsetBlockquote().run();
    if (id === "paragraph") editor.chain().focus().setParagraph().run();
    else
      editor
        .chain()
        .focus()
        .setHeading({ level: Number(id.slice(-1)) as any })
        .run();
  }
  return (
    <FormatMenu label="문단 종류" className="editor-paragraph-menu">
      {[
        <>
          <span>{current[1]}</span>
          <Icon name="down" />
        </>,
        <div
          role="menu"
          aria-label="문단 종류 선택"
          className="editor-format-popup"
        >
          {paragraphKinds.map(([id, label, icon]) => (
            <button
              type="button"
              className="keep-label"
              key={id}
              role="menuitemradio"
              aria-label={label}
              aria-checked={kind === id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                apply(id);
                closeMenu(e);
              }}
            >
              {icon.startsWith("H") ? (
                <span className="paragraph-heading-icon">{icon}</span>
              ) : (
                <Icon name={icon} />
              )}
              <span>{label}</span>
              {kind === id && <Icon name="check" />}
            </button>
          ))}
        </div>,
      ]}
    </FormatMenu>
  );
}
export function editLink(editor: Editor) {
  const value = window.prompt(
    "HTTP 또는 HTTPS 링크",
    editor.getAttributes("link").href || "https://",
  );
  if (value === null) return;
  if (!value) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) throw Error();
    editor.chain().focus().setLink({ href: url.href }).run();
  } catch {
    window.alert("HTTP 또는 HTTPS 주소를 입력하세요.");
  }
}
export function FormattingTools({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  function mark(label: string, icon: string, name: string, run: () => void) {
    return (
      <button
        type="button"
        className="keep-label format-action"
        title={label}
        aria-label={label}
        aria-pressed={editor!.isActive(name)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={run}
      >
        <Icon name={icon} />
      </button>
    );
  }
  return (
    <div className="editor-format-tools" role="group" aria-label="텍스트 서식">
      <ParagraphMenu editor={editor} />
      <CombinedColors editor={editor} />
      {mark("굵게", "bold", "bold", () => {
        editor.chain().focus().toggleBold().run();
      })}
      {mark("기울임", "italic", "italic", () => {
        editor.chain().focus().toggleItalic().run();
      })}
      {mark("밑줄", "underline", "underline", () => {
        editor.chain().focus().toggleUnderline().run();
      })}
      {mark("링크", "link", "link", () => editLink(editor))}
      <FormatMenu label="서식 더보기">
        {[
          <Icon name="more" />,
          <div
            className="editor-format-popup format-more-popup"
            role="group"
            aria-label="추가 텍스트 서식"
          >
            {[
              ["취소선", "strike"],
              ["위 첨자", "superscript"],
              ["아래 첨자", "subscript"],
            ].map(([label, name]) => (
              <button
                type="button"
                className="keep-label"
                key={name}
                aria-label={label}
                aria-pressed={editor.isActive(name)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleMark(name).run()}
              >
                <Icon name={name} />
                <span>{label}</span>
              </button>
            ))}
          </div>,
        ]}
      </FormatMenu>
    </div>
  );
}
