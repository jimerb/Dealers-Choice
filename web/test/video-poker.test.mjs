// Video Poker engine: pay tables on all three machines, the hand flow, the exact hold values (the
// Hint) and the machines' returns with perfect play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MACHINES, rowOf, payout, payingMask, init, step, legal, fastRower, rowTable, index5, cardNum, HANDS,
  holdValues, holdValuesDirect, bestHold, describeHold, exactReturn, subsetTables, holdValuesNum,
} from '../public/js/casino/engines/video-poker.js';
import { cards, card } from '../public/js/casino/kit/shoe.js';
import { seededRng } from '../public/js/casino/kit/rng.js';
import { createBank, KEY } from '../public/js/core/bank.js';
import { createMachine } from '../public/js/casino/kit/round.js';

const SLOW = process.env.SLOW === '1';
const key = (id, hand) => { const r = rowOf(id, cards(hand)); return r < 0 ? null : MACHINES[id].rows[r].key; };
const pays = (id, hand, coins) => payout(id, cards(hand), coins).credits;

test('Jacks or Better 9/6: every hand on the table', () => {
  const J = 'jacks';
  assert.equal(key(J, 'AS KS QS JS 10S'), 'royal');
  assert.equal(key(J, '9H KH QH JH 10H'), 'sf');
  assert.equal(key(J, 'AD 2D 3D 4D 5D'), 'sf', 'the wheel straight flush');
  assert.equal(key(J, '7S 7H 7C 7D 2S'), 'quads');
  assert.equal(key(J, '7S 7H 7C 2D 2S'), 'fh');
  assert.equal(key(J, '2H 7H 9H JH KH'), 'flush');
  assert.equal(key(J, 'AS 2H 3C 4D 5S'), 'straight');
  assert.equal(key(J, '10S JH QC KD AS'), 'straight');
  assert.equal(key(J, '4S 4H 4C KD 2S'), 'trips');
  assert.equal(key(J, '4S 4H 9C 9D 2S'), 'twopair');
  assert.equal(key(J, 'JS JH 9C 5D 2S'), 'jacks');
  assert.equal(key(J, 'AS AH 9C 5D 2S'), 'jacks');
  assert.equal(key(J, '10S 10H 9C 5D 2S'), null, 'tens do not pay');
  assert.equal(key(J, 'QS KH 2C 5D 7S'), null);
  assert.equal(key(J, 'QS KS AS 2S 3H'), null, 'no wrap-around straights');
  assert.deepEqual([1, 2, 3, 4, 5].map((c) => pays(J, 'AS KS QS JS 10S', c)), [250, 500, 750, 1000, 4000]);
  assert.deepEqual([1, 5].map((c) => pays(J, '7S 7H 7C 2D 2S', c)), [9, 45]);
  assert.deepEqual([1, 5].map((c) => pays(J, '2H 7H 9H JH KH', c)), [6, 30]);
  assert.equal(pays(J, 'JS JH 9C 5D 2S', 3), 3);
});

test('Bonus Poker 8/5: four of a kind by rank', () => {
  const B = 'bonus';
  assert.equal(key(B, 'AS AH AC AD 2S'), 'quadsA');
  assert.equal(pays(B, 'AS AH AC AD 2S', 1), 80);
  for (const r of ['2', '3', '4']) assert.equal(pays(B, `${r}S ${r}H ${r}C ${r}D KS`, 1), 40, `four ${r}s`);
  for (const r of ['5', '9', 'K']) assert.equal(pays(B, `${r}S ${r}H ${r}C ${r}D 2S`, 1), 25, `four ${r}s`);
  assert.equal(pays(B, '7S 7H 7C 2D 2S', 1), 8);
  assert.equal(pays(B, '2H 7H 9H JH KH', 1), 5);
  assert.equal(pays(B, 'AS 2H 3C 4D 5S', 1), 4);
  assert.equal(pays(B, '4S 4H 4C KD 2S', 1), 3);
  assert.equal(pays(B, '4S 4H 9C 9D 2S', 1), 2);
  assert.equal(pays(B, 'QS QH 9C 5D 2S', 1), 1);
  assert.equal(pays(B, 'AS KS QS JS 10S', 5), 4000);
  assert.equal(pays(B, '9H KH QH JH 10H', 1), 50);
});

