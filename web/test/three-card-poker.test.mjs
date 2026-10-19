// Three Card Poker: every payout, the dealer's queen-high qualifier, folds, ties, the money through a
// real bank, and the exact house edge of the Ante/Play (queen-six-four strategy) and Pair Plus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal, resolve, advise, atLeastQ64, dealerQualifies, minBuyIn, PAIR_PLUS, ANTE_BONUS, OPTIONS } from '../public/js/casino/engines/three-card-poker.js';
import { evaluate3, HAND3, compare } from '../public/js/casino/kit/poker.js';
import { cards } from '../public/js/casino/kit/shoe.js';
import { seededRng } from '../public/js/casino/kit/rng.js';
import { createBank } from '../public/js/core/bank.js';
import { createRound } from '../public/js/casino/kit/round.js';

const rng = seededRng(7);
const hand = (p, d) => [...p.split(' '), ...d.split(' ')];
const play = (bets, p, d, choice = 'play', opts) => {
  const s = deal(bets, rng, { cards: hand(p, d), opts });
  return s.phase === 'done' ? s.result : resolve(s, choice, opts).result;
};
const line = (r, bet) => r.lines.find((l) => l.bet === bet);

test('the deal: three cards each from one deck, then a decision', () => {
  const s = deal({ ante: 10 }, seededRng(3));
  assert.equal(s.phase, 'decide');
  assert.equal(s.player.length, 3);
  assert.equal(s.dealer.length, 3);
  assert.equal(new Set([...s.player, ...s.dealer].map((c) => c.id)).size, 6);
  assert.throws(() => deal({}, rng), /Ante, Pair Plus/);
  assert.throws(() => deal({ ante: 2.5 }, rng), /whole/);
  assert.throws(() => resolve(s, 'raise'), /Play or fold/);
  assert.throws(() => resolve(resolve(s, 'fold'), 'play'), /over/);
  assert.equal(minBuyIn({ min: 25, max: 3000 }), 50);
});

test('the dealer qualifies with queen high or better', () => {
  const q = (c) => dealerQualifies(evaluate3(cards(c)));
  assert.equal(q('QS 3H 2D'), true);
  assert.equal(q('JS 10H 8D'), false);
  assert.equal(q('2S 2H 3D'), true, 'any pair');
  assert.equal(q('3S 4S 6S'), true, 'a flush');
  assert.equal(q('2S 3H 4D'), true, 'a straight');
  assert.equal(q('AS KH 2D'), true);
});

test('play and win: Ante and Play each pay 1 to 1', () => {
  const r = play({ ante: 10 }, 'KS KH 2D', 'QS 9H 4C');
  assert.equal(r.outcome, 'win');
  assert.equal(r.wagered, 20);
  assert.equal(r.returned, 40);
  assert.equal(r.net, 20);
});

test('play and lose: both bets lost', () => {
  const r = play({ ante: 10 }, 'KS QH 2D', 'AS AH 4C');
  assert.equal(r.outcome, 'lose');
  assert.equal(r.returned, 0);
  assert.equal(r.net, -20);
});

test('a dealer who doesn\'t qualify: the Ante pays 1 to 1, the Play pushes', () => {
  const r = play({ ante: 10 }, '5S 3H 2D', 'JS 9H 4C');
  assert.equal(r.qualifies, false);
  assert.equal(r.outcome, 'noqualify');
  assert.equal(line(r, 'Ante').back, 20);
  assert.equal(line(r, 'Play').back, 10);
  assert.equal(r.returned, 30);
  assert.equal(r.net, 10);
});

test('a tie with a qualifying dealer pushes Ante and Play', () => {
  const r = play({ ante: 10 }, 'QS 7H 3D', 'QC 7D 3S');
  assert.equal(r.outcome, 'push');
  assert.equal(r.returned, 20);
  assert.equal(r.net, 0);
});

test('fold: the Ante and the Pair Plus are lost, the dealer still shows', () => {
  const r = play({ ante: 10, pairPlus: 5 }, 'JS 7H 2D', 'QS 9H 4C', 'fold');
  assert.equal(r.outcome, 'fold');
  assert.equal(r.play, 0);
  assert.equal(r.wagered, 15);
  assert.equal(r.returned, 0);
  assert.equal(r.net, -15);
  // even a hand that would have paid Pair Plus loses it on a fold
  const r2 = play({ ante: 10, pairPlus: 5 }, '2S 2H 9D', 'QS 9H 4C', 'fold');
  assert.equal(line(r2, 'Pair Plus').back, 0);
});

