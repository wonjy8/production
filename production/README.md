# 제작 기능 통합

Media-Production.zip의 ProjectWorkspace, ProductionTasks, 담당자 선택, 인라인 편집 기능을 현재 앱 안에 통합합니다. 독립 앱이나 별도 iframe은 사용하지 않습니다. 스타일 충돌 방지를 위해 Shadow DOM 내부에서 렌더링합니다.

행사와 제작 프로젝트는 같은 ID와 레코드를 사용합니다. 기존 modules와 알 수 없는 필드를 보존하며 제작 필드만 병합합니다. 자료 파일은 기존 R2 업로드 API를 공유합니다. 자료를 레퍼런스로 저장할 때 파일을 중복 업로드하지 않습니다.

`npm run build:production`으로 React 소스를 worker/production-assets.js로 번들링합니다. 이 생성 파일은 배포 빌드의 입력으로 버전 관리됩니다. `npm run build`와 `npm run validate`로 Worker 산출물을 만듭니다.

첨부 소스에는 사용자의 브라우저 localStorage 및 IndexedDB 데이터가 포함되어 있지 않습니다. 샘플 데이터는 새 앱에 주입하지 않습니다.

## 프로젝트 중심 탐색

사이드바는 홈·레퍼런스·데이터베이스의 고정 순서 버튼, 프로젝트 목록, 하단 설정으로 구성합니다. 기존 productions 레코드는 최상위 프로젝트, productionId로 연결된 projects 레코드는 업무 그룹으로 표시합니다. ID와 서버 권한 범위, 파일·공유 원본 연결을 유지하기 위해 기존 저장 필드는 보존합니다. 새 프로젝트의 기본 내용은 defaultBoard가 지정된 customTabs 레코드로 저장하지만 별도 탭으로 표시하지 않습니다. 자료 불러오기와 레퍼런스의 프로젝트 선택·필터도 같은 최상위 목록을 사용합니다.
