// The computer opponent cast: roster data, the seeded picker and name-to-portrait lookups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CAST, PLAYER_PORTRAITS, pickOpponents, castByName, portraitFor, playerPortrait } from '../public/js/core/cast.js';

const pub = (path) => new URL(`../public${path}`, import.meta.url);
// Small seeded generator so picks are reproducible.
const seeded = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };

test('the cast has twelve distinct opponents, each with a portrait on disk and a bio', () => {
  assert.equal(CAST.length, 12);
  assert.equal(new Set(CAST.map((c) => c.id)).size, 12);
  assert.equal(new Set(CAST.map((c) => c.name.toLowerCase())).size, 12);
  for (const c of CAST) {
    assert.ok(c.name && c.bio, `${c.id} needs a name and bio`);
    for (const src of [c.portrait, c.portraitLarge]) assert.ok(existsSync(pub(src)), `missing ${src}`);
  }
  assert.equal(PLAYER_PORTRAITS.length, 8);
  for (const p of PLAYER_PORTRAITS) for (const src of [p.src, p.large]) assert.ok(existsSync(pub(src)), `missing ${src}`);
});

test('pickOpponents returns the requested number of distinct opponents', () => {
  for (let count = 0; count <= 5; count++) {
    for (let seed = 1; seed <= 50; seed++) {
      const picks = pickOpponents(count, { gameId: 'poker', rng: seeded(seed) });
      assert.equal(picks.length, count);
      assert.equal(new Set(picks.map((c) => c.id)).size, count, 'no one sits twice');
    }
  }
});

test('pickOpponents clamps silly counts', () => {
  assert.equal(pickOpponents(-2).length, 0);
  assert.equal(pickOpponents(undefined).length, 0);
  assert.equal(pickOpponents(99).length, CAST.length);
  assert.equal(pickOpponents(2.7).length, 2);
});

test('pickOpponents is deterministic for a given rng', () => {
  const a = pickOpponents(5, { gameId: 'bridge', rng: seeded(42) }).map((c) => c.id);
  const b = pickOpponents(5, { gameId: 'bridge', rng: seeded(42) }).map((c) => c.id);
  assert.deepEqual(a, b);
  const runs = new Set(Array.from({ length: 20 }, (_, i) => pickOpponents(3, { rng: seeded(i + 1) }).map((c) => c.id).join()));
  assert.ok(runs.size > 10, 'different seeds give different tables');
});

test('regulars turn up more often at their game, but not every time', () => {
  const rate = (id, gameId) => {
    let n = 0;
    for (let seed = 1; seed <= 2000; seed++) if (pickOpponents(1, { gameId, rng: seeded(seed) }).some((c) => c.id === id)) n++;
    return n / 2000;
  };
  const atCribbage = rate('captain', 'cribbage');
  const elsewhere = rate('captain', 'hearts');
  assert.ok(atCribbage > elsewhere * 1.5, `captain at cribbage ${atCribbage} vs elsewhere ${elsewhere}`);
  assert.ok(atCribbage < 0.5, 'a gentle preference, not a fixed seat');
});

test('seat names map to portraits; unknown names fall back to none', () => {
  assert.equal(castByName('Odette').id, 'odette');
  assert.equal(castByName('  colonel ').id, 'colonel');
  assert.equal(portraitFor('Rosa'), '/assets/art/cast/rosa-96.webp');
  for (const old of ['West', 'North', 'East', 'Northwest', '', null, undefined]) {
    assert.equal(castByName(old), null);
    assert.equal(portraitFor(old), '');
  }
  assert.equal(playerPortrait('player-03'), '/assets/art/cast/player-03-96.webp');
  assert.equal(playerPortrait(''), '');
  assert.equal(playerPortrait('../etc'), '');
});
