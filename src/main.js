// main.js — 게임 루프, 화면 상태(TITLE / PLAY / RESULT / LAB = 원리 보기 화면)
//
// 규칙: 무작위로 튀어나오는 도형을 베어 "얼마나 정확히 반으로 잘랐나"로 점수.
//       폭탄을 베거나 도형을 놓치면 생명 −1. 생명 3개를 모두 잃으면 GAME OVER (제한 시간 없음).
//       끝나면 최고 점수와 최장 시간(버틴 시간)을 각각 기록과 비교해 저장.
//
// 시계: 게임(PLAY/RESULT)은 AudioContext.currentTime 하나만 기준으로 쓴다.
//       일시정지는 오디오 장치를 멈춰(suspend) 이 시계 자체를 멈추는 방식.
//       제목 화면 연습과 원리 보기 화면은 점수가 없고 오디오가 아직 시작 전일 수 있어서 performance.now로 돈다.
//       (화면이 바뀔 때마다 칼날 궤적을 비워 두 시계가 섞이지 않게 한다)
// 물리: 고정 스텝(1000/60ms) + 누적기. 시계가 앞서간 만큼 스텝을 여러 번(또는 0번) 돌린다.
//      → 화면 주사율(60Hz/144Hz)과 무관하게 같은 궤도.

import { PHYSICS, BLADE, GAME, SCORE, VIEW, PRACTICE, LAUNCH, PARTICLES, FEEDBACK, THEME, LAB, DEV, IS_TOUCH } from './config.js';
import {
  createRenderer, drawBackground, drawGlass, drawBlade, drawPopups, drawTitle, drawHud, drawResult, drawDevText,
  drawPause, hitStartButton, hitButton, LAB_BUTTON, LAB_BUTTONS, COMPARE_FRESH, drawLab,
  HUD_BUTTONS, drawHudButtons, RESULT_BUTTONS, PAUSE_BUTTONS, TITLE_SOUND_BUTTON, drawSoundButton,
} from './render.js';
import { createBlade } from './blade.js';
import { createSlicer } from './slicer.js';
import { updateFragments, fragmentAlpha, shatterBody, seedComparison } from './shatter.js';
import { createEngine, stepPhysics, glassBodies, planLaunch, launchGlass, removeOffscreen, createGlass } from './physics.js';
import { createAudioClock } from './clock.js';
import { createSpawner } from './spawner.js';
import { sliceScore, ratioText, loadRecords, saveRecord } from './score.js';
import { polygonCentroid, randomConvexPolygon } from './geometry.js';
import { createDebug, drawSeedComparison } from './debug.js';
import { createSfx } from './sfx.js';
import { createParticles } from './particles.js';

const DT_S = PHYSICS.DT_MS / 1000;
const RESULT_INPUT_DELAY_S = 0.8; // 결과 화면이 뜨자마자 휘두르던 클릭으로 넘어가지 않게

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const clock = createAudioClock();

// LAB = 원리 보기 화면 (제목 화면의 "어떤 원리일까?" 버튼)
const State = { TITLE: 'TITLE', PLAY: 'PLAY', RESULT: 'RESULT', LAB: 'LAB' };

const game = {
  state: State.TITLE,
  paused: false,
  engine: createEngine(),
  simStart: 0,       // 물리 시계 시작 시각 (s)
  stepCount: 0,      // simTime = simStart + stepCount × Δt  (더해 가며 누적하면 오차가 쌓이므로 곱으로 계산)
  spawner: null,
  plans: [],         // 발사 대기 중인 계획 (launchTime 순)
  practiceNext: 0,   // 제목 화면 연습 유리가 다음에 나올 시각
  startTime: 0,      // 첫 도형이 나오는 시각
  resultAt: 0,       // 결과 화면이 뜬 시각 (입력 대기용)
  elapsed: 0,        // 이번 판에서 버틴 시간 (s) — 게임 시계 기준이라 일시정지 동안은 안 늘어남
  score: 0,
  records: loadRecords(),            // { score: 최고 점수, time: 최장 시간(초) } (브라우저에 저장)
  newRecord: { score: false, time: false },
  lives: GAME.LIVES,
  stats: newStats(), // 결과 화면용
  popups: [],        // 화면에 떠 있는 점수·Miss·폭탄 글자
  lastCut: null,     // 마지막 자르기 결과 (F8 원리 보기에서 사용)
  lastShatter: null, // 마지막 파편화 결과 (F8: 포아송 씨앗, 보로노이 칸 표시)
  releasePending: false, // 마우스를 뗐음 → 이번 프레임 선분까지 처리한 뒤 진입 기록 취소
  feedback: null,    // 마지막 폭탄·놓침 반응 { kind: 'BOMB'|'MISS', at } — 화면 흔들림·번쩍임
  labSeed: 1,        // 원리 보기 화면 유리 모양의 난수 시드 (같은 시드 = 같은 모양)
  labSeedMode: 'poisson', // 부숴 보기의 씨앗 방식: 'poisson' | 'random' (P 키)
  labCompare: null,  // 나란히 비교 중이면 그 데이터 (포아송·무작위 씨앗과 파편)
};

