// Craps rules engine: every bet's win, loss and push on every total in both phases, when bets may
// go down and come off, odds limits, rounding, the money for each roll, and the exact house edge of
// each bet worked out from the engine itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newTable, resolve, whyNot, limits, checkStaged, commit, whyFixed, takeDown, returnable, oddsMax, neatOdds,
  vigFor, commission, isWorking, isBetKey, betName, paysText, rollDice, rollName, describe, rollMoney, onTable, POINTS,
  placePays, trueOddsPays, layOddsPays, OPTIONS, DEFAULTS, minBuyIn,
} from '../public/js/casino/engines/craps.js';
import { seededRng, riggedRng } from '../public/js/casino/kit/rng.js';
import { createBank, KEY } from '../public/js/core/bank.js';
import { createRound } from '../public/js/casino/kit/round.js';

const STAKES = { min: 5, max: 1000 };
/** Every way two dice make each total. */
const WAYS = {};
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) (WAYS[a + b] ??= []).push([a, b]);
const easy = (t) => WAYS[t].find(([a, b]) => a !== b);
const dbl = (t) => [t / 2, t / 2];

/** A table with these bets already up (no checks) and the point at `point`. */
const table = (bets, point = null, opts = {}) => ({ ...newTable(opts), point, bets: { ...bets } });
const only = (r, key) => r.outcomes.find((o) => o.key === key);

// ------------------------------------------------------------------ keys
test('every spot on the layout is a bet key with a name', () => {
  const keys = ['pass', 'pass-odds', 'dp', 'dp-odds', 'come', 'dc', 'field', 'big6', 'big8', 'any7', 'craps', 'two', 'three', 'yo', 'twelve', 'horn',
    ...POINTS.flatMap((n) => [`place:${n}`, `buy:${n}`, `lay:${n}`, `come:${n}`, `come:${n}-odds`, `dc:${n}`, `dc:${n}-odds`]),
    'hard:4', 'hard:6', 'hard:8', 'hard:10'];
  for (const k of keys) { assert.ok(isBetKey(k), k); assert.notEqual(betName(k), k, k); assert.ok(paysText(k), k); }
  for (const k of ['place:7', 'hard:5', 'come:11', 'lay:2', 'field-odds', 'nope', '', 'place:6-odds']) assert.equal(isBetKey(k), false, k);
  assert.equal(betName('come:6-odds'), 'Come 6 odds');
  assert.equal(betName('dc:4'), "Don't come 4");
  assert.equal(minBuyIn(STAKES), 5);
  assert.deepEqual(DEFAULTS, { odds: 3, maxOdds: true, working: false, field12: 2 });
  assert.ok(OPTIONS.every((o) => o.key && o.label && 'default' in o));
});

test('dice: two fair dice from the rng; names', () => {
  assert.deepEqual(rollDice(riggedRng([0, 5])), [1, 6]);
  const rng = seededRng(3);
  const counts = Array(13).fill(0);
  for (let i = 0; i < 36000; i++) { const [a, b] = rollDice(rng); counts[a + b]++; }
  assert.ok(Math.abs(counts[7] - 6000) < 400 && Math.abs(counts[2] - 1000) < 200, counts.join());
  assert.equal(rollName([3, 3]), 'hard six');
  assert.equal(rollName([4, 2]), 'easy six');
  assert.equal(rollName([5, 6]), 'eleven');
  assert.equal(rollName([1, 1]), 'aces');
  assert.throws(() => resolve(newTable(), [0, 7]));
});

// ------------------------------------------------------------------ the line
test('pass line on the come-out: 7 and 11 win, 2, 3 and 12 lose, anything else is the point', () => {
  for (let t = 2; t <= 12; t++) {
    const r = resolve(table({ pass: 10 }), WAYS[t][0]);
    const o = only(r, 'pass');
    if (t === 7 || t === 11) { assert.equal(o.result, 'win'); assert.equal(o.won, 10); assert.equal(r.state.bets.pass, 10, 'stays on the line'); assert.equal(r.event, 'natural'); }
    else if ([2, 3, 12].includes(t)) { assert.equal(o.result, 'lose'); assert.equal(r.state.bets.pass, undefined); assert.equal(r.event, 'craps'); }
    else { assert.equal(o, undefined); assert.equal(r.state.point, t); assert.equal(r.event, 'point'); }
  }
});

