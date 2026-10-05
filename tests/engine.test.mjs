import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Browser .js is an ES module; importing a data URL also works without package.json.
const source = await readFile(new URL('../public/engine.js', import.meta.url), 'utf8');
const { COLORS, WORLDS, LEVELS, createGame, startGame, stepGame, pauseGame, resumeGame, setAuto, getSurface } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function finish(options, controls = {}, limit = 90) {
  const state = startGame(createGame(options));
  for (let frame = 0; frame < limit * 60 && state.status === 'running'; frame += 1) stepGame(state, 1 / 60, controls);
  return state;
}

test('50 valid courses span five worlds and have three reachable collectibles', () => {
  assert.equal(LEVELS.length, 50);
  assert.equal(WORLDS.length, 5);
  assert.equal(COLORS.length, 8);
  for (const level of LEVELS) {
    assert.equal(level.world, Math.floor((level.id - 1) / 10));
    assert.equal(level.stars.length, 3);
    for (let index = 0; index < level.gaps.length; index += 1) {
      const gap = level.gaps[index];
      const ramp = level.ramps[index];
      assert.ok(gap.end > gap.start && gap.end < level.length - 500);
      assert.equal(ramp.end, gap.start);
      assert.equal(getSurface(level, (gap.start + gap.end) / 2), null);
      assert.ok(Math.abs(getSurface(level, (ramp.start + ramp.end) / 2) - ramp.height / 2) < 0.000001);
      assert.equal(getSurface(level, gap.end), 0);
    }
  }
});

test('self-drive finishes every level without rescue and collects all three stars', () => {
  for (let level = 1; level <= 50; level += 1) {
    const state = finish({ level, auto: true });
    assert.equal(state.status, 'finished', `course ${level} did not finish`);
    assert.equal(state.rescues, 0, `course ${level} needed rescue`);
    assert.equal(state.stars, 3, `course ${level} missed stars`);
    assert.equal(state.place, 1, `course ${level} self-drive should be competitive`);
    assert.ok(state.finishTime < 40);
  }
});

test('manual driving can win every race with throttle alone', () => {
  for (let level = 1; level <= 50; level += 1) {
    const state = finish({ level, auto: false }, { throttle: true });
    assert.equal(state.status, 'finished', `course ${level}`);
    assert.equal(state.place, 1, `course ${level} is not winnable`);
    assert.equal(state.rescues, 0, `course ${level} needs a jump button`);
  }
});

test('pause freezes the clock and position, and resume continues', () => {
  const state = startGame(createGame({ auto: true }));
  stepGame(state, 1 / 60);
  pauseGame(state);
  const before = JSON.stringify(state);
  for (let frame = 0; frame < 60; frame += 1) stepGame(state, 1 / 60);
  assert.equal(JSON.stringify(state), before);
  resumeGame(state);
  stepGame(state, 1 / 60);
  assert.ok(state.player.x > 80 && state.time > 1 / 60);
});

test('a missed jump gets a friendly rescue on safe ground', () => {
  const state = startGame(createGame({ mode: 'practice' }));
  const gap = state.level.gaps[0];
  Object.assign(state.player, { x: gap.start + 20, y: -94, vx: 0, vy: -150, grounded: false });
  stepGame(state, 1 / 60);
  assert.equal(state.rescues, 1);
  assert.equal(state.event, 'rescue');
  assert.ok(state.player.x > gap.end);
  assert.equal(state.player.y, 0);
  assert.equal(state.status, 'running');
  setAuto(state, true);
  for (let frame = 0; frame < 4000 && state.status === 'running'; frame += 1) stepGame(state, 1 / 60);
  assert.equal(state.status, 'finished');
});

test('jump is a press action, brake stops, practice has no rivals, and input stays finite', () => {
  const state = startGame(createGame({ level: NaN, color: -1, mode: 'practice' }));
  assert.equal(state.level.id, 1);
  assert.equal(state.color, 7);
  assert.equal(state.rivals.length, 0);
  stepGame(state, 1 / 60, { jump: true });
  assert.equal(state.event, 'jump');
  assert.ok(state.player.vy > 0 && !state.player.grounded);
  for (let frame = 0; frame < 90; frame += 1) stepGame(state, 1 / 60, { jump: true, throttle: true });
  assert.equal(state.player.grounded, true, 'holding jump must not repeatedly hop');
  for (let frame = 0; frame < 90; frame += 1) stepGame(state, 1 / 60, { brake: true });
  assert.equal(state.player.vx, 0);
  const time = state.time;
  stepGame(state, Infinity);
  stepGame(state, -1);
  assert.equal(state.time, time);
  stepGame(state, 10);
  assert.ok(Math.abs(state.time - time - 1 / 30) < 0.000001);
});

test('fixed inputs produce deterministic results and finishing freezes simulation', () => {
  const first = finish({ level: 49, auto: true });
  const second = finish({ level: 49, auto: true });
  assert.deepEqual(first, second);
  const before = { x: first.player.x, time: first.time, finishTime: first.finishTime };
  stepGame(first, 1 / 60, { throttle: true, jump: true });
  assert.deepEqual({ x: first.player.x, time: first.time, finishTime: first.finishTime }, before);
});

test('manual hops anywhere on ramps stay playable at both 30 and 60 Hz', () => {
  for (const dt of [1 / 30, 1 / 60]) {
    for (const level of [10, 20, 30, 40, 50]) {
      for (const fraction of [0, 0.25, 0.5, 0.75, 0.95]) {
        const state = startGame(createGame({ level }));
        const jumped = new Set();
        while (state.time < 60 && state.status === 'running') {
          const index = state.level.ramps.findIndex((ramp, i) => !jumped.has(i)
            && state.player.x >= ramp.start + fraction * (ramp.end - ramp.start)
            && state.player.x < ramp.end);
          if (index >= 0) jumped.add(index);
          stepGame(state, dt, { throttle: true, jump: index >= 0 });
          assert.ok(Number.isFinite(state.player.y));
        }
        assert.equal(state.status, 'finished', `course ${level}, ramp fraction ${fraction}`);
        assert.equal(state.rescues, 0, `hop should not spoil the ramp on course ${level}`);
        assert.equal(state.place, 1);
      }
    }
  }
});

test('race place preserves rivals who finished while the player waited', () => {
  const state = startGame(createGame({ level: 50 }));
  for (let frame = 0; frame < 40 * 60; frame += 1) stepGame(state, 1 / 60);
  assert.equal(state.player.x, 80);
  assert.ok(state.rivals.every((rival) => rival._finishTime !== null));
  assert.equal(state.place, 4);
  while (state.status === 'running' && state.time < 80) stepGame(state, 1 / 60, { throttle: true });
  assert.equal(state.status, 'finished');
  assert.equal(state.place, 4);
  assert.ok(state.finishTime > 40);
});

test('coasting slowly off a ramp triggers one rescue and never a rescue loop', () => {
  const state = startGame(createGame({ level: 50, mode: 'practice' }));
  const gap = state.level.gaps[0];
  const x = gap.start - 12;
  Object.assign(state.player, { x, y: getSurface(state.level, x), vx: 90 });
  for (let frame = 0; frame < 5 * 60; frame += 1) stepGame(state, 1 / 60);
  assert.equal(state.rescues, 1);
  assert.ok(state.player.x > gap.end);
  assert.equal(state.player.grounded, true);
  assert.equal(state.player.vx, 0);
  assert.notEqual(getSurface(state.level, state.player.x), null);
});
