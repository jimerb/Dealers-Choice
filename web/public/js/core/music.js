// Background music: our own tracks in assets/music/parlor, played as a shuffled playlist.
// The order is shuffled once per browser session (sessionStorage, so one per tab) and kept across
// pages, so moving between the lobby and a game carries on with the same song from where it was.
// When the list runs out it is reshuffled, never starting with the song that just played, so no
// song ever plays twice in a row.
//
// Starting quickly: startMusic() loads the song straight away (the shell calls it as soon as it
// opens) and tries to play; if the browser wants a gesture first, the next tap, click or key plays
// it at once (see audio.js gesture()). Once the audio context exists the song plays through a gain
// node, so volume and fades also work on iPhone and iPad.
import { audioContext, onGesture } from './audio.js';

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
const FADE_MS = 1500;   // fade in on start
const STOP_MS = 400;    // fade out on stop
const SLIDE_MS = 80;    // volume slider changes glide, so they don't click

let el = null, bus = null, file = null, state = null, volume = 0.3, wanted = false;
let fadeTimer = null, doneTimer = null, failures = 0, buffering = 'metadata';

// ---- playlist (pure, so it can be tested)

/** A shuffled order of n songs that doesn't start with avoidFirst. */
export function shuffled(n, avoidFirst = -1, rng = Math.random) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (n > 1 && order[0] === avoidFirst) {
    const k = 1 + Math.floor(rng() * (n - 1));
    [order[0], order[k]] = [order[k], order[0]];
  }
  return order;
}

/** A saved playlist position if it is valid for n songs, else null. */
export function restore(s, n) {
  const ok = s && Array.isArray(s.order) && s.order.length === n
    && [...s.order].sort((a, b) => a - b).every((v, i) => v === i)
    && Number.isInteger(s.pos) && s.pos >= 0 && s.pos < n;
  return ok ? { order: s.order, pos: s.pos, t: Math.max(0, Number(s.t) || 0) } : null;
}

/** The position after the current song ends: the next song, or a fresh shuffle. */
export function nextSong(s, n, rng = Math.random) {
  if (s.pos + 1 < n) return { order: s.order, pos: s.pos + 1, t: 0 };
  return { order: shuffled(n, s.order[n - 1], rng), pos: 0, t: 0 };
}

function load() {
  try { return restore(JSON.parse(sessionStorage.getItem(KEY)), TRACKS.length) ?? fresh(); } catch { return fresh(); }
}
const fresh = () => ({ order: shuffled(TRACKS.length), pos: 0, t: 0 });

function save(keepTime = true) {
  if (!state) return;
  if (keepTime && el && file && !el.ended && el.readyState >= 1) state.t = el.currentTime;
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

const current = () => TRACKS[state.order[state.pos]];

function advance() {
  state = nextSong(state, TRACKS.length);
  save(false);
}

// ---- the player

function element() {
  if (el) return el;
  el = new Audio();
  el.preload = buffering;
  el.addEventListener('ended', () => {
    failures = 0;
    advance();
    cue();   // start loading the next song during the gap
    setTimeout(() => { if (wanted && el.paused) play(); }, GAP_MS);
  });
  el.addEventListener('error', () => {
    file = null;   // load it again next time
    if (!wanted || ++failures >= TRACKS.length) return; // every track failing: give up quietly
    advance(); cue(); play();
  });
  return el;
}

/** Load the current song (a reload resumes mid-song through a media fragment, #t=seconds). */
function cue() {
  const f = current().file;
  if (file === f) return;
  file = f;
  el.src = BASE + f + (state.t > 1 ? `#t=${state.t.toFixed(1)}` : '');
}

/** Route the element through a gain node once the shared audio context exists. */
function attach(c) {
  if (bus || !c || !el) return;
  try {
    const g = c.createGain();
    c.createMediaElementSource(el).connect(g);
    g.connect(c.destination);
    clearInterval(fadeTimer); fadeTimer = null;
    g.gain.value = wanted && !el.paused ? volume : 0;
    el.volume = 1;
    bus = g;
  } catch { /* keep playing the element directly */ }
}

/** Set the music level, gliding over ms; then call done. */
function level(v, ms = 0, done) {
  clearInterval(fadeTimer); fadeTimer = null;
  clearTimeout(doneTimer); doneTimer = done ? setTimeout(() => { doneTimer = null; done(); }, ms) : null;
  if (bus) {
    const g = bus.gain, now = bus.context.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(v, now + ms / 1000);
    return;
  }
  if (!el) return;
  if (!ms) { el.volume = v; return; }
  // No Web Audio: step the element's own volume.
  const from = el.volume, startAt = performance.now();
  fadeTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - startAt) / ms);
    el.volume = from + (v - from) * k;
    if (k >= 1) { clearInterval(fadeTimer); fadeTimer = null; }
  }, 50);
}

/** Try to play now. A browser that wants a gesture first rejects it, leaving the element paused,
 *  so the next gesture tries again (it only counts as started once it is really playing). */
function play() {
  level(0);
  let p;
  try { p = el.play(); } catch (err) { p = Promise.reject(err); }
  Promise.resolve(p).then(() => {
    if (!wanted) el.pause(); else level(volume, FADE_MS);
  }, () => { /* blocked or interrupted: wait for the next gesture */ });
}

// Every gesture: route through the shared context, and start the song if it is still waiting.
onGesture((c) => {
  if (!el) return;
  attach(c);
  if (wanted && el.paused) play();
});

/** Buffer the song ahead (the shell calls this once the first screen has loaded, so the song
 *  doesn't hold up the lobby's pictures; until then only its header is fetched). */
export function bufferMusic() {
  buffering = 'auto';
  if (el) el.preload = 'auto';
}

/** Load the session's song and start it as soon as the browser allows. Safe to call repeatedly. */
export function startMusic() {
  wanted = true;
  state = state ?? load();
  element();
  cue();
  attach(audioContext());
  if (el.paused) play(); else if (doneTimer) level(volume, FADE_MS);   // a stop still fading out: fade back in
}

export function stopMusic() {
  wanted = false;
  if (!el) return;
  save();
  level(0, STOP_MS, () => { if (!wanted) el.pause(); });
}

export function setMusicVolume(v) {
  if (Number(v) === volume) return;   // every screen sets it on load: leave a fade in progress alone
  volume = Number(v);
  if (el && wanted && !el.paused) level(volume, SLIDE_MS);
}

/** Title of the song playing now (or next), for display. */
export function nowPlaying() {
  return state ? current().title : null;
}

/** Player state, for a "now playing" display or debugging. */
export function musicStatus() {
  return {
    playing: wanted, title: nowPlaying(), time: el ? el.currentTime : 0, paused: el ? el.paused : true,
    volume, gain: bus ? bus.gain.value : (el ? el.volume : 0), routed: Boolean(bus),
  };
}

// Remember the song and position when leaving the page, so the next page carries on.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => save());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
}
