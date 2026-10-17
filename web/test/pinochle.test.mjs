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

// ---------------------------------------------------------------- variants

const ids = (cards) => cards.map((x) => x.id);

test('every variant is listed with its table size and target', () => {
  assert.deepEqual(P.VARIANT_IDS, ['auction', 'two-handed', 'double-pack', 'partnership', 'cutthroat']);
  assert.equal(P.VARIANTS['two-handed'].players, 2);
  assert.equal(P.VARIANTS['double-pack'].target, 3550);
  assert.equal(P.variantOf({}).id, 'auction'); // saves from before variants
});

test('double-pack deck: 80 cards, four each of A 10 K Q J, no nines', () => {
  const d = P.newDeck('double-pack');
  assert.equal(d.length, 80);
  assert.equal(new Set(ids(d)).size, 80);
  assert.equal(d.filter((x) => x.rank === '9').length, 0);
  for (const r of ['A', '10', 'K', 'Q', 'J']) assert.equal(d.filter((x) => x.rank === r && x.suit === 'H').length, 4);
  assert.equal(P.newDeck('cutthroat').length, 48);
});

test('deal sizes, sides and first phase for each variant', () => {
  const expect = { auction: [4, 12, 2, 'bidding'], 'double-pack': [4, 20, 2, 'bidding'], partnership: [4, 12, 2, null], cutthroat: [4, 12, 4, null], 'two-handed': [2, 12, 2, 'play'] };
  for (const [v, [players, size, sides, phase]] of Object.entries(expect)) {
    for (let seed = 1; seed <= 10; seed++) {
      const s = P.newGame({ seed, variant: v });
      assert.equal(s.hands.length, players, v);
      assert.ok(s.hands.every((h) => h.length === size), `${v} hand size`);
      assert.equal(s.scores.length, sides, `${v} sides`);
      assert.equal(s.names.length, players);
      if (phase) assert.equal(s.phase, phase, v);
      else assert.ok(['dix', 'meld'].includes(s.phase), `${v} starts with the dix or meld`);
    }
  }
});

test('double-pack bidding opens at 500 and a dumped bid is 500', () => {
  let s = P.newGame({ seed: 3, variant: 'double-pack' });
  assert.equal(P.minNextBid(s), 500);
  assert.throws(() => P.applyBid(s, s.turn, 490));
  for (let i = 0; i < 3; i++) s = P.applyBid(s, s.turn, 'pass');
  assert.equal(s.phase, 'trump');
  assert.equal(s.highBid, 500);
});

test('double-pack meld: doubles score ten times, pinochles climb 40/300/600/900', () => {
  const aces = [0, 1].flatMap((k) => P.SUITS.map((x) => c('A', x, k)));
  assert.equal(P.computeMeld(aces, 'H', 'double-pack').points, 1000);
  assert.equal(P.computeMeld(aces, 'H').points, 200); // single deck: each set counts once
  const pins = [0, 1, 2].flatMap((k) => [c('J', 'D', k), c('Q', 'S', k)]);
  assert.deepEqual(P.computeMeld(pins, 'H', 'double-pack').items, [{ name: 'Triple pinochle', points: 600 }]);
  const run2 = [0, 1].flatMap((k) => ['A', '10', 'K', 'Q', 'J'].map((r) => c(r, 'S', k)));
  assert.equal(P.computeMeld(run2, 'S', 'double-pack').points, 1500);
});

test('no-bid deal: the dealer turns up trump; the dix can be traded for it once', () => {
  for (const v of ['partnership', 'cutthroat']) {
    let traded = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = P.newGame({ seed, variant: v });
      assert.equal(s.trump, s.turnUp.suit);
      assert.equal(s.bids, null);
      if (s.turnUp.rank === '9') {
        assert.equal(s.phase, 'meld');
        assert.ok(s.melds[s.dealer].items.some((i) => i.name.startsWith('Dix')), 'turned dix counts for the dealer');
        continue;
      }
      assert.ok(s.hands[s.dealer].some((x) => x.id === s.turnUp.id), 'turned card belongs to the dealer');
      if (s.phase !== 'dix') continue;
      traded++;
      const seat = s.turn;
      assert.notEqual(seat, s.dealer);
      const nine = s.hands[seat].find((x) => x.rank === '9' && x.suit === s.trump);
      const t = P.tradeDix(s, seat, true);
      assert.equal(t.phase, 'meld');
      assert.ok(t.hands[seat].some((x) => x.id === s.turnUp.id));
      assert.ok(t.hands[s.dealer].some((x) => x.id === nine.id));
      assert.ok(t.hands.every((h) => h.length === 12));
      assert.ok(t.melds[seat].items.some((i) => i.name === 'Dix exchange' && i.points === 10));
      // the traded nine doesn't score a second time for the dealer
      const dealerDix = t.hands[s.dealer].filter((x) => x.rank === '9' && x.suit === s.trump).length;
      const counted = t.melds[s.dealer].items.find((i) => i.name.startsWith('Dix'));
      assert.equal(counted ? counted.points : 0, (dealerDix - 1) * 10);
      // first lead is from the dealer's left
      assert.equal(P.startPlay(t).turn, (s.dealer + 1) % 4);
    }
    assert.ok(traded > 0, `${v}: some deals offer the dix`);
  }
});

