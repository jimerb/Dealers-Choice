// Game options and variants: each option changes the rules as described, and AI-only games
// played with every option value still finish with legal play.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const dir = new URL('../public/js/games/', import.meta.url);
const load = async (id) => (await import(new URL(`${id}.js`, dir))).default;
const NAMES = ['You', 'Mabel', 'Dex', 'Rosa', 'Hank', 'Pip'];
const defaults = (game) => Object.fromEntries((game.settings ?? []).map((s) => [s.key, s.default]));
const ui = () => ({ selected: new Set() });

/** Plays AI-only games (the AI also plays seat 0) with the given options; returns the final states. */
function playOut(game, opts, seeds = 4) {
  const out = [];
  for (let seed = 1; seed <= seeds; seed++) {
    let s = game.newGame({ names: NAMES, seed, opts: { ...defaults(game), ...opts } });
    for (let steps = 0; game.actor(s) !== null; steps++) {
      assert.ok(steps < 40000, `${game.id} ${JSON.stringify(opts)} seed ${seed}: game did not finish (phase ${s.phase})`);
      game.view(s, ui());
      s = game.aiAct(s);
      s.fx = [];
    }
    game.view(s, ui());
    JSON.parse(JSON.stringify(s));
    out.push(s);
  }
  return out;
}

/** Every value of every setting gets at least one AI-only run. */
async function everyOption(id, seeds = 2) {
  const game = await load(id);
  for (const set of game.settings ?? []) for (const [v] of set.options) playOut(game, { [set.key]: v }, seeds);
}

// ------------------------------------------------------------------ Bridge
test('bridge: every option plays out', () => everyOption('bridge'));

/** Ends a bridge deal: the declarer's side took `took` tricks in the contract given. */
function bridgeDeal(game, s, { level, strain, declarer, took, doubled = 0 }) {
  const dt = declarer % 2;
  Object.assign(s, { phase: 'trickDone', contract: { level, strain, doubled }, declarer, dummy: (declarer + 2) % 4, trickNo: 12, trick: [], winner: declarer });
  s.tricks = dt === 0 ? [took - 1, 13 - took] : [13 - took, took - 1];
  return game.aiAct(s);
}

test('bridge: Chicago game bonuses follow the deal-number vulnerability', async () => {
  const game = await load('bridge');
  let s = game.newGame({ names: NAMES, seed: 3, opts: { scoring: 'chicago', dummy: 'play' } });
  assert.equal(s.dealNo, 1);
  s = bridgeDeal(game, s, { level: 4, strain: 'S', declarer: 0, took: 10 }); // deal 1: nobody vulnerable
  assert.deepEqual(s.above, [300, 0]);
  assert.equal(s.phase, 'handOver');
  s = game.act(s, { act: 'next' });
  assert.equal(s.dealer % 2, 1); // deal 2: their dealer, so they are vulnerable
  s = bridgeDeal(game, s, { level: 3, strain: 'NT', declarer: 1, took: 9 });
  assert.deepEqual(s.above, [300, 500]);
  s = game.act(s, { act: 'next' });
  s = bridgeDeal(game, s, { level: 1, strain: 'C', declarer: 0, took: 6 }); // deal 3: our dealer, so down one vulnerable
  assert.deepEqual(s.above, [300, 600]);
  s = game.act(s, { act: 'next' });
  s = bridgeDeal(game, s, { level: 2, strain: 'C', declarer: 2, took: 8 }); // deal 4: part-score bonus
  assert.deepEqual(s.above, [400, 600]);
  assert.equal(s.phase, 'gameOver');
  assert.deepEqual(s.rubberTotals, [400 + 120 + 40, 600 + 100]);
});

