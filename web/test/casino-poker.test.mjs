// Poker hand ranks: every five-card hand, every three-card hand, wild cards (deuces, joker, the
// Pai Gow bug) against brute force, best five of seven, names. SLOW=1 adds the exhaustive runs
// through the object API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HAND, HAND3, evaluate, evaluate3, evaluate2, best5, compare, describe, describe3, score5, combinations, rankValue, suitIndex } from '../public/js/casino/kit/poker.js';
import { deck } from '../public/js/core/cards.js';
import { cards } from '../public/js/casino/kit/shoe.js';
import { seededRng, shuffle } from '../public/js/casino/kit/rng.js';

const SLOW = process.env.SLOW === '1';
const B5 = 15 ** 5;
const D = deck();
const ev = (codes, opts) => evaluate(cards(codes), opts);

test('all 2,598,960 five-card hands fall into the known categories', () => {
  const counts = new Array(11).fill(0);
  const r = [0, 0, 0, 0, 0], s = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) for (let d = c + 1; d < 52; d++) for (let e = d + 1; e < 52; e++) {
    const ids = [a, b, c, d, e];
    for (let i = 0; i < 5; i++) { r[i] = (ids[i] % 13) + 2; s[i] = (ids[i] / 13) | 0; }
    counts[Math.floor(score5(r, s) / B5)]++;
  }
  assert.deepEqual(counts, [1_302_540, 1_098_240, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 36, 4, 0]);
});

test('the object API agrees with the fast path (sampled; every hand with SLOW=1)', () => {
  const check = (five) => assert.equal(evaluate(five).score, score5(five.map(rankValue), five.map(suitIndex)));
  if (SLOW) {
    const counts = new Array(11).fill(0);
    for (const five of combinations(D, 5)) counts[evaluate(five).cat]++;
    assert.deepEqual(counts, [1_302_540, 1_098_240, 123_552, 54_912, 10_200, 5_108, 3_744, 624, 36, 4, 0]);
  }
  const rng = seededRng(11);
  for (let i = 0; i < 20_000; i++) check(shuffle(D, rng).slice(0, 5));
});

test('all 22,100 three-card hands: a straight beats a flush', () => {
  const counts = new Array(6).fill(0);
  for (const three of combinations(D, 3)) counts[evaluate3(three).cat]++;
  assert.deepEqual(counts, [16_440, 3_744, 1_096, 720, 52, 48]);
  assert.ok(evaluate3(cards('2S 3H 4D')).score > evaluate3(cards('2S 9S KS')).score);
  assert.ok(evaluate3(cards('AS 2H 3D')).score < evaluate3(cards('2S 3H 4D')).score, 'A-2-3 is the lowest straight');
  assert.ok(evaluate3(cards('AS KH QD')).score > evaluate3(cards('KS QH JD')).score, 'A-K-Q the highest');
  assert.equal(describe3(evaluate3(cards('QS QH 4D'))), 'Pair of queens');
  assert.equal(evaluate3(cards('QS QH 4D')).cat, HAND3.PAIR);
});

test('ties and kickers order correctly', () => {
  assert.equal(compare(ev('AS AH KD 7C 2S'), ev('AD AC KS 7H 2D')), 0);
  assert.equal(compare(ev('AS AH KD 7C 3S'), ev('AD AC KS 7H 2D')), 1);
  assert.equal(compare(ev('5S 4H 3D 2C AS'), ev('6S 5H 4D 3C 2S')), -1, 'the wheel is the lowest straight');
  assert.equal(compare(ev('KS KH 2D 2C 3S'), ev('QS QH JD JC AS')), 1);
  assert.equal(compare(ev('3S 3H 3D 2C 2S'), ev('2D 2H 2C AC AS')), 1, 'full house goes by the trips');
  assert.equal(ev('AS KS QS JS 10S').cat, HAND.ROYAL);
  assert.equal(ev('9S KS QS JS 10S').cat, HAND.STRAIGHT_FLUSH);
});

test('names', () => {
  assert.equal(describe(ev('JS JH 4D 7C 2S')), 'Pair of jacks');
  assert.equal(describe(ev('KS KH 5D 5C 2S')), 'Two pair, kings and fives');
  assert.equal(describe(ev('KS KH KD 5C 5S')), 'Kings full of fives');
  assert.equal(describe(ev('5S 6H 7D 8C 9S')), 'Straight, nine high');
  assert.equal(describe(ev('AS 3S 7S 9S QS')), 'Flush, ace high');
  assert.equal(describe(ev('AS KD 7S 9H 2S')), 'Ace high');
  assert.equal(ev('AS KS QS JS 10S').name, 'Royal flush');
});

// ---- wild cards against brute force: each wild becomes every card not already in the hand
const ALL = deck();
function brute(hand, wild, allowed = null) {
  const isW = (c) => (wild === 'deuces' ? c.rank === '2' : c.rank === 'JK');
  const nat = hand.filter((c) => !isW(c));
  const w = hand.length - nat.length;
  let best = -1;
  const go = (fill, start) => {
    if (fill.length === w) {
      const five = [...nat, ...fill];
      const sc = score5(five.map(rankValue), five.map(suitIndex));
      const cat = Math.floor(sc / B5);
      if (!allowed || allowed.includes(cat)) best = Math.max(best, sc);
      return;
    }
    for (let i = start; i < ALL.length; i++) {
      const c = ALL[i];
      if (nat.some((x) => x.rank === c.rank && x.suit === c.suit)) continue;
      go([...fill, c], i + 1);
    }
  };
  go([], 0);
  // five of a kind needs a duplicate card: count it directly
  const cnt = {};
  for (const c of nat) cnt[rankValue(c)] = (cnt[rankValue(c)] ?? 0) + 1;
  const vals = Object.keys(cnt).map(Number);
  if (vals.length <= 1 && (!allowed || allowed.includes(HAND.FIVE))) best = Math.max(best, HAND.FIVE * B5 + (vals[0] ?? 14) * 15 ** 4);
  return best;
}

