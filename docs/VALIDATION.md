# 최신 검증 결과 — 0.1.11

## 공유 화면·개인정보

- NAS의 정적 `share-view.html`과 Docker/ZIP 의존성을 제거했다. `share-view-build.mjs`가 공용 화면을 Pages 배포에 생성하며 NAS가 화면 파일만 받아 기존 NAS 공유 URL에서 제공한다.
- NAS unittest **52개 통과**. 새 검사는 화면 요청에 공유 토큰·인증 헤더·쿠키·참조 URL·개인정보를 보내지 않는지, HTTPS 검증과 리디렉션 차단, 잘못된 MIME/과대 응답 거절, 캐시 갱신·실패 시 공개 HTML만 재사용·최초 실패 503을 확인한다.
- `test-sharing-browser.py` 로컬/NAS 통과. 실제 임시 HTTPS 화면 호스트에서 NAS가 공용 HTML을 받아 기존 링크로 익명/지정 사용자 열람·로그인·다운로드 제한·공유 중지·완료/재개를 검증했다. 임시 인증서만 신뢰하며 HTTPS 검증을 끄지 않았다. 운영 NAS에 접속한 검사는 아니다.

## 아이콘과 앱 회귀

- JavaScript 검사 **37개 통과**: 기존 36개(production, auth-gateway, grade-calculator, figma-connection, pages-route, document-library, planning, resource-schema, completion-summary, completion-policy, sharing, module-placement, module-transfer, task-status, icons, module-tabs, photo-editor, unified-projects, history, title-editor, module-hub, imported-modules, module-undo, module-resize, module-height, columns, recurrence, project-identity, task-composer, production-calendar, admin-home, schedule-time, project-overview, schedule-list, timetable, module-language)와 doc-cleanup.
- 모든 프로젝트 아이콘 선택지에 채움형 SVG 도형이 있는지, 공통 렌더러·워크스페이스 도형·이모지/이미지 경로를 검사했다. 아이콘 시트도 브라우저로 렌더링해 확인했다.
- `test-sidebar-rail-browser.py` 통과: 사이드바 아이콘만 지정색, 텍스트 중립색, 프로덕션 워크스페이스 도형의 선택 전후 동일함, 기존 메뉴·제목 편집·구분선·모바일·v0.1.11 표시 유지.
- `test-scheduling-browser.py` 로컬/NAS 통과: 채움형 제목 아이콘과 색 선택, 이모지 검색·업로드, 기존 반복 일정/할일·보드·캘린더·저장 재접속 동작 유지.

## 캘린더·모듈·모바일

- `test-module-language-browser.py` 로컬/NAS 통과: 종일→시간 드래그 시 1시간, 기존 일정 날짜·시간 이동과 메모 보존, 10개 색 프리셋 선택·저장, 네 크기의 섹션 제목 직접 편집·크기 변경·제목 드래그 이동, 일간/주간/월간 순서와 초기 월간·뷰 전환을 확인했다.
- `test-time-grid-gestures-browser.py` 실제 Chromium 터치/펜 입력 통과: 빠른 스와이프는 스크롤하며 항목을 생성/이동하지 않음, 350ms 대기 뒤 종일 일정 드래그, 움직임 없는 길게 누르기 메뉴, 메뉴를 연 뒤 중복 클릭 방지, 펜 대기 후 이동 한 번만 저장. 원래 터치 DOM을 유지하고 해제된 포인터 캡처를 다시 해제하지 않도록 수정했다.
- `test-touch-drag-browser.py`의 기존 터치 정렬·부모 컨테이너 이벤트 전달도 통과했다. 실제 iOS/Pencil 기기 검사는 수행하지 않았다.
- 위 37개 현행 JS 검사를 통과했다. 별도 구형 `test-admin-home-ui.mjs`는 현재 홈에 없는 `admin-home-heading` 구조를 기대해 실패하며, 해당 검사와 AdminHome 구현은 이전 릴리스와 동일하다.

## 문서와 배포 산출물

- 구버전 업데이트·검증·기획 점검 24개와 중복 디자인 검증 문서를 최신 고정 문서로 정리했다. `RELEASES.md`는 정책과 최신 릴리스만 남긴다. 역할별 최신 안내·미완료 제품 정책·라이선스·Git 태그는 유지한다.
- `test-doc-cleanup.mjs`: 숫자 버전 비교, 최신본 통합과 링크, 릴리스 정책 보존, 반복 실행, 검사 모드, 최신 고정 파일 보존, 같은 버전 충돌/버전 없는 수동 편집/심볼릭 링크 거절, 실행 파일·설치 안내·라이선스 유지.
- 빌드의 자동 정리 및 GitHub 직접 push 문서 정리 workflow를 추가했다. `npm run docs:clean`, `docs:check`, 빌드·산출물·Pages 패키징 및 로컬 Markdown 링크를 확인한다.
- NAS 0.1.10 기준 교체 파일: `public_gateway.py`, `Dockerfile`, `update.sh`, `README.md`, `UPDATE.md`. ZIP에는 설정·data/DB·계정 키를 넣지 않는다. 한 번 재빌드 후에는 공유 화면만 바꾸는 업데이트에 NAS 파일 교체가 필요하지 않다. 과거 기록은 Git 태그에서 확인한다.

이번 변경이 미완료 제작 템플릿·새 권한 승인 흐름의 구현을 뜻하지 않는다. 실제 운영 NAS 파일은 사용자가 ZIP으로 적용하며, 데이터·키·설정은 유지한다.
