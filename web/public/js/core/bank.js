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
export const MAX_BANK = 9_000_000_000_000; // sanity clamp, well inside Number.MAX_SAFE_INTEGER
export const CORRUPT_KEY = 'dc.bank.corrupt';
/** Machine denominations, and the most credits one machine's meter holds. */
export const DENOMS = [1, 5, 25];
export const MAX_CREDITS = 10_000;

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

const cleanInt = (x, lo = 0, hi = MAX_BANK) => Math.max(lo, Math.min(hi, Math.floor(Number(x)) || 0));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanHall = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((h) => h && typeof h === 'object' && typeof h.name === 'string' && typeof h.date === 'string' && DATE.test(h.date))
  .map((h) => ({ ...h, name: h.name.slice(0, 20) }));

/** Credits sitting in a machine: { game, denom, credits }, or null when the field is missing or bad. */
function cleanMachine(m) {
  if (!m || typeof m !== 'object' || typeof m.game !== 'string' || !m.game || !DENOMS.includes(m.denom)) return null;
  if (!Number.isSafeInteger(m.credits) || m.credits < 0) return null;
  return { game: m.game.slice(0, 40), denom: m.denom, credits: Math.min(m.credits, MAX_CREDITS) };
}

/** Repair whatever was stored into a valid state (never throws). A wrong or missing version
 *  starts fresh, keeping any valid Hall of Fame rows. The tier is brought up to date with the bank. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object') return freshState();
  if (raw.v !== VERSION) return freshState(cleanHall(raw.hall));
  const stats = {};
  for (const [id, g] of Object.entries(raw.stats && typeof raw.stats === 'object' ? raw.stats : {})) {
    if (!g || typeof g !== 'object') continue;
    const wagered = cleanInt(g.wagered), won = cleanInt(g.won);
    stats[id] = { hands: cleanInt(g.hands), wagered, won, net: won - wagered, biggest: cleanInt(g.biggest) };
  }
  const loan = TIERS.some((t) => t.loan === raw.loan) ? raw.loan : 0;
  const state = { v: VERSION, bank: cleanInt(raw.bank), tier: cleanInt(raw.tier, 0, TOP), loan, stats, hall: cleanHall(raw.hall) };
  const machine = cleanMachine(raw.machine);
  if (machine) state.machine = machine;
  // a tier behind its bank catches up (blocked by a loan, as always); loan repayment and the
  // Hall of Fame wait for the next real change of money
  while (state.loan === 0 && state.tier < TOP && state.bank >= TIERS[state.tier].next) state.tier++;
  return state;
}

export const tierOf = (state) => TIERS[state.tier];

/** Can the player take a loan right now? Not while credits sit in a machine (cash out first). */
export const loanEligible = (state) => state.loan === 0 && state.bank < LOAN_LIMIT && !state.machine;
/** The loan the desk offers at the player's tier (offered or not). */
export const loanAmount = (state) => TIERS[state.tier].loan;

const blankStats = () => ({ hands: 0, wagered: 0, won: 0, net: 0, biggest: 0 });

/**
 * The single place money changes. `delta` is a whole number of dollars (negative to take money).
 * opts.game: the game it came from, for its stats ('wager' for a debit, 'return' for a credit;
 *   with opts.refund a credit is a bet handed back, which takes it off 'wager' instead);
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
    if (delta < 0) g.wagered += -delta;
    else if (opts.refund) g.wagered = Math.max(0, g.wagered - delta); // a bet taken back: it was never really wagered
    else g.won += delta;
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

/** Count one finished round of a game whose money moved without the bank (a machine's credits):
 *  hands, wagered and won in dollars, and the biggest win. */
export function recordRoundState(prev, game, { wagered = 0, won = 0 } = {}) {
  const g = { ...(prev.stats[game] ?? blankStats()) };
  g.hands += 1;
  g.wagered += wagered;
  g.won += won;
  g.net = g.won - g.wagered;
  if (won - wagered > g.biggest) g.biggest = won - wagered;
  return { ...prev, stats: { ...prev.stats, [game]: g } };
}

/** Take the loan offered at the current tier (no change if not eligible). */
export function takeLoanState(prev) {
  if (!loanEligible(prev)) return { state: prev, events: [] };
  const amount = loanAmount(prev);
  const { state, events } = applyChange(prev, amount);
  return { state: { ...state, loan: amount }, events: [{ type: 'loan', amount }, ...events] };
}

