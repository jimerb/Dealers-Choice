// Slots rules: the Brass Crown machine. Three reels of 32 physical stops, one pay line, one to three
// coins. No DOM. Every stop is equally likely; the spin is three rng.int(32) draws.
//
// Symbols: W crown (wild, top award), D gold ingots, B bell, H horseshoe, C clover, R cherries,
// '-' a blank stop. The crown is wild for ingots, bells, horseshoes and clovers (not cherries):
// a win with one crown pays x2, with two crowns x4; three crowns is the top award.

export const STOPS = 32;
export const MAX_COINS = 3;

/** The three reel strips, top to bottom (the order sets what shows above and below the line). */
export const STRIPS = [
  'C - H - C - B - H - C - D - B - H - C - R - W - D - B - H - C R',
  'C - B - H - C - D - B - H - C - R - W - D - B - - H - C - - R -',
  'C - - H - - C - - B - - H - - C - W - - D - B - - H - C - - R -',
].map((s) => Object.freeze(s.split(' ')));

/** Symbol code -> art name (art.js SLOT_SYMBOLS) and words. */
export const SYMBOLS = {
  W: { art: 'crown', name: 'Crown', plural: 'Crowns' },
  D: { art: 'ingot', name: 'Ingots', plural: 'Ingots' },
  B: { art: 'bell', name: 'Bell', plural: 'Bells' },
  H: { art: 'horseshoe', name: 'Horseshoe', plural: 'Horseshoes' },
  C: { art: 'clover', name: 'Clover', plural: 'Clovers' },
  R: { art: 'cherries', name: 'Cherries', plural: 'Cherries' },
};

/** Three of a kind (crowns standing in) pays per coin. */
export const PAY3 = { D: 100, B: 40, H: 20, C: 10 };
export const JACKPOT = 800;          // three crowns, per coin
export const JACKPOT_MAX = 3200;     // three crowns on three coins (instead of 2,400)
export const ANY3 = 3;               // any mix of crown, ingots, bell, horseshoe, clover
export const CHERRIES = { 3: 10, 2: 5, 1: 2 };

/** The pay table rows as the glass shows them: key, words, per-coin pay. */
export const PAY_ROWS = [
  { key: 'WWW', label: 'Crown Crown Crown', pay: JACKPOT },
  { key: 'DDD', label: 'Three ingots', pay: PAY3.D },
  { key: 'BBB', label: 'Three bells', pay: PAY3.B },
  { key: 'HHH', label: 'Three horseshoes', pay: PAY3.H },
  { key: 'CCC', label: 'Three clovers', pay: PAY3.C },
  { key: 'ANY3', label: 'Any three, no cherries', pay: ANY3 },
  { key: 'RRR', label: 'Three cherries', pay: CHERRIES[3] },
  { key: 'RR', label: 'Any two cherries', pay: CHERRIES[2] },
  { key: 'R', label: 'Any one cherry', pay: CHERRIES[1] },
];

/** What a row pays in total for `coins` coins (the third coin boosts the top award). */
export function rowPay(key, coins) {
  const row = PAY_ROWS.find((r) => r.key === key);
  if (!row) return 0;
  if (key === 'WWW' && coins === MAX_COINS) return JACKPOT_MAX;
  return row.pay * coins;
}

/** The symbols on the pay line for the stops [a, b, c]. */
export const lineAt = (stops) => stops.map((s, i) => STRIPS[i][((s % STOPS) + STOPS) % STOPS]);

/** The symbol `offset` stops from `stop` on reel `reel` (-1 above the line, +1 below). */
export const symbolAt = (reel, stop, offset = 0) => STRIPS[reel][(((stop + offset) % STOPS) + STOPS) % STOPS];

/**
 * Evaluate one line of three symbols. Returns the best single win:
 *   { perCoin, row, mult, crowns }   row null and perCoin 0 for no win; mult is the crown
 *   multiplier (1, 2 or 4) already included in perCoin.
 */
export function evaluate(line) {
  const crowns = line.filter((s) => s === 'W').length;
  if (crowns === 3) return { perCoin: JACKPOT, row: 'WWW', mult: 1, crowns };
  const cherries = line.filter((s) => s === 'R').length;
  if (cherries) {
    const key = cherries === 3 ? 'RRR' : cherries === 2 ? 'RR' : 'R';
    return { perCoin: CHERRIES[cherries], row: key, mult: 1, crowns };
  }
  if (line.includes('-')) return { perCoin: 0, row: null, mult: 1, crowns };
  const rest = line.filter((s) => s !== 'W');
  const mult = crowns === 0 ? 1 : crowns === 1 ? 2 : 4;
  const same = new Set(rest).size === 1;
  const row = same ? `${rest[0]}${rest[0]}${rest[0]}` : 'ANY3';
  return { perCoin: (same ? PAY3[rest[0]] : ANY3) * mult, row, mult, crowns };
}

/** Credits won on a line for `coins` coins. */
export function payFor(line, coins) {
  const r = evaluate(line);
  if (r.row === 'WWW' && coins === MAX_COINS) return JACKPOT_MAX;
  return r.perCoin * coins;
}

/** One spin: three stops, the pay line, and what it pays for `coins` coins. */
export function spin(rng, coins = 1) {
  if (!Number.isInteger(coins) || coins < 1 || coins > MAX_COINS) throw new Error(`Bet one to ${MAX_COINS} coins.`);
  const stops = [rng.int(STOPS), rng.int(STOPS), rng.int(STOPS)];
  const line = lineAt(stops);
  const ev = evaluate(line);
  return { stops, line, coins, ...ev, won: payFor(line, coins) };
}

/** Exact return by enumerating every stop combination: { base, max, hit, jackpots, n, dist }.
 *  base is the return per coin at one or two coins, max at three coins. */
export function exactReturn(strips = STRIPS) {
  let total = 0, hits = 0, n = 0, jackpots = 0;
  const dist = {};
  for (const a of strips[0]) for (const b of strips[1]) for (const c of strips[2]) {
    const p = evaluate([a, b, c]).perCoin;
    n++; total += p;
    if (p) hits++;
    if (p === JACKPOT) jackpots++;
    dist[p] = (dist[p] ?? 0) + 1;
  }
  const max = (MAX_COINS * total + jackpots * (JACKPOT_MAX - JACKPOT * MAX_COINS)) / (MAX_COINS * n);
  return { base: total / n, max, hit: hits / n, jackpots, n, dist };
}

/** Words for a result: "Three bells with a crown: 80 credits". */
export function describe(r) {
  if (!r.row) return 'No win';
  const row = PAY_ROWS.find((x) => x.key === r.row);
  const crown = r.row !== 'WWW' && r.crowns ? ` with ${r.crowns === 1 ? 'a crown (x2)' : 'two crowns (x4)'}` : '';
  return `${row.label}${crown}`;
}