// 고정 시드 난수 (선형 합동 생성기): 같은 시드면 같은 유리 모양을 다시 만들 수 있음
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

// 지금 화면의 시계: 제목·원리 보기 화면(점수 없음)은 performance.now, 게임은 오디오 시계
function gameClock() {
  return game.state === State.TITLE || game.state === State.LAB ? performance.now() / 1000 : clock.now();
}

const blade = createBlade(gameClock);
const slicer = createSlicer();
const debug = createDebug(); // F8. 원리 보기 (원리 보기 화면에서만 켬)
const sfx = createSfx(clock); // 효과음 (M으로 끄기/켜기)
const particles = createParticles(); // 반짝이 가루

function newStats() {
  return { slices: 0, halves: 0, closes: 0, misses: 0, bombs: 0, bestRatio: 0, spawned: 0 };
}

function simTime() { return game.simStart + game.stepCount * DT_S; }

// 물리 세계를 새로 만들고 시계를 t0에 맞춤 (화면이 바뀔 때마다)
function resetWorld(t0) {
  blade.reset();
  slicer.cancelAll();
  debug.clear();
  game.engine = createEngine();
  game.simStart = t0;
  game.stepCount = 0;
  game.plans = [];
  game.popups = [];
  game.lastCut = null;
  game.lastShatter = null;
  game.feedback = null;
  particles.clear();
}

// ── 화면 전환 ─────────────────────────────────────
function enterTitle() {
  game.state = State.TITLE;
  game.paused = false;
  debug.on = false;
  const t0 = gameClock();
  resetWorld(t0);
  game.practiceNext = t0 + 0.4;
  clock.resume(); // 일시정지에서 나왔으면 효과음이 다시 나오게
}

// ── 원리 보기 화면 ───────────────────────────────
// 중력 없이 큰 유리 하나를 가운데 띄워 두고, 계산 그림을 켠 채로 천천히 잘라 볼 수 있게 한다.
function enterLab() {
  if (game.state !== State.TITLE) return;
  game.state = State.LAB;
  game.labCompare = null;
  resetWorld(gameClock());
  debug.on = true;
  clock.start(); // 효과음 (버튼 클릭 = 사용자 입력 안)
  labNewGlass();
}

// sameShape = true면 직전과 같은 모양 (씨앗 방식만 바꿔 같은 유리를 비교할 때)
function labNewGlass(sameShape = false) {
  if (!sameShape) game.labSeed = (Math.random() * 4294967296) >>> 0;
  for (const b of glassBodies(game.engine)) Matter.Composite.remove(game.engine.world, b);
  game.engine.gravity.y = 0;               // 떠 있게
  slicer.cancelAll();
  debug.clear();
  game.lastCut = null;     // 위쪽 설명 글이 이전 자르기·파편화 기준으로 남지 않게
  game.lastShatter = null;
  game.popups = [];
  particles.clear();
  const g = createGlass(game.engine, LAB.CENTER.x, LAB.CENTER.y, LAB.RADIUS, { rand: seededRandom(game.labSeed) });
  Matter.Body.setAngularVelocity(g, LAB.SPIN);
}

