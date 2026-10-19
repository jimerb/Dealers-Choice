// The shared money rules for a round (debit at commit, settle at once, leave = forfeit) and the
// machine credit meter, against a real bank in memory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBank, KEY, HALL_OF_FAME_AT, normalize, MAX_CREDITS } from '../public/js/core/bank.js';
import { createRound, createMachine } from '../public/js/casino/kit/round.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
const newBank = (init) => {
  const storage = memStorage();
  if (init) storage.setItem(KEY, JSON.stringify({ v: 1, stats: {}, hall: [], tier: 0, loan: 0, ...init }));
  return createBank({ storage, win: null });
};

test('a round: wager at commit, settle pays at once and records one hand', () => {
  const bank = newBank();
  const r = createRound(bank, 'blackjack');
  assert.equal(r.wager(10), true);
  assert.equal(r.wager(10), true, 'a double');
  assert.equal(bank.balance, 4980);
  assert.equal(r.onTable, 20);
  assert.deepEqual(r.settle({ returned: 40 }), { wagered: 20, returned: 40, net: 20 });
  assert.equal(bank.balance, 5020);
  assert.equal(r.onTable, 0);
  assert.deepEqual(bank.get().stats.blackjack, { hands: 1, wagered: 20, won: 40, net: 20, biggest: 20 });
  assert.equal(bank.sessionNet, 20);
});

test('a wager the bank cannot cover changes nothing', () => {
  const bank = newBank({ bank: 50 });
  const r = createRound(bank, 'baccarat');
  assert.equal(r.wager(60), false);
  assert.equal(r.wager(2.5), false);
  assert.equal(bank.balance, 50);
  assert.equal(r.onTable, 0);
});

test('refund: a bet taken back comes off the wagered total', () => {
  const bank = newBank();
  const r = createRound(bank, 'let-it-ride');
  r.wager(30);
  r.refund(10);
  r.refund(10);
  r.settle({ returned: 0 });
  assert.equal(bank.balance, 4990);
  assert.deepEqual(bank.get().stats['let-it-ride'], { hands: 1, wagered: 10, won: 0, net: -10, biggest: 0 });
});

test('settling part of the table (craps): only the decided bets', () => {
  const bank = newBank();
  const r = createRound(bank, 'craps');
  r.wager(10, { returnable: false }); // pass line
  r.wager(12, { returnable: true });  // place 6
  r.settle({ returned: 26, wagered: 12, returnable: 0 }); // the 6 rolled: place bet paid 7:6 and taken down
  assert.equal(r.onTable, 10);
  assert.equal(r.returnable, 0);
  assert.equal(bank.balance, 5000 - 22 + 26);
});

test('leaving mid-round hands back returnable bets and forfeits the rest as one lost hand', () => {
  const bank = newBank();
  const r = createRound(bank, 'craps');
  r.wager(10);
  r.wager(30, { returnable: true });
  assert.equal(r.atRisk, 10);
  assert.deepEqual(r.leave(), { back: 30, lost: 10 });
  assert.equal(bank.balance, 4990);
  assert.deepEqual(bank.get().stats.craps, { hands: 1, wagered: 10, won: 0, net: -10, biggest: 0 });
  assert.equal(r.onTable, 0);
});

test('apply: an engine step\'s cash events, all debits checked first', () => {
  const bank = newBank({ bank: 100 });
  const r = createRound(bank, 'three-card-poker');
  assert.equal(r.apply({ cash: [{ kind: 'stake', amount: 60 }, { kind: 'stake', amount: 60 }] }).ok, false);
  assert.equal(bank.balance, 100, 'nothing taken when the bank cannot cover every debit');
  assert.equal(r.apply({ cash: [{ kind: 'stake', amount: 10, spot: 'ante' }, { kind: 'stake', amount: 5, spot: 'pairplus' }] }).ok, true);
  r.apply({ cash: [{ kind: 'stake', amount: 10, spot: 'play' }] });
  const out = r.apply({ cash: [{ kind: 'pay', amount: 40 }], done: { wagered: 25, won: 40 } });
  assert.deepEqual(out.settled, { wagered: 25, returned: 40, net: 15 });
  assert.equal(bank.balance, 115);
});

