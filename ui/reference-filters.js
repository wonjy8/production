// Legacy callers can remove old sub-navigation without disturbing Materials groups.
export function decorateReferenceFilters(root){
 root.querySelectorAll('[data-ref-scope],[data-ref-category],[data-ref-tag],.sidebar-project-heading').forEach(element=>element.remove());
}
