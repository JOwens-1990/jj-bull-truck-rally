// Optional, on-device controls. Loading this module never opens a camera.
// API: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
export const HAND_ASSETS = Object.freeze({
  module: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
});

const IDLE = Object.freeze({ throttle: false, brake: false, jump: false, visible: false });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function classifyHand(points) {
  if (!points || points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  // Wrist-relative lengths also work when the hand is tilted or mirrored.
  const extended = [8, 12, 16, 20].filter(tip => distance(points[0], points[tip]) > distance(points[0], points[tip - 2]) * 1.16).length;
  return extended >= 3 ? 'open' : extended <= 1 ? 'fist' : 'neutral';
}

export class HandGestureTracker {
  constructor() { this.reset(); }
  reset() {
    this.gesture = 'neutral'; this.candidate = null; this.count = 0;
    this.y = null; this.history = []; this.lastJump = -Infinity;
  }
  update(points, now) {
    const next = classifyHand(points);
    if (!next) {
      this.reset();
      return { ...IDLE, brake: true };
    }
    this.count = next === this.candidate ? this.count + 1 : 1;
    this.candidate = next;
    if (this.count >= 2) this.gesture = next;
    const rawY = points[9].y;
    this.y = this.y === null ? rawY : this.y * 0.45 + rawY * 0.55;
    let jump = false;
    if (this.gesture === 'open' && next === 'open') {
      this.history = this.history.filter(sample => now - sample.time <= 320);
      if (this.history.length && now - this.lastJump >= 850) {
        const lowest = Math.max(...this.history.map(sample => sample.y));
        if (lowest - this.y >= 0.105) {
          jump = true; this.lastJump = now; this.history = [];
        }
      }
      this.history.push({ y: this.y, time: now });
    } else this.history = [];
    return { throttle: this.gesture === 'open', brake: this.gesture === 'fist', jump, visible: true };
  }
}

async function loadDetector() {
  const { FilesetResolver, HandLandmarker } = await import(HAND_ASSETS.module);
  const files = await FilesetResolver.forVisionTasks(HAND_ASSETS.wasm);
  return HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: HAND_ASSETS.model, delegate: 'CPU' },
    runningMode: 'VIDEO', numHands: 1,
    minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
  });
}

const stopStream = stream => stream?.getTracks().forEach(track => track.stop());
const closeDetector = detector => { try { detector?.close(); } catch { /* Already closed. */ } };

function errorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Camera permission was not allowed. Use the buttons, or allow camera access in your browser and try again.';
  if (error?.name === 'NotFoundError') return 'No camera was found. You can still use the buttons or self-drive.';
  if (error?.name === 'NotReadableError') return 'Your camera is busy. Close other camera apps and try again, or use the buttons.';
  return 'Hand controls could not start. Check your internet connection and camera, then try again. Buttons and self-drive still work.';
}

