// physics.js — Matter.js 엔진 설정, 유리 생성·발사, 화면 밖 제거
// Matter.js(vendor/matter.min.js)는 엔진(적분·충돌)만 쓰고, 그리기는 render.js에서 직접 한다.

import { PHYSICS, LAUNCH, VIEW, THEME } from './config.js';
import { randomConvexPolygon, polygonArea } from './geometry.js';

const { Engine, Bodies, Body, Composite } = Matter;

const DT = PHYSICS.DT_MS;          // ms
const DT_S = DT / 1000;            // s

// 유리끼리는 서로 부딪히지 않게 (부딪히면 궤도가 바뀌어 꼭대기 타이밍이 어긋남)
// Matter.js 규칙: 같은 음수 group끼리는 충돌하지 않는다.
const GLASS_GROUP = -1;

export function createEngine() {
  const engine = Engine.create();
  engine.gravity.y = PHYSICS.GRAVITY_Y;
  engine.gravity.scale = PHYSICS.GRAVITY_SCALE;
  return engine;
}

export function stepPhysics(engine) {
  Engine.update(engine, DT);
}

export function glassBodies(engine) {
  return Composite.allBodies(engine.world).filter(b => b.plugin && b.plugin.glass);
}

// ── F1. 꼭대기 높이·시각에서 발사 속도 역산 ─────────────────────────
//
// 한 스텝당 중력 가속도:  a = gravity.y × gravity.scale × Δt²   (기본값 ≈ 0.278 px/step²)
//
// Matter.js는 매 스텝 "속도 += a, 위치 += 속도" 순서로 적분한다 (Verlet 계열, frictionAir = 0일 때).
// 처음 속도를 v₀(위쪽이 음수)라 하면 k스텝 뒤 위치는
//     y(k) = y₀ + Σ_{j=1..k} (v₀ + j·a) = y₀ + k·v₀ + a·k(k+1)/2
// k에 대한 포물선이고, 꼭짓점(꼭대기)은 dy/dk = 0 인 곳:
//     k* = −v₀/a − ½        ,   올라간 높이  H = a·k*² / 2
// 따라서 높이 H, 꼭대기까지 스텝 수 k*를 정하면
//     k* = √(2H / a)
//     v₀ = −a·(k* + ½)
//     꼭대기 시각 = 발사 시각 + k*·Δt
// (연속 시간 공식 v₀ = −a·k* 와 비교하면 ½·a 만큼 차이 — 이산 적분 보정항)

export function gravityPerStep(engine) {
  return engine.gravity.y * engine.gravity.scale * DT * DT;
}

export function stepsToPeak(a, height) {
  return Math.sqrt((2 * height) / a);
}

export function launchVelocityY(a, kPeak) {
  return -a * (kPeak + 0.5);
}

// 발사 계획: 높이를 무작위로 정하면 꼭대기 시각이 정해진다.
// note = { launchTime, xMin?, xMax?, heightMin?, heightMax?, bomb? }  (spawner.js·제목 화면 연습이 만듦)
//   꼭대기 시각 = 발사 시각 + k*·Δt   (k* = √(2H/a))
export function planLaunch(engine, note, rand = Math.random) {
  const xMin = note.xMin ?? LAUNCH.PEAK_X_MIN, xMax = note.xMax ?? LAUNCH.PEAK_X_MAX;
  const a = gravityPerStep(engine);
  const hMin = note.heightMin ?? LAUNCH.PEAK_HEIGHT_MIN, hMax = note.heightMax ?? LAUNCH.PEAK_HEIGHT_MAX;
  const height = hMin + rand() * (hMax - hMin);
  const kPeak = stepsToPeak(a, height);
  return {
    peakTime: note.launchTime + kPeak * DT_S,
    launchTime: note.launchTime,
    peakX: xMin + rand() * (xMax - xMin),
    vx: (rand() * 2 - 1) * LAUNCH.VX_MAX,
    bomb: !!note.bomb,
  };
}

// 실제 발사. 물리는 스텝 단위로만 진행하므로 발사 시각이 계획보다 최대 한 스텝 늦을 수 있다.
// → 실제 발사 시각(simTime) 기준으로 k*를 다시 계산해서 꼭대기 시각은 정확히 peakTime에 맞춘다
//   (원래 리듬 게임용으로 비트에 꼭대기를 맞추던 계산 — 지금은 꼭대기에서 잠깐 멈칫하는 순간이 베기 좋은 때)
//   (대신 높이가 아주 조금 낮아짐).
export function launchGlass(engine, plan, simTime, rand = Math.random) {
  const a = gravityPerStep(engine);
  const kPeak = Math.max(1, (plan.peakTime - simTime) / DT_S);
  const vy = launchVelocityY(a, kPeak);

  // 가로 속도는 일정 → k*스텝 뒤 x = x₀ + vx·k*  ⇒  x₀ = peakX − vx·k*
  const x0 = plan.peakX - plan.vx * kPeak;
  const y0 = LAUNCH.SPAWN_Y;

  const radius = LAUNCH.RADIUS_MIN + rand() * (LAUNCH.RADIUS_MAX - LAUNCH.RADIUS_MIN);
  const body = createGlass(engine, x0, y0, radius, { bomb: plan.bomb, peakTime: plan.peakTime, rand });
  Body.setVelocity(body, { x: plan.vx, y: vy });
  Body.setAngularVelocity(body, (rand() * 2 - 1) * LAUNCH.ANGULAR_VEL_MAX);
  return body;
}

