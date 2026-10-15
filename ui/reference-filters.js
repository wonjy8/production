export function decorateReferenceFilters(root){
 const sections=root.querySelector('.sidebar-source-sections');
 root.querySelector('[data-ref-scope=favorite]')?.remove();root.querySelector('[data-ref-scope=all]')?.remove();root.querySelector('[data-ref-scope=trash]')?.remove();
 document.querySelector('.sidebar-footer .sidebar-reference-trash')?.remove();
 for(const header of [...root.querySelectorAll('.sidebar-project-heading')]){
  if(header.textContent.trim()==='태그'){let next=header.nextElementSibling;while(next?.matches('[data-ref-tag]')){const following=next.nextElementSibling;next.remove();next=following}header.remove()}
  else if(header.textContent.trim()==='분류')header.textContent='탭';
 }
 if(['documents','resources','archive','trash'].includes(root.dataset.sourceSection))for(const child of [...root.children])if(child!==sections)child.remove();
}
