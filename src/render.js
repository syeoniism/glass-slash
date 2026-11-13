// render.js — 유리·배경·UI 그리기 (Canvas 2D). Matter.Render는 쓰지 않는다.

import { VIEW, THEME, BLADE, GAME, IS_TOUCH, MOBILE } from './config.js';
import { timeText } from './score.js';

// 본문 글꼴 문자열. 크기는 THEME 배율로 키움: 작은 글자(≤ 24px)는 fontScaleSmall, 큰 글자는 fontScaleLarge
export function uiFont(weight, px) {
  const k = px <= 24 ? THEME.fontScaleSmall : THEME.fontScaleLarge;
  return `${weight} ${Math.round(px * k)}px ${THEME.font}`;
}

// 배율 없이 정확한 크기로 (메인 화면처럼 크기를 직접 정한 곳)
export function uiFontPx(weight, px) {
  return `${weight} ${px}px ${THEME.font}`;
}

// 캔버스를 창에 맞추고, 논리 좌표 1280×720 → 화면 픽셀 변환을 관리
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

  function resize() {
    // 해상도 배율은 최대 2배까지 (3배 화면에서도 눈으로 차이는 거의 없고 그리는 양은 2.25배로 늘어남)
    // 휴대폰은 MOBILE.DPR_MAX까지만 (그리는 양을 줄여 덜 끊기게)
    const dpr = Math.min(IS_TOUCH ? MOBILE.DPR_MAX : 2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // 보이는 크기도 같은 값으로 (휴대폰 브라우저의 100vh는 주소창 뒤까지 포함해서 터치 좌표가 어긋남)
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    // 비율 유지: 가로·세로 중 더 빡빡한 쪽에 맞추고 남는 쪽은 가운데 정렬(레터박스)
    view.scale = Math.min(w / VIEW.W, h / VIEW.H);
    view.ox = (w - VIEW.W * view.scale) / 2;
    view.oy = (h - VIEW.H * view.scale) / 2;
    view.dpr = dpr;
  }
  window.addEventListener('resize', resize);
  // 휴대폰을 돌렸을 때 일부 브라우저는 resize가 늦거나 빠지므로 한 번 더
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  resize();

  return {
    ctx,
    // 매 프레임 시작: 전체를 지우고 논리 좌표계로 변환
    begin() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = THEME.page;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const s = view.scale * view.dpr;
      ctx.setTransform(s, 0, 0, s, view.ox * view.dpr, view.oy * view.dpr);
      // 레터박스 밖으로 그려지지 않게 (clip은 restore 전까지 유지되므로 save/restore로 감쌈)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, VIEW.W, VIEW.H);
      ctx.clip();
    },
    end() { ctx.restore(); },
    // 마우스 이벤트 좌표(CSS px) → 논리 좌표 (F2 칼날에서 사용)
    screenToWorld(clientX, clientY) {
      return { x: (clientX - view.ox) / view.scale, y: (clientY - view.oy) / view.scale };
    },
  };
}

