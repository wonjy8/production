import {projectIconPaths} from './project-icon-paths.js';
// Production icon pack: 24px grid, 1.75px stroke, rounded caps and joins.
export const icons={
 cross:'<path d="M10 3h4v5h5v4h-5v9h-4v-9H5V8h5Z"/>',
 church:'<path d="M12 2v7m-3-4h6M4 22V11l8-5 8 5v11M9 22v-7h6v7M3 22h18"/>',
 bible:'<path d="M5 3h14v18H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm-2 15a3 3 0 0 1 3-3h13M12 6v6m-3-3h6"/>',
 dove:'<path d="M3 16c4 1 6-1 8-4l-2-7 5 3 4-4 1 6 3 3-5 1c-2 5-8 7-14 2Z"/>',
 fish:'<path d="M3 12c4-6 11-7 16 0-5 7-12 6-16 0Zm0 0-1-5m1 5-1 5M14 11h.01"/>',
 prayer:'<path d="m9 3 3 8 3-8 3 8-6 10-6-10 3-8Z"/>',
 candle:'<path d="M9 22h6M10 18h4v4h-4zM12 2c3 3 3 6 0 8-3-2-3-5 0-8ZM12 10v8"/>',
 chalice:'<path d="M5 3h14v4a7 7 0 0 1-14 0V3ZM12 14v7M8 21h8"/>',
 shepherd:'<path d="M8 21V7a4 4 0 0 1 8 0 3 3 0 0 1-3 3h-1M5 21h7"/>',
 olive:'<path d="M4 20c9-2 13-9 16-16M6 17c-4-1-4-5-3-7 4 0 6 3 6 5m3-3c-2-3 0-6 3-7 2 3 1 5-1 7m2-5c2-3 5-3 7-2-1 4-3 5-7 5"/>',
 crown:'<path d="M3 7 7 12l5-8 5 8 4-5-2 13H5L3 7ZM5 20h14"/>',
 heart:'<path d="M12 21 4 13C-1 8 6 2 12 8c6-6 13 0 8 5Z"/>',
 music:'<path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Zm12-2a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3ZM9 9l12-2"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18m0-18c5 5 5 13 0 18"/>',
 mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8"/>',
 tag:'<path d="M20 13 13 20a2 2 0 0 1-3 0L3 13V3h10l7 7a2 2 0 0 1 0 3Z"/><circle cx="7.5" cy="7.5" r="1"/>',
 camera:'<path d="M14.5 5h-5L8 8H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="14" r="4"/>',
 chevronLeft:'<path d="m15 5-7 7 7 7"/>',chevronRight:'<path d="m9 5 7 7-7 7"/>',arrowUpRight:'<path d="M7 17 17 7M7 7h10v10"/>',flag:'<path d="M5 21V3m0 0h14l-3 4 3 4H5"/>',
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 filter:'<path d="M4 7h16M7 12h10M10 17h4"/>',
 settings:'<path d="M12 3 14 5l3-.3.3 3L20 10v4l-2.7 2.3-.3 3-3-.3-2 2-2-2-3 .3-.3-3L4 14v-4l2.7-2.3.3-3 3 .3Z"/><circle cx="12" cy="12" r="3"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 projects:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
 reference:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 16 5-5 5 5 3-3 5 5"/><circle cx="16" cy="8" r="2"/>',
 operations:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 tasks:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m7 8 1 1 2-2m-3 6 1 1 2-2m-3 6 1 1 2-2M13 8h4M13 13h4M13 18h4"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2m6 0h2m-10 4h2"/>',
 file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 14h8M8 18h5"/>',
 feedback:'<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V7a4 4 0 0 1 4-4h6a8 8 0 0 1 8 8Z"/><path d="M7 8h10M7 12h7"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
 share:'<path d="M12 15V3m-4 4 4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
 right:'<path d="m9 5 7 7-7 7"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 back:'<path d="m10 5-7 7 7 7M3 12h18"/>', up:'<path d="m5 14 7-7 7 7"/>',down:'<path d="m5 10 7 7 7-7"/>',
 edit:'<path d="m15 4 5 5M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15ZM4 20l4-1"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
 eyeOff:'<path d="m3 3 18 18M10 5a10 10 0 0 1 2 0c6 0 10 7 10 7a20 20 0 0 1-3 4M6 6a20 20 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1"/>',
 star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z"/>',
 undo:'<path d="M3 10h10a7 7 0 0 1 0 14M3 10l5-5M3 10l5 5" transform="translate(0 -3)"/>',
 refresh:'<path d="M20 8a9 9 0 0 0-15-3L3 8m0-5v5h5m-4 8a9 9 0 0 0 15 3l2-3m0 5v-5h-5"/>',
 link:'<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 1)"/>',
 video:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4Z"/>',
 text:'<path d="M4 5h16M12 5v15M8 20h8"/>',
 table:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
 users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 4v2"/>',
 save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8"/>',
 check:'<path d="m4 12 5 5L20 6"/>',list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 board:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M5 8h2m4 4h2m4-4h2"/>',
 archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',
 download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 print:'<path d="M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6ZM17 11h.01"/>',
 drag:'<circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/>'
};
Object.assign(icons,projectIconPaths);
// Latin cross: long lower stem, rather than the medical cross silhouette.
icons.cross='<path d="M12 3v18M6 8h12"/>';
icons.figma='<g stroke="none"><path fill="#f24e1e" d="M6 2h6v7H6a3.5 3.5 0 0 1 0-7Z"/><path fill="#ff7262" d="M12 2h5a3.5 3.5 0 0 1 0 7h-5Z"/><path fill="#a259ff" d="M6 9h6v7H6a3.5 3.5 0 0 1 0-7Z"/><circle fill="#1abcfe" cx="15.5" cy="12.5" r="3.5"/><path fill="#0acf83" d="M6 16h6v3.5A3.5 3.5 0 1 1 6 16Z"/></g>';
export function iconSVG(name){if(String(name).startsWith('emoji:'))return '<span class="ui-icon ui-emoji" aria-hidden="true">'+String(name).slice(6).slice(0,32).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</span>';return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(icons[name]||icons.plus)+'</svg>';}
export function inferIcon(label){if(/사이드바|목차/.test(label))return 'menu';if(/새 프로젝트|새 프로덕션/.test(label))return 'plus';if(/닫기|취소|삭제.*모듈|×|지우기/.test(label))return 'close';if(/휴지통|삭제/.test(label))return 'trash';if(/복사|복제/.test(label))return 'copy';if(/공유/.test(label))return 'share';if(/인쇄|PDF/.test(label))return 'print';if(/저장/.test(label))return 'save';if(/복원|다시|초기화/.test(label))return 'refresh';if(/즐겨찾기|☆|★/.test(label))return 'star';if(/숨기기/.test(label))return 'eyeOff';if(/표시/.test(label))return 'eye';if(/위로|↑/.test(label))return 'up';if(/아래로|↓/.test(label))return 'down';if(/실행 취소|↶/.test(label))return 'undo';if(/목록/.test(label))return 'list';if(/보드/.test(label))return 'board';if(/갤러리|카드/.test(label))return 'projects';if(/레퍼런스/.test(label))return 'reference';if(/프로젝트/.test(label))return 'projects';if(/프로덕션/.test(label))return 'folder';if(/담당자/.test(label))return 'users';if(/수정|편집/.test(label))return 'edit';if(/링크/.test(label))return 'link';if(/사진|이미지/.test(label))return 'reference';if(/영상/.test(label))return 'video';if(/파일|자료/.test(label))return 'file';if(/텍스트/.test(label))return 'text';if(/표|붙여넣기/.test(label))return 'table';if(/모듈 이동/.test(label))return 'drag';if(/일정/.test(label))return 'calendar';if(/피드백/.test(label))return 'feedback';if(/할 일|체크/.test(label))return 'tasks';if(/보관/.test(label))return 'archive';if(/다운로드/.test(label))return 'download';if(/검색/.test(label))return 'search';if(/추가|만들기|등록|＋|\+/.test(label))return 'plus';return 'plus';}

// The app shell is constructed before the deferred UI bundle finishes loading.
export function hydrateSidebarIcons(root){
 root.querySelectorAll('[data-navigation-icon]').forEach(button=>{
  if(!button.querySelector('svg'))button.insertAdjacentHTML('afterbegin',iconSVG(button.dataset.navigationIcon));
 });
}
