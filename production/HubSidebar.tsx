import { useEffect, useState, type ReactNode } from "react";
import { Icon, IconButton } from "./Icon";
import {
  hubCategories,
  hubGroup,
  moduleTemplates,
  tabTemplates,
} from "./module-hub.js";

export function HubSidebar({
  mode = "modules",
  importContent,
  onClose,
  onAddModule,
  onAddTab,
  upload,
  wide = false,
  notice = "",
}: {
  importContent?: ReactNode;
  notice?: string;
  wide?: boolean;
  mode?: "modules" | "tabs";
  onClose: () => void;
  onAddModule?: (id: string) => void;
  onAddTab?: (id: string) => void;
  upload?: { busy: boolean; onFiles: (files: FileList | null) => void };
}) {
  useEffect(() => {
    (window as any).closeAppPanels?.();
    const count = Number(document.body.dataset.hubPanels || 0) + 1;
    document.body.dataset.hubPanels = String(count);
    document.body.classList.add("hub-visible");
    return () => {
      const remaining = Math.max(
        0,
        Number(document.body.dataset.hubPanels || 0) - 1,
      );
      document.body.dataset.hubPanels = String(remaining);
      document.body.classList.toggle("hub-visible", remaining > 0);
    };
  }, []);
  const [view, setView] = useState<"modules" | "tabs" | "import">(mode),
    [category, setCategory] = useState("all"),
    [query, setQuery] = useState(""),
    [searching, setSearching] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const close = () => onClose();
    window.addEventListener("close-module-panels", close);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("close-module-panels", close);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const groupFor = (item: any) =>
    view === "modules" ? hubGroup(item) : item.category;
  const entries = (view === "modules" ? moduleTemplates : tabTemplates).filter(
    (item) =>
      (category === "all" || groupFor(item) === category) &&
      (!query ||
        [
          item.name,
          item.description,
          hubCategories.find((c) => c.id === groupFor(item))?.label,
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())),
  );
  return (
    <aside
      className={"hub-sidebar" + (wide ? " hub-sidebar-wide" : "")}
      aria-label="모듈 허브"
    >
      <header>
        <div>
          <small>MODULE HUB</small>
          <h2>Hub</h2>
        </div>
        <IconButton name="close" label="Hub 닫기" onClick={onClose} />
      </header>
      <p>필요한 모듈과 탭을 찾아 바로 추가하세요.</p>
      <div className="hub-switch" role="tablist">
        <button
          className="keep-label"
          role="tab"
          aria-selected={view === "modules"}
          onClick={() => {
            setView("modules");
            setCategory("all");
          }}
        >
          모듈
        </button>
        <button
          className="keep-label"
          role="tab"
          aria-selected={view === "tabs"}
          onClick={() => {
            setView("tabs");
            setCategory("all");
          }}
        >
          템플릿
        </button>
        {importContent && (
          <button
            className="keep-label"
            role="tab"
            aria-selected={view === "import"}
            onClick={() => {
              setView("import");
              setSearching(false);
              setQuery("");
            }}
          >
            불러오기
          </button>
        )}
      </div>
      {view === "import" ? (
        <div className="hub-import-content">{importContent}</div>
      ) : (
        <>
          <div className={"hub-filter-bar" + (searching ? " searching" : "")}>
            {searching ? (
              <label className="hub-search">
                <Icon name="search" />
                <input
                  autoFocus
                  type="search"
                  aria-label="Hub 검색"
                  placeholder="모듈·탭 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            ) : (
              <nav className="hub-categories" aria-label="Hub 분류">
                {hubCategories
                  .filter(
                    (item) =>
                      item.id === "all" ||
                      (view === "modules"
                        ? moduleTemplates
                        : tabTemplates
                      ).some((entry) => groupFor(entry) === item.id),
                  )
                  .map((item) => (
                    <button
                      className="keep-label"
                      key={item.id}
                      aria-pressed={category === item.id}
                      onClick={() => setCategory(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
              </nav>
            )}
            <IconButton
              name={searching ? "close" : "search"}
              label={searching ? "Hub 검색 닫기" : "Hub 검색 열기"}
              onClick={() => {
                setSearching(!searching);
                setQuery("");
                if (!searching) setCategory("all");
              }}
            />
          </div>
          {notice && (
            <p className="hub-notice" role="status">
              {notice}
            </p>
          )}
          <div className="hub-results">
            {upload && view === "modules" && category === "all" && !query && (
              <label className="hub-card hub-upload">
                <Icon name="file" />
                <span className="hub-card-content">
                  <strong>
                    {upload.busy ? "업로드 중" : "파일 바로 추가"}
                  </strong>
                  <small>사진·영상·파일 업로드</small>
                </span>
                <input
                  type="file"
                  multiple
                  disabled={upload.busy}
                  aria-label="사진 영상 파일 추가"
                  onChange={(e) => {
                    upload.onFiles(e.target.files);
                    e.target.value = "";
                    onClose();
                  }}
                />
              </label>
            )}
            {view === "tabs" && (
              <div className="hub-pinned-blank">
                <button
                  className="hub-card keep-label hub-blank-tab"
                  onClick={() => onAddTab?.("blank")}
                >
                  <Icon name="plus" />
                  <strong>빈 탭</strong>
                </button>
              </div>
            )}
            {hubCategories
              .filter((group) => group.id !== "all")
              .map((group) => {
                const items = entries.filter(
                  (item) => item.id !== "blank" && groupFor(item) === group.id,
                );
                return items.length ? (
                  <section className="hub-result-group" key={group.id}>
                    <h3>{group.label}</h3>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        className={
                          "hub-card keep-label" +
                          (view === "tabs" && item.id === "blank"
                            ? " hub-blank-tab"
                            : "")
                        }
                        draggable={view === "modules" && !!onAddModule}
                        onDragStart={(e) => {
                          if (view === "modules") {
                            e.dataTransfer.setData(
                              "application/x-module-template",
                              item.id,
                            );
                            e.dataTransfer.effectAllowed = "copy";
                          }
                        }}
                        onClick={() => {
                          if (view === "modules") onAddModule?.(item.id);
                          else onAddTab?.(item.id);
                        }}
                      >
                        <span className="hub-card-head">
                          <Icon name={item.icon} />
                          <span className="hub-card-content">
                            <strong>{item.name}</strong>
                            <small>{item.description}</small>
                          </span>
                          <Icon name="plus" />
                        </span>
                      </button>
                    ))}
                  </section>
                ) : null;
              })}
            {!entries.length && <p className="muted">검색 결과가 없습니다.</p>}
            {view === "tabs" && !onAddTab && (
              <p className="muted">
                탭 템플릿은 프로젝트 또는 자료의 탭 추가에서 사용할 수 있습니다.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