test('bridge: rubber scoring (the default) has no Chicago bonuses', async () => {
  const game = await load('bridge');
  let s = game.newGame({ names: NAMES, seed: 3, opts: defaults(game) });
  s = bridgeDeal(game, s, { level: 4, strain: 'S', declarer: 0, took: 10 });
  assert.deepEqual(s.above, [0, 0]);
  assert.deepEqual(s.games, [1, 0]);
  // The same deal in a saved game from before the option existed scores the same way.
  let old = game.newGame({ names: NAMES, seed: 3, opts: {} });
  old = bridgeDeal(game, old, { level: 4, strain: 'S', declarer: 0, took: 10 });
  assert.deepEqual([old.above, old.games], [s.above, s.games]);
});

test('bridge: sitting out as dummy lets North play both hands', async () => {
  const game = await load('bridge');
  let partnerDeclared = 0;
  for (let seed = 1; seed <= 12; seed++) {
    let s = game.newGame({ names: NAMES, seed, opts: { scoring: 'rubber', dummy: 'sitout' } });
    while (game.actor(s) !== null) {
      if (s.phase === 'play' && s.declarer === 2) {
        partnerDeclared++;
        assert.notEqual(game.actor(s), 0, 'the human never plays when North declares');
        if (s.turn === 0) assert.throws(() => game.act(s, { act: 'play', id: s.hands[0][0].id }));
      }
      s = game.aiAct(s);
      s.fx = [];
    }
  }
  assert.ok(partnerDeclared > 0);
});

// ------------------------------------------------------------------ Gin Rummy
test('gin: every option plays out', () => everyOption('gin', 1));

test('gin: a match runs game after game until someone reaches the target', async () => {
  const game = await load('gin');
  for (const [match, check] of [['g3', (m, w) => m.games[w] === 3], ['p500', (m, w) => m.points[w] >= 500]]) {
    for (let seed = 1; seed <= 3; seed++) {
      let s = game.newGame({ names: NAMES, seed, opts: { ...defaults(game), match } });
      let games = 0;
      while (game.actor(s) !== null) {
        if (s.phase === 'gameDone') {
          games++;
          assert.ok(Math.max(...s.scores) >= 100);
          s = game.act(s, { act: 'nextgame' });
          assert.deepEqual([s.scores, s.handsWon, s.match.gameNo], [[0, 0], [0, 0], games + 1]);
          continue;
        }
        s = game.aiAct(s);
      }
      assert.ok(check(s.match, s.final.winner), `${match}: ${JSON.stringify(s.match)}`);
      assert.equal(s.match.games[0] + s.match.games[1], games + 1);
    }
  }
  // One game (the default, and saved settings from before the option) ends the first time someone reaches 100.
  for (const opts of [defaults(game), { type: 'gin', skill: 'intermediate' }]) {
    const [s] = playOut(game, opts, 1);
    assert.equal(s.match, null);
    assert.equal(s.phase, 'gameOver');
  }
});

// ------------------------------------------------------------------ Cribbage
test('cribbage: every option plays out', () => everyOption('cribbage'));

/** Plays AI moves until it's your turn to count a hand or crib worth at least `min` points. */
async function cribbageCount(opts, min) {
  const game = await load('cribbage');
  for (let seed = 1; seed < 60; seed++) {
    let s = game.newGame({ names: NAMES, seed, opts: { ...defaults(game), counting: 'manual', ...opts } });
    while (game.actor(s) !== null) {
      if (s.phase === 'count' && s.show[s.showIdx].total >= min && Math.max(...s.scores) < 90) return { game, s };
      s = game.aiAct(s);
    }
  }
  throw new Error('no hand to count');
}

test('cribbage: manual counting gives missed points to the opponent (Muggins)', async () => {
  const { game, s } = await cribbageCount({}, 4);
  const x = s.show[s.showIdx];
  assert.equal(game.actor(s), 0);
  assert.throws(() => game.act(s, { act: 'claim', n: String(x.total + 1) }), /more than/);
  const after = game.act(s, { act: 'claim', n: String(x.total - 3) });
  assert.equal(after.scores[0], s.scores[0] + x.total - 3);
  assert.equal(after.scores[1], s.scores[1] + 3);
  assert.equal(after.show[s.showIdx].muggins, 3);
  // A full claim costs nothing.
  const exact = game.act(s, { act: 'claim', n: String(x.total) });
  assert.deepEqual(exact.scores, [s.scores[0] + x.total, s.scores[1]]);
  // Counted for you (the default), hands are scored without stopping.
  for (const st of playOut(game, { counting: 'auto' }, 2)) assert.ok(st.log.every((l) => !/Muggins/.test(l)));
});

