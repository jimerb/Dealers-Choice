// The casino bank: one bankroll in whole dollars, shared by every casino game.
//
// Saved in localStorage under `dc.bank` as versioned JSON ({ v: 1, ... }). Every change of money
// goes through applyChange(), which, after adding the amount:
//   1. repays an outstanding loan once the bank reaches the next tier's threshold and covers the loan;
//   2. upgrades the tier (several at once after a big win), unless a loan is still outstanding;
//   3. at $1 billion on the top tier, writes a Hall of Fame entry and starts over at $5,000.
//
// The rules (freshState, applyChange, takeLoanState, ...) are pure functions of plain objects, so
// they are unit-tested without a browser. createBank() wraps them with storage, change listeners
// and cross-tab sync; `bank` is the page's shared instance.

export const VERSION = 1;
export const KEY = 'dc.bank';
export const START = 5000;
export const LOAN_LIMIT = 1000;           // a loan is offered only while the bank is under this
export const HALL_OF_FAME_AT = 1_000_000_000;

/** Tiers, lowest first. `next` is the bank that upgrades out of this tier (the last one's is the
 *  Hall of Fame); `loan` is what the loan desk offers at this tier. */
export const TIERS = [
  { id: 'brass', name: 'Brass', color: '#C9A24A', next: 10_000, loan: 2_500 },
  { id: 'silver', name: 'Silver', color: '#C4CBD1', next: 50_000, loan: 5_000 },
  { id: 'gold', name: 'Gold', color: '#E8C35A', next: 100_000, loan: 10_000 },
  { id: 'emerald', name: 'Emerald', color: '#2FA36B', next: 1_000_000, loan: 50_000 },
  { id: 'sapphire', name: 'Sapphire', color: '#3C6FC4', next: 100_000_000, loan: 100_000 },
  { id: 'onyx', name: 'Onyx', color: '#2B2B30', next: HALL_OF_FAME_AT, loan: 1_000_000 },
];
export const TOP = TIERS.length - 1;

const int = (n, d = 0) => (Number.isSafeInteger(n) ? n : d);
const whole = (n) => Number.isSafeInteger(n) && n >= 0;

/** A new player's bank (the Hall of Fame survives resets, so pass it in to keep it). */
export const freshState = (hall = []) => ({ v: VERSION, bank: START, tier: 0, loan: 0, stats: {}, hall });

/** Read whatever was stored back into a valid state; anything unreadable starts fresh. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== VERSION || !whole(raw.bank)) return freshState(Array.isArray(raw?.hall) ? raw.hall : []);
  const stats = {};
  for (const [id, s] of Object.entries(raw.stats && typeof raw.stats === 'object' ? raw.stats : {})) {
    if (!s || typeof s !== 'object') continue;
    stats[id] = { hands: int(s.hands), wagered: int(s.wagered), won: int(s.won), net: int(s.net), biggest: int(s.biggest) };
  }
  return {
    v: VERSION,
    bank: raw.bank,
    tier: Math.min(TOP, Math.max(0, int(raw.tier))),
    loan: whole(raw.loan) ? raw.loan : 0,
    stats,
    hall: Array.isArray(raw.hall) ? raw.hall.filter((h) => h && typeof h === 'object') : [],
  };
}

export const tierOf = (state) => TIERS[state.tier];

/** Can the player take a loan right now? */
export const loanEligible = (state) => state.loan === 0 && state.bank < LOAN_LIMIT;
/** The loan the desk offers at the player's tier (offered or not). */
export const loanAmount = (state) => TIERS[state.tier].loan;

const blankStats = () => ({ hands: 0, wagered: 0, won: 0, net: 0, biggest: 0 });

/**
 * The single place money changes. `delta` is a whole number of dollars (negative to take money).
 * opts.game: the game it came from, for its stats ('wager' for a debit, 'return' for a credit);
 * opts.name / opts.now: who and when, for a Hall of Fame entry.
 * Returns { state, events } with events such as { type: 'repaid', amount },
 * { type: 'upgrade', from, to } and { type: 'hall', entry }. Throws on an overdraft.
 */
