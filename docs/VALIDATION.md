# 최신 검증 결과 — 0.1.12

## 모듈 언어와 빌드

- 모듈 UI는 React TypeScript(`.tsx`), 공통 동작 25개는 `production/modules/*.ts`로 통일했다. 같은 이름의 이전 `.js` 파일은 재내보내기만 하며 저장 ID·원본 ID·호환 import를 유지한다.
- `npm run typecheck:modules` 통과: 호환 파일에 구현이 섞이지 않았는지 검사하고 25개 TypeScript 구현 및 공통 계약을 검사한다. 기존 동적 JSON 구조 때문에 이 범위의 `strict`는 false이며, 앱 전체 `.tsx`의 엄격 타입 검사 완료를 뜻하지 않는다.
- `npm run build`, `npm run validate`, `npm run build:pages`, `docs:clean/check`, `git diff --check` 통과. CI에도 모듈 언어/타입 검사와 신규 workflow 모델 검사를 추가했다.
- 현행 JavaScript 모델/통합 검사 **38개 통과**: production, auth-gateway, grade-calculator, figma-connection, pages-route, document-library, planning, resource-schema, completion-summary, completion-policy, sharing, module-placement, module-transfer, task-status, icons, module-tabs, photo-editor, unified-projects, history, title-editor, module-hub, imported-modules, module-undo, module-resize, module-height, columns, recurrence, project-identity, task-composer, production-calendar, admin-home, schedule-time, project-overview, schedule-list, timetable, module-language, doc-cleanup, workflow-models.
- 예전 `test-admin-home-ui.mjs`는 이미 사라진 홈 구조를 기대하는 구형 검사로 이번 현행 38개 범위에 포함하지 않았다. 이전 실패를 전체 검사 통과로 합산하지 않는다.

## 일정·행사·템플릿·자료

- `test-workflow-browser.py` **로컬/NAS 통과**. 실제 임시 HTTPS 앱/서버에서 아래 항목을 검증했다.
  - 일정 추가 버튼, 링크/파일/사진 첨부 3개, 개별 숫자 속성과 속성 템플릿 저장, 새로고침 후 보존.
  - 소속 전체 선택/해제와 할일 표시, 보기를 해제해도 다른 그룹의 원본이 보존됨.
  - 하단 높이 드래그, 오늘, 토/일·한글날·개천절 대체공휴일 표시.
  - 일정→행사 그룹 전환 시 첨부·속성 보존, 개요에서 다른 그룹을 지정해 일정 추가, 프로젝트 색, 행사 그룹 생성과 기간.
  - 업무그룹 템플릿 저장/생성과 새로운 ID, 담당자 초기화.
  - 프로젝트 멤버 Shift 범위 선택, 팀 전체 선택과 추가.
  - 문서 일반/임베드 전환과 로컬 본문 미리보기, 사진 프레임 높이 증가 시 그리드 확대, 사진→파일 실제 마우스 드래그와 원본 ID 유지.
  - 링크 이름 변경과 sandbox/no-referrer 임베드, 모바일 본문 가로 넘침 방지, 사이드바 수평 스크롤 차단, 뒤로가기 왼쪽 정렬, 자료 표의 관리 버튼이 속성 영역을 침범하지 않음.
- `test-workflow-models.mjs`: 한국 음력/대체/선거 공휴일, 소유자 이동, 행사 전환과 일정 목록 키 갱신, 첨부/속성 보존, 원본/일정 연결을 비운 그룹 템플릿, 호환 자료의 원자적 이동과 거절, 다양한 높이의 사진 맞춤 검사.
- `test-document-embed-browser.py` 통과: 로컬 DOCX, 이스케이프된 텍스트, 빈 문서 표시, HTML 스크립트/외부 이미지·프레임 요청 미실행을 확인했다. 문서 임베드는 PDF 및 DOCX/텍스트의 안전한 본문 미리보기다. DOCX 원본 서식 전체나 HWP/구형 Office의 렌더링 검증은 아니다. 외부 사이트가 프레임을 차단하면 원래 링크로 열 수 있다.

## 권한·개인정보

- NAS unittest **55개 통과**. 새 검사 3개는 일정 설정/속성 템플릿의 일정 권한, 원본 탭 권한에 따른 업무그룹 템플릿 숨김 및 저장 시 숨겨진 원본 보존, 실제 행사 대표 일정에 한정된 제목 동기화를 확인한다. 일반 프로젝트에 행사 표식을 붙여 제목 권한을 우회하는 요청은 거절한다.
- 일정 첨부는 기존 보관함·파일 권한 체계를 사용한다. 그룹별 보기 선택은 원본을 삭제하거나 복제하지 않는다. 완료 원본은 기존 잠금을 따르며 서버가 최종 권한을 검사한다.
- PDF/DOCX/텍스트는 브라우저에서 읽으며 외부 변환 서비스로 보내지 않는다. 일반 외부 링크 임베드는 사용자가 선택했을 때만 열며 sandbox와 no-referrer를 사용한다.
- 기존 공유 화면은 공용 HTML만 NAS가 받아 동일 출처에서 제공한다. 공유 토큰·계정·자료를 UI 호스트로 보내지 않는 기존 경계를 유지한다.

## 회귀와 적용 범위

- `test-scheduling-browser.py` 로컬/NAS 통과: 아이콘·색·이모지·업로드, 완료 보드/목록, 반복 할일과 일정의 이번/이후/전체 수정·삭제·재접속. 새 소속 표시와 하단 높이 핸들에 맞춰 검사를 갱신하고 날짜를 고정했다.
- `test-module-language-browser.py` 로컬/NAS 통과: 시간표 크기·시간/할일 설정·캘린더 제외, 날짜/시간 드래그·색, 제거 모듈 내용 보존, 섹션 제목 직접 편집/크기/드래그와 캘린더 보기.
- `test-sidebar-rail-browser.py` 통과: 제목/사이드바 동기화·고정·모바일·완료 잠금·문서 편집기 비활성화와 원본 유지·설정의 버전.
- `test-time-grid-gestures-browser.py`, `test-touch-drag-browser.py` 통과: 빠른 스와이프 스크롤, 터치/펜 대기 후 종일→1시간 드래그, 정지한 길게 누르기 메뉴, 클릭 중복 방지와 부모 이벤트 전달. 물리 iOS/Pencil 기기 검사는 수행하지 않았다.
- `test-sharing-browser.py` 로컬/NAS 통과: 기존 익명/지정 계정 열람·선택 범위·다운로드 제한·완료/재개 URL·공유 중지·모바일 범위를 유지한다. NAS 0.1.11 기준 ZIP은 `access.py`, `README.md`, `UPDATE.md` 세 파일만 포함하며 `.env`, DB/data, 계정 키를 포함하지 않는다. 새 스키마/환경변수/서버 의존성은 없다.

운영 NAS에 직접 접속한 검사는 아니다. 사용자가 ZIP을 적용하고 재빌드한다. 업무그룹 틀 구현을 전체 프로젝트 제작 템플릿·새 권한 승인 흐름 완료로 간주하지 않는다.
