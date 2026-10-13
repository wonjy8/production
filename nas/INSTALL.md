# 내 NAS에 Production Note 설치하기

이 패키지는 각 사용자가 자신의 NAS에 계정·프로젝트·자료·파일을 저장하도록 하는 서버입니다. NAS마다 계정과 데이터는 독립적입니다. 다른 사람의 DB나 개인정보는 패키지에 포함되지 않습니다.

설치 후 사용하는 주소:

- `https://wonjy8.github.io/production/`: NAS 없이 현재 브라우저에 저장
- `https://wonjy8.github.io/production/nas.example.com`: 본인의 `https://nas.example.com` NAS에 자동 연결
- `https://wonjy8.github.io/production/nas.example.com:8443`: HTTPS 접속 포트가 8443인 NAS에 연결

`nas.example.com`을 본인의 NAS 도메인으로 바꾸세요. 앱의 URL에는 비밀번호나 서버 토큰을 넣지 않습니다.

## 1. 준비물

- Docker와 Docker Compose V2를 지원하는 NAS 또는 Linux 서버
- Synology는 DSM 7의 Container Manager와 Docker를 지원하는 모델
- NAS 외부에서 연결할 수 있는 도메인/DDNS, 유효한 HTTPS 인증서
- HTTPS 역방향 프록시와 필요한 방화벽·공유기 설정

Synology QuickConnect의 DSM 접속 페이지 주소는 이 API의 HTTPS 주소를 대신하지 않습니다. 공유기가 CGNAT 환경이라 외부 연결이 안 되면 접속 가능한 HTTPS 경로를 먼저 마련해야 합니다. 컨테이너 내부는 HTTP이고, 외부 HTTPS는 NAS의 역방향 프록시가 처리합니다.

## 2. 설치 파일 풀기

`production-nas-install.zip`을 받아 NAS의 새 폴더에 압축을 풉니다. 예: `/volume1/docker/production-note`.
`Dockerfile`, `compose.yaml`, `install.sh`, `configure.py`, `server.py`가 같은 폴더에 있어야 합니다.

기존 설치 폴더나 기존 데이터 폴더를 새 설치에 사용하지 마세요. 기존 서버의 업데이트는 아래의 업데이트 절차를 따릅니다.

## 3. 터미널로 설치하기 — 권장

Synology에서 SSH를 켜고 본인 계정으로 접속합니다. Docker 권한이 필요하면 `sudo`를 사용합니다.

```sh
cd /volume1/docker/production-note
sudo sh install.sh \
  --origin https://wonjy8.github.io \
  --admin-email owner@example.com \
  --admin-name '내 이름'
```

Linux 서버는 압축을 푼 폴더에서 같은 명령을 실행하면 됩니다.
`--admin-email`과 `--admin-name`은 본인 값으로 변경합니다. 이메일은 로그인 ID이며 인증 메일을 보내지는 않습니다.
다른 도메인에서 앱을 호스팅한다면 `--origin`에 그 앱의 HTTPS 원본 주소를 넣습니다. `/production/` 경로나 끝의 `/`는 넣지 않습니다.

스크립트가 다음을 수행합니다.

1. 임의의 `NAS_API_TOKEN`과 일회용 `ADMIN_SETUP_CODE` 생성
2. 소유자만 읽을 수 있는 `.env` 생성
3. 컨테이너가 쓸 수 있는 `data/` 준비
4. Docker 이미지 빌드 및 서버 시작, 건강 상태 확인

호스트에 Python을 설치할 필요는 없습니다. 설정 생성에도 공식 Python Docker 이미지를 사용합니다.
`sudo` 실행 시 원래 사용자의 UID/GID를 사용하며, 직접 root로 실행하면 비root 값 10001을 기본으로 사용합니다. 특정 소유자로 운영하려면 `--uid 1026 --gid 100`처럼 **본인 NAS의 실제 숫자**를 추가합니다. UID/GID는 환경마다 다르므로 예시 숫자를 그대로 쓰지 마세요.

`.env`가 이미 있거나 `data/`에 파일이 있으면 새 설치는 중단하며 덮어쓰지 않습니다. 빌드·시작 실패 후에는 `.env`를 지우고 다시 설치하지 말고 오류를 해결한 다음 아래 명령으로 재시도합니다.

```sh
docker compose up -d --build --wait --wait-timeout 180
```

## 4. Container Manager에서 직접 설치하기

터미널 설치 대신 수동으로 설정할 수도 있습니다.

1. `.env.example`을 복사하여 `.env`로 저장합니다. File Station에서 숨김 파일 표시를 켭니다.
2. `NAS_UID`와 `NAS_GID`를 `data/` 소유자의 숫자로 설정합니다. SSH에서 `id 사용자명`으로 확인할 수 있습니다.
3. 빈 `data/` 폴더를 만들고, 위 UID/GID 사용자가 쓰기 가능하도록 권한을 설정합니다.
4. `NAS_API_TOKEN`은 비밀번호 관리기 등으로 생성한 임의 문자열 32자 이상을 사용합니다. `replace-`로 시작하는 예시는 실제로 사용할 수 없습니다.
5. `PAGES_ORIGINS=https://wonjy8.github.io`, `ADMIN_EMAIL`, `ADMIN_NAME`을 본인 환경에 맞게 설정합니다.
6. `ADMIN_SETUP_CODE`는 임의의 64자리 16진수(0–9, a–f)로 설정합니다. 앱의 회원가입 → 첫 관리자 설정에서 생성한 코드를 사용해도 됩니다.
7. Container Manager → 프로젝트 → 생성에서 압축을 푼 폴더와 기존 `compose.yaml`을 선택하고 빌드·시작합니다. `.env` 파일을 함께 읽도록 같은 폴더에 둡니다.

