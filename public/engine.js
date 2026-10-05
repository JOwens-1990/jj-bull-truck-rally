/** Bull Truck Rally's deterministic, DOM-free racing simulation. */
export const COLORS = Object.freeze([
  { name: 'Rocket Red', hex: '#ff5a54' },
  { name: 'Electric Blue', hex: '#41a8ff' },
  { name: 'Sunshine Yellow', hex: '#ffce3d' },
  { name: 'Jungle Green', hex: '#61d878' },
  { name: 'Purple Power', hex: '#ac79ff' },
  { name: 'Hot Pink', hex: '#ff7bc2' },
  { name: 'Tangerine', hex: '#ff934c' },
  { name: 'Ice Mint', hex: '#56ddcf' },
]);

export const WORLDS = Object.freeze([
  { name: 'Sunny Canyon', sky: '#a9e9ff', ground: '#d99158', accent: '#ffc657' },
  { name: 'Candy Peaks', sky: '#ead6ff', ground: '#b078bd', accent: '#ff91c7' },
  { name: 'Jungle Jumps', sky: '#a1ebd0', ground: '#538864', accent: '#c7ed61' },
  { name: 'Moon Motors', sky: '#272d64', ground: '#716ab2', accent: '#a3a5ff' },
  { name: 'Rainbow Summit', sky: '#c8e3ff', ground: '#6b8ea9', accent: '#ffb95f' },
]);

const TITLES = [
  'First Big Jump', 'Horn Power', 'Lava Leap', 'Dusty Dash', 'Ramp Champ',
  'Star Chaser', 'Bull Rush', 'Sky Rider', 'Super Sprint', 'Grand Rally',
];

function makeLevel(index) {
  const world = Math.floor(index / 10);
  const gaps = [];
  const ramps = [];
  const count = 3 + world;
  const spacing = 765 + (index % 3) * 27;
  for (let obstacle = 0; obstacle < count; obstacle += 1) {
    const start = 830 + obstacle * spacing + ((index * 29 + obstacle * 37) % 95);
    const width = 144 + index * 2.35 + ((obstacle + index) % 3) * 11;
    const height = 58 + index * 0.78 + (obstacle % 2) * 7;
    gaps.push({ start, end: start + width });
    ramps.push({ start: start - 210 - (index % 4) * 8, end: start, height });
  }
  const starObstacles = [0, Math.floor(count / 2), count - 1];
  const stars = starObstacles.map((obstacle) => ({
    x: (gaps[obstacle].start + gaps[obstacle].end) / 2,
    y: ramps[obstacle].height + 108,
  }));
  return Object.freeze({
    id: index + 1,
    name: `${TITLES[index % 10]}`,
    world,
    length: gaps[count - 1].end + 830,
    gaps: Object.freeze(gaps.map(Object.freeze)),
    ramps: Object.freeze(ramps.map(Object.freeze)),
    stars: Object.freeze(stars.map(Object.freeze)),
  });
}

export const LEVELS = Object.freeze(Array.from({ length: 50 }, (_, index) => makeLevel(index)));

const GRAVITY = 820;
const MANUAL_SPEED = 410;
const AUTO_SPEED = 370;
const MAX_DT = 1 / 30;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Ground height, with gaps taking precedence over ramp lips. */
export function getSurface(level, x) {
  if (level.gaps.some((gap) => x >= gap.start && x < gap.end)) return null;
  const ramp = level.ramps.find((item) => x >= item.start && x < item.end);
  return ramp ? ((x - ramp.start) / (ramp.end - ramp.start)) * ramp.height : 0;
}

function truck(color, x = 80) {
  return { x, y: 0, vx: 0, vy: 0, angle: 0, grounded: true, color, _hopCooldown: 0, _finishTime: null };
}

export function createGame({ level = 1, color = 0, mode = 'race', auto = false } = {}) {
  const levelNumber = Number.isFinite(Number(level)) ? clamp(Math.round(Number(level)), 1, 50) : 1;
  const colorNumber = Number.isFinite(Number(color)) ? ((Math.trunc(Number(color)) % COLORS.length) + COLORS.length) % COLORS.length : 0;
  const race = mode !== 'practice';
  return {
    level: LEVELS[levelNumber - 1],
    color: colorNumber,
    mode: race ? 'race' : 'practice',
    auto: Boolean(auto),
    status: 'ready',
    player: truck(colorNumber),
    rivals: race ? [1, 3, 5].map((offset, index) => ({
      ...truck((colorNumber + offset) % COLORS.length, 80 - (index + 1) * 28),
      _speed: 317 + index * 15 + Math.floor((levelNumber - 1) / 10) * 3,
      _delay: 0.22 + index * 0.15,
    })) : [],
    time: 0,
    stars: 0,
    collected: new Set(),
    rescues: 0,
    place: 1,
    finishTime: null,
    effects: [],
    event: null,
    _jumpHeld: false,
  };
}

export function startGame(state) {
  if (state.status === 'ready') state.status = 'running';
  return state;
}

export function pauseGame(state) {
  if (state.status === 'running') state.status = 'paused';
  return state;
}

export function resumeGame(state) {
  if (state.status === 'paused') state.status = 'running';
  return state;
}

export function setAuto(state, enabled) {
  state.auto = Boolean(enabled);
  return state;
}

