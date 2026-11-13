// config.js — 게임 전체의 수치·색 상수. 튜닝은 여기서만 한다.

// 논리 해상도 (창 크기에 맞춰 비율 유지 확대/축소)
export const VIEW = { W: 1280, H: 720 };

// 모바일(터치 화면)
//   IS_TOUCH: 손가락이 주 입력인 기기 (휴대폰·태블릿). 마우스가 있는 노트북 터치스크린은 false
export const IS_TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
export const MOBILE = {
  DPR_MAX: 1.5,      // 해상도 배율 상한 (PC는 2). 휴대폰은 화면이 작아 차이가 거의 없고 그리는 양이 줄어 덜 끊김
  HIT_PAD: 14,       // 버튼 누르는 영역을 사방으로 이만큼(논리 px) 넓힘 — 손가락은 마우스보다 덜 정확
};

// 물리: Matter.js 고정 스텝
export const PHYSICS = {
  DT_MS: 1000 / 60,        // 한 스텝 = 16.67ms
  GRAVITY_Y: 1,            // Matter 기본값
  GRAVITY_SCALE: 0.001,    // Matter 기본값
  MAX_STEPS_PER_FRAME: 8,  // 프레임이 늦어져도 한 번에 이 이상은 따라잡지 않음
  RESYNC_GAP_S: 0.25,      // 이보다 많이 밀리면(탭 숨김 등) 물리 시계를 오디오 시계로 점프
};

// F1. 유리 발사
export const LAUNCH = {
  SPAWN_Y: 760,              // 화면 아래 바깥에서 발사
  PEAK_HEIGHT_MIN: 350,      // 꼭대기까지 올라가는 높이 H (px)
  PEAK_HEIGHT_MAX: 550,
  PEAK_X_MIN: 200,           // 꼭대기 x 범위
  PEAK_X_MAX: 1080,
  VX_MAX: 1.2,               // 가로 속도 최대 (px/step)
  ANGULAR_VEL_MAX: 0.03,     // 회전 속도 최대 (rad/step)
  RADIUS_MIN: 45,
  RADIUS_MAX: 75,
  SIDES_MIN: 3,
  SIDES_MAX: 7,
  ANGLE_JITTER: 0.35,        // 꼭짓점 각도 흔들림 (0 = 정다각형, 1 = 이웃 간격만큼)
  REMOVE_MARGIN: 120,        // 화면 아래로 이만큼 벗어나면 제거
};

// F2. 칼날
export const BLADE = {
  TRAIL_S: 0.15,             // 궤적을 이만큼(초) 보관·표시
  SPEED_WINDOW_S: 0.06,      // 속도는 최근 이 시간 동안 움직인 거리로 계산
  MIN_SPEED: 400,            // px/s, 이보다 느리면 자르지 않음 (천천히 문지르기 방지). 600은 너무 빡빡해서 완화
  MAX_WIDTH: 10,             // 궤적 머리 쪽 두께 (px)
  MAX_POINTS: 96,
};

// F3. 직선 자르기
export const SLICE = {
  ENTRY_TIMEOUT_S: 0.3,      // 들어간 뒤 이 시간 안에 안 나오면 진입 기록 취소
  MIN_PIECE_AREA: 150,       // px², 이보다 작은 조각은 파편처럼 서서히 사라지고 반짝이 가루를 뿌림
  MIN_BODY_AREA: 2,          // px², 이보다 얇은 조각은 물체 없이 가루만
  SEPARATION: 2,             // px/step, 자른 직선의 법선 방향으로 양쪽 조각이 벌어지는 속도
  SPIN_JITTER: 0.04,         // rad/step, 조각 각속도에 더할 랜덤
  MAX_GENERATION: 1,         // 이 세대부터는 자를 수 없음 (원본 0 → 조각 1). 1이면 한 번 썰린 조각은 다시 안 썰림
  PIECE_COOLDOWN_S: 0.25,    // 새 조각은 이 시간 동안 자를 수 없음 (MAX_GENERATION을 2 이상으로 올릴 때만 의미 있음)
};

