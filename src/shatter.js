// shatter.js — F4. 포아송 + 보로노이 파편화
//
//   1. 유리 넓이 A → 최소 간격 r = √A / 3.5   (파편 약 8~16개)
//   2. 유리의 AABB 안에 poisson-disk-sampling으로 점을 고르게 뿌림 → 유리 안에 있는 점만 남김
//   3. 칼이 들어간 지점 근처에 씨앗 몇 개 추가 → 그 근처 파편이 더 잘게 부서짐
//   4. d3.Delaunay.from(점들).voronoi([AABB]) → 점마다 보로노이 칸 (그 점이 가장 가까운 영역)
//   5. 각 칸을 유리 다각형으로 클리핑 (geometry.clipConvexByConvex)
//   6. 파편마다 물체 생성, 충격 지점에서 바깥으로 튕겨 나가는 속도
//
// 오픈소스 사용: PoissonDiskSampling(전역, vendor/poisson-disk-sampling.min.js),
//               d3.Delaunay(전역, vendor/d3-delaunay.min.js — 내부에 Delaunator)

import { SHATTER, SLICE } from './config.js';
import {
  sub, lerp, polygonArea, polygonCentroid, pointInConvexPolygon, clipConvexByConvex,
} from './geometry.js';

const { Bodies, Body, Composite } = Matter;
const GLASS_GROUP = -1;

// 유리 다각형 poly 안의 파편 씨앗 점들 (포아송 + 충격 지점 근처 추가)
// seedMode: 'poisson'(기본) | 'random' — 원리 보기 화면에서 두 방법을 비교하려고 둠
// spacingDiv: 최소 간격 r = √A / spacingDiv (클수록 씨앗이 많아짐)
export function shatterSeeds(poly, impact, rand = Math.random, seedMode = 'poisson', spacingDiv = SHATTER.SPACING_DIV) {
  const A = polygonArea(poly);
  const r = Math.sqrt(A) / spacingDiv;

  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  const box = { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };

  // 포아송 디스크 표본화: 어떤 두 점도 r보다 가깝지 않으면서 빈틈없이 채움
  // (그냥 무작위로 뿌리면 뭉치고 비는 곳이 생겨 파편 크기가 들쭉날쭉)
  const pds = new PoissonDiskSampling({
    shape: [box.maxX - box.minX, box.maxY - box.minY],
    minDistance: r,
    maxDistance: r * 2,
    tries: SHATTER.POISSON_TRIES,
  }, rand);
  let poisson = pds.fill()
    .map(([x, y]) => ({ x: box.minX + x, y: box.minY + y }))
    .filter(p => pointInConvexPolygon(p, poly));

  // 비교용 무작위 모드: 포아송과 "같은 개수"를 아무렇게나 찍음 (개수를 맞춰야 뿌리는 방법의 차이만 비교됨).
  // 이 경우 poisson 배열에 무작위 씨앗이 들어감.
  if (seedMode === 'random') poisson = randomSeeds(poly, box, poisson.length, rand);

  // 충격 지점 근처 씨앗: 충격 지점을 무게중심 쪽으로 조금 들인 뒤 흩뿌림 (유리 안인 것만)
  const C = polygonCentroid(poly);
  const center = lerp(impact, C, 0.15);
  const extra = [];
  for (let i = 0; i < SHATTER.IMPACT_SEEDS; i++) {
    const ang = rand() * 2 * Math.PI, dist = rand() * r * SHATTER.IMPACT_JITTER;
    const p = { x: center.x + Math.cos(ang) * dist, y: center.y + Math.sin(ang) * dist };
    if (pointInConvexPolygon(p, poly)) extra.push(p);
  }
  return { poisson, extra, box, r };
}

// 유리 AABB 안에 아무렇게나 점을 찍고 유리 안에 든 것만 n개 모음 (거절 표본화)
export function randomSeeds(poly, box, n, rand = Math.random) {
  const pts = [];
  while (pts.length < n) {
    const p = { x: box.minX + rand() * (box.maxX - box.minX), y: box.minY + rand() * (box.maxY - box.minY) };
    if (pointInConvexPolygon(p, poly)) pts.push(p);
  }
  return pts;
}

// 나란히 비교용: 같은 유리에 같은 개수의 씨앗을 포아송 / 무작위로 뿌려 각각 파편을 만든다.
// (충격 지점 씨앗은 넣지 않음 — 뿌리는 방법의 차이만 보이도록)
// spacingDiv를 게임보다 크게 하면 씨앗이 많아져 뭉침·빈 곳 차이가 더 잘 보임
export function seedComparison(poly, rand = Math.random, spacingDiv = SHATTER.SPACING_DIV) {
  const { poisson, box, r } = shatterSeeds(poly, polygonCentroid(poly), rand, 'poisson', spacingDiv);
  const random = randomSeeds(poly, box, poisson.length, rand);
  return {
    poly, box, r,
    poisson: { seeds: poisson, fragments: voronoiFragments(poly, poisson, box).fragments },
    random: { seeds: random, fragments: voronoiFragments(poly, random, box).fragments },
  };
}

