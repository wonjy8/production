// One record schema powers lists, timelines, information cards and assignments.
export const planningKinds = [
  "group-list",
  "progress-table",
  "info-cards",
  "assignment-table",
];
export const fieldTypes = [
  ["text", "텍스트"],
  ["number", "숫자"],
  ["date", "날짜"],
  ["time", "시간"],
  ["select", "선택"],
  ["check", "체크"],
  ["team", "팀"],
  ["member", "멤버"],
  ["equipment", "장비"],
  ["resource", "자료"],
  ["schedule", "일정"],
];
const clone = (value) => JSON.parse(JSON.stringify(value));
export function planningData(kind) {
  const f = (id, label, type = "text", options) => ({
    id,
    label,
    type,
    ...(options ? { options } : {}),
    visible: true,
  });
  const fields =
    kind === "progress-table"
      ? [
          f("time", "시작", "time"),
          f("duration", "소요 시간 (분)", "number"),
          f("type", "구분", "select", []),
          f("owner", "담당자", "member"),
          f("note", "메모"),
        ]
      : kind === "assignment-table"
        ? [
            f("team", "팀", "team"),
            f("person", "담당자", "member"),
            f("equipment", "장비", "equipment"),
            f("note", "메모"),
          ]
        : kind === "info-cards"
          ? [f("body", "내용"), f("note", "비고")]
          : [
              f("description", "설명"),
              f("tag", "태그", "select", []),
              f("note", "메모"),
            ];
  return { titleLabel: "항목", fields, groups: [], entries: [] };
}
export function planningSource(module, modules = []) {
  let source = module;
  const seen = new Set();
  while (source?.dataModuleId) {
    if (seen.has(source.id)) return null;
    seen.add(source.id);
    const next = modules.find(
      (m) => m.id === source.dataModuleId && planningKinds.includes(m.kind),
    );
    if (!next) return null;
    source = next;
  }
  return source || null;
}
export function planningSnapshot(module, modules = []) {
  if (!planningKinds.includes(module.kind)) return module;
  const source = planningSource(module, modules);
  return {
    ...clone(module),
    dataModuleId: null,
    planData: clone(
      source?.planData || module.planData || planningData(module.kind),
    ),
  };
}
export function removePlanningModule(modules, id) {
  // A view remains usable when its data owner is deleted.
  return modules
    .filter((m) => m.id !== id)
    .map((m) =>
      m.dataModuleId &&
      (m.dataModuleId === id || planningSource(m, modules)?.id === id)
        ? planningSnapshot(m, modules)
        : m,
    );
}
export function planningTeams(workspace) {
  return (workspace.productions || [])
    .filter((p) => !p.deleted)
    .flatMap((p) =>
      (p.teams || []).map((t) => ({
        ...t,
        key: p.id + ":" + t.id,
        label: p.name + " / " + t.name,
      })),
    );
}
export function planningMembers(workspace, teamKey) {
  const team = planningTeams(workspace).find((t) => t.key === teamKey),
    ids = team && new Set((team.members || []).map((m) => m.memberId));
  return (workspace.members || []).filter(
    (m) => !m.deleted && m.kind !== "team" && (!ids || ids.has(m.id)),
  );
}
export function planningSchedules(workspace) {
  return [
    ...(workspace.projects || [])
      .filter((p) => !p.deleted)
      .flatMap((p) =>
        (p.schedules || []).map((s) => ({
          ...s,
          key: "project:" + p.id + ":" + s.id,
          label: p.name + " / " + s.title,
        })),
      ),
    ...(workspace.productions || [])
      .filter((p) => !p.deleted)
      .flatMap((p) =>
        (p.schedules || []).map((s) => ({
          ...s,
          key: "production:" + p.id + ":" + s.id,
          label: p.name + " / " + s.title,
        })),
      ),
    ...(workspace.timetableSchedules || []).map((s) => ({
      ...s,
      key: "timetable:" + s.id,
      label: s.title,
    })),
  ];
}
export function planningEquipment(workspace) {
  return (workspace.equipment || [])
    .filter((e) => !e.deleted)
    .flatMap((e) =>
      (e.inventory || []).map((i) => ({
        ...i,
        key: e.id + ":" + i.id,
        label: [
          workspace.members?.find((m) => m.id === e.ownerId)?.name,
          i.name,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    );
}
export function planningGroups(data, groupBy, workspace) {
  if (groupBy?.startsWith("field:")) {
    const id = groupBy.slice(6),
      field = data.fields.find((f) => f.id === id);
    if (field) {
      const teams = planningTeams(workspace);
      const values = [
        ...new Set(
          data.entries.map((e) => String(e.values?.[id] ?? "")).filter(Boolean),
        ),
      ];
      return [
        ...values.map((value) => ({
          id: value,
          name:
            field.type === "team"
              ? teams.find((t) => t.key === value)?.label || "연결된 팀 없음"
              : value,
          entries: data.entries.filter(
            (e) => String(e.values?.[id] ?? "") === value,
          ),
        })),
        ...(data.entries.some((e) => !e.values?.[id])
          ? [
              {
                id: "",
                name: "미분류",
                entries: data.entries.filter((e) => !e.values?.[id]),
              },
            ]
          : []),
      ];
    }
  }
  const groups = (data.groups || []).map((g) => ({
      ...g,
      entries: data.entries.filter((e) => e.groupId === g.id),
    })),
    ungrouped = data.entries.filter(
      (e) => !data.groups?.some((g) => g.id === e.groupId),
    );
  if (ungrouped.length || !groups.length)
    groups.push({
      id: "",
      name: groups.length ? "미분류" : "",
      entries: ungrouped,
    });
  return groups;
}
export function movePlanningEntry(
  data,
  id,
  delta,
  groupBy = "",
  workspace = {},
) {
  const group = planningGroups(data, groupBy, workspace).find((g) =>
    g.entries.some((e) => e.id === id),
  );
  const index = group?.entries.findIndex((e) => e.id === id) ?? -1,
    target = index + delta;
  if (index < 0 || target < 0 || target >= group.entries.length) return data;
  const entries = [...data.entries],
    from = entries.findIndex((e) => e.id === id),
    to = entries.findIndex((e) => e.id === group.entries[target].id);
  [entries[from], entries[to]] = [entries[to], entries[from]];
  return { ...data, entries };
}
export function visiblePlanningFields(data, hidden = []) {
  return data.fields.filter(
    (f) => f.visible !== false && !hidden.includes(f.id),
  );
}
export function planningUniverse(workspace, refs = []) {
  return [
    ...(workspace.projects || []),
    ...(workspace.productions || []),
    ...refs,
  ].flatMap((p) =>
    (p.customTabs || p.tabs || []).flatMap((t) => t.modules || []),
  );
}
