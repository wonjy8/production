import {categoryFor,projectMembers,productionMembers} from './people-model.js';
import type { Project, Workspace, Task } from "./data";
export function productionTaskView(workspace: Workspace, productionId: string) {
  const production = workspace.productions.find((p) => p.id === productionId)!;
  const sources: Record<string, string> = {};
  const origins = new Map<
    string,
    { projectId: string | null; taskId: string }
  >();
  const tasks: Task[] = [];
  const stageGroups:Record<string,Record<string,string>>={};
  const stageOptions:Record<string,readonly string[]>={},memberOptions:Record<string,Workspace["members"]>={};
  function append(task: Task, projectId: string | null, label: string) {
    const id = JSON.stringify([projectId, task.id]);
    origins.set(id, { projectId, taskId: task.id });
    sources[id] = label;
    tasks.push({ ...task, id });
    const origin=workspace.projects.find(p=>p.id===projectId);stageOptions[id]=origin?categoryFor(workspace,origin).stages:["기획","진행","검토","완료"];stageGroups[id]=origin?categoryFor(workspace,origin).stageGroups||{}:{};memberOptions[id]=origin?projectMembers(workspace,origin):productionMembers(workspace,production);
  }
  production.tasks.forEach((t) => append(t, null, "Production 직접 등록"));
  workspace.projects
    .filter((p) => p.productionId === productionId)
    .forEach((p) => p.tasks.forEach((t) => append(t, p.id, p.name)));
  const order = (production as any).taskOrder as string[] | undefined;
  if(order) tasks.sort((a,b)=>(order.indexOf(a.id)<0?order.length:order.indexOf(a.id))-(order.indexOf(b.id)<0?order.length:order.indexOf(b.id)));
  const project: Project = {
    id: production.id,
    productionId,
    name: production.name,
    format: "Production",
    status: "진행 중",
    owner: "미지정",
    due: "",
    description: "",
    tasks,
    schedules: [],
    assets: [],
    feedback: [],
  };
  return { project, sources, origins,stageOptions,stageGroups,memberOptions };
}
export function updateProductionTasks(
  workspace: Workspace,
  productionId: string,
  update: (p: Project) => Project,
): Workspace {
  const { project, origins } = productionTaskView(workspace, productionId);
  const next = update(project);
  const own: Task[] = [],
    byProject = new Map<string, Task[]>();
  workspace.projects
    .filter((p) => p.productionId === productionId)
    .forEach((p) => byProject.set(p.id, []));
  for (const task of next.tasks) {
    const origin = origins.get(task.id);
    const actual = { ...task, id: origin?.taskId ?? task.id };
    if (origin?.projectId) byProject.get(origin.projectId)!.push(actual);
    else own.push(actual);
  }
  return {
    ...workspace,
    productions: workspace.productions.map((p) =>
      p.id === productionId ? { ...p, tasks: own, taskOrder: next.tasks.map(t=>t.id) } : p,
    ),
    projects: workspace.projects.map((p) => {
      const tasks = byProject.get(p.id);
      if (!tasks) return p;
      return {
        ...p,
        tasks,
        feedback: p.feedback.map((f) =>
          f.taskId && !tasks.some((t) => t.id === f.taskId)
            ? { ...f, taskId: "" }
            : f,
        ),
      };
    }),
  };
}