export class HandControls {
  // The optional second argument is a dependency seam for lifecycle tests.
  constructor({ video, onInput = () => {}, onStatus = () => {} }, runtime = {}) {
    this.video = video; this.onInput = onInput; this.onStatus = onStatus;
    this.runtime = {
      loadDetector,
      getMedia: () => navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 20, max: 30 } } }),
      supported: () => globalThis.isSecureContext && !!globalThis.navigator?.mediaDevices?.getUserMedia,
      requestFrame: cb => requestAnimationFrame(cb), cancelFrame: id => cancelAnimationFrame(id),
      document: globalThis.document, window: globalThis.window,
      ...runtime,
    };
    this._token = 0; this._active = false; this._starting = null;
    this._stream = null; this._detector = null; this._frame = null;
    this._status = ''; this.tracker = new HandGestureTracker();
    this._hide = () => { if (this.runtime.document?.hidden) this.stop(); };
    this._pageHide = () => this.stop();
  }
  get active() { return this._active; }
  _statusUpdate(state, message) {
    const key = state + message;
    if (key !== this._status) { this._status = key; this.onStatus({ state, message }); }
  }
  start() {
    if (this._active) return Promise.resolve(true);
    if (this._starting) return this._starting;
    const token = ++this._token;
    const pending = this._start(token);
    this._starting = pending;
    pending.finally(() => { if (this._starting === pending) this._starting = null; });
    return pending;
  }
  async _start(token) {
    if (!this.video || !this.runtime.supported()) {
      this._statusUpdate('error', 'Hand controls need a camera and a secure HTTPS page. Use the buttons or self-drive for now.');
      return false;
    }
    this._listen();
    this._statusUpdate('loading', 'Allow the camera when your browser asks.');
    try {
      const stream = await this.runtime.getMedia();
      if (token !== this._token) { stopStream(stream); return false; }
      this._stream = stream;
      for (const track of stream.getTracks()) {
        track.onended = () => { if (token === this._token) this._fail('Camera stopped. Turn hand controls on again, or use the buttons.'); };
      }
      this.video.muted = true; this.video.playsInline = true;
      this.video.srcObject = stream;
      this._statusUpdate('loading', 'Getting hand controls ready…');
      const detector = await this.runtime.loadDetector();
      if (token !== this._token) { closeDetector(detector); return false; }
      this._detector = detector;
      await this.video.play();
      if (token !== this._token) return false;
      this._active = true; this.tracker.reset();
      this._lastVideoTime = -1; this._lastInference = -Infinity; this._lastFrameAt = null;
      this._statusUpdate('ready', 'Show one hand. Open palm drives, fist brakes, and a quick lift jumps.');
      this._frame = this.runtime.requestFrame(now => this._tick(now, token));
      return true;
    } catch (error) {
      if (token === this._token) this._fail(errorMessage(error));
      return false;
    }
  }
  _tick(now, token) {
    if (token !== this._token || !this._active) return;
    try {
      if (now - this._lastInference >= 66 && this.video.readyState >= 2 && this.video.currentTime !== this._lastVideoTime) {
        this._lastInference = now; this._lastVideoTime = this.video.currentTime; this._lastFrameAt = now;
        const result = this._detector.detectForVideo(this.video, now);
        const input = this.tracker.update(result.landmarks?.[0], now);
        this.onInput(input);
        this._statusUpdate(input.visible ? 'tracking' : 'lost', input.visible
          ? 'Open palm: drive · Fist: brake · Lift quickly: jump'
          : 'I can’t see your hand. Show one hand in good light, or use the buttons.');
      } else if (this._lastFrameAt !== null && now - this._lastFrameAt > 1500) {
        this.onInput(this.tracker.update(null, now));
        this._statusUpdate('lost', 'Camera paused. Show your hand again, or use the buttons.');
      }
      this._frame = this.runtime.requestFrame(time => this._tick(time, token));
    } catch { this._fail('Hand tracking stopped. Try turning it on again, or use the buttons.'); }
  }
  _listen() {
    this.runtime.document?.addEventListener('visibilitychange', this._hide);
    this.runtime.window?.addEventListener('pagehide', this._pageHide);
  }
  _release() {
    this._active = false;
    if (this._frame !== null) this.runtime.cancelFrame(this._frame);
    this._frame = null;
    this.runtime.document?.removeEventListener('visibilitychange', this._hide);
    this.runtime.window?.removeEventListener('pagehide', this._pageHide);
    const stream = this._stream; this._stream = null;
    if (stream) for (const track of stream.getTracks()) track.onended = null;
    stopStream(stream);
    closeDetector(this._detector); this._detector = null;
    if (this.video) { this.video.pause(); this.video.srcObject = null; }
    this.tracker.reset(); this.onInput({ ...IDLE });
  }
  _fail(message) {
    ++this._token; this._starting = null; this._release();
    this._statusUpdate('error', message);
  }
  stop() {
    ++this._token; this._starting = null; this._release();
    this._statusUpdate('off', 'Camera off. Buttons and self-drive are ready.');
  }
}
