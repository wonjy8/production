import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { observeUI } from "../ui/decorate.js";
import { listResources, saveResource } from "./resources";
import { resourceType } from "./DatabaseModule";
import { InlineRemove } from "./InlineRemove";
function MaterialsTrash() {
  const [rows, setRows] = useState<any[]>([]),
    [tab, setTab] = useState("all"),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const readonly = (window as any).appAccount?.role === "viewer";
  async function refresh() {
    try {
      const [refs, resources] = await Promise.all([
        (window as any).referenceBridge.refresh(),
        listResources(),
      ]);
      const w = (window as any).productionBridge.read();
      setRows([
        ...refs
          .filter((r: any) => r.deleted)
          .map((row: any) => ({
            key: "reference:" + row.id,
            type:
              row.recordType === "portfolio"
                ? "portfolios"
                : row.recordType === "source"
                  ? "sources"
                  : "references",
            title: row.title,
            date: row.deletedAt || row.updatedAt,
            row,
            kind: "reference",
          })),
        ...resources
          .filter(
            (r: any) =>
              r.deleted && !r.purged && r.properties?.documentFont !== "true",
          )
          .map((row: any) => ({
            key: "resource:" + row.id,
            type: resourceType(row) === "documents" ? "documents" : "resources",
            title: row.title,
            date: row.deletedAt || row.updatedAt,
            row,
            kind: "resource",
          })),
        ...["productions", "projects"].flatMap((ownerKey) =>
          (w[ownerKey] || []).flatMap((owner: any) =>
            (owner.archives || [])
              .filter((a: any) => a.deleted)
              .map((row: any) => ({
                key: "archive:" + row.id,
                type: "archive",
                title: row.name,
                date: row.deletedAt,
                row,
                kind: "archive",
                ownerKey,
                ownerId: owner.id,
              })),
          ),
        ),
      ]);
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
  }, []);
  const visible = rows.filter((r) => tab === "all" || r.type === tab);
  async function change(targets: any[], purge = false) {
    setBusy(true);
    setError("");
    try {
      for (const item of targets) {
        if (item.kind === "reference") {
          if (purge) {
            const response = await fetch("/api/references/" + item.row.id, {
              method: "DELETE",
            });
            if (!response.ok) throw Error("레퍼런스를 삭제하지 못했습니다.");
          } else
            await (window as any).referenceBridge.save({
              ...item.row,
              deleted: false,
              deletedAt: undefined,
            });
        } else if (item.kind === "resource") {
          if (purge) {
            const response = await fetch(
              "/api/database/resources/" + item.row.id,
              {
                method: "DELETE",
                headers: { "If-Match": '"' + item.row.version + '"' },
              },
            );
            if (!response.ok)
              throw Error(
                response.status === 404
                  ? "자료 휴지통을 사용하려면 NAS를 업데이트하세요."
                  : "자료를 삭제하지 못했습니다.",
              );
          } else await saveResource({ ...item.row, deleted: false });
        } else {
          const bridge = (window as any).productionBridge,
            w = bridge.read();
          bridge.write({
            ...w,
            [item.ownerKey]: w[item.ownerKey].map((owner: any) =>
              owner.id === item.ownerId
                ? {
                    ...owner,
                    archives: purge
                      ? owner.archives.filter((a: any) => a.id !== item.row.id)
                      : owner.archives.map((a: any) =>
                          a.id === item.row.id
                            ? { ...a, deleted: false, deletedAt: undefined }
                            : a,
                        ),
                  }
                : owner,
            ),
          });
          await (window as any).flushDocumentModules?.();
        }
      }
      setSelected([]);
      await refresh();
      window.dispatchEvent(new Event("resources-changed"));
      window.dispatchEvent(new Event("references-changed"));
    } catch (e: any) {
      setError(e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="unified-trash">
      <header>
        <h1>휴지통</h1>
        <span>{visible.length}개</span>
      </header>
      <nav className="trash-tabs" aria-label="휴지통 종류">
        {[
          ["all", "전체"],
          ["references", "레퍼런스"],
          ["portfolios", "포트폴리오"],
          ["sources", "소스"],
          ["documents", "문서"],
          ["resources", "자료"],
          ["archive", "아카이브"],
        ].map(([id, label]) => (
          <button
            className="keep-label"
            key={id}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              setSelected([]);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="trash-actions">
        <label>
          <input
            type="checkbox"
            aria-label="휴지통 전체 선택"
            checked={
              !!visible.length && visible.every((r) => selected.includes(r.key))
            }
            onChange={(e) =>
              setSelected(e.target.checked ? visible.map((r) => r.key) : [])
            }
          />
          전체 선택
        </label>
        <button
          className="keep-label"
          disabled={readonly || busy || !selected.length}
          onClick={() => change(rows.filter((r) => selected.includes(r.key)))}
        >
          선택 복원
        </button>
        {!readonly && !!selected.length && !busy && (
          <InlineRemove
            triggerText="선택 영구 삭제"
            label="선택 영구 삭제"
            confirmationLabel="휴지통 선택 영구 삭제 확인"
            onDelete={() =>
              change(
                rows.filter((r) => selected.includes(r.key)),
                true,
              )
            }
          />
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {visible.map((item) => (
        <div className="trash-row" key={item.key}>
          <input
            type="checkbox"
            aria-label={item.title + " 선택"}
            checked={selected.includes(item.key)}
            disabled={busy}
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, item.key]
                  : selected.filter((k) => k !== item.key),
              )
            }
          />
          <div>
            <strong>{item.title}</strong>
            <small>{item.date?.slice(0, 10)}</small>
          </div>
          <button
            className="keep-label"
            disabled={readonly || busy || item.row.canEdit === false}
            onClick={() => change([item])}
          >
            복원
          </button>
          {!readonly && !busy && item.row.canEdit !== false && (
            <InlineRemove
              triggerText="영구 삭제"
              label={item.title + " 영구 삭제"}
              confirmationLabel={item.title + " 영구 삭제 확인"}
              onDelete={() => change([item], true)}
            />
          )}
        </div>
      ))}
      {!visible.length && <p>휴지통이 비어 있습니다.</p>}
    </section>
  );
}
(window as any).mountMaterialsTrash = (host: HTMLElement, css: string) => {
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  const style = document.createElement("style");
  style.textContent = css;
  const target = document.createElement("div");
  shadow.append(style, target);
  const root = createRoot(target);
  root.render(<MaterialsTrash />);
  const stop = observeUI(shadow);
  return () => {
    stop();
    root.unmount();
  };
};