// 유리 한 장을 (x, y)에 반지름 radius로 만들어 세계에 넣는다 (속도 0). 발사·원리 보기 화면이 같이 씀.
export function createGlass(engine, x, y, radius, { bomb = false, peakTime = 0, rand = Math.random } = {}) {
  const sides = LAUNCH.SIDES_MIN + Math.floor(rand() * (LAUNCH.SIDES_MAX - LAUNCH.SIDES_MIN + 1));
  const poly = randomConvexPolygon(x, y, radius, sides, LAUNCH.ANGLE_JITTER, rand);

  // 볼록 다각형이므로 poly-decomp 없이 그대로 한 물체가 된다 (무게중심이 (x, y)에 오도록 이동됨)
  const body = Bodies.fromVertices(x, y, [poly], {
    frictionAir: 0,                       // 공기 저항이 있으면 꼭대기 타이밍이 어긋남
    collisionFilter: { group: GLASS_GROUP },
  });
  body.plugin.glass = {
    color: bomb ? THEME.bomb : THEME.glass[Math.floor(rand() * THEME.glass.length)],
    bomb,                                 // 폭탄 유리: 베면 생명 −1, 떨어뜨려도 Miss 아님
    peakTime,
    generation: 0,                        // 자른 횟수 (원본 0, 조각 1 — 조각은 다시 자를 수 없음)
    originalArea: polygonArea(poly),
    sliced: false,
    peak: { samples: [], measured: null }, // 실측용
  };
  Composite.add(engine.world, body);
  return body;
}

// ── 꼭대기 도달 시각 실측 (보정 확인용) ─────────────────────────
// ※ 지금 게임에서는 호출하지 않음. 리듬 게임 시절 발사 공식 v₀ = −a(k* + ½)가 맞는지 검증하는 데 썼고
//   (실측 오차 ≈ 0ms), PDF "막혔던 것과 해결"의 근거로 남겨 둠. 콘솔에서 직접 불러 다시 잴 수 있다.
// 매 스텝 (시각, y)를 기록하다가 y가 다시 커지기 시작하면(내려가기 시작),
// 마지막 세 점에 포물선을 맞춰 꼭짓점 시각을 구한다 (포물선 보간):
//     offset = (y₀ − y₂) / (2·(y₀ − 2y₁ + y₂))   (가운데 점 기준, 스텝 단위)
// 공식과 무관하게 Matter.js가 실제로 움직인 위치만으로 재기 때문에 검증이 된다.
export function trackPeaks(engine, simTime, onPeak) {
  for (const body of glassBodies(engine)) {
    const g = body.plugin.glass;
    if (g.peak.measured !== null) continue;
    const s = g.peak.samples;
    s.push({ t: simTime, y: body.position.y });
    if (s.length > 3) s.shift();
    if (s.length < 3) continue;
    const [p0, p1, p2] = s;
    if (p2.y > p1.y && p1.y <= p0.y) {
      const denom = p0.y - 2 * p1.y + p2.y;
      const offset = denom !== 0 ? (p0.y - p2.y) / (2 * denom) : 0;
      const tPeak = p1.t + offset * DT_S;
      g.peak.measured = tPeak;
      g.peak.samples = [];
      onPeak && onPeak(body, tPeak - g.peakTime);
    }
  }
}

// 화면 아래로 떨어진 유리 제거. 제거된 물체 목록을 돌려준다 (안 벤 유리 → Miss는 F5에서).
export function removeOffscreen(engine) {
  const removed = [];
  for (const body of glassBodies(engine)) {
    const falling = body.velocity.y > 0;
    const below = body.bounds.min.y > VIEW.H + LAUNCH.REMOVE_MARGIN;
    const side = body.bounds.max.x < -LAUNCH.REMOVE_MARGIN || body.bounds.min.x > VIEW.W + LAUNCH.REMOVE_MARGIN;
    if ((falling && below) || side) {
      Composite.remove(engine.world, body);
      removed.push(body);
    }
  }
  return removed;
}
