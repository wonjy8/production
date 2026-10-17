export const statuses = ["기획 중", "진행 중", "상시", "검토 중", "완료"] as const;
export type Status = (typeof statuses)[number];
export const stages = ["기획", "프리프로덕션", "촬영", "편집", "납품"] as const;
export const priorities = ["낮음", "보통", "높음"] as const;
export type Task = {
 repeat?:any;repeatBaseId?:string;repeatDate?:string;
  id: string;
  title: string;
  done: boolean;
  flagged?: boolean;
  stage: string;
  ownerId?: string;
  startTime?: string;
  endTime?: string;
  priority: (typeof priorities)[number];
  owner: string;
  due: string;
  description: string;
};
export type Schedule = {
 attachments?:any[];properties?:any[];eventGroupId?:string;_ownerKey?:string;
 repeat?:any;repeatBaseId?:string;repeatDate?:string;
  done?: boolean;
  projectLinked?: boolean;
  startTime?: string;
  endTime?: string;
  taskId?: string;
  id: string;
  title: string;
  date: string;
  endDate: string;
  location: string;
  note: string;
};
export type Asset = {
  id: string;
  name: string;
  kind: "file" | "link";
  url: string;
  size: number;
  mime: string;
  createdAt: string;
  archived: boolean;
};
export type Feedback = {
  id: string;
  body: string;
  author: string;
  timecode: string;
  assetId: string;
  resolved: boolean;
  createdAt: string;
  taskId: string;
};
export type MaterialItem = {x?:number;y?:number;width?:number;height?:number;id:string;name:string;kind:'image'|'video'|'text'|'pdf'|'document'|'file'|'link';text?:string;url?:string;mime?:string;size?:number};
export type MaterialGroup = {id:string;name:string;items:MaterialItem[]};
export type WorkspaceModule = {blockLayout?:boolean;parentSlot?:string;columnSlots?:string[];columnWeights?:number[];databaseCategories?:string[];databaseFields?:{id:string;label:string;type:string}[];databaseView?:string;gradeScale?:string;courses?:{id:string;name:string;credits:number|string;grade:string}[];columnId?:string;rowBreakBefore?:boolean;rowBreakAfter?:boolean;frameHeight?:number;tags?:string[];x?:number;y?:number;width?:number;height?:number;span?:number;groups?:MaterialGroup[];legacyImported?:boolean;scheduleKeys?:string[];id:string;title?:string;planData?:any;dataModuleId?:string|null;planView?:string;planColumns?:number;planGroupBy?:string;hiddenPlanFields?:string[];sectionNumber?:string;sectionNote?:string;kind:'columns'|'section-heading'|'group-list'|'progress-table'|'info-cards'|'assignment-table'|'database'|'wordcraft'|'grade-calculator'|'schedule-list'|'timetable'|'tasks'|'schedule'|'materials'|'text'|'image'|'video'|'file'|'link'|'embed'|'divider'|'accounting'|'checklist'|'tracker';fields?:string[];states?:string[];items?:{id:string;text:string;done:boolean}[];text?:string;url?:string;files?:MaterialItem[];rows?:{id:string;label:string;amount:number;type:'income'|'expense'}[];sourceCopy?:boolean;importSource?:{kind:'reference'|'project'|'production';ownerId:string;moduleId:string};source?:{kind:'reference'|'project'|'production';ownerId:string;moduleId:string};projectId?:string;config?:{slotHeight?:number;start?:string;end?:string;days?:number;projectIds?:string[]}};
export type CustomTab = {icon?:string;defaultBoard?:boolean;boardSection?:string;categories?:string[];tags?:string[];id:string;name:string;modules:WorkspaceModule[]};
export type Project = {
 groupType?:string;eventScheduleId?:string;calendarPreferences?:any;scheduleTemplates?:any[];
  completion?:any;completionRequested?:boolean;
  archives?:any[];
  customTabs?: CustomTab[];
  icon?: string;
  iconColor?: string;
  tabOrder?:string[];
  tabLabels?:Record<string,string>;
  tabIcons?:Record<string,string>;
  tabTags?:Record<string,string[]>;
  hiddenTabs?:string[];
  id: string;
  productionId: string;
  name: string;
  format: string;
  categoryId?: string;
  categoryIds?: string[];
  teamIds?: string[];
  status: Status;
  owner: string;
  due: string;
  description: string;
  tasks: Task[];
  schedules: Schedule[];
  assets: Asset[];
  feedback: Feedback[];
};
export type Team = {memberSort?:string;groupId?:string;id:string;name:string;leaderId:string;members:{memberId:string;role:string}[]};
export type ProjectCategory = {id:string;name:string;stages:string[];stageGroups?:Record<string,string>};
export type Production = {
 calendarPreferences?:any;scheduleTemplates?:any[];groupTemplates?:any[];
  completion?:any;completionRequested?:boolean;
  archives?:any[];
  status?:Status;
  due?:string;
  owner?:string;
  schedules?:Schedule[];
  customTabs?: CustomTab[];
  icon?: string;
  iconColor?: string;
  tabOrder?:string[];
  tabLabels?:Record<string,string>;
  tabIcons?:Record<string,string>;
  tabTags?:Record<string,string[]>;
  hiddenTabs?:string[];
  memberIds?: string[];
  memberOrder?:string[];
  teams?: Team[];
  teamGroups?:{id:string;name:string}[];
  id: string;
  name: string;
  description: string;
  tasks: Task[];
};
export type Member = { id: string; name: string;nameSuffix?:string;affiliation?:string;affiliations?:string[];kind?: 'personal'|'team';deleted?:boolean;contact?:string;email?:string };
export type Workspace = {
  equipment?:any[];
  timetableSchedules?:(Schedule&{moduleId:string;productionId?:string})[];
  projectCatalog?: ProjectCategory[];
  members: Member[];
  schemaVersion: 2;
  productions: Production[];
  projects: Project[];
};
const legacySeed = {
  productions: [
    {
      id: "studio",
      name: "Studio Original",
      description:
        "우리의 시선으로 만드는 오리지널 콘텐츠. 아이디어에서 마지막 프레임까지, 함께 만듭니다.",
    },
    {
      id: "brand",
      name: "Brand Films",
      description: "브랜드의 이야기를 발견하고, 오래 남는 장면으로 만듭니다.",
    },
  ],
  projects: [
    {
      id: "p1",
      productionId: "studio",
      name: "도시의 리듬",
      format: "Documentary",
      status: "진행 중",
      owner: "사용자A",
      due: "2026-10-09",
      description:
        "도시를 움직이는 사람들의 하루를 담는 다큐멘터리. 익숙한 풍경 속에서 새로운 리듬을 발견합니다.",
      tasks: [
        { id: "t1", title: "인터뷰 구성안 확정", done: true },
        { id: "t2", title: "로케이션 리서치", done: true },
        { id: "t3", title: "촬영 일정 조율", done: false },
        { id: "t4", title: "러프컷 편집", done: false },
      ],
    },
    {
      id: "p2",
      productionId: "studio",
      name: "Behind the Frame",
      format: "Series",
      status: "검토 중",
      owner: "사용자B",
      due: "2026-10-06",
      description:
        "좋은 장면 뒤에 숨은 제작자의 이야기. 제작 과정과 선택의 순간을 기록합니다.",
      tasks: [
        { id: "t1", title: "에피소드 편집", done: true },
        { id: "t2", title: "최종 피드백 반영", done: false },
      ],
    },
    {
      id: "p3",
      productionId: "studio",
      name: "가을의 기록",
      format: "Short film",
      status: "기획 중",
      owner: "사용자C",
      due: "2026-10-16",
      description: "계절이 바뀌는 순간을 빛과 소리로 기록하는 짧은 영화.",
      tasks: [
        { id: "t1", title: "트리트먼트 작성", done: false },
        { id: "t2", title: "레퍼런스 정리", done: false },
      ],
    },
    {
      id: "p4",
      productionId: "studio",
      name: "작은 작업실",
      format: "Interview",
      status: "완료",
      owner: "사용자A",
      due: "2026-09-28",
      description: "자신만의 공간에서 꾸준히 만드는 사람들과의 대화.",
      tasks: [
        { id: "t1", title: "마스터 파일 전달", done: true },
        { id: "t2", title: "아카이브 정리", done: true },
      ],
    },
    {
      id: "p5",
      productionId: "brand",
      name: "Everyday, differently",
      format: "Brand film",
      status: "진행 중",
      owner: "사용자B",
      due: "2026-10-12",
      description: "일상 속 새로운 가능성을 보여주는 브랜드 필름.",
      tasks: [
        { id: "t1", title: "스토리보드 확정", done: true },
        { id: "t2", title: "본 촬영", done: false },
      ],
    },
  ],
};
export function newTask(title: string): Task {
  return {
    id: crypto.randomUUID(),
    title,
    done: false,
    stage: "기획",
    priority: "보통",
    owner: "미지정",
    due: "",
    description: "",
  };
}
export function newProjectFields() {
  return {
    tasks: [] as Task[],
    schedules: [] as Schedule[],
    assets: [] as Asset[],
    feedback: [] as Feedback[],
  };
}
export const STORAGE_KEY = "media-production.workspace.v2";
const LEGACY_KEY = "media-production.workspace.v1";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const stringFields = (v: Record<string, unknown>, keys: string[]) =>
  keys.every((k) => typeof v[k] === "string");