test('declining the dix passes the offer on, then meld', () => {
  for (let seed = 1; seed <= 60; seed++) {
    let s = P.newGame({ seed, variant: 'partnership' });
    if (s.phase !== 'dix') continue;
    while (s.phase === 'dix') s = P.tradeDix(s, s.turn, false);
    assert.equal(s.phase, 'meld');
    assert.equal(s.dixTrade, null);
    return;
  }
  assert.fail('no dix deal found');
});

test('two-handed deal: 12 each, a turned trump card and a 23-card stock; non-dealer leads', () => {
  const s = P.newGame({ seed: 9, variant: 'two-handed' });
  assert.equal(s.stock.length, 23);
  assert.equal(s.trump, s.turnUp.suit);
  assert.equal(new Set(ids([...s.hands[0], ...s.hands[1], ...s.stock, s.turnUp])).size, 48);
  assert.equal(s.turn, (s.dealer + 1) % 2);
  assert.ok(P.drawing(s));
});

test('two-handed play: anything goes while drawing; afterwards follow, overtrump a trump lead, else trump', () => {
  const hand = [c('9', 'S'), c('A', 'H'), c('J', 'C')];
  let s = { ...P.newGame({ seed: 2, variant: 'two-handed' }), trump: 'H', hands: [hand, []], trick: [{ seat: 1, card: c('K', 'S') }] };
  assert.equal(P.legalFor(s, 0).length, 3); // drawing: no need to follow
  s = { ...s, turnUp: null, stock: [] };
  assert.deepEqual(ids(P.legalFor(s, 0)), ['9S0']); // must follow, even with a losing card
  assert.deepEqual(ids(P.lastTricksLegal([c('9', 'H'), c('A', 'H'), c('A', 'S')], [{ seat: 1, card: c('K', 'H') }], 'H')), ['AH0']);
  assert.deepEqual(ids(P.lastTricksLegal([c('9', 'H'), c('A', 'C')], [{ seat: 1, card: c('K', 'S') }], 'H')), ['9H0']);
  assert.equal(P.lastTricksLegal([c('A', 'C'), c('9', 'D')], [{ seat: 1, card: c('K', 'S') }], 'H').length, 2);
});

/** A two-handed state where seat 0 has just won a trick and holds `hand`. */
function declaring(hand, extra = {}) {
  const s = P.newGame({ seed: 4, variant: 'two-handed' });
  return { ...s, trump: 'H', phase: 'declare', turn: 0, declared: { meld: false, dix: false }, hands: [hand, s.hands[1]],
    table: [[], []], used: [{}, {}], shown: [[], []], declaredMelds: [[], []], dixTraded: false, turnUp: c('Q', 'H', 1), ...extra };
}
const again = (s) => ({ ...s, declared: { meld: false, dix: false } }); // the next trick won
const keys = (s) => P.meldOptions(s, 0).map((o) => o.key);

test('two-handed meld: one meld per trick, cards stay on the table, a run on a royal marriage adds 110', () => {
  let s = declaring([c('A', 'H'), c('10', 'H'), c('K', 'H'), c('Q', 'H'), c('J', 'H'), c('9', 'C')]);
  assert.deepEqual(keys(s).slice(0, 2), ['run', 'royal']);
  s = P.declareMeld(s, 0, 'royal');
  assert.deepEqual(keys(s), []); // one meld per won trick
  assert.deepEqual(s.table[0].slice().sort(), ['KH0', 'QH0']);
  s = again(s);
  assert.equal(P.meldOptions(s, 0).find((o) => o.key === 'run').points, 110);
  s = P.declareMeld(s, 0, 'run');
  assert.equal(P.declaredPoints(s, 0), 150);
  s = again(s);
  assert.ok(!keys(s).includes('royal') && !keys(s).includes('run'), 'the same cards cannot score again in their class');
});

test('two-handed meld: double pinochle on a pinochle adds 260; a meld needs a card from the hand', () => {
  let s = declaring([c('J', 'D'), c('Q', 'S'), c('J', 'D', 1), c('Q', 'S', 1), c('K', 'S')]);
  s = P.declareMeld(s, 0, 'pinochle');
  s = again(s);
  assert.equal(P.meldOptions(s, 0).find((o) => o.key === 'double-pinochle').points, 260);
  s = P.declareMeld(s, 0, 'double-pinochle');
  assert.equal(P.declaredPoints(s, 0), 300);
  // a Q♠ on the table from a pinochle (another class) can join the K♠ from the hand in a marriage
  s = again(s);
  assert.ok(keys(s).includes('marriage-S'));
  // but two table cards alone make no meld
  const t = declaring([c('K', 'S'), c('Q', 'S')], { table: [['KS0', 'QS0'], []], used: [{ KS0: [2], QS0: [2] }, {}] });
  assert.ok(!keys(t).includes('marriage-S'));
});

