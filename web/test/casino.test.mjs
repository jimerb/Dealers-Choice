// Casino catalog and game modules: every listed game has a module with the shared interface, and
// every layout draws (as an SVG string, no browser) with its key labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { CASINO, ALL_GAMES, TABLE_STAKES, MACHINE_STAKES, stakesFor, stakesById, stakesLabel, rackFor, gameById } from '../public/js/casino/catalog.js';
import { MODULES } from '../public/js/casino/games/index.js';
import { layout as rouletteLayout, areas } from '../public/js/casino/games/roulette.js';

test('the chooser groups the eleven games in build order', () => {
  assert.deepEqual(CASINO.map((g) => g.title), ['Table games', 'Machines', 'Lounge']);
  assert.deepEqual(ALL_GAMES.map((g) => g.id), ['blackjack', 'roulette', 'craps', 'baccarat', 'three-card-poker', 'let-it-ride',
    'caribbean-stud', 'pai-gow-poker', 'video-poker', 'slots', 'keno']);
  assert.equal(gameById('nope'), null);
});

test('stakes: four table limits, three machine denominations', () => {
  assert.deepEqual(TABLE_STAKES.map(stakesLabel), ['$5–$1,000', '$10–$2,000', '$25–$3,000', '$100–no limit']);
  assert.deepEqual(MACHINE_STAKES.map((s) => s.denom), [1, 5, 25]);
  assert.equal(stakesFor(gameById('slots')), MACHINE_STAKES);
  assert.equal(stakesFor(gameById('craps')), TABLE_STAKES);
  assert.equal(stakesById(gameById('craps'), 'bogus').id, '5', 'unknown stakes fall back to the lowest');
  assert.equal(stakesById(gameById('craps'), 25).min, 25);
});

test('the chip rack fits the table limits', () => {
  assert.deepEqual(rackFor(TABLE_STAKES[0]), [5, 25, 100, 500, 1000]);
  assert.deepEqual(rackFor(TABLE_STAKES[1]), [5, 25, 100, 500, 1000]);
  assert.deepEqual(rackFor(TABLE_STAKES[2]), [25, 100, 500, 1000]);
  assert.deepEqual(rackFor(TABLE_STAKES[3]), [100, 500, 1000, 5000, 25000]);
  assert.deepEqual(rackFor(MACHINE_STAKES[2]), [25]);
});

test('every game has a module with the shared interface', () => {
  const files = readdirSync(new URL('../public/js/casino/games/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'index.js');
  assert.equal(files.length, ALL_GAMES.length);
  for (const g of ALL_GAMES) {
    const m = MODULES[g.id];
    assert.ok(m, `${g.id} has a module`);
    assert.equal(m.id, g.id);
    assert.equal(m.name, g.name);
    for (const fn of ['mount', 'unmount', 'action', 'clear', 'rebet', 'layout']) assert.equal(typeof m[fn], 'function', `${g.id}.${fn}`);
    assert.ok(Array.isArray(m.todo) && m.todo.length, `${g.id} lists what is left to do`);
    assert.match(m.howto, /howto-section/, `${g.id} has How to play`);
    const svg = m.layout();
    assert.match(svg, /^<svg class="cz-svg/, `${g.id} draws an SVG layout`);
    assert.doesNotMatch(svg, /undefined|NaN/, `${g.id} layout has no undefined or NaN`);
  }
  assert.equal(MODULES.roulette.ready, true);
});

test('layouts carry their key labels as live text', () => {
  const has = (id, ...labels) => { const s = MODULES[id].layout(); for (const l of labels) assert.ok(s.includes(l), `${id}: ${l}`); };
  has('blackjack', 'BLACKJACK PAYS 3 TO 2', 'INSURANCE PAYS 2 TO 1');
  has('craps', 'PASS LINE', 'DON&#39;T PASS BAR', 'COME', 'FIELD', 'SIX', 'NINE', 'Any craps', 'Hard 8');
  has('baccarat', 'PLAYER', 'BANKER', 'TIE PAYS 8 TO 1');
  has('three-card-poker', 'PAIR PLUS', 'ANTE', 'PLAY');
  has('let-it-ride', '>1<', '>2<', '>$<');
  has('caribbean-stud', 'ANTE', 'BET');
  has('pai-gow-poker', 'HIGH', 'LOW');
  has('video-poker', 'Royal flush', 'HOLD', 'CREDITS');
  has('slots', 'PAYS', 'CREDITS');
  has('keno', '>80<', 'Ticket');
});

test('roulette layout: 0, 00, 1-36, columns, dozens and even-money boxes, both ways round', () => {
  assert.equal(areas().length, 38 + 3 + 3 + 6);
  for (const tall of [false, true]) {
    const s = rouletteLayout({ tall, bets: { 'n:17': 25, red: 5000 }, hit: '17' });
    for (const n of ['0', '00', '1', '18', '36']) assert.ok(s.includes(`data-bet="n:${n}"`));
    for (const k of ['col:1', 'dozen:3', 'low', 'even', 'red', 'black', 'odd', 'high']) assert.ok(s.includes(`data-bet="${k}"`), k);
    assert.ok(s.includes('chip-25.webp'), 'a $25 stack shows the $25 chip');
    assert.ok(s.includes('cz-chip-ph ph-5000'), 'a $5,000 stack shows the placeholder chip');
    assert.ok(s.includes('class="cz-bet hit" data-bet="n:17"'), 'the last winning number is ringed');
  }
});

