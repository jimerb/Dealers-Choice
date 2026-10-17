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