// "부숴 보기": 아직 안 잘린 유리를 가운데 조금 옆을 충격 지점으로 산산조각
function labShatter(now) {
  const g = glassBodies(game.engine).find(b => b.plugin.glass.generation === 0);
  if (!g) return;
  const impact = { x: g.position.x - LAB.RADIUS * 0.35, y: g.position.y };
  const cut = shatterBody(game.engine, g, impact, now, Math.random, { seedMode: game.labSeedMode });
  if (cut) labAfterCut(cut, now);
}

// ── 나란히 비교 (포아송 vs 무작위) ─────────────────
// 물리 없이 계산만으로: 같은 모양 유리에 같은 개수의 씨앗을 두 방식으로 뿌려 파편을 만든다.
// 양쪽 카드: 폭 520, 사이 40 (x 50~570, 610~1130), 색 막대는 그 오른쪽 가운데
const COMPARE_LAYOUT = { leftX: 310, rightX: 870, cy: 376, titleY: 170, statY: 552, barX: 1200, cardW: 520, cardTop: 140, cardH: 462 };
function labOpenCompare() {
  const rand = seededRandom((Math.random() * 4294967296) >>> 0);
  const sides = LAUNCH.SIDES_MIN + Math.floor(rand() * (LAUNCH.SIDES_MAX - LAUNCH.SIDES_MIN + 1));
  const poly = randomConvexPolygon(0, 0, LAB.COMPARE_RADIUS, sides, LAUNCH.ANGLE_JITTER, rand);
  game.labCompare = seedComparison(poly, rand, LAB.COMPARE_SPACING_DIV);
  slicer.cancelAll();
  blade.reset();
  game.popups = [];     // 원리 보기에서 남은 "44 : 56" 같은 글자가 비교 화면에 겹치지 않게
  particles.clear();
}
function labCloseCompare() {
  game.labCompare = null;
  labNewGlass(true);
}

// 씨앗 방식 바꾸기 (포아송 ↔ 무작위): 같은 모양의 유리를 다시 놓아 바로 비교할 수 있게
function labToggleSeedMode() {
  game.labSeedMode = game.labSeedMode === 'poisson' ? 'random' : 'poisson';
  labNewGlass(true);
}

// 잘린 조각·파편은 조금 벌어진 뒤 멈추게 (공기 저항), 계산 그림 기록, 비율 표시
function labAfterCut(cut, now) {
  for (const p of cut.pieces) p.frictionAir = LAB.PIECE_DRAG;
  if (cut.type === 'slice') game.lastCut = cut; else game.lastShatter = cut;
  debug.record(cut, now);
  if (cut.cells) sfx.shatter(); else sfx.slice(cut.ratio);
  if (cut.ratio != null && !cut.cells) {
    const c = polygonCentroid(cut.polygon);
    popup('SLICE', ratioText(cut.ratio), null, c.x, c.y - LAB.RADIUS - 20, now);
  }
}

function updateLab(now) {
  stepWorld(now, () => {}, () => {});
}

async function startPlay() {
  if (game.state !== State.TITLE) return;
  game.state = State.PLAY; // 중복 시작 방지 (start()가 비동기)
  // 오디오 시계가 켜지길 기다리는 사이에 프레임이 돌 수 있다. 이전 판의 출현기·종료 시각이 남아 있으면
  // 그 프레임에서 "시간 종료"로 판정돼 결과 화면에 멈추므로, 준비가 끝날 때까지 출현기를 비워 둔다
  // (frame은 출현기가 없으면 updatePlay를 건너뜀).
  game.spawner = null;
  const t0 = await clock.start();
  resetWorld(t0);
  game.paused = false;
  game.startTime = t0 + GAME.START_DELAY_S;
  game.spawner = createSpawner(game.startTime);
  game.score = 0;
  game.elapsed = 0;
  game.newRecord = { score: false, time: false };
  game.lives = GAME.LIVES;
  game.stats = newStats();
}

function endPlay(now, reason) {
  game.state = State.RESULT;
  game.resultAt = now;
  game.elapsed = Math.max(0, now - game.startTime);
  game.plans = [];
  slicer.cancelAll();
  // 기록 갱신: 최고 점수와 최장 시간을 따로
  game.newRecord = {
    score: game.score > game.records.score,
    time: Math.floor(game.elapsed) > Math.floor(game.records.time),
  };
  if (game.newRecord.score) { game.records.score = game.score; saveRecord('score', game.score); }
  if (game.newRecord.time) { game.records.time = Math.floor(game.elapsed); saveRecord('time', game.records.time); }
}

