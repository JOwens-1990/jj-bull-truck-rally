import { COLORS, WORLDS, LEVELS, createGame, startGame, stepGame, pauseGame, resumeGame, setAuto } from './engine.js';
import { drawScene } from './renderer.js';
import { HandControls } from './hands.js';

const $ = (id) => document.getElementById(id);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const storageKey = 'jj-bull-truck-rally-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { /* Play remains available without storage. */ }
if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
const preferences = {
  color: Number.isInteger(saved.color) ? clamp(saved.color, 0, COLORS.length - 1) : 6,
  level: Number.isInteger(saved.level) ? clamp(saved.level, 1, 50) : 1,
  mode: saved.mode === 'practice' ? 'practice' : 'race',
  auto: saved.auto === true,
  sound: saved.sound !== false,
};
let completed = {};
if (saved.completed && typeof saved.completed === 'object') for (const [id, score] of Object.entries(saved.completed)) {
  if (/^\d+$/.test(id) && +id >= 1 && +id <= 50 && Number.isFinite(score)) completed[id] = clamp(score, 0, 3);
}
function save() { try { localStorage.setItem(storageKey, JSON.stringify({ ...preferences, completed })); } catch { /* Optional local progress. */ } }
let game = createGame(preferences);
let playing = false;
let levelWorld = game.level.world;
let finishShown = false;
let toastUntil = 0;
let input = { throttle: false, brake: false, jump: false };
let jumpQueued = false;
let handInput = { throttle: false, brake: false, jump: false, visible: false };
const heldKeys = new Set();
const pointerInputs = new Map();
let audioContext;
let lastSoundTime = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = $('scene');
const ctx = canvas.getContext('2d');
let width = 800, height = 500;
let lastFrame = 0, accumulator = 0, lastHud = 0;
const ordinal = (n) => ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;
const timeLabel = (n) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
const worldIcons = ['☀', '◆', '♣', '☾', '🌈'];
const worldBackgrounds = ['#ffe5bc', '#f6dbed', '#dcebd8', '#e1dcfb', '#dfeafd'];

function initAudio() {
  if (!preferences.sound) return;
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume().catch(() => {}); } catch { /* Silent gameplay is fine. */ }
}
function sound(kind) {
  if (!preferences.sound || !audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  if (now - lastSoundTime < 0.06) return;
  lastSoundTime = now;
  const notes = { jump: [270, 530], star: [700, 1050], rescue: [200, 350], finish: [520, 660, 780, 1040], start: [350, 520] }[kind];
  if (!notes) return;
  notes.forEach((note, index) => {
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    const start = now + index * 0.1;
    osc.type = 'sine'; osc.frequency.setValueAtTime(note, start);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.075, start + 0.015); gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(start); osc.stop(start + 0.18);
  });
}

