import { referenceTabs } from "./shared-modules.js";
import { sourceGallery } from "./source-gallery-model.js";
const types =
  /\.(docx?|docm|dotx?|dotm|odt|rtf|txt|md|markdown|html?|pdf|hwp|hwpx|xlsx?|xlsm|ods|csv|pptx?|odp)$/i;
export function documentLibrary(workspace, references, resources=[],{showCompleted=false}={}) {
  const hiddenIds=new Set(resources.filter(r=>r.deleted||r.purged||r.completionOwner&&!showCompleted).map(r=>r.fileId));
  resources=resources.filter(r=>!r.deleted&&!r.purged&&(!r.completionOwner||showCompleted));
  if(resources.length){
    const categories=[...new Set(resources.map(r=>r.properties?.category||'미분류'))];
    references=[...references,{id:'catalog-library',title:'자료',recordType:'source',tabs:categories.map(category=>({id:'catalog-'+category,name:category,modules:[{id:'catalog-module-'+category,kind:'file',files:resources.filter(r=>(r.properties?.category||'미분류')===category).map(r=>r.file)}]}))}];
  }
  const current = (o) => ({ ...o, archives: undefined }),
    data = {
      ...workspace,
      projects: (workspace.projects || []).map(current),
      productions: (workspace.productions || []).map(current),
    };
  const rows = sourceGallery(data, references).filter(
    (f) =>
      !hiddenIds.has(f.id)&&(types.test(f.name || "") ||
      /^(text\/|application\/(pdf|msword|vnd\.(openxmlformats|ms-|oasis)))/i.test(
        f.mime || "",
      )),
  );
  const root = { id: "", name: "문서", folders: [], files: [] },
    entries = [];
  function folder(parent, id, name) {
    let child = parent.folders.find((f) => f.id === id);
    if (!child) {
      child = { id, name, folders: [], files: [] };
      parent.folders.push(child);
    }
    return child;
  }
  const names=new Map(resources.map(r=>[r.fileId,r.file?.name||r.title]));
  for (const file of rows) {if(names.has(file.id))file.name=names.get(file.id);}
  for (const file of rows)
    for (const origin of file.origins) {
      const ref =
        origin.ownerKind === "reference"
          ? (references || []).find((r) => r.id === origin.ownerId)
          : null;
      const owner =
        ref ||
        (origin.ownerKind === "project"
          ? workspace.projects
          : workspace.productions || []
        ).find((o) => o.id === origin.ownerId);
      const tabs = ref ? referenceTabs(ref) : owner?.customTabs || [];
      const placement = tabs
        .flatMap((t) => t.modules || [])
        .find((m) => m.id === origin.moduleId);
      // Legacy live links are shortcuts to the source, not independent document copies.
      if (placement?.source && !placement.sourceCopy) continue;
      const section = ref
        ? ref.recordType === "source"
          ? ["sources", "소스"]
          : ref.recordType === "portfolio"
            ? ["portfolios", "포트폴리오"]
            : ["references", "레퍼런스"]
        : ["projects", "프로젝트"];
      const frozen=resources.find(r=>r.fileId===file.id)?.completionOwner;
      const path = frozen?[{id:"completed-projects",name:"완료된 프로젝트"},{id:"completed:"+frozen.id,name:frozen.name}]:[{ id: section[0], name: section[1] }];
      if(!frozen){
      if (origin.ownerKind === "project") {
        const owner = (workspace.projects || []).find(
            (p) => p.id === origin.ownerId,
          ),
          parent = (workspace.productions || []).find(
            (p) => p.id === owner?.productionId && !p.deleted,
          );
        if (parent)
          path.push({ id: "production:" + parent.id, name: parent.name });
      }
      path.push({
        id: origin.ownerKind + ":" + origin.ownerId,
        name: origin.ownerName || "이름 없음",
      });
      if (origin.tabId)
        path.push({
          id: "tab:" + origin.tabId,
          name: origin.tabName || "자료",
        });
      }
      const entry = {
        ...file,
        origin,
        path,
        key: file.id + ":" + path.map((p) => p.id).join("/"),
      };
      if (entries.some((e) => e.key === entry.key)) continue;
      entries.push(entry);
      let target = root;
      for (const part of path) target = folder(target, part.id, part.name);
      target.files.push(entry);
    }
  function sort(node) {
    node.folders.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    node.files.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    node.count = node.files.length;
    for (const child of node.folders) {
      sort(child);
      node.count += child.count;
    }
  }
  sort(root);
  return { root, entries, count: new Set(entries.map((e) => e.id)).size };
}
