// Roulette rules, with no DOM: the double-zero (American) and single-zero (European) wheels, every
// bet on the layout, payouts, the half-back rule and a fair random spin. Pockets are strings:
// '0', '00' and '1'..'36'.
//
// Bet keys (what the layout's betting areas carry):
//   'n:17', 'n:0', 'n:00'          straight up, 35 to 1
//   'split:17-20', 'split:0-00'    two numbers side by side, 17 to 1
//   'street:16' (16-17-18), 'street:0-1-2', 'street:00-2-3' (double zero), 'street:0-2-3' (single)
//                                  three numbers, 11 to 1
//   'corner:13-14-16-17'           four numbers meeting at a corner, 8 to 1
//   'first4' (single zero: 0-1-2-3, 8 to 1), 'basket' (double zero: 0-00-1-2-3, 6 to 1)
//   'line:13-18'                   two streets side by side (six numbers), 5 to 1
//   'dozen:1'..'dozen:3', 'col:1'..'col:3'                    2 to 1
//   'red' 'black' 'odd' 'even' 'low' (1-18) 'high' (19-36)   even money
// 0 and 00 lose every outside bet, unless the half-back rule is on: then every even-money bet gets
// half its stake back (rounded down) when the ball lands in a zero.
import { cryptoRng, randomInt } from '../kit/rng.js';
import { createRound } from '../kit/round.js';

export const OPTIONS = [
  { key: 'wheel', label: 'Wheel', type: 'select', default: 'american', options: [['american', 'Double zero (0 and 00)'], ['european', 'Single zero']] },
  { key: 'halfback', label: 'Half back on even-money bets when a zero comes up', type: 'check', default: false },
];

const NUMBERS = Array.from({ length: 36 }, (_, i) => String(i + 1));
export const POCKETS = ['0', '00', ...NUMBERS];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Pocket order round each wheel, clockwise from 0. */
export const WHEELS = {
  american: ['0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22', '34', '15', '3', '24', '36', '13', '1',
    '00', '27', '10', '25', '29', '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35', '14', '2'],
  european: ['0', '32', '15', '19', '4', '21', '2', '25', '17', '34', '6', '27', '13', '36', '11', '30', '8', '23', '10',
    '5', '24', '16', '33', '1', '20', '14', '31', '9', '22', '18', '29', '7', '28', '12', '35', '3', '26'],
};
/** The double-zero wheel (the default). */
export const WHEEL = WHEELS.american;
export const wheelOf = (name) => WHEELS[name] ?? WHEEL;
const isSingle = (wheel) => wheel === 'european';

const num = (p) => (p === '0' || p === '00' ? 0 : Number(p));
export const colorOf = (p) => (num(p) === 0 ? 'green' : RED.has(num(p)) ? 'red' : 'black');

/** Column of a number 1-36: column 1 holds 1, 4, 7 ... 34; column 3 holds 3, 6 ... 36. */
export const columnOf = (n) => ((n - 1) % 3) + 1;

const OUTSIDE = {
  red: (n) => RED.has(n), black: (n) => !RED.has(n),
  odd: (n) => n % 2 === 1, even: (n) => n % 2 === 0,
  low: (n) => n <= 18, high: (n) => n >= 19,
};
const EVEN_MONEY = new Set(Object.keys(OUTSIDE));

