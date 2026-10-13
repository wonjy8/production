# Production Note

프로젝트·업무 그룹·할 일·일정·타임테이블·자료·멤버·장비를 관리하는 웹 앱입니다.

개인정보와 서버 주소는 소스에 넣지 않고 NAS 설정 및 브라우저 연결 설정으로 관리합니다.

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
