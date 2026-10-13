// One visible project level. Legacy IDs remain authoritative for access and links.
export function projectEntries(workspace) {
  const parents = (workspace.productions || []).filter(p => !p.deleted);
  const parentIds = new Set(parents.map(p => p.id));
  const children = (workspace.projects || []).filter(p => !p.deleted);
  return [
    ...parents.map(p => {
      const groups = children.filter(g => g.productionId === p.id);
      const tasks = [...(p.tasks || []), ...groups.flatMap(g => g.tasks || [])];
      const dates = groups.map(g => g.due).filter(Boolean).sort();
      return {...p, kind: 'production', groups, tasks,
        status: p.status || (tasks.length && tasks.every(t => t.done) ? '완료' : '진행 중'),
        due: p.due || dates.at(-1) || '',
        origin: {kind:'production', productionId:p.id, projectId:'', label:p.name}};
    }),
    ...children.filter(p => !parentIds.has(p.productionId)).map(p => ({...p,tasks:p.tasks || [],
      name:p.name || p.title, kind:'project', groups:[],
      origin:{kind:'project',projectId:p.id,productionId:p.productionId || '',label:p.name || p.title}})),
  ];
}

export function referenceProjectKey(reference, workspace) {
  if (reference.productionId) return 'production:'+reference.productionId;
  const child = (workspace.projects || []).find(p => p.id === reference.projectId);
  const parent = (workspace.productions || []).find(p => !p.deleted && p.id === child?.productionId);
  return parent ? 'production:'+parent.id : reference.projectId ? 'project:'+reference.projectId : '';
}

export function assignReferenceProject(reference, key) {
  const colon = key.indexOf(':'), kind = key.slice(0,colon), id = key.slice(colon+1);
  return {...reference,productionId:kind === 'production' ? id : '',projectId:kind === 'project' ? id : ''};
}

export function projectBoard(owner, kind, section='tasks') {
  const tabs=owner.customTabs || [];
  const found=tabs.find(t=>t.defaultBoard && (kind==='production' ? (t.boardSection||'overview')===section : (t.boardSection||'tasks')===section));
  return found || {id:kind+'-'+owner.id+'-'+section+'-content',name:section==='schedule'?'일정 모듈':section==='tasks'?'할 일 모듈':'내용',defaultBoard:true,boardSection:section,modules:[]};
}

export function updateProjectBoard(workspace, ownerId, kind, update, section='tasks') {
  const key = kind === 'production' ? 'productions' : 'projects';
  return {...workspace,[key]:workspace[key].map(owner => {
    if (owner.id !== ownerId) return owner;
    const board = projectBoard(owner,kind,section), next = {...update(board),defaultBoard:true,boardSection:section};
    const tabs = owner.customTabs || [];
    return {...owner,customTabs:tabs.some(t => t.id === board.id)
      ? tabs.map(t => t.id === board.id ? next : t) : [next,...tabs]};
  })};
}

export function projectFolders(workspace, folder) {
  return projectEntries(workspace).map(p => {
    const tabs = p.customTabs || [];
    return {id:p.kind+':'+p.id,name:p.name,folders:[
      ...tabs.map(t => folder(p,p.kind,t.name,[t]).folders[0]),
      ...p.groups.map(g => folder(g,'project',g.name || g.title,g.customTabs || [])),
    ]};
  });
}

// Older production overviews used the same default board as Tasks.
export function overviewBoardSection(owner,kind){
 const tabs=owner.customTabs||[];
 return kind==='production'&&!tabs.some(t=>t.defaultBoard&&(t.boardSection||'overview')==='overview')&&tabs.some(t=>t.defaultBoard&&t.boardSection==='tasks')?'tasks':'overview';
}
