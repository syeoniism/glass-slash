// particles.js — 반짝이 가루 (화면 효과만, 물리 엔진을 쓰지 않음)
//
// 가루 하나의 위치는 생긴 뒤 지난 시간 t만으로 바로 계산한다 (등가속도 운동):
//     x(t) = x₀ + vx·t,   y(t) = y₀ + vy·t + ½·g·t²
// 상태를 매 프레임 갱신하지 않으므로 게임 시계가 멈추면(일시정지) 가루도 그대로 멈춘다.

import { PARTICLES } from './config.js';

export function createParticles() {
  let list = [];
  return {
    clear() { list = []; },

    // (x, y)에서 사방으로 흩어지는 가루. opts = { count, speed, life, size }, color
    burst(x, y, opts, color, now) {
      for (let i = 0; i < opts.count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = opts.speed * (0.35 + Math.random() * 0.65);
        list.push({
          x, y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp - opts.speed * 0.3, // 살짝 위로 튀게
          born: now,
          life: opts.life * (0.7 + Math.random() * 0.6),
          size: opts.size * (0.6 + Math.random() * 0.8),
          color,
        });
      }
    },

    draw(ctx, now) {
      list = list.filter(p => now - p.born < p.life);
      for (const p of list) {
        const t = now - p.born;
        const x = p.x + p.vx * t;
        const y = p.y + p.vy * t + 0.5 * PARTICLES.GRAVITY * t * t;
        const s = p.size * (1 - t / p.life);
        ctx.globalAlpha = 1 - t / p.life;
        ctx.fillStyle = p.color;
        // 마름모 (반짝이는 유리 가루 느낌)
        ctx.beginPath();
        ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.6, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.6, y);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
  };
}
