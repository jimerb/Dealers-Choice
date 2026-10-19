// Slots (Brass Crown): reel strips, the pay table for every kind of line, the exact return by
// enumerating all 32^3 stops, and a few spins against a bank.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STRIPS, STOPS, SYMBOLS, PAY_ROWS, JACKPOT, JACKPOT_MAX, evaluate, payFor, rowPay, spin, lineAt, symbolAt, exactReturn, describe,
} from '../public/js/casino/engines/slots.js';
import { riggedRng, seededRng } from '../public/js/casino/kit/rng.js';
import { createMachine } from '../public/js/casino/kit/round.js';
import { createBank } from '../public/js/core/bank.js';
import mod, { layout } from '../public/js/casino/games/slots.js';

const L = (s) => s.split('');
const count = (reel, sym) => STRIPS[reel].filter((x) => x === sym).length;

test('three strips of 32 stops with the published symbol counts', () => {
  assert.equal(STRIPS.length, 3);
  for (const s of STRIPS) assert.equal(s.length, STOPS);
  const want = [
    { W: 1, D: 2, B: 3, H: 4, C: 5, R: 2, '-': 15 },
    { W: 1, D: 2, B: 3, H: 3, C: 4, R: 2, '-': 17 },
    { W: 1, D: 1, B: 2, H: 3, C: 4, R: 1, '-': 20 },
  ];
  want.forEach((w, i) => { for (const [sym, n] of Object.entries(w)) assert.equal(count(i, sym), n, `reel ${i + 1} ${sym}`); });
  for (const s of STRIPS) for (const sym of s) assert.ok(sym === '-' || SYMBOLS[sym], sym);
});

test('three of a kind pays its row; crowns alone pay the top award', () => {
  assert.deepEqual(evaluate(L('WWW')), { perCoin: 800, row: 'WWW', mult: 1, crowns: 3 });
  assert.equal(evaluate(L('DDD')).perCoin, 100);
  assert.equal(evaluate(L('BBB')).perCoin, 40);
  assert.equal(evaluate(L('HHH')).perCoin, 20);
  assert.equal(evaluate(L('CCC')).perCoin, 10);
  assert.equal(evaluate(L('RRR')).perCoin, 10);
  assert.equal(evaluate(L('BBB')).row, 'BBB');
});

test('crowns are wild for ingots, bells, horseshoes and clovers: x2 with one, x4 with two', () => {
  assert.deepEqual(evaluate(L('WDD')), { perCoin: 200, row: 'DDD', mult: 2, crowns: 1 });
  assert.deepEqual(evaluate(L('DWW')), { perCoin: 400, row: 'DDD', mult: 4, crowns: 2 });
  assert.equal(evaluate(L('BWB')).perCoin, 80);
  assert.equal(evaluate(L('WWB')).perCoin, 160);
  assert.equal(evaluate(L('HHW')).perCoin, 40);
  assert.equal(evaluate(L('WCW')).perCoin, 40);
  assert.equal(evaluate(L('CWC')).perCoin, 20);
});

test('any three mixed (no blanks, no cherries) pays 3, times the crowns', () => {
  assert.deepEqual(evaluate(L('DBC')), { perCoin: 3, row: 'ANY3', mult: 1, crowns: 0 });
  assert.equal(evaluate(L('HCC')).perCoin, 3);
  assert.equal(evaluate(L('WBC')).perCoin, 6);
  assert.equal(evaluate(L('WBC')).row, 'ANY3');
  assert.equal(evaluate(L('DCW')).perCoin, 6);
});

test('cherries: one pays 2, two pay 5, three pay 10; crowns are not wild for them', () => {
  assert.equal(evaluate(L('R--')).perCoin, 2);
  assert.equal(evaluate(L('-R-')).perCoin, 2);
  assert.equal(evaluate(L('RR-')).perCoin, 5);
  assert.equal(evaluate(L('R-R')).perCoin, 5);
  assert.equal(evaluate(L('RWR')).perCoin, 5, 'a crown does not complete cherries');
  assert.equal(evaluate(L('WWR')).perCoin, 2, 'two crowns and a cherry pay the one cherry');
  assert.equal(evaluate(L('RDD')).perCoin, 2, 'a cherry breaks the three of a kind');
  assert.equal(evaluate(L('RWR')).row, 'RR');
});

test('blanks break every line except cherries; no win is null', () => {
  for (const l of ['---', 'DD-', 'W-W', 'WW-', '-BB', 'C-C']) assert.deepEqual(evaluate(L(l)).perCoin, 0, l);
  assert.equal(evaluate(L('---')).row, null);
  assert.equal(describe(evaluate(L('---'))), 'No win');
  assert.equal(describe(evaluate(L('WDD'))), 'Three ingots with a crown (x2)');
  assert.equal(describe(evaluate(L('WWB'))), 'Three bells with two crowns (x4)');
});

test('coins multiply the pay; the third coin boosts the top award to 3,200', () => {
  assert.equal(payFor(L('BBB'), 1), 40);
  assert.equal(payFor(L('BBB'), 2), 80);
  assert.equal(payFor(L('BBB'), 3), 120);
  assert.equal(payFor(L('WWW'), 1), 800);
  assert.equal(payFor(L('WWW'), 2), 1600);
  assert.equal(payFor(L('WWW'), 3), JACKPOT_MAX);
  assert.equal(rowPay('WWW', 3), 3200);
  assert.equal(rowPay('WWW', 2), 1600);
  assert.equal(rowPay('R', 3), 6);
  assert.deepEqual(PAY_ROWS.map((r) => r.pay), [800, 100, 40, 20, 10, 3, 10, 5, 2]);
});