// F4. 보로노이 파편화 (발동: 거의 정확히 반으로 잘랐을 때 — SCORE.HALF_RATIO)
export const SHATTER = {
  SPACING_DIV: 3.5,          // 포아송 최소 간격 r = √(넓이) / SPACING_DIV  → 파편 약 8~16개
  POISSON_TRIES: 20,
  IMPACT_SEEDS: 3,           // 칼이 들어간 지점 근처에 더할 씨앗 수 (그 근처가 더 잘게 부서짐)
  IMPACT_JITTER: 0.45,       // 씨앗을 충격 지점에서 r × 이 값 안쪽으로 흩뿌림
  BURST: 3,                  // px/step, 충격 지점에서 바깥으로 튕겨 나가는 속도
  SPIN: 0.08,                // rad/step, 파편 각속도 랜덤 범위
  MIN_FRAGMENT_AREA: 20,     // px², 이보다 작은 파편은 버림
  LIFE_S: 1.5,               // 파편이 서서히 사라지는 시간
  MAX_FRAGMENTS: 150,        // 화면 안 파편 최대 개수 (넘으면 오래된 것부터 제거)
};

// 판 규칙: 생명 (제한 시간 없음)
export const GAME = {
  // 제한 시간 없음: 생명 3개를 모두 잃을 때까지 계속 (버틴 시간이 기록으로 남음)
  RAMP_S: 60,                // 이 시간 동안 출현이 점점 빨라지고, 이후로는 가장 빠른 상태를 유지
  START_DELAY_S: 1.0,        // 시작 후 첫 도형이 나오기까지
  LIVES: 3,                  // 폭탄을 베거나 도형을 놓치면 1개씩 깎임, 0이 되면 끝
};

// 제목 화면 연습: 점수·생명 없이 유리가 떠올라 베어 볼 수 있음 (폭탄 없음)
export const PRACTICE = {
  INTERVAL_S: 1.1,
  MAX_ACTIVE: 2,
  HEIGHT_MIN: 230,           // 제목 글자를 가리지 않게 낮게 (꼭대기 y ≈ 390~530)
  HEIGHT_MAX: 370,
};

// 무작위 출현: 시간이 갈수록 더 자주, 한 번에 더 많이
export const SPAWN = {
  INTERVAL_START_S: 1.3,     // 처음 출현 간격
  INTERVAL_END_S: 0.7,       // RAMP_S 이후의 출현 간격 (그 사이는 선형보간)
  INTERVAL_JITTER: 0.25,     // 간격 ±흔들림 (비율)
  DOUBLE_START: 0.15,        // 한 번에 2개 나올 확률 (처음 → 끝)
  DOUBLE_END: 0.45,
  TRIPLE_START: 0.0,         // 한 번에 3개 나올 확률
  TRIPLE_END: 0.15,
  STAGGER_S: 0.15,           // 같이 나오는 것들끼리 발사 시각을 이 안에서 조금씩 어긋나게
  BOMB_RATE: 0.15,           // 각 물체가 폭탄일 확률
  NO_BOMB_FIRST_S: 4,        // 처음 몇 초는 폭탄 없음
  MAX_ACTIVE: 3,             // 화면에 동시에 떠 있는 (아직 안 벤) 도형·폭탄 최대 개수
  RETRY_S: 0.25,             // 꽉 차 있으면 이만큼 뒤에 다시 확인
};

