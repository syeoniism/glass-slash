# 유리 베기 (Glass Slash)

컴퓨터그래픽스 Project 2 — 2D 오픈소스 미니 프로젝트

튀어 오르는 유리를 마우스로 베어, **두 조각의 넓이를 얼마나 똑같이 나눴는지**로 점수를 겨루는 2D 게임.
제목 화면의 **"어떤 원리일까?"** 버튼을 누르면 자르기·부수기 계산을 화면에 겹쳐 보며 직접 잘라 볼 수 있다.

---

## 실행 방법

### 방법 1 — 웹에서 바로 실행 (설치 필요 없음)

**<https://syeoniism.github.io/glass-slash/>**

GitHub Pages로 배포한 주소. 브라우저(Chrome, Edge 최신 버전 권장)로 열면 바로 플레이할 수 있다.

### 방법 2 — 제출 파일로 실행 (인터넷 없이)

ES 모듈을 쓰기 때문에 `index.html`을 **더블클릭해서 열면 동작하지 않고**, 로컬 웹 서버로 열어야 한다.

1. 이 폴더(`index.html`이 있는 곳)에서 터미널을 열고 실행 (Python 3 필요)
   ```bash
   python -m http.server 8000
   ```
2. 브라우저에서 <http://localhost:8000> 접속

또는 VS Code의 Live Server 확장으로 `index.html`을 열고 *Go Live*를 눌러도 된다.

- 효과음이 나오므로 소리를 켜 두면 좋다.
- 라이브러리는 `vendor/`, 글꼴은 `fonts/`에 들어 있어 인터넷 없이 동작한다.

---

## 조작법

| 입력 | 동작 |
|---|---|
| 마우스 드래그 | 칼날. 너무 느리면(400 px/s 미만, 회색 칼날) 자르지 않음 |
| **START** / `Space` / `Enter` | 게임 시작 (제목 화면에서는 떠오르는 유리로 연습 가능) |
| 일시정지 아이콘 / `Esc` | 일시정지·계속 |
| 스피커 아이콘 / `M` | 효과음 끄기·켜기 |
| **어떤 원리일까?** (제목 화면) | 원리 보기 화면 — 천천히 그으면 외적 부호·교점·무게중심·넓이 %가 보임 |
| 원리 보기: `N` / `B` / `P` / `C` / `Esc` | 새 유리 / 부숴 보기 / 씨앗 방식(포아송·무작위) 바꾸기 / 포아송·무작위 나란히 비교 / 돌아가기 |

## 게임 규칙

- 유리를 베면 작은 조각의 넓이 비율 `a`로 점수: `100 × (2a)^2.3` (50 : 50 → 100점, 60 : 40 → 60점)
- **48 : 52 이상이면 "정확히 반!"** +200점, 유리가 산산조각 난다. 44 : 56 이상이면 "아깝다!"
- 생명은 3개. **유리를 놓치거나 폭탄(X 표시)을 베면** 하나씩 줄고, 모두 잃으면 게임 끝
- 한 번 자른 조각은 다시 자를 수 없다. 최고 점수와 가장 오래 버틴 시간은 브라우저에 저장된다.

---

## 사용한 오픈소스

| 라이브러리 | 버전 | 라이선스 | 이 게임에서 하는 일 |
|---|---|---|---|
| [Matter.js](https://github.com/liabru/matter-js) | 0.20.0 | MIT | 강체 물리 (중력, 위치·속도·회전 갱신, 물체 생성) |
| [d3-delaunay](https://github.com/d3/d3-delaunay) | 6.0.4 | ISC | 보로노이 칸 생성 (파편 모양) |
| [Delaunator](https://github.com/mapbox/delaunator) | d3-delaunay에 포함 | ISC | d3-delaunay 내부의 들로네 삼각분할 |
| [poisson-disk-sampling](https://github.com/kchapelier/poisson-disk-sampling) | 표기 없음 | MIT | 파편 씨앗 점을 최소 간격 이상으로 고르게 배치 |

- 라이선스 전문: `vendor/LICENSES/`, 저장소 링크 목록: `repos.txt`
- 음원: 없음. 효과음은 Web Audio API로 직접 합성 (`src/sfx.js`)
- 글꼴: 제목 **SB 어그로 B** ((주)샌드박스네트워크, <https://noonnu.cc/font_page/738>), 본문 **Ok단단체** (오케이티콘, <https://noonnu.cc/font_page/1664>).
  두 글꼴 모두 무료 사용 가능하지만 파일 재배포가 금지되어, 공개 GitHub 저장소에는 글꼴 파일을 올리지 않고 눈누 웹폰트(jsDelivr CDN)로 불러온다.

## 원본 코드와 직접 작성한 코드

| 위치 | 내용 |
|---|---|
| `vendor/` | **오픈소스 원본** — 내려받은 그대로, 수정하지 않음 |
| `src/` | **직접 작성한 코드** — 자르기, 부수기, 점수, 출현, 그리기, 원리 보기. 오픈소스는 전역 객체(`Matter`, `d3`, `PoissonDiskSampling`)로 호출만 함 |
| `index.html` | 직접 작성 — vendor 스크립트 3개와 `src/main.js`를 불러옴 |
| `docs/demos/` | 각 라이브러리의 원본 예제를 돌려 본 페이지 (아래 표) |

원리 설명에 쓰는 계산(외적, 선형보간, 선분 교차, 볼록 다각형 자르기, Sutherland–Hodgman 클리핑, 신발끈 넓이·무게중심)은 `src/geometry.js`에 공식 주석과 함께 모아 두었다.

### 원본 예제 데모 (`docs/demos/`)

| 파일 | 내용 |
|---|---|
| `matter-basic.html` | Matter.js 기본 예제, 중력을 1 → 0.3으로 바꿈 |
| `matter-airfriction.html` | Matter.js Air Friction 예제 + 공기 저항 0.001 / 0.1일 때 1초 뒤 속도 측정 |
| `voronoi-basic.html` | d3-delaunay 기본 예제 (보로노이 칸) + 들로네 삼각형 겹쳐 그리기 |
| `poisson-basic.html` | poisson-disk-sampling 기본 예제, 최소 간격 20(원본)과 40(바꾼 값) 비교 |

게임과 같은 방법으로 연다. 예: <https://syeoniism.github.io/glass-slash/docs/demos/matter-airfriction.html> 또는 <http://localhost:8000/docs/demos/matter-airfriction.html>

## 폴더 구조

```
index.html      진입점
src/            직접 작성한 코드
vendor/         오픈소스 원본 + LICENSES/
fonts/          글꼴 파일 (제출 파일에만 포함)
docs/demos/     원본 예제 데모
README.md       이 문서
repos.txt       사용한 오픈소스 저장소 링크
demo.mp4        데모 영상 (제출 파일에만 포함)
설명 자료 PDF    고른 이유, 원리 설명, 바꾼 것, AI 사용 내역 (제출 파일에만 포함)
```
