// Craps rules, with no DOM: the come-out and the point, every bet on the layout, when each one may
// go down or come off, and what each roll pays. The player is always the shooter.
//
// The table is plain data: { point: null | 4..10, bets: { key: dollars }, opts, rolls }.
// Bet keys (the layout's data-spot values):
//   pass, pass-odds, dp, dp-odds          line bets and their odds
//   come, dc                              the Come and Don't Come boxes (they travel to a number)
//   come:6, come:6-odds, dc:6, dc:6-odds  a come / don't come bet sitting on 6, and its odds
//   place:N, buy:N, lay:N                 N = 4, 5, 6, 8, 9, 10
//   field, big6, big8, hard:4/6/8/10
//   any7, craps, two, three, yo, twelve, horn    one-roll bets
//
// Money: every amount is whole dollars; a win is worked out exactly and rounded down. A winning
// bet either comes down with its winnings (line, come, one-roll bets) or stays up and only the
// winnings are paid (place, buy, lay, big 6/8, hardways, and a winning pass or don't pass bet,
// which stays on the line for the next come-out).

export const POINTS = [4, 5, 6, 8, 9, 10];
const ONE_ROLL = new Set(['field', 'any7', 'craps', 'two', 'three', 'yo', 'twelve', 'horn']);

export const OPTIONS = [
  { key: 'odds', label: 'Free odds', type: 'select', options: [[1, '1 times the line bet'], [2, '2 times'], [3, '3 times'], [5, '5 times'], [10, '10 times']], default: 3 },
  { key: 'maxOdds', label: 'Clicking a line bet after the point takes the most odds', type: 'check', default: true },
  { key: 'working', label: 'Place, buy and come odds work on the come-out roll', type: 'check', default: false },
  { key: 'field12', label: 'Field pays on 12', type: 'select', options: [[2, '2 to 1'], [3, '3 to 1']], default: 2 },
];
export const DEFAULTS = Object.fromEntries(OPTIONS.map((o) => [o.key, o.default]));

// [to, for]: a win pays stake * to / for, rounded down
const TRUE_ODDS = { 4: [2, 1], 10: [2, 1], 5: [3, 2], 9: [3, 2], 6: [6, 5], 8: [6, 5] };
const LAY_ODDS = { 4: [1, 2], 10: [1, 2], 5: [2, 3], 9: [2, 3], 6: [5, 6], 8: [5, 6] };
const PLACE_PAYS = { 4: [9, 5], 10: [9, 5], 5: [7, 5], 9: [7, 5], 6: [7, 6], 8: [7, 6] };
const HARD_PAYS = { 4: 7, 10: 7, 6: 9, 8: 9 };
const PROP_PAYS = { any7: 4, craps: 7, two: 30, twelve: 30, three: 15, yo: 15 };
const PROP_WINS = { any7: [7], craps: [2, 3, 12], two: [2], twelve: [12], three: [3], yo: [11] };

const pays = ([to, per], stake) => Math.floor((stake * to) / per);
export const placePays = (n, stake) => pays(PLACE_PAYS[n], stake);
export const trueOddsPays = (n, stake) => pays(TRUE_ODDS[n], stake);
export const layOddsPays = (n, stake) => pays(LAY_ODDS[n], stake);
/** The 5% commission on a buy (of the bet) or a lay (of what it would win): at least $1. */
export const commission = (base) => Math.max(1, Math.floor(base * 0.05));

const usd = (n) => `$${n.toLocaleString('en-US')}`;
const WORDS = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' };

// ------------------------------------------------------------------ keys and names
/** Split a key: 'come:6-odds' -> { kind: 'come', n: 6, odds: true }. */
export function parseKey(key) {
  const m = /^([a-z0-9]+)(?::(\d+))?(-odds)?$/.exec(String(key));
  if (!m) return null;
  return { kind: m[1], n: m[2] ? Number(m[2]) : null, odds: Boolean(m[3]) };
}