// 점수: 작은 조각 비율 a = 작은 조각 넓이 / 전체 넓이  (0 < a ≤ 0.5, 정확히 반이면 0.5)
//   점수 = MAX × (2a)^CURVE   → 50:50 = 100, 60:40 ≈ 60, 70:30 ≈ 31, 80:20 ≈ 12
//   a ≥ HALF_RATIO 이면 "정확히 반!" + 보너스 + 산산조각
export const SCORE = {
  MAX: 100,
  CURVE: 2.3,
  HALF_RATIO: 0.48,          // 48 : 52 이상
  HALF_BONUS: 200,
  CLOSE_RATIO: 0.44,         // 44 : 56 이상 ~ 정확히 반 미만이면 "아깝다!" (점수 보너스는 없음)
  POPUP_S: 0.8,              // 점수 글자가 떠 있는 시간
};

// 테마 — 이 객체만 바꾸면 전체 색이 바뀜. 현재: "새벽 파스텔" (부드러운 남보라 배경 + 파스텔 유리)
// (처음 씨글라스 청록 테마는 색이 강하고 촌스러워서 2026-11-10에 교체)
export const THEME = {
  name: 'dusk-pastel',
  page: '#14121f',           // 화면 비율이 안 맞을 때 남는 가장자리
  bgTop: '#1c1a2e',          // 배경 그라데이션: 깊은 남보라 → 보라 → 탁한 장밋빛
  bgMid: '#2b2745',
  bgBottom: '#3f3452',
  wave: 'rgba(230, 210, 255, 0.05)',
  glass: ['#c9b8ff', '#ffd6c8', '#a8e6cf', '#a9d4ff', '#ffb7d0'], // 라벤더·피치·민트·하늘·블러시
  glassFillAlpha: 0.5,       // 너무 투명하면 보라 배경과 섞여 탁해짐
  glassEdgeAlpha: 0.9,
  highlight: 'rgba(255, 255, 255, 0.6)',
  blade: '#fff8fb',          // 자를 수 있는 속도일 때
  bladeGlow: 'rgba(214, 190, 255, 0.65)',
  bladeSlow: '#8a8299',      // 너무 느릴 때 (자르지 않음)
  // 폭탄: 색만이 아니라 X 표시(모양)로도 구분 — 색 구분이 어려운 사람 고려
  bomb: '#2b2633',
  bombEdge: '#ff8a80',
  bombMark: '#ffe3df',
  popup: {                   // 화면에 뜨는 글자 색
    HALF: '#ffe2a8',         // 정확히 반!
    CLOSE: '#ffb8a0',        // 아깝다!
    SLICE: '#e6ddff',        // 보통 자르기 점수
    MISS: '#ff9fb2',
    BOMB: '#ff8a80',
  },
  life: '#ff9fb8',
  lifeEmpty: 'rgba(255, 159, 184, 0.22)',
  text: '#f4f0ff',
  textDim: 'rgba(244, 240, 255, 0.55)',
  overlay: 'rgba(20, 17, 32, 0.74)', // 결과 화면 뒤를 어둡게
  flash: '255, 110, 140',    // 생명이 깎일 때 번쩍이는 색 (r, g, b — 투명도는 FEEDBACK에서)
  spark: '#ffffff',          // 반짝이 가루 기본색
  // 제목 "GLASS SLASH": 무지갯빛 파스텔 유리
  title: {
    body: [                  // 위 → 아래 그라데이션 [위치, 색]
      [0.00, 'rgba(255, 250, 255, 0.95)'],
      [0.35, 'rgba(232, 218, 255, 0.70)'],
      [0.62, 'rgba(255, 208, 228, 0.55)'],
      [1.00, 'rgba(190, 240, 230, 0.85)'],
    ],
    // 무지갯빛 막: 글자 위를 가로로 흐르는 파스텔 (블러시 → 라벤더 → 민트 → 하늘)
    iris: ['rgba(255, 183, 208, 0.45)', 'rgba(201, 184, 255, 0.45)', 'rgba(168, 230, 207, 0.45)', 'rgba(169, 212, 255, 0.45)'],
    facetEdge: 'rgba(255, 255, 255, 0.45)',
    shine: 'rgba(255, 255, 255, 0.75)',
    depth: 'rgba(60, 45, 95, 0.85)',   // 글자 두께
    edge: 'rgba(255, 248, 255, 0.95)', // 날카로운 테두리
    glow: 'rgba(210, 180, 255, 0.45)',
    slashGlow: 'rgba(240, 210, 255, 0.9)',
  },
  font: '"OkDanDan", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',          // 본문: fonts/OkDanDan-Bold.ttf
  // 글자 크기 배율: Ok단단체는 같은 px에서 작아 보여서 키움. 작은 글자(≤ 24px)는 더, 큰 글자는 조금만
  fontScaleSmall: 1.35,
  fontScaleLarge: 1.15,
  titleFont: '"SBAggro", "Arial Black", "Segoe UI Black", Impact, sans-serif', // 제목: fonts/SB_Aggro_B.ttf
};

