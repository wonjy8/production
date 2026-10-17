import {validateProject} from '../production/event-operations.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as model from '../production/people-model.js';
import {parseMemberLines} from '../production/member-import.js';
const require=createRequire(import.meta.url),esbuild=require(process.env.PRODUCTION_ESBUILD||'esbuild');
const code=esbuild.transformSync(readFileSync('production/ProjectOverview.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code;
const jsx=(type,props)=>({type,props});let cursor=0;const values=[];
let overviewFields;
const context={module:{exports:{}},exports:{},require(name){if(name==='react')return {useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],v=>values[i]=typeof v==='function'?v(values[i]):v]}};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='./PlanningFields')return {PlanningPanel:'PlanningPanel'};if(name==='./event-operations.js')return {validateProject};if(name==='./ProjectIconPicker')return {ProjectIconPicker:'ProjectIconPicker'};if(name==='./ProjectHealth')return {ProjectHealth:'ProjectHealth'};if(name==='./OverviewFields')return overviewFields;if(name==='./Icon')return {Icon:'Icon'};if(name==='./data')return {statuses:['기획 중','완료']};if(name==='./people-model.js')return model;if(name==='./project-icons.js')return {projectIconGroups:[{name:'교회',items:[['cross','십자가']]}]};throw Error(name)}};
const fieldsContext={module:{exports:{}},exports:{},require:context.require};vm.runInNewContext(esbuild.transformSync(readFileSync('production/OverviewFields.tsx','utf8'),{loader:'tsx',format:'cjs',jsx:'automatic'}).code,fieldsContext);overviewFields=fieldsContext.module.exports;
vm.runInNewContext(code,context);
let project={id:'p',name:'원본',productionId:'g',status:'기획 중',owner:'',due:'',categoryId:'video',teamIds:['t'],tasks:[],schedules:[],assets:[]};let writes=0;
const workspace={members:[{id:'m',name:'사용자A'}],productions:[{id:'g',name:'제작',memberIds:['m'],teams:[{id:'t',name:'촬영팀',members:[{memberId:'m',role:'감독'}],leaderId:'m'}]}],projects:[project]};
function render(){cursor=0;return context.module.exports.ProjectOverview({workspace,project,onChange(fn){writes++;project=fn(project)},onTitle(){}})}
function nodes(root){return [root,...[root?.props?.children].flat(Infinity).filter(x=>x&&typeof x==='object').flatMap(nodes)]}
let view=render();assert.equal(nodes(view).some(n=>n.type==='input'),false);
const edit=()=>nodes(render()).find(n=>n.type==='button'&&n.props.children.at?.(-1)==='수정').props.onClick();
edit();view=render();nodes(view).find(n=>n.props?.['aria-label']==='프로젝트 이름').props.onChange({target:{value:'초안'}});assert.equal(project.name,'원본');assert.equal(writes,0);
view=render();nodes(view).find(n=>n.type==='button'&&n.props.children==='취소').props.onClick();assert.equal(project.name,'원본');assert.equal(nodes(render()).some(n=>n.type==='input'),false);
edit();view=render();nodes(view).find(n=>n.props?.['aria-label']==='프로젝트 이름').props.onChange({target:{value:'확정'}});
// A background task update must survive committing metadata from an older draft.
project={...project,tasks:[{id:'new',title:'새 할 일',stage:'기획'}]};view=render();nodes(view).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(project.name,'확정');assert.equal(project.tasks[0].id,'new');assert.equal(writes,1);assert.equal(nodes(render()).some(n=>n.type==='input'),false);
const entries=parseMemberLines('사용자A,,,연락처D,minsu@example.com\n사용자B\t\t\t연락처E\tseoyeon@example.com\n\n사용자A,,,연락처D,minsu@example.com');assert.equal(entries.length,3);assert.equal(entries[1].email,'seoyeon@example.com');assert.equal(entries[0].contact,'연락처D');assert.equal(parseMemberLines(' , , \n').length,0);
let imported=entries.reduce((w,m,i)=>model.addProductionMember(w,'g',{...m,id:'import-'+i}),workspace);assert.equal(model.productionMembers(imported,imported.productions[0]).length,4);assert.equal(imported.members.length,4);
edit();view=render();nodes(view).find(n=>n.type===overviewFields.CategoryChoices).props.onChange(['design','video']);view=render();nodes(view).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.deepEqual(Array.from(project.categoryIds),['design','video']);assert.equal(project.status,'기획 중');assert.ok(model.categoryFor(workspace,project).stages.includes('디자인'));assert.ok(model.categoryFor(workspace,project).stages.includes('편집'));
console.log('Overview: read-only, isolated draft, cancel, commit preserving concurrent tasks; bulk member parsing and linking passed');

const namesakes={...workspace,members:[{id:'one',name:'사용자A',email:'one@example.com'}]};const added=model.addProductionMember(namesakes,'g',{id:'two',name:'사용자A',email:'two@example.com'});assert.equal(added.members.length,2);