test('Deuces Wild (full pay): natural and wild royals, four deuces, five of a kind', () => {
  const D = 'deuces';
  assert.equal(key(D, 'AS KS QS JS 10S'), 'royal', 'natural royal');
  assert.deepEqual([1, 5].map((c) => pays(D, 'AS KS QS JS 10S', c)), [250, 4000]);
  assert.equal(key(D, 'AS KS QS JS 2H'), 'wildroyal', 'a deuce makes a wild royal');
  assert.equal(key(D, 'AS 2D QS 2C 10S'), 'wildroyal');
  assert.equal(pays(D, 'AS KS QS JS 2H', 5), 125, 'a wild royal has no 5-coin bonus');
  assert.equal(key(D, '2S 2H 2C 2D 9S'), 'deuces4');
  assert.equal(key(D, '2S 2H 2C 2D AS'), 'deuces4', 'four deuces beat everything but a natural royal');
  assert.equal(pays(D, '2S 2H 2C 2D 9S', 1), 200);
  assert.equal(key(D, '9S 9H 9C 2D 9D'), 'five');
  assert.equal(key(D, '9S 9H 2C 2D 2H'), 'five');
  assert.equal(pays(D, '9S 9H 2C 2D 2H', 1), 15);
  assert.equal(key(D, '5H 6H 2C 8H 9H'), 'sf');
  assert.equal(key(D, 'AH 3H 2C 4H 5H'), 'sf', 'wheel with a deuce');
  assert.equal(pays(D, '5H 6H 2C 8H 9H', 1), 9);
  assert.equal(key(D, '9S 9H 9C 2D 4S'), 'quads');
  assert.equal(key(D, '9S 9H 4C 4D 2S'), 'fh');
  assert.equal(key(D, '9S 9H 9C 4D 4S'), 'fh');
  assert.equal(key(D, '3H 7H 9H JH 2S'), 'flush');
  assert.equal(key(D, '3H 4S 5C 6D 2S'), 'straight');
  assert.equal(key(D, '3H 3S 8C KD 2S'), 'trips');
  assert.equal(key(D, '3H 3S 8C 8D KS'), null, 'two pair pays nothing');
  assert.equal(key(D, 'AH AS 8C 6D KS'), null, 'a pair pays nothing');
  assert.deepEqual([1, 5].map((c) => pays(D, '3H 3S 8C KD 2S', c)), [1, 5]);
});

test('the fast row finder agrees with the shared evaluator', () => {
  const rng = seededRng(42);
  const n = SLOW ? HANDS : 60000;
  for (const id of Object.keys(MACHINES)) {
    const rower = fastRower(id);
    const rows = rowTable(id);
    const check = (h) => {
      const nums = h.map(cardNum).sort((a, b) => a - b);
      const want = rowOf(id, h);
      assert.equal(rower(...nums), want, `${id}: ${h.map((c) => c.id).join(' ')}`);
      assert.equal(rows[index5(...nums)], want);
    };
    const deck = cards('AS KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S AH KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H AC KC QC JC 10C 9C 8C 7C 6C 5C 4C 3C 2C AD KD QD JD 10D 9D 8D 7D 6D 5D 4D 3D 2D');
    if (SLOW) {
      for (let e = 4; e < 52; e++) for (let d = 3; d < e; d++) for (let c = 2; c < d; c++) for (let b = 1; b < c; b++) for (let a = 0; a < b; a++) check([deck[a], deck[b], deck[c], deck[d], deck[e]]);
    } else {
      for (let i = 0; i < n; i++) {
        const pick = new Set();
        while (pick.size < 5) pick.add(rng.int(52));
        check([...pick].map((x) => deck[x]));
      }
    }
  }
});

