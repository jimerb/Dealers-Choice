// Casino catalog and game modules: every listed game has a module with the shared interface, and
// every layout draws (as an SVG string, no browser) with its key labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { CASINO, ALL_GAMES, TABLE_STAKES, MACHINE_STAKES, stakesFor, stakesById, stakesLabel, rackFor, gameById } from '../public/js/casino/catalog.js';
import { loadAll } from '../public/js/casino/games/index.js';
import { layout as rouletteLayout, areas, wheelHTML } from '../public/js/casino/games/roulette.js';
import { allArt, ART, TILE_IDS } from '../public/js/casino/art.js';

const MODULES = await loadAll();

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
  assert.deepEqual(rackFor(TABLE_STAKES[1]), [5, 25, 100, 500, 1000, 5000], 'up to the first chip at or above the max');
  assert.deepEqual(rackFor(TABLE_STAKES[2]), [25, 100, 500, 1000, 5000]);
  assert.deepEqual(rackFor(TABLE_STAKES[3]), [100, 500, 1000, 5000, 25000]);
  assert.deepEqual(rackFor(MACHINE_STAKES[2]), [25]);
});

test('every game has a tile colour, and Slots is the Brass Crown machine', () => {
  for (const g of ALL_GAMES) assert.match(g.felt, /^#[0-9A-F]{6}$/i, g.id);
  assert.equal(gameById('roulette').felt, '#6B2E2E');
  assert.equal(gameById('slots').subtitle, 'Brass Crown');
});

test('every chip on any rack has art', () => {
  for (const s of [...TABLE_STAKES, ...MACHINE_STAKES]) for (const c of rackFor(s)) assert.ok(existsSync(new URL(`../public/assets/art/tokens/chip-${c}.webp`, import.meta.url)), `chip-${c}`);
});

test('every game has a module with the shared interface', () => {
  const files = readdirSync(new URL('../public/js/casino/games/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'index.js');
  assert.equal(files.length, ALL_GAMES.length);
  for (const g of ALL_GAMES) {
    const m = MODULES[g.id];
    assert.ok(m, `${g.id} has a module`);
    assert.equal(m.id, g.id);
    assert.equal(m.name, g.name);
    for (const fn of ['mount', 'unmount', 'action', 'layout']) assert.equal(typeof m[fn], 'function', `${g.id}.${fn}`);
    for (const fn of ['clear', 'rebet', 'undo', 'minBuyIn', 'optionsChanged']) assert.ok(m[fn] === undefined || typeof m[fn] === 'function', `${g.id}.${fn} is optional`);
    assert.equal(typeof m.ready, 'boolean', `${g.id} says whether it is ready`);
    if (!m.ready) assert.ok(Array.isArray(m.todo) && m.todo.length, `${g.id} lists what is left to do`);
    if (typeof m.howto === 'string') assert.match(m.howto, /howto-section/, `${g.id} has How to play`);
    else assert.ok(m.howto?.goal && m.howto?.play, `${g.id} has How to play`);
    for (const s of m.settings ?? []) assert.ok(s.key && s.label && ['select', 'check'].includes(s.type) && 'default' in s, `${g.id} setting ${s.key}`);
    const svg = m.layout();
    assert.match(svg, /^<svg class="cz-svg/, `${g.id} draws an SVG layout`);
    assert.doesNotMatch(svg, /undefined|NaN/, `${g.id} layout has no undefined or NaN`);
  }
  assert.equal(MODULES.roulette.ready, true);
});

test('layouts carry their key labels as live text', () => {
  const has = (id, ...labels) => { const s = (MODULES[id].stage ?? MODULES[id].layout)(); for (const l of labels) assert.ok(s.includes(l), `${id}: ${l}`); };
  has('blackjack', 'BLACKJACK PAYS 3 TO 2', 'INSURANCE PAYS 2 TO 1');
  assert.equal((MODULES.blackjack.layout().match(/data-spot=/g) ?? []).length, 1, 'one player spot');
  has('craps', 'PASS LINE', 'DON&#39;T PASS BAR', 'COME', 'FIELD', 'SIX', 'NINE', 'Any craps', 'Hard 8');
  has('baccarat', 'PLAYER', 'BANKER', 'TIE PAYS 8 TO 1');
  has('three-card-poker', 'PAIR PLUS', 'ANTE', 'PLAY');
  has('let-it-ride', '>1<', '>2<', '>$<');
  has('caribbean-stud', 'ANTE', 'BET');
  has('pai-gow-poker', 'HIGH', 'LOW');
  has('video-poker', 'Royal flush', 'HOLD', 'CREDITS');
  has('slots', 'BRASS CROWN', 'Crown Crown Crown', 'Any one cherry', 'CREDITS');
  has('keno', '>80<', 'Ticket');
});

test('roulette on phones: 1, 2, 3 left to right, 0 left of 00, outside bets on the right', () => {
  const s = rouletteLayout({ tall: true });
  const x = (key) => Number(s.match(new RegExp(`data-bet="${key}"[^>]*>\\s*<rect x="([\\d.]+)"`))[1]);
  assert.ok(x('n:1') < x('n:2') && x('n:2') < x('n:3'));
  assert.ok(x('n:0') < x('n:00'));
  assert.ok(x('dozen:1') > x('n:3') && x('red') > x('dozen:1'));
});

test('roulette layout: 0, 00, 1-36, columns, dozens and even-money boxes, both ways round', () => {
  assert.equal(areas().length, 38 + 3 + 3 + 6);
  for (const tall of [false, true]) {
    const s = rouletteLayout({ tall, bets: { 'n:17': 25, red: 5000 }, hit: '17' });
    for (const n of ['0', '00', '1', '18', '36']) assert.ok(s.includes(`data-bet="n:${n}"`));
    for (const k of ['col:1', 'dozen:3', 'low', 'even', 'red', 'black', 'odd', 'high']) assert.ok(s.includes(`data-bet="${k}"`), k);
    assert.ok(s.includes('chip-25.webp'), 'a $25 stack shows the $25 chip');
    assert.ok(s.includes('chip-5000.webp'), 'a $5,000 stack shows the $5,000 chip');
    assert.ok(s.includes('class="cz-bet hit" data-bet="n:17"'), 'the last winning number is ringed');
  }
});


// Every picture the casino asks for is on disk: the art manifest, any literal asset path in the casino
// scripts or stylesheet, and every path that appears in a drawn layout.
const pub = (p) => new URL(`../public/${p}`, import.meta.url);
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(new URL(`${d.name}/`, dir)) : [new URL(d.name, dir)]));
}

test('every casino picture exists on disk', () => {
  const paths = new Set(allArt());
  for (const f of [...walk(pub('js/casino/')), pub('css/casino.css')]) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/assets\/art\/[\w./-]+\.webp/g)) paths.add(m[0]);
    assert.doesNotMatch(src.replace(/\$\{DIR\}/g, ''), /assets\/art\/casino\/[\w./-]*\$\{/, `${f.pathname}: build casino art paths with art.js`);
  }
  for (const m of Object.values(MODULES)) {
    const s = (m.stage ?? m.layout)();
    for (const h of s.matchAll(/href="(assets\/[^"]+)"/g)) paths.add(h[1]);
  }
  for (const h of wheelHTML().matchAll(/src="(assets\/[^"]+)"/g)) paths.add(h[1]);
  assert.ok(paths.size >= 56, `found ${paths.size} paths`);
  for (const p of paths) assert.ok(existsSync(pub(p)), `${p} exists`);
  assert.deepEqual(TILE_IDS, ALL_GAMES.map((g) => g.id), 'a chooser tile for every game');
});