function toast(message, seconds = 2) { $('toast').textContent = message; $('toast').hidden = false; toastUntil = performance.now() + seconds * 1000; }
function clearInputs() {
  heldKeys.clear(); pointerInputs.clear(); input = { throttle: false, brake: false, jump: false }; jumpQueued = false;
  handInput = { throttle: false, brake: false, jump: false, visible: false };
  document.querySelectorAll('.pedal').forEach((el) => el.classList.remove('pressed'));
}
function refreshInput() {
  const pointers = [...pointerInputs.values()];
  const jumpWasHeld = input.jump;
  input.throttle = pointers.includes('throttle') || heldKeys.has('ArrowRight') || heldKeys.has('KeyD');
  input.brake = pointers.includes('brake') || heldKeys.has('ArrowLeft') || heldKeys.has('KeyA');
  input.jump = pointers.includes('jump') || heldKeys.has('Space') || heldKeys.has('ArrowUp') || heldKeys.has('KeyW');
  if (input.jump && !jumpWasHeld) jumpQueued = true;
  Object.entries(input).forEach(([key, active]) => $(key).classList.toggle('pressed', active));
}
function resize() {
  const rect = canvas.getBoundingClientRect();
  width = rect.width || 800; height = rect.height || 500;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe($('stage-shell'));

function updateSoundButton() {
  $('sound').setAttribute('aria-pressed', String(preferences.sound));
  $('sound').setAttribute('aria-label', preferences.sound ? 'Turn sound off' : 'Turn sound on');
  $('sound').querySelector('.sound-state').textContent = preferences.sound ? 'ON' : 'OFF';
}
function updateAuto() {
  $('auto-toggle').setAttribute('aria-pressed', String(preferences.auto));
  $('game-auto').setAttribute('aria-pressed', String(game.auto));
  $('game-auto').querySelector('span').textContent = game.auto ? 'ON' : 'OFF';
  $('driving-note').textContent = game.auto ? 'Your bull’s got this! Self-drive is on.' : 'Hold DRIVE to go. The ramps help you fly!';
}
function renderGarage() {
  if (!playing) game = createGame(preferences);
  $('truck-name').textContent = COLORS[preferences.color].name;
  $('truck-number').textContent = String(preferences.color + 1).padStart(2, '0');
  $('colors').replaceChildren(...COLORS.map((color, index) => {
    const button = document.createElement('button'); button.className = 'color-chip'; button.style.setProperty('--chip', color.hex);
    button.setAttribute('aria-label', color.name); button.setAttribute('aria-pressed', String(index === preferences.color)); button.title = color.name;
    button.onclick = () => { preferences.color = index; save(); renderGarage(); };
    return button;
  }));
  const level = LEVELS[preferences.level - 1];
  $('level-small').textContent = `LEVEL ${String(level.id).padStart(2, '0')} / 50`;
  $('level-name').textContent = level.name;
  $('world-label').textContent = WORLDS[level.world].name.toUpperCase();
  $('race-mode').classList.toggle('selected', preferences.mode === 'race'); $('race-mode').setAttribute('aria-pressed', String(preferences.mode === 'race'));
  $('practice-mode').classList.toggle('selected', preferences.mode === 'practice'); $('practice-mode').setAttribute('aria-pressed', String(preferences.mode === 'practice'));
  updateAuto(); updateSoundButton();
  $('completion-count').textContent = `${Object.keys(completed).length} / 50 explored`;
  $('worlds').replaceChildren(...WORLDS.map((world, index) => {
    const button = document.createElement('button'); button.className = `world-card${index === level.world ? ' active' : ''}`;
    button.setAttribute('aria-label', `${world.name}, levels ${index * 10 + 1} to ${index * 10 + 10}`);
    button.setAttribute('aria-pressed', String(index === level.world));
    button.innerHTML = `<span class="world-symbol" style="--world-bg:${worldBackgrounds[index]}">${worldIcons[index]}</span><span><strong>${world.name}</strong><small>Levels ${index * 10 + 1}–${index * 10 + 10}</small></span><span class="world-number">0${index + 1}</span>`;
    button.onclick = () => { levelWorld = index; renderLevels(); $('levels-dialog').showModal(); };
    return button;
  }));
}
function renderLevels() {
  $('level-world-tabs').replaceChildren(...WORLDS.map((world, index) => {
    const button = document.createElement('button'); button.textContent = world.name; button.classList.toggle('active', index === levelWorld); button.setAttribute('aria-pressed', String(index === levelWorld));
    button.onclick = () => { levelWorld = index; renderLevels(); }; return button;
  }));
  $('level-grid').replaceChildren(...LEVELS.filter((level) => level.world === levelWorld).map((level) => {
    const button = document.createElement('button'); button.className = `level-tile${level.id === preferences.level ? ' selected' : ''}`;
    const done = Object.hasOwn(completed, level.id);
    button.setAttribute('aria-label', `Level ${level.id}: ${level.name}${done ? ', completed' : ''}`);
    button.innerHTML = `${done ? '<span class="completed-star">★</span>' : ''}<b>${level.id}</b><small>${level.name}</small>`;
    button.onclick = () => { preferences.level = level.id; save(); renderGarage(); $('levels-dialog').close(); }; return button;
  }));
}
function begin(level = preferences.level) {
  stopCamera(); clearInputs(); preferences.level = level; save();
  game = createGame(preferences); startGame(game); playing = true; finishShown = false; accumulator = 0;
  document.body.classList.add('is-playing');
  document.body.classList.remove('is-finished');
  $('hud').hidden = false; $('drive-controls').hidden = false; $('driving-note').hidden = false;
  $('pause-overlay').hidden = true; $('finish-overlay').hidden = true; $('toast').hidden = true;
  $('hud-level').textContent = `LEVEL ${level} · ${WORLDS[game.level.world].name.toUpperCase()}`;
  updateAuto(); updateHud(); initAudio(); sound('start'); resize();
  canvas.focus({ preventScroll: true });
}
function garage() {
  stopCamera(); clearInputs(); playing = false; finishShown = false;
  document.body.classList.remove('is-playing', 'is-finished');
  ['hud', 'drive-controls', 'driving-note', 'pause-overlay', 'finish-overlay', 'toast'].forEach((id) => { $(id).hidden = true; });
  renderGarage(); resize(); $('play').focus({ preventScroll: true });
}
function pause() {
  if (!playing || game.status !== 'running') return;
  pauseGame(game); clearInputs(); stopCamera(); $('pause-overlay').hidden = false; $('resume').focus({ preventScroll: true });
}
function resume() {
  if (game.status !== 'paused') return;
  resumeGame(game); clearInputs(); accumulator = 0; $('pause-overlay').hidden = true; canvas.focus({ preventScroll: true });
}
function updateHud() {
  $('place').textContent = game.mode === 'race' ? ordinal(game.place) : 'Explore';
  $('stars').textContent = `${game.stars} / 3`;
  $('timer').textContent = timeLabel(game.time);
  $('progress').style.width = `${clamp(game.player.x / game.level.length * 100, 0, 100)}%`;
  canvas.setAttribute('aria-label', `${WORLDS[game.level.world].name}, level ${game.level.id}. ${game.mode === 'race' ? ordinal(game.place) + ' place. ' : ''}${game.stars} stars collected.`);
}
function showFinish() {
  finishShown = true; stopCamera(); clearInputs(); $('driving-note').hidden = true; $('toast').hidden = true;
  document.body.classList.add('is-finished'); $('drive-controls').hidden = true;
  completed[game.level.id] = Math.max(completed[game.level.id] || 0, game.stars); save();
  $('finish-kicker').textContent = game.level.id === 50 ? 'THE GRAND FINALE!' : 'FINISH LINE!';
  $('finish-title').textContent = game.mode === 'practice' ? 'Adventure complete!' : game.place === 1 ? 'You’re a ramp champ!' : 'Bull-tastic finish!';
  $('finish-detail').textContent = game.auto ? 'Your self-driving bull brought it home.' : game.rescues ? 'Big jumps take practice. Way to keep rolling!' : 'Big horns, brave jumps, happy landings.';
  $('finish-place').textContent = game.mode === 'practice' ? '✓' : ordinal(game.place);
  $('finish-stars').textContent = `${game.stars} / 3`; $('finish-time').textContent = timeLabel(game.finishTime || game.time);
  $('next').innerHTML = `${game.level.id === 50 ? 'Back to the garage' : 'Next adventure'} <svg><use href="#i-arrow"/></svg>`;
  $('finish-overlay').hidden = false; $('next').focus({ preventScroll: true }); sound('finish');
}

const hands = new HandControls({
  video: $('camera-video'),
  onInput: (value) => { handInput = value; },
  onStatus: ({ state, message }) => {
    $('camera-status').textContent = message;
    if (state === 'error') { $('camera-button').disabled = false; handInput = { throttle: false, brake: false, jump: false, visible: false }; }
  },
});
function stopCamera() { hands.stop(); $('camera-panel').hidden = true; $('camera-button').disabled = false; handInput = { throttle: false, brake: false, jump: false, visible: false }; }

$('play').onclick = () => begin();
$('brand').onclick = (event) => { event.preventDefault(); if (playing) garage(); };
$('race-mode').onclick = () => { preferences.mode = 'race'; save(); renderGarage(); };
$('practice-mode').onclick = () => { preferences.mode = 'practice'; save(); renderGarage(); };
$('auto-toggle').onclick = () => { preferences.auto = !preferences.auto; save(); renderGarage(); };
$('game-auto').onclick = () => { const enabled = !game.auto; if (enabled) stopCamera(); preferences.auto = enabled; setAuto(game, enabled); save(); updateAuto(); toast(enabled ? 'Your bull is driving!' : 'You’ve got the remote!'); };
$('sound').onclick = () => { preferences.sound = !preferences.sound; save(); updateSoundButton(); initAudio(); sound('star'); };
$('choose-level').onclick = () => { levelWorld = game.level.world; renderLevels(); $('levels-dialog').showModal(); };
$('help').onclick = () => { if (playing) pause(); $('help-dialog').showModal(); };
document.querySelectorAll('.close-dialog').forEach((button) => { button.onclick = () => button.closest('dialog').close(); });
document.querySelectorAll('dialog').forEach((dialog) => { dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }); });
$('pause').onclick = pause; $('resume').onclick = resume; $('retry').onclick = () => begin(); $('replay').onclick = () => begin();
$('back-garage').onclick = garage; $('finish-garage').onclick = garage;
$('next').onclick = () => game.level.id === 50 ? garage() : begin(game.level.id + 1);
$('camera-button').onclick = () => { if (hands.active) { stopCamera(); return; } pause(); $('camera-dialog').showModal(); };
$('enable-camera').onclick = async () => {
  $('camera-dialog').close(); preferences.auto = false; setAuto(game, false); save(); updateAuto();
  $('camera-panel').hidden = false; $('camera-button').disabled = true;
  // Resume only when camera setup succeeds; a blocked camera leaves the race safely paused.
  await hands.start();
  if (hands.active && playing && game.status === 'paused') resume();
  $('camera-button').disabled = false;
};
$('stop-camera').onclick = stopCamera;