test('pass line with a point: the point wins, 7 loses, the rest do nothing', () => {
  for (const p of POINTS) for (let t = 2; t <= 12; t++) {
    const r = resolve(table({ pass: 10 }, p), WAYS[t][0]);
    const o = only(r, 'pass');
    if (t === p) { assert.equal(o.result, 'win'); assert.equal(r.state.point, null); assert.equal(r.event, 'made'); }
    else if (t === 7) { assert.equal(o.result, 'lose'); assert.equal(r.state.point, null); assert.equal(r.event, 'sevenout'); }
    else { assert.equal(o, undefined); assert.equal(r.state.point, p); }
  }
});

test("don't pass: 2 and 3 win, 12 pushes (the bet stays), 7 and 11 lose; with a point, 7 wins", () => {
  for (let t = 2; t <= 12; t++) {
    const r = resolve(table({ dp: 10 }), WAYS[t][0]);
    const o = only(r, 'dp');
    if (t === 2 || t === 3) assert.equal(o.result, 'win');
    else if (t === 12) { assert.equal(o.result, 'push'); assert.equal(o.back, 0); assert.equal(r.state.bets.dp, 10); assert.equal(r.wagered, 0); }
    else if (t === 7 || t === 11) assert.equal(o.result, 'lose');
    else assert.equal(o, undefined);
  }
  for (const p of POINTS) for (let t = 2; t <= 12; t++) {
    const o = only(resolve(table({ dp: 10 }, p), WAYS[t][0]), 'dp');
    if (t === 7) assert.equal(o.result, 'win'); else if (t === p) assert.equal(o.result, 'lose'); else assert.equal(o, undefined);
  }
});

test('line odds pay true odds, rounded down; lose with the line', () => {
  const pays = { 4: [10, 20], 10: [10, 20], 5: [10, 15], 9: [5, 7], 6: [5, 6], 8: [10, 12] };
  for (const [p, [odds, won]] of Object.entries(pays)) {
    const n = Number(p);
    const r = resolve(table({ pass: 5, 'pass-odds': odds }, n), easy(n) ?? dbl(n));
    assert.equal(only(r, 'pass-odds').won, won, `pass odds on ${n}`);
    assert.equal(only(r, 'pass-odds').back, odds + won, 'odds come down with their winnings');
    assert.equal(only(resolve(table({ pass: 5, 'pass-odds': odds }, n), [3, 4]), 'pass-odds').result, 'lose');
  }
  const lay = { 4: [10, 5], 10: [20, 10], 5: [9, 6], 9: [10, 6], 6: [6, 5], 8: [12, 10] };
  for (const [p, [odds, won]] of Object.entries(lay)) {
    const n = Number(p);
    assert.equal(only(resolve(table({ dp: 5, 'dp-odds': odds }, n), [3, 4]), 'dp-odds').won, won, `don't pass odds on ${n}`);
    assert.equal(only(resolve(table({ dp: 5, 'dp-odds': odds }, n), easy(n) ?? dbl(n)), 'dp-odds').result, 'lose');
  }
  assert.equal(trueOddsPays(5, 5), 7);
  assert.equal(trueOddsPays(6, 5), 6);
  assert.equal(layOddsPays(4, 10), 5);
});

// ------------------------------------------------------------------ come and don't come
test('come: 7 and 11 win, craps loses, a number moves the bet there; then it acts like a pass bet', () => {
  for (let t = 2; t <= 12; t++) {
    const r = resolve(table({ come: 10 }, 6), WAYS[t][0]);
    const o = only(r, 'come');
    if (t === 7 || t === 11) { assert.equal(o.result, 'win'); assert.equal(o.back, 20, 'comes down with its winnings'); }
    else if ([2, 3, 12].includes(t)) assert.equal(o.result, 'lose');
    else { assert.equal(o.result, 'move'); assert.equal(o.to, `come:${t}`); assert.equal(r.state.bets[`come:${t}`], 10); assert.equal(r.state.bets.come, undefined); }
  }
  for (const n of POINTS) for (let t = 2; t <= 12; t++) {
    const r = resolve(table({ [`come:${n}`]: 10 }, n === 6 ? 8 : 6), WAYS[t][0]);
    const o = only(r, `come:${n}`);
    if (t === n) { assert.equal(o.result, 'win'); assert.equal(o.back, 20); assert.equal(r.state.bets[`come:${n}`], undefined); }
    else if (t === 7) assert.equal(o.result, 'lose');
    else assert.equal(o, undefined);
  }
});

