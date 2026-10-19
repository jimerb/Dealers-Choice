// Let It Ride: the pay table on every hand class, pulling bets back, the money through a real bank,
// the ride-or-pull advice against the standard strategy, and the exact house edge (3.51%).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal, decide, payout, payClass, rideEV, advise, minBuyIn, PAY_TABLE } from '../public/js/casino/engines/let-it-ride.js';
import { cards } from '../public/js/casino/kit/shoe.js';
import { seededRng } from '../public/js/casino/kit/rng.js';
import { evaluate, HAND } from '../public/js/casino/kit/poker.js';
import { createBank } from '../public/js/core/bank.js';
import { createRound } from '../public/js/casino/kit/round.js';

const rng = seededRng(5);
const play = (base, p, c, choices = ['ride', 'ride']) => {
  let s = deal(base, rng, { cards: [...p.split(' '), ...c.split(' ')] });
  for (const ch of choices) s = decide(s, ch);
  return s;
};

test('the deal: three cards and two face-down community cards from one deck', () => {
  const s = deal(10, seededRng(1));
  assert.equal(s.phase, 'first');
  assert.equal(s.player.length, 3);
  assert.equal(s.community.length, 2);
  assert.equal(s.shown, 0);
  assert.equal(new Set([...s.player, ...s.community].map((c) => c.id)).size, 5);
  assert.throws(() => deal(0, rng), /whole/);
  assert.throws(() => decide(s, 'fold'), /ride or pull/);
  const s2 = decide(s, 'pull');
  assert.equal(s2.phase, 'second');
  assert.equal(s2.shown, 1);
  assert.deepEqual(s2.riding, [false, true, true]);
  assert.equal(s.riding[0], true, 'the state passed in is not changed');
  const s3 = decide(s2, 'ride');
  assert.equal(s3.phase, 'done');
  assert.equal(s3.shown, 2);
  assert.throws(() => decide(s3, 'ride'), /over/);
  assert.equal(minBuyIn({ min: 10, max: 2000 }), 30);
});

test('every line of the pay table, on each bet still riding', () => {
  const hands = [
    ['AS KS QS', 'JS 10S', 'ROYAL', 1000],
    ['9H 8H 7H', '6H 5H', 'STRAIGHT_FLUSH', 200],
    ['AD 2D 3D', '4D 5D', 'STRAIGHT_FLUSH', 200],
    ['7S 7H 7D', '7C 2S', 'QUADS', 50],
    ['3S 3H 3D', '9C 9S', 'FULL_HOUSE', 11],
    ['2C 7C 9C', 'JC KC', 'FLUSH', 8],
    ['AS 2H 3D', '4C 5S', 'STRAIGHT', 5],
    ['10S JH QD', 'KC AS', 'STRAIGHT', 5],
    ['5S 5H 5D', 'KC 2S', 'TRIPS', 3],
    ['4S 4H 9D', '9C 2S', 'TWO_PAIR', 2],
    ['10S 10H 2D', '5C 7S', 'PAIR', 1],
    ['AS AH 2D', '5C 7S', 'PAIR', 1],
    ['9S 9H 2D', '5C 7S', 'LOSE', 0],
    ['AS KH 2D', '5C 7S', 'LOSE', 0],
    ['QS KH AD', '2C 3S', 'LOSE', 0],
  ];
  for (const [p, c, key, m] of hands) {
    const r = play(10, p, c).result;
    assert.equal(r.key, key, `${p} ${c}`);
    assert.equal(r.mult, m);
    assert.equal(r.wagered, 30);
    assert.equal(r.returned, m ? 3 * 10 * (m + 1) : 0, `${p} ${c}`);
  }
  assert.deepEqual(PAY_TABLE.map((x) => x[2]), [1000, 200, 50, 11, 8, 5, 3, 2, 1]);
  assert.equal(payout(cards('JS JH 2D 5C 7S')).name, 'Pair of jacks');
});