test('category counts over all 2,598,960 hands match the known frequencies', () => {
  const count = (id) => { const t = rowTable(id); const c = {}; for (const r of t) { const k = r < 0 ? 'none' : MACHINES[id].rows[r].key; c[k] = (c[k] ?? 0) + 1; } return c; };
  const j = count('jacks');
  assert.deepEqual([j.royal, j.sf, j.quads, j.fh, j.flush, j.straight, j.trips, j.twopair], [4, 36, 624, 3744, 5108, 10200, 54912, 123552]);
  assert.equal(j.jacks, 4 * 84480, 'pairs of jacks, queens, kings or aces');
  const b = count('bonus');
  assert.deepEqual([b.quadsA, b.quads24, b.quads5K], [48, 144, 432]);
  const d = count('deuces');
  assert.equal(d.royal, 4);
  assert.equal(d.deuces4, 48);
});

test('the hand: bet, deal, hold, draw, paid', () => {
  let s = init({ machine: 'jacks', coins: 9 });
  assert.equal(s.coins, 5, 'coins are kept between 1 and 5');
  s = step(s, 'betOne').state;
  assert.equal(s.coins, 1, 'Bet One wraps from 5 to 1');
  s = step(s, { type: 'coins', n: 5 }).state;
  assert.deepEqual(legal(s).map((a) => a.type), ['coins', 'betOne', 'machine', 'deal']);
  assert.throws(() => step(s, 'draw'), /Deal/);
  const before = s;
  s = step(s, 'deal', { rng: seededRng(5) }).state;
  assert.equal(before.phase, 'bet', 'the old state is untouched');
  assert.equal(s.phase, 'hold');
  assert.equal(s.hand.length, 5);
  assert.throws(() => step(s, { type: 'machine', id: 'bonus' }), /Finish/);
  s = step(s, { type: 'hold', i: 0 }).state;
  s = step(s, { type: 'hold', i: 3 }).state;
  const kept = [s.hand[0], s.hand[3]];
  const r = step(s, 'draw');
  s = r.state;
  assert.equal(s.phase, 'paid');
  assert.equal(s.hand[0].id, kept[0].id);
  assert.equal(s.hand[3].id, kept[1].id);
  assert.deepEqual(s.result.drawn, [1, 2, 4]);
  const ids = new Set(s.hand.map((c) => c.id));
  assert.equal(ids.size, 5, 'replacements come from the same deck: no repeats');
  assert.deepEqual(r.done, { wagered: 5, won: payout('jacks', s.hand, 5).credits });
  // a stacked deck: deal a pat royal
  let t = step(init({ machine: 'jacks' }), 'deal', { rng: seededRng(1) }).state;
  t.hand = cards('AS KS QS JS 10S');
  t = step(t, 'holdAll').state;
  const done = step(t, 'draw');
  assert.equal(done.done.won, 4000);
  assert.equal(done.state.result.label, 'Royal flush');
});

test('paying cards: the high pair, two pair, trips with deuces, all five for a straight', () => {
  assert.equal(payingMask('jacks', cards('3C JS 9C JH 2S')), 0b01010);
  assert.equal(payingMask('jacks', cards('3C 3S 9C JH 2S')), 0);
  assert.equal(payingMask('jacks', cards('4S 4H 9C 9D 2S')), 0b01111);
  assert.equal(payingMask('jacks', cards('AS 2H 3C 4D 5S')), 0b11111);
  assert.equal(payingMask('deuces', cards('3H 3S 8C KD 2S')), 0b10011);
  assert.equal(payingMask('deuces', cards('2S 2H 2C 2D 9S')), 0b01111);
  assert.equal(payingMask('deuces', cards('KH 8S 2C 7D 2S')), 0b10101, 'deuces plus the highest natural');
});

test('a machine round moves only credits, and the bank records it in dollars', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const bank = createBank({ storage, win: null });
  const m = createMachine(bank, 'video-poker', 5);
  assert.ok(m.insert(100).ok);
  assert.equal(m.credits, 20);
  assert.equal(bank.balance, 4900);
  assert.ok(m.bet(5));
  m.pay(payout('jacks', cards('AS KS QS JS 10S'), 5).credits);
  assert.equal(m.credits, 4015);
  const out = m.cashOut();
  assert.equal(out.dollars, 4015 * 5);
  assert.equal(bank.balance, 4900 + 4015 * 5);
  assert.ok(mem.has(KEY));
});

