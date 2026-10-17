# 모듈 구현 규칙 — 0.1.12

모든 모듈 화면은 React·TypeScript(`.tsx`), 모듈의 순수 동작은 이 폴더의 TypeScript(`.ts`)로 구현한다. `types.ts`가 모듈 상태·파일·수정 함수·컴포넌트·자료 이동의 공통 계약이다. UI 크기·색·여백·Squircle 규칙은 `ui/design-system`에서 가져온다.

- 카탈로그·생성: `module-hub.ts`, 기존 파일과 공유 원본: `shared-modules.ts`.
- 배치·열·리사이즈: `column-layout.ts`, `snap-layout.ts`, `module-resize.ts`, `fluid-layout.ts`.
- 자료 이동·메뉴·사진: `media-transfer.ts`, `module-item-menu.ts`, `photo-model.ts`, `justified-gallery.ts`.
- 일정: `timetable-model.ts`, `time-grid-model.ts`, `schedule-list-model.ts`.
- 저장·이동·복원: `module-transfer.ts`, `module-upload.ts`, `module-undo.ts`, `imported-modules.ts`, `retired-modules.ts`.

`production/*.js`의 같은 이름 파일은 과거 import와 검증 도구를 위한 재내보내기만 한다. 새 구현은 `.ts` 원본에만 작성하고, 런타임 파일이나 사용자 데이터의 ID·연결 형식을 언어 변경 때문에 바꾸지 않는다. 서버의 Python과 배포 스크립트는 모듈 구현 언어의 범위에 포함하지 않는다.
