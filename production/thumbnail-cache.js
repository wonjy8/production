// Only derived images are persisted here. Original files keep their existing storage policy.
const CACHE = "production-thumbnails-v1",
  pending = new Map(),
  queue = [];
let running = 0,
  maintenance = Promise.resolve();
export function thumbnailScope() {
  return (
    location.origin +
    location.pathname +
    ":" +
    (window.appAccount?.id || "anonymous")
  );
}
export function thumbnailRevision(file) {
  return file.sha256 || file.fileSha256 || file.updatedAt || "";
}
export function thumbnailKey(file) {
  return thumbnailScope() + ":" + file.id + ":" + thumbnailRevision(file);
}
function limited(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    pump();
  });
}
function pump() {
  while (running < 2 && queue.length) {
    const item = queue.shift();
    running++;
    Promise.resolve()
      .then(item.task)
      .then(item.resolve, item.reject)
      .finally(() => {
        running--;
        pump();
      });
  }
}
async function cacheKey(key) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return new URL(
    "/__production_thumbnail__/" +
      Array.from(new Uint8Array(digest), (v) =>
        v.toString(16).padStart(2, "0"),
      ).join(""),
    location.origin,
  ).href;
}
let cacheRows,
  indexedAt = 0;
async function prune(cache, written, size) {
  const date = Date.now();
  cacheRows?.set(written, { key: written, size, date });
  const keys = await cache.keys();
  if (
    !cacheRows ||
    keys.length !== cacheRows.size ||
    date - indexedAt > 60000
  ) {
    const rows = await Promise.all(
      keys.map(async (key) => {
        const response = await cache.match(key);
        return {
          key: typeof key === "string" ? key : key.url,
          size: Number(response?.headers.get("Content-Length") || 0),
          date: Number(response?.headers.get("X-Thumbnail-Cached") || 0),
        };
      }),
    );
    cacheRows = new Map(rows.map((row) => [row.key, row]));
    indexedAt = date;
  }
  const rows = [...cacheRows.values()].sort((a, b) => a.date - b.date);
  let bytes = rows.reduce((n, row) => n + row.size, 0),
    count = rows.length;
  for (const row of rows) {
    if (
      bytes <= 64 * 1024 * 1024 &&
      count <= 400 &&
      date - row.date < 30 * 86400000
    )
      break;
    await cache.delete(row.key);
    cacheRows.delete(row.key);
    bytes -= row.size;
    count--;
  }
}
async function smallImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(Error("사진 불러오기 실패"));
      image.src = url;
    });
    const ratio = Math.min(
        1,
        640 / Math.max(image.naturalWidth, image.naturalHeight),
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(Error("썸네일 생성 실패"))),
        "image/webp",
        0.72,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function thumbnailBlob(file) {
  const key = thumbnailKey(file);
  if (pending.has(key)) return pending.get(key);
  const promise = limited(async () => {
    let cache, url;
    try {
      url = await cacheKey(key);
      cache = await caches.open(CACHE);
      const response = await cache.match(url);
      const maxAge = thumbnailRevision(file) ? 30 * 86400000 : 5 * 60000;
      if (
        response &&
        Date.now() - Number(response.headers.get("X-Thumbnail-Cached") || 0) <
          maxAge
      )
        return response.blob();
    } catch {
      /* Cache storage may be unavailable or full; display must still work. */
    }
    let blob;
    if (window.appAccount?.localMode) {
      const response = await fetch("/api/ref-files/" + file.id);
      if (!response.ok) throw Error("사진 불러오기 실패");
      blob = await smallImage(await response.blob());
    } else {
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch("/api/ref-files/" + file.id + "?thumbnail=1", {
          cache: "no-store",
        });
        if (response.status !== 503 || attempt === 2) break;
        await response.body?.cancel();
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (attempt + 1)),
        );
      }
      if (!response.ok || response.headers.get("X-Thumbnail") !== "v1") {
        await response.body?.cancel();
        throw Error(
          "썸네일을 사용할 수 없습니다. NAS 업데이트가 필요할 수 있습니다.",
        );
      }
      blob = await response.blob();
    }
    if (cache && url) {
      maintenance = maintenance
        .catch(() => {})
        .then(async () => {
          try {
            await cache.put(
              url,
              new Response(blob, {
                headers: {
                  "Content-Type": blob.type,
                  "Content-Length": String(blob.size),
                  "X-Thumbnail-Cached": String(Date.now()),
                },
              }),
            );
            await prune(cache, url, blob.size);
          } catch {}
        });
      await maintenance;
    }
    return blob;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
