import { useEffect, useState } from "react";
import { Icon, IconButton } from "./Icon";
import { InlineRemove } from "./InlineRemove";
import { Modal } from "./Modal";
import { safeUrl } from "./data";
import { memberLabel } from "./people-model.js";
import { listResources, resourceFile } from "./resources";
import { documentFormat } from "./document-types";
import { documentURL } from "./document-launch";
import {
  fieldTypes,
  planningKinds,
  planningData,
  planningSource,
  planningSnapshot,
  planningTeams,
  planningMembers,
  planningEquipment,
  planningSchedules,
  planningGroups,
  movePlanningEntry,
  visiblePlanningFields,
} from "./planning-model.js";
const uid = () => crypto.randomUUID();
export function SectionHeading({ module: m, onChange }: any) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="plan-section">
      <span className="plan-section-number">{m.sectionNumber || "—"}</span>
      <div>
        <h2>{m.title || "섹션 제목"}</h2>
        {m.sectionNote && <p>{m.sectionNote}</p>}
      </div>
      {(window as any).appAccount?.role !== "viewer" && (
        <IconButton
          name="edit"
          label="섹션 편집"
          onClick={() => setEditing(true)}
        />
      )}
      {editing && (
        <Modal title="섹션 편집" onClose={() => setEditing(false)}>
          <form
            className="merge-form plan-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onChange((old: any) => ({
                ...old,
                title: String(f.get("title")).trim(),
                sectionNumber: String(f.get("number")).trim(),
                sectionNote: String(f.get("note")).trim(),
              }));
              setEditing(false);
            }}
          >
            <label>
              번호
              <input
                name="number"
                defaultValue={m.sectionNumber || ""}
                placeholder="예: 01"
                maxLength={20}
              />
            </label>
            <label>
              제목
              <input
                name="title"
                defaultValue={m.title || ""}
                required
                maxLength={200}
              />
            </label>
            <label>
              설명
              <textarea
                name="note"
                defaultValue={m.sectionNote || ""}
                placeholder="구역에 대한 설명"
              />
            </label>
            <button className="button primary keep-label">적용</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export function PlanningModule({
  module: m,
  modules,
  workspace: w,
  onChange,
  onDataChange,
}: any) {
  const locked = (window as any).appAccount?.role === "viewer";
  const [previewView, setPreviewView] = useState("");
  const view = locked
    ? previewView || m.planView || "cards"
    : m.planView || "cards";
  const changeView = (fn: any) => {
    if ((window as any).appAccount?.role !== "viewer") onChange(fn);
  };
  const source = planningSource(m, modules),
    data = source?.planData || m.planData || planningData(m.kind),
    readonly = (window as any).appAccount?.role === "viewer" || !source;
  const [settings, setSettings] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [resources, setResources] = useState<any[]>([]),
    [resourceError, setResourceError] = useState(""),
    [query, setQuery] = useState("");
  const hasResources = data.fields.some((f: any) => f.type === "resource");
  useEffect(() => {
    if (!hasResources) return;
    let alive = true;
    const refresh = () =>
      listResources()
        .then((rows) => {
          if (alive) {
            setResources(
              rows.filter(
                (r: any) => !r.deleted && r.properties?.documentFont !== "true",
              ),
            );
            setResourceError("");
          }
        })
        .catch((e) => {
          if (alive) setResourceError(e.message);
        });
    refresh();
    window.addEventListener("resources-changed", refresh);
    return () => {
      alive = false;
      window.removeEventListener("resources-changed", refresh);
    };
  }, [hasResources]);
  const teams = planningTeams(w),
    equipment = planningEquipment(w),
    schedules = planningSchedules(w),
    fields = visiblePlanningFields(data, m.hiddenPlanFields || []);
  const grouped = planningGroups(data, m.planGroupBy, w).map((g: any) => ({
    ...g,
    entries: g.entries.filter(
      (entry: any) =>
        !query.trim() ||
        [
          entry.title,
          ...data.fields.map((f: any) => displayText(f, entry.values?.[f.id])),
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()),
    ),
  }));
  function options(field: any, entry?: any) {
    if (field.type === "team")
      return teams.map((t: any) => ({ id: t.key, label: t.label }));
    if (field.type === "member") {
      const teamField = data.fields.find((f: any) => f.type === "team"),
        team =
          entry?.values?.[teamField?.id] ||
          data.groups.find((g: any) => g.id === entry?.groupId)?.teamId;
      return planningMembers(w, team).map((p: any) => ({
        id: p.id,
        label: memberLabel(p),
      }));
    }
    if (field.type === "equipment")
      return equipment.map((e: any) => ({ id: e.key, label: e.label }));
    if (field.type === "resource")
      return resources.map((r: any) => ({
        id: r.id,
        label: r.title || r.filename || "자료",
      }));
    if (field.type === "schedule")
      return schedules.map((s: any) => ({
        id: s.key,
        label: [s.date, s.startTime, s.label].filter(Boolean).join(" · "),
      }));
    return (field.options || [])
      .filter(Boolean)
      .map((v: string) => ({ id: v, label: v }));
  }
  function displayText(field: any, value: any) {
    if (value == null || value === "") return "";
    if (field.type === "check") return value ? "완료" : "미완료";
    if (
      [
        "team",
        "member",
        "equipment",
        "resource",
        "schedule",
        "select",
      ].includes(field.type)
    )
      return (
        options(field).find((o: any) => o.id === String(value))?.label ||
        (["select"].includes(field.type) ? String(value) : "연결 항목 없음")
      );
    return String(value);
  }
  function cell(field: any, value: any) {
    const text = displayText(field, value);
    if (!text) return <span className="plan-empty-value">—</span>;
    if (field.type === "resource") {
      const r = resources.find((r) => r.id === value);
      if (r) {
        const file = resourceFile(r),
          url = r.fileId
            ? documentFormat(file)
              ? documentURL(file)
              : "/api/ref-files/" + encodeURIComponent(r.fileId)
            : safeUrl(r.url || "");
        return url ? (
          <a
            className="plan-resource"
            href={url}
            onClick={event=>{if(r.fileId&&documentFormat(file)&&(window as any).openInlineDocument&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();void (window as any).openInlineDocument(url).catch(()=>{});}}}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="file" />
            {text}
            <Icon name="arrowUpRight" />
          </a>
        ) : (
          text
        );
      }
    }
    return ["select", "team"].includes(field.type) ? (
      <span
        className={
          "plan-badge plan-badge-" + (field.type === "team" ? "team" : "tag")
        }
      >
        {text}
      </span>
    ) : field.type === "check" ? (
      <span className="plan-check">{value ? "✓" : "○"}</span>
    ) : (
      <span className="plan-value-text">{text}</span>
    );
  }
  function changeData(fn: any) {
    if (!readonly) onDataChange(fn);
  }
  function addEntry(groupId = "", values: any = {}) {
    setEditing({ id: uid(), title: "", groupId, values, isNew: true });
  }
  function updateField(field: any, value: any) {
    const values = { ...editing.values, [field.id]: value };
    if (field.type === "team")
      for (const memberField of data.fields.filter(
        (f: any) => f.type === "member",
      ))
        if (
          values[memberField.id] &&
          !planningMembers(w, value).some(
            (p: any) => p.id === values[memberField.id],
          )
        )
          values[memberField.id] = "";
    updateEntry({ values });
  }
  function updateEntry(patch: any) {
    setEditing((old: any) => ({ ...old, ...patch }));
  }
  function entryFields(entry: any) {
    return fields
      .filter(
        (field: any) =>
          entry.values?.[field.id] != null && entry.values[field.id] !== "",
      )
      .map((field: any) => (
        <div
          key={field.id}
          className={"plan-cell" + (field.type === "time" ? " plan-time" : "")}
        >
          <small>{field.label}</small>
          {cell(field, entry.values?.[field.id])}
        </div>
      ));
  }
  function tools(entry: any) {
    const rows =
      planningGroups(data, m.planGroupBy, w).find((g: any) =>
        g.entries.some((e: any) => e.id === entry.id),
      )?.entries || [];
    const index = rows.findIndex((e: any) => e.id === entry.id);
    return (
      !readonly && (
        <span className="plan-entry-tools">
          <IconButton
            name="up"
            label="항목 위로"
            disabled={index === 0}
            onClick={() =>
              changeData((d: any) =>
                movePlanningEntry(d, entry.id, -1, m.planGroupBy, w),
              )
            }
          />
          <IconButton
            name="down"
            label="항목 아래로"
            disabled={index === rows.length - 1}
            onClick={() =>
              changeData((d: any) =>
                movePlanningEntry(d, entry.id, 1, m.planGroupBy, w),
              )
            }
          />
          <InlineRemove
            label={entry.title + " 항목 삭제"}
            confirmationLabel="항목 삭제 확인"
            onDelete={() =>
              changeData((d: any) => ({
                ...d,
                entries: d.entries.filter((e: any) => e.id !== entry.id),
              }))
            }
          />
        </span>
      )
    );
  }
  return (
    <div className={"planning-module plan-kind-" + m.kind}>
      <div className="plan-toolbar">
        <label className="plan-search">
          <Icon name="search" />
          <input
            type="search"
            aria-label="항목 검색"
            placeholder="항목 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="plan-view-switch" role="group" aria-label="보기 방식">
          {[
            ["cards", "카드", "reference"],
            ["table", "표", "table"],
          ].map(([id, label, icon]) => (
            <button
              type="button"
              className="keep-label"
              key={id}
              title={label + " 보기"}
              aria-label={label + " 보기"}
              aria-pressed={view === id}
              onClick={() =>
                locked
                  ? setPreviewView(id)
                  : changeView((old: any) => ({ ...old, planView: id }))
              }
            >
              <Icon name={icon} />
            </button>
          ))}
        </div>
        <IconButton
          name="settings"
          label="모듈 구성"
          onClick={() => setSettings(true)}
        />
      </div>
      {m.dataModuleId && (
        <p className="plan-source-note">
          <Icon name="link" />
          {source
            ? "이 탭의 " + (source.title || "모듈") + " 데이터 공유"
            : "연결된 데이터 모듈을 찾을 수 없습니다"}
        </p>
      )}
      {resourceError && <p role="alert">자료 목록: {resourceError}</p>}
      <div
        className={
          "plan-groups " +
          (view === "table" ? "plan-table-view" : "plan-card-view")
        }
        style={
          {
            "--plan-columns": Math.max(1, Math.min(4, m.planColumns || 2)),
          } as any
        }
      >
        {grouped.map((group: any) => (
          <section className="plan-group" key={group.id}>
            {(group.name || group.note) && (
              <header className="plan-group-header">
                <div>
                  <h3>
                    {group.name}
                    {group.teamId && (
                      <span className="plan-badge plan-badge-team">
                        {teams.find((t: any) => t.key === group.teamId)
                          ?.label || "연결된 팀 없음"}
                      </span>
                    )}
                  </h3>
                  {group.note && <p>{group.note}</p>}
                </div>
                <span>{group.entries.length}</span>
              </header>
            )}
            {view === "table" ? (
              <div className="plan-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{data.titleLabel || "항목"}</th>
                      {fields.map((f: any) => (
                        <th key={f.id}>{f.label}</th>
                      ))}
                      {!readonly && (
                        <th>
                          <span className="sr-only">순서와 삭제</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map((entry: any, index: number) => (
                      <tr
                        key={entry.id}
                        className={entry.highlight ? "plan-highlight" : ""}
                      >
                        <td>{index + 1}</td>
                        <td>
                          <button
                            className="keep-label plan-entry-title"
                            onClick={() => setEditing({ ...entry })}
                          >
                            {entry.highlight && (
                              <span className="plan-star">★</span>
                            )}
                            {entry.title || "제목 없음"}
                          </button>
                        </td>
                        {fields.map((field: any) => (
                          <td key={field.id}>
                            {cell(field, entry.values?.[field.id])}
                          </td>
                        ))}
                        {!readonly && <td>{tools(entry)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className={
                  "plan-entries" +
                  (m.kind === "group-list" ? " plan-entries-list" : "")
                }
              >
                {group.entries.map((entry: any, index: number) => (
                  <article
                    key={entry.id}
                    className={
                      "plan-entry" +
                      (entry.highlight ? " plan-highlight" : "") +
                      (entry.emphasis ? " plan-emphasis" : "")
                    }
                  >
                    <header>
                      <span className="plan-entry-index">{index + 1}</span>
                      <button
                        className="keep-label plan-entry-title"
                        onClick={() => setEditing({ ...entry })}
                      >
                        {entry.highlight && (
                          <span className="plan-star">★</span>
                        )}
                        {entry.title || "제목 없음"}
                      </button>
                      {tools(entry)}
                    </header>
                    <div className="plan-entry-fields">
                      {entryFields(entry)}
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!group.entries.length && (
              <p className="plan-empty">
                {query
                  ? "검색 결과가 없습니다."
                  : "항목을 추가해 내용을 채우세요."}
              </p>
            )}
            {!readonly && !query && (
              <button
                className="button keep-label plan-add"
                onClick={() =>
                  addEntry(
                    m.planGroupBy?.startsWith("field:") ? "" : group.id,
                    m.planGroupBy?.startsWith("field:")
                      ? { [m.planGroupBy.slice(6)]: group.id }
                      : {},
                  )
                }
              >
                <Icon name="plus" />
                항목 추가
              </button>
            )}
          </section>
        ))}
        {!grouped.length && (
          <div className="plan-empty">
            등록된 항목 없음
            {!readonly && (
              <button className="button keep-label" onClick={() => addEntry()}>
                <Icon name="plus" />
                항목 추가
              </button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <Modal
          title={
            readonly ? "항목 상세" : editing.isNew ? "항목 추가" : "항목 편집"
          }
          onClose={() => setEditing(null)}
        >
          <form
            className="merge-form plan-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (readonly) {
                setEditing(null);
                return;
              }
              const { isNew, ...record } = editing;
              changeData((d: any) => ({
                ...d,
                entries: isNew
                  ? [...d.entries, record]
                  : d.entries.map((r: any) =>
                      r.id === record.id ? record : r,
                    ),
              }));
              setEditing(null);
            }}
          >
            <label>
              {data.titleLabel || "항목"}
              <input
                autoFocus
                value={editing.title}
                onChange={(e) => updateEntry({ title: e.target.value })}
                placeholder="제목을 입력하세요"
                maxLength={300}
                required
                readOnly={readonly}
              />
            </label>
            <label>
              그룹
              <select
                value={editing.groupId || ""}
                disabled={readonly}
                onChange={(e) => updateEntry({ groupId: e.target.value })}
              >
                <option value="">미분류</option>
                {data.groups.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            {data.fields.map((field: any) => (
              <label key={field.id}>
                {field.label}
                {field.type === "text" ? (
                  <textarea
                    aria-label={field.label}
                    value={editing.values?.[field.id] || ""}
                    readOnly={readonly}
                    placeholder={field.label + " 입력"}
                    onChange={(e) => updateField(field, e.target.value)}
                  />
                ) : ["text", "number", "date", "time"].includes(field.type) ? (
                  <input
                    aria-label={field.label}
                    type={field.type}
                    step={field.type === "number" ? "any" : undefined}
                    min={field.type === "number" ? 0 : undefined}
                    value={editing.values?.[field.id] ?? ""}
                    readOnly={readonly}
                    onChange={(e) =>
                      updateEntry({
                        values: {
                          ...editing.values,
                          [field.id]:
                            field.type === "number" && e.target.value !== ""
                              ? Number(e.target.value)
                              : e.target.value,
                        },
                      })
                    }
                  />
                ) : field.type === "check" ? (
                  <input
                    aria-label={field.label}
                    type="checkbox"
                    checked={!!editing.values?.[field.id]}
                    disabled={readonly}
                    onChange={(e) =>
                      updateEntry({
                        values: {
                          ...editing.values,
                          [field.id]: e.target.checked,
                        },
                      })
                    }
                  />
                ) : (
                  <select
                    aria-label={field.label}
                    value={editing.values?.[field.id] || ""}
                    disabled={readonly}
                    onChange={(e) => updateField(field, e.target.value)}
                  >
                    <option value="">선택하세요</option>
                    {editing.values?.[field.id] &&
                      !options(field, editing).some(
                        (o: any) => o.id === editing.values[field.id],
                      ) && (
                        <option value={editing.values[field.id]}>
                          기존 연결 · 다시 선택 가능
                        </option>
                      )}
                    {options(field, editing).map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            ))}
            {!readonly && (
              <div className="plan-record-flags">
                <label>
                  <input
                    type="checkbox"
                    checked={!!editing.highlight}
                    onChange={(e) =>
                      updateEntry({ highlight: e.target.checked })
                    }
                  />
                  중요 항목
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={!!editing.emphasis}
                    onChange={(e) =>
                      updateEntry({ emphasis: e.target.checked })
                    }
                  />
                  강조 카드
                </label>
              </div>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                className="button keep-label"
                onClick={() => setEditing(null)}
              >
                취소
              </button>
              <button className="button primary keep-label">
                {readonly ? "닫기" : "적용"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {settings && (
        <PlanningSettings
          module={m}
          modules={modules}
          data={data}
          workspace={w}
          readonly={readonly}
          onChange={changeView}
          onDataChange={changeData}
          onClose={() => setSettings(false)}
        />
      )}
    </div>
  );
}
function PlanningSettings({
  module: m,
  modules,
  data,
  workspace: w,
  readonly,
  onChange,
  onDataChange,
  onClose,
}: any) {
  const [name, setName] = useState(""),
    [type, setType] = useState("text"),
    [groupName, setGroupName] = useState("");
  function fieldChange(id: string, patch: any) {
    onDataChange((d: any) => ({
      ...d,
      fields: d.fields.map((f: any) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  }
  const teams = planningTeams(w);
  return (
    <Modal title="모듈 구성" onClose={onClose}>
      <div className="plan-form plan-settings">
        <h3>보기</h3>
        <label>
          제목
          <input
            aria-label="모듈 제목"
            disabled={(window as any).appAccount?.role === "viewer"}
            value={m.title || ""}
            onChange={(e) =>
              onChange((old: any) => ({ ...old, title: e.target.value }))
            }
          />
        </label>
        <label>
          카드 열 수
          <select
            value={m.planColumns || 2}
            onChange={(e) =>
              onChange((old: any) => ({
                ...old,
                planColumns: Number(e.target.value),
              }))
            }
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}열 · 좁은 화면에서는 자동 조절
              </option>
            ))}
          </select>
        </label>
        <label>
          그룹 기준
          <select
            value={m.planGroupBy || ""}
            onChange={(e) =>
              onChange((old: any) => ({ ...old, planGroupBy: e.target.value }))
            }
          >
            <option value="">직접 만든 그룹</option>
            {data.fields
              .filter((f: any) => ["select", "team"].includes(f.type))
              .map((f: any) => (
                <option key={f.id} value={"field:" + f.id}>
                  {f.label}
                </option>
              ))}
          </select>
        </label>
        <h3>데이터</h3>
        <label>
          데이터 연결
          <select
            aria-label="데이터 연결"
            disabled={(window as any).appAccount?.role === "viewer"}
            value={m.dataModuleId || ""}
            onChange={(e) => {
              const id = e.target.value;
              onChange((old: any) =>
                id
                  ? { ...old, dataModuleId: id }
                  : planningSnapshot(old, modules),
              );
            }}
          >
            <option value="">독립 데이터</option>
            {modules
              .filter(
                (other: any) =>
                  other.id !== m.id &&
                  !other.dataModuleId &&
                  planningKinds.includes(other.kind),
              )
              .map((other: any) => (
                <option key={other.id} value={other.id}>
                  {other.title || "모듈"}
                </option>
              ))}
          </select>
        </label>
        <p className="plan-help">
          같은 탭의 데이터를 공유합니다. 연결을 해제하면 현재 내용을 독립
          사본으로 유지합니다.
        </p>
        <label>
          항목 이름
          <input
            aria-label="항목 이름"
            disabled={readonly}
            value={data.titleLabel || "항목"}
            onChange={(e) =>
              onDataChange((d: any) => ({ ...d, titleLabel: e.target.value }))
            }
          />
        </label>
        <h3>속성</h3>
        <p className="plan-help">
          표·카드에 표시할 속성을 선택하세요. 이름·종류 변경은 연결된 보기에도
          반영됩니다.
        </p>
        {data.fields.map((field: any) => (
          <div className="plan-schema-field" key={field.id}>
            <div>
              <label className="plan-visibility">
                <input
                  type="checkbox"
                  aria-label={field.label + " 표시"}
                  checked={!(m.hiddenPlanFields || []).includes(field.id)}
                  onChange={(e) => {
                    const visible = e.target.checked;
                    onChange((old: any) => ({
                      ...old,
                      hiddenPlanFields: visible
                        ? (old.hiddenPlanFields || []).filter(
                            (id: string) => id !== field.id,
                          )
                        : [...(old.hiddenPlanFields || []), field.id],
                    }));
                  }}
                />
                표시
              </label>
              <input
                aria-label="속성 이름"
                disabled={readonly}
                value={field.label}
                onChange={(e) =>
                  fieldChange(field.id, { label: e.target.value })
                }
              />
              <select
                aria-label={field.label + " 종류"}
                disabled={readonly}
                value={field.type}
                onChange={(e) =>
                  fieldChange(field.id, { type: e.target.value })
                }
              >
                {fieldTypes.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              {!readonly && (
                <InlineRemove
                  label={field.label + " 속성 삭제"}
                  confirmationLabel="속성 삭제 확인"
                  onDelete={() =>
                    onDataChange((d: any) => ({
                      ...d,
                      fields: d.fields.filter((f: any) => f.id !== field.id),
                    }))
                  }
                />
              )}
            </div>
            {field.type === "select" && (
              <label>
                선택지 · 쉼표로 구분
                <input
                  aria-label={field.label + " 선택지"}
                  disabled={readonly}
                  value={(field.options || []).join(", ")}
                  onChange={(e) =>
                    fieldChange(field.id, {
                      options: [
                        ...new Set(
                          e.target.value.split(",").map((v) => v.trim()),
                        ),
                      ],
                    })
                  }
                  placeholder="예: 준비, 진행, 완료"
                />
              </label>
            )}
          </div>
        ))}
        {!readonly && (
          <form
            className="plan-inline-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onDataChange((d: any) => ({
                ...d,
                fields: [
                  ...d.fields,
                  {
                    id: uid(),
                    label: name.trim(),
                    type,
                    visible: true,
                    options: [],
                  },
                ],
              }));
              setName("");
            }}
          >
            <input
              aria-label="새 속성 이름"
              placeholder="새 속성 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <select
              aria-label="새 속성 종류"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {fieldTypes.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <button className="button keep-label" type="submit">
              <Icon name="plus" />
              속성 추가
            </button>
          </form>
        )}
        <h3>그룹</h3>
        {data.groups.map((group: any) => (
          <div className="plan-group-config" key={group.id}>
            <div>
              <input
                aria-label="그룹 이름"
                disabled={readonly}
                value={group.name}
                onChange={(e) =>
                  onDataChange((d: any) => ({
                    ...d,
                    groups: d.groups.map((g: any) =>
                      g.id === group.id ? { ...g, name: e.target.value } : g,
                    ),
                  }))
                }
              />
              {!readonly && (
                <InlineRemove
                  label={group.name + " 그룹 삭제"}
                  confirmationLabel="그룹 삭제 확인"
                  onDelete={() =>
                    onDataChange((d: any) => ({
                      ...d,
                      groups: d.groups.filter((g: any) => g.id !== group.id),
                      entries: d.entries.map((r: any) =>
                        r.groupId === group.id ? { ...r, groupId: "" } : r,
                      ),
                    }))
                  }
                />
              )}
            </div>
            <input
              aria-label="그룹 설명"
              placeholder="그룹 설명"
              disabled={readonly}
              value={group.note || ""}
              onChange={(e) =>
                onDataChange((d: any) => ({
                  ...d,
                  groups: d.groups.map((g: any) =>
                    g.id === group.id ? { ...g, note: e.target.value } : g,
                  ),
                }))
              }
            />
            <select
              aria-label={group.name + " 팀 연결"}
              disabled={readonly}
              value={group.teamId || ""}
              onChange={(e) =>
                onDataChange((d: any) => ({
                  ...d,
                  groups: d.groups.map((g: any) =>
                    g.id === group.id ? { ...g, teamId: e.target.value } : g,
                  ),
                }))
              }
            >
              <option value="">팀 연결 없이 사용</option>
              {teams.map((t: any) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {!readonly && (
          <form
            className="plan-inline-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (!groupName.trim()) return;
              onDataChange((d: any) => ({
                ...d,
                groups: [
                  ...d.groups,
                  { id: uid(), name: groupName.trim(), note: "" },
                ],
              }));
              setGroupName("");
            }}
          >
            <input
              aria-label="새 그룹 이름"
              value={groupName}
              placeholder="새 그룹 이름"
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
            <button className="button keep-label" type="submit">
              <Icon name="plus" />
              그룹 추가
            </button>
          </form>
        )}
        <div className="dialog-actions">
          <button className="button keep-label" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </Modal>
  );
}
