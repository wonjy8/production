import { loadDocumentTools } from "./load-document-tools";
import { storeFile, readFile } from "./files";
import { DOCX_MIME } from "./document-types";
export const noteFields = [
  { id: "category", label: "분류", type: "select" },
  { id: "date", label: "날짜", type: "date" },
  { id: "place", label: "장소", type: "text" },
  { id: "speaker", label: "설교자", type: "text" },
  { id: "scripture", label: "본문 구절", type: "text" },
];
async function responseJSON(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(
      response.status === 404
        ? "자료를 불러올 수 없습니다. NAS 서버를 최신 버전으로 업데이트하세요."
        : typeof data.detail === "string"
          ? data.detail
          : data.error || "자료를 저장하지 못했습니다.",
    );
  return data;
}
export async function listResources(includePurged=false) {
  return responseJSON(
    await fetch("/api/database/resources"+(includePurged?"?includePurged=1":""), { cache: "no-store" }),
  );
}
export async function saveResource(row: any) {
  const result = await responseJSON(
    await fetch("/api/database/resources/" + row.id, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "If-Match": '"' + (row.version || 0) + '"',
      },
      body: JSON.stringify(row),
    }),
  );
  window.dispatchEvent(new Event("resources-changed"));
  return result;
}
export function resourceFile(row: any) {
  if (row.kind === "text")
    return {
      id: row.id,
      resourceId:row.id,
      name: row.title,
      kind: "text",
      text: row.content || "",
    };
  const suffix =
    extension(row.mime) ||
    (row.filename || "").match(/\.[a-z0-9]{1,8}$/i)?.[0] ||
    "";
  return {
    id: row.fileId || row.id,
    resourceId:row.id,
    name:
      row.title +
      (row.fileId &&
      suffix &&
      !row.title.toLowerCase().endsWith(suffix.toLowerCase())
        ? suffix
        : ""),
    kind: row.fileId ? "file" : "link",
    mime: row.mime || "",
    sha256: row.sha256 || "",
    size: row.size || 0,
    ...(!row.fileId ? { url: row.url } : {}),
  };
}
function extension(mime: string) {
  return mime === DOCX_MIME
    ? ".docx"
    : (
        {
          "application/pdf": ".pdf",
          "image/jpeg": ".jpg",
          "image/png": ".png",
          "image/webp": ".webp",
          "video/mp4": ".mp4",
          "text/plain": ".txt",
        } as any
      )[mime] || "";
}
export async function addResourceFile(file: File, metadata: any = {}) {
  const id = crypto.randomUUID();
  await storeFile(id, file, { reference: true });
  return saveResource({
    id,
    fileId: id,
    filename: file.name,
    title: metadata.title || file.name,
    mime: file.type,
    kind: file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : "file",
    tags: metadata.tags || [],
    properties: metadata.properties || {},
    propertyLabels: metadata.propertyLabels || {},
    version: 0,
  });
}
export async function createNote(metadata: any) {
  const { saveDocument } = await loadDocumentTools();
  const blob = await saveDocument(
    {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: metadata.title }],
        },
        ...(metadata.content || "")
          .split(/\r?\n/)
          .map((text: string) => ({
            type: "paragraph",
            ...(text ? { content: [{ type: "text", text }] } : {}),
          })),
      ],
    },
    "docx",
    null,
    "",
    "",
  );
  return addResourceFile(
    new File([blob], metadata.title.replace(/[\\/\r\n]/g, " ") + ".docx", {
      type: DOCX_MIME,
    }),
    metadata,
  );
}
export async function copyResource(row: any) {
  if (row.kind === "text")
    return createNote({ ...row, title: row.title + " 사본" });
  if (!row.fileId)
    throw Error(
      "외부 링크는 연결하여 사용하세요. 파일과 텍스트는 사본으로 추가할 수 있습니다.",
    );
  const file = resourceFile(row),
    blob = await readFile(row.fileId);
  return addResourceFile(new File([blob], file.name, { type: row.mime }), {
    ...row,
    title: row.title + " 사본",
  });
}