// 효과음 (Web Audio로 직접 합성 — 음원 파일 없음)
export const SFX = {
  VOLUME: 0.5,
};

// F8. 원리 보기 화면 (제목 화면의 "어떤 원리일까?" 버튼)
//   중력 없이 큰 유리 하나가 가운데 떠 있고, 계산 과정을 겹쳐 그린 채로 천천히 잘라 볼 수 있다.
export const LAB = {
  RADIUS: 150,               // 유리 크기 (게임보다 크게)
  CENTER: { x: 640, y: 380 },
  SPIN: 0.002,               // rad/step, 아주 천천히 돎
  PIECE_DRAG: 0.04,          // 잘린 조각이 조금 벌어진 뒤 멈추도록 공기 저항
  ENTRY_TIMEOUT_S: 30,       // 천천히 그어도 되도록 진입 기록을 오래 유지
  COMPARE_RADIUS: 160,       // 나란히 비교 화면의 유리 크기
  COMPARE_SPACING_DIV: 6,    // 나란히 비교의 씨앗 간격 r = √넓이 / 6 (게임은 3.5) → 씨앗 약 25개, 뭉침이 잘 보임
};

// F8. 원리 보기 오버레이 (색·유지 시간)
export const DEBUG = {
  HOLD_S: 2.5,               // 마지막 자르기·파편화 그림을 이 시간 동안 남겼다가 흐려짐
  COLORS: {
    plus: '#5aa9ff',         // 외적 + 쪽 꼭짓점
    minus: '#ff9f43',        // 외적 − 쪽 꼭짓점
    line: '#ffffff',         // 자른 직선
    hit: '#ff6ad5',          // 교점 (씨앗 노랑과 헷갈리지 않게 분홍)
    aabb: 'rgba(255, 255, 255, 0.28)',
    seed: '#fff1a6',         // 포아송 씨앗
    impact: '#ff7a59',       // 충격 지점 근처 추가 씨앗
    cell: 'rgba(255, 255, 255, 0.45)', // 보로노이 칸 (클리핑 전)
    frag: '#8ff0e0',         // 클리핑된 파편
    text: '#ffffff',
  },
};

// 반짝이 가루 (화면 효과만, 물리 엔진 밖) — 위치는 시간으로 바로 계산: p = p₀ + v·t + ½·g·t²
export const PARTICLES = {
  GRAVITY: 900,              // px/s²
  DUST: { count: 10, speed: 160, life: 0.6, size: 3 },   // 작은 조각 자리
  BOMB: { count: 28, speed: 420, life: 0.7, size: 4 },   // 폭탄 터짐
};

// 폭탄·놓침 반응: 화면 흔들림 + 붉은 번쩍임 (강도는 (1 − 진행도)²로 줄어듦)
export const FEEDBACK = {
  BOMB: { shake: 10, shakeS: 0.35, flash: 0.28, flashS: 0.35 },
  MISS: { shake: 4, shakeS: 0.2, flash: 0.12, flashS: 0.25 },
};

// 개발용 표시
export const DEV = {
  SHOW_HUD: false,           // 왼쪽 아래 작은 글자: 칼날 속도, 물체 수 등 (개발할 때만 true)
};
