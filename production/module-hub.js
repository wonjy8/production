import {columnModule} from './column-layout.js';
export const hubCategories=[{id:'all',label:'전체'},{id:'basic',label:'기본'},{id:'schedule',label:'일정'},{id:'media',label:'미디어'},{id:'layout',label:'나누기'}];
export const hubGroup=item=>item.category;
export const moduleTemplates=[
 {id:'note',category:'basic',name:'메모',description:'자유롭게 작성하는 텍스트',icon:'file',kind:'text'},
 {id:'schedule',category:'schedule',name:'캘린더',description:'월간·주간·일간 일정',icon:'calendar',kind:'schedule'},
 {id:'timetable',category:'schedule',name:'타임테이블',description:'날짜와 시간에 맞춰 일정 배치',icon:'timetable',kind:'timetable'},
 {id:'schedule-list',category:'schedule',name:'일정 목록',description:'등록된 일정 모아 보기',icon:'schedule-list',kind:'schedule-list'},
 {id:'tasks',category:'schedule',name:'할일',description:'프로젝트 할일 연결',icon:'tasks',kind:'tasks'},
 {id:'photos',category:'media',name:'사진',description:'이미지 모아 보기',icon:'reference',kind:'image'},
 {id:'video',category:'media',name:'영상',description:'영상 파일과 YouTube',icon:'video',kind:'video'},
 {id:'files',category:'media',name:'파일',description:'자료와 문서 첨부',icon:'file',kind:'file'},
 {id:'bookmark',category:'media',name:'링크',description:'북마크 또는 임베드',icon:'link',kind:'link',requiresUrl:true},
 {id:'section-heading',category:'layout',name:'섹션 제목',description:'내용의 제목과 설명',icon:'section-heading',kind:'section-heading'},
 {id:'divider',category:'layout',name:'구분선',description:'내용 구역 나누기',icon:'divider',kind:'divider'},
 ...[2,3,4].map(count=>({id:`columns-${count}`,category:'layout',name:`${count}단 열`,description:'중첩 포함 가로 최대 4칸',icon:`columns-${count}`,kind:'columns',count})),
];
export const tabTemplates=[
 {id:'blank',category:'basic',name:'빈 탭',description:'직접 채우는 새 화면',icon:'plus',modules:[]},
 {id:'school-events',category:'schedule',name:'학사 운영',description:'일정·할일',icon:'calendar',modules:['schedule-list','tasks']},
 {id:'work-board',category:'schedule',name:'업무 운영',description:'할일·메모·캘린더',icon:'tasks',modules:['tasks','note','schedule']},
 {id:'creative',category:'media',name:'콘텐츠 제작',description:'파일·사진·영상',icon:'reference',modules:['files','photos','video']},
];
export function createHubModule(id,options={}){const t=moduleTemplates.find(t=>t.id===id);if(!t)throw Error('지원하지 않는 모듈입니다.');if(t.kind==='columns')return {...columnModule(t.count),...options};return {id:crypto.randomUUID(),kind:t.kind,title:t.name,span:12,blockLayout:true,...(t.kind==='timetable'?{frameHeight:620}:{}),...options};}
export function createHubTab(id){const t=tabTemplates.find(t=>t.id===id);if(!t)throw Error('지원하지 않는 템플릿입니다.');return {id:crypto.randomUUID(),name:t.name,tags:[],modules:t.modules.map(createId=>createHubModule(createId))};}
