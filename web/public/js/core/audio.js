// One shared Web Audio graph for the whole site. Music and effects play through gain nodes on a
// single AudioContext, so volumes, mute and fades work everywhere (iPhone and iPad ignore an
// audio element's own volume), effects start instantly from decoded buffers, and one tap unlocks
// sound for every screen. The site shell (index.html) owns it; screens reach it through
// window.top.dcAudio (see sound.js). Without Web Audio, music and effects use plain audio elements.

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : undefined;
const RESUME_GRACE_MS = 1000;  // effects asked for just after a gesture wait for the context to start

let ctx = null, armedAt = -Infinity;
const hooks = [];             // run on every gesture (music.js starts a blocked song here)
const bytes = new Map();      // url -> Promise<ArrayBuffer|null>, fetched before the context exists
const buffers = new Map();    // url -> AudioBuffer, or a Promise while decoding
const elements = new Map();   // url -> HTMLAudioElement, when there is no Web Audio

/** The events that let a page start sound (HTML user activation). */
export const ACTIVATION_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];

/** Does this event let the page start sound? A mouse press, a lifted finger or pen, a key (not
 *  Escape), or a click. A finger going down does not count: it may turn out to be a scroll. */
export function isActivation(e) {
  switch (e.type) {
    case 'pointerdown': return e.pointerType === 'mouse';
    case 'pointerup': return e.pointerType !== 'mouse';
    case 'keydown': return e.key !== 'Escape';
    case 'touchend': case 'click': return true;
    default: return false;
  }
}

/** Did this event really let the page start sound? A touch that ended a scroll did not, which
 *  the window's navigator.userActivation can tell; browsers without it get the benefit of the
 *  doubt. Pass the navigator of the window the event happened in. */
export function activates(e, nav) {
  return isActivation(e) && (!nav || !nav.userActivation || nav.userActivation.isActive);
}

/** The shared context, or null before the first gesture (or without Web Audio). */
export const audioContext = () => ctx;

function create() {
  if (ctx || !AC) return ctx;
  try {
    ctx = new AC({ latencyHint: 'interactive' });
    // iPhone/iPad: play like a media player, even with the ringer switch on silent.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
  } catch { ctx = null; }
  return ctx;
}

/** Call synchronously from a user gesture handler (it may run in a screen's frame): creates or
 *  restarts the context and runs the gesture hooks, which start any blocked music. Safe to call
 *  on every gesture; it does nothing once sound is running. */
export function gesture() {
  const c = create();
  if (c && c.state !== 'running') {
    armedAt = performance.now();
    c.resume().catch(() => {});
    // iOS: a sound started inside the gesture unlocks the output.
    try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0); } catch { /* ignore */ }
  }
  for (const fn of hooks) fn(c);
}

export function onGesture(fn) { hooks.push(fn); }

/** Fetch effect files ahead of time (decoded once the context exists). */
export function preload(urls) {
  for (const url of urls) {
    if (bytes.has(url) || buffers.has(url)) continue;
    bytes.set(url, fetch(url, { priority: 'low' }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  }
}

function decode(data) {
  // Older Safari only has the callback form.
  return new Promise((res, rej) => { const p = ctx.decodeAudioData(data, res, rej); if (p && p.then) p.then(res, rej); });
}

function buffer(url) {
  if (!buffers.has(url)) {
    preload([url]);
    const p = bytes.get(url)
      .then((data) => (data ? decode(data) : null))
      .then((buf) => { if (buf) buffers.set(url, buf); else buffers.delete(url); return buf; }, () => { buffers.delete(url); return null; });
    bytes.delete(url);   // decoding takes the bytes; a failure fetches them again next time
    buffers.set(url, p);
  }
  return buffers.get(url);
}

function start(buf, volume) {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = volume;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

function elementEffect(url, volume) {
  try {
    if (!elements.has(url)) { const a = new Audio(url); a.preload = 'auto'; elements.set(url, a); }
    const a = elements.get(url).cloneNode();
    a.volume = volume;
    a.play().catch(() => {});
  } catch { /* audio unavailable */ }
}

/** Play an effect file at a volume (0..1); overlapping plays are fine. Before the first gesture
 *  there is nothing to play into, so the effect is skipped rather than queued up. */
export function effect(url, volume = 1) {
  if (!AC) { elementEffect(url, volume); return; }
  if (!ctx || (ctx.state !== 'running' && performance.now() - armedAt > RESUME_GRACE_MS)) return;
  const buf = buffer(url);
  if (!(buf instanceof Promise)) { start(buf, volume); return; }
  const asked = performance.now();
  buf.then((b) => { if (b && performance.now() - asked < 300) start(b, volume); });  // late is better than never, but not much later
}

/** Context state, for a status display or debugging. */
export function audioStatus() {
  return { webAudio: Boolean(AC), context: ctx ? ctx.state : 'none', effectsLoaded: [...buffers.values()].filter((b) => !(b instanceof Promise)).length };
}

// Coming back to the page (or the phone after a call) can leave the context suspended: try to
// restart it; if the browser wants a gesture first, the next tap does it.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  });
}
