import {readRepeat} from '../production/recurrence.js';
import * as taskStatus from '../production/task-status.js';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),esbuild=require(process.env.PRODUCTION_ESBUILD||'esbuild');
const source=readFileSync('production/TaskComposer.tsx','utf8');
const code=esbuild.transformSync(source,{loader:'tsx',format:'cjs',jsx:'automatic'}).code;
let cursor=0;const values=[],added=[];let reset=0,focused=0;
const jsx=(type,props)=>({type,props});
const context={exports:{},module:{exports:{}},FormData:class{has(){return false}get(key){return {due:'2026-10-20',stage:'촬영',priority:'높음',description:' 메모 '}[key]||''}},require(name){if(name==='./RepeatFields')return {RepeatFields:'RepeatFields',readRepeat};if(name==='./task-status.js')return taskStatus;if(name==='react')return {useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],value=>values[i]=typeof value==='function'?value(values[i]):value]},useRef(){return {current:{focus(){focused++}}}}};if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='lucide-react'||name==='../ui/design-system/Icons')return Object.fromEntries(['CalendarDays','Check','Circle','Flag','ListChecks'].map(n=>[n,n]));if(name==='./AssigneePicker')return {AssigneePicker:'AssigneePicker'};if(name==='./data')return {newTask:title=>({id:'fresh',title,done:false,owner:'미지정',due:'',stage:'기획',priority:'보통',description:''}),stages:['기획','촬영'],priorities:['보통','높음']};throw Error(name)}};
vm.runInNewContext(code,context);
function render(){cursor=0;return context.module.exports.TaskComposer({members:[],onAddMember(){},onAdd:task=>added.push(task)})}
function nodes(root){return [root,...[root?.props?.children].flat(Infinity).filter(x=>x&&typeof x==='object').flatMap(nodes)]}
let form=render();assert.equal(nodes(form).filter(n=>n.type==='textarea').length,0);
let input=nodes(form).find(n=>n.type==='input');input.props.onFocus();input.props.onChange({target:{value:'   '}});form=render();assert.equal(nodes(form).find(n=>n.type==='button').props.disabled,true);
form.props.onSubmit({preventDefault(){},currentTarget:{reset(){reset++}}});assert.equal(added.length,0);
input=nodes(form).find(n=>n.type==='input');let prevented=false;input.props.onKeyDown({key:'Enter',nativeEvent:{isComposing:true},preventDefault(){prevented=true}});assert.equal(prevented,true);
input.props.onChange({target:{value:'  촬영 준비  '}});form=render();nodes(form).find(n=>n.type==='AssigneePicker').props.onChange('담당자');form=render();form.props.onSubmit({preventDefault(){},currentTarget:{reset(){reset++}}});
assert.equal(added.length,1);assert.equal(added[0].title,'촬영 준비');assert.equal(added[0].description,'메모');assert.equal(added[0].owner,'담당자');assert.equal(added[0].due,'2026-10-20');assert.equal(added[0].priority,'높음');assert.equal(added[0].stage,'촬영');assert.equal(reset,1);assert.equal(focused,1);form=render();assert.equal(nodes(form).find(n=>n.type==='input').props.value,'');assert.equal(nodes(form).find(n=>n.type==='AssigneePicker').props.value,'미지정');
console.log('Inline task composer: empty input, Korean composition, metadata, add and reset passed');