// ---- the inside bets that sit on the lines between numbers, for each wheel
const range = (a, n) => Array.from({ length: n }, (_, i) => String(a + i));
function insideBets(wheel) {
  const out = new Map(); // key -> covered pockets
  for (let n = 1; n <= 36; n++) {
    if (n % 3 !== 0) out.set(`split:${n}-${n + 1}`, [String(n), String(n + 1)]);   // up a street
    if (n <= 33) out.set(`split:${n}-${n + 3}`, [String(n), String(n + 3)]);       // along a row
    if (n % 3 !== 0 && n <= 32) out.set(`corner:${n}-${n + 1}-${n + 3}-${n + 4}`, [n, n + 1, n + 3, n + 4].map(String));
  }
  for (let a = 1; a <= 34; a += 3) {
    out.set(`street:${a}`, range(a, 3));
    if (a <= 31) out.set(`line:${a}-${a + 5}`, range(a, 6));
  }
  if (isSingle(wheel)) {
    for (const k of ['1', '2', '3']) out.set(`split:0-${k}`, ['0', k]);
    out.set('street:0-1-2', ['0', '1', '2']);
    out.set('street:0-2-3', ['0', '2', '3']);
    out.set('first4', ['0', '1', '2', '3']);
  } else {
    out.set('split:0-00', ['0', '00']);
    out.set('split:0-1', ['0', '1']);
    out.set('split:0-2', ['0', '2']);
    out.set('split:00-2', ['00', '2']);
    out.set('split:00-3', ['00', '3']);
    out.set('street:0-1-2', ['0', '1', '2']);
    out.set('street:00-2-3', ['00', '2', '3']);
    out.set('basket', ['0', '00', '1', '2', '3']);
  }
  return out;
}
const INSIDE = { american: insideBets('american'), european: insideBets('european') };

/** The pockets a bet covers (null for a bet that isn't on this wheel's layout). */
export function covers(key, wheel = 'american') {
  if (typeof key !== 'string') return null;
  const pockets = wheelOf(wheel);
  if (key.startsWith('n:')) return pockets.includes(key.slice(2)) ? [key.slice(2)] : null;
  const inside = (INSIDE[wheel] ?? INSIDE.american).get(key);
  if (inside) return inside;
  let m;
  if ((m = /^dozen:([123])$/.exec(key))) return range(12 * (m[1] - 1) + 1, 12);
  if ((m = /^col:([123])$/.exec(key))) return NUMBERS.filter((p) => columnOf(Number(p)) === Number(m[1]));
  if (Object.hasOwn(OUTSIDE, key)) return NUMBERS.filter((p) => OUTSIDE[key](Number(p)));
  return null;
}

/** Every bet key on a wheel's layout. */
export const allBets = (wheel = 'american') => [
  ...wheelOf(wheel).map((p) => `n:${p}`), ...(INSIDE[wheel] ?? INSIDE.american).keys(),
  'dozen:1', 'dozen:2', 'dozen:3', 'col:1', 'col:2', 'col:3', ...Object.keys(OUTSIDE),
];

