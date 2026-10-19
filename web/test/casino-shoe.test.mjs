// The dealing shoe: decks, jokers, cut card, burns, stacking for tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newShoe, draw, drawN, burn, needsShuffle, reshuffle, remaining, dealt, discards, stack, card, cards, shoeCards } from '../public/js/casino/kit/shoe.js';
import { seededRng } from '../public/js/casino/kit/rng.js';

test('a six-deck shoe holds 312 unique cards, 6 of each face', () => {
  const s = newShoe({ decks: 6 }, seededRng(1));
  assert.equal(remaining(s), 312);
  assert.equal(new Set(s.cards.map((c) => c.id)).size, 312);
  assert.equal(s.cards.filter((c) => c.rank === 'Q' && c.suit === 'H').length, 6);
  assert.match(s.cards[0].id, /^(10|[2-9AJQK])[SHCD]\.[0-5]$/);
});

test('Pai Gow: one deck and a joker is 53 cards', () => {
  const s = newShoe({ decks: 1, jokers: 1, penetration: 1 }, seededRng(2));
  assert.equal(remaining(s), 53);
  assert.equal(s.cards.filter((c) => c.rank === 'JK').length, 1);
  assert.deepEqual(shoeCards(1, 1).at(-1), { id: 'JK.0', rank: 'JK', suit: 'X' });
  assert.equal(shoeCards(1).length, 52);
  assert.equal(shoeCards(1)[0].id, 'AS', 'single-deck ids are plain codes');
});

test('the cut card: needsShuffle once the penetration is dealt; reshuffle starts again', () => {
  const s = newShoe({ decks: 2, penetration: 0.5 }, seededRng(3));
  assert.equal(s.cut, 52);
  drawN(s, 51);
  assert.equal(needsShuffle(s), false);
  draw(s);
  assert.equal(needsShuffle(s), true);
  assert.equal(dealt(s), 52);
  assert.equal(discards(s).length, 52);
  reshuffle(s, seededRng(4));
  assert.equal(remaining(s), 104);
  assert.equal(needsShuffle(s), false);
});

test('cut variance keeps the cut card near the penetration', () => {
  const r = seededRng(5);
  for (let i = 0; i < 50; i++) {
    const s = newShoe({ decks: 6, penetration: 0.75, cutVariance: 0.05 }, r);
    assert.ok(s.cut >= 234 - 16 && s.cut <= 234 + 16, `${s.cut}`);
  }
});

test('burn, empty shoe, and the same seed deals the same cards', () => {
  const a = newShoe({ decks: 1 }, seededRng(6)), b = newShoe({ decks: 1 }, seededRng(6));
  assert.deepEqual(drawN(a, 5), drawN(b, 5));
  assert.equal(burn(a, 2).length, 2);
  drawN(a, remaining(a));
  assert.throws(() => draw(a), /empty/);
});

test('stack puts chosen cards on top for tests', () => {
  const s = newShoe({ decks: 6 }, seededRng(7));
  draw(s);
  stack(s, ['AS', '10H', 'KD']);
  const [x, y, z] = drawN(s, 3);
  assert.deepEqual([x.rank + x.suit, y.rank + y.suit, z.rank + z.suit], ['AS', '10H', 'KD']);
  assert.equal(remaining(s), 308);
  const j = newShoe({ jokers: 1 }, seededRng(8));
  stack(j, ['JK']);
  assert.equal(draw(j).rank, 'JK');
  assert.throws(() => stack(newShoe({}, seededRng(1)), ['JK']), /no JK/);
});

test('card codes', () => {
  assert.deepEqual(card('10H'), { id: '10H', rank: '10', suit: 'H' });
  assert.equal(cards('AS KS QS').length, 3);
  assert.throws(() => card('1S'));
});
