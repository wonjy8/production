import { columnModule } from "./column-layout.js";
import {planningModuleTemplates,planningTabTemplates,planningInitial,populatePlanningTab} from './planning-templates.js';
// Templates are data, so a future project template can reuse the same module definitions.
export const hubCategories = [
 {id:'all',label:'전체'}, {id:'basic',label:'기본 구성'}, {id:'media',label:'미디어'},
 {id:'schedule',label:'일정·할 일'}, {id:'data',label:'자료·데이터'}, {id:'planning',label:'구성·운영'},
 {id:'school',label:'학교'}, {id:'work',label:'업무'}, {id:'church',label:'교회·사역'},
];
const moduleCategory={tasks:'schedule',schedule:'schedule',timetable:'schedule','schedule-list':'schedule',checklist:'schedule',files:'media',photos:'media',materials:'data',database:'data','group-list':'planning','progress-table':'planning','info-cards':'planning','assignment-table':'planning'};
export function hubGroup(item){return moduleCategory[item.id]||item.category;}

export const moduleTemplates = [
 ...[2,3,4].map(count=>({id:`columns-${count}`,category:"basic",name:`${count}단 열`,description:"열 안에 모듈 배치 · 중첩 포함 최대 4칸",icon:`columns-${count}`,kind:"columns",count})),
 ...planningModuleTemplates,
 {id:'database',category:'basic',name:'데이터베이스',description:'문서·파일을 속성과 분류로 관리',icon:'table',kind:'database'},
 {id:'sermon-notes',category:'church',name:'말씀 노트',description:'예배·QT·동아리 말씀을 문서로 기록',icon:'book',kind:'database',noteTemplate:true},
 {id:'note',category:'basic',name:'메모',description:'자유롭게 작성하는 텍스트',icon:'file',kind:'text'},
 {id:'checklist',category:'basic',name:'체크리스트',description:'항목을 완료하며 진행 상황 확인',icon:'tasks',kind:'checklist'},
 {id:'tasks',category:'basic',name:'할 일',description:'프로젝트 할 일 연결',icon:'tasks',kind:'tasks'},
 {id:'schedule',category:'basic',name:'일정',description:'프로젝트 일정 연결',icon:'calendar',kind:'schedule'},
 {id:'timetable',category:'basic',name:'타임테이블',description:'시간대별 일정 계획',icon:'calendar',kind:'timetable'},
 {id:'schedule-list',category:'basic',name:'일정 목록',description:'등록된 일정을 목록으로 표시',icon:'calendar',kind:'schedule-list'},
 {id:'files',category:'basic',name:'파일',description:'자료와 문서 첨부',icon:'file',kind:'file'},
 {id:'photos',category:'basic',name:'사진',description:'이미지 갤러리',icon:'reference',kind:'image'},
 {id:'materials',category:'basic',name:'자료 모음',description:'자료를 그룹으로 정리',icon:'folder',kind:'materials'},
 {id:'divider',category:'basic',name:'구분선',description:'내용 구역 나누기',icon:'divider',kind:'divider'},
 {id:'grade-calculator',category:'school',name:'학점 계산기',description:'과목별 학점·성적과 평균 평점 계산',icon:'table',kind:'grade-calculator'},
 {id:'work-timeline',category:'work',name:'업무 일정',description:'프로젝트 일정 목록',icon:'calendar',kind:'schedule-list'},
 {id:'bookmark',category:'media',name:'링크',description:'북마크 또는 임베드로 표시',icon:'link',kind:'link',requiresUrl:true},
 {id:'media-library',category:'media',name:'미디어 자료실',description:'사진·영상·파일을 그룹별 보관',icon:'folder',kind:'materials'},
 {id:'video',category:'media',name:'영상',description:'영상 파일과 YouTube',icon:'video',kind:'video'},
];

export const tabTemplates = [
 {id:'blank',category:'basic',name:'빈 탭',description:'직접 모듈을 채우는 새 화면',icon:'plus',modules:[]},
 ...planningTabTemplates,

 {id:'school-events',category:'school',name:'학사 운영',description:'일정·준비 체크리스트',icon:'calendar',modules:['schedule-list','checklist']},
 {id:'work-board',category:'work',name:'업무 운영',description:'할 일·메모·일정',icon:'tasks',modules:['tasks','note','work-timeline']},
 {id:'creative',category:'media',name:'콘텐츠 제작',description:'미디어 자료실·사진·영상',icon:'camera',modules:['media-library','photos','video']},
];

export function createHubModule(id, options={}) {
 const template=moduleTemplates.find(item=>item.id===id);
 if(!template)throw Error('알 수 없는 모듈 템플릿');
 if(template.kind==='columns')return {...columnModule(template.count),...options};
 return {id:crypto.randomUUID(),kind:template.kind,title:template.name,span:12,blockLayout:true,
  ...(template.initialText?{text:template.initialText}:{}),
  ...(template.fields?{fields:[...template.fields],states:[...template.states],rows:[]}:{}),
  ...(template.kind==='database'?{files:[],databaseCategories:template.noteTemplate?['예배','QT','동아리']:[],databaseFields:template.noteTemplate?[{id:'category',label:'분류',type:'select'},{id:'date',label:'날짜',type:'date'},{id:'place',label:'장소',type:'text'},{id:'speaker',label:'설교자',type:'text'},{id:'scripture',label:'본문 구절',type:'text'}]:[{id:'category',label:'분류',type:'select'},{id:'date',label:'날짜',type:'date'}],databaseView:'table'}:{}),
  ...(template.kind==='checklist'?{items:[]}:{}),
  ...(template.kind==='grade-calculator'?{gradeScale:'4.5',courses:[]}:{}),
  ...(['section-heading','group-list','progress-table','info-cards','assignment-table'].includes(template.kind)?planningInitial(template.kind):{}),
  ...options};
}

export function createHubTab(id) {
 const template=tabTemplates.find(item=>item.id===id);
 if(!template)throw Error('알 수 없는 탭 템플릿');
 return populatePlanningTab(id,createHubModule)||{id:crypto.randomUUID(),name:template.name,tags:[],modules:template.modules.map(moduleId=>createHubModule(moduleId))};
}
