// Sound effects + music with separate volumes (saved per browser).
// Effects map: event name -> file in assets/sounds/<pack>/<file>.wav. The parlor pack is our own,
// synthesized by tools/art/build_sounds.py; audition every effect on /sounds.html.
import * as localMusic from './music.js';
import * as localAudio from './audio.js';
import { ACTIVATION_EVENTS, isActivation } from './audio.js';

// The site shell (index.html) owns the one audio graph and music player, so music plays through
// page changes and one tap unlocks sound for every screen. A screen shown inside the shell uses
// the shell's (window.top.dcAudio); a page opened on its own uses its own copy.
const local = { ...localMusic, ...localAudio };
function engine() {
  try { if (window.top !== window && window.top.dcAudio) return window.top.dcAudio; } catch { /* other origin */ }
  return local;
}

export const SOUND_PACK = 'assets/sounds/parlor';
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

const url = (id) => new URL(`${SOUND_PACK}/${id}.wav`, location.href).href;

/** Play an effect by event name. Overlapping plays are allowed. */
export function play(name) {
  const id = SFX[name];
  if (!id || volumes.muted || volumes.sfx <= 0) return;
  playEffect(id, volumes.sfx);
}

/** Play an effect by file id at a volume, whatever the settings (the sound board uses this). */
export function playEffect(id, volume = 1) {
  try { engine().effect(url(id), Math.min(1, volume)); } catch { /* audio unavailable */ }
}

export function setVolume(kind, value) {
  write(KEY[kind], value);
  if (kind === 'music') applyMusic();
}
export function setMuted(m) { write(KEY.muted, m); applyMusic(); }

/** Start or stop the music to match the settings. Before any gesture this only loads the song
 *  (and plays it if the browser allows); the first gesture starts it. */
export function applyMusic() {
  const v = volumes.muted ? 0 : volumes.music;
  const m = engine();
  if (v > 0) { m.setMusicVolume(v); m.startMusic(); } else m.stopMusic();
}

/** Browsers only allow sound after a user gesture. Every activating gesture (a mouse press, a
 *  lifted finger or pen, a key) calls the shell's gesture() synchronously inside the event, which
 *  iPhone and iPad need; it keeps trying on later gestures until sound is really playing. */
export function initAudio() {
  const kick = (e) => { if (isActivation(e)) { try { engine().gesture(); } catch { /* audio unavailable */ } } };
  for (const type of ACTIVATION_EVENTS) window.addEventListener(type, kick, { capture: true, passive: true });
  applyMusic();
  // Fetch the effects once the page itself has loaded, so they don't hold up its pictures.
  const fetchEffects = () => engine().preload(Object.values(SFX).map(url));
  if (document.readyState === 'complete') fetchEffects(); else window.addEventListener('load', fetchEffects, { once: true });
  // UI click sound for any real button.
  document.addEventListener('click', (e) => { if (e.target.closest('button.btn, .filters button') && !e.target.closest('[data-nosfx]')) play('click'); });
}
