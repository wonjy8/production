# 주소를 코드에 넣지 않는 GitHub Pages + NAS 실행

GitHub Pages는 공통 화면 코드만 배포합니다. URL에 NAS 주소가 있으면 계정·권한·데이터·파일을 해당 NAS에서 사용하고, 기본 URL에서는 브라우저에 저장합니다.
이름·이메일·전화번호·실제 NAS 주소를 소스나 빌드 설정에 넣지 않습니다.
NAS 주소 입력 화면은 없습니다. 주소 경로가 저장 방식을 결정합니다.

- `https://YOUR-ACCOUNT.github.io/production/`: 로그인 없이 브라우저 저장 모드
- `https://YOUR-ACCOUNT.github.io/production/nas.example.com`: `https://nas.example.com` NAS에 자동 연결 후 로그인
- `https://YOUR-ACCOUNT.github.io/production/nas.example.com:8788`: HTTPS NAS의 별도 포트

NAS에는 경로·아이디·비밀번호 없이 도메인과 선택적 포트만 붙입니다. 전체 HTTPS 주소를 URL 인코딩해 붙이는 방식도 지원합니다. 각 탭의 URL로 연결을 판단하므로 NAS 탭과 기본 웹 탭을 동시에 사용해도 서로 영향을 주지 않습니다. 기본 URL은 이전 NAS 연결 기록을 사용하지 않습니다. NAS 모드와 브라우저 모드의 데이터는 자동 이동하거나 합치지 않습니다.

GitHub Pages의 첫 NAS 경로 접속은 `404.html`에서 앱을 부팅합니다. 정적 자산·서비스 워커·Wordcraft는 항상 `/production/` 아래의 공통 파일을 사용합니다.

## 화면 URL과 NAS 별칭

화면 주소는 `#/home`, `#/materials/sources`, `#/database/members`, `#/settings/general`처럼 표시됩니다. 프로젝트·업무그룹·자료 주소는 이름과 짧은 식별자를 함께 사용합니다. 이름이 바뀌어도 식별자로 같은 화면을 찾고, 기존 쿼리 형식 주소도 지원합니다.

NAS에 접속한 뒤 **설정 → 연결 → NAS 주소 별칭**에서 `studio` 같은 별칭을 지정하면 `/production/@studio#/home`으로 표시됩니다. 별칭은 해당 브라우저의 IndexedDB에 저장됩니다. 다른 기기·브라우저나 사이트 데이터를 지운 환경에서는 원래 NAS 주소로 접속해 별칭을 다시 지정하세요. 기본 `/production/`은 계속 브라우저 저장 모드입니다.

별칭은 주소창 표시만 바꿉니다. 실제 NAS 도메인은 네트워크 요청과 개발자 도구에서 보이며, 서버 주소 자체를 감추려면 별도 도메인과 프록시가 필요합니다. 별칭에 인증 정보나 토큰을 넣지 마세요.

## NAS 업데이트

1. 기존 NAS 프로젝트의 `data/` 전체(DB와 `account.key` 포함), `.env`를 백업합니다.
2. 이 저장소의 `nas/` 코드를 기존 NAS 프로젝트 폴더에 덮어씁니다. **기존 `.env`와 `data/`는 유지합니다.**
   `python3 scripts/package-nas.py`로 코드만 담은 `dist/production-nas-update.zip`을 만들 수도 있습니다.
3. NAS의 기존 `.env`에 `PAGES_ORIGINS`를 설정합니다.

   ```dotenv
   PAGES_ORIGINS=https://YOUR-ACCOUNT.github.io
   ```

   `YOUR-ACCOUNT`를 실제 GitHub 계정으로 바꾸세요. `/production/` 경로나 끝의 `/`는 넣지 않습니다.
   기존 `NAS_API_TOKEN`, `NAS_UID`, `NAS_GID`는 유지합니다.
4. Container Manager에서 이미지를 다시 빌드하고 컨테이너를 재생성합니다.
   기존 NAS 프로젝트 폴더에서 `sh update.sh`를 실행하면 DB 백업 후 재빌드합니다.
5. 앱용 HTTPS 역방향 프록시는 `127.0.0.1:8788`로 연결합니다. `/browser/api/`도 전달되어야 합니다.
   유효한 HTTPS 인증서를 사용하고 `Origin`, `Cookie`, `Set-Cookie` 헤더를 보존합니다.
   프록시에 `Access-Control-Allow-Origin: *`를 추가하지 않습니다.

기존 계정에는 `ADMIN_EMAIL`이나 `ADMIN_NAME`을 새로 설정할 필요가 없습니다.
기존 이메일·비밀번호·멤버 정보는 DB에서 읽으며, 이 업데이트는 개인정보를 삭제하거나 변경하지 않습니다.
**새 NAS에서 첫 계정을 만드는 경우에만** NAS의 비공개 `.env`에 `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_SETUP_CODE`를 설정합니다.
기존 멤버와 연결하려면 `ADMIN_MEMBER_ID`를 지정하거나 정확히 같은 이메일의 멤버를 사용합니다.
이름으로 자동 연결하거나 전화번호를 덮어쓰지 않습니다.

## GitHub 설정

