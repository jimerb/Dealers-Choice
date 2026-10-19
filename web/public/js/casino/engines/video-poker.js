// Video Poker rules (no DOM): the three machines and their pay tables, the deal and the draw from one
// 52-card deck, payouts, and the exact value of every way to hold a hand (the Hint).
//
//   MACHINES.jacks / .bonus / .deuces   { id, name, title, subtitle, wild, rows: [{ key, label, short, pays[5] }] }
//   rowOf(id, cards)                    the pay-table row a five-card hand wins, or -1
//   payout(id, cards, coins)            { row, label, credits }
//   init / legal / step                 the hand as a little state machine (bet -> hold -> paid)
//   holdValues(id, cards, coins)        the exact average credits returned by each of the 32 holds
//   bestHold(id, cards, coins)          the best of them, with a description in words
//
// The game's money is credits on the machine's meter (ctx.machine): the module takes the bet off the
// meter before `deal` and pays `done.won` after `draw`.
import { evaluate, HAND } from '../kit/poker.js';
import { newShoe, drawN } from '../kit/shoe.js';
import { SYM } from '../../core/cards.js';

// ------------------------------------------------------------------ the machines
const row = (key, label, short, one, max = one * 5) => ({ key, label, short, pays: [one, one * 2, one * 3, one * 4, max] });

export const MACHINES = {
  jacks: {
    id: 'jacks', name: 'Jacks or Better', title: 'JACKS OR BETTER', subtitle: '9/6 full pay', wild: null, returnPct: 99.54,
    rows: [
      row('royal', 'Royal flush', 'Royal flush', 250, 4000),
      row('sf', 'Straight flush', 'Str. flush', 50),
      row('quads', 'Four of a kind', 'Four of a kind', 25),
      row('fh', 'Full house', 'Full house', 9),
      row('flush', 'Flush', 'Flush', 6),
      row('straight', 'Straight', 'Straight', 4),
      row('trips', 'Three of a kind', '3 of a kind', 3),
      row('twopair', 'Two pair', 'Two pair', 2),
      row('jacks', 'Jacks or better', 'Jacks or better', 1),
    ],
  },
  bonus: {
    id: 'bonus', name: 'Bonus Poker', title: 'BONUS POKER', subtitle: '8/5 · four aces pay 80', wild: null, returnPct: 99.17,
    rows: [
      row('royal', 'Royal flush', 'Royal flush', 250, 4000),
      row('sf', 'Straight flush', 'Str. flush', 50),
      row('quadsA', 'Four aces', 'Four aces', 80),
      row('quads24', 'Four 2s, 3s or 4s', 'Four 2s–4s', 40),
      row('quads5K', 'Four 5s through kings', 'Four 5s–Ks', 25),
      row('fh', 'Full house', 'Full house', 8),
      row('flush', 'Flush', 'Flush', 5),
      row('straight', 'Straight', 'Straight', 4),
      row('trips', 'Three of a kind', '3 of a kind', 3),
      row('twopair', 'Two pair', 'Two pair', 2),
      row('jacks', 'Jacks or better', 'Jacks or better', 1),
    ],
  },
  deuces: {
    id: 'deuces', name: 'Deuces Wild', title: 'DEUCES WILD', subtitle: 'Full pay · every 2 is wild', wild: 'deuces', returnPct: 100.76,
    rows: [
      row('royal', 'Natural royal flush', 'Natural royal', 250, 4000),
      row('deuces4', 'Four deuces', 'Four deuces', 200),
      row('wildroyal', 'Wild royal flush', 'Wild royal', 25),
      row('five', 'Five of a kind', '5 of a kind', 15),
      row('sf', 'Straight flush', 'Str. flush', 9),
      row('quads', 'Four of a kind', '4 of a kind', 5),
      row('fh', 'Full house', 'Full house', 3),
      row('flush', 'Flush', 'Flush', 2),
      row('straight', 'Straight', 'Straight', 2),
      row('trips', 'Three of a kind', '3 of a kind', 1),
    ],
  },
};
export const MACHINE_IDS = Object.keys(MACHINES);
export const machineOf = (id) => MACHINES[id] ?? MACHINES.jacks;
const rowIndex = (m, key) => m.rows.findIndex((r) => r.key === key);