test('cribbage: a best-of-seven match counts skunks as extra games', async () => {
  const { game, s } = await cribbageCount({ match: 'seven' }, 1);
  s.scores = [120, 50];
  const won = game.act(s, { act: 'claim', n: '1' });
  assert.equal(won.phase, 'gameDone');
  assert.equal(won.skunk, 'double skunk');
  assert.deepEqual(won.match.games, [3, 0]);
  const next = game.act(won, { act: 'nextgame' });
  assert.deepEqual([next.scores, next.match.gameNo, next.dealer, next.phase], [[0, 0], 2, 1, 'discard']);
  for (const st of playOut(game, { match: 'seven' }, 3)) {
    assert.equal(st.phase, 'gameOver');
    assert.ok(st.match.games[st.winner] >= 4 && st.match.games[1 - st.winner] < 4);
  }
  for (const st of playOut(game, { match: 'single' }, 2)) assert.equal(st.match, null);
});

// ------------------------------------------------------------------ Euchre
test('euchre: every option plays out', () => everyOption('euchre'));

test('euchre: who leads after a player goes alone', async () => {
  const game = await load('euchre');
  const lead = (aloneLead) => {
    const s = game.newGame({ names: NAMES, seed: 5, opts: { ...defaults(game), aloneLead } });
    // Round two: you name a suit and go alone while your partner (across) deals and sits out.
    Object.assign(s, { round: 2, turn: 0, dealer: 2 });
    const suit = ['S', 'H', 'C', 'D'].find((x) => x !== s.up.suit);
    return game.act(s, { act: 'name', suit, alone: '1' }).turn;
  };
  assert.equal(lead('dealer'), 3); // left of the dealer
  assert.equal(lead('loner'), 1); // left of you
  assert.equal(lead(undefined), 3); // saved settings from before the option
});

// ------------------------------------------------------------------ Crazy Eights
test('crazy8: every option plays out', () => everyOption('crazy8'));

test('crazy8: automatic drawing keeps drawing until you can play', async () => {
  const game = await load('crazy8');
  const c = (rank, suit) => ({ id: `${rank}${suit}`, rank, suit });
  const setup = (draw) => {
    const s = game.newGame({ names: NAMES, seed: 2, opts: { ...defaults(game), draw } });
    Object.assign(s, { turn: 0, phase: 'play', pendingDraw: 0, suit: 'H', discard: [c('5', 'H')], stock: [c('7', 'S'), c('9', 'H'), c('4', 'S'), c('2', 'D')] });
    s.hands[0] = [c('3', 'C')];
    return game.act(s, { act: 'draw' });
  };
  const auto = setup('auto');
  assert.deepEqual(auto.hands[0].map((x) => x.id).sort(), ['2D', '3C', '4S', '9H']);
  assert.equal(auto.turn, 0);
  assert.equal(setup('manual').hands[0].length, 2);
  assert.equal(setup(undefined).hands[0].length, 2);
});

// ------------------------------------------------------------------ Memory Match
test('memory: every option plays out, solo and against an opponent', async () => {
  await everyOption('memory');
  const game = await load('memory');
  for (const deck of ['easy', 'medium', 'hard']) {
    playOut(game, { mode: 'two', deck, wild: 'jokers', race: 15, peek: 'yes', size: 16 }, 2);
    playOut(game, { mode: 'solo', deck, wild: 'jokers', size: 36 }, 2);
  }
});

