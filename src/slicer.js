// slicer.js — F3. 직선 자르기 → 두 조각 물체 생성
//
// 자르는 시점 (과일닌자 방식: 들어갔다 나올 때 자름)
//   1. 칼날의 새 선분마다, 선분 AABB와 유리 body.bounds가 겹치는 유리만 후보 (넓은 범위 검사)
//   2. 후보 유리의 변들과 선분의 교점을 구함 (geometry.segmentPolygonHits)
//   3. 처음 만나면 진입점 기록 → 다른 변에서 다시 만나면 이탈점 → 진입점~이탈점 직선으로 자름
//      (한 선분이 두 변을 지나가면 진입·이탈을 한 번에 처리)
//   4. 칼날을 떼거나 너무 오래(ENTRY_TIMEOUT) 안에 있으면 진입 기록 취소
//
// 진입점은 유리의 "로컬 좌표"(유리 중심 기준, 회전 전)로 저장한다.
// 유리는 그 사이에도 날아가고 돌기 때문에, 화면 좌표로 저장하면 이탈할 때쯤엔 엉뚱한 곳을 가리킨다.
//   로컬 = rotate(월드 − 중심, −각도),   월드 = 중심 + rotate(로컬, 각도)

import { SLICE, BLADE, SCORE } from './config.js';
import { shatterBody } from './shatter.js';
import {
  sub, add, rotate, segmentPolygonHits, splitConvexPolygon, polygonArea, polygonCentroid,
} from './geometry.js';

const { Bodies, Body, Composite } = Matter;

const GLASS_GROUP = -1; // physics.js와 같은 값: 유리끼리 충돌하지 않음

export function createSlicer() {
  // body.id → { local: 진입점(로컬 좌표), edge: 진입한 변 번호, t: 진입 시각 }
  const entries = new Map();

  function toLocal(body, p) { return rotate(sub(p, body.position), -body.angle); }
  function toWorld(body, p) { return add(body.position, rotate(p, body.angle)); }

  // 같은 칼질이 이어지면서 방금 생긴 조각을 곧바로 또 자르지 않도록 쿨다운을 둔다
  // (조각의 잘린 변이 칼날 바로 앞에 있어서, 쿨다운이 없으면 한 번 휘두를 때 여러 번 잘린다)
  function cuttable(body, t) {
    const g = body.plugin.glass;
    return g && g.generation < SLICE.MAX_GENERATION && t >= (g.cuttableAt || 0);
  }

  return {
    entries,

    cancelAll() { entries.clear(); },

    // 이번 프레임의 칼날 선분들로 자르기. 일어난 자르기(또는 산산조각) 목록을 돌려준다.
    // speed = 칼날 속도(px/s, F2). 기준보다 느리면 자르지 않고 진입 기록도 지운다.
    // gameNow = 게임 시계 (조각 쿨다운·파편 수명·자른 시각). 진입 기록 시간 제한은 칼날 시각(seg.t)으로.
    // entryTimeout = 들어간 뒤 이 시간 안에 안 나오면 진입 취소 (원리 보기 화면은 길게)
    // seedMode = 산산조각 날 때 씨앗 방식 ('poisson' 기본, 원리 보기 화면에서 'random'을 고를 수 있음)
    update(engine, bodies, segments, speed, gameNow, entryTimeout = SLICE.ENTRY_TIMEOUT_S, seedMode = 'poisson') {
      const cuts = [];
      if (speed < BLADE.MIN_SPEED) { entries.clear(); return cuts; }

      for (const seg of segments) {
        // 오래된 진입 기록 취소
        for (const [id, e] of entries) if (seg.t - e.t > entryTimeout) entries.delete(id);

        const minX = Math.min(seg.a.x, seg.b.x), maxX = Math.max(seg.a.x, seg.b.x);
        const minY = Math.min(seg.a.y, seg.b.y), maxY = Math.max(seg.a.y, seg.b.y);

        for (const body of bodies) {
          if (body.plugin.removed || !cuttable(body, gameNow)) continue;
          // 넓은 범위 검사: AABB끼리 겹치지 않으면 변 검사를 할 필요가 없다
          const bb = body.bounds;
          if (maxX < bb.min.x || minX > bb.max.x || maxY < bb.min.y || minY > bb.max.y) continue;

          const hits = segmentPolygonHits(seg.a, seg.b, body.vertices);
          for (const hit of hits) {
            const e = entries.get(body.id);
            if (!e || e.edge === hit.edge) {
              // 첫 진입 (같은 변으로 다시 나갔다 들어오면 진입을 새로 기록)
              entries.set(body.id, { local: toLocal(body, hit.point), edge: hit.edge, t: seg.t });
              continue;
            }
            // 이탈: 진입점(현재 위치로 되돌린 것) → 이탈점 직선으로 자른다
            entries.delete(body.id);
            const A = toWorld(body, e.local);
            const B = hit.point;
            // 먼저 이 직선으로 자르면 넓이가 몇 : 몇이 되는지 계산 (신발끈 공식)
            const g = body.plugin.glass;
            const ratio = splitRatio(body, A, B);
            if (ratio === null) continue;
            // F4. 거의 정확히 반(≥ HALF_RATIO)이면 → 산산조각 (보상). 폭탄은 언제나 터짐.
            //     파편화에 실패하면 그냥 두 조각으로 자른다.
            let cut = null;
            if (g.bomb || ratio >= SCORE.HALF_RATIO) cut = shatterBody(engine, body, A, gameNow, Math.random, { seedMode });
            if (cut) Object.assign(cut, { ratio, A, B }); // F8: 파편화에도 자른 직선을 남김
            else cut = sliceBody(engine, body, A, B, gameNow);
            if (cut && g.bomb) cut.type = 'bomb';
            if (cut) { cuts.push(cut); break; }
          }
        }
        // 이번 선분에서 잘려 없어진 유리는 다음 선분의 후보에서 뺀다
        // (새 조각은 후보에 넣지 않음 — 다음 프레임부터, 그것도 쿨다운이 지나야 자를 수 있음)
        bodies = bodies.filter(b => !b.plugin.removed);
      }
      return cuts;
    },
  };
}

