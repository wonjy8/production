export function decorateReferenceFilters(root){
 root.querySelector('[data-ref-scope=favorite]')?.remove();const all=root.querySelector('[data-ref-scope=all]');all?.previousElementSibling?.matches('.sidebar-project-heading')&&all.previousElementSibling.remove();all?.remove();
 const sections=root.querySelector('.sidebar-source-sections');if(sections&&!sections.querySelector('[data-reference-archive]')){const archive=document.createElement('button');archive.className='sidebar-ref-link keep-label';archive.dataset.referenceArchive='';archive.innerHTML=(window.productionUI?.iconSVG('folder')||'')+'<span>아카이브</span>';archive.onclick=()=>window.openReferencesArchive?.();sections.append(archive)}
 for(const [title,selector,key]of [['분류','[data-ref-category]','categories'],['태그','[data-ref-tag]','tags']]){
  const header=[...root.querySelectorAll('.sidebar-project-heading')].find(el=>el.textContent.trim()===title);if(!header)continue;
  const details=document.createElement('details');details.className='reference-filter-group';details.open=localStorage.getItem('pn-reference-filter:'+key)!=='closed';const summary=document.createElement('summary');summary.textContent=title;const list=document.createElement('div');
  let next=header.nextElementSibling;while(next?.matches(selector)){const following=next.nextElementSibling;list.append(next);next=following}details.append(summary,list);header.replaceWith(details);details.addEventListener('toggle',()=>localStorage.setItem('pn-reference-filter:'+key,details.open?'open':'closed'));
 }
 const trash=root.querySelector('[data-ref-scope=trash]'),footer=document.querySelector('.sidebar-footer');if(trash&&footer){footer.querySelector('.sidebar-reference-trash')?.remove();trash.classList.add('sidebar-reference-trash');trash.onclick=()=>root.onclick?.({target:trash});footer.append(trash)}
}
