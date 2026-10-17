# Production Note

프로젝트·업무/행사 그룹·할일·캘린더·자료·멤버·장비를 관리하는 웹 앱입니다. 현재 버전은 [VERSION](VERSION), 최신 변경 내용과 롤백 규칙은 [RELEASES.md](RELEASES.md)에서 확인합니다.

## 실행과 배포

Node.js 24와 npm, Bash를 사용합니다.

```sh
npm ci
npm run typecheck:modules
npm run build
npm run validate
npm run build:pages
```

`main`에 push하면 GitHub Actions가 검사 후 Pages에 자동 배포합니다. Pages 주소의 `/production/`은 브라우저 저장, `/production/NAS도메인`은 해당 NAS 저장소를 사용합니다. 계정·자료·파일은 선택한 저장소에 보관하며 실제 `.env`, DB, 업로드 파일, 계정 키는 저장소에 포함하지 않습니다.

- [GitHub Pages 설정·개발 검사](PAGES.md)
- [NAS 신규 설치](nas/INSTALL.md)
- [NAS 운영·계정 관리](nas/README.md)
- [최신 NAS 업데이트](nas/UPDATE.md)

NAS 코드는 `python3 scripts/package-nas.py`로 설치·업데이트 ZIP을 만듭니다. Pages 빌드에도 포함됩니다. NAS는 파일 교체 후 기존 폴더에서 `sh update.sh`로 재빌드하며 `.env`와 `data/`를 유지합니다.

## 현재 화면

- **프로덕션**: 홈, 프로젝트와 업무 그룹. 경로는 `프로덕션 / 홈`, `프로덕션 / 프로젝트 이름`입니다.
- **자료**: 레퍼런스·소스·포트폴리오·모든 자료·아카이브, 멤버·장비·대여처·장소, 휴지통.
- **모듈**: 메모 / 캘린더·타임테이블·일정 목록·할일 / 사진·영상·파일·링크 / 섹션 제목·구분선·열.
- **설정**: 앱 버전·계정·글꼴 등 공통 설정. 문서 편집기는 현재 비활성화되어 있으며 기존 문서와 원본 다운로드는 유지합니다.

원본은 보관함에 저장하고 프로젝트는 연결합니다. 사용 중인 원본은 삭제할 수 없습니다. 완료 프로젝트는 독립 보존본을 사용하며 읽기 전용입니다. 외부 공유는 NAS에서 선택한 항목만 공개합니다. 공유 화면은 웹 배포로 자동 갱신하고 로그인·자료·권한 검사는 NAS에 유지합니다. 화면 서버에는 공유 토큰·비밀번호·파일을 전달하지 않습니다.

## 소스 구조

| 경로 | 역할 |
| --- | --- |
| `production/` | React 프로젝트 화면과 모듈 |
| `ui/` | 앱 셸·탐색·설정·공용 UI |
| `ui/design-system/` | 공통 디자인 언어와 아이콘 팩 |
| `worker/` | 웹/API 게이트웨이, 생성된 배포 번들 |
| `nas/` | NAS 인증·권한·DB·파일 서버 |
| `scripts/` | 빌드·검증·문서 자동 정리 |

공용 페이지는 `ui/page.html`과 `{{source:ui/...}}` 소스, 서버는 `worker/server.template.js`에서 수정합니다. `worker/index.js`와 번들은 `npm run build`로 생성하므로 생성 파일만 직접 수정하지 않습니다.

## 문서 관리

업데이트 안내는 `nas/UPDATE.md`, 검증은 `docs/VALIDATION.md`, 기획 점검은 `docs/PRODUCT-AUDIT.md`에 최신 내용만 유지합니다. `RELEASES.md`는 정책과 최신 릴리스만 남깁니다. 과거 내용은 Git 커밋과 버전 태그에서 확인할 수 있습니다.

```sh
npm run docs:clean
npm run docs:check
```

빌드할 때 자동 정리합니다. GitHub에 직접 올린 구버전 문서도 자동 정리 workflow가 제거하고 커밋합니다. 실행 코드·데이터·라이선스는 정리 대상이 아닙니다. 설치·개발·디자인처럼 역할이 다른 최신 안내는 각각 유지합니다.

- [최신 검증 결과](docs/VALIDATION.md)
- [제품 정책](docs/PRODUCT-DECISIONS.md), [구현 상태·남은 범위](docs/PRODUCT-AUDIT.md)
- [공통 디자인 언어](ui/design-system/README.md), [구성 목록](ui/design-system/INVENTORY.md)
