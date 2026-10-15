export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export function documentFormat(file: any) {
  const ext = String(file.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return file.mime === DOCX_MIME || ext === "docx"
    ? "docx"
    : ["txt", "md", "markdown"].includes(ext || "")
      ? "text"
      : ["html", "htm"].includes(ext || "")
        ? "html"
        : file.mime === DOCX_MIME
          ? "docx"
          : file.mime === "text/plain"
            ? "text"
            : null;
}
