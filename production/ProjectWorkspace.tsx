import {
  taskStatusGroups,
  stageGroup,
  taskGroup as statusGroup,
  moveTaskGroup,
  saveTaskStage,
} from "./task-status.js";
import { ScheduleDateTime, TimeInput } from "./ScheduleDateTime";
import { defaultScheduleTimes } from "./schedule-time.js";
import {
  CALENDAR_DRAG_TYPE,
  moveCalendarItem,
  setCalendarDragImage,
  clearCalendarDragImage,
} from "./calendar-drag.js";
import { delayedPointerDrag } from "../ui/touch-drag.js";
import { itemMenuBindings } from "../ui/item-menu.js";
import { assigneeLabel } from "./people-model.js";
import { useEffect, useRef, useState } from "react";
import {
  Flag,
  Filter,
  Archive,
  ArrowDownToLine,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  File,
  Film,
  Link,
  ListChecks,
  MessageSquare,
  Plus,
  RotateCcw,
  Trash2,
} from "../ui/design-system/Icons";
import { dateLabel, newTask, priorities, safeUrl, stages } from "./data";
import type { Asset, Feedback, Project, Schedule, Task } from "./data";
import { minutes, timeLabel } from "./timetable-model.js";
import { TaskComposer } from "./TaskComposer";
import { AssigneePicker } from "./AssigneePicker";
import type { Member } from "./data";
import { InlineEdit } from "./InlineEdit";
import { Modal } from "./Modal";
import { downloadBlob, fileSize, readFile, storeFile } from "./files";
export type ProjectSection =
  "overview" | "tasks" | "schedule" | "assets" | "feedback";