토큰과 초기 설정 코드는 공개 저장소, 화면 캡처, URL에 넣지 않습니다. 실제 `.env`는 본인 NAS에만 보관합니다.

## 5. HTTPS 역방향 프록시 연결

컨테이너가 여는 포트는 **NAS의 `127.0.0.1:8788` → 컨테이너 `8787`**입니다. 따라서 인터넷에 8788을 직접 개방할 필요가 없습니다.

Synology: 제어판 → 로그인 포털 → 고급 → 역방향 프록시에서 다음처럼 설정합니다.

| 항목 | 값 |
|---|---|
| 소스 프로토콜 | HTTPS |
| 소스 호스트 | 본인의 NAS 도메인, 예: `nas.example.com` |
| 소스 포트 | 443, 또는 본인이 사용할 HTTPS 포트 |
| 대상 프로토콜 | HTTP |
| 대상 호스트 | `127.0.0.1` |
| 대상 포트 | `8788` |

해당 도메인에 유효한 인증서를 연결합니다. 공유기·NAS 방화벽은 선택한 외부 HTTPS 포트만 허용하고, 공유기에서는 그 포트를 NAS의 HTTPS 프록시 포트로 전달합니다.
Linux는 NAS 호스트의 nginx/Caddy 등에서 동일하게 프록시합니다. **다른 컨테이너**의 프록시라면 그 컨테이너의 `127.0.0.1`은 NAS 호스트가 아닙니다. 이 구성은 NAS 호스트의 프록시를 기준으로 합니다.

`/browser/api/` 경로와 `Origin`, `Cookie`, `Set-Cookie` 헤더를 그대로 전달해야 합니다.
프록시에 `Access-Control-Allow-Origin: *`를 추가하지 마세요. NAS 서버가 `.env`의 `PAGES_ORIGINS`를 기준으로 처리합니다.

## 6. 첫 관리자 계정 만들기

1. `https://wonjy8.github.io/production/본인NAS도메인`으로 접속합니다. 별도 NAS 주소 입력 화면 없이 자동 연결됩니다.
2. 회원가입을 선택합니다.
3. `.env`의 `ADMIN_EMAIL`과 같은 이메일, 원하는 비밀번호, `ADMIN_SETUP_CODE` 값으로 가입합니다.
4. 첫 계정이 해당 NAS의 최고관리자가 됩니다. 비밀번호는 8자 이상이며 숫자와 특수문자를 포함해야 합니다.
5. 가입 후 `.env`에서 `ADMIN_SETUP_CODE` 줄을 지우고 `docker compose up -d`로 재생성해도 됩니다. 기존 계정은 유지됩니다.

다른 사용자는 멤버·장비 화면에서 멤버를 만들고 초대 링크를 발급해 가입시킵니다. NAS마다 별도 계정으로 로그인합니다. 이전 NAS나 브라우저의 데이터가 새 NAS로 자동 복사되지는 않습니다.

## 7. 설치 확인 및 문제 해결

```sh
docker compose ps
docker compose logs --tail 100 database
```

서버가 `healthy`여야 합니다. 앱의 NAS 주소로 접속하여 로그인한 뒤 프로젝트를 생성하고 새로고침해 유지되는지 확인합니다. `PAGES_ORIGINS`가 설정된 앱에서 연결 검사를 수행하며, 주소 표시줄에 `/browser/api/auth/connection`만 직접 입력하면 Origin 헤더가 없어 403이 나올 수 있습니다.

| 증상 | 확인할 항목 |
|---|---|
| 컨테이너가 시작되지 않음 | Docker 빌드 로그, `.env` 필수 값, Python 이미지·패키지 다운로드 가능 여부 |
| `Permission denied` | `data/` 소유자 UID/GID와 `.env`의 값이 일치하는지 |
| NAS 자동 연결 실패 | 도메인, HTTPS 인증서, 외부 포트 전달, `/browser/api/` 역방향 프록시 |
| `Origin not allowed` | `PAGES_ORIGINS`가 실제 앱의 HTTPS 원본 주소인지; `/production/`는 제외 |
| 최초 가입 실패 | `ADMIN_EMAIL`과 가입 이메일 일치 여부, 이름 설정, 64자리 초기 설정 코드 |
| 로그인 유지 실패 | HTTPS와 세션 쿠키 전달, 브라우저의 타사 쿠키 정책 |

`.env`를 수정하면 기존 컨테이너의 단순 재시작 대신 `docker compose up -d`로 컨테이너를 재생성합니다.

## 8. 백업·업데이트·제거

백업 대상은 **`.env`와 `data/` 전체**입니다. DB, 업로드 파일, `account.key`가 있다면 함께 보관합니다. 일관된 파일 백업은 컨테이너를 중지하고 수행하거나 NAS의 스냅샷을 사용합니다.

업데이트: `production-nas-update.zip`의 코드만 기존 폴더에 덮어쓰고 기존 `.env`·`data/`는 유지합니다. 먼저 NAS 스냅샷 등으로 백업한 뒤 다음 명령을 실행합니다.

```sh
sh update.sh
```

정지·제거:

```sh
docker compose down
```

이 명령은 프로젝트의 `data/` 폴더와 `.env`를 지우지 않습니다. 자료를 완전히 제거하려는 경우에는 백업 여부를 확인한 뒤 해당 폴더를 별도로 관리하세요.