/** Credits paid for row `r` with `coins` bet (1-5); 0 for no win. */
export const payFor = (id, r, coins) => (r < 0 ? 0 : machineOf(id).rows[r].pays[coins - 1]);

/** The pay-table row a five-card hand wins (by the shared poker evaluator), or -1. */
export function rowOf(id, cards) {
  const m = machineOf(id);
  const ev = evaluate(cards, { wild: m.wild });
  const top = ev.tiebreak[0];
  let key = null;
  if (m.wild === 'deuces') {
    if (ev.cat === HAND.FIVE && ev.wilds === 4) key = 'deuces4';
    else if (ev.cat === HAND.ROYAL) key = ev.wilds ? 'wildroyal' : 'royal';
    else key = { [HAND.FIVE]: 'five', [HAND.STRAIGHT_FLUSH]: 'sf', [HAND.QUADS]: 'quads', [HAND.FULL_HOUSE]: 'fh', [HAND.FLUSH]: 'flush', [HAND.STRAIGHT]: 'straight', [HAND.TRIPS]: 'trips' }[ev.cat] ?? null;
  } else {
    if (ev.cat === HAND.QUADS && m.id === 'bonus') key = top === 14 ? 'quadsA' : top <= 4 ? 'quads24' : 'quads5K';
    else if (ev.cat === HAND.PAIR) key = top >= 11 ? 'jacks' : null;
    else key = { [HAND.ROYAL]: 'royal', [HAND.STRAIGHT_FLUSH]: 'sf', [HAND.QUADS]: 'quads', [HAND.FULL_HOUSE]: 'fh', [HAND.FLUSH]: 'flush', [HAND.STRAIGHT]: 'straight', [HAND.TRIPS]: 'trips', [HAND.TWO_PAIR]: 'twopair' }[ev.cat] ?? null;
  }
  return key ? rowIndex(m, key) : -1;
}

/** What a final hand pays: { row, label, credits } (row -1 and credits 0 when it doesn't pay). */
export function payout(id, cards, coins) {
  const r = rowOf(id, cards);
  return { row: r, label: r < 0 ? '' : machineOf(id).rows[r].label, credits: payFor(id, r, coins) };
}

/** Which of the five cards make the winning hand (a bit mask, card i = bit i): the high pair, the
 *  two pairs, the trips or quads (with any deuces), or all five for straights, flushes and up. */
export function payingMask(id, cards) {
  const r = rowOf(id, cards);
  if (r < 0) return 0;
  const m = machineOf(id);
  const key = m.rows[r].key;
  const wild = (c) => m.wild === 'deuces' && c.rank === '2';
  if (!['jacks', 'twopair', 'trips', 'quads', 'quadsA', 'quads24', 'quads5K', 'deuces4'].includes(key)) return 31;
  const count = {};
  for (const c of cards) if (!wild(c)) count[c.rank] = (count[c.rank] ?? 0) + 1;
  let need = 2;
  if (key === 'jacks') need = 2;
  const ranks = Object.entries(count).filter(([, n]) => n >= need).map(([k]) => k);
  let keep = ranks;
  if (key === 'jacks') keep = ranks.filter((k) => ['J', 'Q', 'K', 'A'].includes(k));
  if (key === 'deuces4') keep = [];
  if (m.wild === 'deuces' && key !== 'deuces4' && !ranks.length) {
    // wild trips or quads built on a single natural card: keep the highest natural
    const nat = cards.filter((c) => !wild(c)).sort((a, b) => rv(b) - rv(a));
    keep = nat.length ? [nat[0].rank] : [];
  }
  let mask = 0;
  cards.forEach((c, i) => { if (wild(c) || keep.includes(c.rank)) mask |= 1 << i; });
  return mask;
}

// ------------------------------------------------------------------ the hand
export const COINS_MAX = 5;

