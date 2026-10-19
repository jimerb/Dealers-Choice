// Keno: hypergeometric catch odds, the exact return of every pay table, fair draws, scoring, and
// a run of games against a bank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAYS, NUMBERS, DRAWN, pCatch, expectedReturn, paysFor, checkTicket, draw, quickPick, score, play, pricesFor } from '../public/js/casino/engines/keno.js';
import { seededRng, riggedRng } from '../public/js/casino/kit/rng.js';
import { createRound } from '../public/js/casino/kit/round.js';
import { createBank } from '../public/js/core/bank.js';
import mod, { layout, stage } from '../public/js/casino/games/keno.js';

// C(n, k) with exact integers, independent of the engine's arithmetic
const C = (n, k) => { let r = 1n; for (let i = 0n; i < BigInt(k); i++) r = (r * (BigInt(n) - i)) / (i + 1n); return r; };

test('catch odds are hypergeometric and sum to one for every spot count', () => {
  const all = C(80, 20);
  for (let n = 1; n <= 10; n++) {
    let total = 0;
    for (let k = 0; k <= n; k++) {
      const exact = Number(C(n, k) * C(80 - n, 20 - k)) / Number(all);
      assert.ok(Math.abs(pCatch(n, k) - exact) < 1e-12, `${n} spots, catch ${k}`);
      total += pCatch(n, k);
    }
    assert.ok(Math.abs(total - 1) < 1e-12, `${n} spots sum ${total}`);
  }
  assert.ok(Math.abs(pCatch(1, 1) - 0.25) < 1e-12);
  assert.ok(Math.abs(1 / pCatch(10, 10) - 8911711.18) < 0.01, 'ten of ten is 1 in 8,911,711');
  assert.equal(pCatch(3, 4), 0);
});

test('the exact return of each pay table matches the published figure, all between 70% and 80%', () => {
  const want = { 1: 75.0, 2: 72.2, 3: 74.9, 4: 75.3, 5: 75.1, 6: 77.0, 7: 74.1, 8: 76.1, 9: 78.2, 10: 75.8 };
  for (const [n, pct] of Object.entries(want)) {
    const r = expectedReturn(Number(n)) * 100;
    assert.ok(Math.abs(r - pct) < 0.05 + 1e-9, `${n} spots: ${r.toFixed(3)}%`);
    assert.ok(r > 70 && r < 80, `${n} spots in 70-80%`);
  }
});

test('pay tables: the published pays for every spot count', () => {
  assert.deepEqual(PAYS[1], { 1: 3 });
  assert.deepEqual(PAYS[2], { 2: 12 });
  assert.deepEqual(PAYS[5], { 3: 1, 4: 12, 5: 810 });
  assert.deepEqual(PAYS[10], { 5: 2, 6: 22, 7: 140, 8: 1000, 9: 5000, 10: 100000 });
  assert.equal(paysFor(8, 8), 25000);
  assert.equal(paysFor(9, 9), 50000);
  assert.equal(paysFor(7, 3), 0);
  assert.equal(paysFor(4, 2), 1, 'two of four gives the ticket back');
  assert.equal(Object.keys(PAYS).length, 10);
});

