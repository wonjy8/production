// Templates are data, so a future project template can reuse the same module definitions.
export const hubCategories = [
 {id:'all',label:'전체'}, {id:'basic',label:'기본'}, {id:'school',label:'학교'},
 {id:'work',label:'업무'}, {id:'church',label:'교회·사역'}, {id:'media',label:'미디어'},
];

export const moduleTemplates = [
 {id:'note',category:'basic',name:'메모',description:'자유롭게 작성하는 텍스트',icon:'file',kind:'text'},
 {id:'checklist',category:'basic',name:'체크리스트',description:'항목을 완료하며 진행 상황 확인',icon:'tasks',kind:'checklist'},
 {id:'tasks',category:'basic',name:'할 일',description:'프로젝트 할 일 연결',icon:'tasks',kind:'tasks'},
 {id:'schedule',category:'basic',name:'일정',description:'프로젝트 일정 연결',icon:'calendar',kind:'schedule'},
 {id:'timetable',category:'basic',name:'타임테이블',description:'시간대별 일정 계획',icon:'calendar',kind:'timetable'},
 {id:'schedule-list',category:'basic',name:'일정 목록',description:'등록된 일정을 목록으로 표시',icon:'calendar',kind:'schedule-list'},
 {id:'files',category:'basic',name:'파일',description:'자료와 문서 첨부',icon:'file',kind:'file'},
 {id:'photos',category:'basic',name:'사진',description:'이미지 갤러리',icon:'reference',kind:'image'},
 {id:'materials',category:'basic',name:'자료 모음',description:'자료를 그룹으로 정리',icon:'folder',kind:'materials'},
 {id:'accounting',category:'basic',name:'회계',description:'수입·지출과 잔액 기록',icon:'table',kind:'accounting'},
 {id:'divider',category:'basic',name:'구분선',description:'내용 구역 나누기',icon:'list',kind:'divider'},
 {id:'class-roster',category:'school',name:'출석부',description:'학생별 출결과 메모 기록',icon:'users',kind:'tracker',fields:['이름','출결','메모'],states:['출석','지각','결석']},
 {id:'assignments',category:'school',name:'과제 현황',description:'과제별 제출 상태 관리',icon:'tasks',kind:'tracker',fields:['과제','상태','메모'],states:['미제출','제출','확인']},
 {id:'class-plan',category:'school',name:'수업 계획',description:'수업 내용과 준비물 작성',icon:'calendar',kind:'text',initialText:'수업 목표\n\n진행 순서\n\n준비물\n'},
 {id:'school-calendar',category:'school',name:'학사 일정',description:'수업 및 학사 일정 목록',icon:'calendar',kind:'schedule-list'},
 {id:'requests',category:'work',name:'업무 요청',description:'요청과 처리 상태 관리',icon:'tasks',kind:'tracker',fields:['요청','상태','담당자'],states:['대기','진행 중','완료']},
 {id:'meeting',category:'work',name:'회의록',description:'안건·결정·후속 조치',icon:'file',kind:'text',initialText:'안건\n\n결정 사항\n\n후속 조치\n'},
 {id:'budget',category:'work',name:'예산·정산',description:'수입과 지출, 잔액 계산',icon:'table',kind:'accounting'},
 {id:'work-timeline',category:'work',name:'업무 일정',description:'프로젝트 일정 목록',icon:'calendar',kind:'schedule-list'},
 {id:'volunteers',category:'church',name:'봉사 배정',description:'봉사자와 배정 상태 관리',icon:'heart',kind:'tracker',fields:['봉사자','상태','사역'],states:['대기','배정','완료']},
 {id:'service-plan',category:'church',name:'예배 순서',description:'예배 진행 순서 체크',icon:'church',kind:'checklist'},
 {id:'prayer',category:'church',name:'기도 제목',description:'기도 제목과 응답 기록',icon:'prayer',kind:'tracker',fields:['제목','상태','메모'],states:['기도 중','응답','완료']},
 {id:'offering',category:'church',name:'헌금 회계',description:'수입·지출 내역과 잔액',icon:'chalice',kind:'accounting'},
 {id:'bookmark',category:'media',name:'북마크',description:'웹 링크를 카드로 보관',icon:'link',kind:'link',requiresUrl:true},
 {id:'embed',category:'media',name:'웹 임베드',description:'Figma·YouTube·Vimeo 화면 표시',icon:'video',kind:'embed',requiresUrl:true},
 {id:'figma',category:'media',name:'Figma 임베드',description:'디자인 파일을 화면에 표시',icon:'reference',kind:'embed',requiresUrl:true},
 {id:'media-library',category:'media',name:'미디어 자료실',description:'사진·영상·파일을 그룹별 보관',icon:'folder',kind:'materials'},
 {id:'video',category:'media',name:'영상',description:'영상 파일과 YouTube',icon:'video',kind:'video'},
];

export const tabTemplates = [
 {id:'blank',category:'basic',name:'빈 탭',description:'직접 모듈을 채우는 새 화면',icon:'plus',modules:[]},
 {id:'classroom',category:'school',name:'수업 관리',description:'수업 계획·출석부·과제 현황',icon:'bible',modules:['class-plan','class-roster','assignments']},
 {id:'school-events',category:'school',name:'학사 운영',description:'학사 일정·준비 체크리스트',icon:'calendar',modules:['school-calendar','checklist']},
 {id:'work-board',category:'work',name:'업무 운영',description:'업무 요청·회의록·일정',icon:'tasks',modules:['requests','meeting','work-timeline']},
 {id:'work-finance',category:'work',name:'예산 관리',description:'예산·정산과 참고 메모',icon:'table',modules:['budget','note']},
 {id:'service',category:'church',name:'예배 준비',description:'예배 순서·봉사 배정·기도 제목',icon:'church',modules:['service-plan','volunteers','prayer']},
 {id:'ministry-finance',category:'church',name:'사역 회계',description:'헌금 회계와 참고 자료',icon:'chalice',modules:['offering','media-library']},
 {id:'creative',category:'media',name:'콘텐츠 제작',description:'미디어 자료실·사진·영상',icon:'camera',modules:['media-library','photos','video']},
];

export function createHubModule(id, options={}) {
 const template=moduleTemplates.find(item=>item.id===id);
 if(!template)throw Error('알 수 없는 모듈 템플릿');
 return {id:crypto.randomUUID(),kind:template.kind,title:template.name,span:6,
  ...(template.initialText?{text:template.initialText}:{}),
  ...(template.fields?{fields:[...template.fields],states:[...template.states],rows:[]}:{}),
  ...(template.kind==='checklist'?{items:[]}:{}),
  ...options};
}

export function createHubTab(id) {
 const template=tabTemplates.find(item=>item.id===id);
 if(!template)throw Error('알 수 없는 탭 템플릿');
 return {id:crypto.randomUUID(),name:template.name,tags:[],modules:template.modules.map(moduleId=>createHubModule(moduleId))};
}
