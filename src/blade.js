// blade.js — F2. 칼날 궤적 (마우스 위치 기록, 속도 계산)
// F3에서 쓸 "이번 프레임에 새로 그어진 선분들"도 여기서 꺼내 준다.
//
// 시각(t)은 main.js가 넘겨주는 now() 하나로만 잰다 (플레이 중 = AudioContext.currentTime).

import { BLADE } from './config.js';

export function createBlade(now) {
  const blade = {
    down: false,
    points: [],        // [{x, y, t}] 오래된 것 → 최근 것
    pending: [],       // 아직 F3에 넘기지 않은 새 선분 [{a, b, t}]
    last: null,        // 마지막으로 기록한 점 (선분 시작점)

    press(p) {
      blade.down = true;
      blade.last = null;      // 떼었다 다시 누르면 이전 궤적과 잇지 않음
      blade.add(p);
    },
    release() {
      blade.down = false;
      blade.last = null;      // 궤적은 남겨서 자연스럽게 사라지게
    },
    add(p) {
      if (!blade.down) return;
      const pt = { x: p.x, y: p.y, t: now() };
      if (blade.last) blade.pending.push({ a: blade.last, b: pt, t: pt.t });
      blade.points.push(pt);
      if (blade.points.length > BLADE.MAX_POINTS) blade.points.shift();
      blade.last = pt;
    },
    // 오디오 시계로 바뀔 때 등: 궤적만 비우고 누른 상태는 유지
    reset() {
      blade.points = [];
      blade.pending = [];
      blade.last = null;
    },
    // 오래된 점 버리기 (매 프레임)
    prune() {
      const cut = now() - BLADE.TRAIL_S;
      while (blade.points.length && blade.points[0].t < cut) blade.points.shift();
    },

    // 칼날 속도 (px/s) = 최근 SPEED_WINDOW 동안 지나간 경로 길이 / 걸린 시간
    // 마우스를 멈추면 새 점이 없으므로 걸린 시간이 계속 늘어나 속도가 0으로 떨어진다.
    speed() {
      const t = now();
      const pts = blade.points.filter(p => p.t >= t - BLADE.SPEED_WINDOW_S);
      if (pts.length < 2) return 0;
      let dist = 0;
      for (let i = 1; i < pts.length; i++) dist += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const dt = Math.max(t - pts[0].t, 1 / 240); // 0으로 나누기 방지
      return dist / dt;
    },
    // F3용: 지난 호출 이후 새로 그어진 선분들을 꺼내고 비운다
    takeSegments() {
      const s = blade.pending;
      blade.pending = [];
      return s;
    },
  };
  return blade;
}