export function isBetKey(key) {
  const p = parseKey(key);
  if (!p) return false;
  const { kind, n, odds } = p;
  if (n == null) {
    if (odds) return kind === 'pass' || kind === 'dp';
    return ['pass', 'dp', 'come', 'dc', 'field', 'big6', 'big8', ...ONE_ROLL].includes(kind);
  }
  if (kind === 'hard') return !odds && n in HARD_PAYS;
  if (!POINTS.includes(n)) return false;
  if (kind === 'come' || kind === 'dc') return true;
  return !odds && ['place', 'buy', 'lay'].includes(kind);
}

const NAMES = {
  pass: 'Pass line', 'pass-odds': 'Pass line odds', dp: "Don't pass", 'dp-odds': "Don't pass odds",
  come: 'Come', dc: "Don't come", field: 'Field', big6: 'Big 6', big8: 'Big 8',
  any7: 'Any seven', craps: 'Any craps', two: 'Two', three: 'Three', yo: 'Eleven', twelve: 'Twelve', horn: 'Horn',
};
export function betName(key) {
  if (NAMES[key]) return NAMES[key];
  const p = parseKey(key);
  if (!p) return String(key);
  const { kind, n, odds } = p;
  if (kind === 'come') return `Come ${n}${odds ? ' odds' : ''}`;
  if (kind === 'dc') return `Don't come ${n}${odds ? ' odds' : ''}`;
  if (kind === 'place') return `Place ${n}`;
  if (kind === 'buy') return `Buy ${n}`;
  if (kind === 'lay') return `Lay ${n}`;
  if (kind === 'hard') return `Hard ${n}`;
  return String(key);
}

/** What a bet pays, in words, for the layout and How to play. */
export function paysText(key, opts = DEFAULTS) {
  const p = parseKey(key);
  if (!p) return '';
  const { kind, n, odds } = p;
  const ratio = ([a, b]) => `${a} to ${b}`;
  if (odds) {
    const num = n ?? null;
    if (kind === 'pass' || kind === 'come') return num ? ratio(TRUE_ODDS[num]) : 'true odds';
    return num ? ratio(LAY_ODDS[num]) : 'true odds';
  }
  if (kind === 'place') return ratio(PLACE_PAYS[n]);
  if (kind === 'buy') return `${ratio(TRUE_ODDS[n])} less 5%`;
  if (kind === 'lay') return `${ratio(LAY_ODDS[n])} less 5%`;
  if (kind === 'hard') return `${HARD_PAYS[n]} to 1`;
  if (kind in PROP_PAYS) return `${PROP_PAYS[kind]} to 1`;
  if (kind === 'field') return `even money, 2 pays 2 to 1, 12 pays ${opts.field12} to 1`;
  if (kind === 'horn') return '2 and 12 pay 30 to 1, 3 and 11 pay 15 to 1 (a quarter each)';
  return 'even money';
}

// ------------------------------------------------------------------ the table
export function newTable(opts = {}) {
  return { point: null, bets: {}, opts: { ...DEFAULTS, ...opts }, rolls: 0 };
}

export const onTable = (state) => Object.values(state.bets).reduce((t, v) => t + v, 0);
export const minBuyIn = (stakes) => stakes.min;

/** Does a bet act on the next roll? Place and buy bets and come odds are off on the come-out
 *  (unless the `working` option is on); everything else always works. */
export function isWorking(state, key) {
  if (state.point != null || state.opts.working) return true;
  const p = parseKey(key);
  if (!p) return false;
  if (p.kind === 'place' || p.kind === 'buy') return false;
  if (p.kind === 'come' && p.odds) return false;
  return true;
}

/** The flat bet that odds stand behind ('pass-odds' -> 'pass'), or null. */
export const flatOf = (key) => (key.endsWith('-odds') ? key.slice(0, -5) : null);
/** The number odds are on: the point for line bets, the box for come / don't come. */
const oddsNumber = (state, key) => parseKey(key).n ?? state.point;

