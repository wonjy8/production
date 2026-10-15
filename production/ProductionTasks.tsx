import {productionMembers} from './people-model.js';
import type { Workspace } from "./data";
import { ProjectWorkspace } from "./ProjectWorkspace";
import { productionTaskView, updateProductionTasks } from "./taskAggregation";
export function ProductionTasks({
  workspace,
  productionId,
  onChange,
  onAddMember,
}: {
  workspace: Workspace;
  productionId: string;
  onChange: (update: (w: Workspace) => Workspace) => void;
  onAddMember: (name: string) => void;
}) {
  const { project, sources,stageOptions,stageGroups,memberOptions } = productionTaskView(workspace, productionId);
  return (
    <>
      <ProjectWorkspace
        key={productionId}
        project={project}
        members={productionMembers(workspace,workspace.productions.find(g=>g.id===productionId))}
        allowMemberAdd={false}
        stageOptions={['기획','진행','검토','완료']}
        taskStageOptions={stageOptions} taskStageGroups={stageGroups}
        taskMemberOptions={memberOptions}
        onAddMember={onAddMember}
        section="tasks"
        onSectionChange={() => {}}
        hideNavigation
        taskSources={sources}
        onChange={(update) =>
          onChange((current) =>
            updateProductionTasks(current, productionId, update),
          )
        }
      />
    </>
  );
}