test('two-handed dix: trade it for the turned card (10) or meld it (10)', () => {
  let s = declaring([c('9', 'H'), c('9', 'H', 1), c('A', 'S')]);
  assert.ok(keys(s).includes('dix-trade') && keys(s).includes('dix'));
  s = P.declareMeld(s, 0, 'dix-trade');
  assert.ok(s.hands[0].some((x) => x.id === 'QH1'));
  assert.equal(s.turnUp.id, '9H0');
  assert.equal(s.dixTraded, true);
  s = again(s);
  assert.deepEqual(keys(s), ['dix']); // the other nine can still be melded, not traded
  s = P.declareMeld(s, 0, 'dix');
  assert.equal(P.declaredPoints(s, 0), 20);
});

test('two-handed drawing: both refill to 12; the last draw gives the loser the turned card and ends melding', () => {
  let s = P.newGame({ seed: 11, variant: 'two-handed' });
  s = P.playCard(s, s.turn, s.hands[s.turn][0].id);
  s = P.playCard(s, s.turn, s.hands[s.turn][0].id);
  s = P.collectTrick(s);
  assert.equal(s.phase, 'declare');
  const w = s.turn;
  s = P.endDeclare(s, w);
  assert.ok(s.hands.every((h) => h.length === 12));
  assert.equal(s.stock.length, 21);
  assert.equal(s.turn, w);
  const turned = s.turnUp;
  const last = { ...s, phase: 'declare', turn: w, declared: { meld: false, dix: false }, stock: [s.stock[0]], table: [[s.hands[0][1].id], []] };
  const e = P.endDeclare(last, w);
  assert.equal(e.turnUp, null);
  assert.ok(e.hands[1 - w].some((x) => x.id === turned.id));
  assert.deepEqual(e.table, [[], []]);
  assert.equal(P.drawing(e), false);
});

test('cutthroat scores every player alone; partnership scores teams', () => {
  const sc = P.newGame({ seed: 1, variant: 'cutthroat' });
  assert.deepEqual([0, 1, 2, 3].map((x) => P.sideOf(sc, x)), [0, 1, 2, 3]);
  assert.equal(P.sameSide(sc, 0, 2), false);
  assert.equal(P.sameSide(P.newGame({ seed: 1, variant: 'partnership' }), 0, 2), true);
});

/** Runs AI-only games of a variant to the end, checking each scored hand. */
function aiGames(variant, seeds, check) {
  const v = P.VARIANTS[variant];
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = P.makeRng(seed);
    let s = P.newGame({ seed, variant });
    for (let guard = 0; guard < 50000 && s.phase !== 'gameOver'; guard++) {
      if (s.phase === 'handOver') { s = P.nextHand(s); continue; }
      const before = s.result;
      s = AI.act(s, rng); // the engine throws on illegal plays
      if (s.result && s.result !== before) check(s, seed);
    }
    assert.equal(s.phase, 'gameOver', `${variant} seed ${seed} finished`);
    assert.ok(s.scores[s.winner] >= v.target);
    if (!v.bidding) assert.equal(s.scores[s.winner], Math.max(...s.scores), 'highest score wins');
  }
}

test('AI-only games finish in every variant with the right card totals', () => {
  aiGames('double-pack', 12, (s, seed) => {
    assert.equal(s.result.per[0].counters + s.result.per[1].counters, 500, `seed ${seed}`);
    assert.equal(s.tricksWon.reduce((a, b) => a + b, 0), 20);
  });
  aiGames('partnership', 15, (s, seed) => {
    const r = s.result;
    assert.equal(r.per[0].counters + r.per[1].counters, 250, `seed ${seed}`);
    assert.deepEqual(r.delta, r.per.map((p) => p.total));
    assert.equal(r.bid, null);
  });
  aiGames('cutthroat', 15, (s, seed) => {
    const r = s.result;
    assert.equal(r.per.length, 4);
    assert.equal(r.per.reduce((t, p) => t + p.counters, 0), 250, `seed ${seed}`);
    r.per.forEach((p, i) => assert.equal(p.meldEarned, s.tricksWon[i] ? p.meld : 0));
  });
  aiGames('two-handed', 15, (s, seed) => {
    const r = s.result;
    assert.equal(r.per[0].counters + r.per[1].counters, 250, `seed ${seed}: 240 in cards + 10 for the last trick`);
    assert.equal(s.tricksWon[0] + s.tricksWon[1], 24);
    assert.equal(s.stock.length, 0);
  });
});