test('the ante bonus pays on a straight or better, even when the dealer wins', () => {
  const cases = [
    ['4S 5S 6S', HAND3.STRAIGHT_FLUSH, 5],
    ['8S 8H 8D', HAND3.TRIPS, 4],
    ['4S 5H 6D', HAND3.STRAIGHT, 1],
  ];
  for (const [p, cat, m] of cases) {
    assert.equal(ANTE_BONUS[cat], m);
    const r = play({ ante: 10 }, p, 'QS KH AC'); // dealer A-K-Q straight beats all but SF and trips
    assert.equal(line(r, 'Ante bonus').back, 10 * m, p);
  }
  // straight loses to the dealer's higher straight: Ante and Play lost, bonus paid
  const r = play({ ante: 10 }, '4S 5H 6D', 'QS KH AC');
  assert.equal(r.outcome, 'lose');
  assert.equal(r.returned, 10);
  // a flush or a pair has no ante bonus
  assert.equal(line(play({ ante: 10 }, '2S 7S 9S', 'QH 3D 4C'), 'Ante bonus'), undefined);
  // no bonus on a fold
  assert.equal(line(play({ ante: 10 }, '4S 5H 6D', 'QH 3D 4C', 'fold'), 'Ante bonus'), undefined);
});

test('Pair Plus pays on the player\'s hand alone, by either table', () => {
  const hands = [['AS KS QS', HAND3.STRAIGHT_FLUSH], ['9S 9H 9D', HAND3.TRIPS], ['9S 10H JD', HAND3.STRAIGHT], ['2H 7H JH', HAND3.FLUSH], ['5S 5D KC', HAND3.PAIR], ['AS 9D 4C', HAND3.HIGH]];
  for (const [key, table] of Object.entries(PAIR_PLUS)) {
    for (const [p, cat] of hands) {
      const r = play({ pairPlus: 5 }, p, '2C 3C 7D', 'none', { pairPlus: key }); // Pair Plus alone: settled at the deal
      const m = table.pays[cat] ?? 0;
      assert.equal(r.returned, m ? 5 * (m + 1) : 0, `${key} ${p}`);
    }
  }
  assert.equal(PAIR_PLUS['40-30-6-4-1'].pays[HAND3.FLUSH], 4);
  assert.equal(PAIR_PLUS['40-30-6-3-1'].pays[HAND3.FLUSH], 3);
  assert.equal(OPTIONS.find((o) => o.key === 'pairPlus').default, '40-30-6-4-1');
  // with an Ante too, Pair Plus pays even though the dealer wins
  const r = play({ ante: 10, pairPlus: 5 }, '5S 5D KC', 'AS AH 2C');
  assert.equal(r.outcome, 'lose');
  assert.equal(line(r, 'Pair Plus').back, 10);
  assert.equal(r.returned, 10);
});

test('queen-six-four: the play-or-fold line', () => {
  const p = (c) => atLeastQ64(evaluate3(cards(c)));
  assert.equal(p('QS 6H 4D'), true);
  assert.equal(p('QS 6H 3D'), false);
  assert.equal(p('QS 5H 4D'), false);
  assert.equal(p('QS 7H 2D'), true);
  assert.equal(p('JS 10H 8D'), false);
  assert.equal(p('KS 3H 2D'), true);
  assert.equal(p('2S 2H 3D'), true);
  assert.match(advise(cards('QS 6H 4D')).text, /^Play/);
  assert.match(advise(cards('JS 9H 7D')).text, /^Fold/);
  assert.match(advise(cards('8S 8H 2D')).text, /pair of eights/);
});

test('money through the bank: play, fold, leaving mid-hand', () => {
  const store = new Map();
  const bank = createBank({ storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, win: null });
  const round = createRound(bank, 'three-card-poker');
  // Ante 10 + Pair Plus 5 at the deal, Play 10, win with a pair of kings (Pair Plus 1 to 1)
  round.wager(15);
  let s = deal({ ante: 10, pairPlus: 5 }, rng, { cards: hand('KS KH 2D', 'QS 9H 4C') });
  round.wager(10);
  s = resolve(s, 'play');
  round.settle({ returned: s.result.returned });
  assert.equal(s.result.returned, 50);
  assert.equal(bank.balance, 5000 + 25);
  // fold: 15 lost
  round.wager(15);
  s = resolve(deal({ ante: 10, pairPlus: 5 }, rng, { cards: hand('JS 7H 2D', 'QS 9H 4C') }), 'fold');
  round.settle({ returned: s.result.returned });
  assert.equal(bank.balance, 5000 + 25 - 15);
  const st = bank.get().stats['three-card-poker'];
  assert.equal(st.hands, 2);
  assert.equal(st.net, 10);
  // leaving with a hand dealt forfeits the Ante
  round.wager(10);
  assert.equal(round.atRisk, 10);
  assert.deepEqual(round.leave(), { back: 0, lost: 10 });
  assert.equal(bank.balance, 5000);
});

// ------------------------------------------------------------------ exact returns
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['S', 'H', 'C', 'D'];
const DECK = Array.from({ length: 52 }, (_, i) => ({ rank: RANKS[i >> 2], suit: SUITS[i & 3], i }));