for (const action of ['throttle', 'brake', 'jump']) {
  const button = $(action);
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); if (game.status !== 'running') return; initAudio(); button.setPointerCapture(event.pointerId); pointerInputs.set(event.pointerId, action); refreshInput(); });
  const release = (event) => { pointerInputs.delete(event.pointerId); refreshInput(); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
document.addEventListener('keydown', (event) => {
  if (document.querySelector('dialog[open]')) return;
  if (!playing) return;
  const activeOverlay = !$('pause-overlay').hidden ? $('pause-overlay') : !$('finish-overlay').hidden ? $('finish-overlay') : null;
  if (event.code === 'Tab' && activeOverlay) {
    const buttons = [...activeOverlay.querySelectorAll('button')];
    if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0].focus(); }
    return;
  }
  if (event.code === 'Escape' || event.code === 'KeyP') { event.preventDefault(); if (!event.repeat) game.status === 'paused' ? resume() : pause(); return; }
  if (!['ArrowLeft','ArrowRight','ArrowUp','KeyA','KeyD','KeyW','Space'].includes(event.code) || game.status !== 'running') return;
  if (event.code === 'Space' && event.target.closest('button')) return;
  event.preventDefault(); heldKeys.add(event.code); refreshInput(); initAudio();
});
document.addEventListener('keyup', (event) => { heldKeys.delete(event.code); refreshInput(); });
window.addEventListener('blur', () => { clearInputs(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); stopCamera(); } });
window.addEventListener('pagehide', stopCamera);