function resultReady() {
  return game.state === State.RESULT && clock.now() - game.resultAt >= RESULT_INPUT_DELAY_S;
}
function backToTitle() {
  if (!resultReady()) return;
  enterTitle();
}
// 결과 화면 "다시 시작": 처음 화면을 거치지 않고 바로 새 판
function restartFromResult() {
  if (!resultReady()) return;
  game.state = State.TITLE; // startPlay는 TITLE에서만 시작하므로
  startPlay();
}

// 일시정지: 오디오 시계를 멈추면 물리·출현·버틴 시간이 모두 멈춘다
async function togglePause() {
  if (game.state !== State.PLAY) return;
  if (!game.paused) {
    game.paused = true;
    blade.release();
    blade.reset();
    slicer.cancelAll();
    await clock.suspend();
  } else {
    await clock.resume();
    blade.reset();
    game.paused = false;
  }
}

// ── 점수·생명 ─────────────────────────────────────
function popup(kind, text, sub, x, y, now) {
  game.popups.push({ kind, text, sub, x, y, born: now });
}

function loseLife(now) {
  game.lives--;
  if (game.lives <= 0) endPlay(now, 'lives');
}

// 자르기 효과: 소리 + 작은 조각 자리 반짝이 + 폭탄이면 불꽃·흔들림
function cutEffects(cut, now) {
  if (cut.type === 'bomb') {
    sfx.bomb();
    const c = polygonCentroid(cut.polygon);
    particles.burst(c.x, c.y, PARTICLES.BOMB, THEME.bombEdge, now);
    game.feedback = { kind: 'BOMB', at: now };
  } else if (cut.type === 'shatter') sfx.shatter();
  else sfx.slice(cut.ratio);
  for (const d of cut.dust || []) particles.burst(d.x, d.y, PARTICLES.DUST, cut.color || THEME.spark, now);
}

// 자르기/산산조각/폭탄 결과 하나에 점수 또는 생명 반영
function scoreCut(cut, now) {
  const c = polygonCentroid(cut.polygon);
  const x = c.x, y = c.y - 50;
  cutEffects(cut, now);
  if (cut.type === 'bomb') {
    game.stats.bombs++;
    popup('BOMB', '폭탄!', '생명 −1', x, y, now);
    loseLife(now);
    return;
  }
  const s = sliceScore(cut.ratio);
  game.score += s.total;
  game.stats.slices++;
  game.stats.bestRatio = Math.max(game.stats.bestRatio, cut.ratio);
  if (s.half) {
    game.stats.halves++;
    popup('HALF', '정확히 반!', `${ratioText(cut.ratio)}  +${s.total}`, x, y, now);
  } else if (s.close) {
    game.stats.closes++;
    popup('CLOSE', '아깝다!', `${ratioText(cut.ratio)}  +${s.total}`, x, y, now);
  } else {
    popup('SLICE', `+${s.total}`, ratioText(cut.ratio), x, y, now);
  }
}

// 제목 화면 연습: 점수 없이 비율만 보여 줌
function practiceCut(cut, now) {
  const c = polygonCentroid(cut.polygon);
  const s = sliceScore(cut.ratio);
  cutEffects(cut, now);
  if (s.half) popup('HALF', '정확히 반!', ratioText(cut.ratio), c.x, c.y - 50, now);
  else if (s.close) popup('CLOSE', '아깝다!', ratioText(cut.ratio), c.x, c.y - 50, now);
  else popup('SLICE', ratioText(cut.ratio), null, c.x, c.y - 50, now);
}

// 화면에 떠 있는 아직 안 벤 원본 도형·폭탄 + 발사 대기 중인 것 (동시 출현 제한용)
function activeCount() {
  const flying = glassBodies(game.engine).filter(b => b.plugin.glass.generation === 0 && !b.plugin.glass.fragment).length;
  return flying + game.plans.length;
}

