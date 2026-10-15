import { contentHeightResize, naturalModuleHeight } from "./module-resize.js";
import { delayedPointerDrag } from "../ui/touch-drag.js";
import { useRef, useState, useEffect, useLayoutEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import { createAutoScroller } from "./auto-scroll.js";
import {
  snapBoxes,
  moduleSpan,
  moduleSpans,
  resizeSpan,
  resizeHeight,
  dropModule,
  moduleDropTarget,
} from "./snap-layout.js";
export function SnapCanvas({
  items,
  onChange,
  renderItem,
  className = "",
  onTemplateDrop,
  currentTabId,
  onTransfer,
}: {
  currentTabId?: string;
  onTransfer?: (id: string, toTab: string) => void;
  items: any[];
  onChange: (fn: any) => void;
  renderItem: (item: any, index: number, drag: any) => any;
  className?: string;
  onTemplateDrop?: (
    id: string,
    point: { x: number; y: number },
    boxes: any,
  ) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null),
    gesture = useRef<any>(null),
    autoScroll = useRef<any>(null),
    latestMove = useRef<any>(null),
    moveFrame = useRef(0),
    pendingMove = useRef<any>(null),
    [metrics, setMetrics] = useState<any>({ width: 1000, heights: {} }),
    [preview, setPreview] = useState<any>(null),
    [externalDrop, setExternalDrop] = useState(false),
    [dropTarget, setDropTarget] = useState<any>(null),
    [tabTarget, setTabTarget] = useState<any>(null),
    [nearby, setNearby] = useState("");
  useEffect(() => {
    const stop = () => {
      autoScroll.current?.stop();
      cancelAnimationFrame(moveFrame.current);
      moveFrame.current = 0;
      pendingMove.current = null;
      autoScroll.current = null;
      const g = gesture.current;
      gesture.current = null;
      if (g?.target.hasPointerCapture?.(g.pointerId))
        g.target.releasePointerCapture(g.pointerId);
      setPreview(null);
      setDropTarget(null);
      setTabTarget(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gesture.current) {
        e.preventDefault();
        e.stopPropagation();
        stop();
      }
    };
    window.addEventListener("blur", stop);
    window.addEventListener("keydown", escape);
    return () => {
      autoScroll.current?.stop();
      cancelAnimationFrame(moveFrame.current);
      window.removeEventListener("blur", stop);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  useLayoutEffect(() => {
    const node = canvas.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    let frame = 0,
      resizeTimer: any;
    let previousWidth = node.clientWidth;
    const measure = () => {
      frame = 0;
      if (!node.clientWidth) return;
      if (previousWidth !== node.clientWidth) {
        node.classList.add("canvas-width-changing");
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(
          () => node.classList.remove("canvas-width-changing"),
          220,
        );
        previousWidth = node.clientWidth;
      }
      const heights: any = {},
        naturalHeights: any = {};
      node
        .querySelectorAll<HTMLElement>(":scope > [data-fluid-id]")
        .forEach((el) => {
          heights[el.dataset.fluidId!] = el.getBoundingClientRect().height;
          naturalHeights[el.dataset.fluidId!] = naturalModuleHeight(el);
        });
      mutations.takeRecords();
      setMetrics((old: any) =>
        old.width === node.clientWidth &&
        JSON.stringify(old.heights) === JSON.stringify(heights) &&
        JSON.stringify(old.naturalHeights) === JSON.stringify(naturalHeights)
          ? old
          : { width: node.clientWidth, heights, naturalHeights },
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // Commit the new packing before paint, together with the container resize.
    const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = 0;
        flushSync(measure);
      }),
      mutations = new MutationObserver(schedule);
    observer.observe(node);
    node
      .querySelectorAll(":scope > [data-fluid-id]")
      .forEach((el) => observer.observe(el));
    mutations.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "src", "width", "height"],
    });
    node.addEventListener("load", schedule, true);
    measure();
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
      node.classList.remove("canvas-width-changing");
      mutations.disconnect();
      cancelAnimationFrame(frame);
      node.removeEventListener("load", schedule, true);
    };
  }, [items.map((i) => i.id).join("|")]);
  const sizingPreview = preview?.kind.startsWith("resize") ? preview : null;
  const effective = useMemo(
      () =>
        items.map((i) => ({
          ...i,
          span:
            (preview?.id === i.id ||
              (i.columnId &&
                items.find((item) => item.id === preview?.id)?.columnId ===
                  i.columnId)) &&
            preview?.kind.startsWith("resize") &&
            preview.span
              ? preview.span
              : moduleSpan(i),
          frameHeight:
            preview?.id === i.id && preview.autoHeight
              ? undefined
              : preview?.id === i.id && preview.height
                ? preview.height
                : i.frameHeight,
        })),
      [items, sizingPreview],
    ),
    layout = useMemo(
      () => snapBoxes(effective, metrics.heights, metrics.width),
      [effective, metrics.heights, metrics.width],
    );
  function down(e: any, id: string, kind: string) {
    if (
      e.button !== 0 ||
      e.isPrimary === false ||
      (kind === "move" &&
        e.target.closest("button,input,select,textarea,a") &&
        !e.target.closest(".module-name-button"))
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    gesture.current = {
      id,
      kind,
      pointerId: e.pointerId,
      target: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      box: layout.boxes[id],
      changed: false,
      span: moduleSpan(items.find((i) => i.id === id)),
      height: layout.boxes[id].height,
      startCanvas: canvas.current?.getBoundingClientRect(),
    };
    autoScroll.current?.stop();
    autoScroll.current = canvas.current
      ? createAutoScroller(canvas.current, (p) =>
          latestMove.current?.({
            pointerId: gesture.current?.pointerId,
            clientX: p.x,
            clientY: p.y,
            automatic: true,
            preventDefault() {},
          }),
        )
      : null;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e: any) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const rect = canvas.current?.getBoundingClientRect(),
      dx =
        e.clientX -
        g.startX +
        (g.startCanvas && rect ? g.startCanvas.left - rect.left : 0),
      dy =
        e.clientY -
        g.startY +
        (g.startCanvas && rect ? g.startCanvas.top - rect.top : 0);
    if (!g.changed && Math.hypot(dx, dy) < 5) return;
    g.changed = true;
    if (!e.automatic)
      autoScroll.current?.update({ x: e.clientX, y: e.clientY });
    if (g.kind.startsWith("resize")) {
      if (g.kind !== "resize-height")
        g.span = resizeSpan(g.box, dx, metrics.width);
      if (g.kind !== "resize") {
        const node = canvas.current?.querySelector<HTMLElement>(
            '[data-fluid-id="' + g.id + '"]',
          ),
          natural = node
            ? naturalModuleHeight(node)
            : metrics.naturalHeights?.[g.id],
          next = contentHeightResize(g.box.height, dy, natural, g.autoHeight);
        g.height = next.height;
        g.autoHeight = next.auto;
      }
      setPreview({
        id: g.id,
        kind: g.kind,
        span: g.span,
        ...(g.kind !== "resize"
          ? { height: g.height, autoHeight: g.autoHeight }
          : {}),
      });
    } else {
      const root = canvas.current?.getRootNode() as any,
        hit = root
          ?.elementFromPoint?.(e.clientX, e.clientY)
          ?.closest("[data-module-tab-target]");
      const destination =
        onTransfer &&
        hit?.getAttribute("aria-current") !== "page" &&
        hit?.dataset.moduleTabTarget &&
        hit.dataset.moduleTabTarget !== currentTabId
          ? hit
          : null;
      g.toTab = destination?.dataset.moduleTabTarget || null;
      setTabTarget(
        destination
          ? {
              name: destination.textContent.trim(),
              left: destination.getBoundingClientRect().left,
              top: destination.getBoundingClientRect().top,
              width: destination.getBoundingClientRect().width,
              height: destination.getBoundingClientRect().height,
            }
          : null,
      );
      g.point = { x: e.clientX - rect!.left, y: e.clientY - rect!.top };
      g.dropTarget = moduleDropTarget(
        items,
        layout.boxes,
        g.id,
        g.point.x,
        g.point.y,
        metrics.width,
      );
      setDropTarget(g.toTab ? null : g.dropTarget);
      setPreview({
        id: g.id,
        kind: g.kind,
        left: Math.max(
          0,
          Math.min(metrics.width - g.box.width, g.box.left + dx),
        ),
        top: Math.max(0, g.box.top + dy),
      });
    }
    e.preventDefault();
  }
  function queueMove(e: any) {
    if (!gesture.current) return;
    if (gesture.current.kind !== "move") {
      move(e);
      return;
    }
    e.preventDefault();
    pendingMove.current = {
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      automatic: e.automatic,
      preventDefault() {},
    };
    if (!moveFrame.current)
      moveFrame.current = requestAnimationFrame(() => {
        moveFrame.current = 0;
        const p = pendingMove.current;
        pendingMove.current = null;
        if (p) move(p);
      });
  }
  latestMove.current = queueMove;
  function up(e: any, cancel = false) {
    const g = gesture.current;
    if (!g || (e.pointerId != null && e.pointerId !== g.pointerId)) return;
    cancelAnimationFrame(moveFrame.current);
    moveFrame.current = 0;
    const point = pendingMove.current;
    pendingMove.current = null;
    if (point && !cancel) move(point);
    gesture.current = null;
    autoScroll.current?.stop();
    autoScroll.current = null;
    if (g.target.hasPointerCapture?.(g.pointerId))
      g.target.releasePointerCapture(g.pointerId);
    if (g.changed && !cancel && g.toTab && onTransfer) {
      onTransfer(g.id, g.toTab);
      setPreview(null);
      setDropTarget(null);
      setTabTarget(null);
      return;
    }
    if (g.changed && !cancel)
      onChange((old: any[]) =>
        g.kind.startsWith("resize")
          ? old.map((item) => {
              if (item.id !== g.id) {
                const moving = old.find((i) => i.id === g.id);
                return g.kind !== "resize-height" &&
                  moving?.columnId &&
                  item.columnId === moving.columnId
                  ? { ...item, span: g.span }
                  : item;
              }
              const { x, y, width, height, span, ...i } = item;
              if (g.kind !== "resize") delete i.frameHeight;
              return {
                ...i,
                ...(g.span !== 12 ? { span: g.span } : {}),
                ...(g.kind !== "resize" && !g.autoHeight
                  ? { frameHeight: g.height }
                  : {}),
              };
            })
          : dropModule(
              old,
              layout.boxes,
              g.id,
              g.point.x,
              g.point.y,
              g.dropTarget,
            ),
      );
    setPreview(null);
    setDropTarget(null);
    setTabTarget(null);
  }
  function keys(e: any, i: any) {
    if (e.key === "Home") {
      e.preventDefault();
      onChange((old: any[]) =>
        old.map((item) => {
          if (item.id !== i.id) return item;
          const { frameHeight, ...rest } = item;
          return rest;
        }),
      );
      return;
    }
    if (e.key === "Escape") {
      up(e, true);
      return;
    }
    if (["ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const next = contentHeightResize(
        layout.boxes[i.id].height,
        e.key === "ArrowDown" ? 16 : -16,
        metrics.naturalHeights?.[i.id],
      );
      onChange((old: any[]) =>
        old.map((item) => {
          if (item.id !== i.id) return item;
          const { frameHeight, ...rest } = item;
          return next.auto ? rest : { ...rest, frameHeight: next.height };
        }),
      );
      return;
    }
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const index = moduleSpans.indexOf(moduleSpan(i)),
      span =
        moduleSpans[
          Math.max(
            0,
            Math.min(
              moduleSpans.length - 1,
              index + (e.key === "ArrowRight" ? 1 : -1),
            ),
          )
        ];
    onChange((old: any[]) =>
      old.map((oldItem) => {
        const { x, y, width, height, ...item } = oldItem;
        return {
          ...item,
          span:
            item.id === i.id || (i.columnId && item.columnId === i.columnId)
              ? span
              : moduleSpan(oldItem),
        };
      }),
    );
  }
  function proximity(e: any) {
    if (e.pointerType === "touch") return;
    let found = "";
    let best = Infinity;
    canvas.current
      ?.querySelectorAll<HTMLElement>(":scope > [data-fluid-id]")
      .forEach((el) => {
        const r = el.getBoundingClientRect(),
          dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right),
          dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom),
          distance = Math.hypot(dx, dy);
        if (distance <= 16 && distance < best) {
          found = el.dataset.fluidId!;
          best = distance;
        }
      });
    setNearby((old) => (old === found ? old : found));
  }
  useEffect(() => {
    let frame = 0,
      point: PointerEvent | null = null;
    const track = (e: PointerEvent) => {
      point = e;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (point) proximity(point);
        });
    };
    const clear = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      point = null;
      setNearby("");
    };
    window.addEventListener("pointermove", track, { passive: true });
    window.addEventListener("blur", clear);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", track);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return (
    <div
      ref={canvas}

      className={
        "fluid-canvas snap-canvas " +
        className +
        (externalDrop ? " hub-drop-active" : "")
      }
      onDragOver={(e) => {
        if (
          onTemplateDrop &&
          e.dataTransfer.types.includes("application/x-module-template")
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setExternalDrop(true);
          const r = e.currentTarget.getBoundingClientRect();
          setDropTarget(
            moduleDropTarget(
              items,
              layout.boxes,
              "",
              e.clientX - r.left,
              e.clientY - r.top,
              metrics.width,
            ),
          );
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setExternalDrop(false);
          setDropTarget(null);
          setTabTarget(null);
        }
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData("application/x-module-template");
        if (!id || !onTemplateDrop) return;
        e.preventDefault();
        e.stopPropagation();
        setExternalDrop(false);
        setDropTarget(null);
        setTabTarget(null);
        const rect = e.currentTarget.getBoundingClientRect();
        onTemplateDrop(
          id,
          {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            placement: moduleDropTarget(
              items,
              layout.boxes,
              "",
              e.clientX - rect.left,
              e.clientY - rect.top,
              metrics.width,
            ),
          } as any,
          layout.boxes,
        );
      }}
      style={{
        minHeight: onTemplateDrop ? 160 : undefined,
        height: Math.max(
          layout.height,
          preview?.kind === "move"
            ? preview.top + (layout.boxes[preview.id]?.height || 220) + 12
            : 0,
          externalDrop ? 180 : 0,
        ),
      }}
    >
      {tabTarget && (
        <div
          className="module-tab-transfer-target"
          role="status"
          aria-label={tabTarget.name + " 탭으로 이동"}
          style={{
            position: "fixed",
            left: tabTarget.left,
            top: tabTarget.top,
            width: tabTarget.width,
            height: tabTarget.height,
          }}
        >
          <span>{tabTarget.name} 탭으로 이동</span>
        </div>
      )}
      {dropTarget && (
        <div
          className="module-insertion-line"
          role="status"
          aria-label={dropTarget.label}
          data-drop-mode={dropTarget.mode}
          style={dropTarget.line}
        >
          <span>{dropTarget.label}</span>
        </div>
      )}
      {effective.map((i, index) => {
        const b = layout.boxes[i.id],
          moving = preview?.id === i.id && preview.kind === "move",
          drag = delayedPointerDrag({
            onPointerDown: (e: any) => down(e, i.id, "move"),
            onPointerMove: queueMove,
            onPointerUp: (e: any) => up(e),
            onPointerCancel: (e: any) => up(e, true),
            onLostPointerCapture: (e: any) => {
              if (gesture.current) up(e, true);
            },
          });
        return (
          <div
            key={i.id}
            data-fluid-id={i.id}
            data-module-near={nearby === i.id ? "true" : undefined}
            data-height-mode={i.frameHeight ? "fixed" : "auto"}
            className={
              "fluid-box " +
              (preview?.id === i.id ? "fluid-active" : "") +
              (moving ? " module-moving" : "") +
              (i.kind === "divider" ? " divider-box" : "") +
              (i.frameHeight && i.kind !== "divider"
                ? " module-fixed-height"
                : "")
            }
            style={{
              left:
                ((moving ? preview.left : b.left) / metrics.width) * 100 + "%",
              top: moving ? preview.top : b.top,
              width: (b.width / metrics.width) * 100 + "%",
              height: i.kind === "divider" ? 32 : i.frameHeight || undefined,
              zIndex: moving ? 9 : undefined,
            }}
          >
            {renderItem(i, index, drag)}
            {i.kind !== "divider" && (
              <>
                <div
                  className="fluid-resize-edge"
                  role="separator"
                  tabIndex={0}
                  aria-label="모듈 크기 단계 조절"
                  aria-orientation="vertical"
                  onPointerDown={(e) => down(e, i.id, "resize")}
                  onPointerMove={queueMove}
                  onPointerUp={(e) => up(e)}
                  onPointerCancel={(e) => up(e, true)}
                  onLostPointerCapture={(e) => {
                    if (gesture.current) up(e, true);
                  }}
                  onKeyDown={(e) => keys(e, i)}
                />
                <div
                  className="module-resize-bottom"
                  role="separator"
                  tabIndex={0}
                  aria-label="모듈 높이 조절"
                  title="드래그로 높이 조절 · 더블클릭 또는 Home으로 콘텐츠 맞춤"
                  onDoubleClick={() =>
                    onChange((old: any[]) =>
                      old.map((item) => {
                        if (item.id !== i.id) return item;
                        const { frameHeight, ...rest } = item;
                        return rest;
                      }),
                    )
                  }
                  aria-orientation="horizontal"
                  onPointerDown={(e) => down(e, i.id, "resize-height")}
                  onPointerMove={queueMove}
                  onPointerUp={(e) => up(e)}
                  onPointerCancel={(e) => up(e, true)}
                  onLostPointerCapture={(e) => {
                    if (gesture.current) up(e, true);
                  }}
                  onKeyDown={(e) => keys(e, i)}
                />
                <div
                  className="module-resize-corner"
                  role="button"
                  tabIndex={0}
                  aria-label="모듈 너비와 높이 조절"
                  onPointerDown={(e) => down(e, i.id, "resize-corner")}
                  onPointerMove={queueMove}
                  onPointerUp={(e) => up(e)}
                  onPointerCancel={(e) => up(e, true)}
                  onLostPointerCapture={(e) => {
                    if (gesture.current) up(e, true);
                  }}
                  onKeyDown={(e) => keys(e, i)}
                />
              </>
            )}
            {preview?.id === i.id && preview.kind.startsWith("resize") && (
              <span className="snap-size-label">
                {Math.round((preview.span / 12) * 100)}%
                {preview.autoHeight
                  ? " · 콘텐츠 맞춤"
                  : preview.height
                    ? ` · ${Math.round(preview.height)}px`
                    : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