test('pulled bets come back and are not paid; the $ bet always rides', () => {
  const both = play(10, '10S 10H 2D', '5C 7S', ['pull', 'pull']).result;
  assert.equal(both.wagered, 10);
  assert.equal(both.pulled, 20);
  assert.equal(both.returned, 20);
  assert.equal(both.net, 10);
  assert.deepEqual(both.lines.map((l) => l.bet), ['Bet $']);
  const one = play(10, '2S 7H 9D', 'KC 4S', ['ride', 'pull']).result;
  assert.equal(one.wagered, 20);
  assert.equal(one.returned, 0);
  assert.deepEqual(one.lines.map((l) => l.bet), ['Bet 1', 'Bet $']);
});

test('money through the bank: three bets at the deal, a refund per pull, settle', () => {
  const store = new Map();
  const bank = createBank({ storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, win: null });
  const round = createRound(bank, 'let-it-ride');
  round.wager(30);
  round.setReturnable(20);
  assert.equal(round.atRisk, 10, 'leaving now would lose only the $ bet');
  let s = deal(10, rng, { cards: cards('JS JH 2D 5C 7S').map((c) => `${c.rank}${c.suit}`) });
  s = decide(s, 'pull'); round.refund(10); round.setReturnable(10);
  s = decide(s, 'ride');
  round.settle({ returned: s.result.returned });
  assert.equal(s.result.returned, 40);
  assert.equal(bank.balance, 5000 + 20);
  assert.deepEqual(bank.get().stats['let-it-ride'], { hands: 1, wagered: 20, won: 40, net: 20, biggest: 20 });
  // leave before the first decision: bets 1 and 2 could still come down, the $ bet is lost
  round.wager(30); round.setReturnable(20);
  assert.deepEqual(round.leave(), { back: 20, lost: 10 });
  assert.equal(bank.balance, 5010);
});

test('the advice follows the standard strategy', () => {
  const ride = (c) => advise(cards(c)).ride;
  // three cards
  assert.equal(ride('10S 10H 2D'), true, 'a paying pair');
  assert.equal(ride('5S 5H KD'), false, 'a low pair');
  assert.equal(ride('7S 7H 7D'), true, 'trips');
  assert.equal(ride('JS QS KS'), true, 'three to a royal');
  assert.equal(ride('10H JH AH'), true, 'three to a royal with a gap');
  assert.equal(ride('3S 4S 5S'), true, 'three suited in a row');
  assert.equal(ride('2S 3S 4S'), false, '2-3-4 suited');
  assert.equal(ride('AS 2S 3S'), false, 'A-2-3 suited');
  assert.equal(ride('2S 4S 6S'), false, 'spread out with no high card');
  assert.equal(ride('9S JS QS'), true, 'one gap, two high cards');
  assert.equal(ride('AS KH 7D'), false, 'high cards alone');
  // four cards
  assert.equal(ride('2S 6S 9S KS'), true, 'four to a flush');
  assert.equal(ride('5S 6H 7D 8C'), true, 'four to an outside straight');
  assert.equal(ride('10S JH QD AC'), true, 'inside straight, four high cards');
  assert.equal(ride('5S 6H 8D 9C'), false, 'inside straight, low');
  assert.equal(ride('AS 2H 3D 4C'), false, 'A-2-3-4 is a one-way draw');
  assert.equal(ride('9S 9H 4D 2C'), false, 'a low pair');
  assert.equal(ride('JS JH 4D 2C'), true, 'a paying pair');
  assert.match(advise(cards('2S 6S 9S KS')).text, /^Let it ride: four to a flush/);
  assert.match(advise(cards('5S 6H 7D 8C')).text, /open-ended straight/);
  assert.match(advise(cards('AS KH 7D')).text, /^Pull it back/);
  assert.match(advise(cards('5S 5H KD')).text, /below tens/);
});

