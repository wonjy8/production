export function resizeModuleSpans(span, neighborSpan, delta, side = "right") {
  const desired = Math.round(span + delta * (side === "left" ? -1 : 1));
  const max = neighborSpan == null ? 12 : span + neighborSpan - 3;
  const next = Math.max(3, Math.min(max, desired));
  return {
    span: next,
    neighborSpan: neighborSpan == null ? null : span + neighborSpan - next,
  };
}
export function adjacentModule(id, side, boxes) {
  const own = boxes.find((b) => b.id === id);
  if (!own) return null;
  return (
    boxes.find(
      (b) =>
        b.id !== id &&
        Math.abs(b.rect.top - own.rect.top) < 2 &&
        (side === "right"
          ? b.rect.left >= own.rect.right - 1 &&
            b.rect.left - own.rect.right <= 32
          : b.rect.right <= own.rect.left + 1 &&
            own.rect.left - b.rect.right <= 32),
    )?.id || null
  );
}

// Compare the pointer's unrounded height so even short content can regain auto sizing.
export function contentHeightResize(
  startHeight,
  delta,
  naturalHeight,
  latched = false,
) {
  const desired = startHeight + delta;
  const auto =
    Number.isFinite(naturalHeight) &&
    naturalHeight > 0 &&
    Math.abs(desired - naturalHeight) <= (latched ? 26 : 14);
  return {
    auto,
    height: auto ? naturalHeight : Math.max(160, Math.round(desired / 16) * 16),
  };
}
export function naturalModuleHeight(element) {
  if (!element) return 0;
  const fixed = element.classList.contains("module-fixed-height"),
    height = element.style.height;
  if (fixed) {
    element.classList.remove("module-fixed-height");
    element.style.height = "";
  }
  const result = element.getBoundingClientRect().height;
  if (fixed) {
    element.classList.add("module-fixed-height");
    element.style.height = height;
  }
  return result;
}
