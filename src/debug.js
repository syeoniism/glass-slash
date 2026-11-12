// debug.js — F8. 원리 보기 모드 (V): 게임 위에 내부 계산을 겹쳐 그린다. 발표·영상의 핵심 장치.
//
//  ① 모든 물체의 AABB (body.bounds) — 넓은 범위 검사에서 쓰는 상자
//  ② 칼이 유리 안에 들어가 있는 동안: 진입점, 진입점→칼끝 직선(연장선), 꼭짓점별 외적 부호,
//     그 직선으로 자르면 몇 : 몇이 될지 미리보기 (아직 자르기 전!)
//  ③ 마지막 자르기: 자른 직선, 외적 부호(파랑 +, 주황 −), 교점, 두 조각의 무게중심(+)과 넓이 %
//  ④ 마지막 파편화: 포아송 씨앗, 충격 지점 씨앗, 보로노이 칸(클리핑 전), 클리핑된 파편
//
// 그리기만 하고 게임 상태는 바꾸지 않는다. 계산은 geometry.js 함수를 그대로 다시 써서
// 화면에 보이는 값이 게임이 실제로 쓴 값과 같다.

import { DEBUG, VIEW } from './config.js';
import { uiFont, uiFontPx, drawCard } from './render.js';
import {
  sub, add, lerp, rotate, cross, splitConvexPolygon, polygonArea, polygonCentroid,
} from './geometry.js';

const C = DEBUG.COLORS;

export function createDebug() {
  let lastCut = null, lastShatter = null;
  return {
    on: false,
    toggle() { this.on = !this.on; },
    // 자르기 결과를 기억해 둔다 (켜져 있지 않아도 기억 — 켜는 순간 바로 보이게)
    record(cut, now) {
      // 폭탄이 파편화에 실패해 그냥 잘린 경우도 있으므로 type이 아니라 내용(cells)으로 구분
      if (cut.cells) lastShatter = { cut, t: now };
      else lastCut = { cut, t: now };
    },
    clear() { lastCut = lastShatter = null; },

    // persist = true면 마지막 자르기·파편화 그림을 흐리지 않고 계속 보여 줌 (원리 보기 화면)
    draw(ctx, { bodies, entries, bladeTip, now, persist = false }) {
      if (!this.on) return;
      ctx.save();
      drawAabbs(ctx, bodies);
      if (lastShatter) drawShatter(ctx, lastShatter.cut, persist ? 1 : fade(lastShatter.t, now));
      if (lastCut) drawCut(ctx, lastCut.cut, persist ? 1 : fade(lastCut.t, now));
      drawLivePreview(ctx, bodies, entries, bladeTip);
      drawLegend(ctx, lastShatter && lastShatter.cut.seedMode === 'random' ? '무작위 씨앗' : '포아송 씨앗');
      ctx.restore();
    },
  };
}

function fade(t, now) { return Math.max(0, 1 - (now - t) / DEBUG.HOLD_S); }

// ── 그리기 도우미 ─────────────────────────────────
function dot(ctx, p, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}
function plus(ctx, p, s, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y);
  ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
  ctx.stroke();
}
function outline(ctx, poly, color, width = 1, dash = []) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}
function label(ctx, text, x, y, color = C.text, size = 13) {
  ctx.font = uiFont(600, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
// A→B 직선을 화면 끝까지 연장 (A − d·L ~ A + d·L)
function infiniteLine(ctx, A, B, color, dash = [6, 6]) {
  const d = sub(B, A);
  const len = Math.hypot(d.x, d.y) || 1;
  const L = VIEW.W + VIEW.H;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(A.x - (d.x / len) * L, A.y - (d.y / len) * L);
  ctx.lineTo(A.x + (d.x / len) * L, A.y + (d.y / len) * L);
  ctx.stroke();
  ctx.setLineDash([]);
}

// 꼭짓점마다 외적 부호 점 + 부호가 바뀌는 변의 교점 (splitConvexPolygon과 같은 계산)
function drawSides(ctx, poly, side) {
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    if (side[i] * side[j] < 0) dot(ctx, lerp(poly[i], poly[j], side[i] / (side[i] - side[j])), 4, C.hit);
    dot(ctx, poly[i], 5, side[i] >= 0 ? C.plus : C.minus);
  }
}

// 두 조각의 무게중심(+)과 넓이 %
function drawPieces(ctx, left, right) {
  const aL = polygonArea(left), aR = polygonArea(right), total = aL + aR;
  for (const [piece, a] of [[left, aL], [right, aR]]) {
    const c = polygonCentroid(piece);
    plus(ctx, c, 7, C.text);
    label(ctx, `${(a / total * 100).toFixed(1)}%`, c.x, c.y + 16);
  }
}

// ── ① AABB ───────────────────────────────────────
function drawAabbs(ctx, bodies) {
  ctx.strokeStyle = C.aabb;
  ctx.lineWidth = 1;
  for (const b of bodies) {
    const { min, max } = b.bounds;
    ctx.strokeRect(min.x, min.y, max.x - min.x, max.y - min.y);
  }
}

// ── ② 칼이 유리 안에 있는 동안: 자르기 미리보기 ──────
function drawLivePreview(ctx, bodies, entries, tip) {
  if (!tip) return;
  for (const [id, e] of entries) {
    const body = bodies.find(b => b.id === id);
    if (!body) continue;
    // 진입점은 유리 로컬 좌표로 저장되어 있음 → 지금 위치·각도로 되돌림
    const A = add(body.position, rotate(e.local, body.angle));
    const poly = body.vertices.map(v => ({ x: v.x, y: v.y }));
    infiniteLine(ctx, A, tip, C.line);
    const d = sub(tip, A);
    drawSides(ctx, poly, poly.map(v => cross(d, sub(v, A))));
    dot(ctx, A, 6, C.line);
    label(ctx, '진입', A.x, A.y - 14);
    const split = splitConvexPolygon(poly, A, tip);
    if (split) drawPieces(ctx, split.left, split.right);
  }
}

// ── ③ 마지막 자르기 ───────────────────────────────
function drawCut(ctx, cut, alpha) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  outline(ctx, cut.polygon, C.text, 1, [3, 4]);   // 자르기 직전 유리 모양
  infiniteLine(ctx, cut.A, cut.B, C.line);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cut.A.x, cut.A.y); ctx.lineTo(cut.B.x, cut.B.y); ctx.stroke();
  drawSides(ctx, cut.polygon, cut.side);
  dot(ctx, cut.A, 6, C.line); label(ctx, '진입', cut.A.x, cut.A.y - 14);
  dot(ctx, cut.B, 6, C.line); label(ctx, '이탈', cut.B.x, cut.B.y - 14);
  drawPieces(ctx, cut.left, cut.right);
  ctx.globalAlpha = 1;
}

