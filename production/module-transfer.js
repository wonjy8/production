import { projectBoard, overviewBoardSection } from "./project-structure.js";
import { planningSnapshot, removePlanningModule } from "./planning-model.js";
export function transferModule(tabs, from, to, id) {
  const source = tabs.find((t) => t.id === from),
    destination = tabs.find((t) => t.id === to),
    module = source?.modules.find((m) => m.id === id);
  if (
    !module ||
    !destination ||
    from === to ||
    destination.modules.some((m) => m.id === id)
  )
    return tabs;
  const copy = { ...planningSnapshot(module, source.modules) };
  for (const key of ["columnId", "rowBreakBefore", "rowBreakAfter", "x", "y"])
    delete copy[key];
  return tabs.map((t) =>
    t.id === from
      ? { ...t, modules: removePlanningModule(t.modules, id) }
      : t.id === to
        ? { ...t, modules: [...t.modules, copy] }
        : t,
  );
}

export function transferOwnerModule(owner, kind, from, to, id) {
  let tabs = owner.customTabs || [],
    target = to;
  if (to.startsWith("board:")) {
    let section = to.slice(6);
    if (section === "projects") section = "overview";
    if (!["overview", "tasks", "schedule"].includes(section)) return owner;
    if (section === "overview") section = overviewBoardSection(owner, kind);
    const board = projectBoard(owner, kind, section);
    target = board.id;
    if (!tabs.some((t) => t.id === target)) tabs = [...tabs, board];
  }
  const next = transferModule(tabs, from, target, id);
  return next === tabs ? owner : { ...owner, customTabs: next };
}