test('a ticket is 1 to 10 distinct numbers from 1 to 80', () => {
  assert.throws(() => checkTicket([]), /at least one/);
  assert.throws(() => checkTicket([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), /at most 10/);
  assert.throws(() => checkTicket([5, 5]), /only once/);
  assert.throws(() => checkTicket([0]), /not a number/);
  assert.throws(() => checkTicket([81]), /not a number/);
  assert.doesNotThrow(() => checkTicket([1, 80]));
});

test('a draw is twenty distinct numbers from 1 to 80', () => {
  const rng = seededRng(3);
  for (let i = 0; i < 2000; i++) {
    const b = draw(rng);
    assert.equal(b.length, DRAWN);
    assert.equal(new Set(b).size, DRAWN);
    for (const n of b) assert.ok(Number.isInteger(n) && n >= 1 && n <= NUMBERS);
  }
});

test('every number is drawn equally often (each comes up a quarter of the time)', () => {
  const rng = seededRng(11), N = 20000, seen = new Array(81).fill(0);
  const first = new Array(81).fill(0);
  for (let i = 0; i < N; i++) { const b = draw(rng); for (const n of b) seen[n]++; first[b[0]]++; }
  const expect = N / 4;
  let chi = 0;
  for (let n = 1; n <= 80; n++) {
    assert.ok(Math.abs(seen[n] - expect) < 0.06 * expect, `${n}: ${seen[n]}`);
    chi += (first[n] - N / 80) ** 2 / (N / 80);
  }
  assert.ok(chi < 130, `the first ball is uniform too (chi-square ${chi.toFixed(1)}, 79 degrees of freedom)`);
});

test('quick pick: n distinct sorted numbers', () => {
  const p = quickPick(7, seededRng(5));
  assert.equal(p.length, 7);
  assert.equal(new Set(p).size, 7);
  assert.deepEqual(p, [...p].sort((a, b) => a - b));
  assert.throws(() => quickPick(11, seededRng(1)));
  assert.throws(() => quickPick(0, seededRng(1)));
});

test('scoring: catches in draw order, pays for 1 times the price, rounded down', () => {
  const balls = [7, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  assert.deepEqual(score([7, 1, 50], balls, 5), { spots: 3, caught: [7, 1], catches: 2, perOne: 1, wagered: 5, returned: 5 });
  assert.equal(score([1], balls, 2).returned, 6);
  assert.equal(score([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], balls, 1).returned, 100000);
  assert.equal(score([1, 2, 3, 4, 5, 60, 61, 62, 63, 64], balls, 25).returned, 50);
  assert.equal(score([60, 61], balls, 10).returned, 0);
});

test('a played game uses the rng: rigged balls give the expected catches', () => {
  // the partial shuffle picks index i + int(80 - i): rig the first draws to take 1, 2, 3 ... in order
  const r = play([1, 2, 3], 5, riggedRng(new Array(20).fill(0)));
  assert.deepEqual(r.balls.slice(0, 3), [1, 2, 3]);
  assert.equal(r.catches, 3);
  assert.equal(r.returned, 44 * 5);
  assert.throws(() => play([1], 0, seededRng(1)), /price/);
});

test('ticket prices at each denomination', () => {
  assert.deepEqual(pricesFor(1), [1, 2, 5, 10, 25]);
  assert.deepEqual(pricesFor(5), [5, 10, 25, 50, 100]);
  assert.deepEqual(pricesFor(25), [25, 50, 100, 250]);
});

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('a run of games: each is debited when it starts and paid when it is drawn', () => {
  const bank = createBank({ storage: memoryStorage(), win: null });
  const round = createRound(bank, 'keno');
  const rng = seededRng(21);
  let net = 0;
  for (let g = 0; g < 20; g++) {
    assert.ok(round.wager(5));
    assert.equal(round.atRisk, 5);
    const r = play([3, 17, 22, 41, 59, 77], 5, rng);
    round.settle({ returned: r.returned });
    net += r.returned - 5;
    assert.equal(round.onTable, 0, 'nothing is left on the table between games');
  }
  assert.equal(bank.balance, 5000 + net);
  assert.equal(bank.get().stats.keno.hands, 20);
  assert.equal(bank.get().stats.keno.net, net);
});

test('the module draws the board, the blower and the ticket', () => {
  assert.equal(mod.ready, true);
  assert.equal(mod.credits, false);
  const b = layout({ marks: [5, 80], drawn: [5, 6], tall: false });
  for (const t of ['>1<', '>80<', 'data-n="80"']) assert.ok(b.includes(t), t);
  assert.match(b, /data-n="5" class="cz-kn-cell mk dr ct"/);
  assert.match(b, /data-n="6" class="cz-kn-cell dr"/);
  const tall = layout({ tall: true });
  assert.ok(tall.includes('data-n="80"'));
  const s = stage();
  assert.ok(s.includes('Ticket'));
  assert.doesNotMatch(b + tall + s, /undefined|NaN/);
});
