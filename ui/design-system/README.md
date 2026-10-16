# Production UI 언어

이 폴더가 앱 UI의 공통 정의와 구현을 소유한다. 화면별 파일은 데이터와 배치 등 도메인 역할을 담당하고, 동일한 UI 요소는 이 폴더에서 가져온다. 실제 적용 목록과 남은 정리는 [INVENTORY.md](INVENTORY.md)를 참고한다.

## 파일과 적용 경로

| 파일 | 책임 |
|---|---|
| `tokens.css` | 색, 크기, 두께, 간격, 반경, 모션의 공통 값 |
| `typography.css` | 제목, 본문, 설명, 제목 행의 위치·정렬 |
| `buttons.css` | Squircle 버튼, 변형, 크기, 포커스·비활성 상태 |
| `navigation.css` | 사이드바 항목과 탭의 공통 상태 |
| `surfaces.css` | 화면, 카드, 창, 메뉴, 입력, 구분선 |
| `motion.css` | 모션, 드래그 피드백, 모션 줄이기 |
| `Components.tsx` | React Button, PageHeading, Surface |
| `Icon.tsx` / `Icons.tsx` | 이름 기반 아이콘·아이콘 버튼 / 기존 React 호출용 어댑터 |
| `icon-pack.js` | SVG 도형, 문자열 렌더러, 의미별 아이콘 선택 |
| `project-icon-paths.js` | 프로젝트 선택용 확장 아이콘 도형 |

`scripts/build-production.mjs`가 CSS 파일들을 위 순서대로 읽어 일반 UI, React Shadow DOM, 문서 편집 도구의 스타일에 포함한다. 브라우저에서 별도로 중복 로드하지 않는다. `worker/*-assets.js`는 생성 파일이므로 직접 편집하지 않는다. 공통 스타일은 기존 화면 CSS 뒤에서 적용된다.

## 요소의 언어