/** The most odds that may stand behind a flat bet (the flat counts what is staged too). */
export function oddsMax(state, key, staged = {}) {
  const flat = flatOf(key);
  const n = oddsNumber(state, key);
  if (!flat || !n) return 0;
  const base = (state.bets[flat] ?? 0) + (staged[flat] ?? 0);
  const mult = state.opts.odds;
  if (key.startsWith('pass') || key.startsWith('come')) return base * mult;
  // a lay: what it can *win* is capped at odds x flat
  const [to, per] = LAY_ODDS[n];
  return Math.floor((base * mult * per) / to);
}

/**
 * A neat amount of odds no bigger than `max`: one that pays in whole dollars when it can
 * (5 and 9 in twos, 6 and 8 in fives; lays in twos, threes and sixes).
 */
export function neatOdds(state, key, max) {
  const n = oddsNumber(state, key);
  const right = key.startsWith('pass') || key.startsWith('come');
  const step = right ? { 4: 1, 10: 1, 5: 2, 9: 2, 6: 5, 8: 5 }[n] : { 4: 2, 10: 2, 5: 3, 9: 3, 6: 6, 8: 6 }[n];
  const neat = Math.floor(max / step) * step;
  return neat > 0 ? neat : max;
}

/** Why a chip can't go on `key` now, or null when it can. `staged` = chips not yet rolled on. */
export function whyNot(state, key, staged = {}) {
  if (!isBetKey(key)) return 'That is not a bet on this table.';
  const p = parseKey(key);
  const on = state.point != null;
  const has = (k) => (state.bets[k] ?? 0) > 0;
  if (p.odds) {
    const flat = flatOf(key);
    if (flat === 'pass' || flat === 'dp') {
      if (!on) return 'Odds go behind a line bet once the point is set.';
      if (!has(flat) && !(flat === 'pass' && staged.pass)) return `Odds need a ${betName(flat)} bet first.`;
      return null;
    }
    if (!has(flat)) return `Odds need a ${betName(flat)} bet first.`;
    if (p.kind === 'come' && !on) return 'Come odds go down while a point is on.';
    return null;
  }
  if (p.kind === 'come' || p.kind === 'dc') {
    if (p.n != null) return 'A come bet travels to its number by itself: put chips in the Come box.';
    if (!on) return `${betName(key)} bets go down once the point is set; on the come-out use the ${p.kind === 'come' ? 'Pass line' : "Don't pass bar"}.`;
    return null;
  }
  if (key === 'dp' && on) return "Don't pass bets go down before the come-out roll only.";
  if (['place', 'buy', 'lay'].includes(p.kind) && !on) return `${betName(key)} goes down once the point is set.`;
  return null;
}

/**
 * The limits for more chips on `key` now: { min, max } for what may be *added* (max null = no
 * limit), or null when the spot is closed. The table minimum applies to each bet (a bet already
 * up counts toward it); odds have no minimum and their own maximum (odds x the flat bet).
 */
export function limits(state, key, stakes, staged = {}) {
  if (whyNot(state, key, staged)) return null;
  const now = state.bets[key] ?? 0;
  if (key.endsWith('-odds')) return { min: 0, max: Math.max(0, oddsMax(state, key, staged) - now) };
  return { min: Math.max(0, stakes.min - now), max: stakes.max == null || !Number.isFinite(stakes.max) ? null : Math.max(0, stakes.max - now) };
}

/** The first problem with a set of staged chips, or null. With { mins: false } a bet under the
 *  table minimum is let through (the casino shell offers to raise it). */
export function checkStaged(state, staged, stakes, { mins = true } = {}) {
  for (const [key, amount] of Object.entries(staged)) {
    if (!amount) continue;
    if (!Number.isSafeInteger(amount) || amount < 0) return 'Bets are whole dollars.';
    const why = whyNot(state, key, staged);
    if (why) return why;
    const lim = limits(state, key, stakes, staged);
    if (lim.max != null && amount > lim.max) {
      return key.endsWith('-odds')
        ? `The most odds behind ${betName(flatOf(key))} is ${usd(oddsMax(state, key, staged))} (${state.opts.odds} times).`
        : `Table max is ${usd(stakes.max)} on ${betName(key)}.`;
    }
    if (mins && amount < lim.min) return `Your bet on ${betName(key)} doesn't cover the ${usd(stakes.min)} minimum.`;
    if (key === 'horn' && amount % 4) return 'The horn splits into four equal bets: make it a multiple of $4.';
  }
  return null;
}