export const BET_NAMES = { red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1 to 18', high: '19 to 36', first4: 'First four (0-1-2-3)', basket: 'Five numbers (0-00-1-2-3)' };
export function betName(key) {
  if (key.startsWith('n:')) return `Straight up ${key.slice(2)}`;
  if (key.startsWith('dozen:')) return ['1st', '2nd', '3rd'][key.slice(6) - 1] + ' 12';
  if (key.startsWith('col:')) return `Column ${key.slice(4)}`;
  if (key.startsWith('split:')) return `Split ${key.slice(6)}`;
  if (key.startsWith('street:')) { const c = covers(key, 'american') ?? covers(key, 'european'); return `Street ${c.join('-')}`; }
  if (key.startsWith('corner:')) return `Corner ${key.slice(7)}`;
  if (key.startsWith('line:')) return `Six line ${key.slice(5)}`;
  return BET_NAMES[key] ?? key;
}

export function isBetKey(key, wheel = 'american') { return covers(key, wheel) != null; }

/** Winnings per dollar on a winning bet (the stake comes back on top). */
export function payout(key) {
  if (key === 'basket') return 6;
  if (key === 'first4') return 8;
  if (key.startsWith('dozen:') || key.startsWith('col:')) return 2;
  if (EVEN_MONEY.has(key)) return 1;
  const n = (covers(key, 'american') ?? covers(key, 'european'))?.length ?? 0;
  return { 1: 35, 2: 17, 3: 11, 4: 8, 6: 5 }[n] ?? 0;
}

/** Does `key` win when the ball lands in `pocket`? */
export function wins(key, pocket) {
  const c = covers(key, 'american') ?? covers(key, 'european');
  return Boolean(c?.includes(pocket));
}

/** Is this an inside bet (on the numbers, counted together for the table minimum)? */
export const isInside = (key) => /^(n|split|street|corner|line):/.test(key) || key === 'basket' || key === 'first4';

export const total = (bets) => Object.values(bets).reduce((t, v) => t + v, 0);

/**
 * Settle every bet on the layout. bets: { key: dollars }. With { halfback: true } an even-money bet
 * gets half its stake back (rounded down) when the ball lands in 0 or 00.
 * Returns { wagered, returned, net, winners: [{ key, stake, paid }], halves: [{ key, stake, back }] }
 * where `returned` is what goes back to the bank (each winning stake plus its winnings, and halves).
 */
export function settle(bets, pocket, { halfback = false } = {}) {
  const winners = [], halves = [];
  let returned = 0;
  for (const [key, stake] of Object.entries(bets)) {
    if (!stake) continue;
    if (wins(key, pocket)) {
      const paid = stake + stake * payout(key);
      winners.push({ key, stake, paid });
      returned += paid;
    } else if (halfback && num(pocket) === 0 && EVEN_MONEY.has(key)) {
      const back = Math.floor(stake / 2);
      halves.push({ key, stake, back });
      returned += back;
    }
  }
  const wagered = total(bets);
  return { wagered, returned, net: returned - wagered, winners, halves };
}

const usd = (n) => `$${n.toLocaleString('en-US')}`;

/**
 * Table limits: every outside bet (dozen, column, even money) must be at least the table minimum,
 * the inside bets (numbers) must add up to at least the minimum, and no single spot may go over the
 * maximum (max null = no limit). Returns an error message, or null when the bets are fine.
 */
export function checkLimits(bets, { min, max }) {
  const placed = Object.entries(bets).filter(([, v]) => v > 0);
  if (!placed.length) return 'Place a bet first.';
  const small = placed.find(([k, v]) => !isInside(k) && v < min);
  if (small) return `Each outside bet must be at least the table minimum of ${usd(min)} (${betName(small[0])} has ${usd(small[1])}).`;
  const inside = placed.filter(([k]) => isInside(k)).reduce((t, [, v]) => t + v, 0);
  if (inside > 0 && inside < min) return `Your bets on numbers must add up to at least the table minimum of ${usd(min)}.`;
  if (max != null && placed.some(([, v]) => v > max)) return `The most on one bet is ${usd(max)}.`;
  return null;
}

export { randomInt };

const defaultRng = cryptoRng();
/** Spin: the pocket the ball lands in (`rng` from kit/rng.js; tests pass a seeded one). */
export const spin = (rng = defaultRng, wheel = 'american') => { const w = wheelOf(wheel); return w[rng.int(w.length)]; };

/**
 * One whole spin against a bank, settled at once: checks the limits, takes the wager, picks the
 * pocket, records the hand and pays the winnings, all before any animation starts, so a reload or
 * leaving the table mid-spin can never lose a payout. `bank` is the shared bank (or anything with
 * the same debit / credit / recordHand). The hand is recorded before the payout so a payout that
 * reaches the Hall of Fame (which clears the stats) does not leave this hand in the new stats.
 * Returns { error } or { pocket, wagered, returned, net, winners }.
 */
export function playSpin(bank, bets, limits, { game = 'roulette', wheel = 'american', halfback = false, pocket = spin(undefined, wheel) } = {}) {
  const error = checkLimits(bets, limits);
  if (error) return { error };
  const r = settle(bets, pocket, { halfback });
  const round = createRound(bank, game);
  if (!round.wager(r.wagered)) return { error: 'The bank can\'t cover those bets.' };
  round.settle({ returned: r.returned });
  return { pocket, ...r };
}