test('tables are dressed with the casino art over code-drawn stand-ins', () => {
  for (const id of ['blackjack', 'baccarat', 'three-card-poker', 'let-it-ride', 'caribbean-stud', 'pai-gow-poker']) {
    const s = MODULES[id].layout();
    for (const p of [ART.crest, ART.shoe, ART.tray, ART.rail]) assert.ok(s.includes(p), `${id} uses ${p}`);
    assert.ok(s.includes(`>${MODULES[id].name.toUpperCase()}<`), `${id} writes its name in the crest`);
    assert.match(s, /class="cz-fb"/, `${id} keeps stand-ins`);
  }
  const craps = MODULES.craps.layout();
  for (const p of [ART.die(6), ART.puck(false), ART.tumble(1)]) assert.ok(craps.includes(p), p);
  assert.ok(MODULES.slots.layout().includes(ART.slotCabinet) && MODULES.video_poker === undefined);
  assert.ok(MODULES['video-poker'].layout().includes(ART.vpCabinet));
  assert.ok(MODULES.keno.stage().includes(ART.kenoBlower));
  const w = wheelHTML();
  for (const p of [ART.bowl, ART.rotor, ART.ball]) assert.ok(w.includes(p), p);
  assert.equal((w.match(/data-pocket=/g) ?? []).length, 38, 'the code draws all 38 pockets');
});

test('the casino code and the game guide stay in our own words', () => {
  const files = [...walk(pub('js/casino/')), pub('css/casino.css'), pub('casino.html'), pub('js/core/bank.js')];
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /hoyle|sierra|reverse.engineer|decomp/i, f.pathname);
  assert.ok(existsSync(pub('js/casino/GAMES.md')), 'the guide for game authors is there');
});