// An independent statement of the pay rule, checked against the engine on every one of the 32,768 lines.
function referencePay(l) {
  const w = l.filter((s) => s === 'W').length;
  if (w === 3) return JACKPOT;
  const r = l.filter((s) => s === 'R').length;
  let best = r === 3 ? 10 : r === 2 ? 5 : r === 1 ? 2 : 0;
  if (!l.includes('-') && !l.includes('R')) {
    const rest = l.filter((s) => s !== 'W');
    const mult = [1, 2, 4][w];
    const pay3 = { D: 100, B: 40, H: 20, C: 10 };
    best = Math.max(best, (new Set(rest).size === 1 ? pay3[rest[0]] : 3) * mult);
  }
  return best;
}

test('the engine agrees with the pay rule on every stop combination', () => {
  for (let a = 0; a < STOPS; a++) for (let b = 0; b < STOPS; b++) for (let c = 0; c < STOPS; c++) {
    const line = lineAt([a, b, c]);
    assert.equal(evaluate(line).perCoin, referencePay(line));
  }
});

test('exact return: 93.83% at one or two coins, 94.64% at three, hits 21.4%, jackpot 1 in 32,768', () => {
  const r = exactReturn();
  assert.equal(r.n, 32768);
  assert.ok(Math.abs(r.base - 0.9383) < 0.0001, `base ${(r.base * 100).toFixed(4)}%`);
  assert.ok(Math.abs(r.max - 0.9464) < 0.0001, `max coin ${(r.max * 100).toFixed(4)}%`);
  assert.ok(r.base > 0.92 && r.base < 0.95 && r.max > 0.92 && r.max < 0.95);
  assert.ok(Math.abs(r.hit - 0.214) < 0.0005, `hit ${(r.hit * 100).toFixed(3)}%`);
  assert.equal(r.jackpots, 1);
  // the distribution of per-coin pays
  const pct = (p) => ((r.dist[p] ?? 0) / r.n) * 100;
  const want = { 0: 78.60, 2: 14.10, 3: 4.71, 5: 0.75, 6: 0.95, 10: 0.26, 20: 0.28, 40: 0.20, 80: 0.10, 100: 0.01, 160: 0.02, 200: 0.02, 400: 0.02, 800: 0.003 };
  for (const [p, v] of Object.entries(want)) assert.ok(Math.abs(pct(p) - v) < 0.006, `pay ${p}: ${pct(p).toFixed(3)}%`);
  assert.deepEqual(Object.keys(r.dist).map(Number).sort((x, y) => x - y), Object.keys(want).map(Number));
});

test('a spin draws three fair stops and pays the line', () => {
  const crown = STRIPS.map((s) => s.indexOf('W'));
  const r = spin(riggedRng(crown), 3);
  assert.deepEqual(r.line, ['W', 'W', 'W']);
  assert.equal(r.won, 3200);
  assert.equal(r.row, 'WWW');
  assert.equal(symbolAt(0, crown[0], -1), STRIPS[0][crown[0] - 1]);
  assert.equal(symbolAt(2, 0, -1), STRIPS[2][31], 'the strip wraps round');
  assert.throws(() => spin(seededRng(1), 4), /one to 3 coins/);
  assert.throws(() => spin(seededRng(1), 0));
  // every stop comes up about equally often
  const rng = seededRng(42), seen = Array.from({ length: 3 }, () => new Array(STOPS).fill(0));
  const N = 64000;
  for (let i = 0; i < N; i++) spin(rng, 1).stops.forEach((s, j) => seen[j][s]++);
  for (const reel of seen) for (const n of reel) assert.ok(Math.abs(n - N / STOPS) < 0.12 * (N / STOPS), `stop count ${n}`);
});

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('credits: bet comes off the meter, wins go on, cash out returns dollars and stats agree', () => {
  const bank = createBank({ storage: memoryStorage(), win: null });
  const m = createMachine(bank, 'slots', 5);
  assert.equal(m.insert(100).ok, true);
  assert.equal(m.credits, 20);
  assert.equal(bank.balance, 4900);
  const rng = seededRng(9);
  let net = 0;
  for (let i = 0; i < 40 && m.credits >= 3; i++) {
    assert.ok(m.bet(3));
    const r = spin(rng, 3);
    m.pay(r.won);
    net += r.won - 3;
  }
  assert.equal(m.credits, 20 + net);
  const st = bank.get().stats.slots;
  assert.equal(st.net, net * 5);
  const out = m.cashOut();
  assert.equal(out.dollars, (20 + net) * 5);
  assert.equal(bank.balance, 4900 + out.dollars);
});

test('the module draws the cabinet with the pay table, reels and meters', () => {
  assert.equal(mod.ready, true);
  assert.equal(mod.credits, true);
  const s = layout({ coins: 3, win: 80, credits: 120, lit: 'BBB', stops: [0, 0, 0] });
  for (const t of ['BRASS CROWN', 'Crown Crown Crown', 'Any one cherry', 'CREDITS', '3,200', '>120<', '>80<']) assert.ok(s.includes(t), t);
  assert.match(s, /class="cz-sl-row lit"[^>]*data-row="BBB"/);
  assert.doesNotMatch(s, /undefined|NaN/);
});
