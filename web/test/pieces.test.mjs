// Table pieces: chip breakdowns, cribbage peg holes, and the HTML helpers' art references.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chipBreakdown, chipStacks, chipsHTML, holeX, pegHole, pegPositions, trackHoles, cribbageBoardHTML, trayHTML, trumpPlaqueHTML, BOARD } from '../public/js/core/pieces.js';

const pub = (path) => new URL(`../public/${path.replace(/^\//, "")}`, import.meta.url);
const total = (b) => b.reduce((t, x) => t + x.value * x.count, 0);

test('chip breakdown is greedy, largest first, and adds up', () => {
  assert.deepEqual(chipBreakdown(0), []);
  assert.deepEqual(chipBreakdown(1), [{ value: 1, count: 1 }]);
  assert.deepEqual(chipBreakdown(500), [{ value: 500, count: 1 }]);
  assert.deepEqual(chipBreakdown(1736), [{ value: 1000, count: 1 }, { value: 500, count: 1 }, { value: 100, count: 2 }, { value: 25, count: 1 }, { value: 5, count: 2 }, { value: 1, count: 1 }]);
  assert.deepEqual(chipBreakdown(-20), []);
  for (const n of [3, 29, 99, 480, 495, 2999, 3000]) {
    const b = chipBreakdown(n);
    assert.equal(total(b), n);
    for (let i = 1; i < b.length; i++) assert.ok(b[i].value < b[i - 1].value);
  }
});

test('chip stacks keep the largest few denominations with a few chips each', () => {
  assert.deepEqual(chipStacks(495), [{ value: 100, count: 4, shown: 4 }, { value: 25, count: 3, shown: 3 }, { value: 5, count: 4, shown: 4 }]);
  assert.deepEqual(chipStacks(3000, { perStack: 2 }), [{ value: 1000, count: 3, shown: 2 }]);
  assert.equal(chipStacks(1736, { stacks: 2 }).length, 2);
});

test('chips HTML uses chip art that exists and is hidden from screen readers', () => {
  const html = chipsHTML(630, { size: 30, text: 'Pot 630' });
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /Pot 630/);
  for (const src of html.match(/assets\/[^"')]+\.webp/g)) assert.ok(existsSync(pub(src)), `missing ${src}`);
  assert.equal(chipsHTML(0), '<span class="chips" style="--chip:22px"><span class="chip-cols" aria-hidden="true"></span></span>');
});

test('cribbage holes come in groups of five and every score has its own hole on the board', () => {
  assert.equal(holeX(1) - holeX(0), holeX(4) - holeX(3));
  assert.ok(holeX(5) - holeX(4) > holeX(1) - holeX(0), 'a gap after each group of five');
  for (const track of [0, 1]) {
    const seen = new Set();
    for (let s = 0; s <= 121; s++) {
      const { x, y } = pegHole(s, track);
      assert.ok(x > 0 && x < BOARD.w && y > BOARD.h * 0.2 && y < BOARD.h * 0.8, `hole ${s} inside the board's center strip`);
      seen.add(`${x},${y}`);
    }
    assert.equal(seen.size, 122, 'scores 0-121 each have a distinct hole');
    assert.equal(trackHoles(track).length, 123, '120 holes, two start holes and the game hole');
  }
  // Out along one row, back along the other; the two tracks never share a hole.
  assert.equal(pegHole(1, 0).y, pegHole(60, 0).y);
  assert.ok(pegHole(60, 0).x > pegHole(1, 0).x);
  assert.equal(pegHole(61, 0).y, pegHole(120, 0).y);
  assert.ok(pegHole(61, 0).x > pegHole(120, 0).x);
  assert.notEqual(pegHole(30, 0).y, pegHole(30, 1).y);
});

test('front peg marks the score and back peg the previous score', () => {
  const p = pegPositions(17, 9, 0);
  assert.deepEqual(p.front, pegHole(17, 0));
  assert.deepEqual(p.back, pegHole(9, 0));
  const start = pegPositions(0, 0, 1);
  assert.notDeepEqual(start.front, start.back, 'both pegs start in separate start holes');
  assert.deepEqual(pegPositions(5, 0, 1).back, pegHole(0, 1));
});

test('board, tray and plaque HTML carry text equivalents and existing art', () => {
  const board = cribbageBoardHTML([{ name: 'You', score: 12, prev: 7, peg: 'brass' }, { name: 'Mabel', score: 4, prev: 0, peg: 'red' }]);
  assert.match(board, /aria-label="Cribbage board: You 12, Mabel 4 of 121"/);
  assert.equal((board.match(/peg-brass\.webp/g) ?? []).length, 3); // two pegs and the key
  const tray = trayHTML('', { label: 'Pass to Mabel' });
  assert.match(tray, /<figcaption>Pass to Mabel<\/figcaption>/);
  assert.match(trumpPlaqueHTML('H'), /Trump: Hearts/);
  assert.match(trumpPlaqueHTML('NT', { caption: 'No trump' }), /No trump/);
  for (const html of [board, tray, trumpPlaqueHTML('S'), trumpPlaqueHTML('D'), trumpPlaqueHTML('C')]) {
    for (const src of html.match(/assets\/[^"')]+\.webp/g) ?? []) assert.ok(existsSync(pub(src)), `missing ${src}`);
    assert.ok(!/<img(?![^>]*alt="")[^>]*>/.test(html), 'images are decorative (alt="")');
  }
});

test('cribbage keeps each player\'s previous score for the back peg', async () => {
  const game = (await import('../public/js/games/cribbage.js')).default;
  let s = game.newGame({ names: ['Jo', 'Mabel'], seed: 7, opts: { first: 'me' } });
  assert.deepEqual(s.prev, [0, 0]);
  while (game.actor(s) !== null) {
    const before = s.scores.slice();
    s = game.aiAct(s);
    for (const p of [0, 1]) {
      assert.ok(s.prev[p] <= s.scores[p]);
      if (s.scores[p] !== before[p]) assert.ok(s.prev[p] >= before[p] && s.prev[p] < s.scores[p], 'back peg moves to the old front hole');
    }
  }
});
