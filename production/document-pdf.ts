import {
  PDFDocument,
  rgb,
  degrees,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { documentLayout } from "./document-layout";
import type { CustomFont } from "./custom-fonts";
import { fontURL } from "./document-fonts";
import { pageGap } from "./document-layout";
const cached = new Map<string, Promise<ArrayBuffer>>();
function bytes(name: string) {
  if (!cached.has(name))
    cached.set(
      name,
      fetch(fontURL(name))
        .then((r) => {
          if (!r.ok)
            throw Error("PDF 글꼴을 불러오지 못했습니다. 연결을 확인하세요.");
          return r.arrayBuffer();
        })
        .catch((e) => {
          cached.delete(name);
          throw e;
        }),
    );
  return cached.get(name)!;
}
const color = (value: string) => {
  const n = value.match(/[\d.]+/g)?.map(Number) || [36, 36, 36];
  return rgb(n[0] / 255, n[1] / 255, n[2] / 255);
};
const mm = 72 / 25.4;
/** Vector text is positioned using the paginated editor's measured glyph positions. */
export async function documentPDF(
  sheet: HTMLElement,
  value: any,
  sources: {
    fonts: CustomFont[];
    bytes: (font: CustomFont) => Promise<ArrayBuffer>;
  } = {
    fonts: [],
    bytes: async () => {
      throw Error("글꼴을 불러올 수 없습니다.");
    },
  },
) {
  await document.fonts.ready;
  sheet
    .querySelector(".tiptap")
    ?.dispatchEvent(new Event("document-layout-change"));
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );

  const layout = documentLayout(value),
    doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bounds = sheet.getBoundingClientRect(),
    zoom = bounds.width / sheet.offsetWidth,
    scale = (layout.width * mm) / bounds.width;
  const height = (layout.height * 96) / 25.4,
    step = height + pageGap;
  const count =
    Number(sheet.dataset.pageCount) ||
    Math.max(1, Math.ceil((sheet.scrollHeight + pageGap) / step));
  const pages = Array.from({ length: count }, () =>
    doc.addPage([layout.width * mm, layout.height * mm]),
  );
  const point = (rect: DOMRect) => {
    const y = (rect.top - bounds.top) / zoom,
      index = Math.max(0, Math.min(count - 1, Math.floor((y + 0.1) / step)));
    return {
      page: pages[index],
      x: (rect.left - bounds.left) * scale,
      y: layout.height * mm - (y - index * step) * zoom * scale,
      index,
    };
  };
  const fonts = new Map<string, any>();
  async function fontFor(style: CSSStyleDeclaration, char: string) {
    const primary = style.fontFamily.split(",")[0];
    const custom = sources.fonts
      .filter((f) => f.family === primary.replace(/^["']|["']$/g, "").trim())
      .sort(
        (a, b) =>
          (a.style === style.fontStyle ? 0 : 1) -
            (b.style === style.fontStyle ? 0 : 1) ||
          Math.abs(Number(a.weight) - Number(style.fontWeight)) -
            Math.abs(Number(b.weight) - Number(style.fontWeight)),
      )[0];
    if (
      !custom &&
      ![
        "Arial",
        "Calibri",
        "Times New Roman",
        "맑은 고딕",
        "Noto Sans KR",
        "바탕",
        "sans-serif",
        "serif",
      ].includes(primary.replace(/^["']|["']$/g, "").trim())
    )
      throw Error(
        "PDF에 사용할 " +
          primary +
          " 글꼴을 추가하거나 다른 글꼴을 선택하세요.",
      );
    if (custom) {
      if (!fonts.has(custom.id))
        fonts.set(
          custom.id,
          await doc.embedFont(await sources.bytes(custom), { subset: false }),
        );
      const font = fonts.get(custom.id);
      if (
        Array.from(char).every((c) =>
          font.getCharacterSet().includes(c.codePointAt(0)),
        )
      )
        return { font, korean: false, italic: false };
    }

    const serif =
      !custom &&
      /Times|바탕|Myeongjo|serif/i.test(primary) &&
      !/sans-serif/i.test(primary);
    const korean =
      !/^[\u0000-\u024f\u1e00-\u1eff\u2000-\u206f]*$/.test(char) ||
      (!custom && /맑은|Noto Sans KR|바탕|Nanum/.test(primary));
    const bold = Number(style.fontWeight) >= 600,
      italic = style.fontStyle === "italic";
    const family = korean
      ? serif
        ? "NanumMyeongjo"
        : "NanumGothic"
      : serif
        ? "LiberationSerif"
        : "LiberationSans";
    const name =
      family +
      "-" +
      (bold
        ? italic && !korean
          ? "BoldItalic"
          : "Bold"
        : italic && !korean
          ? "Italic"
          : "Regular");
    if (!fonts.has(name))
      fonts.set(
        name,
        await doc.embedFont(await bytes(name), { subset: false }),
      );
    const font = fonts.get(name);
    if (
      Array.from(char).some(
        (c) => !font.getCharacterSet().includes(c.codePointAt(0)),
      )
    )
      throw Error(
        "PDF 글꼴에서 지원하지 않는 문자가 있습니다: " +
          char +
          " (문자를 바꾸거나 이미지로 넣어주세요.)",
      );
    return { font, korean, italic: italic && style.fontSynthesis !== "none" };
  }
  // Paint table cells, highlights and borders as vectors, then actual text above them.
  for (const el of Array.from(
    sheet.querySelectorAll("td,th,mark,.docx-comment"),
  ) as HTMLElement[]) {
    const style = getComputedStyle(el);
    const rects = el.matches("td,th")
      ? [el.getBoundingClientRect()]
      : Array.from(el.getClientRects());
    for (const rect of rects) {
      const sourceTop = (rect.top - bounds.top) / zoom,
        sourceBottom = (rect.bottom - bounds.top) / zoom;
      for (
        let i = Math.max(0, Math.floor(sourceTop / step));
        i < count && i * step < sourceBottom;
        i++
      ) {
        const start = Math.max(sourceTop, i * step + (layout.top * 96) / 25.4),
          end = Math.min(
            sourceBottom,
            i * step + height - (layout.bottom * 96) / 25.4,
          );
        if (end <= start) continue;
        const p = {
          page: pages[i],
          x: (rect.left - bounds.left) * scale,
          y: layout.height * mm - (start - i * step) * zoom * scale,
        };
        const width = rect.width * scale,
          h = (end - start) * zoom * scale,
          background = style.backgroundColor;
        if (background !== "transparent" && background !== "rgba(0, 0, 0, 0)")
          p.page.drawRectangle({
            x: p.x,
            y: p.y - h,
            width,
            height: h,
            color: color(background),
          });
        if (el.matches("td,th")) {
          for (const [side, start, end] of [
            ["Top", [p.x, p.y], [p.x + width, p.y]],
            ["Bottom", [p.x, p.y - h], [p.x + width, p.y - h]],
            ["Left", [p.x, p.y], [p.x, p.y - h]],
            ["Right", [p.x + width, p.y], [p.x + width, p.y - h]],
          ] as any[]) {
            const thickness =
              parseFloat((style as any)["border" + side + "Width"]) *
              zoom *
              scale;
            if (thickness)
              p.page.drawLine({
                start: { x: start[0], y: start[1] },
                end: { x: end[0], y: end[1] },
                thickness,
                color: color((style as any)["border" + side + "Color"]),
              });
          }
        }
      }
    }
  }

  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!;
  const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement!;
    if (parent.closest(".document-page-break")) continue;
    const style = getComputedStyle(parent);
    if (style.visibility === "hidden" || style.display === "none") continue;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = ctx.measureText("Hg한"),
      ascent =
        metrics.fontBoundingBoxAscent || parseFloat(style.fontSize) * 0.8,
      descent =
        metrics.fontBoundingBoxDescent || parseFloat(style.fontSize) * 0.2;
    const text = node.textContent || "";
    const segments =
      typeof Intl.Segmenter === "function"
        ? Array.from(
            new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
              text,
            ),
            (s) => ({ text: s.segment, index: s.index }),
          )
        : Array.from(text).reduce((all: any[], text) => {
            const last = all.at(-1);
            all.push({ text, index: last ? last.index + last.text.length : 0 });
            return all;
          }, []);
    for (const segment of segments) {
      const char = segment.text.normalize("NFC");
      const range = document.createRange();
      range.setStart(node, segment.index);
      range.setEnd(node, segment.index + segment.text.length);
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height || /[\r\n\t]/.test(char)) continue;
      const { font, korean, italic } = await fontFor(style, char),
        p = point(rect),
        size = parseFloat(style.fontSize) * zoom * scale;
      const glyphMetrics = ctx.measureText(char),
        a = glyphMetrics.fontBoundingBoxAscent || ascent,
        d = glyphMetrics.fontBoundingBoxDescent || descent;
      const baseline =
        p.y - ((rect.height / zoom - a - d) / 2 + a) * zoom * scale;
      const advance = font.widthOfTextAtSize(char, size),
        measured = rect.width * scale;
      const horizontal = advance > 0 ? measured / advance : 1;
      p.page.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(horizontal, 0, 0, 1, p.x, baseline),
      );
      p.page.drawText(char, {
        x: 0,
        y: 0,
        font,
        size,
        color: color(style.color),
        ...(korean && italic ? { xSkew: degrees(12) } : {}),
      });
      p.page.pushOperators(popGraphicsState());
      const decoration =
        style.textDecorationLine ||
        getComputedStyle(parent.closest("u,s,a") || parent).textDecorationLine;
      if (/underline/.test(decoration))
        p.page.drawLine({
          start: { x: p.x, y: baseline - size * 0.12 },
          end: { x: p.x + rect.width * scale, y: baseline - size * 0.12 },
          thickness: Math.max(0.4, size * 0.04),
          color: color(style.color),
        });
      if (/line-through/.test(decoration))
        p.page.drawLine({
          start: { x: p.x, y: baseline + size * 0.3 },
          end: { x: p.x + rect.width * scale, y: baseline + size * 0.3 },
          thickness: Math.max(0.4, size * 0.04),
          color: color(style.color),
        });
    }
  }
  for (const li of Array.from(sheet.querySelectorAll("li")) as HTMLElement[]) {
    const style = getComputedStyle(li),
      rect = li.getBoundingClientRect(),
      p = point(rect),
      ordered = li.parentElement?.tagName === "OL";
    const listStyle = getComputedStyle(li.parentElement!).listStyleType;
    const index =
      Number(li.parentElement?.getAttribute("start") || 1) +
      Array.from(li.parentElement!.children).indexOf(li);
    const roman = (n: number) => {
      let out = "";
      for (const [v, t] of [
        [1000, "M"],
        [900, "CM"],
        [500, "D"],
        [400, "CD"],
        [100, "C"],
        [90, "XC"],
        [50, "L"],
        [40, "XL"],
        [10, "X"],
        [9, "IX"],
        [5, "V"],
        [4, "IV"],
        [1, "I"],
      ] as [number, string][]) {
        while (n >= v) {
          out += t;
          n -= v;
        }
      }
      return out;
    };
    const alpha = (n: number): string =>
      n > 26
        ? alpha(Math.floor((n - 1) / 26)) +
          String.fromCharCode(97 + ((n - 1) % 26))
        : String.fromCharCode(96 + n);
    const marker = ordered
      ? (listStyle === "lower-alpha"
          ? alpha(index)
          : listStyle === "upper-roman"
            ? roman(index)
            : String(index)) + "."
      : listStyle === "circle"
        ? "○"
        : listStyle === "square"
          ? "▪"
          : "•";
    const { font } = await fontFor(style, marker[0]),
      size = parseFloat(style.fontSize) * zoom * scale;
    p.page.drawText(marker, {
      x: p.x - font.widthOfTextAtSize(marker, size) - size * 0.5,
      y: p.y - size,
      font,
      size,
      color: color(style.color),
    });
  }
  for (const img of Array.from(
    sheet.querySelectorAll("img[src]:not(.ProseMirror-separator)"),
  )) {
    await img.decode();
    const rect = img.getBoundingClientRect(),
      p = point(rect);
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = img.naturalWidth;
    imageCanvas.height = img.naturalHeight;
    imageCanvas.getContext("2d")!.drawImage(img, 0, 0);
    const data = await fetch(imageCanvas.toDataURL("image/png")).then((r) =>
      r.arrayBuffer(),
    );
    const embedded = await doc.embedPng(data);
    const ratio = Math.min(
      rect.width / img.naturalWidth,
      rect.height / img.naturalHeight,
    );
    const drawnWidth = img.naturalWidth * ratio,
      drawnHeight = img.naturalHeight * ratio;
    p.page.drawImage(embedded, {
      x: p.x + ((rect.width - drawnWidth) * scale) / 2,
      y: p.y - ((rect.height + drawnHeight) * scale) / 2,
      width: drawnWidth * scale,
      height: drawnHeight * scale,
    });
  }
  return new Blob([await doc.save()], { type: "application/pdf" });
}
async function inspectFont(data: ArrayBuffer) {
  try {
    const parsed = (fontkit as any).create(new Uint8Array(data));
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(data, { subset: false });
    const text = font.getCharacterSet().includes(65)
      ? "A"
      : String.fromCodePoint(font.getCharacterSet()[0]);
    doc.addPage().drawText(text, { font });
    await doc.save();
    return {
      family: parsed.familyName,
      weight: /bold|heavy|black/i.test(parsed.subfamilyName) ? "700" : "400",
      style: /italic|oblique/i.test(parsed.subfamilyName) ? "italic" : "normal",
    };
  } catch {
    throw Error(
      "이 글꼴은 PDF에 포함할 수 없습니다. 다른 TTF·OTF 파일을 선택하세요.",
    );
  }
}
(documentPDF as any).inspectFont = inspectFont;
(window as any).productionDocumentPDF = documentPDF;
