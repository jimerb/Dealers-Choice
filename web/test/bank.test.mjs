// The casino bank: start, credit/debit, loans and auto-repay, tier upgrades, Hall of Fame, stats,
// storage (versioned JSON, broken storage, other tabs) and listeners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KEY, START, TIERS, HALL_OF_FAME_AT, freshState, normalize, applyChange, takeLoanState, resetState,
  recordHandState, loanEligible, loanAmount, createBank, money,
} from '../public/js/core/bank.js';

const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
};
const at = (over) => ({ ...freshState(), ...over });

test('a new bank starts with $5,000 on Brass, no loan, versioned', () => {
  const s = freshState();
  assert.deepEqual(s, { v: 1, bank: START, tier: 0, loan: 0, stats: {}, hall: [] });
  assert.equal(START, 5000);
  assert.deepEqual(TIERS.map((t) => t.name), ['Brass', 'Silver', 'Gold', 'Emerald', 'Sapphire', 'Onyx']);
});

test('credit and debit change the bank by whole dollars only', () => {
  assert.equal(applyChange(freshState(), 250).state.bank, 5250);
  assert.equal(applyChange(freshState(), -5000).state.bank, 0);
  assert.throws(() => applyChange(freshState(), -5001), RangeError);
  assert.throws(() => applyChange(freshState(), 2.5), RangeError);
  assert.throws(() => applyChange(freshState(), NaN), RangeError);
});

test('tiers upgrade at $10K / $50K / $100K / $1M / $100M', () => {
  const thresholds = [10_000, 50_000, 100_000, 1_000_000, 100_000_000];
  thresholds.forEach((amt, tier) => {
    const just = applyChange(at({ tier, bank: amt - 1 }), 0).state;
    assert.equal(just.tier, tier, `stays below ${amt}`);
    const { state, events } = applyChange(at({ tier, bank: amt - 1 }), 1);
    assert.equal(state.tier, tier + 1, `upgrades at ${amt}`);
    assert.deepEqual(events, [{ type: 'upgrade', from: tier, to: tier + 1 }]);
  });
});

test('a big win can skip several tiers at once', () => {
  const { state, events } = applyChange(freshState(), 2_000_000);
  assert.equal(state.tier, 4); // past $1M: Sapphire
  assert.deepEqual(events, [{ type: 'upgrade', from: 0, to: 4 }]);
});

test('tiers never go down when the bank falls', () => {
  assert.equal(applyChange(at({ tier: 3, bank: 2_000_000 }), -1_999_000).state.tier, 3);
});

test('reaching $1 billion on Onyx enters the Hall of Fame and starts over', () => {
  const { state, events } = applyChange(at({ tier: 5, bank: HALL_OF_FAME_AT - 10, stats: { roulette: { hands: 1, wagered: 1, won: 0, net: -1, biggest: 0 } } }), 10, { name: 'Ada', now: Date.UTC(2026, 9, 18) });
  assert.equal(events.at(-1).type, 'hall');
  assert.deepEqual(state.hall, [{ name: 'Ada', date: '2026-10-18', bank: HALL_OF_FAME_AT }]);
  assert.equal(state.bank, START);
  assert.equal(state.tier, 0);
  assert.deepEqual(state.stats, {});
});

test('a single huge win from Brass climbs every tier into the Hall of Fame', () => {
  const { state, events } = applyChange(freshState(), HALL_OF_FAME_AT);
  assert.deepEqual(events.map((e) => e.type), ['upgrade', 'hall']);
  assert.equal(state.bank, START);
  assert.equal(state.hall.length, 1);
});

test('loans: only under $1,000 with no loan outstanding', () => {
  assert.equal(loanEligible(at({ bank: 999 })), true);
  assert.equal(loanEligible(at({ bank: 1000 })), false);
  assert.equal(loanEligible(at({ bank: 0, loan: 2500 })), false);
  const same = at({ bank: 1500 });
  assert.equal(takeLoanState(same).state, same);
});

