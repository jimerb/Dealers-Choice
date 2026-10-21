// Solitaire table sizing: every rules-driven layout fits the felt at every screen size, cards
// fill the room on big screens, and a column squeezes its fan instead of running off the table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, newGame, planStandard, fanColumn, wrapLines, CARD_H } from './_sol.mjs';

// Felt boxes (inside the padding) measured on the page at common screen sizes.
const BOXES = {
  'desktop 1280x800': { W: 1204, H: 577 }, 'desktop 1920x1080': { W: 1844, H: 857 }, 'desktop 2560x1440': { W: 2324, H: 1217 },
  'iPad landscape': { W: 948, H: 545 }, 'iPad portrait': { W: 744, H: 921 },
  'phone 375': { W: 339, H: 500, minW: 22 }, 'phone 390': { W: 354, H: 540, minW: 22 },
};

for (const id of Object.keys(VARIANTS)) {
  test(`layout ${id}: fits the felt at every size`, () => {
    const s = newGame(id, 7);
    const n = s.piles.filter((p) => p.type === 'tableau').length;
    for (const [name, box] of Object.entries(BOXES)) {
      const L = planStandard(s, VARIANTS[id].rules, { minW: 40, ...box });
      assert.ok(L.boardW <= box.W + 0.5, `${id} @ ${name}: board ${L.boardW} wider than ${box.W}`);
      assert.ok(L.w >= 22, `${id} @ ${name}: cards ${L.w}px`);
      assert.ok(L.height <= box.H + 0.5, `${id} @ ${name}: board ${L.height} taller than ${box.H}`);
      if (n) {
        assert.ok(L.perRow * L.w + (L.perRow - 1) * L.gap <= box.W + 0.5, `${id} @ ${name}: tableau too wide`);
        assert.ok(L.colRoom >= L.w * CARD_H, `${id} @ ${name}: no room for a card`);
      }
    }
  });
}

test('Klondike fills a big screen: big cards, centred board', () => {
  const s = newGame('klondike', 1);
  const big = planStandard(s, VARIANTS.klondike.rules, BOXES['desktop 1920x1080']);
  assert.ok(big.w >= 140, `cards ${big.w}px at 1920x1080`);
  const huge = planStandard(s, VARIANTS.klondike.rules, BOXES['desktop 2560x1440']);
  assert.ok(huge.w >= 180, `cards ${huge.w}px at 2560x1440`);
  const pad = planStandard(s, VARIANTS.klondike.rules, BOXES['iPad landscape']);
  assert.ok(pad.w >= 85, `cards ${pad.w}px on an iPad`);
  const phone = planStandard(s, VARIANTS.klondike.rules, { ...BOXES['phone 375'] });
  assert.ok(phone.w >= 40, `cards ${phone.w}px on a phone`);
});

test('a late-game Klondike column (6 face down + a 13-card run) fits its room, readable', () => {
  const s = newGame('klondike', 1);
  for (const box of Object.values(BOXES)) {
    const L = planStandard(s, VARIANTS.klondike.rules, { minW: 40, ...box });
    const col = [...Array(6).fill({ up: false }), ...Array(13).fill({ up: true })];
    const { tops, height } = fanColumn(col, L.w, L.colRoom);
    assert.ok(height <= L.colRoom + 0.5, `column ${height} > room ${L.colRoom}`);
    const step = tops.at(-1) - tops.at(-2);
    assert.ok(step >= Math.min(L.w * 0.18, 10), `run step ${step}px at card ${L.w}px is too tight to read`);
  }
});

test('Spider and the wide layouts keep long columns on the table', () => {
  for (const id of ['spider', 'forty', 'bakers', 'labellelucie', 'shamrocks', 'colorado', 'batsford', 'penguin']) {
    const s = newGame(id, 3);
    for (const box of Object.values(BOXES)) {
      const L = planStandard(s, VARIANTS[id].rules, { minW: 22, ...box });
      const col = Array.from({ length: 30 }, (_, i) => ({ up: i >= 5 }));
      assert.ok(fanColumn(col, L.w, L.colRoom).height <= L.colRoom + 0.5, `${id}: 30-card column overflows`);
    }
  }
});

test('fanColumn keeps comfortable steps when there is room and squeezes face-down cards first', () => {
  const col = [{ up: false }, { up: false }, { up: true }, { up: true }];
  const roomy = fanColumn(col, 100, 1000);
  assert.deepEqual(roomy.tops, [0, 12, 24, 52]);
  const tight = fanColumn(col, 100, 140 + 60);
  assert.ok(tight.height <= 200.5);
  assert.ok(tight.tops[1] - tight.tops[0] < tight.tops[3] - tight.tops[2], 'face-down cards squeeze before the run');
  assert.deepEqual(fanColumn([], 80, 300), { tops: [], height: 112 });
});

test('wrapLines matches flex-wrap', () => {
  assert.deepEqual(wrapLines([100, 100, 100], 10, 320), { lines: 1, width: 320 });
  assert.deepEqual(wrapLines([100, 100, 100], 10, 300), { lines: 2, width: 210 });
  assert.deepEqual(wrapLines([], 10, 300), { lines: 0, width: 0 });
});