// 배경 그라데이션은 변하지 않으므로 화면 크기에 맞는 이미지로 한 번만 그려 두고 매 프레임 복사만 한다.
// (큰 화면 전체를 그라데이션으로 칠하는 것보다 이미지 복사가 훨씬 빠름) 창 크기가 바뀌면 다시 만든다.
let bgCache = null;
export function drawBackground(ctx, t) {
  const m = ctx.getTransform();
  const w = Math.max(1, Math.round(VIEW.W * m.a)), h = Math.max(1, Math.round(VIEW.H * m.d));
  if (!bgCache || bgCache.width !== w || bgCache.height !== h) {
    bgCache = document.createElement('canvas');
    bgCache.width = w;
    bgCache.height = h;
    const c = bgCache.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, THEME.bgTop);
    g.addColorStop(0.55, THEME.bgMid);
    g.addColorStop(1, THEME.bgBottom);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bgCache, 0, 0, VIEW.W, VIEW.H);

  // 잔잔한 물결 선
  ctx.strokeStyle = THEME.wave;
  ctx.lineWidth = 2;
  for (let k = 0; k < 5; k++) {
    const baseY = 470 + k * 55;
    ctx.beginPath();
    for (let x = 0; x <= VIEW.W; x += 20) {
      const y = baseY + Math.sin(x * 0.01 + t * (0.6 + k * 0.15) + k) * (6 + k * 2);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// 유리 한 장: 반투명 채움 + 밝은 테두리 + 한쪽 변 하이라이트
// alpha: 전체 불투명도 (파편이 서서히 사라질 때 1 → 0)
export function drawGlass(ctx, body, alpha = 1) {
  const v = body.vertices;
  const g = body.plugin.glass;
  if (alpha <= 0) return;
  ctx.beginPath();
  ctx.moveTo(v[0].x, v[0].y);
  for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
  ctx.closePath();

  ctx.globalAlpha = (g.bomb ? 0.9 : THEME.glassFillAlpha) * alpha;
  ctx.fillStyle = g.color;
  ctx.fill();
  ctx.globalAlpha = THEME.glassEdgeAlpha * alpha;
  ctx.strokeStyle = g.bomb ? THEME.bombEdge : g.color;
  ctx.lineWidth = g.bomb ? 3 : 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.globalAlpha = alpha;

  // 폭탄 표시: 가운데 X (색을 못 구분해도 모양으로 알 수 있게)
  if (g.bomb && !g.fragment) {
    const c = body.position, s = 16;
    ctx.strokeStyle = THEME.bombMark;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x - s, c.y - s); ctx.lineTo(c.x + s, c.y + s);
    ctx.moveTo(c.x + s, c.y - s); ctx.lineTo(c.x - s, c.y + s);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return; // 폭탄은 유리 하이라이트 없음
  }

  // 하이라이트: 첫 변을 무게중심 쪽으로 살짝 들여서 흰 선
  const c = body.position;
  const a = v[0], b = v[1];
  const inset = 0.18;
  ctx.strokeStyle = THEME.highlight;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(a.x + (c.x - a.x) * inset, a.y + (c.y - a.y) * inset);
  ctx.lineTo(b.x + (c.x - b.x) * inset, b.y + (c.y - b.y) * inset);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// F2. 칼날 궤적: 오래된 점(꼬리)일수록 가늘고 투명하게.
// 선분마다 u = (선분 순서) / (전체 개수)  → 두께 = MAX_WIDTH·u, 불투명도 = u  (선형보간)
// 너무 느리면(자를 수 없으면) 회색으로 그려 플레이어가 바로 알 수 있게 한다.
export function drawBlade(ctx, points, canCut) {
  const n = points.length;
  if (n < 2) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = canCut ? THEME.blade : THEME.bladeSlow;
  // 빛(glow): 선분마다 그림자를 넣으면 그림자 계산이 선분 수만큼(최대 ~95번) 일어나 느리다.
  // 대신 궤적을 두 덩어리(중간 → 앞쪽은 흐리게, 앞쪽 끝은 진하게)로 나눠 덩어리마다 그림자를 한 번씩만 그린다.
  // 선 자체는 화면 밖으로 멀리 그리고 shadowOffset으로 그림자만 제자리에 오게 해서, 빛만 보이고 선은 안 보인다.
  if (canCut) {
    const far = VIEW.W * 3;
    const offset = far * ctx.getTransform().a; // shadowOffset은 실제 픽셀 단위
    ctx.save();
    ctx.shadowColor = THEME.bladeGlow;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetX = offset;
    ctx.translate(-far, 0);
    for (const [from, to, alpha] of [[0.35, 0.7, 0.5], [0.7, 1, 1]]) {
      const a = Math.floor((n - 1) * from), b = Math.ceil((n - 1) * to);
      if (b <= a) continue;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = BLADE.MAX_WIDTH * (from + to) / 2;
      ctx.beginPath();
      ctx.moveTo(points[a].x, points[a].y);
      for (let i = a + 1; i <= b; i++) ctx.lineTo(points[i].x, points[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (let i = 1; i < n; i++) {
    const u = i / (n - 1);
    ctx.globalAlpha = u;
    ctx.lineWidth = Math.max(1, BLADE.MAX_WIDTH * u);
    ctx.beginPath();
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// 점수·Miss·폭탄 글자: 자른 자리 위에 잠깐 떠서 위로 올라가며 사라짐
// popup = { kind, text, sub, x, y, born }, life = 떠 있는 시간(s)
export function drawPopups(ctx, popups, now, life) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of popups) {
    const u = (now - p.born) / life;          // 0 → 1
    if (u < 0 || u > 1) continue;
    const y = p.y - 30 * u;
    ctx.globalAlpha = 1 - u * u;              // 끝에 가서 빨리 사라짐
    ctx.fillStyle = THEME.popup[p.kind] || THEME.text;
    ctx.font = uiFont(800, p.kind === 'HALF' ? 36 : p.kind === 'CLOSE' ? 30 : 28);
    ctx.fillText(p.text, p.x, y);
    if (p.sub) {
      ctx.font = uiFont(600, 16);
      ctx.fillText(p.sub, p.x, y + 28);
    }
  }
  ctx.globalAlpha = 1;
}

// 하트 하나 (두 개의 3차 베지어 곡선) — 가운데 위 오목한 점 (x, y), 크기 s
function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y - s * 0.1, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 0.1, x, y, x, y + s * 0.3);
  ctx.closePath();
}

// 플레이 중 UI: 생명(왼쪽 위), 남은 시간(가운데 위), 점수(오른쪽 위)
// 강조는 하나만: 남은 시간이 10초 이하일 때만 시간 글자를 크게·색으로
// elapsed = 지금까지 버틴 시간 (제한 시간 없이 올라감)
export function drawHud(ctx, { score, lives, maxLives, elapsed }) {
  for (let i = 0; i < maxLives; i++) {
    heart(ctx, 36 + i * 38, 22, 28);
    ctx.fillStyle = i < lives ? THEME.life : THEME.lifeEmpty;
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = THEME.text;
  ctx.font = uiFont(700, 34);
  ctx.fillText(timeText(elapsed), VIEW.W / 2, 16);

  ctx.textAlign = 'right';
  ctx.fillStyle = THEME.text;
  ctx.font = uiFont(700, 34);
  ctx.fillText(score.toLocaleString('ko-KR'), VIEW.W - 28, 16);
  ctx.font = uiFont(400, 14);
  ctx.fillStyle = THEME.textDim;
  ctx.fillText('점수', VIEW.W - 28, 56);
}

// 결과 화면
// 플레이 화면 아이콘 버튼: 왼쪽 위 하트 옆 (일시정지, 소리)
export const HUD_BUTTONS = {
  pause: { x: 146, y: 13, w: 46, h: 46 },
  sound: { x: 202, y: 13, w: 46, h: 46 },
};

// 동그란 유리 아이콘 버튼 하나. drawIcon(cx, cy)가 가운데 아이콘을 그림
function drawIconButton(ctx, b, drawIcon) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.w / 2;
  ctx.save();
  ctx.globalAlpha = 0.55; // 플레이 화면을 가리지 않게 반투명하게 (배경·테두리·아이콘 모두)
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0.06)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = THEME.title.edge;
  ctx.stroke();
  ctx.fillStyle = THEME.text;
  ctx.strokeStyle = THEME.text;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawIcon(cx, cy);
  ctx.restore();
}

// paused면 ▶(계속하기), 아니면 ❚❚(일시정지). muted면 스피커 + X, 아니면 스피커 + 소리 물결
export function drawHudButtons(ctx, { paused, muted }) {
  drawIconButton(ctx, HUD_BUTTONS.pause, (cx, cy) => {
    ctx.beginPath();
    if (paused) {
      ctx.moveTo(cx - 6, cy - 10); ctx.lineTo(cx + 10, cy); ctx.lineTo(cx - 6, cy + 10); ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(cx - 9, cy - 10, 6, 20);
      ctx.fillRect(cx + 3, cy - 10, 6, 20);
    }
  });
  drawSoundButton(ctx, HUD_BUTTONS.sound, muted);
}

// 음소거 아이콘 버튼 (게임 화면 왼쪽 위, 홈 화면 오른쪽 아래에서 같이 씀)
export const TITLE_SOUND_BUTTON = { x: VIEW.W - 66, y: VIEW.H - 66, w: 46, h: 46 };
export function drawSoundButton(ctx, b, muted) {
  drawIconButton(ctx, b, (cx, cy) => {
    // 스피커: 작은 사각형 + 나팔
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 5); ctx.lineTo(cx - 7, cy - 5); ctx.lineTo(cx, cy - 11);
    ctx.lineTo(cx, cy + 11); ctx.lineTo(cx - 7, cy + 5); ctx.lineTo(cx - 12, cy + 5); ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (muted) {
      ctx.moveTo(cx + 5, cy - 6); ctx.lineTo(cx + 13, cy + 6);
      ctx.moveTo(cx + 13, cy - 6); ctx.lineTo(cx + 5, cy + 6);
    } else {
      ctx.arc(cx + 2, cy, 6, -Math.PI / 4, Math.PI / 4);
      ctx.moveTo(cx + 2 + 11 * Math.cos(-Math.PI / 4), cy + 11 * Math.sin(-Math.PI / 4));
      ctx.arc(cx + 2, cy, 11, -Math.PI / 4, Math.PI / 4);
    }
    ctx.stroke();
  });
}

// 결과 화면 버튼 (가운데 아래)
export const RESULT_BUTTONS = {
  home: { x: VIEW.W / 2 - 230, y: 610, w: 210, h: 56, label: '처음으로' },
  retry: { x: VIEW.W / 2 + 20, y: 610, w: 210, h: 56, label: '다시 시작' },
};

// 생명을 모두 잃으면 GAME OVER. 이번 판의 점수·버틴 시간과, 최고 점수·최장 시간(새 기록이면 강조)
export function drawResult(ctx, { score, elapsed, stats, records, newRecord, canContinue }, t) {
  ctx.fillStyle = THEME.overlay;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = THEME.popup.MISS;
  ctx.font = `900 54px ${THEME.titleFont}`;
  ctx.fillText('GAME OVER', VIEW.W / 2, 118);

  // 이번 판: 점수(크게) | 버틴 시간
  ctx.fillStyle = THEME.text;
  ctx.font = uiFont(800, 72);
  ctx.fillText(score.toLocaleString('ko-KR'), VIEW.W / 2 - 150, 210);
  ctx.fillText(timeText(elapsed), VIEW.W / 2 + 150, 210);
  ctx.font = uiFont(400, 18);
  ctx.fillStyle = THEME.textDim;
  ctx.fillText('점수', VIEW.W / 2 - 150, 262);
  ctx.fillText('버틴 시간', VIEW.W / 2 + 150, 262);

  // 기록: 새 기록이면 그쪽만 노란색으로 "새 최고 점수!" / "새 최장 시간!"
  const rec = [
    [VIEW.W / 2 - 150, newRecord.score, '새 최고 점수!', `최고 점수 ${records.score.toLocaleString('ko-KR')}`],
    [VIEW.W / 2 + 150, newRecord.time, '새 최장 시간!', `최장 시간 ${timeText(records.time)}`],
  ];
  for (const [x, isNew, newText, normal] of rec) {
    ctx.font = isNew ? uiFont(800, 22) : uiFont(500, 18);
    ctx.fillStyle = isNew ? THEME.popup.HALF : THEME.textDim;
    ctx.fillText(isNew ? newText : normal, x, 300);
  }

  // 가장 정확한 자르기는 소수 첫째 자리까지 (예: 49.6 : 50.4)
  const bestCut = stats.bestRatio > 0
    ? `${(stats.bestRatio * 100).toFixed(1)} : ${(100 - stats.bestRatio * 100).toFixed(1)}` : '-';
  const rows = [
    ['가장 정확한 자르기', bestCut],
    ['정확히 반!', `${stats.halves}번`],
    ['자른 횟수', `${stats.slices}번`],
    ['놓친 도형', `${stats.misses}개`],
    ['벤 폭탄', `${stats.bombs}개`],
  ];
  rows.forEach(([k, v], i) => {
    const y = 380 + i * 38;
    ctx.font = uiFont(400, 20);
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(k, VIEW.W / 2 - 20, y);
    ctx.font = uiFont(700, 22);
    ctx.fillStyle = i === 0 ? THEME.popup.HALF : THEME.text;
    ctx.textAlign = 'left';
    ctx.fillText(v, VIEW.W / 2 + 20, y);
  });

  // 버튼: 결과가 뜨자마자 휘두르던 클릭으로 눌리지 않게 잠깐 뒤에 나타남
  if (canContinue) {
    for (const b of Object.values(RESULT_BUTTONS)) drawGlassButton(ctx, b, b.label, 24, t);
  }
}

// ── 제목: 유리 질감 "GLASS SLASH" ─────────────────────────────
// 1) 별도 캔버스(titleLayer)에 굵은 글자를 반투명 유리색 그라데이션으로 채움
// 2) 글자 안쪽에만(source-atop) 유리 깨진 면(facet)을 칠함 — 면 모양은 게임과 같은
//    포아송 점 + 보로노이 칸 (고정 시드라 매번 같은 모양)
// 3) 비스듬한 빛줄기가 천천히 지나감 (반짝임)
// 4) 글자 뒤에 어두운 두께(destination-over), 바깥에 밝은 날카로운 테두리(miter)
// 5) 화면에 그릴 때 대각선 직선으로 둘로 잘라 서로 반대 방향으로 살짝 밀어 "베인" 느낌
const TITLE = {
  text: 'GLASS SLASH',
  cy: 190,                 // 화면에서 제목 중심 y
  boxH: 300,               // 제목 레이어 높이 (논리 px)
  maxW: 1080,              // 글자 폭 최대 (넘으면 글자 크기를 줄임)
  size: 168,
  scale: 2,                // 레이어 해상도 배율 (선명하게)
  slip: 7,                 // 잘린 두 덩어리가 엇갈리는 거리 (px)
};
let titleLayer = null, titleFacets = null;
// 변하지 않는 층(몸체+깨진 면, 두께, 테두리, 바깥 빛)은 한 번만 그려 둔다.
// 매 프레임 바뀌는 것은 무지갯빛 막과 빛줄기뿐 → 그 둘만 새로 칠하고 나머지는 이미지 복사.
// 글꼴이 늦게 불러와지거나 화면 배율이 바뀌면 다시 만든다.
let titleStatic = null;

// 고정 시드 난수 (선형 합동 생성기): s ← (a·s + c) mod 2³²
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function buildTitleFacets(W, H) {
  const rand = seededRandom(20261112);
  const pts = new PoissonDiskSampling({ shape: [W, H], minDistance: 46, maxDistance: 90, tries: 20 }, rand).fill();
  const vor = d3.Delaunay.from(pts).voronoi([0, 0, W, H]);
  const facets = [];
  for (let i = 0; i < pts.length; i++) {
    const cell = vor.cellPolygon(i);
    if (cell) facets.push({ cell, alpha: 0.03 + rand() * 0.22 });
  }
  return facets;
}

function titleCanvas(W, H, S) {
  const cv = document.createElement('canvas');
  cv.width = W * S;
  cv.height = H * S;
  const c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, 0, 0);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  if ('letterSpacing' in c) c.letterSpacing = '6px';
  return [cv, c];
}

// 변하지 않는 층 만들기. screenScale = 화면에 그릴 때의 배율 (바깥 빛 흐림 크기를 화면 기준으로 맞추려고)
function buildTitleStatic(screenScale, fontKey) {
  const W = VIEW.W, H = TITLE.boxH, S = TITLE.scale;
  if (!titleFacets) titleFacets = buildTitleFacets(W, H);

  // 글자 크기: 폭이 maxW를 넘지 않게
  const [base, b] = titleCanvas(W, H, S);
  b.font = `900 ${TITLE.size}px ${THEME.titleFont}`;
  const size = Math.min(TITLE.size, TITLE.size * TITLE.maxW / b.measureText(TITLE.text).width);
  const font = `900 ${size}px ${THEME.titleFont}`;
  const x = W / 2, y = H / 2;

  // 1) 유리 몸체: 위는 밝고 가운데는 비치고 아래 가장자리가 다시 밝은 그라데이션 (색은 THEME.title.body)
  b.font = font;
  const body = b.createLinearGradient(0, y - size * 0.55, 0, y + size * 0.55);
  for (const [at, color] of THEME.title.body) body.addColorStop(at, color);
  b.fillStyle = body;
  b.fillText(TITLE.text, x, y);

  // 2) 깨진 면: 글자 안쪽에만 칠함
  b.globalCompositeOperation = 'source-atop';
  b.lineWidth = 1;
  for (const f of titleFacets) {
    b.beginPath();
    f.cell.forEach(([px, py], k) => (k ? b.lineTo(px, py) : b.moveTo(px, py)));
    b.closePath();
    b.fillStyle = `rgba(255, 255, 255, ${f.alpha})`;
    b.fill();
    b.strokeStyle = THEME.title.facetEdge;
    b.stroke();
  }

  // 4) 두께 (글자 뒤에 깔릴 어두운 글자, 오른쪽 아래로 밀어서)
  const [depth, dc] = titleCanvas(W, H, S);
  dc.font = font;
  dc.fillStyle = THEME.title.depth;
  dc.fillText(TITLE.text, x + 4, y + 6);

  //    날카로운 테두리: miter 이음으로 모서리를 뾰족하게
  const [edge, ec] = titleCanvas(W, H, S);
  ec.font = font;
  ec.lineJoin = 'miter';
  ec.miterLimit = 12;
  ec.lineWidth = 2;
  ec.strokeStyle = THEME.title.edge;
  ec.strokeText(TITLE.text, x, y);

  // 바깥 빛: 완성된 모양의 그림자만 미리 그려 둠 (예전엔 매 프레임 shadowBlur 28로 계산 — 가장 무거운 부분)
  // 그림자만 남기는 방법: 이미지를 캔버스 밖 멀리 그리고 shadowOffsetX로 그림자만 안쪽으로 옮김
  const [full, fc] = titleCanvas(W, H, S);
  fc.setTransform(1, 0, 0, 1, 0, 0);
  fc.drawImage(depth, 0, 0);
  fc.drawImage(base, 0, 0);
  fc.drawImage(edge, 0, 0);
  const M = 60 * S;                         // 빛이 퍼질 여유
  const glow = document.createElement('canvas');
  glow.width = W * S + 2 * M;
  glow.height = H * S + 2 * M;
  const gc = glow.getContext('2d');
  const far = glow.width + full.width + 10;
  gc.shadowColor = THEME.title.glow;
  gc.shadowBlur = 28 * S / screenScale;      // 화면에서 28px로 보이도록 레이어 해상도로 환산
  gc.shadowOffsetX = far;
  gc.drawImage(full, M - far, M);

  return { base, depth, edge, glow, M, S, screenScale, fontKey };
}

function renderTitleLayer(t, screenScale) {
  const W = VIEW.W, H = TITLE.boxH, S = TITLE.scale;
  const fontKey = !document.fonts || document.fonts.check(`48px ${THEME.titleFont}`, TITLE.text);
  if (!titleStatic || titleStatic.fontKey !== fontKey || Math.abs(titleStatic.screenScale - screenScale) > 0.01) {
    titleStatic = buildTitleStatic(screenScale, fontKey);
  }
  if (!titleLayer) {
    titleLayer = document.createElement('canvas');
    titleLayer.width = W * S;
    titleLayer.height = H * S;
  }
  const c = titleLayer.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, titleLayer.width, titleLayer.height);
  c.drawImage(titleStatic.base, 0, 0);       // 1)·2) 몸체 + 깨진 면 (미리 그려 둔 것)
  c.setTransform(S, 0, 0, S, 0, 0);
  c.globalCompositeOperation = 'source-atop';

  //    무지갯빛 막: 가로 그라데이션이 천천히 흘러감 (색 위치를 시간에 따라 옮김)
  const iris = c.createLinearGradient(0, 0, W, 0);
  const colors = THEME.title.iris, shift = (t * 0.05) % 1;
  for (let k = 0; k <= 8; k++) {
    const at = (k / 8 + shift) % 1;
    iris.addColorStop(at, colors[k % colors.length]);
  }
  c.fillStyle = iris;
  c.fillRect(0, 0, W, H);

  // 3) 빛줄기: 비스듬한 띠가 4초마다 왼쪽에서 오른쪽으로
  const u = (t / 4) % 1;
  const bx = -300 + u * (W + 600);
  const band = c.createLinearGradient(bx - 90, 0, bx + 90, 0);
  band.addColorStop(0, 'rgba(255, 255, 255, 0)');
  band.addColorStop(0.5, THEME.title.shine);
  band.addColorStop(1, 'rgba(255, 255, 255, 0)');
  c.fillStyle = band;
  c.beginPath();
  c.moveTo(bx - 60, 0); c.lineTo(bx + 120, 0); c.lineTo(bx + 60, H); c.lineTo(bx - 120, H);
  c.closePath();
  c.fill();

  // 4) 두께는 글자 뒤(destination-over)에, 테두리는 맨 위에 (둘 다 미리 그려 둔 것)
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'destination-over';
  c.drawImage(titleStatic.depth, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.drawImage(titleStatic.edge, 0, 0);
}

// records = { score: 최고 점수, time: 최장 시간(초) }
export function drawTitle(ctx, t, { records = { score: 0, time: 0 } } = {}) {
  renderTitleLayer(t, ctx.getTransform().a);
  const W = VIEW.W, H = TITLE.boxH, top = TITLE.cy - H / 2;

  // 베인 선: 레이어 위 대각선 A→B. 단위 방향 d, 법선 n = (−d_y, d_x)
  // (글자 높이 안에서만 지나가게: 양 끝이 글자 위·아래 가장자리에 걸리면 지저분한 부스러기가 생김)
  const A = { x: W / 2 - 520, y: top + H / 2 + 34 };
  const B = { x: W / 2 + 520, y: top + H / 2 - 26 };
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  const d = { x: (B.x - A.x) / len, y: (B.y - A.y) / len };
  const n = { x: -d.y, y: d.x };
  const L = 2000;

  // 직선의 한쪽 반평면만 남기고(clip) 그려서, 두 덩어리를 서로 반대로 엇갈리게
  for (const side of [1, -1]) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(A.x - d.x * L, A.y - d.y * L);
    ctx.lineTo(B.x + d.x * L, B.y + d.y * L);
    ctx.lineTo(B.x + d.x * L + n.x * L * side, B.y + d.y * L + n.y * L * side);
    ctx.lineTo(A.x - d.x * L + n.x * L * side, A.y - d.y * L + n.y * L * side);
    ctx.closePath();
    ctx.clip();
    ctx.translate((d.x * TITLE.slip + n.x * 2) * side, (d.y * TITLE.slip + n.y * 2) * side);
    const { glow, M, S } = titleStatic;     // 바깥 빛 (미리 흐려 둔 이미지)
    ctx.drawImage(glow, -M / S, top - M / S, glow.width / S, glow.height / S);
    ctx.drawImage(titleLayer, 0, top, W, H);
    ctx.restore();
  }

  // 베인 자국: 가운데가 밝고 양끝이 사라지는 얇은 빛
  const slash = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
  slash.addColorStop(0, 'rgba(255, 255, 255, 0)');
  slash.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
  slash.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.strokeStyle = slash;
  ctx.lineWidth = 2;
  ctx.shadowColor = THEME.title.slashGlow;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 안내
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // 메인 화면 글자 크기 (실제 px): 안내 28 · 연습 안내 22 · 최고 기록 28 · 시작 버튼 32
  ctx.font = uiFontPx(500, 28);
  ctx.fillStyle = THEME.text;
  ctx.fillText(`${IS_TOUCH ? '화면을 손가락으로 쓸어' : '마우스를 누른 채 휘둘러'} 유리를 베세요. 정확히 반으로 자를수록 점수가 높습니다.`, VIEW.W / 2, 322);
  ctx.fillStyle = THEME.textDim;
  ctx.fillText('X 표시 폭탄을 베거나 유리를 놓치면 생명이 줄고, 생명 3개를 모두 잃으면 끝나요.', VIEW.W / 2, 362);
  ctx.font = uiFontPx(400, 22);
  ctx.fillText('떠오르는 유리를 베어 연습해 보세요!', VIEW.W / 2, 400);
  if (records.score > 0 || records.time > 0) {
    ctx.font = uiFontPx(600, 28);
    ctx.fillStyle = THEME.popup.HALF;
    ctx.fillText(`최고 점수 ${records.score.toLocaleString('ko-KR')}     최장 시간 ${timeText(records.time)}`, VIEW.W / 2, 527);
  }
  drawStartButton(ctx, t);
}