test('a come bet on a number that rolls again: the old one is paid, the new one takes its place', () => {
  const r = resolve(table({ 'come:5': 10, come: 15 }, 8), [2, 3]);
  assert.equal(only(r, 'come:5').result, 'win');
  assert.equal(r.state.bets['come:5'], 15);
});

test("don't come: 2 and 3 win, 12 pushes and stays, 7 and 11 lose, a number moves it; then 7 wins", () => {
  for (let t = 2; t <= 12; t++) {
    const r = resolve(table({ dc: 10 }, 6), WAYS[t][0]);
    const o = only(r, 'dc');
    if (t === 2 || t === 3) assert.equal(o.result, 'win');
    else if (t === 12) { assert.equal(o.result, 'push'); assert.equal(r.state.bets.dc, 10); }
    else if (t === 7 || t === 11) assert.equal(o.result, 'lose');
    else { assert.equal(o.result, 'move'); assert.equal(r.state.bets[`dc:${t}`], 10); }
  }
  for (const n of POINTS) for (let t = 2; t <= 12; t++) {
    const o = only(resolve(table({ [`dc:${n}`]: 10 }, 9), WAYS[t][0]), `dc:${n}`);
    if (t === 7) { assert.equal(o.result, 'win'); assert.equal(o.back, 20); } else if (t === n) assert.equal(o.result, 'lose'); else assert.equal(o, undefined);
  }
});

test('come odds are off on the come-out (handed back), unless the working option is on', () => {
  const bets = { 'come:6': 10, 'come:6-odds': 25 };
  let r = resolve(table(bets), [2, 4]);
  assert.equal(only(r, 'come:6').result, 'win', 'the flat bet always works');
  assert.equal(only(r, 'come:6-odds').result, 'off');
  assert.equal(only(r, 'come:6-odds').back, 25);
  r = resolve(table(bets), [3, 4]);
  assert.equal(only(r, 'come:6').result, 'lose');
  assert.equal(only(r, 'come:6-odds').result, 'off');
  assert.equal(r.returned, 25);
  assert.equal(r.wagered, 35);
  r = resolve(table(bets, null, { working: true }), [2, 4]);
  assert.equal(only(r, 'come:6-odds').won, 30);
  r = resolve(table(bets, 8), [2, 4]);
  assert.equal(only(r, 'come:6-odds').won, 30, 'working while a point is on');
  // don't come odds always work
  r = resolve(table({ 'dc:9': 10, 'dc:9-odds': 15 }), [3, 4]);
  assert.equal(only(r, 'dc:9-odds').won, 10);
});

// ------------------------------------------------------------------ place, buy, lay
test('place bets pay 9:5, 7:5 and 7:6 rounded down, stay up, and are off on the come-out', () => {
  const cases = [[4, 5, 9], [4, 10, 18], [10, 25, 45], [5, 5, 7], [9, 10, 14], [6, 5, 5], [6, 10, 11], [8, 12, 14], [6, 30, 35]];
  for (const [n, stake, won] of cases) {
    assert.equal(placePays(n, stake), won, `place ${n} on ${stake}`);
    const r = resolve(table({ [`place:${n}`]: stake }, n === 5 ? 9 : 5), easy(n));
    const o = only(r, `place:${n}`);
    assert.equal(o.won, won);
    assert.equal(o.back, won, 'only the winnings are paid');
    assert.equal(r.state.bets[`place:${n}`], stake, 'it stays up');
    assert.equal(r.wagered, 0);
  }
  for (const n of POINTS) for (let t = 2; t <= 12; t++) {
    const o = only(resolve(table({ [`place:${n}`]: 30 }, n === 4 ? 10 : 4), WAYS[t][0]), `place:${n}`);
    if (t === n) assert.equal(o.result, 'win'); else if (t === 7) assert.equal(o.result, 'lose'); else assert.equal(o, undefined);
    assert.equal(only(resolve(table({ [`place:${n}`]: 30 }), WAYS[t][0]), `place:${n}`), undefined, 'off on the come-out');
  }
  assert.equal(only(resolve(table({ 'place:6': 12 }, null, { working: true }), [3, 4]), 'place:6').result, 'lose', 'working on the come-out');
});

