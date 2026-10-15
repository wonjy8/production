import { documentLayout } from "./document-layout";
import JSZip from "jszip";
import { Document, Packer, Paragraph } from "docx";
import { DOCX_MIME } from "./document-types";
export { DOCX_MIME, documentFormat } from "./document-types";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const parse = (text: string) => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror"))
    throw Error("문서 형식을 읽을 수 없습니다.");
  return doc;
};
const xml = (node: Node) => new XMLSerializer().serializeToString(node);
const children = (el: Element, tag?: string) =>
  Array.from(el.children).filter((n) => !tag || n.localName === tag);
const child = (el: Element, tag: string) => children(el, tag)[0];
const val = (el: Element | undefined, key = "val") =>
  el?.getAttributeNS(W, key) || el?.getAttribute("w:" + key) || "";
const escape = (text: any) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const opaque = (node: Element) => ({
  type: "docxOpaque",
  attrs: {
    xml: xml(node),
    preview: Array.from(node.getElementsByTagNameNS(W, "t"))
      .map((n) => n.textContent)
      .join(" "),
  },
});
export async function loadDocument(blob: Blob, format: string) {
  if (format === "text")
    return {
      content: {
        type: "doc",
        content: (await blob.text()).split(/\r?\n/).map((text) => ({
          type: "paragraph",
          content: text ? [{ type: "text", text }] : [],
        })),
      },
      zip: null,
    };
  if (format === "html") return { content: await blob.text(), zip: null };
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const source = await zip.file("word/document.xml")?.async("string");
  if (!source) throw Error("DOCX 본문을 찾을 수 없습니다.");
  const doc = parse(source),
    body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) throw Error("DOCX 본문을 읽을 수 없습니다.");
  const stylesText = await zip.file("word/styles.xml")?.async("string"),
    styles = new Map<string, number>();
  if (stylesText)
    for (const s of Array.from(
      parse(stylesText).getElementsByTagNameNS(W, "style"),
    )) {
      const name = val(child(s, "name")),
        match =
          /heading\s*([1-6])/i.exec(name) ||
          /heading([1-6])/i.exec(val(s, "styleId"));
      if (match) styles.set(val(s, "styleId"), Number(match[1]));
    }
  const numberingText = await zip.file("word/numbering.xml")?.async("string"),
    numbering = new Map<string, string>(),
    listStyles = new Map<string, string>();
  if (numberingText) {
    const n = parse(numberingText),
      abstracts = new Map<string, string>(),
      abstractStyles = new Map<string, string>();
    for (const a of Array.from(n.getElementsByTagNameNS(W, "abstractNum"))) {
      const level = child(a, "lvl");
      const fmt = val(level && child(level, "numFmt")),
        glyph = val(level && child(level, "lvlText"));
      abstractStyles.set(
        val(a, "abstractNumId"),
        fmt === "bullet"
          ? glyph === "○"
            ? "circle"
            : glyph === "▪"
              ? "square"
              : "disc"
          : fmt === "lowerLetter"
            ? "lower-alpha"
            : fmt === "upperRoman"
              ? "upper-roman"
              : "decimal",
      );
      abstracts.set(
        val(a, "abstractNumId"),
        val(level && child(level, "numFmt")) === "bullet"
          ? "bulletList"
          : "orderedList",
      );
    }
    for (const num of Array.from(n.getElementsByTagNameNS(W, "num"))) {
      listStyles.set(
        val(num, "numId"),
        abstractStyles.get(val(child(num, "abstractNumId"))) || "disc",
      );
      numbering.set(
        val(num, "numId"),
        abstracts.get(val(child(num, "abstractNumId"))) || "orderedList",
      );
    }
  }
  const relsText = await zip
      .file("word/_rels/document.xml.rels")
      ?.async("string"),
    rels = new Map<string, string>();
  if (relsText)
    for (const r of Array.from(parse(relsText).documentElement.children))
      rels.set(r.getAttribute("Id") || "", r.getAttribute("Target") || "");
  const commentSource = await zip.file("word/comments.xml")?.async("string"),
    comments = new Map<string, any>();
  if (commentSource)
    for (const c of Array.from(
      parse(commentSource).getElementsByTagNameNS(W, "comment"),
    ))
      comments.set(val(c, "id"), {
        id: val(c, "id"),
        author: val(c, "author"),
        date: val(c, "date"),
        text: Array.from(c.getElementsByTagNameNS(W, "t"))
          .map((t) => t.textContent)
          .join(""),
      });
  async function runs(p: Element, inherited: any = null) {
    let currentComment: any = inherited;
    const content: any[] = [];
    for (const n of children(p)) {
      if (n.localName === "commentRangeStart") {
        currentComment = comments.get(val(n, "id"));
        continue;
      }
      if (n.localName === "commentRangeEnd") {
        currentComment = null;
        continue;
      }
      if (n.localName === "pPr") continue;
      if (n.localName === "hyperlink") {
        const nested = await runs(n, currentComment);
        const href = rels.get(n.getAttributeNS(R, "id") || "");
        if (href && /^https?:\/\//i.test(href))
          for (const t of nested)
            if (t.type === "text")
              t.marks = [
                ...(t.marks || []),
                {
                  type: "link",
                  attrs: { href, target: "_blank", rel: "noopener noreferrer" },
                },
              ];
        content.push(...nested);
        continue;
      }
      if (n.localName !== "r") continue;
      const props = child(n, "rPr"),
        marks: any[] = currentComment
          ? [{ type: "docxComment", attrs: currentComment }]
          : [];
      if (props) {
        marks.push({ type: "docxRun", attrs: { xml: xml(props) } });
        for (const [tag, type] of [
          ["b", "bold"],
          ["i", "italic"],
          ["u", "underline"],
          ["strike", "strike"],
        ] as const) {
          const prop = child(props, tag);
          if (prop && !["0", "false", "none"].includes(val(prop)))
            marks.push({ type });
        }
        const vert = val(child(props, "vertAlign"));
        if (["subscript", "superscript"].includes(vert))
          marks.push({ type: vert });
        const shade = val(child(props, "shd"), "fill"),
          highlight = val(child(props, "highlight"));
        const palette: any = {
          yellow: "#ffff00",
          green: "#00ff00",
          cyan: "#00ffff",
          magenta: "#ff00ff",
          blue: "#0000ff",
          red: "#ff0000",
          darkBlue: "#000080",
          darkCyan: "#008080",
          darkGreen: "#008000",
          darkMagenta: "#800080",
          darkRed: "#800000",
          darkYellow: "#808000",
          lightGray: "#c0c0c0",
          darkGray: "#808080",
          black: "#000000",
          white: "#ffffff",
        };
        if (shade && shade !== "auto")
          marks.push({ type: "highlight", attrs: { color: "#" + shade } });
        else if (palette[highlight])
          marks.push({
            type: "highlight",
            attrs: { color: palette[highlight] },
          });
        const color = val(child(props, "color")),
          size = Number(val(child(props, "sz"))),
          font =
            val(child(props, "rFonts"), "ascii") ||
            val(child(props, "rFonts"), "eastAsia");
        if ((color && color !== "auto") || size || font)
          marks.push({
            type: "textStyle",
            attrs: {
              ...(color && color !== "auto" ? { color: "#" + color } : {}),
              ...(size ? { fontSize: size / 2 + "pt" } : {}),
              ...(font ? { fontFamily: font } : {}),
            },
          });
      }
      for (const part of children(n)) {
        if (part.localName === "t")
          content.push({ type: "text", text: part.textContent || "", marks });
        else if (part.localName === "tab")
          content.push({ type: "text", text: "\t", marks });
        else if (part.localName === "br")
          content.push({
            type: "hardBreak",
            ...(currentComment
              ? { marks: [{ type: "docxComment", attrs: currentComment }] }
              : {}),
          });
        else if (part.localName === "drawing") {
          const blip = part.getElementsByTagNameNS(
              "http://schemas.openxmlformats.org/drawingml/2006/main",
              "blip",
            )[0],
            id = blip?.getAttributeNS(R, "embed"),
            target = id && rels.get(id);
          if (target && !target.includes("..") && !target.startsWith("/")) {
            const file = zip.file("word/" + target);
            if (file) {
              const ext = target.split(".").pop()?.toLowerCase(),
                mime =
                  ext === "jpg" || ext === "jpeg"
                    ? "image/jpeg"
                    : ext === "png"
                      ? "image/png"
                      : ext === "gif"
                        ? "image/gif"
                        : null;
              if (mime)
                content.push({
                  type: "image",
                  attrs: {
                    src:
                      "data:" +
                      mime +
                      ";base64," +
                      (await file.async("base64")),
                    docxXml: xml(part),
                    alt:
                      part
                        .getElementsByTagNameNS(
                          "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
                          "docPr",
                        )[0]
                        ?.getAttribute("descr") || "",
                    width:
                      Number(
                        part
                          .getElementsByTagNameNS(
                            "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
                            "extent",
                          )[0]
                          ?.getAttribute("cx"),
                      ) / 9525 || null,
                    height:
                      Number(
                        part
                          .getElementsByTagNameNS(
                            "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
                            "extent",
                          )[0]
                          ?.getAttribute("cy"),
                      ) / 9525 || null,
                  },
                });
            }
          }
        }
      }
    }
    return content.filter((n) => n.type !== "text" || n.text);
  }
  function unsafe(p: Element) {
    const starts = Array.from(p.getElementsByTagNameNS(W, "commentRangeStart")),
      ends = Array.from(p.getElementsByTagNameNS(W, "commentRangeEnd"));
    const nested = children(p).filter((n) =>
      ["commentRangeStart", "commentRangeEnd"].includes(n.localName),
    );
    let depth = 0;
    for (const n of nested) {
      depth += n.localName === "commentRangeStart" ? 1 : -1;
      if (depth < 0 || depth > 1) return true;
    }
    if (
      depth ||
      starts.length !== ends.length ||
      starts.some((n) => !comments.has(val(n, "id")))
    )
      return true;
    return (
      Array.from(p.getElementsByTagNameNS(W, "r")).some((r) =>
        children(r).some(
          (n) =>
            !["rPr", "t", "tab", "br", "drawing", "commentReference"].includes(
              n.localName,
            ),
        ),
      ) ||
      Array.from(p.getElementsByTagName("*")).some((n) =>
        [
          "fldChar",
          "instrText",
          "object",
          "pict",
          "sdt",
          "del",
          "ins",
          "footnoteReference",
          "endnoteReference",
          "AlternateContent",
        ].includes(n.localName),
      ) ||
      children(p).some(
        (n) =>
          ![
            "pPr",
            "r",
            "hyperlink",
            "bookmarkStart",
            "bookmarkEnd",
            "proofErr",
            "commentRangeStart",
            "commentRangeEnd",
          ].includes(n.localName),
      ) ||
      Array.from(p.getElementsByTagNameNS(W, "br")).some(
        (n) => val(n, "type") === "page",
      )
    );
  }
  async function block(n: Element): Promise<any> {
    if (n.localName === "p") {
      if (unsafe(n)) return opaque(n);
      for (const drawing of Array.from(
        n.getElementsByTagNameNS(W, "drawing"),
      )) {
        const blip = drawing.getElementsByTagNameNS(
            "http://schemas.openxmlformats.org/drawingml/2006/main",
            "blip",
          )[0],
          target = rels.get(blip?.getAttributeNS(R, "embed") || "");
        if (
          !target ||
          target.includes("..") ||
          !/^media\/.*\.(png|jpe?g|gif)$/i.test(target) ||
          !zip.file("word/" + target)
        )
          return opaque(n);
      }
      const props = child(n, "pPr"),
        style = props && val(child(props, "pStyle")),
        level =
          style &&
          (styles.get(style) ||
            Number(/^Heading([1-6])$/i.exec(style)?.[1]) ||
            null),
        align = props && val(child(props, "jc"));
      return {
        type: level ? "heading" : "paragraph",
        attrs: {
          ...(level ? { level } : {}),
          docxHeading: level || null,
          textAlign: align === "both" ? "justify" : align || "left",
          ...(() => {
            const spacing = props && child(props, "spacing"),
              indent = props && child(props, "ind");
            const out: any = {};
            if (
              val(spacing, "line") &&
              (!val(spacing, "lineRule") || val(spacing, "lineRule") === "auto")
            )
              out.lineHeight = Number(val(spacing, "line")) / 240;
            for (const [tag, key, ratio] of [
              ["before", "spaceBefore", 20],
              ["after", "spaceAfter", 20],
            ] as const)
              if (val(spacing, tag) !== "")
                out[key] = Number(val(spacing, tag)) / ratio;
            for (const [tag, key] of [
              ["left", "indentLeft"],
              ["right", "indentRight"],
            ] as const)
              if (val(indent, tag) !== "")
                out[key] = (Number(val(indent, tag)) * 2.54) / 1440;
            if (val(indent, "firstLine"))
              out.firstLine = (Number(val(indent, "firstLine")) * 2.54) / 1440;
            else if (val(indent, "hanging"))
              out.firstLine = (-Number(val(indent, "hanging")) * 2.54) / 1440;
            return out;
          })(),
          docxProperties: props ? xml(props) : null,
        },
        content: await runs(n),
      };
    }
    if (n.localName === "tbl") {
      const rows: any[] = [],
        leaders = new Map<number, any>();
      for (const row of children(n, "tr")) {
        const cells: any[] = [];
        let column = 0;
        for (const cell of children(row, "tc")) {
          const props = child(cell, "tcPr"),
            span = Number(props && val(child(props, "gridSpan"))) || 1,
            merge = props && child(props, "vMerge");
          if (merge && val(merge) !== "restart") {
            if (
              Array.from(cell.getElementsByTagNameNS(W, "t")).some(
                (t) => t.textContent,
              ) ||
              children(props!).some(
                (p) => !["tcW", "gridSpan", "vMerge"].includes(p.localName),
              )
            )
              return opaque(n);
            const leader = leaders.get(column);
            if (!leader) return opaque(n);
            leader.attrs.rowspan++;
            column += span;
            continue;
          }
          const item: any = {
            type: "tableCell",
            attrs: {
              colspan: span,
              rowspan: 1,
              docxProperties: props ? xml(props) : null,
            },
            content: await blocks(
              children(cell).filter((c) => c.localName !== "tcPr"),
            ),
          };
          for (let c = column; c < column + span; c++) leaders.delete(c);
          if (merge) leaders.set(column, item);
          cells.push(item);
          column += span;
        }
        rows.push({
          type: "tableRow",
          attrs: {
            docxProperties: child(row, "trPr") ? xml(child(row, "trPr")) : null,
          },
          content: cells,
        });
      }
      return {
        type: "table",
        attrs: {
          docxProperties: child(n, "tblPr") ? xml(child(n, "tblPr")) : null,
          docxGrid: child(n, "tblGrid") ? xml(child(n, "tblGrid")) : null,
          objectAlign:
            val(child(n, "tblPr") && child(child(n, "tblPr"), "jc")) || "left",
          objectWidth: (() => {
            const w = child(n, "tblPr") && child(child(n, "tblPr"), "tblW");
            return val(w, "type") === "pct" ? Number(val(w, "w")) / 50 : null;
          })(),
        },
        content: rows,
      };
    }
    return opaque(n);
  }
  async function blocks(nodes: Element[]) {
    const output: any[] = [];
    let stack: any[] = [];
    for (const element of nodes) {
      if (element.localName === "sectPr") continue;
      const b = await block(element),
        props = child(element, "pPr"),
        numPr = props && child(props, "numPr"),
        id = numPr && val(child(numPr, "numId"));
      if (id && b.type !== "docxOpaque") {
        let level = Math.min(8, Number(val(child(numPr!, "ilvl"))) || 0);
        const type = numbering.get(id) || "orderedList";
        if (!stack.length) {
          level = 0;
          const list = {
            type,
            attrs: {
              docxNumId: id,
              docxNumKind: type,
              listStyle: listStyles.get(id) || null,
            },
            content: [],
          };
          output.push(list);
          stack = [{ id, list }];
        } else {
          level = Math.min(level, stack.length);
          stack = stack.slice(0, level + 1);
          if (
            !stack[level] ||
            stack[level].id !== id ||
            stack[level].list.type !== type
          ) {
            const list = {
              type,
              attrs: {
                docxNumId: id,
                docxNumKind: type,
                listStyle: listStyles.get(id) || null,
              },
              content: [],
            };
            if (level > 0)
              stack[level - 1].list.content.at(-1).content.push(list);
            else output.push(list);
            stack[level] = { id, list };
          }
        }
        stack[level].list.content.push({ type: "listItem", content: [b] });
      } else {
        output.push(b);
        stack = [];
      }
    }
    return output.length ? output : [{ type: "paragraph" }];
  }
  const furniture: any = { custom: false };
  const section = children(body, "sectPr").at(-1);
  for (const key of ["header", "footer"]) {
    const ref =
      section &&
      children(section, key + "Reference").find(
        (r) => val(r, "type") === "default",
      );
    const target = ref && rels.get(ref.getAttributeNS(R, "id") || "");
    if (target && !target.includes("..")) {
      const source = await zip
        .file(target.startsWith("/") ? target.slice(1) : "word/" + target)
        ?.async("string");
      if (source) {
        const part = parse(source);
        furniture[key] = Array.from(part.getElementsByTagNameNS(W, "t"))
          .filter((n) => !n.closest("fldSimple"))
          .map((n) => n.textContent)
          .join("")
          .replace(/ · $/, "");
        if (key === "footer") {
          const field =
            Array.from(part.getElementsByTagNameNS(W, "instrText")).some((n) =>
              /\bPAGE\b/.test(n.textContent || ""),
            ) ||
            Array.from(part.getElementsByTagNameNS(W, "fldSimple")).some((n) =>
              /\bPAGE\b/.test(val(n, "instr")),
            );
          furniture.pageNumber = field;
        }
      }
    }
  }
  return {
    content: {
      type: "doc",
      attrs: {
        docxFurniture: furniture,
        docxLayout: (() => {
          const sect = children(body, "sectPr").at(-1),
            m = sect && child(sect, "pgMar"),
            size = sect && child(sect, "pgSz");
          const value: any = {};
          for (const key of ["top", "right", "bottom", "left"])
            if (m?.hasAttributeNS(W, key))
              value[key] = (Number(val(m, key)) * 25.4) / 1440;
          if (size) {
            value.width = (Number(val(size, "w")) * 25.4) / 1440;
            value.height = (Number(val(size, "h")) * 25.4) / 1440;
          }
          return documentLayout(value);
        })(),
      },
      content: await blocks(children(body)),
    },
    zip,
  };
}
export async function saveDocument(
  content: any,
  format: string,
  original: any,
  html: string,
  text: string,
): Promise<Blob> {
  if (format === "text")
    return new Blob([text], { type: "text/plain;charset=utf-8" });
  if (format === "html")
    return new Blob(
      [
        '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
          html +
          "</body></html>",
      ],
      { type: "text/html;charset=utf-8" },
    );
  const zip = original
    ? await JSZip.loadAsync(
        await original.generateAsync({ type: "uint8array" }),
      )
    : await JSZip.loadAsync(
        await (
          await Packer.toBlob(
            new Document({ sections: [{ children: [new Paragraph("")] }] }),
          )
        ).arrayBuffer(),
      );
  const document = parse(await zip.file("word/document.xml").async("string")),
    body = document.getElementsByTagNameNS(W, "body")[0],
    section = children(body, "sectPr").map(xml).join("");
  const relPath = "word/_rels/document.xml.rels",
    rels = parse(
      (await zip.file(relPath)?.async("string")) ||
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    );
  const commentsPath = "word/comments.xml",
    commentDoc = parse(
      (await zip.file(commentsPath)?.async("string")) ||
        '<w:comments xmlns:w="' + W + '"/>',
    );
  let commentsChanged = false;
  function commentXML(mark: any) {
    const a = mark.attrs,
      id = String(a.id);
    let entry = Array.from(commentDoc.documentElement.children).find(
      (n) => val(n, "id") === id,
    );
    if (!entry) {
      entry = commentDoc.createElementNS(W, "w:comment");
      entry.setAttributeNS(W, "w:id", id);
      entry.setAttributeNS(W, "w:author", String(a.author || "사용자"));
      entry.setAttributeNS(
        W,
        "w:date",
        String(a.date || new Date().toISOString()),
      );
      const p = commentDoc.createElementNS(W, "w:p"),
        r = commentDoc.createElementNS(W, "w:r"),
        t = commentDoc.createElementNS(W, "w:t");
      t.textContent = a.text || "";
      r.append(t);
      p.append(r);
      entry.append(p);
      commentDoc.documentElement.append(entry);
      commentsChanged = true;
    }
    return escape(id);
  }
  function paragraphInline(nodes: any[]) {
    let output = "",
      current = "";
    const close = () => {
      if (current !== "") {
        output +=
          '<w:commentRangeEnd w:id="' +
          current +
          '"/><w:r><w:commentReference w:id="' +
          current +
          '"/></w:r>';
        current = "";
      }
    };
    for (const n of nodes) {
      const mark = n.marks?.find((m: any) => m.type === "docxComment"),
        id = mark ? commentXML(mark) : "";
      if (id !== current) {
        close();
        if (id !== "") {
          current = id;
          output += '<w:commentRangeStart w:id="' + id + '"/>';
        }
      }
      output += inline(n);
    }
    close();
    return output;
  }
  let seq = 0;
  const media: any[] = [];
  const numPath = "word/numbering.xml",
    numbering = parse(
      (await zip.file(numPath)?.async("string")) ||
        '<w:numbering xmlns:w="' + W + '"/>',
    );
  let numId = Math.max(
      0,
      ...Array.from(numbering.getElementsByTagNameNS(W, "num")).map((n) =>
        Number(val(n, "numId")),
      ),
    ),
    absId = Math.max(
      0,
      ...Array.from(numbering.getElementsByTagNameNS(W, "abstractNum")).map(
        (n) => Number(val(n, "abstractNumId")),
      ),
    );
  function listId(bullet: boolean, style = "disc") {
    const id = ++numId,
      a = ++absId;
    const fragment = parse(
      '<w:numbering xmlns:w="' +
        W +
        '"><w:abstractNum w:abstractNumId="' +
        a +
        '">' +
        Array.from(
          { length: 9 },
          (_, level) =>
            '<w:lvl w:ilvl="' +
            level +
            '"><w:start w:val="1"/><w:numFmt w:val="' +
            (bullet
              ? "bullet"
              : style === "lower-alpha"
                ? "lowerLetter"
                : style === "upper-roman"
                  ? "upperRoman"
                  : "decimal") +
            '"/><w:lvlText w:val="' +
            (bullet
              ? style === "circle"
                ? "○"
                : style === "square"
                  ? "▪"
                  : "•"
              : "%" + (level + 1) + ".") +
            '"/><w:pPr><w:ind w:left="' +
            720 * (level + 1) +
            '" w:hanging="360"/></w:pPr></w:lvl>',
        ).join("") +
        '</w:abstractNum><w:num w:numId="' +
        id +
        '"><w:abstractNumId w:val="' +
        a +
        '"/></w:num></w:numbering>',
    );
    for (const n of children(fragment.documentElement))
      numbering.documentElement.appendChild(numbering.importNode(n, true));
    return id;
  }
  function property(
    raw: string | undefined,
    tag: string,
    updates: Record<string, any>,
  ) {
    const el = raw
      ? parse(raw).documentElement
      : parse("<w:" + tag + ' xmlns:w="' + W + '"/>').documentElement;
    for (const [key, value] of Object.entries(updates)) {
      const previous = children(el, key)[0];
      const oldAttributes = previous
        ? Array.from(previous.attributes).map((a) => ({
            namespace: a.namespaceURI,
            name: a.name,
            value: a.value,
          }))
        : [];
      for (const old of children(el, key)) old.remove();
      if (value) {
        const node = el.ownerDocument.createElementNS(W, "w:" + key);
        if (key === "spacing" || key === "ind") {
          for (const a of oldAttributes)
            node.setAttributeNS(a.namespace, a.name, a.value);
          for (const [attr, v] of Object.entries(value)) {
            if (v === null) node.removeAttributeNS(W, attr);
            else node.setAttributeNS(W, "w:" + attr, String(v));
          }
        } else if (key === "numPr") {
          node.innerHTML = value;
        } else if (key === "tblW") {
          node.setAttributeNS(W, "w:w", value);
          node.setAttributeNS(W, "w:type", "pct");
        } else if (key === "shd") {
          node.setAttributeNS(W, "w:fill", value);
          node.setAttributeNS(W, "w:val", "clear");
        } else if (key === "rFonts") {
          for (const name of ["ascii", "hAnsi", "eastAsia", "cs"])
            node.setAttributeNS(W, "w:" + name, value);
        } else node.setAttributeNS(W, "w:val", value);
        el.appendChild(node);
      }
    }
    return xml(el);
  }
  function relation(type: string, target: string, external = false) {
    let id;
    do {
      id = "pnDoc" + ++seq;
    } while (
      Array.from(rels.documentElement.children).some(
        (n) => n.getAttribute("Id") === id,
      )
    );
    const r = rels.createElementNS(
      rels.documentElement.namespaceURI,
      "Relationship",
    );
    r.setAttribute("Id", id);
    r.setAttribute("Type", R + "/" + type);
    r.setAttribute("Target", target);
    if (external) r.setAttribute("TargetMode", "External");
    rels.documentElement.appendChild(r);
    return id;
  }
  function inline(n: any): string {
    if (n.type === "hardBreak") return "<w:r><w:br/></w:r>";
    if (n.type === "image") {
      if (n.attrs.docxXml) {
        const drawing = parse(n.attrs.docxXml);
        for (const tag of ["extent", "ext"])
          for (const el of Array.from(drawing.getElementsByTagName("*")).filter(
            (el) => el.localName === tag && el.hasAttribute("cx"),
          )) {
            if (n.attrs.width)
              el.setAttribute("cx", String(Math.round(n.attrs.width * 9525)));
            if (n.attrs.height)
              el.setAttribute("cy", String(Math.round(n.attrs.height * 9525)));
          }
        return "<w:r>" + xml(drawing.documentElement) + "</w:r>";
      }
      const match = /^data:image\/(png|jpeg|gif);base64,(.+)$/s.exec(
        n.attrs.src || "",
      );
      if (!match) return "";
      const filename =
          "production-" +
          crypto.randomUUID() +
          "." +
          (match[1] === "jpeg" ? "jpg" : match[1]),
        id = relation("image", "media/" + filename);
      media.push({ filename, data: match[2], mime: "image/" + match[1] });
      const cx = Math.round((Number(n.attrs.width) || 480) * 9525),
        cy = Math.round((Number(n.attrs.height) || 320) * 9525);
      return (
        '<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="' +
        cx +
        '" cy="' +
        cy +
        '"/><wp:docPr id="' +
        seq +
        '" name="image" descr="' +
        escape(n.attrs.alt || "") +
        '"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' +
        id +
        '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' +
        cx +
        '" cy="' +
        cy +
        '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'
      );
    }
    if (n.type !== "text") return "";
    const marks = n.marks || [],
      has = (t: string) => marks.some((m: any) => m.type === t),
      style = marks.find((m: any) => m.type === "textStyle")?.attrs || {},
      raw = marks.find((m: any) => m.type === "docxRun")?.attrs.xml;
    const props = property(raw, "rPr", {
      b: has("bold") ? "1" : "",
      i: has("italic") ? "1" : "",
      u: has("underline") ? "single" : "",
      strike: has("strike") ? "1" : "",
      vertAlign: has("subscript")
        ? "subscript"
        : has("superscript")
          ? "superscript"
          : "",
      highlight: "",
      shd: has("highlight")
        ? (
            marks.find((m: any) => m.type === "highlight")?.attrs.color ||
            "#fff29a"
          ).replace("#", "")
        : "",
      color: style.color ? style.color.replace("#", "") : "",
      ...(style.fontFamily &&
      (!raw ||
        (val(child(parse(raw).documentElement, "rFonts"), "ascii") ||
          val(child(parse(raw).documentElement, "rFonts"), "eastAsia")) !==
          style.fontFamily)
        ? { rFonts: style.fontFamily }
        : {}),
      sz: style.fontSize
        ? String(
            Math.round(
              parseFloat(style.fontSize) *
                (style.fontSize.endsWith("px") ? 0.75 : 1) *
                2,
            ),
          )
        : "",
    });
    const run =
        "<w:r>" +
        props +
        '<w:t xml:space="preserve">' +
        escape(n.text) +
        "</w:t></w:r>",
      link = marks.find((m: any) => m.type === "link")?.attrs.href;
    return link && /^https?:\/\//i.test(link)
      ? '<w:hyperlink r:id="' +
          relation("hyperlink", link, true) +
          '">' +
          run +
          "</w:hyperlink>"
      : run;
  }
  function node(n: any, list?: { id: number; level: number }): string {
    if (n.type === "docxOpaque") return n.attrs.xml;
    if (["bulletList", "orderedList"].includes(n.type)) {
      const id =
        original && n.attrs?.docxNumId && n.attrs.docxNumKind === n.type
          ? Number(n.attrs.docxNumId)
          : listId(n.type === "bulletList", n.attrs?.listStyle);
      return (n.content || [])
        .map((c: any) => node(c, { id, level: list ? list.level + 1 : 0 }))
        .join("");
    }
    if (n.type === "listItem")
      return (n.content || []).map((c: any) => node(c, list)).join("");
    if (n.type === "table") {
      const pending = new Map<number, { left: number; span: number }>();
      let rows = "";
      for (const row of n.content || []) {
        let column = 0,
          cells = "";
        const continuation = () => {
          while (pending.has(column)) {
            const p = pending.get(column)!;
            cells +=
              "<w:tc><w:tcPr>" +
              (p.span > 1 ? '<w:gridSpan w:val="' + p.span + '"/>' : "") +
              "<w:vMerge/></w:tcPr><w:p/></w:tc>";
            if (--p.left === 0) pending.delete(column);
            column += p.span;
          }
        };
        for (const cell of row.content || []) {
          continuation();
          const span = cell.attrs?.colspan || 1;
          cells += node(cell);
          if (cell.attrs?.rowspan > 1)
            pending.set(column, { left: cell.attrs.rowspan - 1, span });
          column += span;
        }
        continuation();
        rows +=
          "<w:tr>" +
          property(row.attrs?.docxProperties, "trPr", {}) +
          cells +
          "</w:tr>";
      }
      const columns = Math.max(
          1,
          ...(n.content || []).map((r: any) =>
            (r.content || []).reduce(
              (sum: number, c: any) => sum + (c.attrs?.colspan || 1),
              0,
            ),
          ),
        ),
        originalGrid = n.attrs?.docxGrid
          ? parse(n.attrs.docxGrid).documentElement
          : null,
        oldColumns = originalGrid ? children(originalGrid, "gridCol") : [],
        total =
          oldColumns.reduce((sum, c) => sum + Number(val(c, "w")), 0) || 9000,
        grid =
          oldColumns.length === columns
            ? n.attrs.docxGrid
            : "<w:tblGrid>" +
              Array.from(
                { length: columns },
                () => '<w:gridCol w:w="' + Math.floor(total / columns) + '"/>',
              ).join("") +
              "</w:tblGrid>";
      return (
        "<w:tbl>" +
        property(n.attrs?.docxProperties, "tblPr", {
          jc: n.attrs?.objectAlign || "left",
          ...(n.attrs?.objectWidth
            ? { tblW: String(n.attrs.objectWidth * 50) }
            : {}),
        }) +
        grid +
        rows +
        "</w:tbl>"
      );
    }
    if (n.type === "tableRow")
      return (
        "<w:tr>" +
        (n.content || []).map((c: any) => node(c)).join("") +
        "</w:tr>"
      );
    if (["tableCell", "tableHeader"].includes(n.type))
      return (
        "<w:tc>" +
        property(n.attrs?.docxProperties, "tcPr", {
          gridSpan: n.attrs?.colspan > 1 ? String(n.attrs.colspan) : "",
          vMerge: n.attrs?.rowspan > 1 ? "restart" : "",
        }) +
        (n.content || [{ type: "paragraph" }])
          .map((c: any) => node(c))
          .join("") +
        "</w:tc>"
      );
    if (["paragraph", "heading", "codeBlock"].includes(n.type)) {
      const attrs = n.attrs || {},
        pr = property(attrs.docxProperties, "pPr", {
          ...(n.type === "heading"
            ? attrs.docxHeading === attrs.level
              ? {}
              : { pStyle: "Heading" + attrs.level }
            : attrs.docxHeading
              ? { pStyle: "" }
              : {}),
          ...(["lineHeight", "spaceBefore", "spaceAfter"].some(
            (key) => attrs[key] != null,
          )
            ? {
                spacing: {
                  ...(attrs.lineHeight != null
                    ? {
                        line: Math.round(attrs.lineHeight * 240),
                        lineRule: "auto",
                      }
                    : {}),
                  ...(attrs.spaceBefore != null
                    ? { before: Math.round(attrs.spaceBefore * 20) }
                    : {}),
                  ...(attrs.spaceAfter != null
                    ? { after: Math.round(attrs.spaceAfter * 20) }
                    : {}),
                },
              }
            : {}),
          ...(["indentLeft", "indentRight", "firstLine"].some(
            (key) => attrs[key] != null,
          )
            ? {
                ind: {
                  ...(attrs.indentLeft != null
                    ? { left: Math.round((attrs.indentLeft * 1440) / 2.54) }
                    : {}),
                  ...(attrs.indentRight != null
                    ? { right: Math.round((attrs.indentRight * 1440) / 2.54) }
                    : {}),
                  ...(attrs.firstLine != null
                    ? {
                        firstLine:
                          attrs.firstLine >= 0
                            ? Math.round((attrs.firstLine * 1440) / 2.54)
                            : null,
                        hanging:
                          attrs.firstLine < 0
                            ? Math.round((-attrs.firstLine * 1440) / 2.54)
                            : null,
                      }
                    : {}),
                },
              }
            : {}),
          jc:
            attrs.textAlign === "justify" ? "both" : attrs.textAlign || "left",
          numPr: list
            ? '<w:ilvl xmlns:w="' +
              W +
              '" w:val="' +
              list.level +
              '"/><w:numId xmlns:w="' +
              W +
              '" w:val="' +
              list.id +
              '"/>'
            : "",
        });
      return "<w:p>" + pr + paragraphInline(n.content || []) + "</w:p>";
    }
    if (n.type === "horizontalRule")
      return '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6"/></w:pBdr></w:pPr></w:p>';
    return (n.content || []).map((c: any) => node(c)).join("");
  }
  const stylePath = "word/styles.xml",
    styles = parse(
      (await zip.file(stylePath)?.async("string")) ||
        '<w:styles xmlns:w="' + W + '"/>',
    );
  for (let level = 1; level <= 6; level++) {
    const id = "Heading" + level;
    if (
      Array.from(styles.getElementsByTagNameNS(W, "style")).some(
        (n) => val(n, "styleId") === id,
      )
    )
      continue;
    const definition = parse(
      '<w:style xmlns:w="' +
        W +
        '" w:type="paragraph" w:styleId="' +
        id +
        '"><w:name w:val="heading ' +
        level +
        '"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:outlineLvl w:val="' +
        (level - 1) +
        '"/></w:pPr><w:rPr><w:b/><w:sz w:val="' +
        [36, 28, 24, 22, 20, 18][level - 1] +
        '"/></w:rPr></w:style>',
    );
    styles.documentElement.appendChild(
      styles.importNode(definition.documentElement, true),
    );
  }
  zip.file(stylePath, xml(styles));
  const result = parse(
    '<w:body xmlns:w="' +
      W +
      '" xmlns:r="' +
      R +
      '">' +
      (content.content || []).map((n: any) => node(n)).join("") +
      section +
      "</w:body>",
  );
  body.replaceWith(document.importNode(result.documentElement, true));
  if (content.attrs?.docxLayout) {
    const layout = documentLayout(content.attrs.docxLayout),
      sect = children(result.documentElement, "sectPr").at(-1);
    if (sect) {
      let margins = child(sect, "pgMar");
      if (!margins) {
        margins = result.createElementNS(W, "w:pgMar");
        sect.append(margins);
      }
      for (const key of ["top", "right", "bottom", "left"])
        margins.setAttributeNS(
          W,
          "w:" + key,
          String(Math.round(((layout as any)[key] / 25.4) * 1440)),
        );
      let size = child(sect, "pgSz");
      if (!size) {
        size = result.createElementNS(W, "w:pgSz");
        sect.prepend(size);
      }
      size.setAttributeNS(
        W,
        "w:w",
        String(Math.round((layout.width / 25.4) * 1440)),
      );
      size.setAttributeNS(
        W,
        "w:h",
        String(Math.round((layout.height / 25.4) * 1440)),
      );
      document
        .getElementsByTagNameNS(W, "body")[0]
        .replaceWith(document.importNode(result.documentElement, true));
    }
  }
  const furniture = content.attrs?.docxFurniture;
  const furnitureParts: any[] = [];
  if (furniture?.custom) {
    const body = document.getElementsByTagNameNS(W, "body")[0];
    let sect = children(body, "sectPr").at(-1);
    if (!sect) {
      sect = document.createElementNS(W, "w:sectPr");
      body.append(sect);
    }
    for (const kind of ["header", "footer"]) {
      for (const ref of children(sect, kind + "Reference"))
        if (val(ref, "type") === "default") ref.remove();
      if (!furniture[kind] && !(kind === "footer" && furniture.pageNumber))
        continue;
      const path = "production-" + kind + ".xml",
        tag = kind === "header" ? "hdr" : "ftr";
      const text =
        '<w:r><w:t xml:space="preserve">' +
        escape(furniture[kind] || "") +
        "</w:t></w:r>";
      const number =
        kind === "footer" && furniture.pageNumber
          ? (furniture.footer ? "<w:r><w:t> · </w:t></w:r>" : "") +
            '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>'
          : "";
      zip.file(
        "word/" + path,
        "<w:" +
          tag +
          ' xmlns:w="' +
          W +
          '"><w:p><w:pPr><w:jc w:val="' +
          (kind === "footer" ? "center" : "left") +
          '"/></w:pPr>' +
          text +
          number +
          "</w:p></w:" +
          tag +
          ">",
      );
      const ref = document.createElementNS(W, "w:" + kind + "Reference");
      ref.setAttributeNS(W, "w:type", "default");
      ref.setAttributeNS(R, "r:id", relation(kind, path));
      sect.prepend(ref);
      furnitureParts.push({ path: "/word/" + path, kind });
    }
    let margins = child(sect, "pgMar");
    if (!margins) {
      margins = document.createElementNS(W, "w:pgMar");
      sect.append(margins);
    }
    margins.setAttributeNS(W, "w:header", "340");
    margins.setAttributeNS(W, "w:footer", "340");
  }
  zip.file("word/document.xml", xml(document));
  if (numId) {
    zip.file(numPath, xml(numbering));
    if (
      !Array.from(rels.documentElement.children).some((n) =>
        (n.getAttribute("Type") || "").endsWith("/numbering"),
      )
    )
      relation("numbering", "numbering.xml");
  }
  if (commentsChanged) {
    zip.file(commentsPath, xml(commentDoc));
    if (
      !Array.from(rels.documentElement.children).some((n) =>
        (n.getAttribute("Type") || "").endsWith("/comments"),
      )
    )
      relation("comments", "comments.xml");
  }
  zip.file(relPath, xml(rels));
  const types = parse(await zip.file("[Content_Types].xml").async("string"));
  for (const part of furnitureParts) {
    if (
      Array.from(types.documentElement.children).some(
        (n) => n.getAttribute("PartName") === part.path,
      )
    )
      continue;
    const n = types.createElementNS(
      types.documentElement.namespaceURI,
      "Override",
    );
    n.setAttribute("PartName", part.path);
    n.setAttribute(
      "ContentType",
      "application/vnd.openxmlformats-officedocument.wordprocessingml." +
        part.kind +
        "+xml",
    );
    types.documentElement.append(n);
  }
  if (
    numId &&
    !Array.from(types.documentElement.children).some(
      (n) => n.getAttribute("PartName") === "/word/numbering.xml",
    )
  ) {
    const n = types.createElementNS(
      types.documentElement.namespaceURI,
      "Override",
    );
    n.setAttribute("PartName", "/word/numbering.xml");
    n.setAttribute(
      "ContentType",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml",
    );
    types.documentElement.appendChild(n);
  }
  if (
    commentsChanged &&
    !Array.from(types.documentElement.children).some(
      (n) => n.getAttribute("PartName") === "/word/comments.xml",
    )
  ) {
    const n = types.createElementNS(
      types.documentElement.namespaceURI,
      "Override",
    );
    n.setAttribute("PartName", "/word/comments.xml");
    n.setAttribute(
      "ContentType",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml",
    );
    types.documentElement.append(n);
  }
  for (const item of media) {
    zip.file("word/media/" + item.filename, item.data, { base64: true });
    const ext = item.filename.split(".").pop();
    if (
      !Array.from(types.documentElement.children).some(
        (n) => n.getAttribute("Extension") === ext,
      )
    ) {
      const n = types.createElementNS(
        types.documentElement.namespaceURI,
        "Default",
      );
      n.setAttribute("Extension", ext);
      n.setAttribute("ContentType", item.mime);
      types.documentElement.appendChild(n);
    }
  }
  zip.file("[Content_Types].xml", xml(types));
  return zip.generateAsync({
    type: "blob",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
  });
}