// 제목 화면 버튼 (연습 칼질과 겹치지 않게 "버튼을 눌러야" 이동)
//   START: 가운데 아래 (주 버튼) / 어떤 원리일까?: 왼쪽 아래 작은 유리 버튼 (보조 버튼)
export const START_BUTTON = { x: VIEW.W / 2 - 155, y: 557, w: 310, h: 64 };
export const LAB_BUTTON = { x: 20, y: VIEW.H - 70, w: 232, h: 50 };
// 원리 보기 화면 버튼 — "돌아가기"는 왼쪽 위에 배경 없이 화살표만 (누르는 영역 = 화살표 둘레)
//   나머지 버튼은 아래 한 줄 (메인 화면 "어떤 원리일까?"와 같은 높이)
const LAB_ROW = { y: LAB_BUTTON.y, h: LAB_BUTTON.h };
export const LAB_BUTTONS = {
  back: { x: 16, y: 16, w: 60, h: 56, label: '', key: 'Esc' },
  fresh: { x: 236, ...LAB_ROW, w: 190, label: '새 유리', key: 'N' },
  seed: { x: 442, ...LAB_ROW, w: 190, label: '', key: 'P' },        // 글자는 지금 씨앗 방식에 따라 "씨앗: 포아송/무작위"
  shatter: { x: 648, ...LAB_ROW, w: 190, label: '부숴 보기', key: 'B' },
  compare: { x: 854, ...LAB_ROW, w: 190, label: '나란히 비교', key: 'C' },  // 포아송 vs 무작위
  // (가운데 네 버튼: 폭 190 + 간격 16 → x 236~1044, 화면 가운데 640에 맞춤)
};
// 나란히 비교 화면의 "다시 섞기" 버튼 (가운데)
export const COMPARE_FRESH = { x: VIEW.W / 2 - 100, ...LAB_ROW, w: 200 };