test('memory: deck difficulty changes which cards are dealt and what matches', async () => {
  const game = await load('memory');
  const board = (deck) => game.newGame({ names: NAMES, seed: 4, opts: { ...defaults(game), deck } }).cells.map((c) => c.card);
  const ranks = (cards) => new Set(cards.map((c) => c.rank));
  assert.equal(ranks(board('easy')).size, 12); // one pair per rank
  const hard = board('hard');
  assert.equal(ranks(hard).size, 6); // both colors of six ranks
  for (const r of ranks(hard)) assert.equal(hard.filter((c) => c.rank === r).length, 4);
  // An easy deck matches by rank alone: a red and a black card can pair.
  const s = game.newGame({ names: NAMES, seed: 4, opts: { ...defaults(game), deck: 'easy' } });
  const r0 = s.cells[0].card.rank;
  const j = s.cells.findIndex((c, i) => i > 0 && c.card.rank === r0);
  let t = game.act(s, { act: 'cell', i: '0' });
  t = game.act(t, { act: 'cell', i: String(j) });
  assert.equal(t.matched[0], 1);
  assert.equal(t.cells[0].state, 'gone');
});

test('memory: harder decks score more for the same play', async () => {
  const game = await load('memory');
  const score = (deck) => {
    const s = game.newGame({ names: NAMES, seed: 7, opts: { ...defaults(game), deck } });
    const red = (c) => c.suit === 'H' || c.suit === 'D';
    const first = s.cells[0].card;
    const last = s.cells.findIndex((c, i) => i > 0 && c.card.rank === first.rank && (deck === 'easy' || red(c.card) === red(first)));
    s.cells.forEach((c, i) => { if (i !== 0 && i !== last) c.state = 'gone'; });
    Object.assign(s, { matched: [11, 0], misses: 4, bonuses: 0 });
    let t = game.act(s, { act: 'cell', i: '0' });
    t = game.act(t, { act: 'cell', i: String(last) });
    assert.equal(t.phase, 'gameOver');
    return t.score;
  };
  assert.deepEqual([score('easy'), score('medium'), score('hard')], [60, 80, 112]);
});

test('memory: a wild joker takes a card and its match', async () => {
  const game = await load('memory');
  const s = game.newGame({ names: NAMES, seed: 3, opts: { ...defaults(game), wild: 'jokers' } });
  assert.equal(s.cells.filter((c) => c.card.rank === 'JK').length, 2);
  assert.equal(s.cells.length, 24);
  const jk = s.cells.findIndex((c) => c.card.rank === 'JK');
  const other = s.cells.findIndex((c) => c.card.rank !== 'JK');
  let t = game.act(s, { act: 'cell', i: String(jk) });
  t = game.act(t, { act: 'cell', i: String(other) });
  assert.equal(t.phase, 'reveal');
  assert.equal(t.matched[0], 1);
  assert.equal(t.flipped.length, 3);
  t = game.aiAct(t);
  assert.equal(t.cells.filter((c) => c.state === 'gone').length, 3);
  assert.equal(t.turn, 0); // a match means another turn
});

test('memory: two players race to a number of pairs over several boards, with a peek', async () => {
  const game = await load('memory');
  let s = game.newGame({ names: NAMES, seed: 2, opts: { ...defaults(game), mode: 'two', size: 16, race: 10, peek: 'yes' } });
  assert.equal(s.phase, 'peek');
  assert.equal(game.actor(s), 'auto');
  assert.ok(!game.view(s, ui()).center.includes('data-act="cell"'), 'every card shows during the peek');
  s = game.aiAct(s);
  assert.equal(s.phase, 'pick');
  let boards = 1;
  while (game.actor(s) !== null) { s = game.aiAct(s); boards = Math.max(boards, s.board); }
  assert.ok(boards >= 2, 'eight pairs a board: the race needs a second board');
  assert.equal(Math.max(...s.matched), 10);
  // Without a race, one board decides it (the default).
  const [one] = playOut(game, { mode: 'two', size: 16 }, 1);
  assert.equal(one.matched[0] + one.matched[1], 8);
  assert.equal(one.board, 1);
});

// ------------------------------------------------------------------ Tarot
test('tarot: every option plays out', () => everyOption('tarot', 1));

