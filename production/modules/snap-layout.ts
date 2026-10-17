// Canonical TypeScript implementation; ../snap-layout.js is a compatibility export.
import { isBlockLayout, blockBoxes, blockDropTarget, applyBlockDrop } from "../column-layout.js";
import { fluidBoxes, reorderItems } from "../fluid-layout.js";
export const moduleSpans = [3, 4, 6, 8, 9, 12];
export function snapSpan(value) {
  return moduleSpans.reduce(
    (best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best),
    3,
  );
}
export function moduleSpan(item) {
  if (item.kind === "divider") return 12;
  return snapSpan(item.span || ((item.width || 100) / 100) * 12);
}
export function snapBoxes(items, heights, width) {
  if (isBlockLayout(items)) return blockBoxes(items, heights, width);
  const boxes = {},
    columns = new Map(),
    roots = [];
  let offset = 0,
    section = [];
  for (const item of items) {
    if (item.kind === "divider" || !item.columnId) {
      roots.push({ item, members: [item] });
      continue;
    }
    let root = columns.get(item.columnId);
    if (!root) {
      root = { item, members: [] };
      columns.set(item.columnId, root);
      roots.push(root);
    }
    root.members.push(item);
  }
  const height = (i) => i.frameHeight || heights[i.id] || 220;
  const flush = () => {
    if (!section.length) return;
    const layout = fluidBoxes(
      section.map((root) => ({
        id: root.item.id,
        width:
          ((((width + 12) * moduleSpan(root.item)) / 12 - 12) / width) * 100,
        height: root.members.reduce((sum, i) => sum + height(i) + 12, -12),
      })),
      {},
      width,
      12,
    );
    for (const root of section) {
      const b = layout.boxes[root.item.id];
      let top = b.top + offset;
      for (const i of root.members) {
        boxes[i.id] = { left: b.left, top, width: b.width, height: height(i) };
        top += height(i) + 12;
      }
    }
    offset += layout.height;
    section = [];
  };
  for (const root of roots) {
    const item = root.item;
    if (root.members.some((i) => i.rowBreakBefore)) flush();
    if (item.kind === "divider") {
      flush();
      boxes[item.id] = { left: 0, top: offset, width, height: 32 };
      offset += 44;
    } else section.push(root);
    if (root.members.some((i) => i.rowBreakAfter)) flush();
  }
  flush();
  return { boxes, height: Math.max(80, offset) };
}
// Resolve against stationary cards using the pointer, never the dragged card's centre.
export function moduleDropTarget(items, boxes, id, x, y, width) {
  if (isBlockLayout(items)) return blockDropTarget(items, boxes, id, x, y, width);
  const candidates = items.filter((i) => i.id !== id && boxes[i.id]);
  if (!candidates.length) return null;
  const roots = candidates.filter((i) => i.kind !== "divider");
  const pool = roots.length ? roots : candidates;
  const distance = (i) => {
    const b = boxes[i.id];
    return Math.hypot(
      Math.max(b.left - x, 0, x - b.left - b.width),
      Math.max(b.top - y, 0, y - b.top - b.height),
    );
  };
  const target = pool.reduce((a, b) => (distance(a) <= distance(b) ? a : b)),
    b = boxes[target.id];
  const members = (i) =>
    i.columnId ? pool.filter((other) => other.columnId === i.columnId) : [i];
  const columnRoot = (i) =>
    members(i).reduce((a, c) => (boxes[a.id].top <= boxes[c.id].top ? a : c));
  const columnBox = (i) => {
    const list = members(i),
      r = boxes[columnRoot(i).id];
    return {
      ...r,
      height:
        Math.max(...list.map((c) => boxes[c.id].top + boxes[c.id].height)) -
        r.top,
    };
  };
  const root = columnRoot(target),
    rb = columnBox(target),
    rowRoots = [
      ...new Map(
        pool.map((i) => {
          const r = columnRoot(i);
          return [r.id, r];
        }),
      ).values(),
    ];
  const row = rowRoots
      .filter((i:any) => Math.abs(boxes[i.id].top - rb.top) < 3)
      .flatMap(members),
    top = rb.top,
    bottom = Math.max(...row.map((i) => boxes[i.id].top + boxes[i.id].height));
  const first = row.reduce((a, c) =>
      items.indexOf(a) < items.indexOf(c) ? a : c,
    ),
    last = row.reduce((a, c) => (items.indexOf(a) > items.indexOf(c) ? a : c));
  if (y <= top + 8 || target.kind === "divider")
    return {
      mode: "row-before",
      targetId: first.id,
      line: { left: 0, top: Math.max(0, top - 6), width, height: 3 },
      label: "이 줄 위에 놓기",
    };
  if (y >= bottom - 8)
    return {
      mode: "row-after",
      targetId: last.id,
      line: { left: 0, top: bottom + 6, width, height: 3 },
      label: "이 줄 아래에 놓기",
    };
  if (y < b.top + Math.min(72, b.height * 0.4))
    return {
      mode: "above",
      targetId: target.id,
      line: { left: b.left, top: b.top + 2, width: b.width, height: 3 },
      label: "이 모듈 위에 놓기",
    };
  const after = x > b.left + b.width / 2;
  return {
    mode: after ? "after" : "before",
    targetId: after ? members(target).at(-1).id : root.id,
    line: {
      left: after ? rb.left + rb.width + 4 : Math.max(0, rb.left - 6),
      top: rb.top,
      width: 3,
      height: rb.height,
    },
    label: after ? "이 모듈 뒤에 놓기" : "이 모듈 앞에 놓기",
  };
}
export function applyModuleDrop(items, id, target) {
  if (target?.mode === "block") return applyBlockDrop(items, id, target);
  const moving = items.find((i) => i.id === id),
    anchor = items.find((i) => i.id === target?.targetId);
  if (!moving || !anchor || id === anchor.id) return items;
  let others = items.filter((i) => i.id !== id),
    entry = { ...moving };
  delete entry.columnId;
  delete entry.rowBreakBefore;
  delete entry.rowBreakAfter;
  if (
    target.mode === "above" &&
    entry.kind !== "divider" &&
    anchor.kind !== "divider"
  ) {
    const columnId = anchor.columnId || crypto.randomUUID();
    entry = { ...entry, columnId, span: moduleSpan(anchor) };
    others = others.map((i) => (i.id === anchor.id ? { ...i, columnId } : i));
  } else if (target.mode.startsWith("row-")) {
    entry.rowBreakBefore = true;
    entry.rowBreakAfter = true;
  }
  let index = others.findIndex((i) => i.id === anchor.id);
  if (target.mode === "after" || target.mode === "row-after") index++;
  others.splice(index, 0, entry);
  return others.map((i) => {
    const { x, y, width, height, ...rest } = i;
    return rest;
  });
}
export function moveModule(items, id, direction) {
  const index = items.findIndex((i) => i.id === id),
    target = index + direction;
  if (
    index < 0 ||
    target < 0 ||
    target >= items.length ||
    (items[index].kind !== "divider" && items[target].kind === "divider")
  )
    return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function resizeSpan(box, dx, width) {
  return snapSpan(((box.width + dx + 12) / (width + 12)) * 12);
}
export function dropModule(items, boxes, id, x, y, placement) {
  if (placement) return applyModuleDrop(items, id, placement);
  const moving = items.find((i) => i.id === id);
  if (!moving) return items;
  if (moving.kind === "divider") {
    const others = items.filter((i) => i.id !== id),
      before = others.find((i) => {
        const box = boxes[i.id];
        return box && y < box.top + box.height / 2;
      });
    return reorderItems(items, id, before?.id).map((i) =>
      i.kind === "divider" ? { ...i, span: 12 } : i,
    );
  }
  const index = items.findIndex((i) => i.id === id),
    start =
      items
        .slice(0, index)
        .map((i) => i.kind)
        .lastIndexOf("divider") + 1,
    nextDivider = items.findIndex((i, n) => n > index && i.kind === "divider"),
    end = nextDivider < 0 ? items.length : nextDivider;
  const fresh = !boxes[id],
    others = (fresh ? items : items.slice(start, end)).filter(
      (i) => i.id !== id,
    );
  if (!others.length) return items;
  let target = others.find((i) => {
    const b = boxes[i.id];
    return (
      x >= b.left &&
      x <= b.left + b.width &&
      y >= b.top &&
      y <= b.top + b.height
    );
  });
  if (!target)
    target = others.reduce((a, b) => {
      const distance = (i) => {
        const r = boxes[i.id];
        return Math.hypot(
          x - (r.left + r.width / 2),
          y - (r.top + r.height / 2),
        );
      };
      return distance(a) < distance(b) ? a : b;
    });
  const r = boxes[target.id],
    full =
      r.width >
      Math.max(...Object.values(boxes).map((b:any) => b.left + b.width)) * 0.7,
    after = full ? y > r.top + r.height / 2 : x > r.left + r.width / 2;
  const before = after ? others[others.indexOf(target) + 1]?.id : target.id;
  return reorderItems(
    items,
    id,
    before || (fresh ? undefined : items[end]?.id),
  ).map((i) => {
    const { x, y, width, height, ...item } = i;
    return { ...item, span: moduleSpan(i) };
  });
}

export function resizeHeight(height, dy) {
  return Math.max(160, Math.round((height + dy) / 16) * 16);
}
