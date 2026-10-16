import assert from 'node:assert/strict';
import {createPageTitleEditor} from '../ui/design-system/title-editor.js';
const label={textContent:'',hidden:false},text={textContent:''},button={hidden:false,querySelector:()=>text},input={hidden:true,value:'',focus(){},select(){}};
let disabled=false;Object.defineProperty(input,'disabled',{get:()=>disabled,set:value=>{disabled=value;if(value)input.onblur?.()}});
let target,editor,saves=[],errors=[],gate,fail=false;
function update(){editor.sync(target?.title||'홈',target)}
const rename=async name=>{if(gate)await gate;if(fail)throw Error('저장 실패');saves.push(name);target.title=name;return true};
target={key:'project:1',title:'프로젝트',canEdit:true,rename};editor=createPageTitleEditor({button,input,label,getTarget:()=>target,onRefresh:update,onError:e=>errors.push(e)});update();
button.onclick();assert.equal(input.value,'프로젝트');input.value='취소';await editor.finish(true);assert.deepEqual(saves,[]);assert.equal(input.hidden,true);
button.onclick();input.value=' ';assert.equal(await editor.finish(),false);assert.equal(editor.editing,true);await editor.finish(true);
button.onclick();input.value='새 제목';let release;gate=new Promise(r=>release=r);const first=editor.finish(),second=editor.finish();release();assert.equal(await first,true);assert.equal(await second,true);assert.deepEqual(saves,['새 제목']);gate=null;
button.onclick();input.value='재시도';fail=true;assert.equal(await editor.finish(),false);assert.equal(editor.editing,true);assert.equal(input.disabled,false);fail=false;assert.equal(await editor.finish(),true);assert.equal(target.title,'재시도');
button.onclick();input.value='권한 없음';target.canEdit=false;assert.equal(await editor.finish(),false);assert.equal(saves.length,2);await editor.finish(true);update();assert.equal(button.hidden,true);
target={...target,key:'reference:2',canEdit:true,title:'자료'};update();button.onclick();input.value='자료 제목';await input.onblur();assert.equal(target.title,'자료 제목');
button.onclick();input.value='다른 대상';target={...target,key:'project:3'};assert.equal(await editor.finish(),false);assert.equal(saves.length,3);await editor.finish(true);
assert.ok(errors.length>=3);console.log('Title editor: shared click/input, cancel, blank rejection, concurrent save, failed-save retry, permission changes, blur commit and stale target guard passed');