// 씨앗 점들 → 보로노이 칸 → 유리로 클리핑한 파편 다각형들
export function voronoiFragments(poly, seeds, box) {
  const pts = seeds.map(p => [p.x, p.y]);
  const voronoi = d3.Delaunay.from(pts).voronoi([box.minX, box.minY, box.maxX, box.maxY]);
  const cells = [], fragments = [], fragmentSeed = []; // fragmentSeed[k] = k번째 파편을 만든 씨앗 번호
  for (let i = 0; i < pts.length; i++) {
    const ring = voronoi.cellPolygon(i); // [[x,y], ..., 처음 점 반복]
    if (!ring) continue;
    const cell = ring.slice(0, -1).map(([x, y]) => ({ x, y }));
    cells.push(cell);
    const frag = clipConvexByConvex(cell, poly);
    if (frag && polygonArea(frag) >= SHATTER.MIN_FRAGMENT_AREA) { fragments.push(frag); fragmentSeed.push(i); }
  }
  return { cells, fragments, fragmentSeed };
}

// 유리 한 장을 산산조각 낸다. impact = 칼이 들어간 지점(월드 좌표). 실패하면 null.
export function shatterBody(engine, body, impact, time, rand = Math.random, { seedMode = 'poisson' } = {}) {
  const poly = body.vertices.map(v => ({ x: v.x, y: v.y }));
  const { poisson, extra, box, r } = shatterSeeds(poly, impact, rand, seedMode);
  const seeds = poisson.concat(extra);
  if (seeds.length < 3) return null;
  const { cells, fragments, fragmentSeed } = voronoiFragments(poly, seeds, box);
  if (fragments.length < 2) return null;

  const g = body.plugin.glass;
  const bodies = [];
  for (const frag of fragments) {
    const C = polygonCentroid(frag);
    const piece = Bodies.fromVertices(C.x, C.y, [frag], {
      frictionAir: 0,
      collisionFilter: { group: GLASS_GROUP },
    });
    // 속도 = 원래 유리에서 그 점의 속도(v + ω × r) + 충격 지점 → 파편 무게중심 방향으로 튕김
    const rr = sub(C, body.position);
    const w = body.angularVelocity;
    const out = sub(C, impact);
    const len = Math.hypot(out.x, out.y) || 1;
    const k = SHATTER.BURST * (0.6 + 0.8 * rand());
    Body.setVelocity(piece, {
      x: body.velocity.x - w * rr.y + (out.x / len) * k,
      y: body.velocity.y + w * rr.x + (out.y / len) * k,
    });
    Body.setAngularVelocity(piece, (rand() * 2 - 1) * SHATTER.SPIN);
    piece.plugin.glass = {
      color: g.color,
      bomb: !!g.bomb,                   // 폭탄 파편은 폭탄 색 테두리로 그림 (X 표시는 없음)
      peakTime: g.peakTime,
      generation: SLICE.MAX_GENERATION, // 파편은 다시 자를 수 없음
      originalArea: g.originalArea,
      sliced: true,
      fragment: true,
      born: time,                       // 서서히 사라지기 시작한 시각
      peak: { samples: [], measured: false },
    };
    bodies.push(piece);
  }

  body.plugin.removed = true;
  Composite.remove(engine.world, body);
  Composite.add(engine.world, bodies);

  return {
    type: 'shatter',
    time,
    peakTime: g.peakTime,
    generation: g.generation,
    impact,
    polygon: poly,
    r,
    seedMode,                // 'poisson' | 'random'
    poisson, extra,          // F8: 씨앗 점 표시용 (poisson = 주 씨앗, 무작위 모드면 무작위 씨앗)
    cells,                   // F8: 보로노이 칸 경계 표시용
    fragments,
    fragmentSeed,            // 파편마다 어느 씨앗에서 나왔나 (앞쪽 poisson.length개가 주 씨앗)
    pieces: bodies,
  };
}

// 다 사라진 파편 제거 + 최대 개수 제한 (오래된 것부터)
export function updateFragments(engine, bodies, now) {
  const frags = bodies.filter(b => b.plugin.glass && b.plugin.glass.fragment);
  const dead = new Set(frags.filter(b => now - b.plugin.glass.born >= SHATTER.LIFE_S));
  const alive = frags.filter(b => !dead.has(b)).sort((a, b) => a.plugin.glass.born - b.plugin.glass.born);
  for (let i = 0; i < alive.length - SHATTER.MAX_FRAGMENTS; i++) dead.add(alive[i]);
  for (const b of dead) Composite.remove(engine.world, b);
  return dead.size;
}

// 파편의 남은 불투명도 (1 → 0, 선형)
export function fragmentAlpha(body, now) {
  const g = body.plugin.glass;
  if (!g.fragment) return 1;
  return Math.max(0, 1 - (now - g.born) / SHATTER.LIFE_S);
}
