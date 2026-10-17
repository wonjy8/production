# UI 현황과 공통 연결

| 현재 요소 | 기존 구현 위치 | 공통 정의·코드 | 적용 범위 |
|---|---|---|---|
| 일반 화면의 버튼·아이콘 버튼 | ui/controls.css, ui/decorate.js | buttons.css, Icon.tsx, icon-pack.js | 모든 버튼 코너·상태 전환·포커스에 적용. 기존 화면별 크기 유지. |
| React 버튼 | production/Icon.tsx 및 화면별 JSX | Components.tsx, Icon.tsx | Icon 경로는 호환 export. Modal 닫기는 공통 Button 사용. 다른 기존 JSX는 공통 CSS 적용. |
| 사이드바·워크스페이스 | ui/navigation.js, ui/workspace-nav.js, ui/sidebar-order.js | navigation.css, tokens.css | 기존 .sidebar-ref-link의 높이·선택 규칙과 토큰 공유. 라우팅·순서 로직 유지. |
| 탭·필터 | production/ModuleTab.tsx, ui/reference-filters.js | navigation.css | 신규 .ui-tabs/.ui-tab 제공. 기존 탭별 동작과 레이아웃 유지. |
| 모달 창 | production/Modal.tsx | Components.tsx, surfaces.css, Icons.tsx | 공통 dialog와 닫기 버튼 연결. 다른 특수 창은 기본 경계·반경 공유. |
| 화면 제목 | ui/app-page-heading.js, ui/navigation.js, 화면별 .workspace-page-heading | page-heading.js, typography.css | 일반 DOM/Shadow DOM의 주 제목을 상단바로 승격하고 작은 경로를 아래에 둔다. 제목 행의 조작·모달 제목·문서 본문 제목은 유지. |
| 자료·프로젝트·개요·설정 화면 | ui/theme.css, production/merged.css | tokens.css, typography.css, surfaces.css | 공통 스타일은 일반 문서·Shadow DOM에 같은 빌드 입력으로 포함. 도메인 배치는 유지. |
| 문서 편집기 | production/DocumentEditor.tsx, document-editor.css | typography.css, surfaces.css, tokens.css | 앱 상단 제목·저장/속성 조작, 탭 행 툴바, 모듈과 같은 패널 표면, 흰 바탕 눈금자. 본문 서식·용지 좌표·내보내기는 별도. |
| 모션 | ui/motion.css 및 각 기능 CSS | tokens.css, motion.css | 기존 공통 모션 변수 연결 및 reduced-motion 적용. 신규 상태 클래스 제공. |
| 드래그 | ui/touch-drag.js, ui/tab-drag.js, production/calendar-drag.js | motion.css | 입력·유효성·데이터 이동 유지. 새 UI는 공통 피드백 클래스 사용. 기능별 기존 드롭 표시는 후속 이관 대상. |
| 앱 아이콘 | ui/icons.js, production/Icon.tsx, Lucide 혼용 | icon-pack.js, Icon.tsx, Icons.tsx | 기존 직접 Lucide import 5곳을 공통 팩으로 전환. 문자열/React 동일 SVG 도형 사용. |
| 프로젝트 아이콘 | ui/project-icon-paths.js, production/project-icons.js | project-icon-paths.js | 기존 경로는 호환 export로 유지. 실제 도형은 이 폴더에 보관. |

## 유지보수 경계

이 변경은 공통 UI 언어의 실행 가능한 기준과 기존 공통 선택자 연결을 만든다. 화면별 CSS 전체를 제거하거나 모든 화면을 신규 React 컴포넌트로 다시 작성하지 않는다. 개별 캘린더 이벤트·캔버스 핸들·사진 조작 요소의 크기를 일반 버튼 높이로 덮어쓰지 않는다. 기존 탭의 ARIA 키보드 모델과 모든 드래그 피드백의 전면 이관은 별도 작업이다.

Squircle는 버튼을 포함한 모든 둥근 UI 모서리에 적용하며 각 요소의 기존 반경을 유지한다. CSS corner-shape 미지원 브라우저에서는 기존 둥근 모서리로 폴백한다. 포커스 링과 팝오버를 잘라내는 마스크는 사용하지 않는다.

## 탐색 및 모션