test('tarot: the taker can lead the first trick', async () => {
  const game = await load('tarot');
  const firstTurn = (firstLead) => {
    const s = game.newGame({ names: NAMES, seed: 6, opts: { ...defaults(game), firstLead } });
    Object.assign(s, { phase: 'bid', turn: 0, bidCount: 3, high: 0, taker: null });
    return game.act(s, { act: 'bid', v: '4' }); // a Garde Contre goes straight to play
  };
  const t = firstTurn('taker');
  assert.deepEqual([t.phase, t.taker, t.turn], ['play', 0, 0]);
  assert.equal(firstTurn('dealer').turn, (t.dealer + 1) % 4);
  assert.equal(firstTurn(undefined).turn, (t.dealer + 1) % 4);
});

test('tarot: poignée sizes and misère hands', async () => {
  const { poignee, miserable } = await import(new URL('tarot.js', dir));
  const trumps = (n) => Array.from({ length: n }, (_, i) => ({ id: `T${i + 1}`, rank: String(i + 1), suit: 'T' }));
  const EX = { id: 'EX', rank: 'EX', suit: 'X' };
  assert.equal(poignee(trumps(9)), null);
  assert.equal(poignee([...trumps(9), EX]).pts, 20); // the Excuse makes up the tenth
  assert.equal(poignee(trumps(13)).pts, 30);
  assert.equal(poignee(trumps(15)).pts, 40);
  const low = [{ id: '5S', rank: '5', suit: 'S' }, { id: '2H', rank: '2', suit: 'H' }];
  assert.ok(miserable([...low, EX])); // no trumps (the Excuse isn't one) and no court cards
  assert.ok(miserable([...low, ...trumps(3)])); // trumps but no court cards
  assert.ok(!miserable([...low, ...trumps(3), { id: 'KS', rank: 'K', suit: 'S' }]));
});

/** Plays one Tarot deal to its end; `tweak` changes the state before play. */
async function tarotDeal(seed, opts, tweak = () => {}) {
  const game = await load('tarot');
  let s = game.newGame({ names: NAMES, seed, opts: { ...defaults(game), ...opts } });
  let tweaked = false;
  while (s.phase !== 'handOver' && s.phase !== 'gameOver') {
    if (s.phase === 'play' && !tweaked) { tweak(s); tweaked = true; }
    s = game.aiAct(s);
  }
  return s;
}

test('tarot: misère is paid apart from the deal', async () => {
  const plain = await tarotDeal(3, {});
  const mis = await tarotDeal(3, { misere: 'yes' }, (s) => { s.misere = [1]; });
  assert.deepEqual(mis.result.delta, plain.result.delta.map((d, p) => d + (p === 1 ? 30 : -10)));
});

test('tarot: poignées add to the winning side’s score', async () => {
  let checked = 0;
  for (let seed = 1; seed <= 40 && checked < 3; seed++) {
    const yes = await tarotDeal(seed, { bonuses: 'yes' });
    if (!yes.poignees.length) continue;
    const no = await tarotDeal(seed, { bonuses: 'no' });
    const t = yes.taker, sign = yes.result.made ? 1 : -1;
    const bonus = yes.poignees.reduce((a, x) => a + x.pts, 0) + (yes.result.slam ? 200 : 0);
    assert.equal(yes.result.bonus, bonus);
    assert.equal(yes.result.delta[t] - no.result.delta[t], 3 * sign * bonus);
    assert.deepEqual(no.poignees, []);
    checked++;
  }
  assert.ok(checked > 0, 'some deal had a poignée');
});

// ------------------------------------------------------------------ Skat
test('skat: every option plays out', async () => {
  await everyOption('skat', 1);
  const game = await load('skat');
  playOut(game, { ramsch: 'schieben', kontra: 'bid18', ramschSkat: 'loser', ramschMoon: 'no' }, 3);
});

