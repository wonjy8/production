import { Extension, Mark } from "@tiptap/core";

export const Highlight = Mark.create({
  name: "highlight",
  addAttributes: () => ({
    color: {
      default: "#fff29a",
      parseHTML: (el) => el.style.backgroundColor || "#fff29a",
    },
  }),
  parseHTML: () => [{ tag: "mark:not([data-comment-id])" }],
  renderHTML: ({ mark }) => [
    "mark",
    { style: `background-color:${mark.attrs.color}` },
    0,
  ],
});
export const scripts = ["subscript", "superscript"].map((name) =>
  Mark.create({
    name,
    excludes: name === "subscript" ? "superscript" : "subscript",
    parseHTML: () => [{ tag: name === "subscript" ? "sub" : "sup" }],
    renderHTML: () => [name === "subscript" ? "sub" : "sup", 0],
  }),
);
export const editorAttributes = Extension.create({
  name: "editorAttributes",
  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: { docxFurniture: { default: null, rendered: false } },
      },
      {
        types: ["bulletList", "orderedList"],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: (el) => el.style.listStyleType || null,
            renderHTML: (a) =>
              a.listStyle ? { style: `list-style-type:${a.listStyle}` } : {},
          },
        },
      },
      {
        types: ["table"],
        attributes: {
          objectWidth: {
            default: null,
            parseHTML: (el) =>
              el.style.width.endsWith("%") ? parseFloat(el.style.width) : null,
            renderHTML: (a) =>
              a.objectWidth ? { style: `width:${a.objectWidth}%` } : {},
          },
          objectAlign: {
            default: "left",
            parseHTML: (el) => el.getAttribute("data-object-align") || "left",
            renderHTML: (a) => ({
              "data-object-align": a.objectAlign,
              style: `margin-left:${a.objectAlign === "left" ? "0" : "auto"};margin-right:${a.objectAlign === "right" ? "0" : "auto"}`,
            }),
          },
        },
      },
    ];
  },
});

// Tiptap's default TableView only updates columns; also keep object properties live.
import { TableView } from "@tiptap/extension-table";
export class DocumentTableView extends TableView {
  constructor(node: any, min: number, view: any, attributes: any) {
    super(node, min, view, attributes);
    this.syncObject(node);
  }
  update(node: any) {
    if (!super.update(node)) return false;
    this.syncObject(node);
    return true;
  }
  syncObject(node: any) {
    const align = node.attrs.objectAlign || "left";
    this.table.setAttribute("data-object-align", align);
    this.table.style.marginLeft = align === "left" ? "0" : "auto";
    this.table.style.marginRight = align === "right" ? "0" : "auto";
    if (node.attrs.objectWidth)
      this.table.style.width = node.attrs.objectWidth + "%";
  }
}
