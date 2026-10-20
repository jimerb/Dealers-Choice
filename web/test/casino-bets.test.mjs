// Staged chips: limits at placement, undo, minimums at commit, partial-fit rebet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStaging } from '../public/js/casino/kit/bets.js';

const table = (bank = 5000, extra = {}) => createStaging({
  spot: (k) => (['ante', 'play', 'pairplus'].includes(k) ? { label: k[0].toUpperCase() + k.slice(1), ...(k === 'pairplus' ? { max: 100 } : {}) } : null),
  limits: { min: 5, max: 1000 }, available: () => bank, ...extra,
});

test('placing chips: open spots only, within the bank and the spot maximum', () => {
  const st = table(60);
  assert.deepEqual(st.place('ante', 25), { ok: true, amount: 25 });
  assert.equal(st.place('nowhere', 5).ok, false);
  assert.match(st.place('pairplus', 500).error, /Table max is \$100 on Pairplus/);
  assert.match(st.place('ante', 50).error, /Not enough in the bank/);
  st.place('play', 25);
  assert.equal(st.total(), 50);
  assert.deepEqual(st.amounts(), { ante: 25, play: 25 });
});

test('remove, undo and clear', () => {
  const st = table();
  st.place('ante', 25); st.place('ante', 5); st.remove('ante', 25);
  assert.equal(st.amount('ante'), 5);
  st.undo();
  assert.equal(st.amount('ante'), 30);
  st.undo();
  assert.equal(st.amount('ante'), 25);
  st.clear();
  assert.equal(st.empty, true);
  assert.equal(st.undo(), null);
});

test('minimum checked at commit, or the game\'s own rule', () => {
  const st = table();
  st.place('ante', 1);
  assert.deepEqual(st.check(), { key: 'ante', min: 5, label: 'Ante', error: 'Your bet on Ante doesn\'t cover the $5 minimum.' });
  st.place('ante', 4);
  assert.equal(st.check(), null);
  const own = table(5000, { validate: (b) => (b.play && !b.ante ? 'Play needs an Ante.' : null) });
  own.place('play', 5);
  assert.deepEqual(own.check(), { error: 'Play needs an Ante.' });
});

test('locked while a round plays', () => {
  const st = table();
  st.place('ante', 5);
  st.lock();
  assert.equal(st.place('ante', 5).ok, false);
  assert.equal(st.clear(), false);
  st.lock(false);
  assert.equal(st.clear(), true);
});

test('rebet fits as much as the bank allows, in the order placed, and doubles', () => {
  const saved = [{ spot: 'ante', amount: 50 }, { spot: 'pairplus', amount: 60 }];
  const rich = table();
  assert.deepEqual(rich.rebet(saved), { placed: 110, short: false });
  assert.deepEqual(rich.rebet(saved, 2), { placed: 200, short: true }, 'pair plus is capped at its $100 max');
  assert.deepEqual(rich.amounts(), { ante: 100, pairplus: 100 });
  const poor = table(80);
  assert.deepEqual(poor.rebet(saved), { placed: 80, short: true });
  assert.deepEqual(poor.amounts(), { ante: 50, pairplus: 30 });
});

test('cost: one stack of chips that goes out three times (Let It Ride), and a side bet that is not a chip', () => {
  let bank = 100;
  const st = createStaging({ available: () => bank, cost: (a) => 3 * (a.base ?? 0) });
  assert.equal(st.place('base', 25).ok, true);
  assert.equal(st.total(), 25, 'the staged chips');
  assert.equal(st.cost(), 75, 'what Deal takes');
  const r = st.place('base', 25);
  assert.equal(r.ok, false, '$150 is more than the bank');
  assert.match(r.error, /Not enough/);
  // Rebet fits as much as the bank covers at three times
  const back = st.rebet([{ spot: 'base', amount: 40 }]);
  assert.deepEqual(back, { placed: 33, short: true });
  assert.equal(st.cost(), 99);
  bank = 1000;
  assert.deepEqual(st.rebet([{ spot: 'base', amount: 40 }], 2), { placed: 80, short: false });
  const side = createStaging({ available: () => 6, cost: (a) => (a.ante ?? 0) + (a.ante ? 1 : 0) });
  assert.equal(side.place('ante', 5).ok, true);
  assert.equal(side.cost(), 6);
  assert.equal(side.costOf({ ante: 10 }), 11);
  assert.equal(side.place('ante', 5).ok, false);
});
