// sfx.js — 효과음 (Web Audio API로 직접 합성, 음원 파일·저작권 없음)
//
// 재료 두 가지:
//   잡음(noise): 무작위 표본 → 필터로 대역만 남기면 "쉭", "쨍그랑"의 바탕
//   사인파 핑(ping): 높은 음이 짧게 울리다 지수적으로 줄어듦 → 유리를 두드린 "띵"
// 소리 크기는 GainNode로 "빠르게 올렸다가 지수적으로 줄이기"(엔벨로프)를 건다.
// 모든 소리는 게임 기준 시계인 AudioContext.currentTime에 예약한다.

import { SFX } from './config.js';

export function createSfx(clock) {
  let master = null, noiseBuf = null;
  let muted = false;

  function setup() {
    const ctx = clock.ctx;
    if (!ctx || master) return ctx;
    master = ctx.createGain();
    master.gain.value = SFX.VOLUME;
    master.connect(ctx.destination);
    // 1초짜리 백색 잡음 (−1 ~ 1 무작위) — 한 번 만들어 계속 재사용
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // 엔벨로프: t에 거의 0 → t+attack에 peak → t+attack+decay에 거의 0 (지수 곡선)
  function envelope(ctx, t, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(master);
    return g;
  }

  function ping(ctx, t, freq, peak, decay, type = 'sine') {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.connect(envelope(ctx, t, peak, 0.003, decay));
    o.start(t);
    o.stop(t + decay + 0.05);
    return o;
  }

  // filterType: 'highpass' | 'bandpass' | 'lowpass', freq: 필터 기준 주파수
  function noise(ctx, t, filterType, freq, peak, decay, q = 1) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(envelope(ctx, t, peak, 0.004, decay));
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  function ready() {
    if (muted) return null;
    const ctx = setup();
    return ctx && ctx.state === 'running' ? ctx : null;
  }

  return {
    get muted() { return muted; },
    toggleMute() { muted = !muted; },

    // 자르기: "쉭" + 유리 "띵". 정확히 반에 가까울수록(ratio → 0.5) 음이 높고 맑게
    slice(ratio) {
      const ctx = ready(); if (!ctx) return;
      const t = ctx.currentTime;
      noise(ctx, t, 'highpass', 3000, 0.25, 0.08);
      const f = 1400 + 2 * ratio * 1600;          // 2a = 0~1 → 1400 ~ 3000 Hz
      ping(ctx, t, f, 0.18, 0.25);
      ping(ctx, t, f * 2.76, 0.05, 0.12);         // 배음(정수배가 아님 → 유리 같은 금속성 울림)
    },

    // 산산조각: 쨍그랑 잡음 + 여러 개의 높은 핑을 조금씩 어긋나게
    shatter() {
      const ctx = ready(); if (!ctx) return;
      const t = ctx.currentTime;
      noise(ctx, t, 'bandpass', 5000, 0.45, 0.35, 0.8);
      for (let i = 0; i < 7; i++) {
        ping(ctx, t + Math.random() * 0.12, 2500 + Math.random() * 3500, 0.08, 0.15 + Math.random() * 0.2);
      }
      ping(ctx, t, 1760, 0.15, 0.6);              // 마지막에 남는 맑은 울림
    },

    // 폭탄: 낮은 쿵 (주파수가 120 → 40Hz로 떨어지는 사인파) + 낮은 잡음
    bomb() {
      const ctx = ready(); if (!ctx) return;
      const t = ctx.currentTime;
      const o = ping(ctx, t, 120, 0.7, 0.45);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
      noise(ctx, t, 'lowpass', 600, 0.5, 0.4);
    },

    // 버튼 누름: 짧고 부드러운 "톡" — 유리 소리(잡음 + 높은 핑)와 구분되게 잡음 없이
    //   중간 높이의 사인파가 살짝 올라가며(520 → 780Hz) 빨리 사라지고, 한 옥타브 위를 아주 작게 겹침
    click() {
      const ctx = ready(); if (!ctx) return;
      const t = ctx.currentTime;
      const o = ping(ctx, t, 520, 0.16, 0.09);
      o.frequency.exponentialRampToValueAtTime(780, t + 0.05);
      ping(ctx, t + 0.012, 1560, 0.03, 0.05);
    },

    // 놓침: 부드럽게 내려가는 "뿅" (삼각파 440 → 220Hz)
    miss() {
      const ctx = ready(); if (!ctx) return;
      const t = ctx.currentTime;
      const o = ping(ctx, t, 440, 0.15, 0.25, 'triangle');
      o.frequency.exponentialRampToValueAtTime(220, t + 0.22);
    },
  };
}