export function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
function migrateTasks(value: unknown): Task[] | null {
  if (!Array.isArray(value)) return null;
  const tasks: Task[] = [];
  for (const t of value) {
    if (
      !record(t) ||
      !stringFields(t, ["id", "title"]) ||
      typeof t.done !== "boolean" ||
      tasks.some((task) => task.id === t.id)
    )
      return null;
    tasks.push({
      id: t.id as string,
      title: t.title as string,
      done: t.done,
      flagged: !!t.flagged,
      ...(typeof t.startTime==='string'?{startTime:t.startTime}:{}),
      ...(typeof t.endTime==='string'?{endTime:t.endTime}:{}),
      stage: typeof t.stage==='string'&&t.stage.trim()?t.stage:"기획",
      ...(typeof t.ownerId==='string'?{ownerId:t.ownerId}:{}),
      priority: priorities.includes(t.priority as Task["priority"])
        ? (t.priority as Task["priority"])
        : "보통",
      owner: typeof t.owner === "string" ? t.owner : "미지정",
      due: typeof t.due === "string" ? t.due : "",
      description: typeof t.description === "string" ? t.description : "",
    });
  }
  return tasks;
}
export function migrateWorkspace(value: unknown): Workspace | null {
  if (
    !record(value) ||
    !Array.isArray(value.productions) ||
    !Array.isArray(value.projects)
  )
    return null;
  if (value.schemaVersion !== undefined && value.schemaVersion !== 2)
    return null;
  const productions: Production[] = [];
  for (const raw of value.productions) {
    if (
      !record(raw) ||
      !stringFields(raw, ["id", "name", "description"]) ||
      productions.some((p) => p.id === raw.id)
    )
      return null;
    const tasks = migrateTasks(raw.tasks ?? []);
    if (!tasks) return null;
    productions.push({ ...raw, tasks } as Production);
  }
  const projects: Project[] = [];
  for (const raw of value.projects) {
    if (
      !record(raw) ||
      !stringFields(raw, [
        "id",
        "productionId",
        "name",
        "format",
        "owner",
        "due",
        "description",
      ]) ||
      !statuses.includes(raw.status as Status) ||
      !Array.isArray(raw.tasks) ||
      !productions.some((p) => p.id === raw.productionId) ||
      projects.some((p) => p.id === raw.id)
    )
      return null;
    const tasks = migrateTasks(raw.tasks);
    if (!tasks) return null;
    const schedules = raw.schedules ?? [];
    const assets = raw.assets ?? [];
    const feedback = raw.feedback ?? [];
    if (
      !Array.isArray(schedules) ||
      !schedules.every(
        (s) =>
          record(s) &&
          stringFields(s, [
            "id",
            "title",
            "date",
            "endDate",
            "location",
            "note",
          ]),
      )
    )
      return null;
    if (
      !Array.isArray(assets) ||
      !assets.every(
        (a) =>
          record(a) &&
          stringFields(a, ["id", "name", "url", "mime", "createdAt"]) &&
          ["file", "link"].includes(a.kind as string) &&
          typeof a.size === "number" &&
          typeof a.archived === "boolean" &&
          (a.kind === "file" || safeUrl(a.url as string)),
      )
    )
      return null;
    if (
      !Array.isArray(feedback) ||
      !feedback.every(
        (f) =>
          record(f) &&
          stringFields(f, [
            "id",
            "body",
            "author",
            "timecode",
            "assetId",
            "createdAt",
            "taskId",
          ]) &&
          typeof f.resolved === "boolean",
      )
    )
      return null;
    for (const items of [schedules, assets, feedback])
      if (new Set(items.map((i) => i.id)).size !== items.length) return null;
    if (
      feedback.some(
        (f) =>
          (f.assetId && !assets.some((a) => a.id === f.assetId)) ||
          (f.taskId && !tasks.some((t) => t.id === f.taskId)),
      )
    )
      return null;
    projects.push({ ...raw, tasks, schedules, assets, feedback } as Project);
  }
  const members: Member[] = [];
  if (value.members !== undefined) {
    if (!Array.isArray(value.members)) return null;
    for (const m of value.members) {
      if (
        !record(m) ||
        !stringFields(m, ["id", "name"]) ||
        !String(m.name).trim() ||
        members.some((item) => item.id === m.id || item.name === m.name)
      )
        return null;
      members.push(m as Member);
    }
  }
  for (const name of [
    ...productions.flatMap((p) => p.tasks.map((t) => t.owner)),
    ...projects.flatMap((p) => [p.owner, ...p.tasks.map((t) => t.owner)]),
  ]) {
    if (name && name !== "미지정" && !members.some((m) => m.name === name))
      members.push({ id: `legacy-member-${encodeURIComponent(name)}`, name });
  }
  return { schemaVersion: 2, productions, projects, members, ...(Array.isArray(value.timetableSchedules)?{timetableSchedules:value.timetableSchedules as Workspace["timetableSchedules"]}:{}), ...(Array.isArray(value.projectCatalog)?{projectCatalog:value.projectCatalog as ProjectCategory[]}:{}) };
}
export const seed: Workspace = migrateWorkspace(legacySeed)!;
seed.projects[0].tasks = seed.projects[0].tasks.map((t, i) => ({
  ...t,
  stage: stages[Math.min(i, 4)],
  owner: "사용자A",
  due: `2026-10-${String(5 + i).padStart(2, "0")}`,
}));
seed.projects[0].schedules = [
  {
    id: "schedule-sample",
    title: "도심 로케이션 촬영",
    date: "2026-10-07",
    endDate: "2026-10-08",
    location: "예시 장소",
    note: "오전 9시 집결 · 장비 체크 후 인터뷰 촬영",
  },
];
seed.projects[0].feedback = [
  {
    id: "feedback-sample",
    body: "오프닝에서 도시의 현장음을 조금 더 살려주세요.",
    author: "사용자A",
    timecode: "00:00:12",
    assetId: "",
    resolved: false,
    createdAt: "2026-10-03T00:00:00+09:00",
    taskId: "",
  },
];
function parseSaved(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
export function loadWorkspace(): Workspace {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const workspace = migrateWorkspace(parseSaved(saved));
      if (workspace) return workspace;
      // Preserve invalid content for recovery before falling back.
      localStorage.setItem(`${STORAGE_KEY}.recovery`, saved);
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateWorkspace(parseSaved(legacy));
      if (migrated) return migrated;
    }
  } catch {
    /* Storage unavailable: keep working in memory. */
  }
  return structuredClone(seed);
}
export function saveWorkspace(w: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
}
export function progress(p: Project) {
  return p.tasks.length
    ? Math.round((p.tasks.filter((t) => t.done).length / p.tasks.length) * 100)
    : 0;
}
export function dateLabel(date: string) {
  if (!date) return "미정";
  const parts = date.split("-");
  return `${Number(parts[1])}월 ${Number(parts[2])}일`;
}