test('buy bets pay true odds (commission at placement); lay bets win on 7, always working', () => {
  for (const n of POINTS) {
    const r = resolve(table({ [`buy:${n}`]: 20 }, n === 4 ? 10 : 4), easy(n));
    assert.equal(only(r, `buy:${n}`).won, trueOddsPays(n, 20));
    assert.equal(only(resolve(table({ [`buy:${n}`]: 20 }, 4), [3, 4]), `buy:${n}`).result, 'lose');
    assert.equal(only(resolve(table({ [`buy:${n}`]: 20 }), easy(n)), `buy:${n}`), undefined, 'off on the come-out');
    const lay = resolve(table({ [`lay:${n}`]: 60 }), [3, 4]);
    assert.equal(only(lay, `lay:${n}`).won, layOddsPays(n, 60));
    assert.equal(lay.state.bets[`lay:${n}`], 60, 'a lay stays up');
    assert.equal(only(resolve(table({ [`lay:${n}`]: 60 }), easy(n)), `lay:${n}`).result, 'lose');
  }
  assert.equal(commission(20), 1);
  assert.equal(commission(5), 1, 'at least $1');
  assert.equal(commission(100), 5);
  assert.equal(vigFor({ 'buy:4': 20, 'lay:10': 40, 'place:6': 12 }), 1 + 1);
  assert.equal(vigFor({ 'lay:4': 200 }), 5, '5% of the $100 it would win');
});

// ------------------------------------------------------------------ field, big 6/8, hardways, one-roll bets
test('field: 3, 4, 9, 10, 11 even money, 2 pays double, 12 double or triple', () => {
  for (const field12 of [2, 3]) for (let t = 2; t <= 12; t++) {
    const r = resolve(table({ field: 10 }, t === 6 ? 8 : null, { field12 }), WAYS[t][0]);
    const o = only(r, 'field');
    const want = { 2: 20, 3: 10, 4: 10, 9: 10, 10: 10, 11: 10, 12: field12 * 10 }[t];
    if (want) { assert.equal(o.won, want, `field ${t}`); assert.equal(o.back, 10 + want); } else assert.equal(o.result, 'lose', `field ${t}`);
    assert.equal(r.state.bets.field, undefined, 'one roll');
  }
});

test('one-roll propositions on every total', () => {
  const PAY = { any7: [[7], 4], craps: [[2, 3, 12], 7], two: [[2], 30], three: [[3], 15], yo: [[11], 15], twelve: [[12], 30] };
  for (const [key, [wins, x]] of Object.entries(PAY)) for (let t = 2; t <= 12; t++) for (const point of [null, 6]) {
    const r = resolve(table({ [key]: 10 }, point), WAYS[t][0]);
    const o = only(r, key);
    if (wins.includes(t)) { assert.equal(o.won, 10 * x, `${key} on ${t}`); assert.equal(o.back, 10 + 10 * x); } else assert.equal(o.result, 'lose', `${key} on ${t}`);
    assert.equal(r.state.bets[key], undefined);
  }
});

test('horn: a quarter on each of 2, 3, 11 and 12; the winner is paid, the other three lose', () => {
  const back = (t) => only(resolve(table({ horn: 20 }), WAYS[t][0]), 'horn');
  assert.equal(back(2).back, 5 + 150);
  assert.equal(back(12).won, 155 - 20);
  assert.equal(back(3).back, 5 + 75);
  assert.equal(back(11).won, 80 - 20);
  for (const t of [4, 5, 6, 7, 8, 9, 10]) assert.equal(back(t).result, 'lose');
  assert.match(checkStaged(newTable(), { horn: 10 }, STAKES), /multiple of \$4/);
  assert.equal(checkStaged(newTable(), { horn: 8 }, STAKES), null);
});

