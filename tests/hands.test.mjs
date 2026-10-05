import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHand, HandGestureTracker, HandControls } from '../public/hands.js';

function hand(open = true, shift = 0) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.6 + shift }));
  points[0].y = 0.8 + shift;
  for (const tip of [8, 12, 16, 20]) {
    points[tip - 2].y = 0.5 + shift;
    points[tip].y = (open ? 0.3 : 0.71) + shift;
  }
  return points;
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(overrides = {}) {
  const input = [], status = [], frames = new Map();
  let stops = 0, closes = 0, loads = 0, requests = 0, sequence = 0;
  const track = { onended: null, stop() { stops++; } };
  const stream = { getTracks: () => [track] };
  const detector = { close() { closes++; }, detectForVideo: () => ({ landmarks: [hand()] }) };
  const video = { srcObject: null, currentTime: 0, readyState: 2, play: async () => {}, pause() {} };
  const doc = new EventTarget(), win = new EventTarget();
  const runtime = {
    supported: () => true,
    getMedia: async () => { requests++; return stream; },
    loadDetector: async () => { loads++; return detector; },
    requestFrame(cb) { const id = ++sequence; frames.set(id, cb); return id; },
    cancelFrame(id) { frames.delete(id); }, document: doc, window: win,
    ...overrides,
  };
  const controls = new HandControls({ video, onInput: value => input.push(value), onStatus: value => status.push(value) }, runtime);
  return { controls, stream, detector, video, doc, win, input, status, frames,
    counts: () => ({ stops, closes, loads, requests }),
    tick(now) { const [id, callback] = frames.entries().next().value; frames.delete(id); callback(now); },
  };
}

test('open/fist classification is translation-invariant and rejects missing landmarks', () => {
  assert.equal(classifyHand(hand()), 'open');
  assert.equal(classifyHand(hand(false, -0.2)), 'fist');
  assert.equal(classifyHand(null), null);
  const bad = hand(); bad[7].x = NaN;
  assert.equal(classifyHand(bad), null);
});

test('gestures settle, quick lifts pulse once, hand loss brakes and clears old motion', () => {
  const tracker = new HandGestureTracker();
  assert.equal(tracker.update(hand(), 0).throttle, false);
  assert.equal(tracker.update(hand(), 70).throttle, true);
  assert.equal(tracker.update(hand(true, -0.1), 140).jump, false);
  assert.equal(tracker.update(hand(true, -0.2), 210).jump, true);
  assert.equal(tracker.update(hand(true, -0.3), 280).jump, false);
  assert.equal(tracker.update(null, 350).brake, true);
  assert.equal(tracker.update(hand(true, -0.3), 420).jump, false);
  tracker.update(hand(false), 490);
  assert.equal(tracker.update(hand(false), 560).brake, true);
});

test('slow movement does not jump', () => {
  const tracker = new HandGestureTracker();
  for (let i = 0; i < 20; i++) assert.equal(tracker.update(hand(true, -i * 0.008), i * 70).jump, false);
});

test('camera and assets remain untouched until explicit start; page hide releases everything', async () => {
  const f = fixture();
  assert.deepEqual(f.counts(), { stops: 0, closes: 0, loads: 0, requests: 0 });
  assert.equal(await f.controls.start(), true);
  assert.equal(f.controls.active, true);
  f.tick(100); f.video.currentTime = 0.1; f.tick(170);
  assert.equal(f.input.at(-1).throttle, true);
  f.win.dispatchEvent(new Event('pagehide'));
  assert.equal(f.controls.active, false);
  assert.deepEqual(f.counts(), { stops: 1, closes: 1, loads: 1, requests: 1 });
  assert.equal(f.video.srcObject, null);
  assert.equal(f.frames.size, 0);
  assert.equal(f.input.at(-1).throttle, false);
});

test('permission denial never loads the model and gives useful fallback', async () => {
  const f = fixture({ getMedia: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } });
  assert.equal(await f.controls.start(), false);
  assert.equal(f.counts().loads, 0);
  assert.equal(f.status.at(-1).state, 'error');
  assert.match(f.status.at(-1).message, /permission.*buttons/i);
});

test('stop while permission is pending stops a late stream without loading assets', async () => {
  const permission = deferred();
  const f = fixture({ getMedia: () => permission.promise });
  const starting = f.controls.start();
  f.controls.stop(); permission.resolve(f.stream);
  assert.equal(await starting, false);
  assert.equal(f.counts().stops, 1);
  assert.equal(f.counts().loads, 0);
  assert.equal(f.status.at(-1).state, 'off');
});

test('stop during model initialization releases camera immediately and closes late model', async () => {
  const loading = deferred();
  const f = fixture({ loadDetector: () => loading.promise });
  const starting = f.controls.start();
  await Promise.resolve();
  f.controls.stop();
  assert.equal(f.counts().stops, 1);
  loading.resolve(f.detector);
  assert.equal(await starting, false);
  assert.equal(f.counts().closes, 1);
  assert.equal(f.frames.size, 0);
});

test('model failure and inference failure both stop camera tracks', async () => {
  const failedLoad = fixture({ loadDetector: async () => { throw new Error('offline'); } });
  assert.equal(await failedLoad.controls.start(), false);
  assert.equal(failedLoad.counts().stops, 1);
  const failedFrame = fixture();
  await failedFrame.controls.start();
  failedFrame.detector.detectForVideo = () => { throw new Error('device lost'); };
  failedFrame.tick(100);
  assert.equal(failedFrame.controls.active, false);
  assert.equal(failedFrame.counts().stops, 1);
  assert.equal(failedFrame.counts().closes, 1);
  assert.equal(failedFrame.status.at(-1).state, 'error');
});

test('a cancelled startup cannot overwrite a newer camera session', async () => {
  const oldLoad = deferred();
  let loadCount = 0, oldCloses = 0;
  const f = fixture({ loadDetector: () => ++loadCount === 1 ? oldLoad.promise : Promise.resolve(f.detector) });
  const oldStart = f.controls.start();
  await Promise.resolve();
  f.controls.stop();
  assert.equal(await f.controls.start(), true);
  oldLoad.resolve({ close() { oldCloses++; } });
  assert.equal(await oldStart, false);
  assert.equal(oldCloses, 1);
  assert.equal(f.controls.active, true);
  assert.equal(f.frames.size, 1);
  f.controls.stop();
});