// 터치 화면에서는 손가락이 덜 정확하므로 누르는 영역만 사방으로 MOBILE.HIT_PAD 넓힘 (그림 크기는 그대로)
export function hitButton(b, p) {
  const m = IS_TOUCH ? MOBILE.HIT_PAD : 0;
  return p.x >= b.x - m && p.x <= b.x + b.w + m && p.y >= b.y - m && p.y <= b.y + b.h + m;
}
export function hitStartButton(p) { return hitButton(START_BUTTON, p); }

function drawStartButton(ctx, t) {
  drawGlassButton(ctx, START_BUTTON, 'START', 32, t);
  drawGlassButton(ctx, LAB_BUTTON, '어떤 원리일까?', 22, t);
}

// 유리 버튼 하나 (반투명 그라데이션 + 밝은 테두리 + 천천히 숨 쉬는 빛)
// keyHint: 버튼 오른쪽 안에 작게 그리는 단축키 (예: 'Esc', 'N') — 없으면 생략
function drawGlassButton(ctx, b, label, px, t, keyHint = '') {
  const r = b.h / 2;
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(b.x, b.y, b.w, b.h, r);
  else ctx.rect(b.x, b.y, b.w, b.h);
  // 유리 버튼: 위가 밝은 반투명 그라데이션 + 밝은 테두리, 천천히 숨 쉬는 빛
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
  ctx.fillStyle = g;
  ctx.shadowColor = THEME.title.glow;
  ctx.shadowBlur = 14 + 8 * Math.sin(t * 3);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = THEME.title.edge;
  ctx.stroke();
  // 단축키 칸: 오른쪽 안쪽에 작은 둥근 상자, 글자는 그 왼쪽 남은 폭의 가운데
  let labelCx = b.x + b.w / 2;
  if (keyHint) {
    ctx.font = uiFontPx(600, 14);
    const kw = Math.max(24, ctx.measureText(keyHint).width + 12), kh = 22;
    const kx = b.x + b.w - r * 0.6 - kw, ky = b.y + (b.h - kh) / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(kx, ky, kw, kh, 6); else ctx.rect(kx, ky, kw, kh);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(keyHint, kx + kw / 2, ky + kh / 2 + 1);
    labelCx = (b.x + r * 0.4 + kx) / 2;
  }
  ctx.fillStyle = THEME.text;
  ctx.font = uiFontPx(700, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, labelCx, b.y + b.h / 2 + 1);
  ctx.restore();
}