/** A hand of video poker as plain data. phase: 'bet' (waiting for a deal), 'hold' (dealt), 'paid'. */
export function init({ machine = 'jacks', coins = COINS_MAX } = {}) {
  return { phase: 'bet', machine: machineOf(machine).id, coins: clampCoins(coins), hand: [], held: [false, false, false, false, false], deck: null, result: null };
}
const clampCoins = (n) => Math.max(1, Math.min(COINS_MAX, Math.floor(Number(n)) || 1));

export function legal(s) {
  if (s.phase === 'hold') return [{ type: 'hold' }, { type: 'holdAll' }, { type: 'discardAll' }, { type: 'draw' }];
  return [{ type: 'coins' }, { type: 'betOne' }, { type: 'machine' }, { type: 'deal' }];
}

/**
 * One action -> { state, fx, log, done? }. Actions: { type: 'coins', n } | 'betOne' (1-5, wraps) |
 * { type: 'machine', id } | 'deal' | { type: 'hold', i } | 'holdAll' | 'discardAll' | 'draw'.
 * `done` ({ wagered, won } in credits) comes with the draw that decides the hand.
 */
export function step(state, action, { rng } = {}) {
  const s = structuredClone(state);
  const a = typeof action === 'string' ? { type: action } : action;
  const hold = s.phase === 'hold';
  switch (a.type) {
    case 'coins':
      if (hold) throw new Error('Finish this hand first.');
      s.coins = clampCoins(a.n);
      return { state: s, fx: ['click'], log: [] };
    case 'betOne':
      if (hold) throw new Error('Finish this hand first.');
      s.coins = s.coins >= COINS_MAX ? 1 : s.coins + 1;
      return { state: s, fx: ['click'], log: [] };
    case 'machine':
      if (hold) throw new Error('Finish this hand before changing machines.');
      if (!MACHINES[a.id]) throw new Error('There is no such machine.');
      s.machine = a.id;
      return { state: s, fx: ['click'], log: [] };
    case 'deal': {
      if (hold) throw new Error('This hand is already dealt.');
      if (!rng) throw new Error('deal needs an rng');
      s.deck = newShoe({ decks: 1, penetration: 1 }, rng);
      s.hand = drawN(s.deck, 5);
      s.held = [false, false, false, false, false];
      s.result = null;
      s.phase = 'hold';
      return { state: s, fx: ['deal'], log: [`${s.coins} credit${s.coins > 1 ? 's' : ''} bet. Hold the cards you want, then Draw.`] };
    }
    case 'hold':
      if (!hold) throw new Error('Deal a hand first.');
      if (!(a.i >= 0 && a.i < 5)) throw new Error('Pick a card from 1 to 5.');
      s.held[a.i] = a.on ?? !s.held[a.i];
      return { state: s, fx: ['click'], log: [] };
    case 'holdAll': case 'discardAll':
      if (!hold) throw new Error('Deal a hand first.');
      s.held = s.held.map(() => a.type === 'holdAll');
      return { state: s, fx: ['click'], log: [] };
    case 'draw': {
      if (!hold) throw new Error('Deal a hand first.');
      const drawn = [];
      s.hand = s.hand.map((c, i) => { if (s.held[i]) return c; const n = drawN(s.deck, 1)[0]; drawn.push(i); return n; });
      const p = payout(s.machine, s.hand, s.coins);
      s.result = { ...p, drawn };
      s.phase = 'paid';
      return { state: s, fx: [drawn.length ? 'card' : 'click', p.credits ? 'win' : 'lose'], log: [p.credits ? `${p.label}: wins ${p.credits} credits.` : 'No win.'], done: { wagered: s.coins, won: p.credits } };
    }
    default: throw new Error(`Unknown action ${a.type}`);
  }
}

// ------------------------------------------------------------------ exact analysis
// Cards as numbers 0..51: rank index (0 = deuce .. 12 = ace) * 4 + suit. A sorted five-card hand has
// sorted ranks, so pairs and quads can be read off neighbours.
const SUITS = { S: 0, H: 1, C: 2, D: 3 };
const RV = { A: 14, K: 13, Q: 12, J: 11 };
const rv = (c) => RV[c.rank] ?? Number(c.rank);
export const cardNum = (c) => (rv(c) - 2) * 4 + SUITS[c.suit];

