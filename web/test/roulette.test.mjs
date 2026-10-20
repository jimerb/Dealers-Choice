// Roulette rules engine: pockets, colours, bet wins, payouts, limits and the random spin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POCKETS, WHEEL, WHEELS, RED, colorOf, wins, payout, settle, checkLimits, randomInt, spin, isBetKey, betName, columnOf, playSpin, covers, allBets, OPTIONS } from '../public/js/casino/engines/roulette.js';
import { seededRng, riggedRng } from '../public/js/casino/kit/rng.js';
import { createBank, KEY, HALL_OF_FAME_AT } from '../public/js/core/bank.js';

test('38 pockets: 0, 00 and 1-36, each once on the wheel', () => {
  assert.equal(POCKETS.length, 38);
  assert.equal(WHEEL.length, 38);
  assert.deepEqual([...WHEEL].sort(), [...POCKETS].sort());
  assert.equal(RED.size, 18);
});

test('colours: 0 and 00 green, the standard reds, the rest black', () => {
  assert.equal(colorOf('0'), 'green');
  assert.equal(colorOf('00'), 'green');
  assert.equal(colorOf('1'), 'red');
  assert.equal(colorOf('2'), 'black');
  assert.equal(colorOf('36'), 'red');
  assert.equal(POCKETS.filter((p) => colorOf(p) === 'black').length, 18);
});

test('straight up pays 35 to 1, only on its own number', () => {
  assert.equal(payout('n:17'), 35);
  assert.equal(wins('n:17', '17'), true);
  assert.equal(wins('n:17', '18'), false);
  assert.equal(wins('n:0', '00'), false);
  assert.equal(wins('n:00', '00'), true);
  assert.deepEqual(settle({ 'n:00': 10 }, '00'), { wagered: 10, returned: 360, net: 350, winners: [{ key: 'n:00', stake: 10, paid: 360 }], halves: [] });
});

test('even-money bets', () => {
  for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) assert.equal(payout(k), 1);
  assert.equal(wins('red', '1'), true);
  assert.equal(wins('black', '1'), false);
  assert.equal(wins('odd', '7'), true);
  assert.equal(wins('even', '7'), false);
  assert.equal(wins('low', '18'), true);
  assert.equal(wins('high', '18'), false);
  assert.equal(wins('high', '19'), true);
});

test('0 and 00 lose every outside bet', () => {
  for (const p of ['0', '00']) {
    for (const k of ['red', 'black', 'odd', 'even', 'low', 'high', 'dozen:1', 'col:1']) assert.equal(wins(k, p), false, `${k} on ${p}`);
  }
});

test('dozens and columns pay 2 to 1', () => {
  assert.equal(payout('dozen:2'), 2);
  assert.equal(wins('dozen:1', '12'), true);
  assert.equal(wins('dozen:2', '13'), true);
  assert.equal(wins('dozen:3', '36'), true);
  assert.equal(columnOf(1), 1);
  assert.equal(columnOf(36), 3);
  assert.equal(wins('col:2', '35'), true);
  assert.equal(wins('col:3', '35'), false);
});

test('settle adds up a mixed layout', () => {
  const r = settle({ 'n:7': 5, red: 20, even: 10, 'dozen:3': 10 }, '7');
  assert.equal(r.wagered, 45);
  assert.equal(r.returned, 5 * 36 + 40); // 7 and red win; even and 3rd dozen lose
  assert.equal(r.net, 175);
  assert.deepEqual(settle({ red: 5 }, '0'), { wagered: 5, returned: 0, net: -5, winners: [], halves: [] });
});

test('table limits: each outside bet and the inside total reach the minimum; no spot over the maximum', () => {
  const t = { min: 5, max: 1000 };
  assert.match(checkLimits({}, t), /Place a bet/);
  assert.match(checkLimits({ 'n:3': 4 }, t), /numbers must add up to at least the table minimum of \$5/);
  assert.equal(checkLimits({ 'n:3': 1, 'n:4': 4 }, t), null, 'inside bets count together');
  assert.match(checkLimits({ red: 4, 'n:3': 10 }, t), /Each outside bet .*Red has \$4/);
  assert.equal(checkLimits({ red: 5, black: 5 }, t), null);
  assert.equal(checkLimits({ red: 5 }, t), null, 'no inside bets is fine');
  assert.match(checkLimits({ red: 1500 }, t), /most on one bet is \$1,000/);
  assert.equal(checkLimits({ red: 1_000_000 }, { min: 100, max: null }), null);
});

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('playSpin settles everything before returning, so a reload mid-spin keeps the payout', () => {
  const storage = memStorage();
  const bank = createBank({ storage, win: null });
  const r = playSpin(bank, { 'n:17': 10, black: 5 }, { min: 5, max: 1000 }, { pocket: '17' });
  assert.equal(r.returned, 360 + 10);
  assert.equal(bank.balance, 5000 - 15 + 370);
  // a fresh page reads the same storage (the animation never finished)
  const reloaded = createBank({ storage, win: null });
  assert.equal(reloaded.balance, 5355);
  assert.deepEqual(reloaded.get().stats.roulette, { hands: 1, wagered: 15, won: 370, net: 355, biggest: 355 });
});

