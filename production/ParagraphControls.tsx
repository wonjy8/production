import React from "react";
import type { Editor } from "@tiptap/core";
import { Icon } from "./Icon";
export function listDepth(editor: Editor | null) {
  let depth = 0;
  editor?.state.selection.$from.path.forEach((n: any) => {
    if (n?.type?.name === "listItem") depth++;
  });
  return depth;
}
export function indentList(editor: Editor, back = false) {
  if (back) return editor.chain().focus().liftListItem("listItem").run();
  if (listDepth(editor) >= 5) return false;
  return editor.chain().focus().sinkListItem("listItem").run();
}
export function Alignment({
  value,
  onChange,
  object = false,
}: {
  value: string;
  onChange: (value: string) => void;
  object?: boolean;
}) {
  return (
    <div
      className="editor-alignment"
      role="group"
      aria-label={object ? "개체 맞춤" : "문단 정렬"}
    >
      {["left", "center", "right", ...(object ? [] : ["justify"])].map(
        (id, i) => (
          <button
            key={id}
            className="keep-label"
            aria-label={
              ["왼쪽 정렬", "가운데 정렬", "오른쪽 정렬", "양쪽 정렬"][i]
            }
            title={["왼쪽 정렬", "가운데 정렬", "오른쪽 정렬", "양쪽 정렬"][i]}
            aria-pressed={value === id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(id)}
          >
            <Icon name={"align" + id} />
          </button>
        ),
      )}
    </div>
  );
}
export function ParagraphControls({ editor }: { editor: Editor | null }) {
  const attrs =
    editor?.getAttributes(
      editor.isActive("heading") ? "heading" : "paragraph",
    ) || {};
  const set = (values: any) => {
    const chain = editor?.chain().focus();
    chain
      ?.updateAttributes("paragraph", values)
      .updateAttributes("heading", values)
      .run();
  };
  const number = (
    label: string,
    key: string,
    unit: string,
    step: number,
    fallback = 0,
  ) => (
    <label>
      {label} <small>{unit}</small>
      <input
        type="number"
        aria-label={label}
        min={key === "lineHeight" ? ".5" : "0"}
        max={key === "lineHeight" ? 5 : key.startsWith("space") ? 300 : 20}
        step={step}
        value={attrs[key] ?? fallback}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (
            value >= (key === "lineHeight" ? 0.5 : 0) &&
            value <=
              (key === "lineHeight" ? 5 : key.startsWith("space") ? 300 : 20)
          )
            set({ [key]: value });
        }}
      />
    </label>
  );
  return (
    <section className="paragraph-controls">
      <h3>문단</h3>
      <Alignment
        value={attrs.textAlign || "left"}
        onChange={(textAlign) =>
          editor?.chain().focus().setTextAlign(textAlign).run()
        }
      />
      <div className="paragraph-number-grid">
        {number("줄 간격", "lineHeight", "배", 0.05, 1.75)}
        {number("문단 앞 여백", "spaceBefore", "pt", 1)}
        {number("문단 뒤 여백", "spaceAfter", "pt", 1, 9)}
      </div>
      <div className="editor-indent-actions">
        {[
          [false, "들여쓰기", "indent"],
          [true, "내어쓰기", "outdent"],
        ].map(([back, label, icon]) => (
          <button
            key={String(label)}
            className="keep-label"
            aria-label={String(label)}
            title={String(label)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (!editor) return;
              if (listDepth(editor)) indentList(editor, !!back);
              else
                set({
                  indentLeft: Math.max(
                    0,
                    Math.min(20, (attrs.indentLeft || 0) + (back ? -0.5 : 0.5)),
                  ),
                });
            }}
          >
            <Icon name={String(icon)} />
          </button>
        ))}
      </div>
      <div className="paragraph-number-grid">
        {number("왼쪽 들여쓰기", "indentLeft", "cm", 0.1)}
        {number("오른쪽 들여쓰기", "indentRight", "cm", 0.1)}
        <label>
          첫 줄
          <select
            aria-label="첫 줄 들여쓰기 방식"
            value={
              attrs.firstLine < 0
                ? "hanging"
                : attrs.firstLine > 0
                  ? "first"
                  : "none"
            }
            onChange={(e) =>
              set({
                firstLine:
                  e.target.value === "none"
                    ? 0
                    : e.target.value === "hanging"
                      ? -0.5
                      : 0.5,
              })
            }
          >
            <option value="none">없음</option>
            <option value="first">첫 줄 들여쓰기</option>
            <option value="hanging">내어쓰기</option>
          </select>
        </label>
        <label>
          첫 줄 깊이 <small>cm</small>
          <input
            type="number"
            aria-label="첫 줄 깊이"
            min="0"
            max="10"
            step=".1"
            value={Math.abs(attrs.firstLine || 0)}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value >= 0 && value <= 10)
                set({ firstLine: (attrs.firstLine < 0 ? -1 : 1) * value });
            }}
          />
        </label>
      </div>
    </section>
  );
}
export function ListControls({ editor }: { editor: Editor | null }) {
  const styles = [
      ["disc", "원형"],
      ["circle", "빈 원"],
      ["square", "사각형"],
    ],
    numbers = [
      ["decimal", "숫자"],
      ["lower-alpha", "알파벳"],
      ["upper-roman", "로마 숫자"],
    ];
  return (
    <section className="editor-list-controls">
      <h3>목록</h3>
      <div>
        {[
          [false, "글머리 기호", "list", styles],
          [true, "번호 목록", "listOrdered", numbers],
        ].map(([ordered, label, icon, choices]: any) => {
          const type = ordered ? "orderedList" : "bulletList";
          return (
            <div key={type} className="editor-list-split">
              <button
                className="keep-label"
                aria-label={label}
                title={label}
                aria-pressed={editor?.isActive(type) || false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (ordered)
                    editor?.chain().focus().toggleOrderedList().run();
                  else editor?.chain().focus().toggleBulletList().run();
                }}
              >
                <Icon name={icon} />
              </button>
              <details className="document-menu">
                <summary aria-label={label + " 종류"} title={label + " 종류"}>
                  <Icon name="down" />
                </summary>
                <div role="menu">
                  {choices.map(([style, name]: string[]) => (
                    <button
                      key={style}
                      className="keep-label"
                      role="menuitemradio"
                      aria-checked={
                        editor?.isActive(type) &&
                        editor.getAttributes(type).listStyle === style
                      }
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        if (!editor) return;
                        if (!editor.isActive(type))
                          (ordered
                            ? editor.chain().focus().toggleOrderedList()
                            : editor.chain().focus().toggleBulletList()
                          ).run();
                        editor
                          .chain()
                          .focus()
                          .updateAttributes(type, {
                            listStyle: style,
                            docxNumId: null,
                          })
                          .run();
                        e.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
      </div>
      <small>
        Tab으로 하위 단계 · Shift+Tab으로 상위 단계
        <br />
        최대 5단계
        {listDepth(editor) > 0 ? " · 현재 " + listDepth(editor) + "단계" : ""}
      </small>
    </section>
  );
}
