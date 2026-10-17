// Shared title interaction; each domain supplies its permission and persistence adapter.
export function createPageTitleEditor({button,input,label,getTarget,onRefresh,onError}){
 let editing=null,pending=null;
 function sync(title,target){
  const allowed=!!target?.canEdit;
  if(editing&&editing.key!==target?.key&&!pending)editing=null;
  if(label.textContent!==title)label.textContent=title;button.hidden=!allowed||!!editing;label.hidden=allowed;input.hidden=!editing;
  const text=button.querySelector('.app-editable-title-label');if(text&&text.textContent!==title)text.textContent=title;
 }
 function start(){const target=getTarget();if(!target?.canEdit||pending)return;editing=target;input.value=target.title;input.maxLength=target.maxLength||200;button.hidden=true;input.hidden=false;input.focus();input.select()}
 async function finish(cancel=false){
  if(pending)return pending;if(!editing)return true;
  if(cancel){editing=null;onRefresh();return true}
  const target=getTarget(),name=input.value.trim();
  if(!target?.canEdit||target.key!==editing.key){onError('편집 권한이나 현재 페이지를 확인하세요.');return false}
  if(!name){onError('제목을 입력하세요.');input.focus();return false}
  if(name.length>(target.maxLength||200)){onError('제목은 '+(target.maxLength||200)+'자까지 입력하세요.');input.focus();return false}
  if(name===editing.title){editing=null;onRefresh();return true}
  const original=editing;
  pending=Promise.resolve().then(async()=>{try{if(await target.rename(name)===false)throw Error('이름을 저장하지 못했습니다.');editing=null;return true}catch(error){editing=original;onError(error.message||'이름을 저장하지 못했습니다.');return false}finally{pending=null;input.disabled=false;onRefresh();if(editing)input.focus()}});
  input.disabled=true;return pending;
 }
 button.onclick=start;input.onblur=()=>finish();input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();finish()}else if(event.key==='Escape'){event.preventDefault();finish(true)}};
 return {sync,finish,get editing(){return !!editing}};
}