test('playSpin refuses bets outside the limits or beyond the bank without touching it', () => {
  const bank = createBank({ storage: memStorage(), win: null });
  assert.match(playSpin(bank, { red: 2 }, { min: 5, max: 1000 }).error, /outside bet/);
  assert.match(playSpin(bank, { red: 6000 }, { min: 5, max: null }).error, /can't cover/);
  assert.equal(bank.balance, 5000);
  assert.deepEqual(bank.get().stats, {});
});

test('a spin that reaches the Hall of Fame leaves nothing in the fresh stats', () => {
  const storage = memStorage();
  storage.setItem(KEY, JSON.stringify({ v: 1, bank: HALL_OF_FAME_AT - 1000, tier: 5, loan: 0, stats: {}, hall: [] }));
  const bank = createBank({ storage, win: null });
  playSpin(bank, { 'n:7': 1000 }, { min: 100, max: null }, { pocket: '7' });
  assert.equal(bank.balance, 5000);
  assert.equal(bank.get().hall.length, 1);
  assert.deepEqual(bank.get().stats, {});
});

test('bet keys and names', () => {
  assert.equal(isBetKey('n:00'), true);
  assert.equal(isBetKey('n:37'), false);
  assert.equal(isBetKey('dozen:4'), false);
  assert.equal(isBetKey('red'), true);
  assert.equal(isBetKey('toString'), false);
  assert.equal(betName('dozen:2'), '2nd 12');
  assert.equal(betName('low'), '1 to 18');
});

test('randomInt rejects values that would bias the result', () => {
  const seq = [0xFFFF_FFFF, 0xFFFF_FFFE, 39]; // the first two are above the last full block of 38
  let i = 0;
  assert.equal(randomInt(38, (a) => { a[0] = seq[i++]; }), 39 % 38);
  assert.equal(i, 3);
});

test('randomInt needs a count from 1 to 2^32', () => {
  assert.throws(() => randomInt(0), RangeError);
  assert.throws(() => randomInt(1.5), RangeError);
  assert.equal(randomInt(1), 0);
});

test('spin lands on every pocket, roughly evenly', () => {
  const counts = new Map();
  for (let i = 0; i < 38_000; i++) { const p = spin(); counts.set(p, (counts.get(p) ?? 0) + 1); }
  assert.equal(counts.size, 38);
  for (const [p, c] of counts) assert.ok(c > 700 && c < 1300, `${p} came up ${c} times`);
});


// ------------------------------------------------------------------ the full layout, both wheels
test('the single-zero wheel: 37 pockets, each once, no 00', () => {
  assert.equal(WHEELS.european.length, 37);
  assert.deepEqual([...WHEELS.european].sort(), POCKETS.filter((p) => p !== '00').sort());
  assert.equal(WHEELS.european[0], '0');
  assert.equal(isBetKey('n:00', 'european'), false);
  assert.equal(isBetKey('n:00', 'american'), true);
  const counts = new Set();
  const rng = seededRng(7);
  for (let i = 0; i < 2000; i++) counts.add(spin(rng, 'european'));
  assert.equal(counts.size, 37, 'a single-zero spin never lands on 00');
  assert.equal(spin(riggedRng([0]), 'european'), '0');
  assert.deepEqual(OPTIONS.map((o) => [o.key, o.default]), [['wheel', 'american'], ['halfback', false]]);
});

test('every bet on the layout and how many it covers', () => {
  const count = (w) => {
    const by = {};
    for (const k of allBets(w)) { const t = k.split(':')[0]; by[t] = (by[t] ?? 0) + 1; }
    return by;
  };
  // 57 splits in the numbers (24 up the streets, 33 along the rows), 12 streets, 22 corners, 11 lines
  assert.deepEqual(count('american'), { n: 38, split: 62, street: 14, corner: 22, line: 11, basket: 1, dozen: 3, col: 3, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 });
  assert.deepEqual(count('european'), { n: 37, split: 60, street: 14, corner: 22, line: 11, first4: 1, dozen: 3, col: 3, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 });
  assert.deepEqual(covers('split:17-20'), ['17', '20']);
  assert.deepEqual(covers('split:17-18'), ['17', '18']);
  assert.equal(covers('split:18-19'), null, '18 and 19 are not side by side');
  assert.deepEqual(covers('street:16'), ['16', '17', '18']);
  assert.equal(covers('street:17'), null);
  assert.deepEqual(covers('corner:13-14-16-17'), ['13', '14', '16', '17']);
  assert.equal(covers('corner:15-16-18-19'), null);
  assert.deepEqual(covers('line:13-18'), ['13', '14', '15', '16', '17', '18']);
  assert.equal(covers('line:34-39'), null);
  assert.deepEqual(covers('basket'), ['0', '00', '1', '2', '3']);
  assert.equal(covers('basket', 'european'), null);
  assert.deepEqual(covers('first4', 'european'), ['0', '1', '2', '3']);
  assert.equal(covers('first4', 'american'), null);
  assert.deepEqual(covers('street:00-2-3'), ['00', '2', '3']);
  assert.deepEqual(covers('street:0-2-3', 'european'), ['0', '2', '3']);
  assert.equal(covers('split:0-3', 'american'), null);
  assert.deepEqual(covers('split:0-3', 'european'), ['0', '3']);
  assert.equal(betName('split:17-20'), 'Split 17-20');
  assert.equal(betName('street:16'), 'Street 16-17-18');
  assert.equal(betName('corner:13-14-16-17'), 'Corner 13-14-16-17');
  assert.equal(betName('line:13-18'), 'Six line 13-18');
  assert.equal(betName('basket'), 'Five numbers (0-00-1-2-3)');
});

test('payouts: split 17, street 11, corner and first four 8, basket 6, six line 5', () => {
  const pays = { 'split:17-20': 17, 'split:0-00': 17, 'street:16': 11, 'street:0-1-2': 11, 'corner:13-14-16-17': 8, first4: 8, basket: 6, 'line:13-18': 5 };
  for (const [k, p] of Object.entries(pays)) assert.equal(payout(k), p, k);
  // every bet type on every pocket of both wheels: wins exactly on what it covers, paid at its rate
  for (const w of ['american', 'european']) {
    for (const k of allBets(w)) {
      for (const p of WHEELS[w]) {
        const r = settle({ [k]: 10 }, p);
        const hit = covers(k, w).includes(p);
        assert.equal(r.returned, hit ? 10 + 10 * payout(k) : 0, `${k} on ${p} (${w})`);
      }
    }
  }
  assert.equal(settle({ 'corner:13-14-16-17': 10, 'line:13-18': 5 }, '16').returned, 90 + 30);
});

/** Exact expected return of a $1 bet = (sum of what comes back over every pocket - pockets) / pockets. */
const ev = (k, w, o = {}) => {
  const ps = WHEELS[w];
  const stake = ps.length * 2; // keeps the half-back halves whole
  const back = ps.reduce((t, p) => t + settle({ [k]: stake }, p, o).returned, 0);
  return { num: back - ps.length * stake, den: ps.length * stake };
};

test('exact house edge of every bet: 2/38 double zero (basket 3/38), 1/37 single zero', () => {
  for (const k of allBets('american')) {
    const { num, den } = ev(k, 'american');
    if (k === 'basket') assert.equal(num * 38, -3 * den, 'basket -7.89%');
    else assert.equal(num * 38, -2 * den, `${k} -5.26%`);
  }
  for (const k of allBets('european')) {
    const { num, den } = ev(k, 'european');
    assert.equal(num * 37, -1 * den, `${k} -2.70%`);
  }
});

test('half back: even-money bets get half their stake (rounded down) on a zero, and the edge halves', () => {
  assert.deepEqual(settle({ red: 25, 'n:7': 5, 'dozen:1': 10 }, '00', { halfback: true }), {
    wagered: 40, returned: 12, net: -28, winners: [], halves: [{ key: 'red', stake: 25, back: 12 }],
  });
  assert.equal(settle({ red: 25 }, '0').returned, 0, 'off by default');
  assert.equal(settle({ red: 25 }, '7', { halfback: true }).returned, 50, 'a win is unchanged');
  for (const k of ['red', 'black', 'odd', 'even', 'low', 'high']) {
    const am = ev(k, 'american', { halfback: true });
    assert.equal(am.num * 38, -1 * am.den, `${k} -2.63% with half back`);
    const eu = ev(k, 'european', { halfback: true });
    assert.equal(eu.num * 74, -1 * eu.den, `${k} -1.35% single zero with half back`);
  }
  // other bets are not affected
  const d = ev('dozen:1', 'american', { halfback: true });
  assert.equal(d.num * 38, -2 * d.den);
});

test('inside bets on the lines count together toward the table minimum', () => {
  const t = { min: 5, max: 1000 };
  assert.equal(checkLimits({ 'split:17-20': 2, 'corner:13-14-16-17': 2, basket: 1 }, t), null);
  assert.match(checkLimits({ 'split:17-20': 2, 'line:1-6': 2 }, t), /numbers must add up/);
  assert.match(checkLimits({ 'street:16': 1500 }, t), /most on one bet/);
});

test('playSpin on the single-zero wheel with half back', () => {
  const bank = createBank({ storage: memStorage(), win: null });
  const r = playSpin(bank, { black: 10, 'first4': 5 }, { min: 5, max: 1000 }, { wheel: 'european', halfback: true, pocket: '0' });
  assert.equal(r.returned, 5 + 45);
  assert.equal(bank.balance, 5000 - 15 + 50);
});
