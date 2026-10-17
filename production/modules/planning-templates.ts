// Canonical TypeScript implementation; ../planning-templates.js is a compatibility export.
import { planningData } from "../planning-model.js";
export const planningModuleTemplates = [
  {
    id: "section-heading",
    category: "basic",
    name: "섹션 제목",
    description: "번호·제목·설명으로 화면 구역 구분",
    icon: "list",
    kind: "section-heading",
  },
  {
    id: "group-list",
    category: "basic",
    name: "그룹 목록",
    description: "그룹별 항목과 자유로운 속성",
    icon: "list",
    kind: "group-list",
  },
  {
    id: "progress-table",
    category: "work",
    name: "진행표",
    description: "시간·순서·담당자를 표나 카드로 정리",
    icon: "calendar",
    kind: "progress-table",
  },
  {
    id: "info-cards",
    category: "basic",
    name: "안내 카드",
    description: "운영 안내·준비물·지침을 카드로 정리",
    icon: "file",
    kind: "info-cards",
  },
  {
    id: "assignment-table",
    category: "work",
    name: "배치표",
    description: "팀·멤버·장비와 역할·자리를 연결",
    icon: "users",
    kind: "assignment-table",
  },
];
export const planningTabTemplates = [
  {
    id: "event-operations",
    category: "work",
    name: "행사 운영",
    description: "순서·진행 시간·안내·담당 배치",
    icon: "calendar",
    modules: [],
  },
  {
    id: "filming-operations",
    category: "media",
    name: "촬영 운영",
    description: "세션별 목록·큐시트·운영 안내·팀 배치",
    icon: "camera",
    modules: [],
  },
  {
    id: "lesson-plan",
    category: "school",
    name: "수업 계획",
    description: "차시별 주제·시간·준비물·역할",
    icon: "book",
    modules: [],
  },
  {
    id: "travel-plan",
    category: "work",
    name: "여행 계획",
    description: "코스·시간·준비물·담당",
    icon: "folder",
    modules: [],
  },
];
export function planningInitial(kind) {
  return kind === "section-heading"
    ? { span: 12, sectionNumber: "", sectionNote: "" }
    : {
        span: 12,
        planData: planningData(kind),
        planView: "cards",
        planColumns: kind === "info-cards" ? 3 : 2,
      };
}
export function populatePlanningTab(id, create) {
  const labels = {
    "filming-operations": [
      "촬영 운영",
      "세션별 순서",
      "큐시트",
      "촬영 안내",
      "팀·자리 배치",
      "세션 1",
      "세션 2",
      "촬영",
      "전환",
    ],
    "event-operations": [
      "행사 운영",
      "행사 순서",
      "진행표",
      "운영 안내",
      "담당 배치",
      "1부",
      "2부",
      "진행",
      "휴식",
    ],
    "lesson-plan": [
      "수업 계획",
      "차시별 주제",
      "수업 진행",
      "준비 안내",
      "역할 배치",
      "1차시",
      "2차시",
      "강의",
      "실습",
    ],
    "travel-plan": [
      "여행 계획",
      "여행 코스",
      "이동 일정",
      "준비물",
      "담당 배치",
      "첫째 날",
      "둘째 날",
      "방문",
      "이동",
    ],
  }[id];
  if (!labels) return null;
  const [
    name,
    listTitle,
    progressTitle,
    infoTitle,
    assignmentTitle,
    g1,
    g2,
    tag1,
    tag2,
  ] = labels;
  const section = (number, title) => ({
    ...create("section-heading"),
    title,
    sectionNumber: number,
  });
  const list = { ...create("group-list"), title: listTitle },
    data = planningData("progress-table");
  data.fields.splice(3, 0, {
    id: "tag",
    label: "태그",
    type: "select",
    options: [tag1, tag2],
    visible: true,
  });
  data.groups = [
    {
      id: crypto.randomUUID(),
      name: g1,
      note: "시간과 내용을 프로젝트에 맞게 수정하세요",
    },
    { id: crypto.randomUUID(), name: g2, note: "" },
  ];
  data.entries = [
    {
      id: crypto.randomUUID(),
      title:
        id === "filming-operations"
          ? "첫 순서 · 제목을 입력하세요"
          : id === "lesson-plan"
            ? "도입 · 학습 목표"
            : id === "travel-plan"
              ? "첫 장소"
              : "시작 안내",
      groupId: data.groups[0].id,
      highlight: true,
      values: {
        time: "09:00",
        duration: 15,
        tag: tag1,
        note: "항목을 눌러 세부 내용을 편집하세요",
      },
    },
    {
      id: crypto.randomUUID(),
      title:
        id === "lesson-plan"
          ? "활동 · 주제 탐구"
          : id === "travel-plan"
            ? "다음 장소"
            : "다음 순서",
      groupId: data.groups[0].id,
      values: { time: "09:15", duration: 30, tag: tag2 },
    },
    {
      id: crypto.randomUUID(),
      title: "이어서 진행",
      groupId: data.groups[1].id,
      values: { time: "10:00", duration: 20, tag: tag1 },
    },
  ];
  list.planData = data;
  list.hiddenPlanFields = ["time", "duration", "type"];
  const progress = {
    ...create("progress-table"),
    title: progressTitle,
    dataModuleId: list.id,
  };
  const info = { ...create("info-cards"), title: infoTitle };
  info.planData.entries = [
    {
      id: crypto.randomUUID(),
      title: "공통 안내",
      emphasis: true,
      values: {
        body: "꼭 확인할 내용을 입력하세요.\n• 준비 사항\n• 연락 방법",
      },
    },
    {
      id: crypto.randomUUID(),
      title: "준비물",
      values: { body: "• 공통 준비물\n• 역할별 준비물" },
    },
    {
      id: crypto.randomUUID(),
      title: "운영 메모",
      values: { body: "상황에 맞는 안내를 자유롭게 기록하세요." },
    },
  ];
  const assignments = { ...create("assignment-table"), title: assignmentTitle };
  assignments.planData.titleLabel = "역할 / 자리";
  assignments.planData.entries = [
    { id: crypto.randomUUID(), title: "자리 1", values: {} },
    { id: crypto.randomUUID(), title: "자리 2", values: {} },
  ];
  assignments.planGroupBy = "field:team";
  return {
    id: crypto.randomUUID(),
    name,
    tags: [],
    modules: [
      section("01", listTitle),
      list,
      section("02", progressTitle),
      progress,
      section("03", infoTitle),
      info,
      section("04", assignmentTitle),
      assignments,
    ],
  };
}