function addEffect(state, type, x, y, duration = 0.8) {
  state.effects.push({ type, x, y, life: duration, maxLife: duration });
  // Bound memory even when someone uses a very small simulation timestep.
  if (state.effects.length > 32) state.effects.shift();
}

function rescue(state, body, isPlayer) {
  const gap = state.level.gaps.find((item) => body.x >= item.start - 20 && body.x < item.end + 90);
  body.x = gap ? gap.end + 70 : clamp(body.x + 35, 80, state.level.length - 100);
  body.y = getSurface(state.level, body.x) ?? 0;
  body.vx = 155;
  body.vy = 0;
  body.angle = 0;
  body.grounded = true;
  body._hopCooldown = 0.5;
  if (isPlayer) {
    state.rescues += 1;
    state.event = 'rescue';
    addEffect(state, 'rescue', body.x, body.y + 38, 1.25);
  }
}

function moveTruck(state, body, dt, controls, topSpeed, isPlayer) {
  if (body._finishTime !== null) return;
  body._hopCooldown = Math.max(0, body._hopCooldown - dt);
  const oldX = body.x;
  const oldY = body.y;
  const wasGrounded = body.grounded;
  const oldRamp = state.level.ramps.find((item) => oldX >= item.start && oldX < item.end);

  if (controls.brake) body.vx = Math.max(0, body.vx - 610 * dt);
  else if (controls.throttle) body.vx = Math.min(topSpeed, body.vx + (body.grounded ? 235 : 95) * dt);
  else body.vx = Math.max(0, body.vx - (body.grounded ? 66 : 15) * dt);

  if (controls.jump && body.grounded && body._hopCooldown === 0) {
    body.vy = 315 + body.vx * 0.09;
    body.grounded = false;
    body._hopCooldown = 0.8;
    if (isPlayer) {
      state.event = 'jump';
      addEffect(state, 'jump', body.x, body.y + 10, 0.5);
    }
  }

  body.x += body.vx * dt;
  const surface = getSurface(state.level, body.x);
  // Ride up a ramp, then retain that altitude as its lip launches the truck.
  if (body.grounded && surface !== null) {
    body.y = surface;
    body.vy = 0;
  } else {
    if (body.grounded) {
      body.grounded = false;
      if (oldRamp && body.vx > 105) {
        body.y = oldRamp.height;
        body.vy = 204 + oldRamp.height * 0.7 + (body.vx * oldRamp.height / (oldRamp.end - oldRamp.start)) * 0.42;
        if (isPlayer) {
          state.event = 'jump';
          addEffect(state, 'jump', oldRamp.end, oldRamp.height, 0.5);
        }
      }
    }
    body.vy -= GRAVITY * dt;
    body.y += body.vy * dt;
    if (surface !== null && body.y <= surface && body.vy <= 0) {
      body.y = surface;
      body.vy = 0;
      body.grounded = true;
      if (isPlayer && !wasGrounded && oldY > surface + 2) addEffect(state, 'land', body.x, body.y, 0.4);
    }
  }

  const ramp = state.level.ramps.find((item) => body.x >= item.start && body.x < item.end);
  const targetAngle = body.grounded ? (ramp ? Math.atan2(ramp.height, ramp.end - ramp.start) : 0) : clamp(Math.atan2(body.vy, Math.max(body.vx, 180)) * 0.58, -0.48, 0.48);
  body.angle += (targetAngle - body.angle) * Math.min(1, dt * 12);
  if (body.y < -95) rescue(state, body, isPlayer);
  if (body.x >= state.level.length) {
    body.x = state.level.length;
    body._finishTime = state.time;
  }
}

/** Advance at most 1/30 second. Pausing does not advance physics or the clock. */
export function stepGame(state, dtSeconds, input = {}) {
  state.event = null;
  if (state.status !== 'running') return state;
  const dt = clamp(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0, MAX_DT);
  if (dt === 0) return state;
  state.time += dt;
  state.effects = state.effects.filter((effect) => { effect.life -= dt; return effect.life > 0; });
  const jumpPressed = Boolean(input.jump) && !state._jumpHeld;
  state._jumpHeld = Boolean(input.jump);
  const controls = {
    throttle: state.auto || Boolean(input.throttle),
    brake: !state.auto && Boolean(input.brake),
    jump: !state.auto && jumpPressed,
  };
  moveTruck(state, state.player, dt, controls, state.auto ? AUTO_SPEED : MANUAL_SPEED, true);
  state.rivals.forEach((rival) => moveTruck(state, rival, dt, { throttle: state.time >= rival._delay }, rival._speed, false));

  state.level.stars.forEach((star, index) => {
    if (!state.collected.has(index) && Math.hypot(state.player.x - star.x, state.player.y + 36 - star.y) < 77) {
      state.collected.add(index);
      state.stars = state.collected.size;
      state.event = 'star';
      addEffect(state, 'star', star.x, star.y, 0.85);
    }
  });
  state.place = 1 + state.rivals.filter((rival) => rival._finishTime !== null
    ? state.player._finishTime === null || rival._finishTime < state.player._finishTime
    : rival.x > state.player.x).length;
  if (state.player._finishTime !== null) {
    state.status = 'finished';
    state.finishTime = state.time;
    state.event = 'finish';
    addEffect(state, 'finish', state.player.x, state.player.y + 65, 2.5);
  }
  return state;
}