// 반투명 카드 (원리 보기 화면의 범례·나란히 비교의 양쪽 묶음에 같이 씀)
export function drawCard(ctx, x, y, w, h, r = 18) {
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// 원리 보기 화면: 위에 설명, 아래에 버튼 (유리와 계산 그림은 main.js·debug.js가 그림)
// cutDone: 이번 유리를 이미 잘랐는지 (아래 안내 문구를 바꾸려고)
export function drawLab(ctx, t, { shattered, shatteredMode = 'poisson', compare = false, cutDone = false, seedMode = 'poisson' }) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.text;
  ctx.font = uiFontPx(800, 34);
  ctx.fillText('어떤 원리일까?', VIEW.W / 2, 44);
  ctx.font = uiFontPx(500, 20);
  ctx.fillStyle = THEME.textDim;
  const lines = compare
    ? ['두 유리는 모양도 같고, 검은 점으로 표시한 씨앗의 개수도 같아요. 다른 것은 씨앗을 뿌리는 방법뿐이에요.',
       '씨앗마다 그 씨앗과 가장 가까운 영역이 파편 하나가 돼요. 그래서 씨앗이 고르게 퍼질수록 파편 크기도 고르게 나와요.']
    : shattered
    ? (shatteredMode === 'random'
      ? ['씨앗(노랑)을 아무 데나 뿌린 결과예요. 씨앗이 뭉친 곳은 잘게, 빈 곳은 크게 깨져요.',
         '나란히 비교를 누르면 포아송과 무작위를 한 화면에서 비교할 수 있어요.']
      : ['포아송 표본화로 씨앗(노랑)을 고르게 뿌리고, 칼이 들어간 곳에는 씨앗(주황)을 몇 개 더해요.',
         '씨앗마다 가장 가까운 영역이 보로노이 칸(점선)이 되고, 이 칸을 유리 모양으로 잘라 내면 파편이 돼요.'])
    : ['칼이 지나는 직선을 기준으로, 꼭짓점마다 외적의 부호를 구해요. 파랑은 +, 주황은 − 쪽이에요.',
       '부호가 바뀌는 변에서는 선형보간으로 교점(분홍)을 찾고, 두 조각의 넓이는 신발끈 공식으로 계산해요.'];
  lines.forEach((s, i) => ctx.fillText(s, VIEW.W / 2, 86 + i * 28));

  // 버튼 바로 위: 지금 해 볼 것 한 줄
  const guide = compare ? '다시 섞기를 누르면 새 모양의 유리로 다시 비교해요.'
    : shattered ? '나란히 비교를 누르면 포아송과 무작위를 한눈에 비교할 수 있어요.'
    : cutDone ? '새 유리로 다시 해 보거나, 부숴 보기로 파편이 생기는 원리를 확인해 보세요.'
    : `${IS_TOUCH ? '손가락으로' : '마우스를 누른 채'} 유리를 천천히 가로질러 그어 보세요.`;
  ctx.font = uiFontPx(500, 18);
  ctx.fillStyle = THEME.textDim;
  ctx.fillText(guide, VIEW.W / 2, LAB_BUTTONS.fresh.y - 24); // 아래 버튼 줄 바로 위

  // 돌아가기: 왼쪽 위 화살표만
  drawBackArrow(ctx, LAB_BUTTONS.back);
  // 아래 버튼: 나란히 비교 중에는 가운데 "다시 섞기"만
  const buttons = compare
    ? [[COMPARE_FRESH, '다시 섞기']]
    : [[LAB_BUTTONS.fresh, LAB_BUTTONS.fresh.label],
       [LAB_BUTTONS.seed, `씨앗: ${seedMode === 'random' ? '무작위' : '포아송'}`],
       [LAB_BUTTONS.shatter, LAB_BUTTONS.shatter.label],
       [LAB_BUTTONS.compare, LAB_BUTTONS.compare.label]];
  for (const [b, label] of buttons) drawGlassButton(ctx, b, label, 22, t);
}