// ── ④ 마지막 파편화 ───────────────────────────────
function drawShatter(ctx, sh, alpha) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.save();
  // 보로노이 칸은 유리 바깥(AABB 안)까지 퍼져 있음 → 클리핑 전 모양을 그대로 보여 줌
  for (const cell of sh.cells) outline(ctx, cell, C.cell, 1, [2, 3]);
  for (const f of sh.fragments) outline(ctx, f, C.frag, 1.5);
  outline(ctx, sh.polygon, C.text, 2);
  for (const p of sh.poisson) dot(ctx, p, 3.5, C.seed);
  for (const p of sh.extra) dot(ctx, p, 3.5, C.impact);
  if (sh.A && sh.B) infiniteLine(ctx, sh.A, sh.B, C.line);
  // 파편 크기가 얼마나 고른가: 넓이의 표준편차 ÷ 평균 (작을수록 고름) — 포아송 vs 무작위 비교용
  // 충격 지점 씨앗(일부러 잘게 부수는 것)에서 나온 파편은 빼고, 주 씨앗에서 나온 파편만으로 계산
  const areas = sh.fragments.filter((f, k) => !sh.fragmentSeed || sh.fragmentSeed[k] < sh.poisson.length).map(polygonArea);
  const mean = areas.reduce((s, a) => s + a, 0) / areas.length;
  const sd = Math.sqrt(areas.reduce((s, a) => s + (a - mean) ** 2, 0) / areas.length);
  const c = polygonCentroid(sh.polygon);
  const bottom = sh.polygon.reduce((m, p) => Math.max(m, p.y), -Infinity);
  const mode = sh.seedMode === 'random' ? '무작위' : '포아송';
  label(ctx, `${mode} 씨앗 ${sh.poisson.length}+${sh.extra.length} → 파편 ${sh.fragments.length} · r=${sh.r.toFixed(0)}px`,
    c.x, bottom + 18, C.text, 15);
  label(ctx, `파편 크기 편차 (주 씨앗 파편, 표준편차÷평균) ${Math.round(sd / mean * 100)}%`, c.x, bottom + 42, C.text, 15);
  ctx.restore();
  ctx.globalAlpha = 1;
}

