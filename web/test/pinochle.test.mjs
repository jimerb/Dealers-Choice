import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../public/js/games/pinochle/engine.js';
import * as AI from '../public/js/games/pinochle/ai.js';

const c = (rank, suit, copy = 0) => ({ id: `${rank}${suit}${copy}`, rank, suit });

test('deck has 48 cards, two of each', () => {
  const d = P.newDeck();
  assert.equal(d.length, 48);
  assert.equal(new Set(d.map((x) => x.id)).size, 48);
  assert.equal(d.filter((x) => x.rank === 'A' && x.suit === 'S').length, 2);
});

test('meld: run, extra royal marriage, pinochle, dix, aces around', () => {
  const hand = [c('A', 'H'), c('10', 'H'), c('K', 'H'), c('Q', 'H'), c('J', 'H'), c('K', 'H', 1), c('Q', 'H', 1),
    c('9', 'H'), c('J', 'D'), c('Q', 'S'), c('A', 'S'), c('A', 'C'), c('A', 'D')];
  const m = P.computeMeld(hand, 'H');
  const names = Object.fromEntries(m.items.map((i) => [i.name, i.points]));
  assert.equal(names['Run in Hearts'], 150);
  assert.equal(names['Royal marriage'], 40);
  assert.equal(names['Pinochle'], 40);
  assert.equal(names['Dix (9 of trump)'], 10);
  assert.equal(names['Aces around'], 100);
  assert.equal(m.points, 340);
});

test('meld: double pinochle is 300, plain marriages 20', () => {
  const hand = [c('J', 'D'), c('J', 'D', 1), c('Q', 'S'), c('Q', 'S', 1), c('K', 'C'), c('Q', 'C')];
  const m = P.computeMeld(hand, 'H');
  assert.equal(m.points, 300 + 20);
});

test('must follow suit and head the trick', () => {
  const trick = [{ seat: 1, card: c('K', 'S') }];
  const hand = [c('9', 'S'), c('A', 'S'), c('A', 'H')];
  assert.deepEqual(P.legalPlays(hand, trick, 'H').map((x) => x.id), ['AS0']);
});

test('void: must trump, and overtrump if possible', () => {
  const trick = [{ seat: 1, card: c('K', 'S') }, { seat: 2, card: c('Q', 'H') }];
  const hand = [c('9', 'H'), c('A', 'H'), c('A', 'C')];
  assert.deepEqual(P.legalPlays(hand, trick, 'H').map((x) => x.id), ['AH0']);
});

test('once trumped, followers may play any card of the led suit', () => {
  const trick = [{ seat: 1, card: c('K', 'S') }, { seat: 2, card: c('9', 'H') }];
  const hand = [c('9', 'S'), c('A', 'S')];
  assert.equal(P.legalPlays(hand, trick, 'H').length, 2);
});

test('equal cards: first played wins', () => {
  const trick = [{ seat: 0, card: c('A', 'S') }, { seat: 1, card: c('A', 'S', 1) }];
  assert.equal(P.trickWinnerIndex(trick, 'H'), 0);
});

test('all pass: bid dumped on the last player at 100', () => {
  let s = P.newGame({ seed: 1 });
  s = P.applyBid(s, s.turn, 'pass');
  s = P.applyBid(s, s.turn, 'pass');
  s = P.applyBid(s, s.turn, 'pass');
  assert.equal(s.phase, 'trump');
  assert.equal(s.highBid, 100);
  assert.equal(s.dumped, true);
});

function autoPlayHand(s, rng) {
  while (s.phase === 'bidding') s = P.applyBid(s, s.turn, AI.chooseBid(s, s.turn, rng));
  s = P.chooseTrump(s, s.highBidder, AI.chooseTrumpSuit(s, s.highBidder));
  s = P.startPlay(s);
  while (s.phase === 'play' || s.phase === 'trickDone') {
    if (s.phase === 'trickDone') { s = P.collectTrick(s); continue; }
    const id = AI.choosePlay(s, s.turn);
    s = P.playCard(s, s.turn, id); // throws on illegal plays
  }
  return s;
}

test('AI-only games run to completion with legal play and 250 counters per hand', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rng = P.makeRng(seed);
    let s = P.newGame({ seed });
    for (let guard = 0; guard < 200 && s.phase !== 'gameOver'; guard++) {
      s = autoPlayHand(s, rng);
      const r = s.result;
      assert.equal(r.per[0].counters + r.per[1].counters, 250, `seed ${seed} counters`);
      assert.equal(s.tricksWon.reduce((a, b) => a + b, 0), 12);
      if (s.phase === 'handOver') s = P.nextHand(s);
    }
    assert.equal(s.phase, 'gameOver', `seed ${seed} finished`);
    assert.ok(s.scores[s.winner] >= P.TARGET);
  }
});