test('a payout that reaches the Hall of Fame leaves the fresh stats empty', () => {
  const bank = newBank({ bank: HALL_OF_FAME_AT - 100, tier: 5 });
  const r = createRound(bank, 'roulette');
  r.wager(100);
  r.settle({ returned: 3600 });
  assert.equal(bank.balance, 5000);
  assert.deepEqual(bank.get().stats, {});
});

test('machine: insert bills, bet and win on the meter, cash out into the bank', () => {
  const bank = newBank();
  const m = createMachine(bank, 'slots', 5);
  assert.deepEqual(m.insert(103), { ok: true, credits: 20 }, 'rounded down to whole credits');
  assert.equal(bank.balance, 4900);
  assert.equal(m.credits, 20);
  assert.equal(bank.loanEligible(), false);
  assert.equal(m.bet(3), true);
  assert.equal(m.credits, 17);
  assert.deepEqual(m.pay(30), { bet: 3, won: 30, net: 27 });
  assert.equal(m.credits, 47);
  assert.equal(bank.balance, 4900, 'the bank does not move while playing');
  assert.deepEqual(bank.get().stats.slots, { hands: 1, wagered: 15, won: 150, net: 135, biggest: 135 });
  assert.equal(m.bet(100), false);
  assert.deepEqual(m.cashOut(), { credits: 47, dollars: 235 });
  assert.equal(bank.balance, 5135);
  assert.equal(bank.machine, null);
  assert.equal(m.credits, 0);
});

test('machine: one machine holds credits at a time; leaving a dealt hand forfeits its bet', () => {
  const bank = newBank();
  const vp = createMachine(bank, 'video-poker', 1);
  vp.insert(20);
  const slots = createMachine(bank, 'slots', 1);
  assert.equal(slots.blocked, true);
  assert.equal(slots.insert(20).reason, 'other-machine');
  vp.bet(5);
  assert.deepEqual(vp.leave(), { lost: 5 });
  assert.equal(bank.get().stats['video-poker'].hands, 1);
  assert.deepEqual(vp.cashOut(), { credits: 15, dollars: 15 });
  assert.equal(slots.blocked, false);
});

test('machine: cashing out is a change of money (tier upgrades and loan repayment happen then)', () => {
  const bank = newBank({ bank: 9000 });
  const m = createMachine(bank, 'slots', 25);
  m.insert(1000);
  m.bet(1);
  m.pay(200);
  assert.equal(bank.get().tier, 0);
  m.cashOut();
  assert.equal(bank.balance, 8000 + 239 * 25);
  assert.equal(bank.get().tier, 1, 'Silver once the credits are back in the bank');
});

test('machine credits survive a reload and are cleaned on load', () => {
  const storage = memStorage();
  const a = createBank({ storage, win: null });
  createMachine(a, 'slots', 5).insert(50);
  const b = createBank({ storage, win: null });
  assert.deepEqual(b.machine, { game: 'slots', denom: 5, credits: 10 });
  assert.equal(normalize({ v: 1, bank: 10, machine: { game: 'slots', denom: 7, credits: 3 } }).machine, undefined);
  assert.equal(normalize({ v: 1, bank: 10, machine: { game: 'slots', denom: 1, credits: MAX_CREDITS * 5 } }).machine.credits, MAX_CREDITS);
});

test('a machine cashed out elsewhere stops taking bets here', () => {
  const bank = newBank();
  const m = createMachine(bank, 'slots', 1);
  m.insert(10);
  bank.machineOut();
  assert.equal(m.held, false);
  assert.equal(m.bet(1), false);
});