/** C(n, k) for n <= 52, k <= 5. */
const BIN = Array.from({ length: 53 }, (_, n) => { const r = [1]; for (let k = 1; k <= 5; k++) r[k] = (r[k - 1] * (n - k + 1)) / k; return r; });
export const binom = (n, k) => (k < 0 || n < k ? 0 : BIN[n][k]);
export const HANDS = binom(52, 5); // 2,598,960

// straights by rank mask (13 bits): 1 for a straight, 2 for the ace-high one (royal when suited)
const STRAIGHT = new Uint8Array(1 << 13);
for (let low = 0; low <= 8; low++) STRAIGHT[0b11111 << low] = low === 8 ? 2 : 1;
STRAIGHT[0b1000000001111] = 1; // A 2 3 4 5

/** A fast row finder for sorted card numbers (a < b < c < d < e); returns the row index or -1.
 *  Built once per machine; the tests check it against rowOf() hand by hand. */
export function fastRower(id) {
  const m = machineOf(id);
  const R = Object.fromEntries(m.rows.map((r, i) => [r.key, i]));
  const k = (key) => R[key] ?? -1;
  if (m.wild !== 'deuces') {
    const bonus = m.id === 'bonus';
    const [ROYAL, SF, FH, FL, ST, TR, TP, JB] = ['royal', 'sf', 'fh', 'flush', 'straight', 'trips', 'twopair', 'jacks'].map(k);
    const quads = (r) => (bonus ? (r === 12 ? R.quadsA : r <= 2 ? R.quads24 : R.quads5K) : R.quads);
    return (a, b, c, d, e) => {
      const ra = a >> 2, rb = b >> 2, rc = c >> 2, rd = d >> 2, re = e >> 2;
      const sa = a & 3;
      const flush = sa === (b & 3) && sa === (c & 3) && sa === (d & 3) && sa === (e & 3);
      const p1 = ra === rb, p2 = rb === rc, p3 = rc === rd, p4 = rd === re;
      const eq = p1 + p2 + p3 + p4;
      if (eq === 0) {
        const st = STRAIGHT[(1 << ra) | (1 << rb) | (1 << rc) | (1 << rd) | (1 << re)];
        if (st && flush) return st === 2 ? ROYAL : SF;
        if (flush) return FL;
        if (st) return ST;
        return -1;
      }
      if (eq === 3) return (p1 && p2 && p3) || (p2 && p3 && p4) ? quads(rc) : FH;
      if (eq === 2) {
        if ((p1 && p2) || (p2 && p3) || (p3 && p4)) return TR;
        return TP;
      }
      // one pair: which?
      const pr = p1 ? ra : p2 ? rb : p3 ? rc : rd;
      return pr >= 9 ? JB : -1;
    };
  }
  const [NAT, D4, WR, FIVE, SF, Q, FH, FL, ST, TR] = ['royal', 'deuces4', 'wildroyal', 'five', 'sf', 'quads', 'fh', 'flush', 'straight', 'trips'].map(k);
  const r = new Int8Array(5), su = new Int8Array(5);
  return (a, b, c, d, e) => {
    r[0] = a >> 2; r[1] = b >> 2; r[2] = c >> 2; r[3] = d >> 2; r[4] = e >> 2;
    su[0] = a & 3; su[1] = b & 3; su[2] = c & 3; su[3] = d & 3; su[4] = e & 3;
    let w = 0;
    while (w < 5 && r[w] === 0) w++;
    if (w === 4) return D4;
    // naturals are r[w..4], sorted
    let maxRun = 1, run = 1, pairs = 0, mask = 0, flush = true;
    for (let i = w; i < 5; i++) {
      mask |= 1 << r[i];
      if (su[i] !== su[w]) flush = false;
      if (i > w) {
        if (r[i] === r[i - 1]) { run++; if (run === 2) pairs++; } else run = 1;
        if (run > maxRun) maxRun = run;
      }
    }
    const distinct = maxRun === 1;
    let straight = false, royal = false;
    if (distinct) {
      const lo = r[w], hi = r[4];
      royal = lo >= 8;
      straight = hi - lo <= 4 || (hi === 12 && (w === 4 || r[3] <= 3));
    }
    if (w === 0) {
      if (distinct) {
        const st = STRAIGHT[mask];
        if (st && flush) return st === 2 ? NAT : SF;
        if (flush) return FL;
        if (st) return ST;
        return -1;
      }
      if (maxRun === 4) return Q;
      if (maxRun === 3) return pairs === 2 ? FH : TR;
      return -1;
    }
    if (maxRun + w >= 5) return FIVE;
    if (flush && distinct && royal) return WR;
    if (flush && distinct && straight) return SF;
    if (maxRun + w >= 4) return Q;
    if (w === 1 && pairs === 2) return FH;
    if (flush) return FL;
    if (distinct && straight) return ST;
    if (maxRun + w >= 3) return TR;
    return -1;
  };
}

