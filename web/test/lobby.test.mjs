// The lobby and the card games page: every featured game exists in its room's catalog and has its
// art, and every page the lobby and the main nav link to is there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { GAMES, SOLITAIRE } from '../public/js/catalog.js';
import { ALL_GAMES } from '../public/js/casino/catalog.js';

const pub = new URL('../public/', import.meta.url);
const src = (p) => readFileSync(new URL(p, pub), 'utf8');
const listed = (name) => {
  const m = src('js/lobby.js').match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${name} in lobby.js`);
  return m[1];
};

test('featured card games are ready to play and have tile art', () => {
  const ids = [...listed('FEATURED_GAMES').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 3);
  for (const id of ids) {
    const g = GAMES.find((x) => x.id === id);
    assert.ok(g, id);
    assert.equal(g.status, 'ready', id);
    assert.ok(existsSync(new URL(`assets/art/lobby/tile-${id}.webp`, pub)), id);
  }
});

test('featured solitaires are layouts in the parlor', () => {
  const layouts = new Set(SOLITAIRE.flatMap((c) => c.games.map(([, id]) => id)));
  const ids = [...listed('FEATURED_SOLITAIRE').matchAll(/\['([a-z0-9]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 3);
  for (const id of ids) assert.ok(layouts.has(id), id);
});

test('featured casino games are in the casino and have chooser art', () => {
  const ids = [...listed('FEATURED_CASINO').matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length >= 3);
  for (const id of ids) {
    assert.ok(ALL_GAMES.some((g) => g.id === id), id);
    assert.ok(existsSync(new URL(`assets/art/casino/chooser/tile-${id}.webp`, pub)), id);
  }
});

test('the nav and the lobby link to pages that exist', () => {
  const pages = new Set();
  for (const file of ['js/header.js', 'js/lobby.js', 'lobby.html', 'games.html']) {
    for (const m of src(file).matchAll(/href[=:]\s*['"`]([a-z-]+\.html)/g)) pages.add(m[1]);
  }
  for (const p of ['games.html', 'solitaire.html', 'casino.html', 'lobby.html']) assert.ok(pages.has(p), p);
  for (const p of pages) assert.ok(existsSync(new URL(p, pub)), p);
  assert.match(src('js/header.js'), /\['games', 'games\.html', 'Card games'\]/);
});

test('the lobby keeps the old section anchors', () => {
  const html = src('lobby.html');
  for (const id of ['games', 'solitaire', 'casino']) assert.match(html, new RegExp(`id="${id}"`), id);
});

test('the lobby only reads the casino bank', () => {
  const js = src('js/lobby.js');
  assert.doesNotMatch(js, /setItem|removeItem|getBank|createBank/);
});
