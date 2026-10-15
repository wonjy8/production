import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { documentLayout, pageGap } from "./document-layout";
const key = new PluginKey("documentPages");

const px = 96 / 25.4;
/** Layout-only decorations never enter the document JSON or DOCX package. */
export const documentPagination = Extension.create({
  name: "documentPagination",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const value = tr.getMeta(key);
            return value !== undefined
              ? value
              : tr.docChanged
                ? DecorationSet.empty
                : old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
        view(view) {
          let frame = 0,
            closed = false,
            composing = false;
          const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
          };
          const clear = () => {
            if (closed || composing) return;
            view.dispatch(
              view.state.tr
                .setMeta(key, DecorationSet.empty)
                .setMeta("addToHistory", false),
            );
            schedule();
          };
          function measure() {
            if (closed || view.composing) return;
            const sheet = view.dom.parentElement!,
              layout = documentLayout(view.state.doc.attrs.docxLayout);
            const height = layout.height * px,
              top = layout.top * px,
              bottom = layout.bottom * px;
            const bounds = view.dom.getBoundingClientRect();
            const zoom =
              sheet.getBoundingClientRect().width / sheet.offsetWidth || 1;
            const units: {
              pos: number;
              top: number;
              bottom: number;
              extra?: number[];
            }[] = [];
            const unit = (el: Element, pos: number, extra?: number[]) => {
              const r = el.getBoundingClientRect();
              units.push({
                pos,
                top: (r.top - bounds.top) / zoom + top,
                bottom: (r.bottom - bounds.top) / zoom + top,
                extra,
              });
            };
            view.state.doc.forEach((node, offset) => {
              const el = view.nodeDOM(offset) as HTMLElement;
              if (!el?.getBoundingClientRect) return;
              if (node.type.name === "table") {
                node.forEach((row, rowOffset) => {
                  const positions: number[] = [];
                  row.forEach((cell, cellOffset) =>
                    positions.push(offset + 1 + rowOffset + 1 + cellOffset + 2),
                  );
                  const rowEl = view.nodeDOM(offset + 1 + rowOffset) as Element;
                  if (rowEl) unit(rowEl, positions[0], positions.slice(1));
                });
              } else if (
                el.getBoundingClientRect().height / zoom >
                height - top - bottom
              ) {
                const walker = document.createTreeWalker(
                  el,
                  NodeFilter.SHOW_TEXT,
                );
                let text: Node | null;
                const lines = new Map<
                  number,
                  { pos: number; top: number; bottom: number }
                >();
                while ((text = walker.nextNode()))
                  for (let i = 0; i < (text.textContent?.length || 0); i++) {
                    const range = document.createRange();
                    range.setStart(text, i);
                    range.setEnd(text, i + 1);
                    const r = range.getBoundingClientRect();
                    if (!r.height) continue;
                    const y =
                      Math.round(((r.top - bounds.top) / zoom) * 10) / 10;
                    if (!lines.has(y))
                      lines.set(y, {
                        pos: view.posAtDOM(text, i),
                        top: y + top,
                        bottom: (r.bottom - bounds.top) / zoom + top,
                      });
                  }
                units.push(...Array.from(lines.values()));
              } else unit(el, offset);
            });
            const decorations: Decoration[] = [];
            let shift = 0;
            for (const u of units.sort((a, b) => a.top - b.top)) {
              const y = u.top + shift;
              const index = Math.max(
                0,
                Math.floor((y - top + 0.5) / (height + pageGap)),
              );
              const limit = index * (height + pageGap) + height - bottom;
              if (
                u.bottom + shift > limit + 0.5 &&
                u.bottom - u.top <= height - top - bottom + 0.5
              ) {
                const gap = (index + 1) * (height + pageGap) + top - y;
                const widget = () => {
                  const span = document.createElement("span");
                  span.className = "document-page-break";
                  span.contentEditable = "false";
                  span.style.height = gap + "px";
                  span.setAttribute("aria-hidden", "true");
                  return span;
                };
                for (const pos of [u.pos, ...(u.extra || [])])
                  decorations.push(
                    Decoration.widget(pos, widget, {
                      side: -1,
                      key: "page-" + pos,
                    }),
                  );
                shift += gap;
              }
            }
            const total = Math.max(
              height,
              Math.ceil(
                (view.dom.scrollHeight + shift + top + bottom) /
                  (height + pageGap),
              ) *
                (height + pageGap) -
                pageGap,
            );
            sheet.style.minHeight = total + "px";
            sheet.style.setProperty("--page-height", height + "px");
            sheet.dataset.pageCount = String(
              Math.max(1, Math.ceil((total + pageGap) / (height + pageGap))),
            );
            const overlay =
              sheet.querySelector(".document-page-overlays") ||
              sheet.appendChild(document.createElement("div"));
            overlay.className = "document-page-overlays";
            overlay.setAttribute("contenteditable", "false");
            overlay.replaceChildren();
            const furniture = view.state.doc.attrs.docxFurniture || {};
            for (let i = 0; i < Number(sheet.dataset.pageCount); i++) {
              const page = document.createElement("div");
              page.className = "document-page-overlay";
              page.style.top = i * (height + pageGap) + "px";
              page.style.height = height + "px";
              for (const edge of ["tl", "tr", "bl", "br"]) {
                const mark = document.createElement("i");
                mark.className = "document-margin-mark " + edge;
                mark.setAttribute("aria-hidden", "true");
                page.append(mark);
              }
              if (furniture.header) {
                const h = document.createElement("div");
                h.className = "page-header-text";
                h.textContent = furniture.header;
                page.append(h);
              }
              if (furniture.footer || furniture.pageNumber) {
                const f = document.createElement("div");
                f.className = "page-footer-text";
                f.textContent = [
                  furniture.footer,
                  furniture.pageNumber ? String(i + 1) : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                page.append(f);
              }
              overlay.append(page);
            }
            view.dispatch(
              view.state.tr
                .setMeta(key, DecorationSet.create(view.state.doc, decorations))
                .setMeta("addToHistory", false),
            );
          }
          const observer = new ResizeObserver(() => {
            if (!frame) schedule();
          });
          observer.observe(view.dom.parentElement!);
          const start = () => {
            composing = true;
          };
          const end = () => {
            composing = false;
            clear();
          };
          view.dom.addEventListener("compositionstart", start);
          view.dom.addEventListener("compositionend", end);
          view.dom.addEventListener("document-layout-change", clear);
          view.dom.addEventListener("load", clear, true);
          document.fonts.ready.then(clear);
          document.fonts.addEventListener("loadingdone", clear);
          schedule();
          return {
            update(v, old) {
              if (!v.state.doc.eq(old.doc)) clear();
            },
            destroy() {
              closed = true;
              document.fonts.removeEventListener("loadingdone", clear);
              view.dom.removeEventListener("document-layout-change", clear);
              view.dom.removeEventListener("load", clear, true);
              cancelAnimationFrame(frame);
              observer.disconnect();
              view.dom.removeEventListener("compositionstart", start);
              view.dom.removeEventListener("compositionend", end);
            },
          };
        },
      }),
    ];
  },
});
