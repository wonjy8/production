// Hide the selected label as a unit when it cannot fit beside its icon.
const installed = new WeakSet();
function install(nav) {
  if (installed.has(nav)) return;
  installed.add(nav);
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  function size() {
    const buttons = [...nav.querySelectorAll(":scope > [data-main-space]")],
      active = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
    if (!active || !buttons.length) return;
    const label = active.querySelector("span"),
      style = getComputedStyle(active),
      ns = getComputedStyle(nav);
    if (!label || !ctx) return;
    ctx.font = getComputedStyle(label).font;
    const text = ctx.measureText(label.textContent).width,
      padding = 20,
      gap = parseFloat(ns.columnGap) || 0,
      grid = innerWidth <= 720,
      available = grid
        ? (nav.clientWidth - gap * (buttons.length - 1)) / buttons.length
        : nav.clientWidth -
          (buttons.length - 1) * 40 -
          gap * (buttons.length - 1);
    nav.classList.toggle(
      "nav-icons-only",
      available < 18 + padding + 7 + text + 2,
    );
  }
  new ResizeObserver(size).observe(nav);
  new MutationObserver(size).observe(nav, {
    attributes: true,
    attributeFilter: ["aria-pressed"],
    childList: true,
    subtree: true,
  });
  size();
}
const scan = () =>
  document.querySelectorAll(".sidebar-main-spaces").forEach(install);
new MutationObserver(scan).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
scan();