test('big 6 and 8 pay even money and stay up; hardways pay 7:1 and 9:1, lose to 7 or the easy way', () => {
  for (const n of [6, 8]) for (let t = 2; t <= 12; t++) for (const point of [null, 5]) {
    const r = resolve(table({ [`big${n}`]: 10 }, point), WAYS[t][0]);
    const o = only(r, `big${n}`);
    if (t === n) { assert.equal(o.won, 10); assert.equal(r.state.bets[`big${n}`], 10); } else if (t === 7) assert.equal(o.result, 'lose'); else assert.equal(o, undefined);
  }
  for (const n of [4, 6, 8, 10]) for (const point of [null, 5]) for (const dice of Object.values(WAYS).flat()) {
    const t = dice[0] + dice[1];
    const r = resolve(table({ [`hard:${n}`]: 10 }, point), dice);
    const o = only(r, `hard:${n}`);
    if (t === n && dice[0] === dice[1]) { assert.equal(o.won, n === 4 || n === 10 ? 70 : 90); assert.equal(r.state.bets[`hard:${n}`], 10, 'stays up'); }
    else if (t === n || t === 7) assert.equal(o.result, 'lose', `hard ${n} on ${dice}`);
    else assert.equal(o, undefined);
  }
});

// ------------------------------------------------------------------ placing and taking down
test('when each bet may go down', () => {
  const comeout = newTable();
  const point = table({ pass: 10, dp: 10, 'come:5': 10, 'dc:9': 10 }, 6);
  const ok = (s, k, staged) => whyNot(s, k, staged) === null;
  // come-out
  for (const k of ['pass', 'dp', 'field', 'big6', 'big8', 'hard:4', 'any7', 'craps', 'two', 'three', 'yo', 'twelve', 'horn']) assert.ok(ok(comeout, k), k);
  for (const k of ['come', 'dc', 'place:6', 'buy:4', 'lay:10', 'pass-odds', 'dp-odds', 'come:5', 'come:5-odds']) assert.ok(!ok(comeout, k), k);
  // point on
  for (const k of ['pass', 'come', 'dc', 'place:6', 'buy:4', 'lay:10', 'pass-odds', 'dp-odds', 'come:5-odds', 'dc:9-odds', 'field', 'hard:8']) assert.ok(ok(point, k), k);
  for (const k of ['dp', 'come:5', 'dc:9', 'come:6-odds', 'dc:4-odds']) assert.ok(!ok(point, k), k);
  assert.ok(!ok(table({}, 6), 'pass-odds'), 'odds need a line bet');
  assert.ok(ok(table({}, 6), 'pass-odds', { pass: 10 }), 'odds may go behind a put bet going down with them');
  assert.ok(ok(table({ 'dc:9': 10 }), 'dc:9-odds'), "don't come odds go down even on the come-out");
  assert.ok(!ok(table({ 'come:9': 10 }), 'come:9-odds'), 'come odds wait for a point');
});

test('limits: the table range per bet, odds by the multiple, lays by what they win', () => {
  const s = table({ pass: 10, dp: 10, 'come:6': 15, 'place:6': 6 }, 4);
  assert.deepEqual(limits(s, 'field', STAKES), { min: 5, max: 1000 });
  assert.deepEqual(limits(s, 'place:6', STAKES), { min: 0, max: 994 }, 'a bet already up counts');
  assert.deepEqual(limits(s, 'pass-odds', STAKES), { min: 0, max: 30 });
  assert.equal(oddsMax(s, 'dp-odds'), 60, "3x lay on 4 wins up to $30");
  assert.equal(oddsMax(s, 'come:6-odds'), 45);
  assert.equal(oddsMax(table({ dp: 10 }, 5, { odds: 2 }), 'dp-odds'), 30);
  assert.equal(oddsMax(table({ dp: 10 }, 8, { odds: 5 }), 'dp-odds'), 60);
  assert.equal(oddsMax(table({ pass: 10 }, 8, { odds: 10 }), 'pass-odds'), 100);
  assert.equal(limits(s, 'come:6', STAKES), null);
  assert.deepEqual(limits(s, 'field', { min: 100, max: Infinity }), { min: 100, max: null }, 'no limit');
  assert.match(checkStaged(s, { 'pass-odds': 35 }, STAKES), /most odds/);
  assert.equal(checkStaged(s, { 'pass-odds': 30, 'place:6': 1 }, STAKES), null);
  assert.match(checkStaged(s, { field: 3 }, STAKES), /minimum/);
  assert.match(checkStaged(s, { field: 1005 }, STAKES), /Table max/);
  assert.match(checkStaged(s, { dp: 5 }, STAKES), /before the come-out/);
  assert.throws(() => commit(s, { dp: 5 }, STAKES), /come-out/);
  assert.equal(commit(s, { field: 5, 'pass-odds': 30 }, STAKES).bets['pass-odds'], 30);
  assert.equal(s.bets['pass-odds'], undefined, 'the state given is never changed');
  // neat odds
  assert.equal(neatOdds(table({ pass: 5 }, 5), 'pass-odds', 15), 14);
  assert.equal(neatOdds(table({ pass: 5 }, 6), 'pass-odds', 15), 15);
  assert.equal(neatOdds(table({ pass: 5 }, 6), 'pass-odds', 3), 3, 'too small to round: keep it');
  assert.equal(neatOdds(table({ dp: 5 }, 8), 'dp-odds', 20), 18);
});

