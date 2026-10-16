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

## 0.1.0 탐색 및 모션

최상위 탐색은 홈·자료·설정이다. 기존 DB의 멤버·장비·대여처·장소는 자료 사이드바의 구분선 아래에 표시하며 기존 데이터·API·권한·편집기를 공유한다. 휴지통은 하단 고정 영역 마지막 항목이다. 레퍼런스·소스·포트폴리오의 분류/태그 하위 탐색은 생성하지 않는다. 모바일 자료 첫 화면에도 동일 항목과 구분선을 제공한다. 화면/탭 전환의 등장 모션은 제거한다.