test('loan amounts by tier: $2,500 / $5,000 / $10,000 / $50,000 / $100,000 / $1,000,000', () => {
  assert.deepEqual(TIERS.map((_, tier) => loanAmount(at({ tier }))), [2_500, 5_000, 10_000, 50_000, 100_000, 1_000_000]);
  const { state, events } = takeLoanState(at({ tier: 2, bank: 40 }));
  assert.equal(state.bank, 10_040);
  assert.equal(state.loan, 10_000);
  assert.equal(events[0].type, 'loan');
  assert.equal(state.tier, 2, 'a loan never upgrades the tier');
});

test('upgrades are blocked while a loan is outstanding', () => {
  const { state, events } = applyChange(at({ bank: 0, loan: 2_500 }), 9_000);
  assert.equal(state.tier, 0);
  assert.equal(state.loan, 2_500);
  assert.deepEqual(events, []);
});

test('a loan is repaid automatically at the next tier threshold, then the tier may upgrade', () => {
  // Brass, $2,500 loan: at $10,000 the loan is repaid; $7,500 left is not enough to upgrade.
  let r = applyChange(at({ bank: 9_000, loan: 2_500 }), 1_000);
  assert.deepEqual(r.events, [{ type: 'repaid', amount: 2_500 }]);
  assert.equal(r.state.bank, 7_500);
  assert.equal(r.state.loan, 0);
  assert.equal(r.state.tier, 0);
  // A bigger win repays and upgrades in the same change.
  r = applyChange(at({ bank: 9_000, loan: 2_500 }), 10_000);
  assert.deepEqual(r.events, [{ type: 'repaid', amount: 2_500 }, { type: 'upgrade', from: 0, to: 1 }]);
  assert.equal(r.state.bank, 16_500);
});

test('the loan is not repaid until the bank also covers it', () => {
  // A hand-made state whose loan is bigger than the next threshold: past $10,000 but under the loan.
  const r = applyChange(at({ bank: 0, loan: 20_000 }), 15_000);
  assert.equal(r.state.loan, 20_000);
  assert.equal(r.state.bank, 15_000);
});

test('reset: back to $5,000 on Brass, loan and stats cleared, Hall of Fame kept', () => {
  const hall = [{ name: 'Ada', date: '2026-01-01', bank: HALL_OF_FAME_AT }];
  const { state } = resetState(at({ bank: 12, tier: 3, loan: 50_000, stats: { keno: { hands: 3 } }, hall }));
  assert.deepEqual(state, { v: 1, bank: 5000, tier: 0, loan: 0, stats: {}, hall });
});

test('per-game stats: hands, wagered, won, net and biggest win', () => {
  let s = applyChange(freshState(), -100, { game: 'roulette' }).state;
  s = applyChange(s, 300, { game: 'roulette' }).state;
  s = recordHandState(s, 'roulette', 200);
  s = applyChange(s, -50, { game: 'roulette' }).state;
  s = recordHandState(s, 'roulette', -50);
  assert.deepEqual(s.stats.roulette, { hands: 2, wagered: 150, won: 300, net: 150, biggest: 200 });
  assert.equal(applyChange(s, 10).state.stats.roulette.won, 300, 'money with no game leaves stats alone');
});

test('normalize: wrong version or junk starts fresh, good data survives', () => {
  assert.deepEqual(normalize(null), freshState());
  assert.deepEqual(normalize({ v: 2, bank: 9 }), freshState());
  assert.deepEqual(normalize({ v: 1, bank: -4 }), freshState());
  assert.deepEqual(normalize({ v: 1, bank: 1.5 }), freshState());
  const ok = normalize({ v: 1, bank: 777, tier: 99, loan: 'x', stats: { bj: { hands: 2, wagered: 'no' }, bad: 4 } });
  assert.equal(ok.bank, 777);
  assert.equal(ok.tier, 5);
  assert.equal(ok.loan, 0);
  assert.deepEqual(ok.stats, { bj: { hands: 2, wagered: 0, won: 0, net: 0, biggest: 0 } });
});