test('taking bets down: contract bets stay, the rest come back (a don\'t bet takes its odds)', () => {
  const s = table({ pass: 10, 'pass-odds': 20, 'come:5': 10, 'come:5-odds': 10, 'dc:9': 10, 'dc:9-odds': 15, 'place:8': 12, 'big6': 5, 'hard:4': 5, dc: 5 }, 6);
  for (const k of ['pass', 'come:5', 'dc']) assert.ok(whyFixed(s, k), k);
  for (const k of ['pass-odds', 'come:5-odds', 'dc:9', 'dc:9-odds', 'place:8', 'big6', 'hard:4']) assert.equal(whyFixed(s, k), null, k);
  assert.equal(returnable(s), 20 + 10 + 10 + 15 + 12 + 5 + 5);
  assert.equal(onTable(s), 102);
  const r = takeDown(s, 'dc:9');
  assert.equal(r.refund, 25);
  assert.deepEqual(r.keys, ['dc:9', 'dc:9-odds']);
  assert.equal(r.state.bets['dc:9-odds'], undefined);
  assert.throws(() => takeDown(s, 'pass'), /point is set/);
  assert.throws(() => takeDown(s, 'field'), /no bet/);
  assert.equal(whyFixed(table({ pass: 10, dp: 10 }), 'pass'), null, 'before the point the pass line may come down');
  assert.equal(returnable(table({ pass: 10, dp: 10 })), 20);
});

test('working: place, buy and come odds off on the come-out; lays, hardways and big 6/8 always on', () => {
  const s = newTable();
  for (const k of ['place:6', 'buy:4', 'come:6-odds']) assert.equal(isWorking(s, k), false, k);
  for (const k of ['lay:4', 'hard:6', 'big8', 'dc:6-odds', 'come:6', 'field']) assert.equal(isWorking(s, k), true, k);
  assert.equal(isWorking(newTable({ working: true }), 'place:6'), true);
  assert.equal(isWorking(table({}, 5), 'place:6'), true);
});

// ------------------------------------------------------------------ a shooter's turn, with the bank
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const newBank = () => { const storage = memStorage(); storage.setItem(KEY, JSON.stringify({ v: 1, bank: 1000, stats: {}, hall: [], tier: 0, loan: 0 })); return createBank({ storage, win: null }); };

function play(round, state, staged, dice) {
  const vig = vigFor(staged);
  assert.ok(round.wager(Object.values(staged).reduce((a, b) => a + b, 0) + vig));
  const before = commit(state, staged, STAKES);
  const r = resolve(before, dice);
  const m = rollMoney(r, vig);
  if (m.settle) round.settle(m); else round.setReturnable(m.returnable);
  assert.equal(round.onTable, onTable(r.state), 'the round holds exactly the chips on the layout');
  assert.equal(round.returnable, returnable(r.state));
  return { r, text: describe(r, before) };
}