// 직선 A→B로 자르면 작은 조각 / 전체 넓이가 얼마인지 (물체는 건드리지 않음). 안 잘리면 null.
export function splitRatio(body, A, B) {
  const split = splitConvexPolygon(body.vertices.map(v => ({ x: v.x, y: v.y })), A, B);
  if (!split) return null;
  const l = polygonArea(split.left), r = polygonArea(split.right);
  return Math.min(l, r) / (l + r);
}

// 유리 한 장을 직선 A→B로 잘라 두 물체로 바꾼다. 자르지 못하면 null.
export function sliceBody(engine, body, A, B, time) {
  const poly = body.vertices.map(v => ({ x: v.x, y: v.y }));
  const split = splitConvexPolygon(poly, A, B);
  if (!split) return null;

  const g = body.plugin.glass;
  const areaL = polygonArea(split.left);
  const areaR = polygonArea(split.right);
  const total = areaL + areaR;

  // 자른 직선의 단위 법선 n = (−d_y, d_x)/|d|  — cross(d, n) > 0 이므로 left 쪽을 가리킨다
  const d = sub(B, A);
  const len = Math.hypot(d.x, d.y) || 1;
  const n = { x: -d.y / len, y: d.x / len };

  const pieces = [];
  const dust = [];  // 아주 작은 조각 자리 → main.js에서 반짝이 가루를 뿌림
  for (const [poly2, area, sign] of [[split.left, areaL, 1], [split.right, areaR, -1]]) {
    // 아주 작은 조각(MIN_PIECE_AREA 미만)도 갑자기 사라지면 버그처럼 보이므로
    // 파편처럼 서서히 사라지는 조각으로 남기고 반짝이 가루를 함께 뿌린다.
    // 넓이가 거의 0인 조각(선처럼 얇음)은 물체를 만들지 않고 가루만.
    const tiny = area < SLICE.MIN_PIECE_AREA;
    if (tiny) dust.push({ ...polygonCentroid(poly2), area });
    if (area < SLICE.MIN_BODY_AREA) continue;

    // 신발끈 공식으로 구한 무게중심에 새 물체를 놓는다.
    // (Bodies.fromVertices는 꼭짓점들을 무게중심이 (x, y)에 오도록 옮겨 놓으므로, 원래 자리 그대로가 됨)
    const C = polygonCentroid(poly2);
    const piece = Bodies.fromVertices(C.x, C.y, [poly2], {
      frictionAir: 0,
      collisionFilter: { group: GLASS_GROUP },
    });

    // 속도 이어받기: 원래 유리에서 그 점이 움직이던 속도 + 법선 방향으로 벌어지는 속도
    //   회전하는 물체 위 점의 속도 = v + ω × r,  2D에서 ω × r = (−ω·r_y, ω·r_x)
    const r = sub(C, body.position);
    const w = body.angularVelocity;
    Body.setVelocity(piece, {
      x: body.velocity.x - w * r.y + sign * n.x * SLICE.SEPARATION,
      y: body.velocity.y + w * r.x + sign * n.y * SLICE.SEPARATION,
    });
    Body.setAngularVelocity(piece, w + (Math.random() * 2 - 1) * SLICE.SPIN_JITTER);

    piece.plugin.glass = {
      color: g.color,
      peakTime: g.peakTime,
      generation: g.generation + 1,
      originalArea: g.originalArea,
      sliced: true,                          // 조각은 떨어져도 Miss가 아님
      cuttableAt: time + SLICE.PIECE_COOLDOWN_S,
      peak: { samples: [], measured: false }, // 조각은 꼭대기 실측 안 함
    };
    if (tiny) { piece.plugin.glass.fragment = true; piece.plugin.glass.born = time; } // 파편처럼 서서히 사라짐
    pieces.push(piece);
  }

  body.plugin.removed = true;
  Composite.remove(engine.world, body);
  Composite.add(engine.world, pieces);

  return {
    type: 'slice',
    time,                                   // 자른 시각 (오디오 시계) — F5 판정에 사용
    peakTime: g.peakTime,
    generation: g.generation,
    A, B,
    polygon: poly,
    left: split.left, right: split.right,
    side: split.side,                       // 꼭짓점별 외적 값 — F8 원리 보기용
    areaLeft: areaL, areaRight: areaR,
    ratio: Math.min(areaL, areaR) / total,  // 작은 조각 / 전체 — F6 "정확히 반!"
    centroids: [polygonCentroid(split.left), polygonCentroid(split.right)],
    pieces,
    dust,
    color: g.color,
  };
}
