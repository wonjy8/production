# Production Note

프로젝트·업무 그룹·할 일·일정·타임테이블·자료·멤버·장비를 관리하는 웹 앱입니다.

개인정보와 서버 주소는 소스에 넣지 않고 NAS 설정 및 브라우저 연결 설정으로 관리합니다.

## 워크스페이스 개념

앱의 최상위 워크스페이스는 **홈·자료·데이터베이스** 세 가지입니다.

| 워크스페이스 | 포함하는 내용 |
|---|---|
| 홈 | 프로젝트 목록과 각 프로젝트의 내용 |
| 자료 | 레퍼런스 · 소스 · 포트폴리오 |
| 데이터베이스 | 멤버·장비 · 대여처 · 장소 |

프로젝트를 열어도 홈 워크스페이스에 속하며, 자료 문서는 해당 분류 아래에 속합니다. 탐색 경로는 `홈 / 프로젝트 이름`, `자료 / 소스 / 자료 이름`, `데이터베이스 / 장소`처럼 표시합니다. 갤러리는 자료의 보기 기능이며 별도 분류나 워크스페이스가 아닙니다. 설정과 HUB는 공통 도구입니다.

## 구조

- `production/`: React 프로젝트 화면, 모듈, 레퍼런스 편집기
- `ui/`: 앱 탐색, 설정, 공용 데이터베이스, 스타일
- `worker/`: 웹 앱과 API 게이트웨이를 제공하는 Cloudflare Workers 코드
- `nas/`: NAS에서 실행하는 인증·권한·데이터·파일 서버
- `scripts/`: 빌드와 기능 검증
- `SOURCE.json`: 가져온 사이트 소스의 커밋 정보

## GitHub에서 실행하기

GitHub Pages에서 화면을 실행하고 기존 NAS에 데이터를 저장할 수 있습니다. 최초 NAS 업데이트와 GitHub 설정은 [PAGES.md](PAGES.md)를 따라 진행하세요. `main`에 push하면 `.github/workflows/pages.yml`이 자동 배포합니다.

## 빌드

Node.js와 npm이 필요합니다. 빌드 스크립트는 Bash를 사용하므로 macOS, Linux 또는 Windows의 WSL에서 실행하세요.

```sh
npm ci
npm run build
npm run validate
```

`npm run build`는 React/UI 번들을 재생성하고 `dist/server/`에 Worker 배포 결과를 만듭니다. 번들 파일을 직접 수정하지 말고 `production/`, `ui/`, `worker/index.js`를 수정하세요.

개별 기능 검사는 다음과 같이 실행할 수 있습니다.

```sh
node scripts/test-production.mjs
node scripts/test-auth-gateway.mjs
node scripts/test-timetable.mjs
node scripts/test-schedule-list.mjs
```

## 실행과 데이터 저장

기존 Worker 배포는 `dist/server/index.js`를 Cloudflare Workers 호환 실행 환경에 배포합니다. 새 GitHub Pages 배포는 `npm run build:pages`로 만든 `dist/pages/`를 사용하며, 로그인과 API는 NAS의 `/browser/api/`에서 처리합니다. `.openai/hosting.json`은 기존 ChatGPT Sites의 배포 정보를 보존합니다.

현재 데이터와 파일은 NAS 서버에 저장됩니다. 소스를 이 저장소에 올리는 것만으로 사이트의 호스팅이나 NAS 데이터 위치가 바뀌지는 않습니다.

NAS 구성과 인증 서버 실행 방법은 [nas/README.md](nas/README.md)를 참고하세요. NAS의 실제 `.env`, 데이터베이스, 업로드 파일은 이 저장소에 포함되어 있지 않습니다. 새 환경에 배포할 때는 기존 Worker의 환경 변수를 해당 환경에 별도로 설정해야 합니다.

## 다른 사람의 NAS에 설치

[새 NAS Docker 설치 안내](nas/INSTALL.md)를 따르세요. `python3 scripts/package-nas.py`로 공유할 `dist/production-nas-install.zip`과 기존 서버용 `dist/production-nas-update.zip`을 만듭니다. ZIP에는 소스·설치 스크립트·README만 포함하며 실제 설정·DB·사용자 파일은 포함하지 않습니다. Pages 빌드에도 두 ZIP이 포함됩니다. 배포 후 `/production/production-nas-install.zip`에서 다운로드할 수 있습니다.

## 독립 문서 편집기

WordCraft/WASM 다운로드 없이 문서를 편집합니다. 문서 편집기는 문서를 열 때, 파일 생성 도구와 PDF 도구는 해당 기능을 사용할 때 불러옵니다. 표·글자 서식·쪽 여백·주석·이미지·자동저장과 DOCX 내보내기를 지원합니다. 복잡한 Word 필드 등 지원하지 않는 요소는 원본 XML을 보존하며 읽기 전용으로 표시합니다. Word의 모든 고급 기능을 편집할 수 있다는 의미는 아닙니다.

PDF 내보내기는 브라우저 인쇄를 사용하지 않습니다. 현재 문서 영역의 실제 폭·글꼴·줄바꿈을 캡처하여 손실 없는 RGB 이미지로 PDF에 넣습니다. 연속된 편집 화면과 동일하게 하나의 긴 페이지로 저장하며, PDF 텍스트 검색·선택은 지원하지 않습니다. 모바일에서 줄바꿈이 달라지면 PDF도 모바일에서 보이는 배치를 따릅니다. 매우 긴 문서는 캔버스 한도에 맞춰 해상도를 줄이고, 메모리 한도를 넘으면 분할 안내를 표시합니다.

## 공용 UI 소스 수정

`ui/page.html`의 `{{source:ui/파일.js}}` 부분은 해당 UI 소스에서 빌드 시 삽입합니다. 서버 로직은 `worker/server.template.js`에서 수정합니다. `npm run build`가 `worker/index.js`와 번들을 생성하므로 생성 파일만 직접 수정하지 마세요.
