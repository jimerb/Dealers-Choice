// Plays complete AI-only games of every table game (the AI also plays seat 0) and renders each view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const dir = new URL('../public/js/games/', import.meta.url);
const modules = readdirSync(dir).filter((f) => f.endsWith('.js'));
const SEEDS = Number(process.env.SEEDS || 12);

// Seats sit at distinct, known positions and every score chip has a value (no "Northeast undefined").
function checkView(file, vm) {
  const pos = vm.seats.map((st) => st.pos);
  assert.ok(pos.every((p) => POSITIONS.has(p)), `${file}: bad seat position in ${pos}`);
  assert.equal(new Set(pos).size, pos.length, `${file}: duplicate seat position in ${pos}`);
  for (const sc of vm.scores ?? []) assert.ok(sc.value !== undefined && sc.label !== undefined, `${file}: score chip ${sc.label} has no value`);
  if (vm.scores?.length && vm.seats.length > 1) assert.ok(vm.scores.length <= vm.seats.length, `${file}: ${vm.scores.length} score chips for ${vm.seats.length} seats`);
}
const POSITIONS = new Set(['south', 'west', 'nw', 'north', 'ne', 'east']);

test('posFor seats 2-6 players around the table', async () => {
  const { posFor } = await import(new URL('lib/common.js', dir));
  const at = (n) => Array.from({ length: n }, (_, i) => posFor(n, i));
  assert.deepEqual(at(2), ['south', 'north']);
  assert.deepEqual(at(3), ['south', 'west', 'east']);
  assert.deepEqual(at(4), ['south', 'west', 'north', 'east']);
  assert.deepEqual(at(5), ['south', 'west', 'nw', 'ne', 'east']);
  assert.deepEqual(at(6), ['south', 'west', 'nw', 'north', 'ne', 'east']);
});

for (const file of modules) {
  test(`${file}: AI-only games finish with legal moves`, async () => {
    const game = (await import(new URL(file, dir))).default;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const opts = Object.fromEntries((game.settings ?? []).map((s) => [s.key, s.default]));
      let s = game.newGame({ names: ['You', 'West', 'North', 'East', 'Northwest', 'Northeast'], seed, opts });
      let steps = 0;
      const ui = { selected: new Set() };
      while (game.actor(s) !== null) {
        checkView(file, game.view(s, ui));
        s = game.aiAct(s);
        s.fx = [];
        assert.ok(++steps < 40000, `${file} seed ${seed}: game did not finish (phase ${s.phase})`);
      }
      game.view(s, ui);
      JSON.parse(JSON.stringify(s)); // state stays serializable
    }
  });
}

// Computer players are named from the seat names passed in, never by compass seat words.
const SEAT_WORDS = /\b(North|South|West|East|Northwest|Northeast|undefined)\b/;
for (const file of modules) {
  test(`${file}: players are called by their names`, async () => {
    const game = (await import(new URL(file, dir))).default;
    const names = ['Jo', 'Mabel', 'Dex', 'Rosa', 'Hank', 'Pip'];
    for (let seed = 1; seed <= 3; seed++) {
      // Last option of each setting: the most players (and Memory's two-player race).
      const opts = Object.fromEntries((game.settings ?? []).map((s) => [s.key, s.options.at(-1)[0]]));
      if (game.id === 'memory') opts.mode = 'two';
      let s = game.newGame({ names, seed, opts });
      const ui = { selected: new Set() };
      for (let steps = 0; game.actor(s) !== null && steps < 40000; steps++) {
        const vm = game.view(s, ui);
        const text = JSON.stringify({ ...vm, seats: vm.seats.map(({ pos, ...st }) => st) });
        assert.ok(!SEAT_WORDS.test(text), `${file}: seat word in view: ${text.match(SEAT_WORDS)?.[0]} (${s.phase})`);
        s = game.aiAct(s);
        s.fx = [];
      }
      const vm = game.view(s, ui);
      assert.ok(!SEAT_WORDS.test(JSON.stringify(vm.overlay ?? '')), `${file}: seat word in final overlay`);
      for (const line of s.log ?? []) assert.ok(!SEAT_WORDS.test(line), `${file}: seat word in log: ${line}`);
      if (game.seats) assert.deepEqual(s.names, names.slice(0, game.seats));
      // 'Play again' keeps the same table.
      if (/data-act="again"/.test(vm.overlay ?? '')) assert.deepEqual(game.act(s, { act: 'again' }).names, s.names);
    }
  });
}