// 고정 스텝 물리. beforeStep(t)은 스텝 직전에(발사), onRemoved(body)는 화면 밖으로 나간 물체마다
function stepWorld(now, beforeStep, onRemoved) {
  let steps = 0;
  while (simTime() + DT_S <= now && steps < PHYSICS.MAX_STEPS_PER_FRAME) {
    beforeStep(simTime());
    stepPhysics(game.engine);
    game.stepCount++;
    for (const body of removeOffscreen(game.engine)) onRemoved(body);
    steps++;
  }
  // 탭이 숨겨졌다 돌아오는 등 크게 밀렸으면 따라잡지 않고 시계를 맞춤
  if (now - simTime() > PHYSICS.RESYNC_GAP_S) {
    game.stepCount = Math.floor((now - game.simStart) / DT_S);
  }
}

function updatePlay(now) {
  stepWorld(now, t => {
    // 새로 나올 물체 계획 → 발사 시각이 된 것 발사
    if (game.state !== State.PLAY) return;
    for (const note of game.spawner.due(t, activeCount())) game.plans.push(planLaunch(game.engine, note));
    game.plans.sort((p, q) => p.launchTime - q.launchTime);
    while (game.plans.length && game.plans[0].launchTime <= t) {
      launchGlass(game.engine, game.plans.shift(), t);
      game.stats.spawned++;
    }
  }, body => {
    // 베지 않은 원본 도형이 떨어지면 Miss → 생명 −1 (폭탄은 안 베는 게 정답이므로 Miss 아님)
    const g = body.plugin.glass;
    if (game.state === State.PLAY && !g.sliced && !g.bomb) {
      game.stats.misses++;
      sfx.miss();
      game.feedback = { kind: 'MISS', at: now };
      const x = Math.min(Math.max(body.position.x, 60), VIEW.W - 60);
      popup('MISS', 'Miss', '생명 −1', x, VIEW.H - 60, now);
      loseLife(now);
    }
  });
}

// 제목 화면: 연습용 유리가 낮게 떠오름 (폭탄 없음, 놓쳐도 아무 일 없음)
function updateTitle(now) {
  stepWorld(now, t => {
    if (t < game.practiceNext) return;
    if (activeCount() < PRACTICE.MAX_ACTIVE) {
      const x = LAUNCH.PEAK_X_MIN + Math.random() * (LAUNCH.PEAK_X_MAX - LAUNCH.PEAK_X_MIN);
      launchGlass(game.engine, planLaunch(game.engine, {
        launchTime: t, xMin: x, xMax: x, heightMin: PRACTICE.HEIGHT_MIN, heightMax: PRACTICE.HEIGHT_MAX,
      }), t);
    }
    game.practiceNext = t + PRACTICE.INTERVAL_S * (0.8 + Math.random() * 0.4);
  }, () => {});
}

// 모바일: 플레이 중 휴대폰을 세로로 돌리면 자동 일시정지 (세로 화면에는 "가로로 돌려 주세요" 안내가 덮임)
// 회전 이벤트는 브라우저마다 늦거나 빠지기도 해서 매 프레임 창 비율로 직접 확인
function pauseIfPortrait() {
  if (IS_TOUCH && window.innerHeight > window.innerWidth && game.state === State.PLAY && !game.paused) togglePause();
}

