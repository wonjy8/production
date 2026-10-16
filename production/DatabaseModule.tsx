import {
  resourceDefaults,
  resourcePresets,
  applyResourcePreset,
  resourceSearchText,
} from "./resource-schema.js";
import { readFile, downloadBlob } from "./files";
import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Photo } from "./Photo";
import { Icon } from "./Icon";
import { ResourceUsage } from "./ResourceUsage";
import { InlineRemove } from "./InlineRemove";
import { documentFormat } from "./document-types";
import { documentURL } from "./document-launch";
import {
  addResourceFile,
  createNote,
  listResources,
  saveResource,
  resourceFile,
  copyResource,
} from "./resources";
export function resourceType(row: any) {
  if (row.mime?.startsWith("image/") || row.kind === "image") return "image";
  if (
    row.mime?.startsWith("video/") ||
    ["video", "youtube"].includes(row.kind) ||
    /youtube\.com|youtu\.be|vimeo\.com/.test(row.url || "")
  )
    return "video";
  if (row.mime?.startsWith("audio/") || row.kind === "audio") return "audio";
  if (!row.fileId && row.url) return "link";
  if (
    row.kind === "text" ||
    documentFormat(resourceFile(row)) ||
    /\.(pdf|docx?|xlsx?|pptx?|odt|hwp|hwpx)$/i.test(row.filename || "")
  )
    return "documents";
  return "file";
}
const defaults = resourceDefaults.databaseCategories;
const day = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function ResourceDatabase({
  module,
  onChange,
  global = false,
  filterType = "all",
}: any) {
  const [rows, setRows] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [adding, setAdding] = useState(false),
    [picking, setPicking] = useState(false),
    [settings, setSettings] = useState(false),
    [preview, setPreview] = useState<any>(null),
    [usage, setUsage] = useState<any>(null),
    [view, setView] = useState(
      module?.databaseView ||
        (global
          ? localStorage.getItem("pn-resource-view") || "gallery"
          : "table"),
    ),
    [sort, setSort] = useState("date"),
    [reverse, setReverse] = useState(true);
  const [schema, setSchema] = useState<any>(
    () =>
      (window as any).productionBridge?.read()?.resourceSchema ||
      resourceDefaults,
  );
  const fields = module?.databaseFields || schema.databaseFields,
    categories = module?.databaseCategories || schema.databaseCategories,
    readonly = (window as any).appAccount?.role === "viewer";
  async function refresh() {
    try {
      const next = await listResources();
      setRows((old) =>
        next.map((row: any) => {
          const current = old.find((r) => r.id === row.id);
          return current && current.version > row.version ? current : row;
        }),
      );
      setAvailable(true);
      setError("");
    } catch (e: any) {
      setAvailable(false);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    const update = () => refresh();
    window.addEventListener("resources-changed", update);
    return () => window.removeEventListener("resources-changed", update);
  }, []);
  const ids = new Set((module?.files || []).map((f: any) => f.id)),
    active = rows.filter(
      (r) => !r.deleted && r.properties?.documentFont !== "true",
    ),
    selected = global
      ? active
      : active.filter((r) => ids.has(r.fileId || r.id)),
    needle = query.trim().normalize("NFKC").toLocaleLowerCase(),
    visible = selected
      .filter(
        (r) =>
          (filterType === "all" || resourceType(r) === filterType) &&
          (!category || r.properties?.category === category) &&
          (!needle ||
            resourceSearchText(
              r,
              (window as any).productionBridge?.read() || {},
            ).includes(needle)),
      )
      .sort((a, b) => {
        const x = sort === "title" ? a.title : a.properties?.date || "",
          y = sort === "title" ? b.title : b.properties?.date || "";
        return (
          (String(x).localeCompare(String(y), "ko") ||
            a.id.localeCompare(b.id)) * (reverse ? -1 : 1)
        );
      }),
    options = [
      ...new Set([
        ...categories,
        ...selected.map((r) => r.properties?.category).filter(Boolean),
      ]),
    ] as string[];
  async function attach(row: any) {
    if (!global) {
      onChange((old: any) => ({
        ...old,
        files: [
          ...(old.files || []).filter(
            (f: any) => f.id !== (row.fileId || row.id),
          ),
          {
            ...resourceFile(row),
            resourceProperties: row.properties,
            resourcePropertyLabels: row.propertyLabels,
          },
        ],
      }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await (window as any).flushDocumentModules?.();
    }
    setRows((old) => [...old.filter((r) => r.id !== row.id), row]);
  }
  async function perform(fn: () => Promise<any>) {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  function open(row: any) {
    if (row.kind === "text") {
      setPreview(row);
      return;
    }
    const file = resourceFile(row);
    if (row.fileId && documentFormat(file))
      window.open(documentURL(file, null), "_blank", "noopener,noreferrer");
    else if (row.fileId) {
      const preview =
        /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg)|application\/pdf)$/.test(
          row.mime || "",
        );
      const popup = preview ? window.open("about:blank", "_blank") : null;
      if (popup) {
        popup.opener = null;
        popup.document.body.textContent = "파일을 불러오는 중…";
      }
      perform(async () => {
        try {
          const blob = await readFile(row.fileId);
          if (popup) {
            const url = URL.createObjectURL(blob);
            popup.location.replace(url);
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } else downloadBlob(blob, file.name);
        } catch (e) {
          popup?.close();
          throw e;
        }
      });
    } else if (/^https?:\/\//.test(row.url))
      window.open(row.url, "_blank", "noopener,noreferrer");
  }
  function rowCard(row: any) {
    return (
      <div className="resource-card" key={row.id}>
        {view === "gallery" && (
          <button
            className="resource-cover keep-label"
            aria-label={row.title + " 미리보기"}
            onClick={() => open(row)}
          >
            {resourceType(row) === "image" ? (
              <Photo file={resourceFile(row)} />
            ) : resourceType(row) === "video" && row.fileId ? (
              <div className="resource-cover-icon resource-cover-video">
                <Icon name="video" />
              </div>
            ) : (
              <div
                className={
                  "resource-cover-icon resource-cover-" + resourceType(row)
                }
              >
                <Icon
                  name={
                    resourceType(row) === "video"
                      ? "video"
                      : resourceType(row) === "link"
                        ? "link"
                        : resourceType(row) === "audio"
                          ? "music"
                          : "file"
                  }
                />
                {row.content && <p>{row.content.slice(0, 240)}</p>}
              </div>
            )}
          </button>
        )}
        <button className="keep-label resource-title" onClick={() => open(row)}>
          <Icon name={row.fileId ? "file" : "link"} />
          <strong>{row.title}</strong>
        </button>
        <div className="resource-card-properties">
          {fields.map((f: any) => (
            <span key={f.id}>{row.properties?.[f.id] || "—"}</span>
          ))}
        </div>
        <div className="resource-row-actions">
          <button className="keep-label" onClick={()=>setUsage(row)} aria-label={row.title+' 사용처'}>사용처 {(row.origins||[]).length}</button>
          {!readonly&&(row.fileId||row.kind==='text')&&<button className="keep-label" disabled={busy} onClick={()=>perform(async()=>{await attach(await copyResource(row));await refresh()})} aria-label={row.title+' 사본 만들기'}>사본</button>}
          {!readonly && row.canEdit && (
            <button
              className="keep-label"
              aria-label={row.title + " 속성 수정"}
              onClick={() => setEditing(row)}
            >
              속성
            </button>
          )}
          {!readonly && global && row.canEdit && (row.canTrash===false||row.origins?.length>0) && <button className="keep-label" onClick={()=>setUsage(row)} aria-label={row.title+' 삭제 안내'}>휴지통</button>}
          {!readonly && global && row.canEdit && row.canTrash!==false && !row.origins?.length && (
            <InlineRemove
              triggerText="휴지통"
              label={row.title + " 휴지통으로 이동"}
              onDelete={() =>
                perform(async () => {
                  await saveResource({ ...row, deleted: true });
                  await refresh();
                })
              }
            />
          )}
          {!global && !readonly && (
            <InlineRemove
              onDelete={() =>
                onChange((old: any) => ({
                  ...old,
                  files: (old.files || []).filter(
                    (f: any) => f.id !== (row.fileId || row.id),
                  ),
                }))
              }
            />
          )}
        </div>
      </div>
    );
  }
  return (
    <section
      className="resource-database"
      style={{ "--resource-columns": fields.length } as any}
      aria-label={global ? "통합 자료 데이터베이스" : "데이터베이스 모듈"}
    >
      <header className="resource-toolbar">
        <input
          type="search"
          aria-label="자료 검색"
          placeholder="제목·태그·속성 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="자료 분류 필터"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">모든 분류</option>
          {options.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="자료 정렬"
          value={sort}
          data-sort-direction={reverse ? "desc" : "asc"}
          onChange={(e) => {
            if (e.target.value === sort) setReverse(!reverse);
            else {
              setSort(e.target.value);
              setReverse(e.target.value === "date");
            }
          }}
        >
          <option value="date">
            날짜 {sort === "date" ? (reverse ? "최신순" : "오래된순") : ""}
          </option>
          <option value="title">
            제목 {sort === "title" ? (reverse ? "Z→A" : "A→Z") : ""}
          </option>
        </select>
        <div className="resource-view-switch">
          <button
            className="keep-label"
            aria-pressed={view === "gallery"}
            onClick={() => {
              setView("gallery");
              if (global) localStorage.setItem("pn-resource-view", "gallery");
              onChange?.((old: any) => ({ ...old, databaseView: "gallery" }));
            }}
          >
            <Icon name="projects" />
            갤러리
          </button>
          <button
            className="keep-label"
            aria-pressed={view === "table"}
            onClick={() => {
              setView("table");
              if (global) localStorage.setItem("pn-resource-view", "table");
              onChange?.((old: any) => ({ ...old, databaseView: "table" }));
            }}
          >
            <Icon name="list" />
            목록
          </button>
          <button
            className="keep-label"
            aria-pressed={view === "board"}
            onClick={() => {
              setView("board");
              if (global) localStorage.setItem("pn-resource-view", "board");
              onChange?.((old: any) => ({ ...old, databaseView: "board" }));
            }}
          >
            <Icon name="board" />
            보드
          </button>
        </div>
        <button className="keep-label" onClick={refresh}>
          새로고침
        </button>
        {!readonly && (
          <>
            <button
              className="keep-label"
              disabled={busy || !available}
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" />새 문서
            </button>
            <label className="button keep-label material-upload">
              파일 추가
              <input
                type="file"
                multiple
                aria-label="DB 파일 추가"
                disabled={busy || !available}
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  perform(async () => {
                    for (const file of files)
                      await attach(await addResourceFile(file));
                    await refresh();
                  });
                }}
              />
            </label>
            {!global && (
              <>
                <button
                  className="keep-label"
                  onClick={() => {
                    refresh();
                    setPicking(true);
                  }}
                >
                  기존 자료 연결
                </button>
              </>
            )}
          </>
        )}
        {!readonly &&
          (!global ||
            !(window as any).appAccount ||
            ["admin", "superadmin"].includes(
              (window as any).appAccount.role,
            )) && (
            <button
              className="keep-label"
              aria-label="데이터베이스 속성 설정"
              onClick={() => setSettings(true)}
            >
              <Icon name="settings" />
            </button>
          )}
      </header>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">자료를 불러오는 중…</p>
      ) : view === "gallery" ? (
        <div className="resource-masonry">{visible.map(rowCard)}</div>
      ) : view === "board" ? (
        <div className="resource-board">
          {[...options, "미분류"].map((c) => (
            <section key={c}>
              <h3>{c}</h3>
              {visible
                .filter((r) => (r.properties?.category || "미분류") === c)
                .map(rowCard)}
            </section>
          ))}
        </div>
      ) : (
        <div className="resource-table-scroll">
          <div className="resource-table" role="table" aria-label="자료 목록">
            <div className="resource-table-head" role="row">
              <span>제목</span>
              <div>
                {fields.map((f: any) => (
                  <span key={f.id}>{f.label}</span>
                ))}
              </div>
              <span>관리</span>
            </div>
            {visible.map(rowCard)}
          </div>
        </div>
      )}
      {!loading && !visible.length && (
        <p className="group-empty">
          {global
            ? "등록된 자료가 없습니다. 새 문서를 만들거나 파일을 업로드하세요."
            : "등록된 자료가 없습니다. 새 문서를 만들거나 기존 자료를 연결하세요."}
        </p>
      )}
      {!global && (
        <small className="resource-explanation">
          연결한 자료는 같은 원본을 사용합니다. 이 모듈에서 제거해도 보관함의 원본과 다른 사용처는 유지됩니다.
        </small>
      )}
      {usage&&<Modal title="원본 사용처" onClose={()=>setUsage(null)}><ResourceUsage row={usage}/><p>원본은 보관함에 저장되며, 프로젝트에서는 같은 원본을 연결해 사용합니다.</p></Modal>}
      {preview && (
        <Modal title={preview.title} onClose={() => setPreview(null)}>
          <p style={{ whiteSpace: "pre-wrap" }}>{preview.content}</p>
          {!readonly && (
            <button
              className="button keep-label"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await attach(await copyResource(preview));
                  setPreview(null);
                })
              }
            >
              문서 파일 사본으로 추가
            </button>
          )}
        </Modal>
      )}
      {(adding || editing) && (
        <ResourceEditor
          key={editing?.id||"new-resource"}
          row={editing}
          error={error}
          onCopy={editing&&(editing.fileId||editing.kind==='text')?()=>perform(async()=>{const copy=await copyResource(editing);await attach(copy);setEditing(copy)}):undefined}
          fields={
            global
              ? [
                  ...fields,
                  ...Object.entries(editing?.propertyLabels || {})
                    .filter(([id]) => !fields.some((f: any) => f.id === id))
                    .map(([id, label]) => ({ id, label, type: "text" })),
                ]
              : fields
          }
          categories={options}
          busy={busy}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSave={async (draft: any) => {
            let popup: Window | null = null;
            if (!editing) {
              popup = window.open("about:blank", "_blank");
              if (popup) {
                popup.opener = null;
                popup.document.body.textContent = "문서를 준비하는 중…";
              }
            }
            const result = await perform(async () => {
              const row = editing
                ? await saveResource({ ...editing, ...draft })
                : await createNote(draft);
              await attach(row);
              if (popup)
                popup.location.replace(documentURL(resourceFile(row), null));
              return row;
            });
            if (result) {
              setAdding(false);
              setEditing(null);
            } else popup?.close();
          }}
        />
      )}
      {picking && (
        <Modal title="기존 자료 연결" onClose={() => setPicking(false)}>
          <p>
            연결하면 같은 원본을 사용합니다. 따로 편집하려면 사본으로
            추가하세요.
          </p>
          <input
            aria-label="연결할 자료 검색"
            placeholder="자료 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="resource-picker">
            {active
              .filter(
                (r) =>
                  !ids.has(r.fileId || r.id) &&
                  (!needle ||
                    [r.title, ...Object.values(r.properties || {})]
                      .join(" ")
                      .toLocaleLowerCase()
                      .includes(needle)),
              )
              .map((row) => (
                <div key={row.id}>
                  <span>
                    {row.title}
                    <small>{row.properties?.category}</small>
                  </span>
                  <button
                    className="keep-label"
                    disabled={busy || row.kind === "text"}
                    onClick={() => perform(() => attach(row))}
                  >
                    연결
                  </button>
                  <button
                    className="keep-label"
                    disabled={busy || (!row.fileId && row.kind !== "text")}
                    title={
                      !row.fileId && row.kind !== "text"
                        ? "외부 링크는 연결하여 사용하세요"
                        : undefined
                    }
                    onClick={() =>
                      perform(async () => attach(await copyResource(row)))
                    }
                  >
                    사본으로 추가
                  </button>
                </div>
              ))}
          </div>
        </Modal>
      )}
      {settings && (
        <DatabaseSettings
          module={global ? schema : module}
          onClose={() => setSettings(false)}
          onSave={(data: any) => {
            if (global) {
              perform(async () => {
                const bridge = (window as any).productionBridge;
                bridge.setResourceSchema(data);
                await (window as any).flushDocumentModules?.();
                setSchema(data);
                setSettings(false);
              });
            } else {
              onChange((old: any) => ({ ...old, ...data }));
              setSettings(false);
            }
          }}
        />
      )}
    </section>
  );
}
function ResourceEditor({
  row,
  error,
  onCopy,
  fields,
  categories,
  busy,
  onSave,
  onClose,
}: any) {
  const [title, setTitle] = useState(row?.title || ""),
    [props, setProps] = useState(row?.properties || { date: day() }),
    [tags, setTags] = useState((row?.tags || []).join(", "));
  return (
    <Modal title={row ? "자료 속성" : "새 문서"} onClose={onClose}>
      {row&&<ResourceUsage row={row} notice/>}
      {error&&<p role="alert" className="form-error">{error}</p>}
      {onCopy&&<button type="button" className="button keep-label" disabled={busy} onClick={onCopy}>사본을 만들어 편집</button>}
      <form
        className="merge-form resource-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            title: title.trim(),
            properties: props,
            propertyLabels: {
              ...(row?.propertyLabels || {}),
              ...Object.fromEntries(fields.map((f: any) => [f.id, f.label])),
            },
            tags: [
              ...new Set(
                tags
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              ),
            ],
          });
        }}
      >
        <label>
          제목
          <input
            aria-label="자료 제목"
            placeholder="말씀 노트 제목"
            value={title}
            required
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {fields.map((field: any) => (
          <label key={field.id}>
            {field.label}
            <input
              aria-label={field.label}
              type={field.type === "date" ? "date" : "text"}
              list={field.id === "category" ? "resource-categories" : undefined}
              placeholder={field.label + " 입력"}
              value={props[field.id] || ""}
              maxLength={2000}
              onChange={(e) =>
                setProps({ ...props, [field.id]: e.target.value })
              }
            />
          </label>
        ))}
        <datalist id="resource-categories">
          {categories.map((c: string) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <label>
          태그
          <input
            aria-label="자료 태그"
            placeholder="쉼표로 구분"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
        <button
          className="button primary keep-label"
          disabled={busy || !title.trim()}
        >
          {busy ? "저장 중…" : row ? "적용" : "만들고 문서 열기"}
        </button>
      </form>
    </Modal>
  );
}
function DatabaseSettings({ module, onSave, onClose }: any) {
  const [categories, setCategories] = useState(
      (module.databaseCategories || defaults).join(", "),
    ),
    [fields, setFields] = useState(
      module.databaseFields || resourceDefaults.databaseFields,
    ),
    [name, setName] = useState("");
  return (
    <Modal title="데이터베이스 속성 설정" onClose={onClose}>
      <form
        className="merge-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            databaseCategories: [
              ...new Set(
                categories
                  .split(",")
                  .map((c) => c.trim())
                  .filter(Boolean),
              ),
            ],
            databaseFields: fields,
          });
        }}
      >
        <label>
          프리셋 추가
          <select
            aria-label="자료 프리셋"
            defaultValue=""
            onChange={(e) => {
              const preset = resourcePresets.find(
                (p) => p.id === e.target.value,
              );
              if (preset) {
                const next = applyResourcePreset(
                  {
                    databaseCategories: categories
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                    databaseFields: fields,
                  },
                  preset,
                );
                setCategories(next.databaseCategories.join(", "));
                setFields(next.databaseFields);
              }
              e.target.value = "";
            }}
          >
            <option value="">프리셋 선택</option>
            {resourcePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          기존 자료 값은 유지됩니다. 프리셋은 분류와 속성을 추가합니다.
        </p>
        <label>
          분류 선택지
          <input
            aria-label="분류 선택지"
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
            placeholder="예: 기획, 제작, 완료"
          />
        </label>
        {fields.map((f: any) => (
          <div className="resource-field-setting" key={f.id}>
            <input
              aria-label="속성 표시 이름"
              value={f.label}
              onChange={(e) =>
                setFields(
                  fields.map((x: any) =>
                    x.id === f.id ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
            />
            {!["category", "date"].includes(f.id) && (
              <button
                type="button"
                className="keep-label danger"
                onClick={() =>
                  setFields(fields.filter((x: any) => x.id !== f.id))
                }
              >
                속성 숨기기
              </button>
            )}
          </div>
        ))}
        <label>
          새 속성 이름
          <input
            aria-label="새 속성 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>
        <button
          type="button"
          className="keep-label"
          disabled={!name.trim() || fields.length >= 20}
          onClick={() => {
            setFields([
              ...fields,
              { id: crypto.randomUUID(), label: name.trim(), type: "text" },
            ]);
            setName("");
          }}
        >
          텍스트 속성 추가
        </button>
        <button className="button primary keep-label">적용</button>
      </form>
    </Modal>
  );
}
export function DatabaseModule(props: any) {
  return <ResourceDatabase {...props} />;
}