/** The commission on staged buy and lay bets, taken when they go down (and never handed back). */
export function vigFor(staged) {
  let vig = 0;
  for (const [key, amount] of Object.entries(staged)) {
    if (!amount) continue;
    const p = parseKey(key);
    if (p?.kind === 'buy') vig += commission(amount);
    if (p?.kind === 'lay') vig += commission(layOddsPays(p.n, amount));
  }
  return vig;
}

/** Put staged chips on the table (the Roll button commits them). Throws on an illegal bet. */
export function commit(state, staged, stakes = { min: 0, max: null }) {
  const err = checkStaged(state, staged, stakes);
  if (err) throw new Error(err);
  const s = structuredClone(state);
  for (const [key, amount] of Object.entries(staged)) if (amount) s.bets[key] = (s.bets[key] ?? 0) + amount;
  return s;
}

/** Why a bet on the table can't be taken down now, or null when it can. */
export function whyFixed(state, key) {
  if (!state.bets[key]) return 'There is no bet there to take down.';
  const p = parseKey(key);
  if (key === 'pass' && state.point != null) return 'A pass line bet stays up once the point is set.';
  if (p.kind === 'come' && p.n != null && !p.odds) return 'A come bet stays on its number until it wins or loses (its odds can come down).';
  if (key === 'dc') return "A don't come bet stays in its box until it travels to a number.";
  if (key === 'come') return 'A come bet stays in its box until the next roll.';
  return null;
}

/** Take a bet down: it comes back whole (a don't bet takes its odds with it). -> { state, refund, keys } */
export function takeDown(state, key) {
  const why = whyFixed(state, key);
  if (why) throw new Error(why);
  const s = structuredClone(state);
  const keys = [key];
  if (!key.endsWith('-odds') && s.bets[`${key}-odds`]) keys.push(`${key}-odds`);
  let refund = 0;
  for (const k of keys) { refund += s.bets[k]; delete s.bets[k]; }
  return { state: s, refund, keys };
}

/** What leaving the table now would hand back: every bet that may be taken down. */
export function returnable(state) {
  return Object.keys(state.bets).filter((k) => !whyFixed(state, k)).reduce((t, k) => t + state.bets[k], 0);
}

// ------------------------------------------------------------------ the roll
/** Two fair dice. */
export const rollDice = (rng) => [rng.int(6) + 1, rng.int(6) + 1];

/** "easy six", "hard eight", "seven", "yo-leven" ... */
export function rollName([a, b]) {
  const t = a + b;
  if (t === 11) return 'eleven';
  if (t === 2) return 'aces';
  if (t === 12) return 'twelve';
  if ([4, 6, 8, 10].includes(t)) return `${a === b ? 'hard' : 'easy'} ${WORDS[t]}`;
  return WORDS[t];
}

/**
 * Roll the dice on the table. Returns
 *   { state, total, hard, event, outcomes, wagered, returned, net }
 * outcomes: [{ key, stake, result: 'win' | 'lose' | 'push' | 'off' | 'move', won, back, down, to? }]
 *   won  = winnings (0 unless it won); back = dollars to the bank now (stake + won when the bet
 *   comes down, just `won` when it stays up); down = the bet left the table; to = where a come
 *   bet travelled. 'off' = a bet that wasn't working handed back; 'push' = it stays, no money.
 * wagered = stakes this roll decided (they leave the table), returned = all `back`s.
 * event: 'natural' | 'craps' | 'point' (set) | 'made' | 'sevenout' | null.
 */