test('a whole shooter: point, come bets travel, place wins, seven out; the bank and stats agree', () => {
  const bank = newBank();
  const round = createRound(bank, 'craps');
  let s = newTable();
  let x = play(round, s, { pass: 10, field: 5 }, [2, 2]);     // point 4; field wins 5
  assert.equal(x.r.state.point, 4);
  assert.match(x.text, /Rolled 2 \+ 2 = 4 \(hard four\)\. The point is 4\. Field wins \$5\./);
  assert.equal(bank.balance, 1000 - 15 + 10);
  s = x.r.state;
  x = play(round, s, { 'pass-odds': 30, come: 10, 'place:6': 12, 'buy:10': 20 }, [5, 4]); // come -> 9
  assert.equal(x.r.state.bets['come:9'], 10);
  assert.equal(bank.balance, 995 - 72 - 1, 'the buy commission is gone');
  assert.equal(round.atRisk, 10 + 10, 'pass and come 9 are contract bets');
  s = x.r.state;
  x = play(round, s, { 'come:9-odds': 20 }, [4, 2]);           // place 6 wins $14
  assert.match(x.text, /Place 6 wins \$14/);
  assert.equal(bank.balance, 922 - 20 + 14);
  s = x.r.state;
  const down = takeDown(s, 'buy:10');
  round.refund(down.refund);
  round.setReturnable(returnable(down.state));
  s = down.state;
  assert.equal(bank.balance, 916 + 20);
  x = play(round, s, {}, [3, 4]);                               // seven out
  assert.equal(x.r.event, 'sevenout');
  assert.deepEqual(x.r.state.bets, {});
  assert.equal(round.onTable, 0);
  assert.equal(bank.balance, 936);
  assert.equal(bank.get().stats.craps.hands, 4, 'one hand per roll that settled something');
  assert.equal(bank.get().stats.craps.net, 936 - 1000);
});

test('leaving mid-point hands back what may come down and forfeits the contract bets', () => {
  const bank = newBank();
  const round = createRound(bank, 'craps');
  let x = play(round, newTable(), { pass: 10, dp: 10 }, [3, 2]);
  x = play(round, x.r.state, { 'pass-odds': 20, 'place:8': 12, come: 5 }, [6, 2]);
  // place 8 won and stays up; come moved to 8
  assert.equal(round.atRisk, 10 + 5);
  const { back, lost } = round.leave();
  assert.equal(lost, 15);
  assert.equal(back, 20 + 10 + 12);
});

// ------------------------------------------------------------------ house edge, from the engine itself
/**
 * Expected profit per decision, per dollar, of the bets `track` picks, starting from `state`:
 * value iteration over every table the rolls can lead to before the bet is decided (a win, a
 * loss or a push). A decision is anything the bet does with money; rolls that don't touch it move
 * the puck and come round again.
 */
function edge(state, stake, track = () => true) {
  const norm = (s) => ({ ...s, rolls: 0 });
  const id = (s) => JSON.stringify(norm(s));
  const graph = new Map();
  const todo = [norm(state)];
  while (todo.length) {
    const s = todo.pop();
    const k = id(s);
    if (graph.has(k)) continue;
    const edges = [];
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
      const r = resolve(s, [a, b]);
      const mine = r.outcomes.filter((o) => track(o.key) && ['win', 'lose', 'push', 'off'].includes(o.result));
      if (mine.length) edges.push({ profit: mine.reduce((t, o) => t + (o.result === 'win' ? o.won : o.result === 'lose' ? -o.stake : 0), 0) });
      else { edges.push({ next: id(r.state) }); todo.push(norm(r.state)); }
    }
    graph.set(k, edges);
  }
  let V = new Map([...graph.keys()].map((k) => [k, 0]));
  for (let i = 0; i < 600; i++) {
    const W = new Map();
    for (const [k, edges] of graph) W.set(k, edges.reduce((t, e) => t + ('profit' in e ? e.profit : V.get(e.next)) / 36, 0));
    V = W;
  }
  return V.get(id(state)) / stake;
}
const near = (got, want, what) => assert.ok(Math.abs(got - want) < 1e-9, `${what}: ${(got * 100).toFixed(4)}% vs ${(want * 100).toFixed(4)}%`);