function frame(timestamp) {
  const elapsed = Math.min((timestamp - lastFrame) / 1000 || 0, 0.1); lastFrame = timestamp;
  if (game.status === 'running') {
    accumulator = Math.min(accumulator + elapsed, 0.1);
    while (accumulator >= 1 / 60) {
      const controls = { throttle: input.throttle || handInput.throttle, brake: input.brake || (!input.throttle && handInput.brake), jump: input.jump || jumpQueued || handInput.jump };
      stepGame(game, 1 / 60, controls); handInput.jump = false; jumpQueued = false; accumulator -= 1 / 60;
      if (game.event) {
        if (game.event !== 'finish') sound(game.event);
        if (game.event === 'rescue') toast('A little lift. Keep rolling!');
        if (game.event === 'star') toast('Star power! ★', 1.2);
      }
      if (game.status === 'finished') break;
    }
  } else accumulator = 0;
  drawScene(ctx, width, height, game, { time: timestamp / 1000, garage: !playing, reducedMotion });
  if (playing && timestamp - lastHud > 100) { updateHud(); lastHud = timestamp; }
  if (toastUntil < timestamp) $('toast').hidden = true;
  if (playing && game.status === 'finished' && !finishShown) showFinish();
  requestAnimationFrame(frame);
}
Object.defineProperty(window, '__rallyTest', { value: Object.freeze({ snapshot: () => ({ status: game.status, playing, level: game.level.id, color: game.color, auto: game.auto, mode: game.mode, player: { ...game.player }, place: game.place, stars: game.stars, rescues: game.rescues, time: game.time, completed: { ...completed }, cameraActive: hands.active, preferences: { ...preferences } }) }), writable: false });
renderGarage(); resize(); requestAnimationFrame(frame);