function allHands() {
  const out = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) {
    const ev = evaluate3([DECK[a], DECK[b], DECK[c]]);
    out.push({ a, b, c, ev });
  }
  return out;
}

test('all 22,100 three-card hands: the category counts and the Pair Plus returns', () => {
  const hands = allHands();
  const n = new Array(6).fill(0);
  for (const h of hands) n[h.ev.cat]++;
  assert.deepEqual(n, [16440, 3744, 1096, 720, 52, 48]);
  const ret = (pays) => hands.reduce((t, h) => t + (pays[h.ev.cat] ? pays[h.ev.cat] + 1 : 0), 0) / hands.length - 1;
  assert.ok(Math.abs(ret(PAIR_PLUS['40-30-6-4-1'].pays) - -0.023167) < 1e-5, 'flush 4 to 1: house edge 2.32%');
  assert.ok(Math.abs(ret(PAIR_PLUS['40-30-6-3-1'].pays) - -0.072760) < 1e-5, 'flush 3 to 1: house edge 7.28%');
});

test('Ante and Play with queen-six-four: house edge 3.37% of the Ante (exact)', () => {
  const hands = allHands();
  const dealerScore = Float64Array.from(hands, (h) => h.ev.score);
  const dealerQual = Uint8Array.from(hands, (h) => (dealerQualifies(h.ev) ? 1 : 0));
  const A = Int8Array.from(hands, (h) => h.a), B = Int8Array.from(hands, (h) => h.b), C = Int8Array.from(hands, (h) => h.c);
  // group the player's hands by ranks and suit pattern: same expected value
  const groups = new Map();
  for (const h of hands) {
    const map = new Map();
    const key = [h.a, h.b, h.c].map((x) => { const s = x & 3; if (!map.has(s)) map.set(s, map.size); return `${x >> 2}.${map.get(s)}`; }).join('|');
    const g = groups.get(key);
    if (g) g.n++; else groups.set(key, { h, n: 1 });
  }
  assert.ok(groups.size < 2000);
  let total = 0;
  for (const { h, n } of groups.values()) {
    if (!atLeastQ64(h.ev)) { total -= n; continue; }
    let sum = 0, count = 0;
    const ps = h.ev.score;
    for (let j = 0; j < hands.length; j++) {
      const a = A[j], b = B[j], c = C[j];
      if (a === h.a || a === h.b || a === h.c || b === h.a || b === h.b || b === h.c || c === h.a || c === h.b || c === h.c) continue;
      count++;
      if (!dealerQual[j]) sum += 1;
      else if (ps > dealerScore[j]) sum += 2;
      else if (ps < dealerScore[j]) sum -= 2;
    }
    total += n * (sum / count + (ANTE_BONUS[h.ev.cat] ?? 0));
  }
  const edge = -total / hands.length;
  assert.ok(Math.abs(edge - 0.03373) < 0.0001, `house edge ${(edge * 100).toFixed(4)}%`);
});

test('the engine settles a long run of random hands without losing a dollar', () => {
  const r = seededRng(11);
  let wagered = 0, returned = 0;
  for (let i = 0; i < 3000; i++) {
    let s = deal({ ante: 10, pairPlus: 5 }, r);
    s = resolve(s, advise(s.player).play ? 'play' : 'fold');
    const x = s.result;
    assert.equal(x.returned, x.lines.reduce((t, l) => t + l.back, 0));
    assert.equal(x.wagered, x.lines.reduce((t, l) => t + l.stake, 0));
    assert.ok(Number.isSafeInteger(x.returned) && x.returned >= 0);
    // the engine's compare agrees with the evaluator
    if (x.outcome === 'win') assert.ok(compare(evaluate3(s.player), evaluate3(s.dealer)) > 0);
    wagered += x.wagered; returned += x.returned;
  }
  assert.ok(returned / wagered > 0.8 && returned / wagered < 1.1);
});

test('SLOW: a million hands land on the exact returns', { skip: process.env.SLOW !== '1' }, () => {
  const r = seededRng(2024);
  let ante = 0, pp = 0;
  const N = 1_000_000;
  for (let i = 0; i < N; i++) {
    let s = deal({ ante: 1, pairPlus: 1 }, r);
    s = resolve(s, advise(s.player).play ? 'play' : 'fold');
    const ppLine = s.result.lines.find((l) => l.bet === 'Pair Plus');
    pp += ppLine.back - 1;
    ante += s.result.returned - ppLine.back - (s.result.wagered - 1);
  }
  assert.ok(Math.abs(-ante / N - 0.0337) < 0.006, `ante ${(-ante / N * 100).toFixed(2)}%`);
  assert.ok(Math.abs(-pp / N - 0.0232) < 0.008, `pair plus ${(-pp / N * 100).toFixed(2)}%`);
});
