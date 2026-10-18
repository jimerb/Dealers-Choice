// American roulette rules, with no DOM: the 38 pockets (0, 00 and 1-36), the bets, payouts and a
// fair random spin. Pockets are numbers 0-36, with 00 written as the string '00'.
//
// Bet keys (what the layout's betting areas carry):
//   'n:17', 'n:0', 'n:00'      straight up, 35 to 1
//   'red' 'black' 'odd' 'even' 'low' (1-18) 'high' (19-36)   even money
//   'dozen:1'..'dozen:3', 'col:1'..'col:3'                    2 to 1
// 0 and 00 lose every outside bet.

export const POCKETS = ['0', '00', ...Array.from({ length: 36 }, (_, i) => String(i + 1))];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Pocket order round an American wheel, clockwise from 0. */
export const WHEEL = ['0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22', '34', '15', '3', '24', '36', '13', '1',
  '00', '27', '10', '25', '29', '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35', '14', '2'];

const num = (p) => (p === '0' || p === '00' ? 0 : Number(p));
export const colorOf = (p) => (num(p) === 0 ? 'green' : RED.has(num(p)) ? 'red' : 'black');

/** Column of a number 1-36: column 1 holds 1, 4, 7 ... 34; column 3 holds 3, 6 ... 36. */
export const columnOf = (n) => ((n - 1) % 3) + 1;

const OUTSIDE = {
  red: (n) => RED.has(n), black: (n) => !RED.has(n),
  odd: (n) => n % 2 === 1, even: (n) => n % 2 === 0,
  low: (n) => n <= 18, high: (n) => n >= 19,
};

export const BET_NAMES = { red: 'Red', black: 'Black', odd: 'Odd', even: 'Even', low: '1 to 18', high: '19 to 36' };
export function betName(key) {
  if (key.startsWith('n:')) return `Straight up ${key.slice(2)}`;
  if (key.startsWith('dozen:')) return ['1st', '2nd', '3rd'][key.slice(6) - 1] + ' 12';
  if (key.startsWith('col:')) return `Column ${key.slice(4)}`;
  return BET_NAMES[key] ?? key;
}

export function isBetKey(key) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('n:')) return POCKETS.includes(key.slice(2));
  if (/^(dozen|col):[123]$/.test(key)) return true;
  return Object.hasOwn(OUTSIDE, key);
}

/** Winnings per dollar on a winning bet (the stake comes back on top). */
export function payout(key) {
  if (key.startsWith('n:')) return 35;
  if (key.startsWith('dozen:') || key.startsWith('col:')) return 2;
  return 1;
}

/** Does `key` win when the ball lands in `pocket`? */
export function wins(key, pocket) {
  if (key.startsWith('n:')) return key.slice(2) === pocket;
  const n = num(pocket);
  if (n === 0) return false;
  if (key.startsWith('dozen:')) return Math.ceil(n / 12) === Number(key.slice(6));
  if (key.startsWith('col:')) return columnOf(n) === Number(key.slice(4));
  return Object.hasOwn(OUTSIDE, key) && OUTSIDE[key](n);
}

export const total = (bets) => Object.values(bets).reduce((t, v) => t + v, 0);

/**
 * Settle every bet on the layout. bets: { key: dollars }.
 * Returns { wagered, returned, net, winners: [{ key, stake, paid }] } where `returned` is what
 * goes back to the bank (each winning stake plus its winnings).
 */
export function settle(bets, pocket) {
  const winners = [];
  let returned = 0;
  for (const [key, stake] of Object.entries(bets)) {
    if (!stake || !wins(key, pocket)) continue;
    const paid = stake + stake * payout(key);
    winners.push({ key, stake, paid });
    returned += paid;
  }
  const wagered = total(bets);
  return { wagered, returned, net: returned - wagered, winners };
}

/**
 * Table limits: the whole layout must hold at least the table minimum, and no single bet may go
 * over the maximum (max null = no limit). Returns an error message, or null when the bets are fine.
 */
export function checkLimits(bets, { min, max }) {
  const sum = total(bets);
  if (sum === 0) return 'Place a bet first.';
  if (sum < min) return `The table minimum is $${min.toLocaleString('en-US')}.`;
  if (max != null && Object.values(bets).some((v) => v > max)) return `The most on one bet is $${max.toLocaleString('en-US')}.`;
  return null;
}

/** A fair whole number in [0, n) from crypto.getRandomValues (rejection sampling, no modulo bias).
 *  `fill` stands in for crypto.getRandomValues in tests. */
export function randomInt(n, fill = (a) => globalThis.crypto.getRandomValues(a)) {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    fill(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** Spin: the pocket the ball lands in. */
export const spin = (fill) => WHEEL[randomInt(WHEEL.length, fill)];