/** A Skat deal where everyone passes: Middlehand and Rearhand pass, then Forehand (you) passes too. */
async function skatAllPass(opts) {
  const game = await load('skat');
  let s = game.newGame({ names: NAMES, seed: 1, opts: { ...defaults(game), ...opts } });
  Object.assign(s, { F: 0, M: 1, R: 2, phase: 'bid', turn: 0, bid: { stage: 3, caller: 0, listener: 0, value: 0, step: 'last' } });
  return { game, s: game.act(s, { act: 'last', v: 'pass' }) };
}

test('skat: Ramsch is played when everyone passes (or the deal is redealt)', async () => {
  const { s } = await skatAllPass({ ramsch: 'ramsch' });
  assert.deepEqual([s.phase, s.ramsch, s.game, s.declarer, s.turn], ['play', true, 'G', null, 0]);
  const { s: redeal } = await skatAllPass({ ramsch: 'none' });
  assert.equal(redeal.phase, 'bid');
  assert.equal(redeal.ramsch, false);
});

test('skat: Ramsch scoring', async () => {
  const { points } = await import(new URL('skat.js', dir));
  const c = (rank, suit) => ({ id: `${rank}${suit}`, rank, suit });
  /** Ends a Ramsch deal with these cards taken and tricks won (the last trick won by `last`). */
  const end = async (opts, taken, tricks, skat, last) => {
    const { game, s } = await skatAllPass({ ramsch: 'ramsch', ...opts });
    Object.assign(s, { taken, skat, trick: [], trickNo: 9, phase: 'trickDone', winner: last, tricks: tricks.map((n, p) => n - (p === last ? 1 : 0)) });
    return game.aiAct(s);
  };
  const big = [c('A', 'S'), c('A', 'H'), c('10', 'S')], mid = [c('K', 'S'), c('Q', 'S')], small = [c('J', 'S')];
  const skat = [c('A', 'C'), c('7', 'C')];
  const pts = (cs) => cs.reduce((t, x) => t + points(x), 0);
  // Skat with the last trick: it counts for whoever took that trick.
  let r = await end({}, [big, mid, small], [4, 3, 3], skat, 0);
  assert.deepEqual(r.result.delta, [-(pts(big) + 11), 0, 0]);
  // Skat to the loser: it doesn't count.
  r = await end({ ramschSkat: 'loser' }, [big, mid, small], [4, 3, 3], skat, 2);
  assert.deepEqual(r.result.delta, [-pts(big), 0, 0]);
  // Someone took no tricks: the loss doubles.
  r = await end({ ramschSkat: 'loser' }, [big, mid, []], [6, 4, 0], skat, 0);
  assert.deepEqual(r.result.delta, [-2 * pts(big), 0, 0]);
  // Every trick to one player: +120, or with that option off four times the points lost.
  r = await end({}, [[...big, ...mid, ...small], [], []], [10, 0, 0], skat, 0);
  assert.deepEqual(r.result.delta, [120, 0, 0]);
  r = await end({ ramschSkat: 'loser', ramschMoon: 'no' }, [[...big, ...mid], [], []], [10, 0, 0], skat, 0);
  assert.deepEqual(r.result.delta, [-4 * pts([...big, ...mid]), 0, 0]);
});

test('skat: Schieberamsch offers a grand hand, then passes the skat round', async () => {
  const { game, s } = await skatAllPass({ ramsch: 'schieben' });
  assert.deepEqual([s.phase, s.turn], ['grandOffer', 0]);
  // A grand hand at 18 against the other two.
  const grand = game.act(s, { act: 'grand', v: 'yes' });
  assert.deepEqual([grand.phase, grand.declarer, grand.game, grand.hand, grand.bid.value], ['play', 0, 'G', true, 18]);
  // Everyone passes: each player may pick up the skat and push two cards on (no jacks), or leave it (×2).
  let t = s;
  while (t.phase === 'grandOffer') t = game.act({ ...t, turn: 0 }, { act: 'grand', v: 'pass' }); // all three pass
  assert.deepEqual([t.phase, t.turn], ['push', 0]);
  const picked = game.act(t, { act: 'push', v: 'pick' });
  assert.equal(picked.hands[0].length, 12);
  const jack = picked.hands[0].find((x) => x.rank === 'J');
  const plain = picked.hands[0].filter((x) => x.rank !== 'J');
  if (jack) assert.throws(() => game.act(picked, { act: 'pushDiscard', ids: [jack.id, plain[0].id] }), /Jacks/);
  const pushed = game.act(picked, { act: 'pushDiscard', ids: [plain[0].id, plain[1].id] });
  assert.equal(pushed.hands[0].length, 10);
  assert.deepEqual(pushed.skat.map((x) => x.id), [plain[0].id, plain[1].id]);
  let left = game.act(t, { act: 'push', v: 'leave' });
  assert.equal(left.ramschMult, 2);
  for (let k = 0; k < 2; k++) left = game.act({ ...left, turn: 0 }, { act: 'push', v: 'leave' });
  assert.deepEqual([left.phase, left.ramsch, left.ramschMult], ['play', true, 8]);
});