function frame() {
  pauseIfPortrait();
  const now = gameClock();
  const running = !game.paused;
  if (running) {
    if (game.state === State.TITLE) updateTitle(now);
    else if (game.state === State.LAB) updateLab(now);
    else if (game.spawner) updatePlay(now);
  }

  blade.prune();
  const bladeSpeed = blade.speed();
  const canCut = blade.down && bladeSpeed >= BLADE.MIN_SPEED; // 칼날 색 표시용
  // F3. 이번 프레임에 새로 그어진 칼날 선분들로 자르기 (플레이 중, 제목 화면 연습)
  //     마우스를 같은 프레임 안에 뗐어도 그 전에 그어진 선분은 자르기에 쓴다 (빠르게 튕기듯 벨 때)
  const segments = blade.takeSegments();
  if (running && game.state === State.LAB && !game.labCompare) {
    // 원리 보기: 속도 제한 없이(천천히 그어도) 자르고, 진입 기록도 오래 유지
    const speed = blade.down || segments.length ? Infinity : 0;
    for (const cut of slicer.update(game.engine, glassBodies(game.engine), segments, speed, now, LAB.ENTRY_TIMEOUT_S, game.labSeedMode)) {
      labAfterCut(cut, now);
    }
  } else if (running && (game.state === State.PLAY || game.state === State.TITLE)) {
    const practice = game.state === State.TITLE;
    for (const cut of slicer.update(game.engine, glassBodies(game.engine), segments, bladeSpeed, now)) {
      if (cut.type === 'slice') game.lastCut = cut;
      else game.lastShatter = cut;
      if (practice) practiceCut(cut, now); else scoreCut(cut, now);
      debug.record(cut, now);
      if (!practice && game.state !== State.PLAY) break; // 폭탄으로 생명이 다 떨어짐
    }
  }
  if (game.releasePending) { slicer.cancelAll(); game.releasePending = false; }
  if (running && game.state !== State.LAB) {   // 원리 보기 화면에서는 파편을 남겨 둠
    updateFragments(game.engine, glassBodies(game.engine), now); // F4. 다 사라졌거나 너무 많은 파편 제거
    game.popups = game.popups.filter(p => now - p.born < SCORE.POPUP_S);
  }
  if (running && game.state === State.LAB) game.popups = game.popups.filter(p => now - p.born < SCORE.POPUP_S);

  const ctx = renderer.ctx;
  const tVis = performance.now() / 1000; // 배경 물결·깜빡임 애니메이션용 (게임 시계와 무관)
  const bodies = glassBodies(game.engine); // 이번 프레임 그릴 물체 (한 번만 모음)
  // 폭탄·놓침 반응: 강도 k = (1 − 지난 시간/지속 시간)² 로 빠르게 잦아듦
  let shakeX = 0, shakeY = 0, flash = 0;
  const fb = game.feedback && FEEDBACK[game.feedback.kind];
  if (fb && !game.paused) {
    const t = now - game.feedback.at;
    if (t < fb.shakeS) {
      const k = (1 - t / fb.shakeS) ** 2;
      shakeX = (Math.random() * 2 - 1) * fb.shake * k;
      shakeY = (Math.random() * 2 - 1) * fb.shake * k;
    }
    if (t < fb.flashS) flash = fb.flash * (1 - t / fb.flashS) ** 2;
  }

  renderer.begin();
  drawBackground(ctx, tVis);
  if (game.state === State.TITLE) drawTitle(ctx, tVis, { records: game.records }); // 연습 유리는 제목 앞에
  ctx.save();
  ctx.translate(shakeX, shakeY);            // 배경은 두고 유리·글자만 흔들림
  const lab = game.state === State.LAB;
  const comparing = lab && game.labCompare;
  if (lab) drawLab(ctx, tVis, {
    shattered: !!game.lastShatter,
    shatteredMode: game.lastShatter ? game.lastShatter.seedMode : 'poisson',
    compare: !!comparing,
    cutDone: !!(game.lastCut || game.lastShatter),
    seedMode: game.labSeedMode,
  });
  if (comparing) drawSeedComparison(ctx, game.labCompare, COMPARE_LAYOUT);
  else for (const body of bodies) drawGlass(ctx, body, lab ? 1 : fragmentAlpha(body, now));
  particles.draw(ctx, now);
  drawPopups(ctx, game.popups, now, SCORE.POPUP_S);
  ctx.restore();
  if (flash > 0) {
    ctx.fillStyle = `rgba(${THEME.flash}, ${flash})`;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  }
  drawBlade(ctx, blade.points, lab ? blade.down : canCut);
  if (!comparing) debug.draw(ctx, {
    bodies,
    entries: slicer.entries,
    bladeTip: blade.down && blade.points.length ? blade.points[blade.points.length - 1] : null,
    now,
    persist: lab,
  });

  if (game.state === State.PLAY) {
    drawHud(ctx, {
      score: game.score,
      lives: game.lives,
      maxLives: GAME.LIVES,
      elapsed: Math.max(0, now - game.startTime),
    });
  }
  if (game.state === State.RESULT) {
    drawResult(ctx, {
      score: game.score,
      elapsed: game.elapsed,
      stats: game.stats,
      records: game.records,
      newRecord: game.newRecord,
      canContinue: now - game.resultAt >= RESULT_INPUT_DELAY_S,
    }, tVis);
  }
  if (DEV.SHOW_HUD && game.state === State.PLAY) {
    drawDevText(ctx, [
      `칼날 ${Math.round(bladeSpeed)} px/s ${canCut ? '· 자르기 가능' : `(기준 ${BLADE.MIN_SPEED})`} · 물체 ${glassBodies(game.engine).length}개`,
      game.lastCut ? `마지막 자르기 ${ratioText(game.lastCut.ratio)}` : '',
    ]);
  }
  if (game.paused) drawPause(ctx, tVis);
  else if (game.state === State.TITLE) drawSoundButton(ctx, TITLE_SOUND_BUTTON, sfx.muted); // 홈 화면 오른쪽 아래 음소거 버튼
  // 플레이 중: 왼쪽 위 아이콘 버튼 (일시정지 화면 위에도 보여서 ▶로 바로 계속할 수 있게)
  if (game.state === State.PLAY) drawHudButtons(ctx, { paused: game.paused, muted: sfx.muted });
  renderer.end();
  requestAnimationFrame(frame);
}

