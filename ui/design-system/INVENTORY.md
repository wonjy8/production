# UI 현황과 공통 연결

| 현재 요소 | 기존 구현 위치 | 공통 정의·코드 | 적용 범위 |
|---|---|---|---|
| 일반 화면의 버튼·아이콘 버튼 | ui/controls.css, ui/decorate.js | buttons.css, Icon.tsx, icon-pack.js | 모든 버튼 코너·상태 전환·포커스에 적용. 기존 화면별 크기 유지. |
| React 버튼 | production/Icon.tsx 및 화면별 JSX | Components.tsx, Icon.tsx | Icon 경로는 호환 export. Modal 닫기는 공통 Button 사용. 다른 기존 JSX는 공통 CSS 적용. |
| 사이드바·워크스페이스 | ui/navigation.js, ui/workspace-nav.js, ui/sidebar-order.js | navigation.css, tokens.css | 기존 .sidebar-ref-link의 높이·선택 규칙과 토큰 공유. 라우팅·순서 로직 유지. |
| 탭·필터 | production/ModuleTab.tsx, ui/reference-filters.js | navigation.css | 신규 .ui-tabs/.ui-tab 제공. 기존 탭별 동작과 레이아웃 유지. |
| 모달 창 | production/Modal.tsx | Components.tsx, surfaces.css, Icons.tsx | 공통 dialog와 닫기 버튼 연결. 다른 특수 창은 기본 경계·반경 공유. |
| 화면 제목 | .workspace-page-heading, .section-heading | typography.css, PageHeading | 기존 공통 화면 제목 클래스에 즉시 적용. 문서 내 제목은 제외. |
| 자료·프로젝트·개요·설정 화면 | ui/theme.css, production/merged.css | tokens.css, typography.css, surfaces.css | 공통 스타일은 일반 문서·Shadow DOM에 같은 빌드 입력으로 포함. 도메인 배치는 유지. |
| 문서 편집기 | production/document-editor.css | 공통 CSS + 기존 본문 서식 | 편집 도구 버튼은 공유. 본문 글꼴/인쇄 치수/사용자 서식은 별도. |
| 모션 | ui/motion.css 및 각 기능 CSS | tokens.css, motion.css | 기존 공통 모션 변수 연결 및 reduced-motion 적용. 신규 상태 클래스 제공. |
| 드래그 | ui/touch-drag.js, ui/tab-drag.js, production/calendar-drag.js | motion.css | 입력·유효성·데이터 이동 유지. 새 UI는 공통 피드백 클래스 사용. 기능별 기존 드롭 표시는 후속 이관 대상. |
| 앱 아이콘 | ui/icons.js, production/Icon.tsx, Lucide 혼용 | icon-pack.js, Icon.tsx, Icons.tsx | 기존 직접 Lucide import 5곳을 공통 팩으로 전환. 문자열/React 동일 SVG 도형 사용. |
| 프로젝트 아이콘 | ui/project-icon-paths.js, production/project-icons.js | project-icon-paths.js | 기존 경로는 호환 export로 유지. 실제 도형은 이 폴더에 보관. |

## 유지보수 경계

이 변경은 공통 UI 언어의 실행 가능한 기준과 기존 공통 선택자 연결을 만든다. 화면별 CSS 전체를 제거하거나 모든 화면을 신규 React 컴포넌트로 다시 작성하지 않는다. 개별 캘린더 이벤트·캔버스 핸들·사진 조작 요소의 크기를 일반 버튼 높이로 덮어쓰지 않는다. 기존 탭의 ARIA 키보드 모델과 모든 드래그 피드백의 전면 이관은 별도 작업이다.

Squircle는 CSS corner-shape 지원 브라우저에서 적용되고 미지원 브라우저에서는 둥근 모서리로 폴백한다. 포커스 링과 팝오버를 잘라내는 마스크는 사용하지 않는다.