export function applyChange(prev, delta, opts = {}) {
  if (!Number.isSafeInteger(delta)) throw new RangeError(`bank: ${delta} is not a whole number of dollars`);
  if (prev.bank + delta < 0) throw new RangeError(`bank: $${-delta} is more than the $${prev.bank} in the bank`);
  const s = { ...prev, stats: { ...prev.stats }, hall: [...prev.hall], bank: prev.bank + delta };
  const events = [];

  if (opts.game && delta !== 0) {
    const g = { ...(s.stats[opts.game] ?? blankStats()) };
    if (delta < 0) g.wagered += -delta; else g.won += delta;
    g.net += delta;
    s.stats[opts.game] = g;
  }

  // 1. loan repayment
  if (s.loan > 0 && s.bank >= TIERS[s.tier].next && s.bank >= s.loan) {
    events.push({ type: 'repaid', amount: s.loan });
    s.bank -= s.loan;
    s.loan = 0;
  }
  // 2. tier upgrades (blocked while a loan is outstanding)
  const from = s.tier;
  while (s.loan === 0 && s.tier < TOP && s.bank >= TIERS[s.tier].next) s.tier++;
  if (s.tier !== from) events.push({ type: 'upgrade', from, to: s.tier });
  // 3. Hall of Fame, then a fresh start (the board itself is kept)
  if (s.loan === 0 && s.tier === TOP && s.bank >= HALL_OF_FAME_AT) {
    const entry = { name: opts.name || 'Guest', date: new Date(opts.now ?? Date.now()).toISOString().slice(0, 10), bank: s.bank };
    events.push({ type: 'hall', entry });
    return { state: freshState([...s.hall, entry]), events };
  }
  return { state: s, events };
}

/** Take the loan offered at the current tier (no change if not eligible). */
export function takeLoanState(prev) {
  if (!loanEligible(prev)) return { state: prev, events: [] };
  const amount = loanAmount(prev);
  const { state, events } = applyChange(prev, amount);
  return { state: { ...state, loan: amount }, events: [{ type: 'loan', amount }, ...events] };
}

/** Start over at $5,000 on Brass: the loan and stats go, the Hall of Fame stays. */
export const resetState = (prev) => ({ state: freshState(prev.hall), events: [{ type: 'reset' }] });

/** Count one finished hand (round, spin, roll) of a game and its net result. */
export function recordHandState(prev, game, net) {
  const g = { ...(prev.stats[game] ?? blankStats()) };
  g.hands += 1;
  if (Number.isSafeInteger(net) && net > g.biggest) g.biggest = net;
  return { ...prev, stats: { ...prev.stats, [game]: g } };
}

// ------------------------------------------------------------------ storage + listeners

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function defaultName() {
  try { return globalThis.localStorage?.getItem('dc.name') || 'Guest'; } catch { return 'Guest'; }
}

/**
 * A bank backed by a Storage-like object ({ getItem, setItem }). When storage is missing or throws
 * (private mode, blocked site data) the bank still works, in memory, for this page.
 * Listeners get (state, events) after every change, including changes made in another tab.
 */
export function createBank({ storage = defaultStorage(), name = defaultName, now = () => Date.now(), win = globalThis.window } = {}) {
  const listeners = new Set();
  let sessionNet = 0; // this page visit's winnings and losses at the tables (not saved)

  const read = () => {
    try { const raw = storage?.getItem(KEY); return raw ? normalize(JSON.parse(raw)) : null; } catch { return null; }
  };
  let state = read() ?? freshState();
  const write = () => { try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* memory only */ } };
  const emit = (events) => { for (const fn of [...listeners]) { try { fn(state, events); } catch (e) { console.error(e); } } };
  const commit = ({ state: next, events }) => { state = next; write(); emit(events); return events; };

  // Another tab changed the bank: pick up its copy.
  if (win?.addEventListener) {
    win.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      state = read() ?? freshState(state.hall);
      emit([{ type: 'sync' }]);
    });
  }

  const amountOk = (n) => Number.isSafeInteger(n) && n > 0;
  return {
    get: () => state,
    get balance() { return state.bank; },
    get tier() { return TIERS[state.tier]; },
    get sessionNet() { return sessionNet; },
    canAfford: (n) => Number.isSafeInteger(n) && n >= 0 && n <= state.bank,
    /** Take a wager (whole dollars). Returns false, changing nothing, if the bank can't cover it. */
    debit(n, { game } = {}) {
      if (!amountOk(n) || n > state.bank) return false;
      if (game) sessionNet -= n;
      commit(applyChange(state, -n, { game, name: name(), now: now() }));
      return true;
    },
    /** Pay winnings (or return a stake) into the bank. */
    credit(n, { game } = {}) {
      if (n === 0) return true;
      if (!amountOk(n)) return false;
      if (game) sessionNet += n;
      commit(applyChange(state, n, { game, name: name(), now: now() }));
      return true;
    },
    recordHand(game, net) { state = recordHandState(state, game, net); write(); emit([{ type: 'hand', game, net }]); },
    loanEligible: () => loanEligible(state),
    loanAmount: () => loanAmount(state),
    takeLoan() { return commit(takeLoanState(state)).some((e) => e.type === 'loan'); },
    reset() { sessionNet = 0; commit(resetState(state)); },
    /** Call fn(state, events) on every change; returns a function that stops listening. */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

let shared = null;
/** The page's bank (created on first use). */
export function getBank() { return (shared ??= createBank()); }

/** "$1,250" */
export const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