test('createBank saves to dc.bank and reads it back', () => {
  const storage = memStorage();
  const b = createBank({ storage, win: null });
  assert.equal(b.balance, 5000);
  assert.equal(b.debit(100, { game: 'roulette' }), true);
  assert.equal(b.credit(350, { game: 'roulette' }), true);
  b.recordHand('roulette', 250);
  const saved = JSON.parse(storage.map.get(KEY));
  assert.equal(saved.v, 1);
  assert.equal(saved.bank, 5250);
  const again = createBank({ storage, win: null });
  assert.equal(again.balance, 5250);
  assert.deepEqual(again.get().stats.roulette, { hands: 1, wagered: 100, won: 350, net: 250, biggest: 250 });
  assert.equal(b.sessionNet, 250);
});

test('createBank refuses overdrafts and bad amounts without changing anything', () => {
  const b = createBank({ storage: memStorage(), win: null });
  assert.equal(b.debit(5001), false);
  assert.equal(b.debit(-5), false);
  assert.equal(b.debit(1.5), false);
  assert.equal(b.credit(-1), false);
  assert.equal(b.balance, 5000);
  assert.equal(b.canAfford(5000), true);
  assert.equal(b.canAfford(5001), false);
});

test('createBank works in memory when storage throws', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const b = createBank({ storage: broken, win: null });
  assert.equal(b.balance, 5000);
  b.debit(4500);
  assert.equal(b.balance, 500);
  assert.equal(b.loanEligible(), true);
  assert.equal(b.takeLoan(), true);
  assert.equal(b.balance, 3000);
  assert.equal(b.get().loan, 2500);
  assert.equal(b.takeLoan(), false, 'one loan at a time');
  const none = createBank({ storage: null, win: null });
  assert.equal(none.balance, 5000);
});

test('createBank ignores unreadable saved data', () => {
  const b = createBank({ storage: memStorage({ [KEY]: '{not json' }), win: null });
  assert.equal(b.balance, 5000);
});

test('listeners hear every change with its events, and can unsubscribe', () => {
  const b = createBank({ storage: memStorage(), win: null });
  const heard = [];
  const off = b.subscribe((s, events) => heard.push([s.bank, events.map((e) => e.type)]));
  b.credit(5000); // $10,000: Silver
  b.debit(9500);
  b.takeLoan();
  off();
  b.credit(1);
  assert.deepEqual(heard, [[10000, ['upgrade']], [500, []], [5500, ['loan']]]);
  assert.equal(b.tier.name, 'Silver');
  assert.equal(b.get().loan, 5000);
});

test('reset through the bank also clears the session net', () => {
  const b = createBank({ storage: memStorage(), win: null });
  b.debit(4000, { game: 'roulette' });
  b.reset();
  assert.equal(b.balance, 5000);
  assert.equal(b.sessionNet, 0);
});

test('a change in another tab (storage event) is picked up and announced', () => {
  const handlers = {};
  const win = { addEventListener: (type, fn) => { handlers[type] = fn; } };
  const storage = memStorage();
  const b = createBank({ storage, win });
  const heard = [];
  b.subscribe((s, ev) => heard.push([s.bank, ev[0].type]));
  storage.setItem(KEY, JSON.stringify({ ...freshState(), bank: 123 }));
  handlers.storage({ key: 'dc.name' });
  handlers.storage({ key: KEY });
  assert.equal(b.balance, 123);
  assert.deepEqual(heard, [[123, 'sync']]);
});

test('money formats whole dollars', () => {
  assert.equal(money(5000), '$5,000');
  assert.equal(money(0), '$0');
  assert.equal(money(-25), '−$25');
});
