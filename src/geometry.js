// geometry.js — ★ 순수 기하 함수 모음 (발표에서 직접 설명하는 원리의 핵심)
// 모든 함수는 입력만 보고 결과를 돌려준다 (전역 상태·Matter.js에 의존하지 않음).
// 점은 {x, y}, 다각형은 점 배열 [{x,y}, ...] (꼭짓점 순서대로).
//

// ── 벡터 기본 ─────────────────────────────────────────

export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
export function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }

// 2D 외적: cross(a, b) = a.x·b.y − a.y·b.x
// 부호로 b가 a의 왼쪽(+)인지 오른쪽(−)인지 알 수 있다. (화면 좌표는 y가 아래로 커지므로 눈으로 보면 반대)
export function cross(a, b) { return a.x * b.y - a.y * b.x; }

// 선형보간: lerp(a, b, t) = a + (b − a)·t   (t=0 → a, t=1 → b)
export function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// 점 p를 원점 기준으로 angle(rad)만큼 회전: (x cosθ − y sinθ, x sinθ + y cosθ)
export function rotate(p, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

// ── 선분 교차 ──────────────────────────────────────────

// 선분 P(t) = p1 + t·r (r = p2 − p1)  와  Q(u) = q1 + u·s (s = q2 − q1) 의 교점.
// p1 + t·r = q1 + u·s 의 양변에 s, r을 각각 외적하면 (자기 자신과의 외적은 0)
//     t = cross(q1 − p1, s) / cross(r, s)
//     u = cross(q1 − p1, r) / cross(r, s)
// 0 ≤ t ≤ 1 이고 0 ≤ u ≤ 1 이면 두 선분이 만난다. cross(r, s) = 0 이면 평행 → 교점 없음으로 처리.
export function segmentIntersection(p1, p2, q1, q2) {
  const r = sub(p2, p1), s = sub(q2, q1);
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12) return null;
  const qp = sub(q1, p1);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u, point: lerp(p1, p2, t) };
}

// 선분 a→b 가 다각형의 변들과 만나는 점 전부를 a에서 가까운 순(t 오름차순)으로.
// edge = 만난 변의 번호 (변 i = poly[i] → poly[i+1])
export function segmentPolygonHits(a, b, poly) {
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const h = segmentIntersection(a, b, poly[i], poly[(i + 1) % poly.length]);
    if (h) hits.push({ t: h.t, point: h.point, edge: i });
  }
  return hits.sort((h1, h2) => h1.t - h2.t);
}

// ── 볼록 다각형을 직선으로 둘로 자르기 ─────────────────
//
// 직선 A→B 에 대해 각 꼭짓점의 "쪽 값"  s_i = cross(B − A, v_i − A)
//   s_i > 0 : 한쪽(left),  s_i < 0 : 반대쪽(right),  s_i = 0 : 직선 위 (양쪽 모두에 넣음)
// 변 v_i → v_{i+1} 을 따라 돌면서
//   - v_i 를 자기 쪽 목록에 넣고
//   - s_i 와 s_{i+1} 의 부호가 다르면(s_i·s_{i+1} < 0) 변이 직선을 가로지르므로
//     교점 P = lerp(v_i, v_{i+1}, t),  t = s_i / (s_i − s_{i+1})  를 **양쪽 목록에 모두** 넣는다.
//     (s 는 v_i 에서 v_{i+1} 로 갈 때 직선 거리에 비례해 일정하게 변하므로, s = 0 이 되는 비율이 t)
// 볼록 다각형은 직선과 많아야 두 번 만나므로 결과는 항상 볼록 다각형 두 개.
// 한쪽이 비면(직선이 다각형을 지나지 않음) null.
export function splitConvexPolygon(poly, A, B) {
  const d = sub(B, A);
  const side = poly.map(v => cross(d, sub(v, A)));
  const left = [], right = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const si = side[i], sj = side[j];
    if (si >= 0) left.push(poly[i]);
    if (si <= 0) right.push(poly[i]);
    if (si * sj < 0) {
      const P = lerp(poly[i], poly[j], si / (si - sj));
      left.push(P);
      right.push(P);
    }
  }
  if (left.length < 3 || right.length < 3) return null;
  return { left, right, side };
}