/** Colex index of five sorted card numbers: 0 .. 2,598,959. */
export const index5 = (a, b, c, d, e) => a + BIN[b][2] + BIN[c][3] + BIN[d][4] + BIN[e][5];

const rowTables = new Map();
/** The row won by every five-card hand, by colex index (Int8Array, -1 = no win). Cached. */
export function rowTable(id) {
  const m = machineOf(id);
  if (rowTables.has(m.id)) return rowTables.get(m.id);
  const rower = fastRower(m.id);
  const t = new Int8Array(HANDS);
  for (let e = 4; e < 52; e++) for (let d = 3; d < e; d++) for (let c = 2; c < d; c++) for (let b = 1; b < c; b++) {
    const base = BIN[b][2] + BIN[c][3] + BIN[d][4] + BIN[e][5];
    for (let a = 0; a < b; a++) t[a + base] = rower(a, b, c, d, e);
  }
  rowTables.set(m.id, t);
  return t;
}

const subsetCache = new Map();
/**
 * For every set X of 0 to 5 cards: the total one-coin pay (`pay[k]`) and the number of royal
 * flushes (`royal[k]`, the row whose 5-coin pay is the 4000 bonus) over all five-card hands that
 * contain X, indexed by X's colex index. From these the value of any hold follows by
 * inclusion-exclusion over the discards, so every hold of every deal costs a few lookups.
 */
export function subsetTables(id) {
  const m = machineOf(id);
  if (subsetCache.has(m.id)) return subsetCache.get(m.id);
  const rows = rowTable(m.id);
  const one = m.rows.map((r) => r.pays[0]);
  const pay = [0, 1, 2, 3, 4].map((k) => new Float64Array(binom(52, k)));
  const royal = [0, 1, 2, 3, 4].map((k) => new Float64Array(binom(52, k)));
  const v = [0, 0, 0, 0, 0];
  for (let e = 4; e < 52; e++) for (let d = 3; d < e; d++) for (let c = 2; c < d; c++) for (let b = 1; b < c; b++) for (let a = 0; a < b; a++) {
    const r = rows[a + BIN[b][2] + BIN[c][3] + BIN[d][4] + BIN[e][5]];
    if (r < 0) continue;
    const p = one[r], isRoyal = r === 0;
    v[0] = a; v[1] = b; v[2] = c; v[3] = d; v[4] = e;
    // all proper subsets (masks 0..30) of the five cards
    for (let mask = 0; mask < 31; mask++) {
      let idx = 0, k = 0;
      for (let i = 0; i < 5; i++) if (mask & (1 << i)) { k++; idx += BIN[v[i]][k]; }
      pay[k][idx] += p;
      if (isRoyal) royal[k][idx] += 1;
    }
  }
  const t = { pay, royal, rows, one };
  subsetCache.set(m.id, t);
  return t;
}

// popcount of a 5-bit mask
const BITS = Array.from({ length: 32 }, (_, m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1) + ((m >> 4) & 1));
const ROYAL_BONUS = 4000 - 5 * 250;

