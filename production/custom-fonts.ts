import { listResources, saveResource, addResourceFile } from "./resources";
import { readFile } from "./files";
import { loadDocumentPDF } from "./load-document-tools";
export type CustomFont = {
  id: string;
  family: string;
  weight: string;
  style: string;
  row: any;
};
let fonts: CustomFont[] = [];
const loaded = new Map<string, FontFace>();
const loading = new Map<string, Promise<FontFace>>();
export function usedFontFamilies(root: Element | null) {
  return Array.from(
    root?.querySelectorAll<HTMLElement>('[style*="font-family"]') || [],
  ).map((el) =>
    el.style.fontFamily
      .split(",")[0]
      .replace(/^["']|["']$/g, "")
      .trim(),
  );
}
const buffers = new Map<string, Promise<ArrayBuffer>>();
export function customFontBytes(font: CustomFont) {
  if (!buffers.has(font.id))
    buffers.set(
      font.id,
      readFile(font.row.fileId)
        .then((blob) => blob.arrayBuffer())
        .catch((e) => {
          buffers.delete(font.id);
          throw e;
        }),
    );
  return buffers.get(font.id)!;
}
export function currentCustomFonts() {
  return fonts;
}
export async function refreshCustomFonts() {
  const rows = await listResources();
  fonts = rows
    .filter((r: any) => !r.deleted && r.properties?.documentFont === "true")
    .map((row: any) => ({
      id: row.id,
      family: row.properties.family,
      weight: row.properties.weight || "400",
      style: row.properties.style || "normal",
      row,
    }));
  return fonts;
}
export async function loadCustomFont(font: CustomFont) {
  if (loaded.has(font.id)) return loaded.get(font.id)!;
  if (!loading.has(font.id))
    loading.set(
      font.id,
      (async () => {
        const face = new FontFace(font.family, await customFontBytes(font), {
          weight: font.weight,
          style: font.style,
        });
        await face.load();
        for (const [id, old] of loaded)
          if (
            id !== font.id &&
            old.family === font.family &&
            old.weight === font.weight &&
            old.style === font.style
          ) {
            document.fonts.delete(old);
            loaded.delete(id);
            buffers.delete(id);
          }
        document.fonts.add(face);
        loaded.set(font.id, face);
        return face;
      })().finally(() => loading.delete(font.id)),
    );
  return loading.get(font.id)!;
}
export async function prepareCustomFonts(families: string[] = []) {
  const rows = await refreshCustomFonts();
  await Promise.all(
    rows.filter((row) => families.includes(row.family)).map(loadCustomFont),
  );
  return rows;
}
export async function addCustomFont(file: File) {
  if (!/\.(ttf|otf)$/i.test(file.name) || file.size > 12 * 1024 * 1024)
    throw Error("TTF 또는 OTF 파일을 12MB 이하로 선택하세요.");
  const pdf = await loadDocumentPDF(),
    info = await pdf.inspectFont(await file.arrayBuffer());
  if (
    !info.family ||
    info.family.length > 100 ||
    /[<>"\\\n{};]/.test(info.family)
  )
    throw Error("이 글꼴의 이름을 사용할 수 없습니다.");
  const face = new FontFace(info.family, await file.arrayBuffer(), {
    weight: info.weight,
    style: info.style,
  });
  await face.load();
  await refreshCustomFonts();
  if (
    fonts.some(
      (f) =>
        f.family === info.family &&
        f.weight === info.weight &&
        f.style === info.style,
    )
  )
    throw Error("같은 글꼴과 스타일이 이미 추가되어 있습니다.");
  await addResourceFile(file, {
    title: info.family,
    properties: { documentFont: "true", ...info },
    tags: ["문서 글꼴"],
  });
  await refreshCustomFonts();
  notify();
}
export async function removeCustomFont(font: CustomFont) {
  const rows = await listResources(),
    row = rows.find((r: any) => r.id === font.id);
  if (!row) throw Error("글꼴을 찾을 수 없습니다.");
  await saveResource({ ...row, deleted: true });
  // Keep existing loaded faces for open documents. Removal affects new documents, never their saved text.
  await refreshCustomFonts();
  notify();
}
function notify() {
  window.dispatchEvent(new Event("document-fonts-changed"));
  if (typeof BroadcastChannel === "function") {
    const channel = new BroadcastChannel(channelName());
    channel.postMessage("changed");
    channel.close();
  }
}
function channelName() {
  return (
    "production-document-fonts:" +
    location.pathname +
    ":" +
    ((window as any).appAccount?.id || "local")
  );
}
export function watchCustomFonts(callback: () => void) {
  const update = () => callback();
  window.addEventListener("document-fonts-changed", update);
  const channel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel(channelName())
      : null;
  if (channel) channel.onmessage = update;
  return () => {
    window.removeEventListener("document-fonts-changed", update);
    channel?.close();
  };
}