// 왼쪽 위 "돌아가기" 화살표 (배경·글자 없이 선으로)
function drawBackArrow(ctx, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, s = 16;
  ctx.save();
  ctx.strokeStyle = THEME.text;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx + s, cy);          // 몸통
  ctx.lineTo(cx - s, cy);
  ctx.moveTo(cx - s + 11, cy - 11); // 화살촉
  ctx.lineTo(cx - s, cy);
  ctx.lineTo(cx - s + 11, cy + 11);
  ctx.stroke();
  ctx.restore();
}

// 일시정지 화면
// 일시정지 화면 버튼: 제목 아래 세로로 (계속하기 → 처음으로)
export const PAUSE_BUTTONS = {
  resume: { x: VIEW.W / 2 - 130, y: VIEW.H / 2 + 10, w: 260, h: 58, label: '계속하기' },
  home: { x: VIEW.W / 2 - 130, y: VIEW.H / 2 + 86, w: 260, h: 58, label: '처음으로' },
};

export function drawPause(ctx, t) {
  ctx.fillStyle = THEME.overlay;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.text;
  ctx.font = uiFont(800, 56);
  ctx.fillText('일시정지', VIEW.W / 2, VIEW.H / 2 - 60);
  for (const b of Object.values(PAUSE_BUTTONS)) drawGlassButton(ctx, b, b.label, 24, t);
}

// 개발용: 왼쪽 아래 작은 글자 여러 줄
export function drawDevText(ctx, lines) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.font = uiFont(400, 13);
  ctx.fillStyle = THEME.textDim;
  const shown = lines.filter(Boolean);
  shown.forEach((s, i) => ctx.fillText(s, 12, VIEW.H - 10 - (shown.length - 1 - i) * 17));
}
