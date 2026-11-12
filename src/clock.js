// clock.js — 게임 시계
// 기준 시계는 AudioContext.currentTime 하나만 쓴다 (performance.now와 섞지 않음).
// 오디오 하드웨어 기준으로 흐르는 시계라 프레임이 끊겨도 밀리지 않고, 나중에 효과음을 정확한 시각에 예약하기도 쉽다.

export function createAudioClock() {
  let ctx = null;
  return {
    get ctx() { return ctx; },
    // 브라우저 정책상 오디오는 사용자 입력(클릭/키) 안에서 시작해야 한다
    async start() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state !== 'running') await ctx.resume();
      return ctx.currentTime;
    },
    now() { return ctx ? ctx.currentTime : 0; },
    // 일시정지: 오디오 장치를 멈추면 currentTime도 그 자리에 멈춘다
    //  → 이 시계로 도는 물리·출현·버틴 시간·파편이 한꺼번에 멈춤 (따로 보정할 것이 없음)
    async suspend() { if (ctx && ctx.state === 'running') await ctx.suspend(); },
    async resume() { if (ctx && ctx.state !== 'running') await ctx.resume(); },
  };
}
