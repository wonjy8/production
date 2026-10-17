// Canonical TypeScript implementation; ../resource-schema.js is a compatibility export.
export const resourceDefaults = {
  databaseCategories: [],
  databaseFields: [
    { id: "category", label: "분류", type: "select" },
    { id: "date", label: "날짜", type: "date" },
    { id: "description", label: "설명", type: "text" },
  ],
};
const preset = (id, name, categories, fields) => ({
  id,
  name,
  databaseCategories: categories,
  databaseFields: [
    ...resourceDefaults.databaseFields,
    ...fields.map(([id, label, type = "text"]) => ({ id, label, type })),
  ],
});
export const resourcePresets = [
  preset(
    "podcast",
    "팟캐스트",
    ["기획", "녹음", "편집", "발행"],
    [
      ["episode", "에피소드"],
      ["guest", "게스트"],
      ["recorded", "녹음일", "date"],
    ],
  ),
  preset(
    "performance",
    "공연 기록",
    ["공연", "리허설", "인터뷰"],
    [
      ["performance", "공연명"],
      ["session", "회차"],
      ["position", "촬영 위치"],
    ],
  ),
  preset(
    "video",
    "영상 제작",
    ["기획", "촬영", "편집", "납품"],
    [
      ["scene", "장면"],
      ["location", "장소"],
      ["take", "테이크"],
    ],
  ),
  preset(
    "photo",
    "사진 캠페인",
    ["레퍼런스", "촬영", "선별", "납품"],
    [
      ["campaign", "캠페인"],
      ["subject", "피사체"],
      ["location", "촬영 장소"],
    ],
  ),
];
export function applyResourcePreset(schema, preset) {
  return {
    databaseCategories: [
      ...new Set([
        ...(schema.databaseCategories || []),
        ...preset.databaseCategories,
      ]),
    ],
    databaseFields: [
      ...(schema.databaseFields || []),
      ...preset.databaseFields.filter(
        (f) => !(schema.databaseFields || []).some((old) => old.id === f.id),
      ),
    ],
  };
}
export function resourceSearchText(row, workspace:{projects?:any[];productions?:any[]} = {}) {
  const origins = row.origins || [];
  const related = [
    ...(workspace.projects || []),
    ...(workspace.productions || []),
  ].filter((p) => origins.some((o) => o.ownerId === p.id));
  return [
    row.title,
    row.filename,
    row.url,
    ...(row.tags || []),
    ...Object.values(row.properties || {}),
    ...origins.map((o) =>
      [o.ownerName, o.tabName, o.projectName].filter(Boolean).join(" "),
    ),
    ...related.flatMap((p) => [
      p.name,
      p.title,
      (workspace.productions || []).find((g) => g.id === p.productionId)?.name,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase();
}
