// Background music: our own tracks in assets/music/parlor, played as a shuffled playlist.
// The order is shuffled once per browser session (sessionStorage, so one per tab) and kept across
// pages, so moving between the lobby and a game carries on with the same song from where it was.
// When the list runs out it is reshuffled, never starting with the song that just played, so no
// song ever plays twice in a row.

export const TRACKS = [
  { file: '1-card-game-swing.mp3', title: 'Card Game Swing' },
  { file: '2-warm-swing.mp3', title: 'Warm Swing' },
  { file: '3-smooth-card-flow.mp3', title: 'Smooth Card Flow' },
  { file: '4-delicate-piano-motif.mp3', title: 'Delicate Piano Motif' },
  { file: '5-gentle-groove.mp3', title: 'Gentle Groove' },
  { file: '6-delicate-piano-motif2.mp3', title: 'Delicate Piano Motif II' },
];
const BASE = 'assets/music/parlor/';
const KEY = 'dc.music.session';
const GAP_MS = 1500;    // silence between songs
const FADE_MS = 1500;   // fade in on start, fade out on stop

let el = null, state = null, volume = 0.3, playing = false, fadeTimer = null, failures = 0;

function shuffled(avoidFirst = -1) {
  const order = TRACKS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.length > 1 && order[0] === avoidFirst) {
    const k = 1 + Math.floor(Math.random() * (order.length - 1));
    [order[0], order[k]] = [order[k], order[0]];
  }
  return order;
}

function load() {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY));
    const ok = s && Array.isArray(s.order) && s.order.length === TRACKS.length
      && [...s.order].sort((a, b) => a - b).every((v, i) => v === i)
      && Number.isInteger(s.pos) && s.pos >= 0 && s.pos < TRACKS.length;
    if (ok) return { order: s.order, pos: s.pos, t: Number(s.t) || 0 };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { order: shuffled(), pos: 0, t: 0 };
}

function save(keepTime = true) {
  if (!state) return;
  if (keepTime && el && el.src && !el.ended) state.t = el.currentTime;
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const current = () => TRACKS[state.order[state.pos]];

function fadeTo(target, ms, done) {
  clearInterval(fadeTimer);
  const from = el.volume, start = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - start) / ms);
    el.volume = from + (target - from) * k;
    if (k >= 1) { clearInterval(fadeTimer); fadeTimer = null; done?.(); }
  }, 50);
}

function advance() {
  state.pos++;
  state.t = 0;
  if (state.pos >= TRACKS.length) {
    state.order = shuffled(state.order[TRACKS.length - 1]);
    state.pos = 0;
  }
  save(false);
}

function playCurrent() {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.addEventListener('ended', () => { failures = 0; advance(); setTimeout(() => playing && playCurrent(), GAP_MS); });
    el.addEventListener('error', () => {
      if (!playing || ++failures >= TRACKS.length) return; // every track failing: give up quietly
      advance(); playCurrent();
    });
  }
  const src = BASE + current().file;
  const resumeAt = state.t;
  if (!el.src.endsWith(src)) el.src = src;
  const begin = () => {
    const at = resumeAt < (el.duration || Infinity) - 2 ? resumeAt : 0;   // a stale position past the end restarts the song
    if (at > 0 && Math.abs(el.currentTime - at) > 1) el.currentTime = at;
    el.volume = 0;
    el.play().then(() => fadeTo(volume, FADE_MS)).catch(() => {});
  };
  if (el.readyState >= 1) begin(); else el.addEventListener('loadedmetadata', begin, { once: true });
}

export function startMusic() {
  if (playing) return;
  playing = true;
  state = state ?? load();
  playCurrent();
}

export function stopMusic() {
  playing = false;
  if (!el) return;
  save();
  fadeTo(0, 400, () => el.pause());
}

export function setMusicVolume(v) {
  volume = Number(v);
  if (el && playing && !fadeTimer) el.volume = volume;
}

/** Title of the song playing now (or next), for display. */
export function nowPlaying() {
  return state ? current().title : null;
}

/** Player state, for a "now playing" display or debugging. */
export function musicStatus() {
  return { playing, title: nowPlaying(), time: el ? el.currentTime : 0, paused: el ? el.paused : true };
}

// Remember the song and position when leaving the page, so the next page carries on.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}