최상위 탐색은 프로덕션·자료·설정이다. 기존 DB의 멤버·장비·대여처·장소는 자료 사이드바의 구분선 아래에 표시하며 기존 데이터·API·권한·편집기를 공유한다. 휴지통은 하단 고정 영역 마지막 항목이다. 레퍼런스·소스·포트폴리오의 분류/태그 하위 탐색은 생성하지 않는다. 모바일 자료 첫 화면에도 동일 항목과 구분선을 제공한다. 화면/탭 전환의 등장 모션은 제거한다.

## 열 컨테이너

- 배치 구조: `production/column-layout.js`의 슬롯 소속 관계와 `snap-layout.js` 공통 레이아웃/드롭 진입점을 사용한다. 일반 모듈은 기존 저장 컬렉션과 ID를 유지한다.
- UI 예외: `columns.css`와 `ColumnControls.tsx`가 카드 없는 2·3·4단, 16px 열 간격, 접근 시 구분선/X, 빈 열 추가, 너비 조절을 정의한다. 중첩 포함 동시 최대 4칸이며 X는 콘텐츠를 보존해 왼쪽 열 아래로 합친다.
- 아이콘: 공통 `icon-pack.js`의 `columns-2`, `columns-3`, `columns-4`, `plus`, `close`.

## 프로젝트 색상·반복·일정

- 제목 아이콘/선택기/색상: `ProjectIconPicker.tsx`, `IconPhoto.tsx`, `project-colors.js`, `project-identity.css`. 셸 제목 옆에는 React portal로 같은 선택기를 사용한다.
- 이모지 검색: `emoji-pack.js`, `emoji-ko.json`의 한국어 이름·검색어, 공통 검색 입력. 항목 테두리와 분류 드롭다운, 탭의 개수 표시를 제거했다.
- 반복: `recurrence.js`, `RepeatFields.tsx`; 프로젝트·통합 일정/할일, 빠른 할일 추가, 일정 목록 편집, 홈/프로젝트 현황이 같은 규칙/예외를 사용한다.
- 일정/할일 표현: `scheduling.css`의 프로젝트색 종일 배경·시간 표시·할일 체크, 캘린더 높이, 보드 하단 완료 목록 및 상태 사이 구분선.

## 모듈 언어·시간표·사이드바

- 목록·본문 높이: `module-language.css`, `module-hub.js`, `retired-modules.js`.
- 시간표 공통 UI: `ScheduleGrid.tsx`, `time-grid-model.js`, `time-grid.css`; 캘린더 주간·일간과 타임테이블에서 공유.
- 버튼 문구·호버: `decorate.js`, `buttons.css`; 전체 접근성 이름과 사용자 콘텐츠 제목은 유지.
- 사이드바 메뉴·색·자료 구분선·멤버 툴바: `context-menu.js`, `item-menu.js`, `navigation.css`, `database.js`.

## 채움형 제목 아이콘과 공유 화면

- `project-solid-icons.js`, `Icon.tsx`의 `IdentityIcon`, `icon-pack.js`의 `identityIconSVG`: 동일 채움형 도형을 제목·선택기·프로젝트 카드·사이드바에서 사용한다. 사이드바 글자는 중립색을 유지한다.
- `navigationIconSVG('home')`: 선택 상태와 무관한 같은 프로덕션 도형.
- `scripts/share-view-build.mjs`: 공통 CSS와 `ui/share-view.html/js`로 공용 화면을 Pages에 생성한다. NAS는 `public_gateway.py`에서 화면 파일만 받아 동일 출처로 제공하며 개인정보를 UI 호스트에 전달하지 않는다.

## 일정 확장·자료 이동·공통 구현

- `workflow.css`: 일정 첨부/속성/보기 설정·오늘/리사이즈·공휴일·자료 표·버튼 줄바꿈·사이드바 수평 차단·뒤로가기 정렬.
- `ScheduleDetails.tsx`, `CalendarSettings.tsx`, `CalendarResize.tsx`, `DocumentEmbed.tsx`: 공유 편집·미리보기 UI.
- `production/modules/*.ts`, `types.ts`: 모듈 공통 동작 25개와 상태/파일/수정/컴포넌트 계약. JavaScript 경로는 호환 재내보내기. `npm run typecheck:modules`로 검사한다.
