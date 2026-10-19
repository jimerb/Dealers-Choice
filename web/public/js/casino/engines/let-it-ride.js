// Let It Ride rules (no DOM). One deck, shuffled for every hand. The player puts out three equal
// bets (1, 2 and $), gets three cards, and two community cards are dealt face down. After seeing
// the three cards the player may pull back bet 1; the first community card is turned; then bet 2
// may be pulled back; the second card is turned and every bet still up is paid on the five-card
// hand. There is no dealer hand.
//
//   deal(base, rng, { cards })     -> state, phase 'first' (base = the size of each bet)
//   decide(state, 'ride' | 'pull') -> state: 'first' -> 'second' -> 'done' (with `result`)
//   payout(cards)                  -> { key, name, mult }  (mult 0: the hand doesn't pay)
//   rideEV(cards)                  -> expected win per dollar of a bet riding on 3 or 4 known cards
//   advise(cards)                  -> { ride, text }
import { newShoe, drawN, stack } from '../kit/shoe.js';
import { rankValue, suitIndex, evaluate, describe } from '../kit/poker.js';

/** The pay table, best first: [key, name, x to 1]. */
export const PAY_TABLE = [
  ['ROYAL', 'Royal flush', 1000],
  ['STRAIGHT_FLUSH', 'Straight flush', 200],
  ['QUADS', 'Four of a kind', 50],
  ['FULL_HOUSE', 'Full house', 11],
  ['FLUSH', 'Flush', 8],
  ['STRAIGHT', 'Straight', 5],
  ['TRIPS', 'Three of a kind', 3],
  ['TWO_PAIR', 'Two pair', 2],
  ['PAIR', 'Pair of tens or better', 1],
];
const MULT = Object.fromEntries(PAY_TABLE.map(([k, , m]) => [k, m]));

export const OPTIONS = [{ key: 'hint', label: 'Show the Hint button', type: 'check', default: false }];

/** Three bets of at least the table minimum. */
export const minBuyIn = (stakes) => 3 * stakes.min;

// ------------------------------------------------------------------ fast five-card pay class
const cnt = new Int8Array(15);
const WHEEL = (1 << 14) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
const ROYAL_MASK = (1 << 14) | (1 << 13) | (1 << 12) | (1 << 11) | (1 << 10);

/** The pay class of five cards given as ranks (2..14) and suits (0..3); 'LOSE' if it doesn't pay. */
export function payClass(r, s) {
  cnt.fill(0);
  let mask = 0;
  for (let i = 0; i < 5; i++) { cnt[r[i]]++; mask |= 1 << r[i]; }
  const flush = s[0] === s[1] && s[1] === s[2] && s[2] === s[3] && s[3] === s[4];
  let pairs = 0, trips = 0, quads = 0, pairRank = 0, lo = 15, hi = 0;
  for (let v = 2; v <= 14; v++) {
    const c = cnt[v];
    if (!c) continue;
    if (v < lo) lo = v;
    hi = v;
    if (c === 2) { pairs++; pairRank = v; } else if (c === 3) trips++; else if (c === 4) quads++;
  }
  const distinct = !pairs && !trips && !quads;
  const straight = distinct && (hi - lo === 4 || mask === WHEEL);
  if (straight && flush) return mask === ROYAL_MASK ? 'ROYAL' : 'STRAIGHT_FLUSH';
  if (quads) return 'QUADS';
  if (trips && pairs) return 'FULL_HOUSE';
  if (flush) return 'FLUSH';
  if (straight) return 'STRAIGHT';
  if (trips) return 'TRIPS';
  if (pairs === 2) return 'TWO_PAIR';
  if (pairs === 1 && pairRank >= 10) return 'PAIR';
  return 'LOSE';
}

const rs = (cards) => [cards.map((c) => rankValue(c)), cards.map(suitIndex)];

/** Five cards -> { key, name, mult } with the hand's own name ("Pair of jacks") in `name`. */
export function payout(cards) {
  const [r, s] = rs(cards);
  const key = payClass(r, s);
  return { key, name: describe(evaluate(cards)), mult: MULT[key] ?? 0 };
}

/**
 * Expected win per dollar of a bet left riding when `cards` (3 or 4) are known and the rest of the
 * five come from the unseen part of the deck: the average of (pay, or -1 for a losing hand).
 */
export function rideEV(cards) {
  const [r0, s0] = rs(cards);
  const seen = new Set(cards.map((c) => `${rankValue(c)}.${suitIndex(c)}`));
  const rest = [];
  for (let v = 2; v <= 14; v++) for (let t = 0; t < 4; t++) if (!seen.has(`${v}.${t}`)) rest.push([v, t]);
  const r = [...r0, 0, 0].slice(0, 5), s = [...s0, 0, 0].slice(0, 5);
  let sum = 0, n = 0;
  const add = () => { const k = payClass(r, s); sum += k === 'LOSE' ? -1 : MULT[k]; n++; };
  if (cards.length === 4) {
    for (const [v, t] of rest) { r[4] = v; s[4] = t; add(); }
  } else if (cards.length === 3) {
    for (let i = 0; i < rest.length; i++) {
      r[3] = rest[i][0]; s[3] = rest[i][1];
      for (let j = i + 1; j < rest.length; j++) { r[4] = rest[j][0]; s[4] = rest[j][1]; add(); }
    }
  } else throw new RangeError('rideEV: 3 or 4 cards');
  return sum / n;
}

