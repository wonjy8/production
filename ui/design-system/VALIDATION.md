# 검증 결과

- `npm run build`, `npm run validate`, `npm run build:pages` 통과.
- CI의 JavaScript 검사 12개와 icons, module-tabs, photo-editor 검사 통과(총 15개 스크립트).
- `CHROMIUM_PATH=/usr/bin/chromium .venv/bin/python scripts/test-page-headings-browser.py` 통과: 설정·DB·자료·프로젝트 제목 모두 x=288, y=96, 행 높이 40px, 글자 24px, 하단 여백 20px.
- `.venv/bin/python scripts/test-design-system-browser.py` 통과: 일반 문서/Shadow DOM 스타일 일치, Squircle 계산값, 제목, 드롭 표시, 비활성·키보드 포커스, 모션 줄이기, 모바일 44px 터치 영역.
- 공통 CSS 6개 esbuild 파싱 통과, `git diff --check` 통과.
- `node scripts/test-ui-theme.mjs` 실패: 기존 테스트가 특정 파랑 HEX를 전부 금지하지만 변경 전 HEAD의 ui/theme.css, ui/fixes.css, production/styles.css, production/document-editor.css, production/font-manager.css에도 해당 색이 존재한다. 이번 변경에서 이 파일들은 수정하지 않았다. 테스트 기준과 기존 구현의 불일치로 남겨 두었다.

브라우저 검증에는 Python Playwright와 Chromium이 필요하다. 이 변경은 실제 NAS 서버·데이터·배포를 변경하지 않는다. 모든 화면·입력 조합을 전수 검증한 것은 아니다. 개별 화면의 기존 특수 동작과 후속 이관 범위는 INVENTORY.md 참고.
