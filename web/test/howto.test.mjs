// How to play: every card game (and every Pinochle variant) has a complete guide with mouse and
// touch controls, and its Options section explains every setting the game offers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { howtoHTML, sectionsHTML, controlsOf, SECTIONS } from '../public/js/core/howto.js';
import { HOWTO, pinochleHowtoHTML } from '../public/js/games/pinochle/howto.js';
import { VARIANT_IDS } from '../public/js/games/pinochle/engine.js';
import { GAMES } from '../public/js/catalog.js';

const dir = new URL('../public/js/games/', import.meta.url);
const TITLES = [...Object.values(SECTIONS), 'With a mouse', 'On a touch screen'];

/** The checks every guide must pass; settings are the game's options (none for Pinochle). */
function checkGuide(name, h, settings = []) {
  assert.ok(h && typeof h === 'object', `${name} needs a howto guide`);
  for (const key of ['goal', 'deal', 'score']) assert.ok([h[key]].flat().join('').length >= 20, `${name}: guide needs ${key}`);
  assert.ok(Array.isArray(h.play) && h.play.length >= 3 && h.play.every((t) => typeof t === 'string' && t.length > 10), `${name}: guide needs play bullets`);
  assert.ok(typeof h.tip === 'string' && h.tip.length > 10, `${name}: guide needs a tip`);
  const c = controlsOf(h);
  assert.match(c.mouse, /\bclick/i, `${name}: mouse controls should say click`);
  assert.match(c.touch, /\btap/i, `${name}: touch controls should say tap`);
  assert.doesNotMatch(c.touch, /click/i, `${name}: touch controls mention clicking`);
  if (settings.length) {
    const keys = settings.map((s) => s.key);
    assert.deepEqual(Object.keys(h.options).sort(), keys.slice().sort(), `${name}: options should explain exactly the settings`);
    for (const k of keys) assert.ok(typeof h.options[k] === 'string' && h.options[k].length >= 15, `${name}: option ${k} needs an explanation`);
  } else assert.ok(typeof h.options === 'string' && h.options.length >= 15, `${name}: options needs a sentence`);
  const html = sectionsHTML(h, settings);
  for (const t of TITLES) assert.ok(html.includes(`>${t}<`), `${name}: missing "${t}"`);
  const opts = html.slice(html.indexOf('>Options<'), html.indexOf('>Controls<'));
  for (const s of settings) assert.ok(opts.includes(s.label), `${name}: Options doesn't mention "${s.label}"`);
  assert.doesNotMatch(html, /[{}]|undefined/, `${name}: unfilled text`);
  return html;
}

test('every table game has a full How to play guide', async () => {
  const mods = GAMES.filter((g) => g.module && g.id !== 'pinochle');
  assert.equal(mods.length, 16);
  for (const g of mods) {
    const game = (await import(new URL(`${g.module}.js`, dir))).default;
    checkGuide(game.id, game.howto, game.settings);
    assert.equal(howtoHTML(game), sectionsHTML(game.howto, game.settings));
  }
});

test('every Pinochle variant has a full guide, and the current one comes first and open', () => {
  assert.deepEqual(Object.keys(HOWTO).sort(), VARIANT_IDS.slice().sort());
  for (const id of VARIANT_IDS) {
    checkGuide(`pinochle ${id}`, HOWTO[id]);
    const html = pinochleHowtoHTML(id);
    const first = html.match(/<details class="howto-variant" data-v="([^"]+)"( open)?/);
    assert.deepEqual([first[1], first[2]], [id, ' open'], `pinochle ${id} should open first`);
    assert.equal((html.match(/ open>/g) ?? []).length, 1, 'only the current variant starts open');
    for (const other of VARIANT_IDS) assert.ok(html.includes(`data-v="${other}"`), `pinochle ${id}: missing ${other}`);
    assert.ok(html.includes('>Meld values<'));
  }
});