// ------------------------------------------------------------------ advice
const HIGH = 10; // ten and up are the high cards that make a paying pair
/** What's in a partial hand: a paying pair or better, suits and straight shape. */
function shape(cards) {
  const [r, s] = rs(cards);
  const counts = new Map();
  for (const v of r) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()];
  const paying = groups.some(([v, c]) => c >= 3 || (c === 2 && v >= HIGH)) || groups.filter(([, c]) => c === 2).length >= 2;
  const lowPair = groups.some(([v, c]) => c === 2 && v < HIGH);
  const suited = s.every((x) => x === s[0]);
  const distinct = counts.size === r.length;
  const sorted = [...counts.keys()].sort((a, b) => a - b);
  // the smallest span a straight could be made in (ace high or low)
  const span = Math.min(sorted[sorted.length - 1] - sorted[0], sorted.includes(14) ? Math.max(...sorted.map((v) => (v === 14 ? 1 : v))) - 1 : 99);
  const highs = r.filter((v) => v >= HIGH).length;
  const royalDraw = suited && distinct && r.every((v) => v >= 10);
  return { paying, lowPair, suited, distinct, span, highs, royalDraw, outside: distinct && span === 3 && sorted[0] !== 14 && sorted[sorted.length - 1] !== 14 && sorted[0] >= 2 };
}

/** Ride or pull, for 3 cards (bet 1) or 4 cards (bet 2), with the reason in plain words. */
export function advise(cards) {
  const ev = rideEV(cards);
  const ride = ev > -1e-9; // an even bet (four to an outside straight with no high cards) rides, as the usual strategy says
  const f = shape(cards);
  const four = cards.length === 4;
  let why;
  if (f.paying) why = 'you already hold a paying hand';
  else if (ride && f.royalDraw) why = four ? 'four to a royal flush' : 'three to a royal flush';
  else if (ride && four && f.suited) why = 'four to a flush';
  else if (ride && four && f.outside) why = 'four to an open-ended straight';
  else if (ride && four && f.distinct && f.span === 4 && f.highs === 4) why = 'four to an inside straight with four high cards';
  else if (ride && f.suited) why = 'three suited cards close enough together for a straight flush';
  else if (ride) why = 'the odds favour these cards';
  else if (f.lowPair) why = 'a pair below tens doesn\'t pay, and it needs to improve';
  else if (four && f.suited) why = 'not enough to make riding pay';
  else why = four ? 'no paying hand and no strong draw' : 'no paying hand and too little to draw to';
  return { ride, ev, text: `${ride ? 'Let it ride' : 'Pull it back'}: ${why}.` };
}

// ------------------------------------------------------------------ a hand
const whole = (n) => Number.isSafeInteger(n) && n > 0;

/** Deal a hand with three bets of `base`. `cards` (tests) stacks the deck: three for the player, then the two community cards. */
export function deal(base, rng, { cards = null } = {}) {
  if (!whole(base)) throw new Error('Each bet is a whole number of dollars.');
  const shoe = newShoe({ decks: 1, penetration: 1 }, rng);
  if (cards) stack(shoe, cards);
  return { phase: 'first', base, player: drawN(shoe, 3), community: drawN(shoe, 2), riding: [true, true, true], shown: 0, result: null };
}

/** Let the current bet ride or pull it back; the next community card turns. */
export function decide(state, choice) {
  if (!['ride', 'pull'].includes(choice)) throw new Error('Let it ride or pull it back.');
  if (state.phase !== 'first' && state.phase !== 'second') throw new Error('This hand is already over.');
  const s = structuredClone(state);
  const i = s.phase === 'first' ? 0 : 1;
  s.riding[i] = choice === 'ride';
  s.shown = i + 1;
  s.phase = i === 0 ? 'second' : 'done';
  if (s.phase === 'done') s.result = settle(s);
  return s;
}

function settle(s) {
  const pay = payout([...s.player, ...s.community]);
  const names = ['Bet 1', 'Bet 2', 'Bet $'];
  const lines = s.riding.map((up, i) => (up
    ? { bet: names[i], stake: s.base, back: pay.mult ? s.base * (pay.mult + 1) : 0 }
    : { bet: names[i], stake: 0, back: 0, note: 'pulled back' }));
  const wagered = lines.reduce((t, l) => t + l.stake, 0);
  const returned = lines.reduce((t, l) => t + l.back, 0);
  return { hand: pay.name, key: pay.key, mult: pay.mult, lines: lines.filter((l) => l.stake), wagered, returned, net: returned - wagered, pulled: 3 * s.base - wagered };
}