// ── 나란히 비교: 포아송 vs 무작위 ──────────────────────
// 같은 유리 두 개를 왼쪽·오른쪽에 놓고, 파편을 제자리에서 살짝 벌린 채 크기에 따라 색칠한다.
//   색: 파편 넓이 ÷ (양쪽 전체 평균 넓이)의 로그 → 작은 조각은 진한 분홍, 큰 조각은 연한 하늘색
//   (로그를 쓰면 "절반 크기"와 "두 배 크기"가 같은 정도로 다른 색이 됨)
const SMALL = [255, 92, 140], BIG = [205, 232, 255];
function sizeColor(area, mean) {
  const v = Math.max(-1.5, Math.min(1.5, Math.log2(area / mean)));
  const u = (v + 1.5) / 3; // 0 = 아주 작음, 1 = 아주 큼
  const c = SMALL.map((s, i) => Math.round(s + (BIG[i] - s) * u));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
function spread(areas) {
  const mean = areas.reduce((s, a) => s + a, 0) / areas.length;
  const sd = Math.sqrt(areas.reduce((s, a) => s + (a - mean) ** 2, 0) / areas.length);
  return { cv: sd / mean, ratio: Math.max(...areas) / Math.min(...areas) };
}

export function drawSeedComparison(ctx, cmp, layout) {
  const sides = [
    { key: 'poisson', title: '포아송: 서로 너무 가깝지 않게 뿌리기', cx: layout.leftX },
    { key: 'random', title: '무작위: 아무 데나 뿌리기', cx: layout.rightX },
  ];
  const all = [...cmp.poisson.fragments, ...cmp.random.fragments].map(polygonArea);
  const mean = all.reduce((s, a) => s + a, 0) / all.length;
  const pc = polygonCentroid(cmp.poly);
  ctx.save();
  for (const side of sides) {
    const data = cmp[side.key];
    // 제목·유리·수치를 카드 하나로 묶음
    drawCard(ctx, side.cx - layout.cardW / 2, layout.cardTop, layout.cardW, layout.cardH);
    ctx.save();
    ctx.translate(side.cx - pc.x, layout.cy - pc.y);
    // 파편: 유리 중심에서 바깥쪽으로 조금 벌려서 (칸 경계가 잘 보이게)
    for (const f of data.fragments) {
      const fc = polygonCentroid(f);
      const d = sub(fc, pc), len = Math.hypot(d.x, d.y) || 1;
      const off = { x: (d.x / len) * 5, y: (d.y / len) * 5 };
      const moved = f.map(p => add(p, off));
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      moved.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = sizeColor(polygonArea(f), mean);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    outline(ctx, cmp.poly, 'rgba(255, 255, 255, 0.35)', 1, [4, 4]); // 원래 유리 윤곽
    for (const s of data.seeds) dot(ctx, s, 5, '#2b2633');         // 씨앗 (밝은 파편 위에서 잘 보이게 어두운 점)
    ctx.restore();

    // 위: 방식 이름, 아래: 수치
    const st = spread(data.fragments.map(polygonArea));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.font = uiFontPx(800, 26);
    ctx.fillText(side.title, side.cx, layout.titleY);
    ctx.font = uiFontPx(600, 22);
    ctx.fillText(`가장 큰 조각이 가장 작은 조각의 ${st.ratio.toFixed(1)}배`, side.cx, layout.statY);
    ctx.fillText(`크기가 들쭉날쭉한 정도 ${Math.round(st.cv * 100)}% (낮을수록 고름)`, side.cx, layout.statY + 30);
  }
  // 색 범례: 오른쪽 가운데에 세로로 — 위 "작은 조각", 막대(위 진한 분홍 → 아래 연한 하늘색), 아래 "큰 조각"
  const bh = 260, bw = 12, bx = layout.barX - bw / 2, by = layout.cy - bh / 2;
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, `rgb(${SMALL.join(',')})`);
  g.addColorStop(1, `rgb(${BIG.join(',')})`);
  ctx.fillStyle = g;
  ctx.fillRect(bx, by, bw, bh);
  ctx.font = uiFontPx(600, 18);
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('작은 조각', layout.barX, by - 8);
  ctx.textBaseline = 'top';
  ctx.fillText('큰 조각', layout.barX, by + bh + 8);
  ctx.restore();
}

// ── 범례 (오른쪽 아래) ─────────────────────────────
function drawLegend(ctx, seedLabel = '포아송 씨앗') {
  const items = [
    [C.plus, '외적 + 쪽 꼭짓점'],
    [C.minus, '외적 − 쪽 꼭짓점'],
    [C.hit, '교점 (선형보간)'],
    [C.seed, seedLabel],
    [C.impact, '충격 지점 씨앗'],
  ];
  // 상자 크기·글자 (실제 px): 폭 250, 제목 24, 항목 22, 줄 간격 34
  // 위치: 오른쪽 가운데 (유리와 같은 높이) — 아래 버튼 줄과 떨어뜨려 답답하지 않게
  const W = 250, ROW = 34, PAD = 18, HEAD = 46;
  const H = HEAD + items.length * ROW + PAD;
  const bx = VIEW.W - 20 - W, by = Math.round(380 - H / 2);
  // 칼날 연장선이 범례 뒤로 비쳐 어수선하지 않게, 카드 아래에 배경색을 한 겹 깔아 줌
  ctx.fillStyle = 'rgba(30, 27, 48, 0.88)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, W, H, 16); else ctx.rect(bx, by, W, H);
  ctx.fill();
  drawCard(ctx, bx, by, W, H, 16);
  ctx.font = uiFontPx(700, 24);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text;
  ctx.fillText('원리 보기', bx + W / 2, by + HEAD / 2 + 4);
  items.forEach(([color, text], i) => {
    const y = by + HEAD + ROW / 2 + i * ROW;
    dot(ctx, { x: bx + PAD + 8, y }, 8, color);
    ctx.font = uiFontPx(500, 22);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.text;
    ctx.fillText(text, bx + PAD + 26, y);
  });
}