/** Plays one Skat deal to its end; `tweak` changes the state as play starts. */
async function skatDeal(seed, opts, tweak = () => {}) {
  const game = await load('skat');
  let s = game.newGame({ names: NAMES, seed, opts: { ...defaults(game), ...opts } });
  let tweaked = false;
  while (s.phase !== 'handOver' && s.phase !== 'gameOver') {
    if (s.phase === 'play' && !tweaked) { tweak(s); tweaked = true; }
    s = game.aiAct(s);
  }
  return s;
}

test('skat: kontra doubles the score and re doubles it again', async () => {
  const { canKontra, canRe } = await import(new URL('skat.js', dir));
  let checked = 0;
  for (let seed = 1; seed <= 10 && checked < 3; seed++) {
    const plain = await skatDeal(seed, {});
    if (!plain.result || plain.result.ramsch) continue;
    const k = await skatDeal(seed, {}, (s) => { s.kontra = 1; s.rePlayed = true; }); // too late for re
    const kr = await skatDeal(seed, {}, (s) => { s.kontra = 2; });
    assert.equal(k.result.delta, 2 * plain.result.delta);
    assert.equal(kr.result.delta, 4 * plain.result.delta);
    checked++;
  }
  assert.ok(checked > 0);
  // Who may call: defenders before their first card (with the bid-18 rule, only one who bid); the declarer answers re.
  const game = await load('skat');
  let s = game.newGame({ names: NAMES, seed: 2, opts: { ...defaults(game), kontra: 'yes' } });
  while (s.phase !== 'play') s = game.aiAct(s);
  const def = [0, 1, 2].find((p) => p !== s.declarer);
  assert.ok(canKontra(s, def));
  assert.ok(!canKontra(s, s.declarer));
  assert.ok(!canKontra({ ...s, opts: { ...s.opts, kontra: 'no' } }, def));
  assert.equal(canKontra({ ...s, opts: { ...s.opts, kontra: 'bid18' }, bidders: [] }, def), false);
  assert.ok(canKontra({ ...s, opts: { ...s.opts, kontra: 'bid18' }, bidders: [def] }, def));
  const said = { ...s, kontra: 1, rePlayed: false };
  assert.ok(canRe(said, s.declarer));
  assert.ok(!canRe({ ...said, rePlayed: true }, s.declarer));
  assert.ok(!canKontra({ ...s, trickNo: 1 }, def));
});

// ------------------------------------------------------------------ Poker
test('poker: two- and three-player tables play out', async () => {
  const game = await load('poker');
  for (const players of [2, 3]) {
    const s = game.newGame({ names: NAMES, seed: 1, opts: { ...defaults(game), players } });
    assert.equal(s.names.length, players);
    assert.equal(game.view(s, ui()).seats.length, players);
    for (const end of playOut(game, { players, hands: 0 }, 2)) assert.equal(end.chips.filter((c) => c > 0).length === 1 || end.chips[0] <= 0, true);
  }
});

// ------------------------------------------------------------------ The games whose options were already in place
for (const id of ['hearts', 'spades', 'pitch', 'poker', 'gofish', 'war']) test(`${id}: every option plays out`, () => everyOption(id, 1));
