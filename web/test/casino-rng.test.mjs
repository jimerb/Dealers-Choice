// The casino's randomness: fair ints from crypto, seeded and rigged rngs for tests, Fisher-Yates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, cryptoRng, seededRng, riggedRng, shuffle, sample, rollDie } from '../public/js/casino/kit/rng.js';
import { spin, WHEEL } from '../public/js/casino/engines/roulette.js';

test('randomInt throws away values that would bias the result', () => {
  // 2^32 - 1 is at or above the last multiple of 38: rejected, then 39 -> 1
  const seq = [0xffffffff, 39];
  let i = 0;
  assert.equal(randomInt(38, (a) => { a[0] = seq[i++]; }), 1);
  assert.equal(i, 2);
});

test('cryptoRng rejects biased words too, and fetches words in blocks', () => {
  let calls = 0;
  const words = [0xffffffff, 5];
  const r = cryptoRng((a) => { calls++; a.fill(0); a[0] = words[0]; a[1] = words[1]; });
  assert.equal(r.int(38), 5);
  for (let k = 0; k < 254; k++) r.int(10);
  assert.equal(calls, 1, 'one fill for 256 words');
  r.int(10);
  assert.equal(calls, 2);
  assert.throws(() => r.int(0), RangeError);
  const f = cryptoRng().float();
  assert.ok(f >= 0 && f < 1);
});

test('seededRng repeats itself from the same seed', () => {
  const a = seededRng(42), b = seededRng(42), c = seededRng(43);
  const take = (r) => Array.from({ length: 20 }, () => r.int(1000));
  const x = take(a);
  assert.deepEqual(x, take(b));
  assert.notDeepEqual(x, take(c));
});

test('ints are close to uniform (chi-square, seeded)', () => {
  const r = seededRng(9), n = 6, N = 60_000;
  const counts = new Array(n).fill(0);
  for (let i = 0; i < N; i++) counts[r.int(n)]++;
  const chi = counts.reduce((t, c) => t + (c - N / n) ** 2 / (N / n), 0);
  assert.ok(chi < 20.5, `chi-square ${chi.toFixed(2)} (5 d.f., p = 0.001 cut-off 20.5)`);
});

test('riggedRng hands out the listed draws, then carries on', () => {
  const r = riggedRng([3, 0, 5]);
  assert.equal(r.int(6), 3);
  assert.equal(r.int(6), 0);
  assert.throws(() => r.int(5), RangeError, 'a rigged 5 is not a draw from 0 to 4');
  const n = r.int(6);
  assert.ok(n >= 0 && n < 6);
});

test('shuffle is a permutation and every order of 3 comes up evenly', () => {
  const r = seededRng(5);
  const tally = new Map();
  for (let i = 0; i < 60_000; i++) { const k = shuffle(['a', 'b', 'c'], r).join(''); tally.set(k, (tally.get(k) ?? 0) + 1); }
  assert.equal(tally.size, 6);
  for (const v of tally.values()) assert.ok(Math.abs(v - 10_000) < 500, `${v}`);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const s = shuffle(deck, r);
  assert.deepEqual([...s].sort((x, y) => x - y), deck);
  assert.notDeepEqual(s, deck);
});

test('sample draws k distinct items; dice roll 1 to 6', () => {
  const r = seededRng(3);
  const balls = sample(Array.from({ length: 80 }, (_, i) => i + 1), 20, r);
  assert.equal(new Set(balls).size, 20);
  for (let i = 0; i < 200; i++) { const d = rollDie(r); assert.ok(d >= 1 && d <= 6); }
});

test('roulette spins through the injected rng', () => {
  assert.equal(spin(riggedRng([0])), WHEEL[0]);
  assert.equal(spin(riggedRng([37])), WHEEL[37]);
});
