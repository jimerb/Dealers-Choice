// Blackjack engine: totals, the deal and the dealer's peek, insurance, hit / stand / double / split /
// surrender, the dealer's play, every payout, the shoe and the count, the money through a real bank,
// basic strategy, and a house-edge simulation (the long one behind SLOW=1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/js/casino/engines/blackjack.js';
import { advise, insuranceAdvice } from '../public/js/casino/engines/blackjack-strategy.js';
import { seededRng } from '../public/js/casino/kit/rng.js';
import { stack, cards, remaining } from '../public/js/casino/kit/shoe.js';
import { createBank } from '../public/js/core/bank.js';
import { createRound } from '../public/js/casino/kit/round.js';

const rng = seededRng(11);
/** A table whose next cards are `codes` (deal order: you, dealer up, you, hole, then draws). */
function table(codes, opts = {}) {
  const s = E.init({ opts, rng: seededRng(3) });
  stack(s.shoe, codes.trim().split(/\s+/));
  return s;
}
const go = (s, type, extra = {}) => E.step(s, { type, ...extra }, { rng });
const deal = (s, bet = 10) => go(s, 'deal', { bet });
const types = (s, ctx) => E.legal(s, ctx).filter((a) => !a.disabled).map((a) => a.type);
const ranks = (hand) => hand.map((c) => c.rank).join(' ');

// ------------------------------------------------------------------ totals
test('hand totals: aces count 11 until that would bust, and the total says when it is soft', () => {
  const v = (codes) => E.handValue(cards(codes));
  assert.deepEqual(v('AS 6H'), { total: 17, soft: true });
  assert.deepEqual(v('AS 6H KD'), { total: 17, soft: false });
  assert.deepEqual(v('AS AH'), { total: 12, soft: true });
  assert.deepEqual(v('AS AH 9D'), { total: 21, soft: true });
  assert.deepEqual(v('AS AH KD'), { total: 12, soft: false });
  assert.deepEqual(v('KS QH 5D'), { total: 25, soft: false });
  assert.equal(E.describe(cards('AS KH')), 'Blackjack');
  assert.equal(E.describe(cards('AS KH'), { natural: false }), '21');
  assert.equal(E.describe(cards('AS 6H')), 'Soft 17');
  assert.equal(E.describe(cards('AS 6H 4C')), '21');
  assert.equal(E.describe(cards('KS QH 5D')), 'Bust (25)');
  assert.equal(E.isBlackjack(cards('10S AH')), true);
  assert.equal(E.isBlackjack(cards('5S 6H KD')), false);
});

test('Hi-Lo tags: 2-6 count +1, 7-9 zero, tens and aces -1', () => {
  assert.deepEqual(cards('2S 6H 7D 9C 10S KH AD').map(E.hiLo), [1, 1, 0, 0, -1, -1, -1]);
});

// ------------------------------------------------------------------ options
test('presets set the rules; Custom uses the individual options', () => {
  assert.deepEqual(E.rulesFrom({}), { decks: 6, h17: false, double: 'any', das: true, splits: 3, rsa: false, surrender: 'never', insurance: true, penetration: 0.75 });
  const reno = E.rulesFrom({ preset: 'reno', h17: false });
  assert.equal(reno.decks, 2);
  assert.equal(reno.h17, true, 'the preset wins over a stray option');
  assert.equal(reno.double, '10-11');
  assert.equal(reno.das, false);
  assert.equal(E.rulesFrom({ preset: 'ac' }).surrender, 'late');
  assert.equal(E.rulesFrom({ preset: 'downtown' }).h17, true);
  const custom = E.rulesFrom({ preset: 'custom', decks: 1, h17: true, splits: 1, rsa: true, surrender: 'late', pen: 'auto' });
  assert.deepEqual([custom.decks, custom.h17, custom.splits, custom.rsa, custom.surrender, custom.penetration], [1, true, 1, true, 'late', 0.65]);
  assert.equal(E.rulesFrom({ pen: 60 }).penetration, 0.6);
  for (const o of E.OPTIONS) assert.ok(o.type === 'check' || o.options.some(([v]) => v === o.default), `${o.key} default is one of its values`);
});

