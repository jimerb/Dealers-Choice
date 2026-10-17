// Sound effects + music with separate volumes (saved per browser).
// Effects map: event name -> file in assets/sounds/<pack>/<file>.wav. The parlor pack is our own,
// synthesized by tools/art/build_sounds.py; audition every effect on /sounds.html.
import * as localMusic from './music.js';

// The site shell (index.html) owns the one music player so it plays through page changes.
// A screen shown inside the shell drives that player; a page opened on its own uses its own copy.
function music() {
  try { if (window.top !== window && window.top.dcMusic) return window.top.dcMusic; } catch { /* other origin */ }
  return localMusic;
}

export const SOUND_PACK = '/assets/sounds/parlor';
export const SFX = {
  deal: 'deal',       // short card snap while dealing
  card: 'card',       // card played to the table
  flip: 'flip',       // card turned over
  shuffle: 'shuffle',
  trick: 'trick',     // trick gathered
  click: 'click',     // UI button
  bid: 'bid',
  pass: 'pass',
  score: 'score',
  chips: 'chips',
  win: 'win',
  lose: 'lose',
  error: 'error',
  bubble: 'bubble',   // Go Fish
  match: 'match',
};

const KEY = { sfx: 'dc.vol.sfx', music: 'dc.vol.music', muted: 'dc.vol.muted' };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };

export const volumes = {
  get sfx() { return Number(read(KEY.sfx, 0.7)); },
  get music() { return Number(read(KEY.music, 0.3)); },
  get muted() { return read(KEY.muted, 'false') === 'true'; },
};

const cache = new Map();
let unlocked = false;

function audio(id) {
  if (!cache.has(id)) { const a = new Audio(`${SOUND_PACK}/${id}.wav`); a.preload = 'auto'; cache.set(id, a); }
  return cache.get(id);
}

/** Play an effect by event name. Overlapping plays are allowed. */
export function play(name) {
  const id = SFX[name];
  if (!id || volumes.muted || volumes.sfx <= 0) return;
  try {
    const a = audio(id).cloneNode();
    a.volume = Math.min(1, volumes.sfx);
    a.play().catch(() => {});
  } catch { /* audio unavailable */ }
}

export function setVolume(kind, value) {
  write(KEY[kind], value);
  if (kind === 'music') applyMusic();
}
export function setMuted(m) { write(KEY.muted, m); applyMusic(); }

function applyMusic() {
  const v = volumes.muted ? 0 : volumes.music;
  if (!unlocked) return;
  if (v > 0) { music().startMusic(); music().setMusicVolume(v); } else music().stopMusic();
}

/** Browsers only allow audio after a user gesture: start music on the first click/key. */
export function initAudio() {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    applyMusic();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  // UI click sound for any real button.
  document.addEventListener('click', (e) => { if (e.target.closest('button.btn, .filters button') && !e.target.closest('[data-nosfx]')) play('click'); });
}
