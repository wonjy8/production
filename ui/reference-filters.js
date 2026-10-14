export function decorateReferenceFilters(root){
 root.querySelector('[data-ref-scope=favorite]')?.remove();
 for(const [title,selector,key]of [['분류','[data-ref-category]','categories'],['태그','[data-ref-tag]','tags']]){
  const header=[...root.querySelectorAll('.sidebar-project-heading')].find(el=>el.textContent.trim()===title);if(!header)continue;
  const details=document.createElement('details');details.className='reference-filter-group';details.open=localStorage.getItem('pn-reference-filter:'+key)!=='closed';const summary=document.createElement('summary');summary.textContent=title;const list=document.createElement('div');
  let next=header.nextElementSibling;while(next?.matches(selector)){const following=next.nextElementSibling;list.append(next);next=following}details.append(summary,list);header.replaceWith(details);details.addEventListener('toggle',()=>localStorage.setItem('pn-reference-filter:'+key,details.open?'open':'closed'));
 }
 const trash=root.querySelector('[data-ref-scope=trash]'),footer=document.querySelector('.sidebar-footer');if(trash&&footer){footer.querySelector('.sidebar-reference-trash')?.remove();trash.classList.add('sidebar-reference-trash');trash.onclick=()=>root.onclick?.({target:trash});footer.append(trash)}
}