test('house edge of every bet, exact (pass 1.41%, don\'t pass 1.36%, place 6 1.52%, any seven 16.67% ...)', () => {
  const S = 60;
  near(edge(table({ pass: S }), S), -7 / 495, 'pass line');
  near(edge(table({ dp: S }), S), -3 / 220, "don't pass");
  near(edge(table({ come: S }, 6), S), -7 / 495, 'come');
  near(edge(table({ dc: S }, 6), S), -3 / 220, "don't come");
  for (const n of [6, 8]) near(edge(table({ [`place:${n}`]: S }), S), -1 / 66, `place ${n}`);
  for (const n of [5, 9]) near(edge(table({ [`place:${n}`]: S }), S), -1 / 25, `place ${n}`);
  for (const n of [4, 10]) near(edge(table({ [`place:${n}`]: S }), S), -1 / 15, `place ${n}`);
  for (const n of POINTS) {
    near(edge(table({ [`buy:${n}`]: S }), S), 0, `buy ${n} before the commission`);
    near(edge(table({ [`lay:${n}`]: S }), S), 0, `lay ${n} before the commission`);
    near(edge(table({ pass: 10, 'pass-odds': S }, n), S, (k) => k === 'pass-odds'), 0, `pass odds on ${n}`);
    near(edge(table({ dp: 10, 'dp-odds': S }, n), S, (k) => k === 'dp-odds'), 0, `don't pass odds on ${n}`);
    near(edge(table({ [`come:${n}`]: 10, [`come:${n}-odds`]: S }, n === 4 ? 5 : 4), S, (k) => k.endsWith('-odds')), 0, `come odds on ${n}`);
  }
  near(commission(S) / S, 0.05, 'buy commission');
  near(edge(table({ field: S }), S), -1 / 18, 'field paying 2:1 on 12');
  near(edge(table({ field: S }, null, { field12: 3 }), S), -1 / 36, 'field paying 3:1 on 12');
  for (const n of [6, 8]) near(edge(table({ [`big${n}`]: S }), S), -1 / 11, `big ${n}`);
  for (const n of [6, 8]) near(edge(table({ [`hard:${n}`]: S }), S), -1 / 11, `hard ${n}`);
  for (const n of [4, 10]) near(edge(table({ [`hard:${n}`]: S }), S), -1 / 9, `hard ${n}`);
  near(edge(table({ any7: S }), S), -1 / 6, 'any seven');
  near(edge(table({ craps: S }), S), -1 / 9, 'any craps');
  near(edge(table({ two: S }), S), -5 / 36, 'two');
  near(edge(table({ twelve: S }), S), -5 / 36, 'twelve');
  near(edge(table({ three: S }), S), -1 / 9, 'three');
  near(edge(table({ yo: S }), S), -1 / 9, 'eleven');
  near(edge(table({ horn: S }), S), -1 / 8, 'horn');
});

// ------------------------------------------------------------------ the drawn table
test('the layout draws every bet spot, both ways round, with chips, the puck and the dice', async () => {
  const { layout, propsLayout } = await import('../public/js/casino/games/craps.js');
  const t = { ...newTable(), point: 6, bets: { pass: 10, 'pass-odds': 30, 'come:5': 10, 'come:5-odds': 20, 'dc:9': 5, 'place:8': 12, 'buy:4': 25 } };
  const v = { table: t, staged: { field: 5 }, dice: [3, 3], hist: [6, 8] };
  const wide = layout(v), tall = layout({ ...v, tall: true }), props = propsLayout(v);
  for (const s of [wide, tall, props]) assert.doesNotMatch(s, /undefined|NaN/);
  for (const k of ['pass', 'pass-odds', 'dp', 'dp-odds', 'come', 'dc', 'field', 'big6', 'big8', ...POINTS.flatMap((n) => [`place:${n}`, `buy:${n}`, `lay:${n}`])]) {
    assert.ok(wide.includes(`data-spot="${k}"`), `wide ${k}`);
    assert.ok(tall.includes(`data-spot="${k}"`), `tall ${k}`);
  }
  for (const k of ['any7', 'craps', 'two', 'three', 'yo', 'twelve', 'horn', 'hard:4', 'hard:6', 'hard:8', 'hard:10']) {
    assert.ok(wide.includes(`data-spot="${k}"`), `wide ${k}`);
    assert.ok(props.includes(`data-spot="${k}"`), `drawer ${k}`);
    assert.ok(!tall.includes(`data-spot="${k}"`), `the phone layout leaves ${k} to the drawer`);
  }
  assert.ok(wide.includes('data-spot="come:5-odds"') && wide.includes('data-spot="dc:9-odds"'), 'come bets on numbers take odds');
  assert.ok(wide.includes('>ON<'), 'the puck is ON');
  assert.ok(layout().includes('>OFF<'), 'and OFF on the come-out');
  assert.ok(wide.includes('class="cz-cr-staged"'), 'staged chips are ringed');
  assert.match(wide, /hard six/);
  assert.match(layout({ table: newTable({ field12: 3 }) }), /12 pays triple/);
});
