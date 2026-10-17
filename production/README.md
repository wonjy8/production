# 제작 화면

React 화면은 앱 안의 Shadow DOM에서 실행합니다. `entry.tsx`가 앱 셸의 `productionBridge`를 통해 기존 저장소를 읽고 쓰며 ID·권한·원본 연결을 유지합니다.

```sh
npm run typecheck:modules
npm run build:production
npm run build
npm run validate
```

`modules/module-hub.ts`는 모듈과 탭 카탈로그의 공통 정의입니다. 모듈 분류는 기본·일정·미디어·나누기이며, 열은 중첩을 포함해 최대 4칸입니다. `modules/column-layout.ts`가 배치·정해진 비율의 너비·내용 보존 병합을 처리합니다. 제거된 모듈의 기존 내용은 `modules/retired-modules.ts`에서 메모·파일로 보존합니다.

`ScheduleGrid.tsx`는 캘린더 주간·일간과 타임테이블의 공통 시간표입니다. `recurrence.js`는 반복 일정·할일과 회차 변경 범위를 담당합니다. 파일 원본은 보관함에 저장하며 프로젝트는 연결합니다. 완료 보존본·공유·권한 정책은 [제품 정책](../docs/PRODUCT-DECISIONS.md)을 따릅니다.

디자인과 아이콘은 [공통 디자인 언어](../ui/design-system/README.md)에서 가져옵니다. 문서 편집기는 현재 비활성화되어 있으며 기존 원본은 유지합니다. 최신 검사와 제한은 [검증 결과](../docs/VALIDATION.md), 실행과 배포는 [루트 README](../README.md)를 참고하세요.

모듈 공통 구현은 [modules/README.md](modules/README.md)의 TypeScript 계약을 사용한다. `.js` 경로는 재내보내기만 한다. 일정 첨부/속성은 `ScheduleDetails.tsx`, 프로젝트 전체 선택 보기는 `ProductionCalendar.tsx`, 행사/업무그룹 템플릿은 `event-groups.js`, 문서 미리보기는 `DocumentEmbed.tsx`를 공유한다.
