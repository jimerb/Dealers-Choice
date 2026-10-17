// Music and sound: the playlist, which events unlock sound, and the unlock flow (with small fakes
// standing in for the browser's audio element and Web Audio context).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---- fakes, installed before the modules load
let activated = false;   // is the browser handling a user gesture right now?
const contexts = [], audios = [];
class FakeParam {
  constructor(v) { this.value = v; }
  cancelScheduledValues() {}
  setValueAtTime(v) { this.value = v; }
  linearRampToValueAtTime(v) { this.value = v; }
}
class FakeNode { connect(n) { this.out = n; return n; } }
class FakeContext {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 48000; this.destination = new FakeNode(); this.started = []; this.resumes = 0; contexts.push(this); }
  resume() { this.resumes++; if (activated) this.state = 'running'; return Promise.resolve(); }
  createGain() { const n = new FakeNode(); n.gain = new FakeParam(1); n.context = this; return n; }
  createBufferSource() { const n = new FakeNode(); n.start = () => this.started.push(n.buffer); return n; }
  createBuffer() { return { silent: true }; }
  createMediaElementSource(el) { const n = new FakeNode(); n.el = el; this.media = n; return n; }
  decodeAudioData(data) { return Promise.resolve({ decodedBytes: data.byteLength }); }
}
class FakeAudio {
  constructor() { Object.assign(this, { paused: true, volume: 1, currentTime: 0, readyState: 0, ended: false, src: '', plays: 0, on: {} }); audios.push(this); }
  addEventListener(type, fn) { (this.on[type] ||= []).push(fn); }
  emit(type) { (this.on[type] || []).forEach((fn) => fn()); }
  play() { this.plays++; if (!activated) return Promise.reject(new Error('NotAllowedError')); this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
const store = new Map();
Object.assign(globalThis, {
  window: { AudioContext: FakeContext, addEventListener() {} },
  document: { addEventListener() {}, visibilityState: 'visible' },
  Audio: FakeAudio,
  sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
  fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }),
});
const music = await import('../public/js/core/music.js');
const audio = await import('../public/js/core/audio.js');
const { TRACKS, shuffled, restore, nextSong } = music;

const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
const tick = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const n = TRACKS.length;

test('a shuffle is a full order that never starts with the song to avoid', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const avoid = seed % n;
    const order = shuffled(n, avoid, seeded(seed));
    assert.deepEqual([...order].sort((a, b) => a - b), [...Array(n).keys()]);
    assert.notEqual(order[0], avoid);
  }
});

test('the playlist plays every song once per round and never the same song twice in a row', () => {
  const rng = seeded(7);
  let s = { order: shuffled(n, -1, rng), pos: 0, t: 0 };
  const played = [s.order[s.pos]];
  for (let i = 0; i < 60 * n - 1; i++) { s = nextSong(s, n, rng); played.push(s.order[s.pos]); assert.equal(s.t, 0); }
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1], `repeat at ${i}`);
  for (let r = 0; r < played.length; r += n) assert.equal(new Set(played.slice(r, r + n)).size, n, `round at ${r}`);
});

test('a saved position is restored only when it is valid', () => {
  assert.deepEqual(restore({ order: [1, 0, 2, 3, 4, 5], pos: 2, t: 61.5 }, n), { order: [1, 0, 2, 3, 4, 5], pos: 2, t: 61.5 });
  assert.equal(restore({ order: [1, 0, 2, 3, 4, 5], pos: 2, t: -4 }, n).t, 0);
  for (const bad of [null, {}, { order: [0, 1, 2], pos: 0 }, { order: [0, 0, 2, 3, 4, 5], pos: 0 }, { order: [0, 1, 2, 3, 4, 5], pos: 6 }, { order: [0, 1, 2, 3, 4, 5], pos: 1.5 }]) {
    assert.equal(restore(bad, n), null, JSON.stringify(bad));
  }
});