| 요소 | 정의 및 사용 |
|---|---|
| 화면 | 하나의 작업 맥락. `.ui-screen`은 데스크톱 24px, 모바일 16px/12px 내부 여백. 기존 화면의 도메인 배치는 유지한다. |
| 화면 제목 | 콘텐츠 영역 맨 위, 왼쪽 시작선에 둔다. 24px / 600 / 1.35, 최소 40px 행, 아래 20px. 뒤로 가기는 제목 앞, 관련 동작은 같은 행 오른쪽. 좁아지면 동작을 다음 줄로 배치한다. `PageHeading` 사용. |
| 섹션 제목 | 18px / 600 / 1.35. 설명과 분리하고 영역 시작에 둔다. `.ui-section-title` 사용. |
| 본문·설명 | 본문 14px / 400 / 1.5. 보조 설명 12px / 400 / 1.5. 제목과 버튼 이외에 굵은 글씨를 남용하지 않는다. |
| 글꼴 | OS 시스템 글꼴 → Segoe UI → Noto Sans KR → sans-serif. 임의 외부 폰트 요청 없음. 사용자가 작성하는 문서의 글꼴·크기·굵기는 이 규칙으로 덮어쓰지 않는다. |
| 기본 버튼 | 40px 높이, 텍스트 14px / 500, 좌우 12px, 아이콘 간격 8px. 기본/주요/조용한/위험의 역할을 사용한다. 터치 환경은 신규 공통 버튼 최소 44px. |
| Squircle | 모든 버튼과 버튼 역할 요소에 `border-radius:12px; corner-shape:squircle`. 둥근 사각형과 다른 연속 곡률 코너를 지원 브라우저에서 사용한다. 미지원 브라우저는 12px 둥근 모서리로 폴백한다. clip-path로 포커스·메뉴를 잘라내지 않는다. |
| 아이콘 버튼 | 기본 40×40px, 아이콘 18px. `aria-label`과 툴팁 필수. 원형 버튼을 새로 만들지 않는다. 닫기와 삭제는 다른 의미와 아이콘을 사용한다. |
| 사이드바 | 맥락 전환과 하위 탐색. 항목 높이 40px, 왼쪽 정렬, 아이콘+이름. 선택은 배경+굵기로 표시하고 `aria-current`를 사용한다. |
| 탭 | 같은 맥락 내 콘텐츠 전환. 가로 배치, 항목 사이 4px, 높이 40px. 선택은 배경·굵기·상태 속성으로 표현한다. 진짜 ARIA tablist를 만들 때 키보드 화살표·Home/End·연결된 tabpanel도 함께 구현한다. 일반 필터 버튼은 aria-pressed 사용. |
| 창 | 공통 `Modal`의 native dialog 사용. 배경을 차단하고 제목은 위 왼쪽, 닫기는 위 오른쪽. 기본 폭 560px, 내부 24px, 모바일 16px. 최대 높이를 넘으면 내부 스크롤. Esc 닫기, 포커스 복귀 유지. 전체 화면 문서 편집기는 별도 레이아웃. |
| 카드·메뉴 | 카드 내부 16px, 모서리 16px, 1px 경계. 메뉴 내부 6px, 모서리 12px, 그림자. 그림자는 뜬 창·메뉴·드래그 복사본에 사용. |
| 입력 | 높이 40px, 내부 8px/12px, 라벨과 8px. 모바일 입력은 16px로 확대 방지. 오류는 색과 함께 구체적인 텍스트로 제공한다. |
| 강조·색 | 기본은 중립색. 사용자가 고른 accent는 주요 동작·선택에만 사용. 빨강은 파괴 동작·오류, 파랑은 포커스·드롭 위치. 선택·오류를 색 하나로만 알리지 않는다. |
| 여백 | 4/8/12/16/20/24/32px 단계. 같은 묶음 8px, 관련 영역 16px, 제목 아래 20px, 큰 영역 24~32px. |
| 구분선 | 독립 영역의 경계에만 1px 사용. 간격만으로 구분되는 항목에 선을 중복하지 않는다. `.ui-divider` 사용. |
| 모션 | 제어 상태 160ms, 화면·패널 240ms, 공통 ease. 이동·불투명도 중심. 반복 장식 모션 없음. OS 모션 줄이기를 항상 존중. |
| 드래그앤드롭 | 핸들은 grab/grabbing, 원본은 약하게, 복사본은 그림자, 목적지는 파란 선/외곽선+위치 안내. 드롭 의미·유효성은 기존 도메인 로직 유지. Esc/취소, 잘못된 드롭 시 원상복귀, 터치 지연 드래그 유지. 색상 피드백만으로 이동 방식을 설명하지 않는다. |
| 아이콘 | 24×24 좌표, 기본 표시 18px, 1.75px 선, 둥근 끝·연결. currentColor 사용. 브랜드는 자체 색 예외. 장식 아이콘은 aria-hidden, 의미는 버튼·링크의 이름이 제공한다. 사용자 이모지·사진 아이콘은 별도 사용자 콘텐츠. |

## 코드 사용

```tsx
import {Button, PageHeading, Surface} from '../ui/design-system/Components';
import {Icon} from '../ui/design-system/Icon';

<PageHeading title="자료" actions={<Button icon="plus" variant="primary">추가</Button>}/>
<Button icon="close" variant="quiet" aria-label="창 닫기" title="창 닫기"/>
<Surface><Icon name="file"/> 자료 내용</Surface>
```

일반 DOM은 `.ui-button`, `data-variant="primary"`, `.ui-page-heading`, `.ui-card` 등 동일 클래스를 사용하며 아이콘 문자열은 `iconSVG`를 import한다. 신규 화면에서는 아이콘 팩을 우회해 SVG나 외부 팩을 직접 넣지 않는다. 위험 버튼은 `data-variant="danger"`; 선택은 aria-current/aria-pressed 등 의미에 맞는 속성을 함께 둔다.

기존 화면을 바꿀 때는 먼저 여기의 요소를 재사용한다. 같은 역할의 규칙을 화면 CSS에 복사하지 않는다. 특수한 캔버스·타임테이블·문서 본문은 공통 버튼/색/포커스 규칙을 공유하되 도메인별 치수와 좌표를 유지한다.