/**
 * Exact average credits returned by each of the 32 holds (mask bit i = keep card i) for five card
 * numbers `nums` (any order) with `coins` bet, over every possible draw from the other 47 cards.
 * `out` (Float64Array(32)) is filled and returned.
 */
export function holdValuesNum(id, nums, coins, out = new Float64Array(32), t = subsetTables(id)) {
  // sort the five, remembering where each came from (scratch arrays: this runs millions of times)
  const order = ORDER, v = V, f = F, g = G;
  for (let i = 0; i < 5; i++) order[i] = i;
  order.sort((x, y) => nums[x] - nums[y]);
  for (let i = 0; i < 5; i++) v[i] = nums[order[i]];
  const rows = t.rows;
  const one = t.one;
  for (let mask = 0; mask < 31; mask++) {
    let idx = 0, k = 0;
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) { k++; idx += BIN[v[i]][k]; }
    f[mask] = t.pay[k][idx];
    g[mask] = t.royal[k][idx];
  }
  const r = rows[index5(v[0], v[1], v[2], v[3], v[4])];
  f[31] = r < 0 ? 0 : one[r];
  g[31] = r === 0 ? 1 : 0;
  // superset Möbius: f[H] = sum over H ⊆ X ⊆ hand of (-1)^|X\H| T[X] = hands holding H and none of the rest
  for (let bit = 1; bit < 32; bit <<= 1) for (let mask = 0; mask < 32; mask++) if (!(mask & bit)) { f[mask] -= f[mask | bit]; g[mask] -= g[mask | bit]; }
  for (let mask = 0; mask < 32; mask++) {
    const val = (coins * f[mask] + (coins === 5 ? ROYAL_BONUS * g[mask] : 0)) / DRAWS[BITS[mask]];
    // back to the caller's card order
    let m2 = 0;
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) m2 |= 1 << order[i];
    out[m2] = val;
  }
  return out;
}
const ORDER = [0, 1, 2, 3, 4], V = new Int32Array(5), F = new Float64Array(32), G = new Float64Array(32);
const DRAWS = [0, 1, 2, 3, 4, 5].map((k) => binom(47, 5 - k));

/** holdValuesNum for card objects. */
export const holdValues = (id, cards, coins) => holdValuesNum(id, cards.map(cardNum), coins);

/**
 * The same values by brute force (every draw of every hold evaluated): slow, for the tests to
 * check the fast way against.
 */
export function holdValuesDirect(id, cards, coins) {
  const nums = cards.map(cardNum);
  const rows = rowTable(id);
  const m = machineOf(id);
  const rest = [];
  for (let x = 0; x < 52; x++) if (!nums.includes(x)) rest.push(x);
  const out = new Float64Array(32);
  for (let mask = 0; mask < 32; mask++) {
    const kept = nums.filter((_, i) => mask & (1 << i));
    const need = 5 - kept.length;
    let total = 0, count = 0;
    const pick = (start, acc) => {
      if (acc.length === need) {
        const h = [...kept, ...acc].sort((x, y) => x - y);
        const r = rows[index5(...h)];
        total += r < 0 ? 0 : m.rows[r].pays[coins - 1];
        count++;
        return;
      }
      for (let i = start; i <= rest.length - (need - acc.length); i++) { acc.push(rest[i]); pick(i + 1, acc); acc.pop(); }
    };
    pick(0, []);
    out[mask] = total / count;
  }
  return out;
}

/**
 * The exact return of a machine with perfect play at `coins` (every one of the 2,598,960 deals, its
 * best hold's exact value): { rtp (fraction of the bet), deals }. A few seconds.
 */
export function exactReturn(id, coins = 5) {
  const t = subsetTables(id);
  const out = new Float64Array(32);
  const nums = [0, 0, 0, 0, 0];
  let sum = 0;
  for (let e = 4; e < 52; e++) for (let d = 3; d < e; d++) for (let c = 2; c < d; c++) for (let b = 1; b < c; b++) for (let a = 0; a < b; a++) {
    nums[0] = a; nums[1] = b; nums[2] = c; nums[3] = d; nums[4] = e;
    holdValuesNum(id, nums, coins, out, t);
    let best = 0;
    for (let mask = 0; mask < 32; mask++) if (out[mask] > best) best = out[mask];
    sum += best;
  }
  return { rtp: sum / HANDS / coins, deals: HANDS };
}

