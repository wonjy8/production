import { renderPhoto } from "./photo-model.js";
import { thumbnailBlob, thumbnailKey } from "./thumbnail-cache.js";
const originals = new Map(),
  previews = new Map(),
  pending = new Map();
export function photoKey(file, fullSize = false) {
  return (
    thumbnailKey(file) +
    "|" +
    (fullSize ? "original" : "thumbnail") +
    "|" +
    JSON.stringify(file.photoEdit || null)
  );
}
export function cachedPhoto(file, fullSize = false) {
  const key = photoKey(file, fullSize),
    value = previews.get(key);
  if (value && Date.now() - value.created < 5 * 60000) {
    previews.delete(key);
    previews.set(key, value);
    return value;
  }
}
async function original(file, fullSize) {
  const key = thumbnailKey(file) + "|" + fullSize;
  const existing = originals.get(key);
  if (existing && Date.now() - existing.created < 5 * 60000)
    return existing.promise;
  const promise = (async () => {
    const blob = fullSize
        ? await fetch("/api/ref-files/" + file.id).then((r) => {
            if (!r.ok) throw Error("사진 불러오기 실패");
            return r.blob();
          })
        : await thumbnailBlob(file),
      url = URL.createObjectURL(blob),
      image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(Error("사진 불러오기 실패"));
        image.src = url;
      });
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  })();
  if (!fullSize) originals.set(key, { promise, created: Date.now() });
  while (originals.size > 4) originals.delete(originals.keys().next().value);
  promise.catch(() => originals.delete(key));
  return promise;
}
export async function preparePhoto(file, fullSize = false) {
  const key = photoKey(file, fullSize),
    cached = cachedPhoto(file, fullSize);
  if (cached) return cached;
  if (pending.has(key)) return pending.get(key);
  const promise = original(file, fullSize)
    .then(async (image) => {
      const canvas = document.createElement("canvas"),
        size = renderPhoto(
          canvas,
          image,
          file.photoEdit,
          fullSize ? 1600 : 640,
        ),
        blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/webp", fullSize ? 0.9 : 0.8),
        );
      if (!blob) throw Error("사진 미리보기 실패");
      const value = {
        url: URL.createObjectURL(blob),
        ...size,
        blob: true,
        created: Date.now(),
      };
      previews.set(key, value);
      while (
        previews.size > 40 ||
        [...previews.values()].reduce((n, v) => n + v.width * v.height, 0) >
          12_000_000
      ) {
        const oldKey = previews.keys().next().value,
          old = previews.get(oldKey);
        URL.revokeObjectURL(old.url);
        previews.delete(oldKey);
      }
      pending.delete(key);
      return value;
    })
    .catch((e) => {
      pending.delete(key);
      throw e;
    });
  pending.set(key, promise);
  return promise;
}
export function prefetchPhotos(files) {
  return Promise.allSettled(
    files.filter(Boolean).map((file) => preparePhoto(file)),
  );
}
