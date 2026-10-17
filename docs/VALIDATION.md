# 최신 검증 결과 — 0.1.13

- 전체 일정 월간 화면: 공휴일 라벨이 한 글자씩 세로로 깨지지 않는 폭을 확보하고, 프로젝트 색 배경과 검정 텍스트를 실제 Chromium에서 확인했다.
- 날짜별 + 버튼으로 2026-10-22 일정을 생성하고 프로젝트를 선택한 뒤 해당 날짜에 저장·표시되는 것을 검증했다.
- 홈·모든 일정·모든 할일·프로젝트 아이콘의 x좌표 일치와 두 전체 화면의 사이드바 탐색을 확인했다.
- `test-workflow-browser.py`를 로컬 저장소/NAS 연결 모드에서 실행: 첨부·속성·템플릿·행사 그룹·필터·리사이즈·멤버 선택·미디어 이동·임베드·모바일 넘침 회귀를 함께 검사한다.
- `npm run build`, `npm run validate`, `npm run build:pages`, `npm run typecheck:modules`, `test-admin-home.mjs`, `test-production-calendar.mjs`, `test-workflow-models.mjs`, `docs:clean/check`, `git diff --check` 검증.
- `test-sidebar-rail-browser.py` 통과: 고정 사이드바·제목 동기화·접기/크기조절·모바일·설정 버전 표시 회귀 확인.
- 화면만 변경한다. NAS 0.1.12의 API·권한 정책·데이터 형식을 유지하며 NAS 파일 교체나 컨테이너 재빌드가 필요 없다.

## 범위와 한계

- 운영 NAS 직접 접속 검증은 아니며, 격리된 NAS 서버에 연결해 검사했다. 기존 NAS 권한·공유 경계를 유지한다.
- 공통 모듈 25개는 TypeScript 검사 대상이며 기존 동적 JSON 구조 때문에 strict=false다. 앱 전체의 엄격 타입 검사를 뜻하지 않는다.
- 물리 iOS/Pencil 검사는 수행하지 않았다. 작은 화면에서 월간 캘린더는 내부 가로 스크롤을 사용한다.
- 기존 한국 공휴일 계산은 고정·음력·대체공휴일과 등록된 임시공휴일을 포함한다. 새로 공표되는 임시공휴일은 데이터 갱신이 필요하다.
- 전체 프로젝트 제작 템플릿과 새 권한 승인 흐름 등 남은 범위는 PRODUCT-AUDIT.md를 따른다.