1. 저장소 **Settings → Pages → Source → GitHub Actions**를 선택합니다.
2. **Actions → Deploy Production to GitHub Pages → Run workflow**를 실행합니다.
3. 성공하면 Pages 설정에 표시된 사이트에 접속합니다.
4. 웹 저장만 사용하려면 `/production/`을 엽니다. NAS를 사용하려면 `/production/NAS도메인`을 열고 기존 계정으로 로그인합니다.

NAS 주소나 토큰을 GitHub Variables/Secrets에 등록할 필요가 없습니다.
예전에 추가한 `PAGES_NAS_URL` 변수는 더 이상 사용하지 않으므로 삭제해도 됩니다.
`pages.config.json`에는 Pages 경로만 있습니다. 저장소 이름이나 커스텀 도메인을 바꾸면 이 경로와 workflow의 `PAGES_BASE_PATH`, NAS의 `PAGES_ORIGINS`를 함께 조정합니다.

`main`에 push하면 화면을 자동 빌드·배포합니다. NAS 코드 수정은 NAS의 별도 재빌드가 필요합니다.
기존 Worker 배포도 사용할 수 있으며 기존 `/api/`는 서버용 NAS 토큰을 계속 요구합니다.

## 공개 범위와 주소를 숨기는 한계

- **현재 소스와 배포 파일:** 실제 사용자 개인정보와 NAS 주소를 포함하지 않습니다. 테스트의 이름·이메일·번호는 예시 데이터입니다.
- **사용자의 브라우저:** URL의 NAS 주소와 NAS로 보내는 요청은 본인이 주소 표시줄과 개발자 도구에서 볼 수 있습니다. 서버용 NAS 토큰은 브라우저로 보내지 않습니다.
- **과거 Git 기록:** 최신 파일에서 지워도 이전 커밋·작성자 정보는 남습니다. 저장소를 바로 공개 전환하지 마세요. 정리된 소스를 `.git` 없이 새 저장소에 올리거나, 별도 검토 후 원격 Git 기록을 정리해야 합니다.
- **비공개 저장소 유지:** 지원 요금제의 비공개 Pages를 사용하거나, 정리된 화면 배포 결과만 별도 공개 저장소에 배포할 수 있습니다. 공개 Pages의 JavaScript 코드는 방문자가 읽을 수 있습니다.

앱 사용자에게도 **NAS 원래 호스트를 숨겨야 한다면 중계 서버가 필요합니다.**
브라우저는 별도의 중계 도메인으로 요청하고, 중계 서버가 비공개 설정에 저장한 NAS 주소로 전달하도록 구성합니다.
이때 GitHub Pages만으로는 충분하지 않습니다. 중계 서버의 CORS·세션 쿠키·출처 검사와 NAS 접근 제한도 함께 설정해야 합니다.
단순히 GitHub Secret에 주소를 넣어 빌드하거나 도메인 별칭을 만드는 것은 브라우저에서 주소를 숨기는 방법이 아닙니다.
이번 구현은 별도 호스팅 계정 없이 **코드와 배포 파일에서 주소를 제거**하는 방식입니다.

최신 브라우저에서 서비스 워커와 분할 쿠키(CHIPS)를 사용합니다.
교차 사이트 쿠키를 전부 차단하는 정책에서는 로그인이 유지되지 않을 수 있습니다.
이 경우 브라우저 정책을 확인하거나 Pages와 NAS를 같은 소유 도메인의 서로 다른 하위 도메인으로 구성하세요.
API 응답과 개인 파일은 서비스 워커 캐시에 저장하지 않습니다.

## 개발 및 검사

```bash
npm ci
npm run build
npm run validate
npm run build:pages
python3 -m venv .venv
.venv/bin/pip install -r nas/requirements.txt
.venv/bin/python -m unittest discover -s nas -p 'test_*.py' -q
```

브라우저 통합 검사는 임시 DB와 두 개의 로컬 HTTPS 서버를 사용합니다.
URL 자동 연결·탭별 저장 모드·로그인·데이터·이미지 업로드/캔버스·새로고침·로그아웃을 검증하며 운영 NAS에 접근하지 않습니다.
포트 9443/9444가 비어 있어야 합니다.

```bash
.venv/bin/pip install playwright
.venv/bin/playwright install chromium
.venv/bin/python scripts/test-pages-browser.py
```

`CHROMIUM_PATH`로 기존 Chromium, `NAS_PYTHON`으로 NAS 의존성이 설치된 Python 경로를 지정할 수 있습니다.
테스트는 생성한 로컬 인증서의 공개키만 신뢰합니다. 운영 HTTPS 검증을 해제하지 않습니다.

## 화면 변경 자동 반영

변경사항이 `main`에 push되면 GitHub Actions가 빌드·검사 후 Pages에 배포합니다. 로컬 편집만으로 배포된 사이트가 바뀌지는 않습니다. 배포 완료 후 앱은 열릴 때와 30초마다, 창으로 돌아올 때 새 빌드 버전을 확인합니다. 새 버전이 있으면 입력·대화상자 편집 및 저장 작업이 끝난 뒤 자동으로 다시 불러옵니다. 저장 실패 중에는 갱신을 미루며 NAS 데이터와 브라우저 저장 데이터를 삭제하지 않습니다. 로더·번들·서비스 워커 보조 스크립트는 버전별 주소를 사용해 이전 코드의 캐시 재사용을 방지합니다. 자동 업데이트 기능이 없는 이전 버전을 이미 열어 둔 창은 최초 한 번 새로고침해야 합니다.
