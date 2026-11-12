// spawner.js — 무작위 출현 (게임이 끝날 때까지 도형과 폭탄이 튀어나옴)
//
// 진행도 p = 지난 시간 / RAMP_S (0 → 1, 그 뒤로는 1) 에 따라 선형보간으로 난이도를 올린다.
//   출현 간격 = lerp(INTERVAL_START, INTERVAL_END, p) × (1 ± JITTER)
//   한 번에 2개, 3개 나올 확률도 p에 따라 증가
// 같이 나오는 것들은 가로 범위를 나눠 가져서 서로 겹치지 않게 한다.
// 화면에 떠 있는 것(아직 안 벤 도형·폭탄 + 발사 대기)이 MAX_ACTIVE개를 넘지 않도록,
// 자리가 모자라면 개수를 줄이고, 꽉 차 있으면 RETRY_S 뒤에 다시 확인한다.

import { SPAWN, LAUNCH, GAME } from './config.js';

const mix = (a, b, p) => a + (b - a) * p;

export function createSpawner(startTime, rand = Math.random) {
  let next = startTime;
  return {
    // simTime까지 나와야 할 물체들의 "발사 메모" 목록 [{ launchTime, xMin, xMax, bomb }]
    // active = 지금 화면에 떠 있거나 발사를 기다리는 물체 수
    due(simTime, active = 0) {
      const notes = [];
      while (next <= simTime) {
        const room = SPAWN.MAX_ACTIVE - active - notes.length;
        if (room <= 0) { next = simTime + SPAWN.RETRY_S; break; }
        const p = Math.min(1, Math.max(0, (next - startTime) / GAME.RAMP_S)); // RAMP_S 이후로는 최대 난이도 유지
        const r = rand();
        const wanted = r < mix(SPAWN.TRIPLE_START, SPAWN.TRIPLE_END, p) ? 3
          : r < mix(SPAWN.TRIPLE_START, SPAWN.TRIPLE_END, p) + mix(SPAWN.DOUBLE_START, SPAWN.DOUBLE_END, p) ? 2 : 1;
        const count = Math.min(wanted, room);
        const width = (LAUNCH.PEAK_X_MAX - LAUNCH.PEAK_X_MIN) / count;
        const bombsAllowed = next - startTime >= SPAWN.NO_BOMB_FIRST_S;
        for (let i = 0; i < count; i++) {
          notes.push({
            launchTime: next + rand() * SPAWN.STAGGER_S,
            xMin: LAUNCH.PEAK_X_MIN + width * i + 20,
            xMax: LAUNCH.PEAK_X_MIN + width * (i + 1) - 20,
            bomb: bombsAllowed && rand() < SPAWN.BOMB_RATE,
          });
        }
        // 한 번에 전부 폭탄이면 너무 억울하니, 그럴 땐 하나를 도형으로 바꿈
        if (notes.slice(-count).every(n => n.bomb)) notes[notes.length - 1].bomb = false;
        const interval = mix(SPAWN.INTERVAL_START_S, SPAWN.INTERVAL_END_S, p);
        next += interval * (1 + (rand() * 2 - 1) * SPAWN.INTERVAL_JITTER);
      }
      return notes.sort((a, b) => a.launchTime - b.launchTime);
    },
  };
}
