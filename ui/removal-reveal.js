// One frame-batched pointer observer per UI root, including workspace ShadowRoots.
export function installRemovalReveal(root) {
  let frame = 0,
    point = null,
    shown = new Set();
  const clear = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    point = null;
    shown.forEach((b) => b.classList.remove("remove-near"));
    shown.clear();
  };
  const measure = () => {
    frame = 0;
    if (!point) return;
    const next = new Set();
    root
      .querySelectorAll(
        ".compact-remove,.context-remove,[data-removal-reveal=true]",
      )
      .forEach((b) => {
        const r = b.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dx = Math.max(r.left - point.x, 0, point.x - r.right),
          dy = Math.max(r.top - point.y, 0, point.y - r.bottom);
        if (Math.hypot(dx, dy) <= 20) {
          next.add(b);
          if (!shown.has(b)) b.classList.add("remove-near");
        }
      });
    shown.forEach((b) => {
      if (!next.has(b)) b.classList.remove("remove-near");
    });
    shown = next;
  };
  const schedule = () => {
    if (point && !frame) frame = requestAnimationFrame(measure);
  };
  const move = (e) => {
    if (e.pointerType === "touch") return;
    point = { x: e.clientX, y: e.clientY };
    schedule();
  };
  window.addEventListener("pointermove", move, { passive: true });
  root.addEventListener("pointerleave", clear);
  root.addEventListener("scroll", schedule, true);
  window.addEventListener("blur", clear);
  return () => {
    clear();
    window.removeEventListener("pointermove", move);
    root.removeEventListener("pointerleave", clear);
    root.removeEventListener("scroll", schedule, true);
    window.removeEventListener("blur", clear);
  };
}