export function resolve(state, dice) {
  const [a, b] = dice;
  if (![a, b].every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) throw new RangeError(`resolve: ${dice} are not two dice`);
  const t = a + b, hard = a === b;
  const s = structuredClone(state);
  const point = s.point;
  const out = [];
  const bets = s.bets;
  const win = (key, won, { stays = false } = {}) => {
    const stake = bets[key];
    out.push({ key, stake, result: 'win', won, back: stays ? won : stake + won, down: !stays });
    if (!stays) delete bets[key];
  };
  const lose = (key) => { out.push({ key, stake: bets[key], result: 'lose', won: 0, back: 0, down: true }); delete bets[key]; };
  const push = (key, { stays = false } = {}) => {
    const stake = bets[key];
    out.push({ key, stake, result: stays ? 'push' : 'off', won: 0, back: stays ? 0 : stake, down: !stays });
    if (!stays) delete bets[key];
  };
  const working = (key) => isWorking(state, key);

  // one-roll bets
  for (const key of Object.keys(bets)) {
    if (!ONE_ROLL.has(key)) continue;
    const stake = bets[key];
    if (key === 'field') {
      if ([3, 4, 9, 10, 11].includes(t)) win(key, stake);
      else if (t === 2) win(key, stake * 2);
      else if (t === 12) win(key, stake * s.opts.field12);
      else lose(key);
    } else if (key === 'horn') {
      const q = stake / 4;
      const back = [2, 12].includes(t) ? Math.floor(q * 31) : [3, 11].includes(t) ? Math.floor(q * 16) : 0;
      if (back) { out.push({ key, stake, result: 'win', won: back - stake, back, down: true }); delete bets[key]; } else lose(key);
    } else if (PROP_WINS[key].includes(t)) win(key, stake * PROP_PAYS[key]);
    else lose(key);
  }

  // hardways, big 6 / 8 (always working; they stay up when they win)
  for (const n of [4, 6, 8, 10]) {
    const key = `hard:${n}`;
    if (!bets[key]) continue;
    if (t === n && hard) win(key, bets[key] * HARD_PAYS[n], { stays: true });
    else if (t === n || t === 7) lose(key);
  }
  for (const n of [6, 8]) {
    const key = `big${n}`;
    if (!bets[key]) continue;
    if (t === n) win(key, bets[key], { stays: true });
    else if (t === 7) lose(key);
  }

  // place, buy, lay
  for (const n of POINTS) {
    for (const kind of ['place', 'buy']) {
      const key = `${kind}:${n}`;
      if (!bets[key] || !working(key)) continue;
      if (t === n) win(key, kind === 'place' ? placePays(n, bets[key]) : trueOddsPays(n, bets[key]), { stays: true });
      else if (t === 7) lose(key);
    }
    const lay = `lay:${n}`;
    if (bets[lay]) {
      if (t === 7) win(lay, layOddsPays(n, bets[lay]), { stays: true });
      else if (t === n) lose(lay);
    }
  }

  // come and don't come bets already on their numbers, with their odds
  for (const n of POINTS) {
    const c = `come:${n}`, co = `${c}-odds`;
    if (t === n || t === 7) {
      if (bets[co]) {
        if (!working(co)) push(co);
        else if (t === n) win(co, trueOddsPays(n, bets[co]));
        else lose(co);
      }
      if (bets[c]) { if (t === n) win(c, bets[c]); else lose(c); }
    }
    const d = `dc:${n}`, dO = `${d}-odds`;
    if (t === n || t === 7) {
      if (bets[dO]) { if (t === 7) win(dO, layOddsPays(n, bets[dO])); else lose(dO); }
      if (bets[d]) { if (t === 7) win(d, bets[d]); else lose(d); }
    }
  }

  // the Come and Don't Come boxes: each is its own come-out
  if (bets.come) {
    if (t === 7 || t === 11) win('come', bets.come);
    else if ([2, 3, 12].includes(t)) lose('come');
    else {
      out.push({ key: 'come', stake: bets.come, result: 'move', won: 0, back: 0, down: false, to: `come:${t}` });
      bets[`come:${t}`] = (bets[`come:${t}`] ?? 0) + bets.come;
      delete bets.come;
    }
  }
  if (bets.dc) {
    if (t === 2 || t === 3) win('dc', bets.dc);
    else if (t === 12) push('dc', { stays: true });
    else if (t === 7 || t === 11) lose('dc');
    else {
      out.push({ key: 'dc', stake: bets.dc, result: 'move', won: 0, back: 0, down: false, to: `dc:${t}` });
      bets[`dc:${t}`] = (bets[`dc:${t}`] ?? 0) + bets.dc;
      delete bets.dc;
    }
  }

  // the line
  let event = null;
  if (point == null) {
    if (t === 7 || t === 11) {
      event = 'natural';
      if (bets.pass) win('pass', bets.pass, { stays: true });
      if (bets.dp) lose('dp');
    } else if ([2, 3, 12].includes(t)) {
      event = 'craps';
      if (bets.pass) lose('pass');
      if (bets.dp) { if (t === 12) push('dp', { stays: true }); else win('dp', bets.dp, { stays: true }); }
    } else {
      event = 'point';
      s.point = t;
    }
  } else if (t === point || t === 7) {
    const made = t === point;
    event = made ? 'made' : 'sevenout';
    if (bets['pass-odds']) { if (made) win('pass-odds', trueOddsPays(point, bets['pass-odds'])); else lose('pass-odds'); }
    if (bets.pass) { if (made) win('pass', bets.pass, { stays: true }); else lose('pass'); }
    if (bets['dp-odds']) { if (!made) win('dp-odds', layOddsPays(point, bets['dp-odds'])); else lose('dp-odds'); }
    if (bets.dp) { if (!made) win('dp', bets.dp, { stays: true }); else lose('dp'); }
    s.point = null;
  }

  s.rolls += 1;
  let wagered = 0, returned = 0;
  for (const o of out) {
    returned += o.back;
    if (o.down) wagered += o.stake; // it left the table (won, lost or handed back); a bet that stays up didn't
  }
  return { state: s, dice: [a, b], total: t, hard, event, outcomes: out, wagered, returned, net: returned - wagered };
}