test('the fast pay class agrees with the full evaluator', () => {
  const r = seededRng(9);
  const deck = cards('AS KS QS JS 10S 9S 8S 7S 6S 5S 4S 3S 2S AH KH QH JH 10H 9H 8H 7H 6H 5H 4H 3H 2H AD KD QD JD 10D 9D 8D 7D 6D 5D 4D 3D 2D AC KC QC JC 10C 9C 8C 7C 6C 5C 4C 3C 2C');
  const toKey = { [HAND.ROYAL]: 'ROYAL', [HAND.STRAIGHT_FLUSH]: 'STRAIGHT_FLUSH', [HAND.QUADS]: 'QUADS', [HAND.FULL_HOUSE]: 'FULL_HOUSE', [HAND.FLUSH]: 'FLUSH', [HAND.STRAIGHT]: 'STRAIGHT', [HAND.TRIPS]: 'TRIPS', [HAND.TWO_PAIR]: 'TWO_PAIR' };
  for (let i = 0; i < 20000; i++) {
    const five = [];
    while (five.length < 5) { const c = deck[r.int(52)]; if (!five.includes(c)) five.push(c); }
    const ev = evaluate(five);
    const want = toKey[ev.cat] ?? (ev.cat === HAND.PAIR && ev.tiebreak[0] >= 10 ? 'PAIR' : 'LOSE');
    assert.equal(payout(five).key, want, five.map((c) => c.id).join(' '));
  }
});

test('exact: every five-card hand and the house edge with perfect play is 3.51%', () => {
  // the $ bet: all 2,598,960 hands
  const R = (i) => 2 + (i >> 2), S = (i) => i & 3;
  const mult = Object.fromEntries(PAY_TABLE.map(([k, , m]) => [k, m]));
  const n = {};
  let bet3 = 0, hands = 0;
  const r = [0, 0, 0, 0, 0], s = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
    r[0] = R(a); r[1] = R(b); r[2] = R(c); r[3] = R(d); r[4] = R(e);
    s[0] = S(a); s[1] = S(b); s[2] = S(c); s[3] = S(d); s[4] = S(e);
    const k = payClass(r, s);
    n[k] = (n[k] ?? 0) + 1;
    bet3 += k === 'LOSE' ? -1 : mult[k];
    hands++;
  }
  assert.equal(hands, 2598960);
  assert.deepEqual([n.ROYAL, n.STRAIGHT_FLUSH, n.QUADS, n.FULL_HOUSE, n.FLUSH, n.STRAIGHT, n.TRIPS, n.TWO_PAIR, n.PAIR], [4, 36, 624, 3744, 5108, 10200, 54912, 123552, 422400]);
  // bets 1 and 2: ride exactly when riding is worth more than nothing; group hands by ranks and suit pattern
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'], SUITS = ['S', 'H', 'C', 'D'];
  const card = (i) => ({ rank: RANKS[i >> 2], suit: SUITS[i & 3] });
  const best = (k) => {
    const groups = new Map();
    const idx = Array.from({ length: k }, (_, i) => i);
    const walk = (start, acc) => {
      if (acc.length === k) {
        const map = new Map();
        const key = acc.map((x) => { const t = x & 3; if (!map.has(t)) map.set(t, map.size); return `${x >> 2}.${map.get(t)}`; }).sort().join('|');
        const g = groups.get(key);
        if (g) g.n++; else groups.set(key, { cards: acc.map(card), n: 1 });
        return;
      }
      for (let i = start; i < 52; i++) { acc.push(i); walk(i + 1, acc); acc.pop(); }
    };
    walk(0, []);
    let total = 0, count = 0;
    for (const g of groups.values()) { total += g.n * Math.max(0, rideEV(g.cards)); count += g.n; }
    return { ev: total / count, count, idx };
  };
  const b1 = best(3), b2 = best(4);
  assert.equal(b1.count, 22100);
  assert.equal(b2.count, 270725);
  const edge = -(bet3 / hands + b1.ev + b2.ev);
  assert.ok(Math.abs(edge - 0.035104) < 0.0001, `house edge ${(edge * 100).toFixed(4)}%`);
});

test('SLOW: a long run with the advice lands on 3.51%', { skip: process.env.SLOW !== '1' }, () => {
  const r = seededRng(77);
  let net = 0;
  const N = 400_000;
  for (let i = 0; i < N; i++) {
    let s = deal(1, r);
    s = decide(s, advise(s.player).ride ? 'ride' : 'pull');
    s = decide(s, advise([...s.player, s.community[0]]).ride ? 'ride' : 'pull');
    net += s.result.net;
  }
  assert.ok(Math.abs(-net / N - 0.0351) < 0.012, `house edge ${(-net / N * 100).toFixed(2)}%`);
});
