// score.js — 점수: 얼마나 정확히 반으로 잘랐나
//
// 두 조각의 넓이(신발끈 공식, geometry.polygonArea)로
//   a = 작은 조각 넓이 / 전체 넓이        (0 < a ≤ 0.5)
//   2a = 0~1 로 바꾼 정확도 (정확히 반이면 1)
//   점수 = MAX × (2a)^CURVE              (CURVE > 1 이라 반에 가까울수록 훨씬 후하게)
// a ≥ HALF_RATIO 이면 "정확히 반!" 보너스, CLOSE_RATIO ≤ a < HALF_RATIO 이면 "아깝다!" (표시만).

import { SCORE } from './config.js';

export function sliceScore(ratio) {
  const accuracy = Math.min(1, Math.max(0, 2 * ratio));
  const base = Math.round(SCORE.MAX * Math.pow(accuracy, SCORE.CURVE));
  const half = ratio >= SCORE.HALF_RATIO;
  const close = !half && ratio >= SCORE.CLOSE_RATIO;
  return { base, half, close, bonus: half ? SCORE.HALF_BONUS : 0, total: base + (half ? SCORE.HALF_BONUS : 0) };
}

// 기록: 브라우저 저장소(localStorage)에 보관. 사생활 보호 모드 등에서 막히면 기록 없이 동작.
//   score = 최고 점수, time = 가장 오래 버틴 시간(초) — 서로 따로 기록
const RECORD_KEYS = { score: 'glass-slash:best', time: 'glass-slash:bestTime' };
export function loadRecords() {
  const read = k => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
  return { score: read(RECORD_KEYS.score), time: read(RECORD_KEYS.time) };
}
export function saveRecord(kind, value) {
  try { localStorage.setItem(RECORD_KEYS[kind], String(value)); } catch { /* 저장 못 해도 게임은 계속 */ }
}

// 초 → "1:05" (분:초)
export function timeText(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// "49 : 51" 형태 (작은 쪽 먼저)
export function ratioText(ratio) {
  const small = Math.round(ratio * 100);
  return `${small} : ${100 - small}`;
}