// ------------------------------------------------------------------ the deal, naturals and the peek
test('a deal takes the bet and deals you, dealer up, you, dealer hole', () => {
  const s = table('9S 5H 7D KC');
  const r = deal(s, 25);
  assert.deepEqual(r.cash, [{ kind: 'stake', amount: 25, why: 'bet' }]);
  assert.equal(ranks(r.state.hands[0].cards), '9 7');
  assert.equal(ranks(r.state.dealer), '5 K');
  assert.equal(r.state.phase, 'play');
  assert.equal(r.state.holeShown, false);
  assert.equal(r.done, undefined);
  assert.deepEqual(types(r.state), ['hit', 'stand', 'double']);
  assert.ok(r.shuffled, 'the first round announces the fresh shoe');
  assert.ok(r.fx.includes('shuffle'));
  assert.throws(() => deal(r.state), /Finish this hand/);
  assert.throws(() => go(s, 'hit'), /can't hit/);
});

test('blackjack pays 3 to 2 at once, rounded down on odd bets', () => {
  let r = deal(table('AS 9H KD 7C'), 10);
  assert.equal(r.state.phase, 'over');
  assert.deepEqual(r.done, { wagered: 10, won: 25 });
  assert.equal(r.state.hands[0].result, 'blackjack');
  assert.equal(r.state.holeShown, true);
  assert.equal(r.state.dealer.length, 2, 'the dealer does not draw');
  r = deal(table('AS 9H KD 7C'), 5);
  assert.deepEqual(r.done, { wagered: 5, won: 12 }, '$5 wins $7 (7.50 rounded down)');
  r = deal(table('KS 9H AD 7C'), 15);
  assert.deepEqual(r.done, { wagered: 15, won: 37 });
});

test('the dealer peeks under a ten: a dealer blackjack ends the round, yours pushes', () => {
  let r = deal(table('KS QH QD AC'), 10);
  assert.equal(r.state.phase, 'over');
  assert.deepEqual(r.done, { wagered: 10, won: 0 });
  assert.equal(r.state.hands[0].result, 'lose');
  assert.equal(r.state.result.dealerBJ, true);
  r = deal(table('AS QH KD AC'), 10);
  assert.deepEqual(r.done, { wagered: 10, won: 10 });
  assert.equal(r.state.hands[0].result, 'push');
  // a ten up without a blackjack: play on, the hole stays hidden
  r = deal(table('KS QH QD 7C'), 10);
  assert.equal(r.state.phase, 'play');
  assert.equal(r.state.peeked, true);
  assert.equal(r.state.holeShown, false);
});

test('no peek under a 2-9: your blackjack is paid straight away', () => {
  const r = deal(table('AS 9H KD AC'), 10);
  assert.equal(r.state.peeked, false);
  assert.deepEqual(r.done, { wagered: 10, won: 25 });
});

// ------------------------------------------------------------------ insurance
test('an ace up offers insurance up to half the bet; it pays 2 to 1 on a dealer blackjack', () => {
  const s = deal(table('9S AH 9D KC'), 10).state;
  assert.equal(s.phase, 'insurance');
  assert.deepEqual(E.legal(s), [{ type: 'insurance', max: 5 }, { type: 'decline' }]);
  assert.deepEqual(E.legal(s, { bank: 3 }), [{ type: 'insurance', max: 3 }, { type: 'decline' }]);
  assert.throws(() => go(s, 'hit'), /can't hit/);
  assert.throws(() => go(s, 'insurance', { amount: 6 }), /up to half/);
  const r = go(s, 'insurance', { amount: 5 });
  assert.deepEqual(r.cash[0], { kind: 'stake', amount: 5, why: 'insurance' });
  assert.equal(r.state.phase, 'over');
  assert.deepEqual(r.done, { wagered: 15, won: 15 }, 'main bet lost, insurance returns 5 + 10');
  assert.equal(r.state.result.insurance, 'win');
  assert.equal(r.state.result.insuranceBack, 15);
});

test('insurance loses when the dealer has no blackjack, and play goes on', () => {
  let s = deal(table('10S AH 9D 7C 2S'), 10).state;
  let r = go(s, 'insurance', { amount: 4 });
  assert.equal(r.state.phase, 'play');
  assert.equal(r.done, undefined);
  r = go(r.state, 'stand'); // 19 v A7 = soft 18
  assert.deepEqual(r.done, { wagered: 14, won: 20 });
  assert.equal(r.state.result.insurance, 'lose');
  // declined: nothing taken
  s = deal(table('10S AH 9D 7C'), 10).state;
  r = go(s, 'decline');
  assert.deepEqual(r.cash, []);
  assert.equal(r.state.phase, 'play');
});

test('insurance with your own blackjack: even money either way', () => {
  let r = go(deal(table('AS AH KD KC'), 10).state, 'insurance', { amount: 5 });
  assert.deepEqual(r.done, { wagered: 15, won: 25 }, 'push on the hand, insurance 15 back');
  r = go(deal(table('AS AH KD 7C'), 10).state, 'insurance', { amount: 5 });
  assert.deepEqual(r.done, { wagered: 15, won: 25 }, 'blackjack 25 back, insurance lost');
  r = go(deal(table('AS AH KD 7C'), 10).state, 'decline');
  assert.deepEqual(r.done, { wagered: 10, won: 25 });
});

test('with insurance off the dealer peeks under an ace at once', () => {
  let r = deal(table('9S AH 9D KC', { insurance: false }), 10);
  assert.equal(r.state.phase, 'over');
  assert.deepEqual(r.done, { wagered: 10, won: 0 });
  r = deal(table('9S AH 9D 5C', { insurance: false }), 10);
  assert.equal(r.state.phase, 'play');
});

// ------------------------------------------------------------------ hit, stand, the dealer
test('hit to a bust loses at once and the dealer does not draw', () => {
  let s = deal(table('10S 6H 6D 10C KS 5D'), 10).state;
  const r = go(s, 'hit');
  assert.equal(r.state.phase, 'over');
  assert.equal(r.state.hands[0].result, 'bust');
  assert.deepEqual(r.done, { wagered: 10, won: 0 });
  assert.equal(r.state.dealer.length, 2);
  assert.equal(r.state.holeShown, true);
});

test('hitting to 21 stands for you', () => {
  const s = deal(table('5S 6H 6D 10C KS 2D'), 10).state;
  const r = go(s, 'hit');
  assert.equal(r.state.phase, 'over', '21 ends the hand; the dealer plays');
  assert.equal(ranks(r.state.dealer), '6 10 2');
  assert.deepEqual(r.done, { wagered: 10, won: 20 });
});

test('the dealer draws to 17 and stands on soft 17, or hits it when the option is on', () => {
  let r = go(deal(table('10S 6H 9D AC 3S 10D')).state, 'stand');
  assert.equal(ranks(r.state.dealer), '6 A', 'soft 17 stands');
  assert.deepEqual(r.done, { wagered: 10, won: 20 });
  r = go(deal(table('10S 6H 9D AC 3S 10D', { preset: 'custom', h17: true })).state, 'stand');
  assert.equal(ranks(r.state.dealer), '6 A 3', 'soft 17 hits, 20 stands');
  assert.deepEqual(r.done, { wagered: 10, won: 0 });
  r = go(deal(table('10S 6H 9D 10C 2S 5D')).state, 'stand');
  assert.equal(ranks(r.state.dealer), '6 10 2', '18 stands');
  assert.deepEqual(r.done, { wagered: 10, won: 20 }, '19 beats 18');
});

test('push on equal totals; a dealer bust pays every hand still standing', () => {
  let r = go(deal(table('10S 10H 8D 8C')).state, 'stand');
  assert.equal(r.state.hands[0].result, 'push');
  assert.deepEqual(r.done, { wagered: 10, won: 10 });
  r = go(deal(table('10S 6H 2D 10C 9S')).state, 'stand');
  assert.equal(r.state.result.dealer, 25);
  assert.equal(r.state.hands[0].result, 'win');
  assert.deepEqual(r.done, { wagered: 10, won: 20 });
  r = go(deal(table('10S 9H 8D 10C')).state, 'stand');
  assert.equal(r.state.hands[0].result, 'lose');
  assert.deepEqual(r.done, { wagered: 10, won: 0 });
});

// ------------------------------------------------------------------ double
test('double: one more bet, exactly one card, paid on the doubled bet', () => {
  const s = deal(table('6S 6H 5D 10C 10S 9H'), 10).state;
  const r = go(s, 'double');
  assert.deepEqual(r.cash, [{ kind: 'stake', amount: 10, why: 'double' }, { kind: 'pay', amount: 40 }]);
  assert.equal(r.state.hands[0].bet, 20);
  assert.equal(ranks(r.state.hands[0].cards), '6 5 10');
  assert.equal(ranks(r.state.dealer), '6 10 9');
  assert.deepEqual(r.done, { wagered: 20, won: 40 });
});

test('double rules: any two, 9-11, 10-11, 11 only, hard only; never after a hit', () => {
  const can = (codes, double) => types(deal(table(codes, { preset: 'custom', double })).state).includes('double');
  assert.equal(can('5S 7H 4D 10C', 'any'), true);
  assert.equal(can('5S 7H 4D 10C', '9-11'), true);
  assert.equal(can('5S 7H 4D 10C', '10-11'), false);
  assert.equal(can('5S 7H 6D 10C', '10-11'), true);
  assert.equal(can('5S 7H 6D 10C', '11'), true);
  assert.equal(can('4S 7H 6D 10C', '11'), false);
  assert.equal(can('AS 7H 6D 10C', 'hard'), false, 'soft 17');
  assert.equal(can('AS 7H 6D 10C', '9-11'), false);
  assert.equal(can('8S 7H 6D 10C', 'hard'), true);
  const s = go(deal(table('2S 7H 3D 10C 2C')).state, 'hit').state;
  assert.deepEqual(types(s), ['hit', 'stand']);
  assert.throws(() => go(s, 'double'), /can't double/);
});

test('double and split are disabled when the bank cannot cover another bet', () => {
  const s = deal(table('8S 7H 8D 10C'), 50).state;
  assert.deepEqual(types(s, { bank: 49 }), ['hit', 'stand']);
  const off = E.legal(s, { bank: 49 }).filter((a) => a.disabled);
  assert.deepEqual(off.map((a) => [a.type, a.why]), [['double', 'Not enough in the bank'], ['split', 'Not enough in the bank']]);
  assert.deepEqual(types(s, { bank: 50 }), ['hit', 'stand', 'double', 'split']);
});

// ------------------------------------------------------------------ split
test('split a pair: two hands, the second gets its card when its turn comes', () => {
  // you 8 8, dealer 7 A (soft 18); hand 1 gets 3 (11), doubles onto 10 -> 21; hand 2 gets K (18), stands
  let r = deal(table('8S 7H 8D AC 3S 10D KH'), 10);
  r = go(r.state, 'split');
  assert.deepEqual(r.cash, [{ kind: 'stake', amount: 10, why: 'split' }]);
  assert.equal(r.state.hands.length, 2);
  assert.equal(ranks(r.state.hands[0].cards), '8 3');
  assert.equal(ranks(r.state.hands[1].cards), '8');
  assert.equal(r.state.active, 0);
  assert.ok(types(r.state).includes('double'), 'double after split is on by default');
  r = go(r.state, 'double');
  assert.equal(r.state.active, 1);
  assert.equal(ranks(r.state.hands[1].cards), '8 K');
  r = go(r.state, 'stand');
  assert.equal(r.state.phase, 'over');
  assert.deepEqual(r.state.hands.map((h) => h.result), ['win', 'push']);
  assert.deepEqual(r.done, { wagered: 30, won: 40 + 10 });
});

test('tens of any kind split as a pair; 21 after a split is not a blackjack', () => {
  let s = deal(table('KS 9H 10D 8C AS 7D')).state;
  assert.ok(types(s).includes('split'), 'K and 10 are a pair');
  let r = go(s, 'split');
  assert.equal(r.state.active, 1, 'K + A makes 21: that hand stands by itself');
  r = go(r.state, 'stand'); // 10 7 = 17 v 17
  assert.deepEqual(r.state.hands.map((h) => h.result), ['win', 'push']);
  assert.deepEqual(r.done, { wagered: 20, won: 20 + 10 }, '21 after a split pays even money');
});

test('no double after split when that option is off', () => {
  const s = go(deal(table('8S 7H 8D 10C 3S', { preset: 'custom', das: false })).state, 'split').state;
  assert.deepEqual(types(s), ['hit', 'stand']);
});

test('split limits: never, once, up to three times (four hands)', () => {
  const pairs = '8S 7H 8D 10C 8H 8C 8S 8D 2C 2D 2H 2S';
  assert.ok(!types(deal(table(pairs, { preset: 'custom', splits: 0 })).state).includes('split'));
  let s = go(deal(table(pairs, { preset: 'custom', splits: 1 })).state, 'split').state;
  assert.equal(ranks(s.hands[0].cards), '8 8');
  assert.ok(!types(s).includes('split'), 'once only');
  s = deal(table(pairs)).state;
  for (let i = 0; i < 3; i++) s = go(s, 'split').state;
  assert.equal(s.hands.length, 4);
  assert.ok(!types(s).includes('split'), 'four hands is the most');
  assert.equal(ranks(s.hands[0].cards), '8 8');
});

test('split aces get one card each and cannot be hit; 21 there pays even money', () => {
  let r = deal(table('AS 7H AD 10C KS 5D'));
  r = go(r.state, 'split');
  assert.equal(r.state.phase, 'over', 'both hands done; the dealer plays');
  assert.deepEqual(r.state.hands.map((h) => ranks(h.cards)), ['A K', 'A 5']);
  assert.deepEqual(r.state.hands.map((h) => h.result), ['win', 'lose'], '21 and soft 16 v 17');
  assert.deepEqual(r.done, { wagered: 20, won: 20 });
});

test('resplit aces only with the option on', () => {
  let s = go(deal(table('AS 7H AD 10C AH 5D', { preset: 'custom', rsa: false })).state, 'split').state;
  assert.equal(s.phase, 'over', 'no resplit: A A is just soft 12');
  s = go(deal(table('AS 7H AD 10C AH 5D 9S 9D', { preset: 'custom', rsa: true })).state, 'split').state;
  assert.equal(s.phase, 'play');
  assert.deepEqual(types(s), ['stand', 'split'], 'split aces: no hit, no double, but split again');
  const r = go(s, 'split');
  assert.deepEqual(r.state.hands.map((h) => ranks(h.cards)), ['A 9', 'A 9', 'A 5']);
  assert.equal(r.state.phase, 'over');
});

// ------------------------------------------------------------------ surrender
test('late surrender: first two cards only, half the bet back (rounded down)', () => {
  assert.ok(!types(deal(table('10S 10H 6D 7C')).state).includes('surrender'), 'off by default');
  const s = deal(table('10S 10H 6D 7C', { preset: 'ac' }), 15).state;
  assert.ok(types(s).includes('surrender'));
  const r = go(s, 'surrender');
  assert.equal(r.state.phase, 'over');
  assert.equal(r.state.hands[0].result, 'surrender');
  assert.deepEqual(r.done, { wagered: 15, won: 7 });
  assert.equal(r.state.dealer.length, 2, 'the dealer does not draw');
  const hit = go(deal(table('2S 10H 3D 7C 4H', { preset: 'ac' })).state, 'hit').state;
  assert.ok(!types(hit).includes('surrender'), 'not after a hit');
  const split = go(deal(table('8S 10H 8D 7C 2H', { preset: 'ac' })).state, 'split').state;
  assert.ok(!types(split).includes('surrender'), 'not after a split');
  // late: the peek comes first, so a dealer blackjack takes the whole bet
  const bj = deal(table('10S AH 6D KC', { preset: 'ac', insurance: false }), 10);
  assert.deepEqual(bj.done, { wagered: 10, won: 0 });
});

// ------------------------------------------------------------------ shoe and count
test('the shoe is reshuffled before the first round after the cut card comes out', () => {
  let s = E.init({ opts: { preset: 'custom', decks: 1, pen: 50 }, rng: seededRng(5) });
  assert.equal(remaining(s.shoe), 51, 'one card burned');
  let r = deal(s);
  assert.ok(r.shuffled);
  let rounds = 0, reshuffled = 0;
  s = r.state;
  for (; rounds < 40; rounds++) {
    while (s.phase !== 'over') s = go(s, s.phase === 'insurance' ? 'decline' : 'stand').state;
    const before = remaining(s.shoe);
    r = deal(s);
    if (r.shuffled) {
      reshuffled++;
      assert.ok(before <= 26, 'only once half the deck has gone');
      assert.ok(remaining(r.state.shoe) >= 47, 'a fresh deck');
      assert.ok(r.fx.includes('shuffle'));
    } else assert.ok(!r.fx.includes('shuffle'));
    s = r.state;
  }
  assert.ok(reshuffled >= 5);
});

test('changing the decks between rounds brings a new shoe; not during a hand', () => {
  let s = E.init({ opts: {}, rng: seededRng(5) });
  s = E.step(s, { type: 'rules', opts: { preset: 'custom', decks: 2 } }, { rng }).state;
  assert.equal(s.shoe.cards.length, 104);
  const played = deal(table('9S 5H 7D KC')).state;
  assert.throws(() => E.step(played, { type: 'rules', opts: {} }, { rng }), /next round/);
  const same = E.step(E.init({ opts: {}, rng }), { type: 'rules', opts: { h17: true, preset: 'custom' } }, { rng }).state;
  assert.equal(same.rules.h17, true);
  assert.equal(same.shoe.cards.length, 312);
});

test('the running count follows the cards you have seen; the hole counts when it turns', () => {
  let s = table('2S 5H 3D KC 10H');
  s = deal(s).state; // 2, 5, 3 seen: +3; the K is still face down
  assert.equal(s.count, 3);
  s = go(s, 'hit').state; // 10: 15 total
  assert.equal(s.count, 2);
  s = go(s, 'stand').state; // hole K turns: +1 ... dealer 15 draws
  assert.equal(s.holeShown, true);
  const seen = [...s.hands[0].cards, ...s.dealer].reduce((t, c) => t + E.hiLo(c), 0);
  assert.equal(s.count, seen);
  assert.equal(E.trueCount({ ...s, count: 6, shoe: { ...s.shoe, pos: s.shoe.cards.length - 104 } }), 3);
});

test('a shoe that runs dry mid-round shuffles the used cards and carries on', () => {
  let s = E.init({ opts: { preset: 'custom', decks: 1, pen: 85 }, rng: seededRng(9) });
  s.shoe.pos = s.shoe.cards.length - 4; // four cards left, and a round that needs more
  s.shoe.cut = s.shoe.cards.length;     // pretend the cut card is still in
  const left = s.shoe.cards.slice(s.shoe.pos).map((c) => c.id);
  let r = deal(s);
  assert.deepEqual([...r.state.hands[0].cards, ...r.state.dealer].map((c) => c.id).sort(), left.sort());
  s = r.state;
  while (s.phase === 'insurance') s = go(s, 'decline').state;
  if (s.phase === 'play') s = go(s, 'hit').state; // needs a fifth card
  while (s.phase !== 'over') s = go(s, s.phase === 'insurance' ? 'decline' : 'stand').state;
  assert.ok(deal(s).shuffled, 'a full shuffle before the next round');
});

// ------------------------------------------------------------------ money through the bank
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

test('a round through a real bank: bet at the deal, double and split as they come, paid at once', () => {
  const bank = createBank({ storage: memStorage(), win: null });
  const round = createRound(bank, 'blackjack');
  // the view takes the main bet with its chips, then applies the rest of each step
  const take = (r) => round.apply({ ...r, cash: r.cash.filter((e) => e.why !== 'bet') });
  assert.ok(round.wager(10));
  let r = deal(table('8S 7H 8D AC 3S 10D KH'), 10);
  assert.ok(take(r).ok);
  r = go(r.state, 'split'); assert.ok(take(r).ok);
  assert.equal(bank.balance, 4980);
  r = go(r.state, 'double'); assert.ok(take(r).ok);
  assert.equal(bank.balance, 4970);
  r = go(r.state, 'stand');
  const out = take(r);
  assert.deepEqual(out.settled, { wagered: 30, returned: 50, net: 20 });
  assert.equal(bank.balance, 5020);
  assert.equal(round.onTable, 0);
  assert.deepEqual(bank.get().stats.blackjack, { hands: 1, wagered: 30, won: 50, net: 20, biggest: 20 });
});

test('a double the bank cannot cover changes nothing', () => {
  const bank = createBank({ storage: memStorage(), win: null });
  const round = createRound(bank, 'blackjack');
  assert.ok(round.wager(5000));
  const r = go(deal(table('6S 6H 5D 10C 10S 9H'), 5000).state, 'double');
  assert.equal(round.apply(r).ok, false);
  assert.equal(bank.balance, 0);
});

// ------------------------------------------------------------------ basic strategy
test('basic strategy: the well-known plays', () => {
  const rules = E.rulesFrom({});
  const all = { double: true, split: true, surrender: false };
  const play = (hand, up, o = {}) => advise({ cards: cards(hand), up: cards(up)[0], rules: { ...rules, ...o.rules }, can: { ...all, ...o.can } }).action;
  assert.equal(play('10S 6H', '10D'), 'hit');
  assert.equal(play('10S 6H', '10D', { can: { surrender: true }, rules: { surrender: 'late' } }), 'surrender');
  assert.equal(play('10S 6H', '6D'), 'stand');
  assert.equal(play('10S 2H', '2D'), 'hit');
  assert.equal(play('10S 2H', '4D'), 'stand');
  assert.equal(play('6S 5H', '6D'), 'double');
  assert.equal(play('6S 5H', 'AD'), 'hit', 'S17 shoe: hit 11 v A');
  assert.equal(play('6S 5H', 'AD', { rules: { h17: true } }), 'double');
  assert.equal(play('6S 5H', '6D', { can: { double: false } }), 'hit');
  assert.equal(play('AS 7H', '9D'), 'hit');
  assert.equal(play('AS 7H', '3D'), 'double');
  assert.equal(play('AS 7H', '3D', { can: { double: false } }), 'stand');
  assert.equal(play('AS 7H', '8D'), 'stand');
  assert.equal(play('8S 8H', '10D'), 'split');
  assert.equal(play('AS AH', '10D'), 'split');
  assert.equal(play('AS AH', '10D', { can: { split: false } }), 'hit');
  assert.equal(play('10S KH', '6D'), 'stand');
  assert.equal(play('9S 9H', '7D'), 'stand');
  assert.equal(play('9S 9H', '8D'), 'split');
  assert.equal(play('5S 5H', '6D'), 'double');
  assert.equal(play('4S 4H', '5D'), 'split');
  assert.equal(play('4S 4H', '5D', { rules: { das: false } }), 'hit');
  assert.equal(play('10S 7H', 'AD'), 'stand');
  assert.match(advise({ cards: cards('6S 5H'), up: cards('6D')[0], rules, can: all }).why, /11/);
  assert.equal(insuranceAdvice(null).take, false);
  assert.equal(insuranceAdvice(3.4).take, true);
});

// ------------------------------------------------------------------ simulation
function simulate(hands, seed, opts = {}) {
  const r0 = seededRng(seed);
  let s = E.init({ opts, rng: r0 });
  let wagered = 0, won = 0, initial = 0, cashIn = 0, cashOut = 0;
  for (let i = 0; i < hands; i++) {
    let r = E.step(s, { type: 'deal', bet: 10 }, { rng: r0 });
    initial += 10;
    for (;;) {
      for (const e of r.cash) if (e.kind === 'stake') cashIn += e.amount; else if (e.kind === 'pay') cashOut += e.amount;
      s = r.state;
      if (r.done) break;
      let a;
      if (s.phase === 'insurance') a = 'decline';
      else {
        const h = s.hands[s.active];
        a = advise({ cards: h.cards, up: s.dealer[0], rules: s.rules, can: { double: E.can(s, 'double'), split: E.can(s, 'split'), surrender: E.can(s, 'surrender') } }).action;
      }
      r = E.step(s, { type: a }, { rng: r0 });
    }
    wagered += r.done.wagered;
    won += r.done.won;
  }
  return { wagered, won, initial, cashIn, cashOut, edge: (wagered - won) / initial };
}

test('50,000 hands of basic strategy: nothing throws and the money adds up', () => {
  const r = simulate(50_000, 21);
  assert.equal(r.cashIn, r.wagered, 'every stake is counted once');
  assert.equal(r.cashOut, r.won, 'every payout is counted once');
  assert.ok(r.edge > -0.02 && r.edge < 0.025, `edge ${(r.edge * 100).toFixed(2)}% is in a sane range`);
  const ac = simulate(10_000, 4, { preset: 'ac' });
  assert.equal(ac.cashIn, ac.wagered);
});

test('house edge with basic strategy at the default rules is about 0.4% (SLOW=1)', { skip: process.env.SLOW !== '1' }, () => {
  const r = simulate(2_000_000, 1234);
  const pct = r.edge * 100;
  console.log(`# house edge ${pct.toFixed(3)}% over 2,000,000 hands`);
  assert.ok(pct > 0.25 && pct < 0.55, `house edge ${pct.toFixed(3)}%`);
});