// ── 입력 ─────────────────────────────────────────
const toWorld = e => renderer.screenToWorld(e.clientX, e.clientY);

// 버튼을 누르면 "톡" 소리를 내고 동작. 처음 누를 때는 오디오가 아직 꺼져 있을 수 있어서
// 오디오를 켠 다음에 소리를 낸다 (버튼 클릭 = 사용자 입력이라 이 안에서 켤 수 있음).
function pressButton(action) {
  clock.start().then(() => sfx.click());
  action();
}

// 모바일: 게임을 시작할 때 전체 화면 + 가로 고정을 시도 (지원하지 않는 브라우저(iPhone Safari 등)는 조용히 넘어감)
// 전체 화면은 사용자 입력 안에서만 요청할 수 있어서 START 버튼을 누를 때 부른다
function enterMobileFullscreen() {
  if (!IS_TOUCH || document.fullscreenElement) return;
  const el = document.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
    .catch(() => {});
}

// 칼날은 손가락 하나만 따라간다 (두 번째 손가락이 닿아도 궤적이 끊기거나 튀지 않게)
let bladePointer = null;

canvas.addEventListener('pointerdown', e => {
  if (bladePointer !== null && e.pointerId !== bladePointer) return; // 이미 다른 손가락으로 베는 중
  canvas.setPointerCapture(e.pointerId); // 캔버스 밖으로 나가도 계속 추적
  const p = toWorld(e);
  if (game.state === State.PLAY) {
    // 일시정지 / 소리 아이콘 (일시정지 중에도 누를 수 있음)
    if (hitButton(HUD_BUTTONS.pause, p)) { pressButton(togglePause); return; }
    if (hitButton(HUD_BUTTONS.sound, p)) { sfx.toggleMute(); if (!sfx.muted) sfx.click(); return; }
  }
  if (game.paused) {
    // 일시정지 화면: 계속하기 / 처음으로
    if (hitButton(PAUSE_BUTTONS.resume, p)) pressButton(togglePause);
    else if (hitButton(PAUSE_BUTTONS.home, p)) pressButton(enterTitle);
    return;
  }
  if (game.state === State.RESULT) {
    if (!resultReady()) return;
    if (hitButton(RESULT_BUTTONS.home, p)) pressButton(backToTitle);
    else if (hitButton(RESULT_BUTTONS.retry, p)) pressButton(restartFromResult);
    return;
  }
  if (game.state === State.LAB && game.labCompare) {
    if (hitButton(LAB_BUTTONS.back, p)) { pressButton(labCloseCompare); return; }
    if (hitButton(COMPARE_FRESH, p)) { pressButton(labOpenCompare); return; }
    return; // 나란히 비교 화면에서는 칼질 없음
  }
  if (game.state === State.LAB) {
    if (hitButton(LAB_BUTTONS.back, p)) { pressButton(enterTitle); return; }
    if (hitButton(LAB_BUTTONS.fresh, p)) { pressButton(() => labNewGlass()); return; }
    if (hitButton(LAB_BUTTONS.shatter, p)) { pressButton(() => labShatter(gameClock())); return; }
    if (hitButton(LAB_BUTTONS.compare, p)) { pressButton(labOpenCompare); return; }
    if (hitButton(LAB_BUTTONS.seed, p)) { pressButton(labToggleSeedMode); return; }
  }
  if (game.state === State.TITLE) {
    if (hitStartButton(p)) { enterMobileFullscreen(); pressButton(startPlay); return; }
    if (hitButton(LAB_BUTTON, p)) { enterMobileFullscreen(); pressButton(enterLab); return; }
    if (hitButton(TITLE_SOUND_BUTTON, p)) { sfx.toggleMute(); if (!sfx.muted) clock.start().then(() => sfx.click()); return; }
    clock.start(); // 연습 중에도 효과음이 나도록 (사용자 입력 안에서만 오디오를 켤 수 있음)
  }
  bladePointer = e.pointerId;
  blade.press(p);
});
canvas.addEventListener('pointermove', e => {
  if (!blade.down || e.pointerId !== bladePointer) return;
  // 브라우저가 한 프레임 안의 이동을 합쳐 보내므로, 합쳐진 점들을 모두 꺼내 궤적을 촘촘하게
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) blade.add(toWorld(ev));
});
// 떼면 진입 기록 취소 — 단, 이번 프레임에 이미 그어진 선분은 먼저 처리한 뒤에 (frame에서)
const release = e => {
  if (e.pointerId !== bladePointer) return;
  bladePointer = null;
  blade.release();
  game.releasePending = true;
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

window.addEventListener('keydown', e => {
  if (game.state === State.LAB && game.labCompare) {
    // 나란히 비교: Esc·R·C 원리 보기로 돌아가기, N·Space 다시 섞기
    if (e.code === 'Escape' || e.code === 'KeyR' || e.code === 'KeyC') labCloseCompare();
    if (e.code === 'KeyN' || e.code === 'Space') { e.preventDefault(); labOpenCompare(); }
    if (e.code === 'KeyM') sfx.toggleMute();
    return;
  }
  if (game.state === State.LAB) {
    // 원리 보기 화면: Esc·R 돌아가기, N·Space 새 유리, B 부숴 보기, C 나란히 비교, P 씨앗 방식(포아송 ↔ 무작위)
    if (e.code === 'Escape' || e.code === 'KeyR') enterTitle();
    if (e.code === 'KeyC') labOpenCompare();
    if (e.code === 'KeyN' || e.code === 'Space') { e.preventDefault(); labNewGlass(); }
    if (e.code === 'KeyB') labShatter(gameClock());
    if (e.code === 'KeyP') labToggleSeedMode();
    if (e.code === 'KeyM') sfx.toggleMute();
    return;
  }
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (game.state === State.TITLE) startPlay();
    else if (game.paused) togglePause();
    else restartFromResult(); // 결과 화면: 다시 시작
  }
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyR') {
    if (game.paused) enterTitle(); // 일시정지 중 R → 결과 없이 처음으로
    else backToTitle();
  }
  if (e.code === 'KeyM') sfx.toggleMute();
});

// 다른 탭으로 가거나 창을 내리면 자동 일시정지
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === State.PLAY && !game.paused) togglePause();
});

// 모바일
if (IS_TOUCH) {
  // iPhone Safari는 pointerdown만으로는 오디오를 켜 주지 않을 때가 있어서, 손을 뗄 때(touchend)도 한 번 켜 둔다
  window.addEventListener('touchend', () => { clock.start().catch(() => {}); }, { once: true });
}

// 콘솔에서 확인용
window.game = game;
window.blade = blade;
window.slicer = slicer;
window.clock = clock;
window.debug = debug;
window.sfx = sfx;

enterTitle();

// 글꼴을 먼저 불러온 뒤 그리기 시작 (캔버스는 글꼴이 준비되기 전에 그리면 기본 글꼴로 나옴).
// 파일을 못 찾거나 오래 걸려도 1.5초 뒤에는 기본 글꼴로 시작.
const fontsReady = Promise.all([
  document.fonts.load(`48px ${THEME.titleFont}`, 'GLASS SLASH'),
  document.fonts.load(`20px ${THEME.font}`, '유리 베기 점수 0123456789'),
]);
Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))])
  .catch(() => {})
  .finally(() => requestAnimationFrame(frame));