/** One line per roll for the message bar: "Rolled 4 + 2 = 6 (easy six). Place 6 wins $14. Field loses $10." */
export function describe(r, before) {
  const head = `Rolled ${r.dice[0]} + ${r.dice[1]} = ${r.total} (${rollName(r.dice)}).`;
  const ev = {
    natural: 'A natural on the come-out.',
    craps: 'Craps on the come-out.',
    point: `The point is ${r.total}.`,
    made: `Point ${before?.point ?? r.total} made!`,
    sevenout: 'Seven out.',
  }[r.event] ?? '';
  const parts = r.outcomes.map((o) => {
    const name = betName(o.key);
    if (o.result === 'win') return `${name} wins ${usd(o.won)}`;
    if (o.result === 'lose') return `${name} loses ${usd(o.stake)}`;
    if (o.result === 'push') return `${name} is a push`;
    if (o.result === 'off') return `${name} was off and comes back`;
    if (o.result === 'move') return `${name} moves to the ${parseKey(o.to).n}`;
    return '';
  }).filter(Boolean);
  return [head, ev, parts.length ? `${parts.join('. ')}.` : ''].filter(Boolean).join(' ');
}

/**
 * The money for one roll, for the round (kit/round.js): `vig` is the commission taken with the
 * bets committed for this roll (it never comes back, so it is settled as lost at once).
 * -> { settle, wagered, returned, returnable }: when `settle` is true, call
 * round.settle({ returned, wagered, returnable }); otherwise just round.setReturnable(returnable).
 */
export function rollMoney(r, vig = 0) {
  const wagered = r.wagered + vig;
  return { settle: wagered > 0 || r.returned > 0, wagered, returned: r.returned, returnable: returnable(r.state) };
}