export const projectSections = [
  { id: "overview", label: "개요", icon: Film },
  { id: "tasks", label: "할 일", icon: ListChecks },
  { id: "schedule", label: "일정", icon: CalendarDays },
] as const;
type Change = (update: (project: Project) => Project) => void;
function DeleteButton({
  label,
  onDelete,
}: {
  label: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-button context-remove"
        aria-label={`${label} 삭제`}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={14} />
      </button>
      {open && (
        <Modal title="삭제 확인" onClose={() => setOpen(false)}>
          <p>‘{label}’을 삭제할까요? 이 항목은 복구할 수 없습니다.</p>
          <div className="dialog-actions">
            <button className="button" onClick={() => setOpen(false)}>
              취소
            </button>
            <button
              className="button primary"
              onClick={() => {
                onDelete();
                setOpen(false);
              }}
            >
              삭제
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function field(data: FormData, name: string) {
  return String(data.get(name) ?? "").trim();
}
function dateString(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function ProjectWorkspace({
  project,
  members,
  onAddMember,
  section,
  onChange,
  onSectionChange,
  hideNavigation = false,
  taskSources,
  sourceFilter = "전체",
  stageOptions = stages as readonly string[],
  allowMemberAdd = true,
  taskStageOptions,
  stageGroups = {},
  taskStageGroups,
  taskMemberOptions,
}: {
  stageGroups?: Record<string, string>;
  taskStageGroups?: Record<string, Record<string, string>>;
  stageOptions?: readonly string[];
  allowMemberAdd?: boolean;
  taskStageOptions?: Record<string, readonly string[]>;
  taskMemberOptions?: Record<string, Member[]>;
  hideNavigation?: boolean;
  taskSources?: Record<string, string>;
  sourceFilter?: string;
  project: Project;
  members: Member[];
  onAddMember: (name: string) => void;
  section: ProjectSection;
  onChange: Change;
  onSectionChange: (s: ProjectSection) => void;
}) {
  const [completedTasksOpen, setCompletedTasksOpen] = useState(false);
  const [taskEditor, setTaskEditor] = useState<Task | null>(null);
  const [taskTools, setTaskTools] = useState(false),
    [taskSource, setTaskSource] = useState("전체"),
    [taskGroup, setTaskGroup] = useState("없음"),
    [taskSort, setTaskSort] = useState("등록순");
  const [taskFilter, setTaskFilter] = useState("전체");
  const [taskQuery, setTaskQuery] = useState("");
  const [taskLayout, setTaskLayout] = useState<"list" | "board">(() => {
    try {
      return localStorage.getItem("pn-task-layout:" + project.id) === "board"
        ? "board"
        : "list";
    } catch {
      return "list";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("pn-task-layout:" + project.id, taskLayout);
    } catch {}
  }, [project.id, taskLayout]);
  const [calendarDropDay, setCalendarDropDay] = useState("");
  const calendarGesture = useRef<any>(null),
    suppressCalendarClick = useRef(0);
  const [calendarDraft, setCalendarDraft] = useState(false);
  const [calendarPending, setCalendarPending] = useState<string[]>([]);
  const completionTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  useEffect(
    () => () => {
      completionTimers.current.forEach(clearTimeout);
      completionTimers.current.clear();
    },
    [project.id],
  );
  function completeCalendarTask(id: string) {
    const timers = completionTimers.current;
    if (timers.has(id)) {
      clearTimeout(timers.get(id));
      timers.delete(id);
      setCalendarPending((ids) => ids.filter((v) => v !== id));
      return;
    }
    setCalendarPending((ids) => [...ids, id]);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        onChange((p) => ({
          ...p,
          tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: true } : t)),
        }));
        setCalendarPending((ids) => ids.filter((v) => v !== id));
      }, 1500),
    );
  }

  const [scheduleEditor, setScheduleEditor] = useState<Schedule | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [linkEditor, setLinkEditor] = useState(false);

  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ asset: Asset; url: string } | null>(
    null,
  );
  const upload = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  useEffect(() => {
    const target = window.productionSearchTarget;
    if (!target) return;
    const id = target.projectId
      ? target.entityId
      : JSON.stringify([null, target.entityId]);
    if (target.kind === "task") {
      const task = project.tasks.find((t) => t.id === id);
      if (task) {
        setTaskEditor(task);
        window.productionSearchTarget = undefined;
      }
    } else if (target.kind === "schedule") {
      const item = project.schedules.find((s) => s.id === id);
      if (item) {
        setScheduleEditor(item);
        window.productionSearchTarget = undefined;
      }
    } else if (target.kind === "asset") {
      const item = project.assets.find((a) => a.id === id);
      if (item) {
        setArchived(item.archived);
        window.productionSearchTarget = undefined;
        setTimeout(
          () =>
            document
              .querySelector('[data-search-asset="' + id + '"]')
              ?.scrollIntoView({ behavior: "smooth", block: "center" }),
          100,
        );
      }
    }
  }, [project.id, section]);
  const today = dateString(new Date());
  const tasks = project.tasks.filter(
    (t) =>
      (taskFilter === "전체" || (taskFilter === "완료" ? t.done : !t.done)) &&
      (!taskSources ||
        (taskSource === "전체" ? sourceFilter : taskSource) === "전체" ||
        taskSources[t.id] ===
          (taskSource === "전체" ? sourceFilter : taskSource)) &&
      `${t.title} ${t.owner}`.toLowerCase().includes(taskQuery.toLowerCase()),
  );
  tasks.sort((a, b) =>
    taskSort === "마감일순"
      ? (a.due || "9999").localeCompare(b.due || "9999")
      : taskSort === "이름순"
        ? a.title.localeCompare(b.title, "ko")
        : taskSort === "우선순위순"
          ? priorities.indexOf(b.priority) - priorities.indexOf(a.priority)
          : 0,
  );
  const mappingFor = (t: Task) => taskStageGroups?.[t.id] || stageGroups;
  const parentGroup = (t: Task) => statusGroup(t, mappingFor(t));
  function groupLabel(t: Task) {
    return taskGroup === "프로젝트"
      ? taskSources?.[t.id] || project.name
      : taskGroup === "담당자"
        ? assigneeLabel(members, t.owner, t.ownerId)
        : taskGroup === "상태"
          ? parentGroup(t)
          : t.stage;
  }
  const editorStages = taskEditor
    ? taskStageOptions?.[taskEditor.id] || stageOptions
    : stageOptions;
  const editorGroups = taskEditor ? mappingFor(taskEditor) : stageGroups;
  const editorMembers = taskEditor
    ? taskMemberOptions?.[taskEditor.id] || members
    : members;
  function saveTask(task: Task) {
    task = saveTaskStage(
      task,
      project.tasks.find((t) => t.id === task.id),
      mappingFor(task),
    );
    onChange((p) => ({
      ...p,
      tasks: p.tasks.some((t) => t.id === task.id)
        ? p.tasks.map((t) => (t.id === task.id ? task : t))
        : [...p.tasks, task],
    }));
    setTaskEditor(null);
    setCalendarDraft(false);
  }
  function toggleTask(id: string) {
    onChange((p) => ({
      ...p,
      tasks: p.tasks.map((t) =>
        t.id === id
          ? t.done && stageGroup(t.stage, mappingFor(t)) === "완료"
            ? moveTaskGroup(
                t,
                "시작 전",
                taskStageOptions?.[t.id] || stageOptions,
                mappingFor(t),
              )
            : { ...t, done: !t.done }
          : t,
      ),
    }));
  }
  function openCalendarDraft(date: string) {
    setCalendarDraft(true);
    setScheduleEditor({
      id: crypto.randomUUID(),
      title: "",
      ...defaultScheduleTimes(date),
      location: "",
      note: "",
    });
  }
  function switchDraft(kind: string, event: any) {
    if (
      (kind === "schedule" && scheduleEditor) ||
      (kind === "task" && taskEditor)
    )
      return;
    const form = event.currentTarget.closest("dialog")?.querySelector("form"),
      data = form ? new FormData(form) : null;
    const title = data
        ? field(data, "title")
        : scheduleEditor?.title || taskEditor?.title || "",
      date = data
        ? field(data, "date") || field(data, "due")
        : scheduleEditor?.date || taskEditor?.due || today;
    const startTime = data ? field(data, "startTime") : "",
      endTime = data ? field(data, "endTime") : "";
    if (kind === "task") {
      setScheduleEditor(null);
      setTaskEditor({
        ...newTask(title),
        due: date,
        startTime,
        endTime,
        stage: stageOptions[0],
        description: data ? field(data, "note") : "",
      });
    } else {
      setTaskEditor(null);
      setScheduleEditor({
        id: crypto.randomUUID(),
        title,
        date,
        endDate: date,
        startTime,
        endTime,
        location: "",
        note: data ? field(data, "description") : "",
      });
    }
  }
  const draftPicker = calendarDraft && (
    <div className="calendar-kind-switch" role="group" aria-label="추가 항목">
      <button
        type="button"
        className="keep-label"
        aria-pressed={!!scheduleEditor}
        onClick={(e) => switchDraft("schedule", e)}
      >
        일정
      </button>
      <button
        type="button"
        className="keep-label"
        aria-pressed={!!taskEditor}
        onClick={(e) => switchDraft("task", e)}
      >
        할 일
      </button>
    </div>
  );
  function taskMenu(t: Task) {
    return itemMenuBindings([
      { label: "이름 변경", icon: "edit", run: () => setTaskEditor(t) },
      { label: "단계 이동", icon: "folder", run: () => setTaskEditor(t) },
      {
        label: "삭제",
        icon: "trash",
        danger: true,
        run: () =>
          onChange((p) => ({
            ...p,
            tasks: p.tasks.filter((item) => item.id !== t.id),
            schedules: p.schedules.map((s) =>
              s.taskId === t.id ? { ...s, taskId: "" } : s,
            ),
          })),
      },
    ]);
  }
  function moveDate(payload: any, target: string) {
    if (payload?.projectId !== project.id) {
      calendarGesture.current = null;
      setCalendarDropDay("");
      return;
    }
    onChange((p) =>
      moveCalendarItem(p, payload.kind, payload.id, target, payload.anchor),
    );
    suppressCalendarClick.current = Date.now() + 600;
    calendarGesture.current = null;
    setCalendarDropDay("");
  }
  function dragBindings(kind: string, id: string, anchor: string) {
    const payload = { kind, id, anchor, projectId: project.id };
    return {
      ...delayedPointerDrag({
        onPointerDown: (e: any) => {
          if (
            e.pointerType === "mouse" ||
            e.target.closest(".calendar-task-check")
          )
            return;
          setCalendarDragImage(e);
          calendarGesture.current = {
            ...payload,
            grid: e.currentTarget.closest(".calendar-grid"),
          };
        },
        onPointerMove: (e: any) => {
          const gesture = calendarGesture.current;
          if (!gesture?.grid) return;
          const cell = [
            ...gesture.grid.querySelectorAll("[data-calendar-date]"),
          ].find((node: any) => {
            const rect = node.getBoundingClientRect();
            return (
              e.clientX >= rect.left &&
              e.clientX <= rect.right &&
              e.clientY >= rect.top &&
              e.clientY <= rect.bottom
            );
          }) as HTMLElement | undefined;
          gesture.target = cell?.dataset.calendarDate || "";
          setCalendarDropDay(gesture.target);
        },
        onPointerUp: () => {
          clearCalendarDragImage();
          const gesture = calendarGesture.current;
          if (gesture?.target) moveDate(gesture, gesture.target);
          calendarGesture.current = null;
          setCalendarDropDay("");
        },
        onPointerCancel: () => {
          clearCalendarDragImage();
          calendarGesture.current = null;
          setCalendarDropDay("");
        },
      }),
      draggable: true,
      onDragStart: (e: any) => {
        if (e.target.closest(".calendar-task-check")) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData(CALENDAR_DRAG_TYPE, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
        setCalendarDragImage(e);
        calendarGesture.current = payload;
      },
      onDragEnd: () => {
        clearCalendarDragImage();
        calendarGesture.current = null;
        setCalendarDropDay("");
        suppressCalendarClick.current = Date.now() + 600;
      },
    };
  }
  function scheduleMenu(s: Schedule) {
    return itemMenuBindings([
      { label: "이름 변경", icon: "edit", run: () => setScheduleEditor(s) },
      { label: "날짜 이동", icon: "calendar", run: () => setScheduleEditor(s) },
      {
        label: "삭제",
        icon: "trash",
        danger: true,
        run: () =>
          onChange((p) => ({
            ...p,
            schedules: p.schedules.filter((item) => item.id !== s.id),
          })),
      },
    ]);
  }
  const taskDragId = useRef(""),
    [taskDrop, setTaskDrop] = useState("");
  useEffect(() => () => clearCalendarDragImage(), []);
  function finishTaskDrag() {
    clearCalendarDragImage();
    taskDragId.current = "";
    setTaskDrop("");
    suppressCalendarClick.current = Date.now() + 600;
  }
  function placeTask(targetId: string, stage?: string, after = false) {
    const id = taskDragId.current;
    if (!id || id === targetId) return;
    onChange((p) => {
      const item = p.tasks.find((t) => t.id === id);
      if (!item) return p;
      const rest = p.tasks.filter((t) => t.id !== id),
        at = targetId ? rest.findIndex((t) => t.id === targetId) : rest.length;
      rest.splice(at < 0 ? rest.length : at + (targetId && after ? 1 : 0), 0, {
        ...item,
        ...(stage
          ? moveTaskGroup(
              item,
              stage,
              taskStageOptions?.[item.id] || stageOptions,
              mappingFor(item),
            )
          : {}),
      });
      return { ...p, tasks: rest };
    });
    setTaskSort("등록순");
    finishTaskDrag();
  }
  function taskTarget(e: any) {
    const root = e.currentTarget.getRootNode(),
      node = root
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest("[data-task-id],[data-task-stage]");
    if (!node) return null;
    return {
      id: node.dataset.taskId || "",
      stage: taskLayout === "board" ? node.dataset.taskStage : undefined,
      after:
        e.clientY >
        node.getBoundingClientRect().top +
          node.getBoundingClientRect().height / 2,
    };
  }
  function taskOrderBindings(t: Task) {
    return delayedPointerDrag({
      ...taskMenu(t),
      draggable: true,
      onDragStart: (e: any) => {
        if (e.target.closest("input,select,textarea,button:not(.task-title)")) {
          e.preventDefault();
          return;
        }
        taskDragId.current = t.id;
        e.dataTransfer.setData("application/x-production-task-order", t.id);
        e.dataTransfer.effectAllowed = "move";
        setCalendarDragImage(e);
      },
      onDragEnd: finishTaskDrag,
      onDragOver: (e: any) => {
        if (!taskDragId.current) return;
        e.preventDefault();
        e.stopPropagation();
        setTaskDrop(
          t.id +
            (e.clientY >
            e.currentTarget.getBoundingClientRect().top +
              e.currentTarget.getBoundingClientRect().height / 2
              ? "|after"
              : "|before"),
        );
      },
      onDrop: (e: any) => {
        if (!taskDragId.current) return;
        e.preventDefault();
        e.stopPropagation();
        placeTask(
          t.id,
          taskLayout === "board" ? parentGroup(t) : undefined,
          e.clientY >
            e.currentTarget.getBoundingClientRect().top +
              e.currentTarget.getBoundingClientRect().height / 2,
        );
      },
      onPointerDown: (e: any) => {
        if (
          e.pointerType === "touch" &&
          !e.target.closest("input,select,textarea,button:not(.task-title)")
        ) {
          taskDragId.current = t.id;
          setCalendarDragImage(e);
        }
      },
      onPointerMove: (e: any) => {
        if (e.pointerType !== "touch" || !taskDragId.current) return;
        const target = taskTarget(e);
        setTaskDrop(
          target?.id ? target.id + (target.after ? "|after" : "|before") : "",
        );
      },
      onPointerUp: (e: any) => {
        if (e.pointerType !== "touch" || !taskDragId.current) return;
        const target = taskTarget(e);
        if (target) placeTask(target.id, target.stage, target.after);
        finishTaskDrag();
      },
      onPointerCancel: finishTaskDrag,
    });
  }
  function taskRow(t: Task) {
    return (
      <div
        {...taskMenu(t)}
        {...taskOrderBindings(t)}
        data-task-id={t.id}
        data-task-stage={parentGroup(t)}
        key={t.id}
        className={`work-task ${t.done ? "is-done" : ""} ${taskDrop === t.id + "|before" ? "task-order-before" : taskDrop === t.id + "|after" ? "task-order-after" : ""}`}
      >
        <input
          type="checkbox"
          aria-label={`${t.title} 완료`}
          checked={t.done}
          onChange={() => toggleTask(t.id)}
        />
        <button
          className="task-title"
          onClick={() => {
            if (suppressCalendarClick.current > Date.now()) return;
            setCalendarDraft(false);
            setTaskEditor(t);
          }}
        >
          <strong>
            {t.flagged && <Flag size={13} aria-label="깃발" />}
            {t.title}
          </strong>
          <small>
            {taskSources && (
              <span className="task-source">{taskSources[t.id]}</span>
            )}
            {assigneeLabel(members, t.owner, t.ownerId)} · {t.stage}
          </small>
        </button>
        <span className={`priority priority-${t.priority}`}>{t.priority}</span>
        <span
          className={`task-due ${t.due && t.due < today && !t.done ? "overdue" : ""}`}
        >
          {dateLabel(t.due)}
        </span>
        <DeleteButton
          label={t.title}
          onDelete={() =>
            onChange((p) => ({
              ...p,
              tasks: p.tasks.filter((task) => task.id !== t.id),
              feedback: p.feedback.map((f) =>
                f.taskId === t.id ? { ...f, taskId: "" } : f,
              ),
            }))
          }
        />
      </div>
    );
  }
  async function attach(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const results: Asset[] = [];
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) {
        errors.push(`${file.name}: 파일당 25MB까지 첨부할 수 있습니다.`);
        continue;
      }
      const id = crypto.randomUUID();
      try {
        await storeFile(id, file);
        results.push({
          id,
          name: file.name,
          kind: "file",
          url: "",
          size: file.size,
          mime: file.type,
          createdAt: new Date().toISOString(),
          archived: false,
        });
      } catch {
        errors.push(`${file.name}: 업로드에 실패했습니다. 다시 시도해주세요.`);
      }
    }
    if (results.length)
      onChange((p) => ({ ...p, assets: [...p.assets, ...results] }));
    if (mounted.current) {
      setBusy(false);
      setError(errors.join(" "));
      if (upload.current) upload.current.value = "";
    }
  }
  async function useFile(a: Asset, download = false) {
    setError("");
    try {
      const blob = await readFile(a.id);
      if (download) {
        downloadBlob(blob, a.name);
        return;
      }
      if (mounted.current)
        setPreview({ asset: a, url: URL.createObjectURL(blob) });
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "파일을 열 수 없습니다.");
    }
  }
  const startDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const monthDays = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const calendarDays = Array.from(
    { length: Math.ceil((startDay + monthDays) / 7) * 7 },
    (_, i) => new Date(month.getFullYear(), month.getMonth(), i - startDay + 1),
  );
  return (
    <div className="production-workbench">
      {!hideNavigation && (
        <nav className="project-sections" aria-label="프로젝트 제작 메뉴">
          {projectSections.map((s) => (
            <button
              key={s.id}
              aria-current={section === s.id ? "page" : undefined}
              className={section === s.id ? "active" : ""}
              onClick={() => onSectionChange(s.id)}
            >
              <s.icon size={15} />
              {s.label}
            </button>
          ))}
        </nav>
      )}
      {error && (
        <div className="storage-warning" role="alert">
          {error}
        </div>
      )}
      {section === "tasks" && (
        <section>
          <div className="work-toolbar task-view-toolbar">
            <button
              className="button"
              aria-label="할 일 필터·그룹화·정렬"
              aria-pressed={
                taskFilter !== "전체" ||
                taskSource !== "전체" ||
                taskGroup !== "없음" ||
                taskSort !== "등록순"
              }
              onClick={() => setTaskTools(true)}
            >
              <Filter size={17} />
            </button>
            <div
              className="task-view-switch"
              data-view={taskLayout}
              role="group"
              aria-label="할 일 보기"
            >
              <button
                className="keep-label"
                aria-pressed={taskLayout === "list"}
                onClick={() => setTaskLayout("list")}
              >
                목록
              </button>
              <button
                className="keep-label"
                aria-pressed={taskLayout === "board"}
                onClick={() => setTaskLayout("board")}
              >
                보드
              </button>
            </div>
          </div>
          {taskLayout === "list" ? (
            <div
              className="work-task-list"
              onDragOver={(e) => {
                if (taskDragId.current) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={(e) => {
                if (taskDragId.current) {
                  e.preventDefault();
                  placeTask("");
                }
              }}
            >
              {taskStatusGroups.map((group) => (
                <section
                  className="task-list-group"
                  data-task-status={group}
                  key={group}
                >
                  <h3>
                    {group === "완료" ? (
                      <button
                        className="keep-label task-completed-toggle"
                        aria-expanded={completedTasksOpen}
                        onClick={() =>
                          setCompletedTasksOpen(!completedTasksOpen)
                        }
                      >
                        <span aria-hidden="true">
                          {completedTasksOpen ? "⌄" : "›"}
                        </span>{" "}
                        완료
                      </button>
                    ) : (
                      group
                    )}
                    <span className="count">
                      {tasks.filter((t) => parentGroup(t) === group).length}
                    </span>
                  </h3>
                  <div hidden={group === "완료" && !completedTasksOpen}>
                    {taskGroup === "없음" || taskGroup === "상태"
                      ? tasks
                          .filter((t) => parentGroup(t) === group)
                          .map(taskRow)
                      : [
                          ...new Set(
                            tasks
                              .filter((t) => parentGroup(t) === group)
                              .map(groupLabel),
                          ),
                        ].map((label) => (
                          <section key={label}>
                            <h4>{label}</h4>
                            {tasks
                              .filter(
                                (t) =>
                                  parentGroup(t) === group &&
                                  groupLabel(t) === label,
                              )
                              .map(taskRow)}
                          </section>
                        ))}
                  </div>
                  {group === "시작 전" && (
                    <>
                      {" "}
                      <TaskComposer
                        key={project.id}
                        members={members}
                        allowMemberAdd={allowMemberAdd}
                        stageOptions={stageOptions}
                        stageGroups={stageGroups}
                        onAddMember={onAddMember}
                        onAdd={saveTask}
                      />
                    </>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <div className="task-board">
              {taskStatusGroups.map((stage) => (
                <section
                  key={stage}
                  data-task-stage={stage}
                  onDragOver={(e) => {
                    if (taskDragId.current) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={(e) => {
                    if (!taskDragId.current) return;
                    e.preventDefault();
                    placeTask("", stage);
                  }}
                >
                  <h3>
                    {stage === "완료" ? (
                      <button
                        className="keep-label task-completed-toggle"
                        aria-expanded={completedTasksOpen}
                        onClick={() =>
                          setCompletedTasksOpen(!completedTasksOpen)
                        }
                      >
                        <span aria-hidden="true">
                          {completedTasksOpen ? "⌄" : "›"}
                        </span>{" "}
                        완료
                      </button>
                    ) : (
                      stage
                    )}
                    <span className="count">
                      {tasks.filter((t) => parentGroup(t) === stage).length}
                    </span>
                  </h3>
                  <div hidden={stage === "완료" && !completedTasksOpen}>
                    {taskGroup === "없음" || taskGroup === "상태"
                      ? tasks
                          .filter((t) => parentGroup(t) === stage)
                          .map(taskRow)
                      : [
                          ...new Set(
                            tasks
                              .filter((t) => parentGroup(t) === stage)
                              .map(groupLabel),
                          ),
                        ].map((label) => (
                          <section className="task-board-subgroup" key={label}>
                            <h4>{label}</h4>
                            {tasks
                              .filter(
                                (t) =>
                                  parentGroup(t) === stage &&
                                  groupLabel(t) === label,
                              )
                              .map(taskRow)}
                          </section>
                        ))}
                  </div>
                  {stage === "시작 전" && (
                    <TaskComposer
                      members={members}
                      allowMemberAdd={allowMemberAdd}
                      stageOptions={stageOptions}
                      stageGroups={stageGroups}
                      onAddMember={onAddMember}
                      onAdd={saveTask}
                      stage={
                        stageOptions.find(
                          (s) => stageGroup(s, stageGroups) === stage,
                        ) || stage
                      }
                    />
                  )}
                </section>
              ))}
            </div>
          )}
        </section>
      )}
      {section === "schedule" && (
        <section>
          <div className="work-heading">
            <div>
              <span className="view-context-label">일정</span>
            </div>
          </div>
          <div className="calendar-heading">
            <h3>
              {month.getFullYear()}년 {month.getMonth() + 1}월
            </h3>
            <div>
              <button
                className="button"
                onClick={() =>
                  setMonth(
                    new Date(
                      new Date().getFullYear(),
                      new Date().getMonth(),
                      1,
                    ),
                  )
                }
              >
                이번 달
              </button>
              <button
                className="icon-button"
                aria-label="이전 달"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="다음 달"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
          <div className="calendar-scroll">
            <div className="calendar-grid">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div className="weekday" key={d}>
                  {d}
                </div>
              ))}
              {calendarDays.map((d) => {
                const value = dateString(d);
                return (
                  <div
                    className={`calendar-day ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${value === today ? "today" : ""} ${calendarDropDay === value ? "calendar-drop-target" : ""}`}
                    key={value}
                    data-calendar-date={value}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes(CALENDAR_DRAG_TYPE)) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        setCalendarDropDay(value);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node))
                        setCalendarDropDay("");
                    }}
                    onDrop={(e) => {
                      if (!e.dataTransfer.types.includes(CALENDAR_DRAG_TYPE))
                        return;
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        moveDate(
                          JSON.parse(
                            e.dataTransfer.getData(CALENDAR_DRAG_TYPE),
                          ),
                          value,
                        );
                      } catch {
                        setCalendarDropDay("");
                      }
                    }}
                  >
                    <div className="calendar-day-heading">
                      <span aria-current={value === today ? "date" : undefined}>
                        {d.getDate()}
                        {value === today && <small>오늘</small>}
                      </span>
                      <button
                        type="button"
                        className="icon-button calendar-add"
                        aria-label={value + " 할 일·일정 추가"}
                        title="추가"
                        onClick={() => openCalendarDraft(value)}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    {project.schedules
                      .filter(
                        (s) =>
                          s.date <= value && (s.endDate || s.date) >= value,
                      )
                      .map((s) => (
                        <button
                          key={s.id}
                          {...scheduleMenu(s)}
                          {...dragBindings("schedule", s.id, value)}
                          className="calendar-event"
                          onClick={() => {
                            if (suppressCalendarClick.current > Date.now())
                              return;
                            setCalendarDraft(false);
                            setScheduleEditor(s);
                          }}
                          title={s.title}
                        >
                          <span className="calendar-event-title">
                            {s.title}
                          </span>
                          {taskSources?.[s.id] && (
                            <small className="project-name-chip">
                              {taskSources[s.id]}
                            </small>
                          )}
                        </button>
                      ))}
                    {project.tasks
                      .filter((t) => t.due === value && !t.done)
                      .map((t) => (
                        <div
                          key={t.id}
                          {...taskMenu(t)}
                          {...dragBindings("task", t.id, value)}
                          className={
                            "calendar-task-row " +
                            (calendarPending.includes(t.id) ? "pending" : "")
                          }
                        >
                          <button
                            type="button"
                            className="calendar-task-check keep-label"
                            aria-label={t.title + " 완료"}
                            aria-pressed={calendarPending.includes(t.id)}
                            onClick={() => completeCalendarTask(t.id)}
                          >
                            {calendarPending.includes(t.id) && (
                              <Check size={12} />
                            )}
                          </button>
                          <button
                            className="calendar-task keep-label"
                            onClick={() => {
                              if (suppressCalendarClick.current > Date.now())
                                return;
                              setCalendarDraft(false);
                              setTaskEditor(t);
                            }}
                            title={t.title}
                          >
                            <span className="calendar-task-title">
                              {t.title}
                            </span>
                            {taskSources?.[t.id] && (
                              <small className="project-name-chip">
                                {taskSources[t.id]}
                              </small>
                            )}
                          </button>
                        </div>
                      ))}
                    {project.due === value && (
                      <span className="calendar-deadline">프로젝트 마감</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      {section === "assets" && (
        <section>
          <div className="work-heading">
            <div>
              <h2>자료와 파일</h2>
              <p>레퍼런스 링크부터 편집본까지, 제작 자료를 모아두세요.</p>
            </div>
            <div className="button-group">
              <button className="button" onClick={() => setLinkEditor(true)}>
                <Link size={15} />
                링크 등록
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => upload.current?.click()}
              >
                <Plus size={15} />
                {busy ? "저장 중…" : "파일 첨부"}
              </button>
              <input
                hidden
                ref={upload}
                type="file"
                multiple
                aria-label="파일 첨부 선택"
                onChange={(e) => {
                  void attach(e.target.files);
                }}
              />
            </div>
          </div>
          <div className="local-storage-note">파일당 최대 25MB</div>
          <div className="work-toolbar">
            <button
              className="button"
              aria-pressed={!archived}
              onClick={() => setArchived(false)}
            >
              자료 {project.assets.filter((a) => !a.archived).length}
            </button>
            <button
              className="button"
              aria-pressed={archived}
              onClick={() => setArchived(true)}
            >
              <Archive size={14} />
              보관함 {project.assets.filter((a) => a.archived).length}
            </button>
          </div>
          {!project.assets.filter((a) => a.archived === archived).length && (
            <div className="empty-state">
              <File size={25} />
              <h3>
                {archived ? "보관된 자료가 없습니다" : "첫 자료를 추가하세요"}
              </h3>
              <p>파일을 첨부하거나 외부 자료의 링크를 등록할 수 있습니다.</p>
            </div>
          )}
          <div className="asset-list">
            {project.assets
              .filter((a) => a.archived === archived)
              .map((a) => (
                <div className="asset-row" key={a.id} data-search-asset={a.id}>
                  <span className="project-icon">
                    {a.kind === "file" ? (
                      <File size={17} />
                    ) : (
                      <Link size={17} />
                    )}
                  </span>
                  <div className="asset-info">
                    <InlineEdit
                      value={a.name}
                      label={`${a.name} 자료 이름`}
                      required
                      onSave={(name) =>
                        onChange((p) => ({
                          ...p,
                          assets: p.assets.map((item) =>
                            item.id === a.id ? { ...item, name } : item,
                          ),
                        }))
                      }
                    />
                    <small>
                      {a.kind === "file"
                        ? fileSize(a.size)
                        : new URL(a.url).hostname}{" "}
                      · {a.createdAt.slice(0, 10)}
                    </small>
                  </div>
                  {a.kind === "link" ? (
                    <a
                      className="icon-button"
                      aria-label={`${a.name} 링크 열기`}
                      href={safeUrl(a.url) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ArrowUpRight size={16} />
                    </a>
                  ) : (
                    <>
                      <button
                        className="button"
                        onClick={() => {
                          void useFile(a);
                        }}
                      >
                        미리보기
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`${a.name} 다운로드`}
                        onClick={() => {
                          void useFile(a, true);
                        }}
                      >
                        <ArrowDownToLine size={16} />
                      </button>
                    </>
                  )}
                  <button
                    className="icon-button"
                    aria-label={`${a.name} ${archived ? "복원" : "보관"}`}
                    onClick={() =>
                      onChange((p) => ({
                        ...p,
                        assets: p.assets.map((item) =>
                          item.id === a.id
                            ? { ...item, archived: !item.archived }
                            : item,
                        ),
                      }))
                    }
                  >
                    {archived ? <RotateCcw size={15} /> : <Archive size={15} />}
                  </button>
                </div>
              ))}
          </div>
        </section>
      )}
      {taskTools && (
        <Modal title="필터·그룹화·정렬" onClose={() => setTaskTools(false)}>
          <div className="merge-form">
            <label>
              상태
              <select
                aria-label="할 일 상태 필터"
                value={taskFilter}
                onChange={(e) => setTaskFilter(e.target.value)}
              >
                {["전체", "미완료", "완료"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {taskSources && (
              <label>
                프로젝트
                <select
                  aria-label="할 일 소속 필터"
                  value={taskSource}
                  onChange={(e) => setTaskSource(e.target.value)}
                >
                  {["전체", ...new Set(Object.values(taskSources))].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              그룹화
              <select
                aria-label="할 일 그룹화"
                value={taskGroup}
                onChange={(e) => setTaskGroup(e.target.value)}
              >
                {[
                  "없음",
                  "단계",
                  "담당자",
                  "상태",
                  ...(taskSources ? ["프로젝트"] : []),
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              정렬
              <select
                aria-label="할 일 정렬"
                value={taskSort}
                onChange={(e) => setTaskSort(e.target.value)}
              >
                {["등록순", "마감일순", "이름순", "우선순위순"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <button
              className="button keep-label"
              onClick={() => {
                setTaskFilter("전체");
                setTaskSource("전체");
                setTaskGroup("없음");
                setTaskSort("등록순");
              }}
            >
              초기화
            </button>
          </div>
        </Modal>
      )}
      {(taskEditor || scheduleEditor) && (
        <Modal
          key="calendar-entry-editor"
          title={
            calendarDraft ? "추가" : taskEditor ? "할 일 수정" : "일정 편집"
          }
          onClose={() => {
            setTaskEditor(null);
            setScheduleEditor(null);
            setCalendarDraft(false);
          }}
        >
          {draftPicker}
          {taskEditor ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                const title = field(d, "title");
                if (!title) return;
                const startTime = field(d, "startTime"),
                  endTime = field(d, "endTime");
                if (
                  (startTime || endTime) &&
                  (!field(d, "due") || !validTimes(startTime, endTime))
                ) {
                  setError("날짜와 시간을 확인하세요");
                  return;
                }
                setError("");
                saveTask({
                  ...taskEditor,
                  startTime,
                  endTime,
                  title,
                  owner: field(d, "owner") || "미지정",
                  ownerId:
                    editorMembers.find((m) => m.name === field(d, "owner"))
                      ?.id || "",
                  due: field(d, "due"),
                  stage: field(d, "stage") as Task["stage"],
                  priority: field(d, "priority") as Task["priority"],
                  flagged: d.has("flagged"),
                  description: field(d, "description"),
                });
              }}
            >
              <label>
                할 일 이름
                <input
                  name="title"
                  aria-label="할 일 이름"
                  defaultValue={taskEditor.title}
                  required
                  maxLength={160}
                  pattern=".*\S.*"
                />
              </label>
              <div className="form-row">
                <label>
                  단계
                  <select name="stage" defaultValue={taskEditor.stage}>
                    {taskStatusGroups.map((group) => (
                      <optgroup label={group} key={group}>
                        {[
                          ...new Set([
                            ...editorStages,
                            ...taskStatusGroups,
                            ...(taskEditor.stage ? [taskEditor.stage] : []),
                          ]),
                        ]
                          .filter((s) => stageGroup(s, editorGroups) === group)
                          .map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>
                  우선순위
                  <select name="priority" defaultValue={taskEditor.priority}>
                    {priorities.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <span>담당자</span>
                  <AssigneePicker
                    members={editorMembers}
                    allowAdd={allowMemberAdd}
                    defaultValue={
                      editorMembers.find((m) => m.id === taskEditor.ownerId)
                        ?.name || taskEditor.owner
                    }
                    name="owner"
                    onAdd={onAddMember}
                  />
                </div>
                <label>
                  마감일
                  <input type="date" name="due" defaultValue={taskEditor.due} />
                </label>
              </div>
              <label className="member-check">
                <input
                  type="checkbox"
                  name="flagged"
                  defaultChecked={!!taskEditor.flagged}
                />
                깃발 · 완료할 때까지 이번 주에 표시
              </label>
              <TimeFields
                start={taskEditor.startTime}
                end={taskEditor.endTime}
              />
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <label>
                설명
                <textarea
                  name="description"
                  defaultValue={taskEditor.description}
                  maxLength={2000}
                  rows={4}
                />
              </label>
              <div className="dialog-actions">
                {project.tasks.some((t) => t.id === taskEditor.id) && (
                  <button
                    type="button"
                    className="button danger keep-label"
                    onClick={() => {
                      onChange((p) => ({
                        ...p,
                        tasks: p.tasks.filter((t) => t.id !== taskEditor.id),
                        schedules: p.schedules.map((s) =>
                          s.taskId === taskEditor.id ? { ...s, taskId: "" } : s,
                        ),
                      }));
                      setTaskEditor(null);
                      setCalendarDraft(false);
                    }}
                  >
                    삭제
                  </button>
                )}
                <button className="button primary keep-label">저장</button>
              </div>
            </form>
          ) : scheduleEditor ? (
            <ScheduleForm
              value={scheduleEditor}
              onDelete={
                project.schedules.some((s) => s.id === scheduleEditor.id)
                  ? () => {
                      onChange((p) => ({
                        ...p,
                        schedules: p.schedules.filter(
                          (s) => s.id !== scheduleEditor.id,
                        ),
                      }));
                      setScheduleEditor(null);
                      setCalendarDraft(false);
                    }
                  : undefined
              }
              onSave={(s) => {
                onChange((p) => ({
                  ...p,
                  schedules: p.schedules.some((item) => item.id === s.id)
                    ? p.schedules.map((item) => (item.id === s.id ? s : item))
                    : [...p.schedules, s],
                }));
                setMonth(new Date(`${s.date}T12:00:00`));
                setScheduleEditor(null);
                setCalendarDraft(false);
              }}
            />
          ) : null}
        </Modal>
      )}
      {linkEditor && (
        <Modal title="링크 등록" onClose={() => setLinkEditor(false)}>
          <LinkForm
            onSave={(name, url) => {
              onChange((p) => ({
                ...p,
                assets: [
                  ...p.assets,
                  {
                    id: crypto.randomUUID(),
                    name,
                    url,
                    kind: "link",
                    size: 0,
                    mime: "",
                    createdAt: new Date().toISOString(),
                    archived: false,
                  },
                ],
              }));
              setLinkEditor(false);
            }}
          />
        </Modal>
      )}
      {preview && (
        <Modal title={preview.asset.name} onClose={() => setPreview(null)}>
          <div className="file-preview">
            {[
              "image/png",
              "image/jpeg",
              "image/gif",
              "image/webp",
              "image/avif",
            ].includes(preview.asset.mime) ? (
              <img src={preview.url} alt={preview.asset.name} />
            ) : ["video/mp4", "video/webm", "video/quicktime"].includes(
                preview.asset.mime,
              ) ? (
              <video src={preview.url} controls />
            ) : ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"].includes(
                preview.asset.mime,
              ) ? (
              <audio src={preview.url} controls />
            ) : (
              <p>이 형식은 다운로드하여 확인할 수 있습니다.</p>
            )}
          </div>
          <button
            className="button"
            onClick={() => {
              void useFile(preview.asset, true);
            }}
          >
            <ArrowDownToLine size={15} />
            다운로드
          </button>
        </Modal>
      )}
    </div>
  );
}
function ScheduleForm({
  value,
  onSave,
  onDelete,
}: {
  onDelete?: () => void;
  value: Schedule;
  onSave: (s: Schedule) => void;
}) {
  const [error, setError] = useState("");
  const [dates, setDates] = useState({
    ...value,
    endDate: value.endDate || value.date,
  });
  return (
    <form
      className="schedule-entry-form"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        const title = field(d, "title"),
          date = field(d, "date"),
          endDate = field(d, "endDate") || date;
        if (!title) return;
        if (endDate < date) {
          setError("종료일은 시작일 이후여야 합니다.");
          return;
        }
        const startTime = field(d, "startTime"),
          endTime = field(d, "endTime");
        if (
          (startTime || endTime) &&
          !validTimes(startTime, endTime, date !== endDate)
        ) {
          setError("시간을 확인하세요");
          return;
        }
        onSave({
          ...value,
          startTime,
          endTime,
          title,
          date,
          endDate,
          location: field(d, "location"),
          note: field(d, "note"),
        });
      }}
    >
      <label>
        일정 이름
        <input
          name="title"
          placeholder="일정 제목을 입력하세요"
          aria-label="일정 이름"
          defaultValue={value.title}
          required
          maxLength={160}
          pattern=".*\S.*"
        />
      </label>
      <ScheduleDateTime value={dates} onChange={setDates} />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <label>
        장소
        <input
          placeholder="장소를 입력하세요"
          name="location"
          defaultValue={value.location}
          maxLength={160}
        />
      </label>
      <label>
        메모
        <textarea
          name="note"
          placeholder="메모를 입력하세요"
          defaultValue={value.note}
          maxLength={2000}
          rows={3}
        />
      </label>
      <div className="dialog-actions">
        {onDelete && (
          <button
            type="button"
            className="button danger keep-label"
            onClick={onDelete}
          >
            삭제
          </button>
        )}
        <button className="button primary keep-label">저장</button>
      </div>
    </form>
  );
}
function LinkForm({ onSave }: { onSave: (name: string, url: string) => void }) {
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget),
          url = safeUrl(field(d, "url")),
          name = field(d, "name");
        if (!url) {
          setError("http 또는 https 주소를 입력해주세요.");
          return;
        }
        if (!name) return;
        onSave(name, url);
      }}
    >
      <label>
        자료 이름
        <input name="name" required maxLength={160} pattern=".*\S.*" />
      </label>
      <label>
        URL
        <input
          name="url"
          type="url"
          placeholder="https://"
          required
          maxLength={2000}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button primary">링크 저장</button>
      </div>
    </form>
  );
}

function validTimes(start: string, end: string, multipleDays = false) {
  const a = minutes(start),
    b = minutes(end);
  return a !== null && b !== null && a < 1440 && (multipleDays || b > a);
}
function TimeFields({
  start = "",
  end = "",
}: {
  start?: string;
  end?: string;
}) {
  const [a, setA] = useState(start),
    [b, setB] = useState(end);
  return (
    <div className="form-row time-fields">
      <label>
        시작 시간
        <TimeInput
          name="startTime"
          label="시작 시간"
          value={a}
          onChange={setA}
        />
      </label>
      <label>
        종료 시간
        <TimeInput name="endTime" label="종료 시간" value={b} onChange={setB} />
      </label>
    </div>
  );
}
