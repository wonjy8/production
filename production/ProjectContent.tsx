import {ModuleTab} from './ModuleTab';
import {projectBoard,updateProjectBoard,overviewBoardSection} from './project-structure.js';

export function ProjectContent({owner,kind,workspace,onChange,onOpen,onAddMember,onAddTabTemplate,onMoveModule,section="tasks"}:any) {
  const boardSection=section==='overview'?overviewBoardSection(owner,kind):section;
  const defaultIds = kind === 'production'
    ? workspace.projects.filter((p:any) => p.productionId === owner.id).map((p:any) => p.id)
    : [owner.id];
  return <div className="project-direct-content" data-permission-owner={owner.id}
    data-permission-tab={'tab:'+projectBoard(owner,kind,boardSection).id}>
    <ModuleTab onMoveModule={onMoveModule} onAddTabTemplate={onAddTabTemplate} key={kind+':'+owner.id} tab={projectBoard(owner,kind,boardSection)} workspace={workspace}
      defaultIds={defaultIds} productionId={kind === 'production' ? owner.id : owner.productionId}
      parentScope={kind === 'production'}
      onTabChange={(update:any) => onChange((w:any) => updateProjectBoard(w,owner.id,kind,update,boardSection))}
      onChange={onChange} onOpen={onOpen} onAddMember={onAddMember}/>
  </div>;
}