/** Pay the loan back by hand (needs the whole loan in the bank). A tier the loan was holding back
 *  comes through at once. No change if there is no loan or the bank is short. */
export function repayLoanState(prev) {
  if (!(prev.loan > 0) || prev.bank < prev.loan) return { state: prev, events: [] };
  const amount = prev.loan;
  const { state, events } = applyChange({ ...prev, loan: 0 }, -amount);
  return { state, events: [{ type: 'repaid', amount, manual: true }, ...events] };
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

  const notices = []; // news from loading (a corrupt save), for the page to show once it is listening
  // A save written by a newer version of the casino (another tab, after an update) is shown but never
  // overwritten: every change is refused until the page is reloaded.
  let readOnly = false;
  const write = () => { if (readOnly) return; try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* memory only */ } };
  const read = () => {
    let raw = null;
    try { raw = storage?.getItem(KEY) ?? null; } catch { return null; }
    if (!raw) return null;
    let parsed;
    try { parsed = JSON.parse(raw); } catch {
      // unreadable: keep a copy for recovery by hand, start fresh, and say so
      try { storage.setItem(CORRUPT_KEY, raw); } catch { /* ignore */ }
      notices.push({ type: 'corrupt' });
      return { state: freshState(), repaired: true };
    }
    if (parsed && typeof parsed === 'object' && Number.isSafeInteger(parsed.v) && parsed.v > VERSION) {
      if (!readOnly) notices.push({ type: 'readonly' });
      readOnly = true;
      return { state: normalize({ ...parsed, v: VERSION }), repaired: false };
    }
    const fixed = normalize(parsed);
    return { state: fixed, repaired: JSON.stringify(fixed) !== JSON.stringify(parsed) };
  };
  let state = freshState();
  const loaded = read();
  if (loaded) { state = loaded.state; if (loaded.repaired) write(); }
  const emit = (events) => { for (const fn of [...listeners]) { try { fn(state, events); } catch (e) { console.error(e); } } };
  const commit = ({ state: next, events }) => { state = next; write(); emit(events); return events; };

  // Another tab changed the bank: pick up its copy.
  if (win?.addEventListener) {
    win.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      const was = readOnly;
      const got = read();
      if (was && !readOnly) return; // stay read-only until reloaded
      state = got?.state ?? freshState(state.hall);
      emit([{ type: 'sync' }, ...notices.splice(0)]);
    });
  }

  const amountOk = (n) => Number.isSafeInteger(n) && n > 0 && !readOnly;
  return {
    get: () => state,
    get balance() { return state.bank; },
    get tier() { return TIERS[state.tier]; },
    get sessionNet() { return sessionNet; },
    /** True when the save came from a newer version of the casino: nothing can change until a reload. */
    get readOnly() { return readOnly; },
    canAfford: (n) => Number.isSafeInteger(n) && n >= 0 && n <= state.bank,
    /** Take a wager (whole dollars). Returns false, changing nothing, if the bank can't cover it. */
    debit(n, { game } = {}) {
      if (!amountOk(n) || n > state.bank) return false;
      if (game) sessionNet -= n;
      commit(applyChange(state, -n, { game, name: name(), now: now() }));
      return true;
    },
    /** Pay winnings (or return a stake) into the bank. With `refund`, the money is a bet handed
     *  back (taken down, pulled back) and comes off the game's wagered total instead of counting as won. */
    credit(n, { game, refund = false } = {}) {
      if (n === 0) return true;
      if (!amountOk(n)) return false;
      if (game) sessionNet += n;
      commit(applyChange(state, n, { game, refund, name: name(), now: now() }));
      return true;
    },
    recordHand(game, net) { if (readOnly) return; state = recordHandState(state, game, net); write(); emit([{ type: 'hand', game, net }]); },
    /** A round played on a machine's credits (no money moved through the bank): wagered and won in dollars. */
    recordRound(game, round) {
      if (readOnly) return;
      state = recordRoundState(state, game, round);
      sessionNet += (round.won ?? 0) - (round.wagered ?? 0);
      write();
      emit([{ type: 'hand', game, net: (round.won ?? 0) - (round.wagered ?? 0) }]);
    },

    // ---- machine credits: one machine at a time holds credits taken from the bank
    /** The machine holding credits ({ game, denom, credits }), or null. */
    get machine() { return state.machine ?? null; },
    /** Feed `dollars` into game's machine: rounded down to whole credits, capped by the bank and the
     *  meter. Returns { ok, credits (added), reason: 'other-machine' | 'bad-amount' | 'insufficient' | 'full' }. */
    machineIn(game, denom, dollars) {
      const m = state.machine;
      if (readOnly) return { ok: false, credits: 0, reason: 'readonly' };
      if (m && (m.game !== game || m.denom !== denom)) return { ok: false, credits: 0, reason: 'other-machine' };
      if (!DENOMS.includes(denom) || !Number.isSafeInteger(dollars) || dollars <= 0) return { ok: false, credits: 0, reason: 'bad-amount' };
      const room = MAX_CREDITS - (m?.credits ?? 0);
      const credits = Math.min(Math.floor(Math.min(dollars, state.bank) / denom), room);
      if (credits <= 0) return { ok: false, credits: 0, reason: room <= 0 ? 'full' : 'insufficient' };
      const r = applyChange(state, -credits * denom, { name: name(), now: now() });
      r.state = { ...r.state, machine: { game, denom, credits: (m?.credits ?? 0) + credits } };
      commit(r);
      return { ok: true, credits };
    },
    /** Change the credits on the meter by `delta` (a bet off, a win on). False, changing nothing, if
     *  `game` doesn't hold the machine (cashed out in another tab) or the meter would go below zero. */
    machineAdjust(game, delta) {
      const m = state.machine;
      if (readOnly || !m || m.game !== game || !Number.isSafeInteger(delta)) return false;
      const credits = m.credits + delta;
      if (credits < 0) return false;
      state = { ...state, machine: { ...m, credits: Math.min(credits, MAX_CREDITS * 100) } };
      write();
      emit([{ type: 'machine', credits }]);
      return true;
    },
    /** Cash the machine out into the bank (loan repayment and tier upgrades happen here).
     *  Returns { game, credits, dollars } (credits 0 when no machine held any). */
    machineOut() {
      const m = state.machine;
      if (!m || readOnly) return { game: null, credits: 0, dollars: 0 };
      const { machine, ...rest } = state;
      const dollars = m.credits * m.denom;
      commit(applyChange(rest, dollars, { name: name(), now: now() }));
      return { game: m.game, credits: m.credits, dollars };
    },
    loanEligible: () => loanEligible(state),
    loanAmount: () => loanAmount(state),
    takeLoan() { return !readOnly && commit(takeLoanState(state)).some((e) => e.type === 'loan'); },
    /** Pay the loan back now. False (nothing changes) without a loan, or when the bank can't cover it. */
    repayLoan() {
      if (readOnly || !(state.loan > 0) || state.bank < state.loan) return false;
      commit(repayLoanState(state));
      return true;
    },
    canRepay: () => !readOnly && state.loan > 0 && state.bank >= state.loan,
    reset() { if (readOnly) return; sessionNet = 0; commit(resetState(state)); },
    /** News from loading the bank (e.g. { type: 'corrupt' }), handed over once. */
    drainNotices: () => notices.splice(0),
    /** Call fn(state, events) on every change; returns a function that stops listening. */
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

let shared = null;
/** The page's bank (created on first use). */
export function getBank() { return (shared ??= createBank()); }

/** "$1,250" */
export const money = (n) => `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US')}`;
/** Short money for tight spaces: "$950", "$12.4K", "$1.25M", "$1.00B" (rounded down, never up). */
export function moneyShort(n) {
  const a = Math.abs(n), sign = n < 0 ? '−' : '';
  const cut = (v, d) => (Math.floor(v * 10 ** d) / 10 ** d).toFixed(d);
  if (a < 1000) return `${sign}$${a}`;
  if (a < 1e6) return `${sign}$${cut(a / 1e3, a < 1e4 ? 2 : a < 1e5 ? 1 : 0)}K`;
  if (a < 1e9) return `${sign}$${cut(a / 1e6, a < 1e7 ? 2 : a < 1e8 ? 1 : 0)}M`;
  return `${sign}$${cut(a / 1e9, a < 1e10 ? 2 : 1)}B`;
}
/** The bank as a pill shows it: whole dollars under a million, then "$1.25M" / "$1.00B". */
export const moneyPill = (n) => (Math.abs(n) < 1e6 ? money(n) : moneyShort(n));
