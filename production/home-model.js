import {planningSearch} from './event-operations.js';
export function filterProjects(projects,{group='',status='',owner='',query='',sort=''}={}){
 const term=query.toLowerCase().trim();
 return projects.filter(p=>(!group||p.productionId===group)&&(!status||p.status===status)&&(!owner||(owner==='__unassigned'?(!p.owner||p.owner==='미지정'):p.owner===owner))&&planningSearch(p).includes(term)).sort((a,b)=>sort==='due'?(a.due||'9999').localeCompare(b.due||'9999'):sort==='name'?a.name.localeCompare(b.name):0);
}
export function projectGroups(workspace,projects,selected=''){
 const groups=workspace.productions.filter(g=>!selected||g.id===selected).map(g=>({...g,projects:projects.filter(p=>p.productionId===g.id)}));
 const ungrouped=projects.filter(p=>!workspace.productions.some(g=>g.id===p.productionId));
 if(!selected&&(ungrouped.length||!groups.length))groups.push({id:'',name:'개별 프로젝트',description:'',tasks:[],projects:ungrouped});
 return groups;
}
export function removeEntity(workspace,kind,id){return kind==='production'?{...workspace,productions:workspace.productions.filter(g=>g.id!==id),projects:workspace.projects.map(p=>p.productionId===id?{...p,productionId:''}:p)}:{...workspace,projects:workspace.projects.filter(p=>p.id!==id)};}