// ---- the Hint: exact values of the 32 holds
test('hold values: known hands', () => {
  // four to a royal in 9/6 Jacks or Better, per credit at five credits: (800 + 8*6 + 3*4 + 12*1) / 47
  const v = holdValues('jacks', cards('AS KS QS JS 2H'), 5);
  assert.ok(Math.abs(v[0b01111] / 5 - 872 / 47) < 1e-9);
  const b = bestHold('jacks', cards('AS KS QS JS 2H'), 5);
  assert.equal(b.mask, 0b01111);
  assert.equal(b.text, 'four to a royal flush');
  // pat royal, four deuces (always 200 per credit), a dealt flush with four to a royal
  assert.equal(holdValues('jacks', cards('AS KS QS JS 10S'), 5)[31], 4000);
  assert.equal(holdValues('deuces', cards('2S 2H 2C 2D 9S'), 1)[0b01111], 200);
  assert.equal(bestHold('deuces', cards('2S 2H 2C 2D 9S'), 1).value, 200);
  assert.equal(bestHold('jacks', cards('AH KH QH JH 3H'), 5).mask, 0b01111, 'break a flush for four to a royal');
  assert.equal(bestHold('jacks', cards('KH QH JH 9H 3H'), 5).mask, 0b11111, 'keep a pat flush over three to a royal');
  // a high pair is worth about 1.54 per credit
  const pair = bestHold('jacks', cards('JS JH 8C 5D 2S'), 1);
  assert.equal(pair.mask, 0b00011);
  assert.ok(pair.value > 1.5 && pair.value < 1.57, String(pair.value));
  assert.equal(pair.text, 'a pair of jacks');
  assert.match(bestHold('deuces', cards('2S 7H 9C KD 4S'), 5).text, /deuce/, 'never throw away a deuce');
  assert.equal(describeHold('jacks', cards('3S 7H 9C 5D 10S'), 0), 'nothing worth keeping: draw five new cards');
});

test('hold values: the fast way equals brute force on every hold', () => {
  const hands = ['AS KS QS JS 2H', '3C 7D 9H JS KD', '2S 2H 8C 9C 10C', 'JS JH 8C 5D 2S'];
  const list = SLOW ? hands : hands.slice(0, 1);
  for (const [id, h] of [['jacks', list[0]], ...(SLOW ? [['bonus', hands[1]], ['deuces', hands[2]], ['deuces', hands[1]], ['bonus', hands[3]]] : [])]) {
    for (const coins of SLOW ? [1, 5] : [5]) {
      const fast = holdValues(id, cards(h), coins), slow = holdValuesDirect(id, cards(h), coins);
      for (let m = 0; m < 32; m++) assert.ok(Math.abs(fast[m] - slow[m]) < 1e-9, `${id} ${h} mask ${m}: ${fast[m]} vs ${slow[m]}`);
    }
  }
});

// ---- return to player
test('returns with perfect play: a quick check on 80,000 random deals', () => {
  const rng = seededRng(2024);
  const out = new Float64Array(32);
  for (const id of Object.keys(MACHINES)) {
    const t = subsetTables(id);
    let sum = 0;
    const n = 80000;
    for (let i = 0; i < n; i++) {
      const pick = new Set();
      while (pick.size < 5) pick.add(rng.int(52));
      holdValuesNum(id, [...pick], 5, out, t);
      sum += Math.max(...out);
    }
    const rtp = (sum / n / 5) * 100;
    assert.ok(Math.abs(rtp - MACHINES[id].returnPct) < 2, `${id}: ${rtp.toFixed(2)}%`);
  }
});

test('exact returns over every deal (SLOW=1): 99.54%, 99.17%, 100.76%', { skip: !SLOW && 'set SLOW=1' }, () => {
  for (const [id, want] of [['jacks', 99.54], ['bonus', 99.17], ['deuces', 100.76]]) {
    const { rtp } = exactReturn(id, 5);
    assert.equal((rtp * 100).toFixed(2), want.toFixed(2), id);
  }
});

test('a lower bet loses the royal bonus: Jacks or Better at one credit returns less', { skip: !SLOW && 'set SLOW=1' }, () => {
  assert.ok(exactReturn('jacks', 1).rtp < 0.9954 - 0.01);
  void card;
});
