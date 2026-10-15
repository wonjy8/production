import { thumbnailBlob } from "./thumbnail-cache.js";
// Legacy reference cards share the same cache as the React galleries.
export function installThumbnailImages(root) {
  const tracked = new WeakMap(),
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const image = entry.target;
          observer.unobserve(image);
          if (!image.isConnected) continue;
          const state = tracked.get(image);
          thumbnailBlob({
            id: image.dataset.thumbnailId,
            updatedAt: image.dataset.thumbnailVersion || "",
          })
            .then((blob) => {
              if (!image.isConnected) return;
              state.url = URL.createObjectURL(blob);
              image.src = state.url;
            })
            .catch((error) => {
              image.title = error.message;
              image.alt = "썸네일을 불러오지 못했습니다.";
            });
        }
      },
      { rootMargin: "200px" },
    );
  function scan(node) {
    if (node.nodeType !== 1 && node !== root) return;
    const images = [
      ...(node.matches?.("img[data-thumbnail-id]") ? [node] : []),
      ...node.querySelectorAll("img[data-thumbnail-id]"),
    ];
    for (const image of images) {
      if (tracked.has(image)) continue;
      tracked.set(image, {});
      observer.observe(image);
    }
  }
  function dispose(node) {
    if (node.nodeType !== 1 || node.isConnected) return;
    for (const image of [
      node,
      ...node.querySelectorAll("img[data-thumbnail-id]"),
    ]) {
      const state = tracked.get(image);
      if (state?.url) URL.revokeObjectURL(state.url);
      observer.unobserve(image);
    }
  }
  scan(root);
  const changes = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(scan);
      record.removedNodes.forEach(dispose);
    }
  });
  changes.observe(root, { childList: true, subtree: true });
  return () => {
    changes.disconnect();
    observer.disconnect();
  };
}