test('deuces wild: the paying categories over all 2,598,960 deals (SLOW=1) or brute force on samples', () => {
  const rng = seededRng(21);
  let n = 0;
  for (let i = 0; i < 4000 && n < 1500; i++) {
    const five = shuffle(D, rng).slice(0, 5);
    const w = five.filter((c) => c.rank === '2').length;
    if (w === 0 || w > 2) continue;
    n++;
    assert.equal(evaluate(five, { wild: 'deuces' }).score, brute(five, 'deuces'), five.map((c) => c.id).join(' '));
  }
  assert.equal(evaluate(cards('2S 2H 2D 2C 9S'), { wild: 'deuces' }).wilds, 4);
  assert.equal(ev('2S 2H 7D 7C 7S', { wild: 'deuces' }).cat, HAND.FIVE);
  assert.equal(ev('2S KS QS JS 10S', { wild: 'deuces' }).cat, HAND.ROYAL);
  assert.equal(ev('2S KS QS JS 10S', { wild: 'deuces' }).wilds, 1, 'a wild royal');
  assert.equal(ev('2S 2H 5D 8C KS', { wild: 'deuces' }).cat, HAND.TRIPS);
  if (SLOW) {
    const counts = new Array(11).fill(0);
    for (const five of combinations(D, 5)) counts[evaluate(five, { wild: 'deuces' }).cat]++;
    // royal = 4 natural + 480 wild; five of a kind includes the 48 four-deuce hands
    assert.deepEqual(counts.slice(2), [95_040, 355_080, 62_232, 14_472, 12_672, 31_552, 2_068, 484, 672]);
  }
});

const JK = { id: 'JK.0', rank: 'JK', suit: 'X' };
test('a fully wild joker matches brute force', () => {
  const rng = seededRng(31);
  for (let i = 0; i < 600; i++) {
    const five = [...shuffle(D, rng).slice(0, 4), JK];
    assert.equal(evaluate(five, { wild: 'joker' }).score, brute(five, 'joker'), five.map((c) => c.id).join(' '));
  }
  assert.equal(evaluate([...cards('AS AH AD AC'), JK], { wild: 'joker' }).cat, HAND.FIVE);
});

test('the Pai Gow bug: an ace, or the card a straight or flush needs', () => {
  const asAce = (five) => { const f = five.map((c) => (c.rank === 'JK' ? { rank: 'A', suit: 'X' } : c)); return score5(f.map(rankValue), f.map(suitIndex)); };
  const rng = seededRng(41);
  for (let i = 0; i < 600; i++) {
    const five = [...shuffle(D, rng).slice(0, 4), JK];
    const want = Math.max(asAce(five), brute(five, 'bug', [HAND.STRAIGHT, HAND.FLUSH, HAND.STRAIGHT_FLUSH, HAND.ROYAL]));
    assert.equal(evaluate(five, { wild: 'bug' }).score, want, five.map((c) => c.id).join(' '));
  }
  const bug = (codes) => evaluate([...cards(codes), JK], { wild: 'bug' });
  assert.equal(bug('KS KH 5D 9C').cat, HAND.PAIR, 'not a third king: the bug is an ace');
  assert.equal(bug('AS KH 5D 9C').cat, HAND.PAIR, 'pair of aces');
  assert.equal(bug('AS AH AD AC').cat, HAND.FIVE, 'five aces');
  assert.equal(bug('6S 7H 8D 9C').cat, HAND.STRAIGHT);
  assert.equal(bug('2S 7S 9S QS').cat, HAND.FLUSH);
  assert.deepEqual(bug('2S 7S 9S QS').tiebreak, [14, 12, 9, 7, 2], 'the bug is the flush\'s ace');
  assert.equal(bug('KS QS JS 10S').cat, HAND.ROYAL);
});

test('best five of seven, and two-card hands', () => {
  const b = best5(cards('AS KS 2H 2D QS JS 10S'));
  assert.equal(b.cat, HAND.ROYAL);
  assert.equal(b.cards.length, 5);
  assert.equal(best5(cards('2S 2H 2D 9C 9S 9H 4D')).name, 'Full house');
  assert.equal(describe(best5(cards('2S 2H 2D 9C 9S 9H 4D'))), 'Nines full of twos');
  assert.equal(best5([...cards('AS AH AD AC 3D 4H'), JK], { wild: 'bug' }).cat, HAND.FIVE);
  assert.equal(combinations([1, 2, 3, 4, 5, 6, 7], 5).length, 21);
  assert.equal(compare(evaluate2(cards('5S 5H')), evaluate2(cards('AS KH'))), 1);
  assert.equal(compare(evaluate2([JK, cards('KS')[0]]), evaluate2(cards('AS KH'))), 0, 'a joker in the low hand is an ace');
});