test('sound unlocks on a mouse press, a lifted finger or pen, a key or a click, not a finger going down', () => {
  const yes = [{ type: 'pointerdown', pointerType: 'mouse' }, { type: 'pointerup', pointerType: 'touch' }, { type: 'pointerup', pointerType: 'pen' },
    { type: 'touchend' }, { type: 'click' }, { type: 'keydown', key: 'Enter' }, { type: 'keydown', key: ' ' }];
  const no = [{ type: 'pointerdown', pointerType: 'touch' }, { type: 'pointerdown', pointerType: 'pen' }, { type: 'pointerup', pointerType: 'mouse' },
    { type: 'touchstart' }, { type: 'keydown', key: 'Escape' }, { type: 'scroll' }, { type: 'wheel' }];
  for (const e of yes) assert.equal(audio.isActivation(e), true, JSON.stringify(e));
  for (const e of no) assert.equal(audio.isActivation(e), false, JSON.stringify(e));
  for (const e of yes) assert.ok(audio.ACTIVATION_EVENTS.includes(e.type), `listens for ${e.type}`);
});

test('music loads at once, waits for a gesture, starts inside it, and retries until it plays', async () => {
  store.set('dc.music.session', JSON.stringify({ order: [3, 0, 1, 2, 4, 5], pos: 1, t: 42.5 }));
  music.setMusicVolume(0.3);
  music.startMusic();                              // the shell, as soon as it opens
  const el = audios[0];
  assert.equal(audios.length, 1);
  assert.equal(el.src, 'assets/music/parlor/1-card-game-swing.mp3#t=42.5', 'resumes mid-song');
  assert.equal(el.plays, 1, 'tries to play straight away');
  await tick();
  assert.equal(el.paused, true, 'the browser said no: still waiting');
  assert.equal(audio.audioContext(), null, 'no audio context before a gesture');
  audio.effect('x.wav');                           // nothing to play into yet: skipped, not queued
  music.startMusic();                              // a screen asking again changes nothing
  assert.equal(audios.length, 1);

  audio.gesture();                                 // a gesture the browser doesn't honour
  const ctx = contexts[0];
  assert.ok(ctx && ctx.media && ctx.media.el === el, 'the song is routed through the context');
  assert.equal(ctx.state, 'suspended');
  await tick();
  assert.equal(el.paused, true);

  activated = true;                                // a real tap: everything starts inside it
  const before = el.plays;
  audio.gesture();
  assert.equal(el.plays, before + 1, 'play() is called synchronously within the gesture');
  assert.equal(el.paused, false);
  assert.equal(ctx.state, 'running');
  assert.equal(contexts.length, 1, 'one shared context');
  const gain = ctx.media.out.gain;
  assert.equal(ctx.media.out.out, ctx.destination);
  assert.equal(el.volume, 1, 'the element plays at full volume; the gain node sets the level');
  await tick();
  assert.equal(gain.value, 0.3, 'faded up to the music volume');

  audio.gesture();                                 // later gestures leave a playing song alone
  assert.equal(el.plays, before + 1);

  music.setMusicVolume(0.6);
  assert.equal(gain.value, 0.6, 'the slider sets the gain');
  music.stopMusic();
  assert.equal(gain.value, 0, 'mute fades the gain out');
  await sleep(450);
  assert.equal(el.paused, true, 'then pauses');
  music.startMusic();
  assert.equal(el.paused, false);
  await tick();
  assert.equal(gain.value, 0.6, 'unmute fades back to the volume');

  el.emit('ended');                                // next song loads during the gap, from the start
  assert.match(el.src, /assets\/music\/parlor\/2-warm-swing\.mp3$/);
});

test('effects play from decoded buffers once sound is unlocked', async () => {
  const ctx = contexts[0];
  audio.effect('assets/sounds/parlor/card.wav', 0.5);
  await sleep(5);
  assert.equal(ctx.started.filter((b) => b && b.decodedBytes).length, 1, 'decoded, then played');
  audio.effect('assets/sounds/parlor/card.wav', 0.5);
  assert.equal(ctx.started.filter((b) => b && b.decodedBytes).length, 2, 'the second play is instant');
  assert.equal(audio.audioStatus().context, 'running');
});
