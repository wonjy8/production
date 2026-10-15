import { useEffect } from "react";

// Delegation also covers menus mounted after the editor opens.
export function useEditorScrollbars() {
  useEffect(() => {
    const root = document.querySelector(".document-editor");
    if (!root) return;
    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const reveal = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const area = target.closest<HTMLElement>(
        ".document-scroll, .document-settings-body, .editor-format-popup, .document-outline nav, .table-size-menu",
      );
      if (!area || !root.contains(area)) return;
      clearTimeout(timers.get(area));
      area.classList.add("editor-scroll-active");
      timers.set(
        area,
        setTimeout(() => {
          area.classList.remove("editor-scroll-active");
          timers.delete(area);
        }, 1000),
      );
    };
    root.addEventListener("scroll", reveal, true);
    root.addEventListener("pointermove", reveal, { passive: true });
    root.addEventListener("focusin", reveal);
    return () => {
      root.removeEventListener("scroll", reveal, true);
      root.removeEventListener("pointermove", reveal);
      root.removeEventListener("focusin", reveal);
      timers.forEach((timer, area) => {
        clearTimeout(timer);
        area.classList.remove("editor-scroll-active");
      });
    };
  }, []);
}
