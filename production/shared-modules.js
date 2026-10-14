import {figmaEmbedURL} from './figma-connection.js';
export const moduleKinds=[['grade-calculator','학점 계산기','table'],['schedule-list','일정 목록','calendar'],['text','텍스트','file'],['image','사진','reference'],['video','영상','video'],['file','파일','file'],['link','링크','link'],['embed','임베드','video'],['divider','구분선','list'],['accounting','회계','table'],['checklist','체크리스트','tasks'],['tracker','현황표','table'],['materials','자료','folder'],['tasks','할 일','tasks'],['schedule','일정','calendar'],['timetable','타임테이블','calendar']];
export function referenceModules(r){
 if(Array.isArray(r.tabs))return r.tabs.flatMap(t=>t.modules||[]);
 if(Array.isArray(r.modules))return r.modules;
 const blocks=Array.isArray(r.blocks)?r.blocks:[...(r.description?[{id:r.id+'-text',kind:'text',text:r.description}]:[]),...(r.attachments||(r.fileId?[r]:r.url?[{kind:'link',url:r.url}]:[]))];
 return blocks.map((b,i)=>{const id=b.id||r.id+'-'+i;if(['text','table','event','check'].includes(b.kind))return {id,kind:'text',text:b.text||'',title:b.title};if(b.kind==='link')return {id,kind:'link',url:b.url||'',title:b.title};return {id,kind:['image','video'].includes(b.kind)?b.kind:'file',files:[{id:b.fileId,name:b.originalName||b.title||'파일',kind:b.kind,mime:b.mime,size:b.size,tags:b.tags||[],galleryTags:b.galleryTags||[],galleryHiddenTags:b.galleryHiddenTags||[],photoEdit:b.photoEdit}]}});
}
export function resolveSharedModule(module,w,refs){
 const source=module.source;if(!source||module.sourceCopy)return module;
 const owner=source.kind==='reference'?refs.find(r=>r.id===source.ownerId&&!r.deleted):(source.kind==='project'?w.projects:w.productions).find(p=>p.id===source.ownerId&&!p.deleted);
 const modules=source.kind==='reference'?(owner?referenceModules(owner):[]):(owner?.customTabs||[]).flatMap(t=>t.modules);
 const found=modules.find(m=>m.id===source.moduleId);
 return found&&!found.source?found:null;
}
export function sharedChoices(w,refs){
 const out=[];
 for(const r of refs.filter(r=>!r.deleted))for(const t of referenceTabs(r))for(const m of t.modules)out.push({key:'r:'+r.id+':'+m.id,label:r.title+' / '+t.name+' / '+(m.title||moduleKinds.find(k=>k[0]===m.kind)?.[1]||'모듈'),source:m.source||{kind:'reference',ownerId:r.id,moduleId:m.id},module:m});
 for(const [kind,owners] of [['project',w.projects||[]],['production',w.productions||[]]])for(const p of owners)for(const t of p.customTabs||[])for(const m of t.modules)out.push({key:kind+':'+p.id+':'+m.id,label:(p.name||p.title)+' / '+t.name+' / '+(m.title||moduleKinds.find(k=>k[0]===m.kind)?.[1]||'모듈'),source:m.source||{kind,ownerId:p.id,moduleId:m.id},module:m});
 return out;
}
export function updateSharedOwner(w,source,fn){const key=source.kind==='project'?'projects':'productions';return {...w,[key]:w[key].map(p=>p.id===source.ownerId?{...p,customTabs:(p.customTabs||[]).map(t=>({...t,modules:t.modules.map(m=>m.id===source.moduleId?fn(m):m)}))}:p)}};
export function youtubeURL(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return '';let id='';if(u.hostname==='youtu.be')id=u.pathname.split('/')[1];else if(['youtube.com','www.youtube.com','m.youtube.com','www.youtube-nocookie.com'].includes(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):['embed','shorts','live'].includes(u.pathname.split('/')[1])?u.pathname.split('/')[2]:'';return /^[\w-]{11}$/.test(id||'')?'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&rel=0':''}catch{return ''}}

export function referenceTabs(r){return Array.isArray(r.tabs)?r.tabs:[{id:r.id+'-main',name:'자료',modules:referenceModules(r)}]}
export function normalizeReferenceTabs(r){const tabs=referenceTabs(r).map((t,i)=>({ ...t,name:t.name==='레퍼런스 워크스페이스'?'자료':t.name })).map((t,i)=>i===0&&!r.tabMetadataMigrated?{...t,tags:[...new Set([...(t.tags||[]),...(r.tags||[])])],categories:[...new Set([...(t.categories||[]),...(r.categories||(r.category?[r.category]:[]))])]}:t);const categories=[...new Set(tabs.flatMap(t=>t.categories||[]))];return {...r,tags:[],categories,category:categories[0]||'',tabMetadataMigrated:true,tabs,modules:tabs.flatMap(t=>t.modules||[])}}
export function updateReferenceModule(r,id,fn){return normalizeReferenceTabs({...r,tabs:referenceTabs(r).map(t=>({...t,modules:t.modules.map(m=>m.id===id?fn(m):m)}))})}
export function instagramProfileURL(raw){try{const u=new URL(raw);return ['instagram.com','www.instagram.com','m.instagram.com'].includes(u.hostname)&&u.protocol==='https:'&&!u.username&&!u.password&&/^\/[A-Za-z0-9._]+\/?$/.test(u.pathname)?u.href:''}catch{return ''}}
export function embedURL(raw){const figma=figmaEmbedURL(raw);if(figma)return figma;try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)return '';if(['figma.com','www.figma.com'].includes(u.hostname)&&/^\/(file|design|proto|board)\//.test(u.pathname))return 'https://www.figma.com/embed?embed_host=share&url='+encodeURIComponent(u.href);if(['www.youtube.com','youtube.com','youtu.be'].includes(u.hostname))return youtubeURL(u.href);if(['player.vimeo.com','vimeo.com'].includes(u.hostname)&&/^\/(?:video\/)?[0-9]+\/?$/.test(u.pathname))return 'https://player.vimeo.com/video/'+u.pathname.match(/[0-9]+/)[0];return ''}catch{return ''}}
export function instagramURL(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol)||!['instagram.com','www.instagram.com','m.instagram.com'].includes(u.hostname)||u.username||u.password)return '';const match=u.pathname.match(/^\/(p|reel|reels|tv)\/([A-Za-z0-9_-]+)\/?$/);return match?'https://www.instagram.com/'+(match[1]==='reels'?'reel':match[1])+'/'+match[2]+'/embed/':''}catch{return ''}}

export const moduleGroups=[
 {id:'school',label:'학교',kinds:['grade-calculator']},
 {id:'work',label:'업무·일정',kinds:['tasks','schedule','schedule-list','timetable']},
 {id:'content',label:'콘텐츠',kinds:['text','image','video']},
 {id:'materials',label:'자료·링크',kinds:['materials','file','link','embed','divider','accounting']},
];