// ------------------------------------------------------------------ the hint
const NUM_WORD = ['no', 'one', 'two', 'three', 'four', 'five'];
const PLURAL = { A: 'aces', K: 'kings', Q: 'queens', J: 'jacks', 10: 'tens', 9: 'nines', 8: 'eights', 7: 'sevens', 6: 'sixes', 5: 'fives', 4: 'fours', 3: 'threes', 2: 'twos' };
export const cardText = (c) => `${c.rank}${SYM[c.suit] ?? ''}`;

/** What a hold is, in words: "four to a royal flush", "a pair of jacks", "the deuce" ... */
export function describeHold(id, cards, mask) {
  const m = machineOf(id);
  const kept = cards.filter((_, i) => mask & (1 << i));
  if (!kept.length) return 'nothing worth keeping: draw five new cards';
  const isWild = (c) => m.wild === 'deuces' && c.rank === '2';
  if (kept.length === 5) {
    const r = rowOf(m.id, cards);
    return r >= 0 ? `stand pat on the ${m.rows[r].label.toLowerCase()}` : 'keep all five';
  }
  const wilds = kept.filter(isWild).length;
  const nat = kept.filter((c) => !isWild(c));
  const withDeuces = wilds && nat.length ? ` with ${wilds === 1 ? 'a deuce' : `${NUM_WORD[wilds]} deuces`}` : '';
  if (!nat.length) return wilds === 1 ? 'the deuce' : `the ${NUM_WORD[wilds]} deuces`;
  const count = {};
  for (const c of nat) count[c.rank] = (count[c.rank] ?? 0) + 1;
  const groups = Object.entries(count).sort((x, y) => y[1] - x[1]);
  const suited = nat.every((c) => c.suit === nat[0].suit);
  const vals = nat.map(rv).sort((x, y) => x - y);
  const distinct = groups.length === nat.length;
  const n = kept.length;
  const fitsStraight = distinct && (vals[vals.length - 1] - vals[0] <= 4 || (vals[vals.length - 1] === 14 && vals.slice(0, -1).every((x) => x <= 5)));
  if (n >= 2 && groups[0][1] === 1) {
    if (suited && vals[0] >= 10 && n >= 3) return `${NUM_WORD[n]} to a royal flush${withDeuces}`;
    if (suited && fitsStraight && n >= 3) return `${NUM_WORD[n]} to a straight flush${withDeuces}`;
    if (suited && n === 4) return `four to a flush${withDeuces}`;
    if (fitsStraight && n === 4) return `four to a straight${withDeuces}`;
  }
  const g0 = groups[0];
  if (g0[1] === 4) return `four ${PLURAL[g0[0]]}`;
  if (g0[1] === 3) return groups[1]?.[1] === 2 ? 'the full house' : `three ${PLURAL[g0[0]]}${withDeuces}`;
  if (g0[1] === 2) return groups[1]?.[1] === 2 ? `two pair, ${PLURAL[g0[0]]} and ${PLURAL[groups[1][0]]}` : `a pair of ${PLURAL[g0[0]]}${withDeuces}`;
  if (wilds) return `${nat.map(cardText).join(' ')}${withDeuces}`;
  if (n === 1) return `the ${{ A: 'ace', K: 'king', Q: 'queen', J: 'jack' }[nat[0].rank] ?? cardText(nat[0])}`;
  if (suited) return `${NUM_WORD[n]} suited high cards`;
  return `${NUM_WORD[n]} high cards`;
}

/** The best hold for a dealt hand: { mask, value, values, text }. On a tie the hold that keeps more
 *  cards wins (masks are scanned from keeping all five down). */
export function bestHold(id, cards, coins, values = holdValues(id, cards, coins)) {
  let mask = 31;
  for (let mk = 31; mk >= 0; mk--) if (values[mk] > values[mask] + 1e-9) mask = mk;
  return { mask, value: values[mask], values, text: describeHold(id, cards, mask) };
}