// ── 볼록 다각형 안 판정 ─────────────────────────────────
//
// 볼록 다각형의 변을 차례로 따라 돌면, 안쪽 점은 항상 "같은 쪽"에 있다.
// 즉 모든 변 v_i → v_{i+1} 에 대해  cross(v_{i+1} − v_i, p − v_i)  의 부호가 전부 같으면 안쪽.
// (꼭짓점이 시계 방향이든 반시계 방향이든 상관없이 "부호가 섞이지 않았는가"만 본다)
export function pointInConvexPolygon(p, poly) {
  let pos = false, neg = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = cross(sub(b, a), sub(p, a));
    if (c > 0) pos = true;
    if (c < 0) neg = true;
    if (pos && neg) return false;
  }
  return true;
}

// ── 볼록 클리핑 (Sutherland–Hodgman) ───────────────────
//
// subject 다각형을 볼록 다각형 clip 안쪽만 남기고 잘라낸다.
// clip의 각 변을 "무한히 긴 직선"으로 보고, 그 안쪽 반평면으로 subject를 한 번씩 자른다.
// 한 번 자르는 규칙 (subject의 변 S→E를 차례로 따라가며):
//   S가 안쪽(경계 포함)이면        → S 추가
//   S와 E가 경계의 서로 반대쪽이면 → 교점 추가
// (교과서의 4가지 경우 표 "안→안: E / 안→밖: 교점 / 밖→안: 교점, E / 밖→밖: 없음"과 같은 결과를
//  시작점 S 기준으로 정리한 것 — 다음 변에서 그 E가 S가 되어 추가된다)
// 안/밖은 외적 부호 cross(변 방향, 점 − 변 시작)로 판정하고, 교점은 splitConvexPolygon과 같은
// 선형보간 t = s_S / (s_S − s_E).  clip의 꼭짓점 방향(시계/반시계)은 부호 있는 넓이로 맞춘다.
// 볼록 ∩ 볼록 = 볼록 → 보로노이 칸(볼록)을 유리(볼록)로 자른 파편도 항상 볼록.
export function clipConvexByConvex(subject, clip) {
  const orient = polygonSignedArea(clip) >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], d = sub(clip[(i + 1) % clip.length], a);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const S = input[j], E = input[(j + 1) % input.length];
      const sS = orient * cross(d, sub(S, a));
      const sE = orient * cross(d, sub(E, a));
      if (sS >= 0) out.push(S);                                  // S가 안쪽이면 S를 넣고
      if (sS * sE < 0) out.push(lerp(S, E, sS / (sS - sE)));     // 경계를 넘으면 교점
    }
  }
  return out.length >= 3 ? out : null;
}

// ── 넓이와 무게중심 (신발끈 공식) ──────────────────────

// 부호 있는 넓이: A = ½ Σ (x_i·y_{i+1} − x_{i+1}·y_i)
// 꼭짓점 순서가 반대면 부호가 바뀐다. 넓이 자체는 Math.abs로.
export function polygonSignedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export function polygonArea(poly) { return Math.abs(polygonSignedArea(poly)); }

// 무게중심: C_x = 1/(6A) Σ (x_i + x_{i+1})(x_i·y_{i+1} − x_{i+1}·y_i), C_y도 같은 방식
// (A는 부호 있는 넓이 — 꼭짓점 순서와 상관없이 맞는 값이 나온다)
export function polygonCentroid(poly) {
  const A = polygonSignedArea(poly);
  let cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const c = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  return { x: cx / (6 * A), y: cy / (6 * A) };
}

// ── 유리 모양 만들기 ───────────────────────────────────

// 원 위의 점들을 각도 순서대로 이으면 항상 볼록 다각형이 된다.
// 정n각형의 각 꼭짓점 각도 θ_i = 2πi/n 에 ±(jitter × 간격/2) 만큼 흔들어
// "약간 불규칙한 볼록 다각형"을 만든다. jitter < 1이면 각도 순서가 뒤바뀌지 않아 볼록 유지.
// rand: 0~1 난수 함수 (테스트할 때 고정 난수를 넣을 수 있게 인자로 받음)
export function randomConvexPolygon(cx, cy, radius, sides, jitter, rand = Math.random) {
  const step = (2 * Math.PI) / sides;
  const start = rand() * 2 * Math.PI;
  const poly = [];
  for (let i = 0; i < sides; i++) {
    const theta = start + i * step + (rand() - 0.5) * jitter * step;
    poly.push({ x: cx + radius * Math.cos(theta), y: cy + radius * Math.sin(theta) });
  }
  return poly;
}
