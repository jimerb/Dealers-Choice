// Solitaire: every catalog entry exists with rules; random legal play never loses or duplicates a card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, CUSTOM, SOLITAIRE, newGame, grab, canDrop, move, clickStock, autoPlay, undo, isWon, makeRng } from './_sol.mjs';

test('every parlor entry is playable and has How to play text', () => {
  const ids = SOLITAIRE.flatMap((g) => g.games.map(([, id]) => id));
  assert.equal(ids.length, 51);
  for (const id of ids) {
    const v = VARIANTS[id] ?? CUSTOM[id];
    assert.ok(v, `missing layout ${id}`);
    assert.ok(v.how && v.how.length > 120, `${id} needs How to play text`);
  }
});

const pileCount = (s) => s.piles.reduce((t, p) => t + p.cards.length + (p.guide ? 1 : 0), 0); // guide cards sit beside their foundations
const ids = (s) => s.piles.flatMap((p) => p.cards.map((c) => c.id));

for (const id of Object.keys(VARIANTS)) {
  test(`build ${id}: random play keeps every card`, () => {
    for (let seed = 1; seed <= 5; seed++) {
      let s = newGame(id, seed);
      const v = VARIANTS[id];
      const n0 = pileCount(s);
      assert.equal(n0, 52 * (v.decks ?? 1), `${id}: deal has ${n0} cards`);
      const rng = makeRng(seed * 77);
      for (let step = 0; step < 350; step++) {
        const moves = [];
        for (const p of s.piles) for (let i = 0; i < p.cards.length; i++) if (grab(s, p, i)) for (const q of s.piles) if (canDrop(s, p.id, i, q.id)) moves.push([p.id, i, q.id]);
        if (moves.length && rng() < 0.85) s = move(s, ...moves[Math.floor(rng() * moves.length)]);
        else { const n = clickStock(s); if (n && !n.error) s = n; else if (moves.length) s = move(s, ...moves[0]); }
        if (rng() < 0.05) s = autoPlay(s);
        if (rng() < 0.03) s = undo(s);
        const all = ids(s);
        assert.equal(pileCount(s), n0, `${id} seed ${seed} step ${step}: card count changed`);
        assert.equal(new Set(all).size, all.length, `${id}: duplicate card`);
        isWon(s);
      }
    }
  });
}

for (const [id, m] of Object.entries(CUSTOM)) {
  test(`custom ${id}: random play is consistent`, () => {
    for (let seed = 1; seed <= 5; seed++) {
      let s = m.newGame(seed);
      const n0 = m.count(s);
      const rng = makeRng(seed * 91);
      for (let step = 0; step < 400 && !m.isOver(s); step++) {
        m.render(s); m.status(s);
        if (m.timed && rng() < 0.15) s = m.tick(s);
        const t = m.targets(s);
        if (!t.length) break;
        const r = m.click(s, t[Math.floor(rng() * t.length)]);
        if (r && !r.error) s = r;
        assert.equal(m.count(s), n0, `${id} seed ${seed} step ${step}: card count changed`);
        JSON.stringify(s);
      }
      m.render(s); m.isWon(s);
    }
  });
}
