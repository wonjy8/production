# 공통 UI 소스

앱 셸은 `page.html`과 그 안의 `{{source:ui/...}}` 파일에서 수정합니다. `npm run build`로 공용 페이지와 React·Worker 번들을 생성합니다. 생성된 `worker/index.js`만 직접 편집하지 않습니다.

공통 스타일·아이콘·컴포넌트는 [design-system/README.md](design-system/README.md)와 [구성 목록](design-system/INVENTORY.md)에 정의합니다. 일반 DOM과 React Shadow DOM은 같은 디자인 자산을 사용합니다.

워크스페이스는 프로덕션·자료이며, DB 분류는 자료에 포함됩니다. 좌측 사이드바는 고정된 일반 패널, 우측 모듈 허브·속성은 플로팅 패널입니다. 페이지 제목은 상단바와 공통 제목 편집기를 사용합니다. 앱 버전은 설정에서 표시합니다.

문서 편집기는 `design-system/features.js`에서 비활성화되어 있습니다. 기존 문서 데이터와 다운로드는 유지합니다. 업데이트 동작과 실행 검사는 [Pages 안내](../PAGES.md), 최신 검증 결과는 [VALIDATION.md](../docs/VALIDATION.md)를 참고하세요.
