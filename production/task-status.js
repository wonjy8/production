// Stable parent groups; category-specific stages remain editable beneath them.
export const taskStatusGroups = ["시작 전", "진행 중", "완료"];
export function stageGroup(stage, mapping = {}) {
  if (taskStatusGroups.includes(mapping?.[stage])) return mapping[stage];
  if (taskStatusGroups.includes(stage)) return stage;
  if (["완료", "납품", "종료"].includes(stage)) return "완료";
  if (
    !stage ||
    ["기획", "준비", "촬영 준비", "프리프로덕션", "대기"].includes(stage)
  )
    return "시작 전";
  return "진행 중";
}
export function taskGroup(task, mapping = {}) {
  return task.done
    ? "완료"
    : stageGroup(task.stage, mapping) === "완료"
      ? "시작 전"
      : stageGroup(task.stage, mapping);
}
export function moveTaskGroup(task, group, options = [], mapping = {}) {
  if (!taskStatusGroups.includes(group)) return task;
  const stage =
    stageGroup(task.stage, mapping) === group
      ? task.stage
      : options.find((s) => stageGroup(s, mapping) === group) || group;
  return { ...task, stage, done: group === "완료" };
}
export function saveTaskStage(task, previous, mapping = {}) {
  if (task.stage !== previous?.stage)
    return { ...task, done: stageGroup(task.stage, mapping) === "완료" };
  return task;
}
