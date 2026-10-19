// Pai Gow Poker rules, with no DOM: the 53-card deck, setting seven cards into a five-card high hand
// and a two-card low hand, the house way, the showdown and the payout.
//
//   const { player, dealer } = deal(rng)                 seven cards each from a fresh 53-card deck
//   evalHigh(five, opts), evalLow(two)                     hand values ({ cat, score, tiebreak, name })
//   checkSetting(high, low, opts)                          null, or why the setting is not allowed
//   houseWay(seven, opts)                                  -> { high, low, reason }
//   showdown(playerSet, dealerSet, opts)                   -> { high, low, result: 'win'|'push'|'lose' }
//   settle(stake, result)                                  -> dollars back (a win pays 1 to 1 less 5%, rounded down)
//
// The joker is a "bug": it counts as an ace, or completes a straight, flush or straight flush. Five
// aces (four aces and the joker) is the best hand. With the a5 option (on by default) A-2-3-4-5 is
// the second-highest straight, below A-K-Q-J-10. The five-card hand must outrank the two-card hand;
// a tie on a hand ("copy") goes to the dealer. The house banks every hand in v1.
import { newShoe, drawN } from '../kit/shoe.js';
import { evaluate, evaluate2, combinations, describe, rankValue, HAND } from '../kit/poker.js';

export const OPTIONS = [
  { key: 'a5', label: 'A-2-3-4-5 is the second-highest straight', type: 'check', default: true },
  { key: 'verify', label: 'Explain an illegal setting', type: 'check', default: true },
  { key: 'hint', label: 'Show the House way button', type: 'check', default: true },
];
export const DEFAULTS = Object.fromEntries(OPTIONS.map((o) => [o.key, o.default]));
export const minBuyIn = (stakes) => stakes.min;
export const FOUL = 'Your two-card hand can\'t beat your five-card hand.';

/** A fresh 53-card deck (52 + one joker), shuffled, and seven cards each: player first. */
export function deal(rng) {
  const deck = newShoe({ decks: 1, jokers: 1, penetration: 1 }, rng);
  const player = drawN(deck, 7), dealer = drawN(deck, 7);
  return { player, dealer, deck };
}

const B = 15;
const isJoker = (c) => c.rank === 'JK';
/** A card's rank for setting: 2..14, the joker counting as an ace. */
export const val = (c) => rankValue(c) || 14;
const SUITS = 'SHDCX';
// highest first; the joker after a natural ace; then by suit, so a setting never depends on the order dealt
const desc = (list) => [...list].sort((a, b) => val(b) - val(a) || Number(isJoker(a)) - Number(isJoker(b)) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));

const WHEEL = 13.5; // A-2-3-4-5 ranks between K-high and A-high straights with the a5 option
function adjust(ev, a5) {
  const straight = ev.cat === HAND.STRAIGHT || ev.cat === HAND.STRAIGHT_FLUSH;
  if (!a5 || !straight || ev.tiebreak[0] !== 5) return ev;
  return { ...ev, score: ev.cat * B ** 5 + WHEEL * B ** 4, wheel: true };
}

/** A five-card high hand's value, joker as the bug. */
export function evalHigh(five, { a5 = true } = {}) {
  let ev = adjust(evaluate(five, { wild: 'bug' }), a5);
  const jk = five.find(isJoker);
  if (a5 && jk) {
    // the joker as an ace (of the others' suit, so it still completes a flush) may make the wheel,
    // which outranks a six-high straight when A-2-3-4-5 is the second-highest straight
    const nat = five.filter((c) => c !== jk);
    const suit = nat.every((c) => c.suit === nat[0].suit) ? nat[0].suit : 'X';
    const alt = adjust(evaluate([...nat, { id: 'JK.A', rank: 'A', suit }]), a5);
    if (alt.score > ev.score) ev = alt;
  }
  return { ...ev, text: describe(ev) };
}

const WORD = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' };
const short = (v) => WORD[v] ?? String(v);
const PLURAL = { 14: 'aces', 13: 'kings', 12: 'queens', 11: 'jacks', 10: 'tens', 9: 'nines', 8: 'eights', 7: 'sevens', 6: 'sixes', 5: 'fives', 4: 'fours', 3: 'threes', 2: 'twos' };
/** A two-card low hand's value (a joker there is an ace). */
export function evalLow(two) {
  const ev = evaluate2(two);
  const [a, b] = ev.tiebreak;
  return { ...ev, text: ev.cat ? `Pair of ${PLURAL[a]}` : `${short(a)}-${short(b)}` };
}

/** Does the two-card hand outrank the five-card hand? (A foul: not allowed.) */
export function lowOutranks(h, l) {
  if (l.cat === 1) {                       // a pair in the low hand
    if (h.cat >= HAND.TWO_PAIR) return false;
    if (h.cat === HAND.PAIR) return l.tiebreak[0] > h.tiebreak[0];
    return true;
  }
  if (h.cat >= HAND.PAIR) return false;
  const [h0, h1] = h.tiebreak, [l0, l1] = l.tiebreak;
  return l0 > h0 || (l0 === h0 && l1 > h1);
}

/** null when high (5 cards) and low (2 cards) are a legal setting, or the reason it isn't. */
export function checkSetting(high, low, opts = {}) {
  if (high?.length !== 5 || low?.length !== 2) return 'Put five cards in your high hand and two in your low hand.';
  return lowOutranks(evalHigh(high, opts), evalLow(low)) ? FOUL : null;
}

/** Split seven cards by the ids of the two that go low. */
export function splitByLow(seven, lowIds) {
  const ids = new Set(lowIds);
  return { high: seven.filter((c) => !ids.has(c.id)), low: seven.filter((c) => ids.has(c.id)) };
}

// ------------------------------------------------------------------ the house way
const without = (list, out) => list.filter((c) => !out.includes(c));

/** The rank groups of seven cards, largest first (then highest); the joker counts as an ace. */
function groupsOf(seven) {
  const m = new Map();
  for (const c of desc(seven)) { const v = val(c); if (!m.has(v)) m.set(v, []); m.get(v).push(c); }
  return [...m.entries()].map(([v, cards]) => ({ v, cards })).sort((a, b) => b.cards.length - a.cards.length || b.v - a.v);
}

/** The straights and flushes among the seven, each with the low hand it leaves. */
function straightsAndFlushes(seven, opts) {
  const SF = [HAND.STRAIGHT, HAND.FLUSH, HAND.STRAIGHT_FLUSH, HAND.ROYAL];
  return combinations(seven, 5).map((high) => ({ high, ev: evalHigh(high, opts) }))
    .filter((x) => SF.includes(x.ev.cat))
    .map((x) => { const low = without(seven, x.high); return { ...x, low, lev: evalLow(low) }; })
    .sort((a, b) => b.lev.score - a.lev.score || b.ev.score - a.ev.score);
}

/**
 * Set seven cards the house way. Returns { high, low, reason }; the setting is always legal.
 *  1. Five aces: pair of aces low (a pair of kings low instead, if there is one).
 *  2. A straight or flush with no pair (or one pair): play the one that leaves the best low hand.
 *     With two pair, three pair or trips, only when the straight/flush leaves a pair low.
 *  3. No pair: highest card high, next two low.        4. One pair: pair high, next two highest low.
 *  5. Two pair: split, except both pairs 6s or lower with an ace: pairs high, ace and next card low.
 *  6. Three pair: highest pair low.                    7. Trips: high (trip aces: split an ace low;
 *     two trips: a pair from the higher trips low).    8. Full house: highest pair low, trips high.
 *  9. Four of a kind: 2-6 together; 7-10 split unless an ace can go low; J-A split; a pair beside
 *     the four goes low.
 */
export function houseWay(seven, opts = {}) {
  seven = desc(seven);
  const set = pick(seven, opts);
  if (!checkSetting(set.high, set.low, opts)) return set;
  // never expected: fall back to the legal setting with the best low hand
  return { ...bestLegal(seven, opts), reason: 'Best legal setting' };
}

function bestLegal(seven, opts) {
  let best = null;
  for (const low of combinations(seven, 2)) {
    const high = without(seven, low);
    if (checkSetting(high, low, opts)) continue;
    const k = [evalLow(low).score, evalHigh(high, opts).score];
    if (!best || k[0] > best.k[0] || (k[0] === best.k[0] && k[1] > best.k[1])) best = { high, low, k };
  }
  return { high: best.high, low: best.low };
}

function pick(seven, opts) {
  const g = groupsOf(seven);
  const sizes = g.map((x) => x.cards.length);
  const singles = g.filter((x) => x.cards.length === 1).map((x) => x.cards[0]); // high to low
  const pairs = g.filter((x) => x.cards.length === 2);
  const out = (low, reason) => ({ high: without(seven, low), low, reason });
  const sf = straightsAndFlushes(seven, opts);
  const sfOut = (x, reason) => ({ high: x.high, low: x.low, reason });

  // 1. five aces
  if (sizes[0] === 5) {
    const kings = g.find((x) => x.v === 13 && x.cards.length >= 2);
    return kings ? out(kings.cards.slice(0, 2), 'Five aces high, kings low') : out(g[0].cards.slice(3), 'Three aces high, a pair of aces low');
  }
  // 9. four of a kind
  if (sizes[0] === 4) {
    const q = g[0], rest = without(seven, q.cards);
    const restPair = g.slice(1).find((x) => x.cards.length >= 2);
    if (restPair) return out(restPair.cards.slice(0, 2), 'Four of a kind high, the pair low');
    const together = () => out(desc(rest).slice(0, 2), 'Four of a kind kept together');
    if (q.v <= 6) return together();
    if (q.v <= 10 && rest.some((c) => val(c) === 14)) return together();
    return out(q.cards.slice(2), 'Four of a kind split into two pairs');
  }
  if (sizes[0] === 3) {
    const t = g[0];
    // two trips: a pair from the higher trips goes low
    if (sizes[1] === 3) return out(t.cards.slice(0, 2), 'Two trips: a pair from the higher trips low');
    // 8. full house (trips and one or two pairs): the highest pair low
    if (sizes[1] === 2) return out(g[1].cards, 'Full house: trips high, pair low');
    const sfPair = sf.find((x) => x.lev.cat === 1);
    if (sfPair) return sfOut(sfPair, 'Straight or flush high, a pair low');
    if (t.v === 14) return out([t.cards[2], singles[0]], 'Trip aces: a pair of aces high, an ace and the next card low');
    return out(singles.slice(0, 2), 'Three of a kind high, the next two cards low');
  }
  if (pairs.length >= 2) {
    const sfPair = sf.find((x) => x.lev.cat === 1);
    if (sfPair) return sfOut(sfPair, 'Straight or flush high, a pair low');
    if (pairs.length === 3) return out(pairs[0].cards, 'Three pair: the highest pair low');
    const [hi, lo] = pairs;
    const ace = singles.find((c) => val(c) === 14);
    if (hi.v <= 6 && ace) return out([ace, singles.find((c) => c !== ace)], 'Two small pairs kept together, ace low');
    return out(lo.cards, 'Two pair split: the lower pair low');
  }
  if (sf.length) return sfOut(sf[0], pairs.length ? 'Straight or flush high, the best low hand left' : 'Straight or flush high, the best low hand left');
  if (pairs.length === 1) return out(singles.slice(0, 2), 'One pair high, the next two cards low');
  return out(singles.slice(1, 3), 'Highest card high, the next two low');
}

// ------------------------------------------------------------------ the showdown
/**
 * Compare a player's setting with the dealer's. Each hand goes to whoever is higher; a tie (a copy)
 * goes to the dealer. Win both: 'win'; one each: 'push'; dealer wins both: 'lose'.
 */
export function showdown(p, d, opts = {}) {
  const ph = evalHigh(p.high, opts), dh = evalHigh(d.high, opts);
  const pl = evalLow(p.low), dl = evalLow(d.low);
  const high = ph.score > dh.score ? 'player' : 'dealer';
  const low = pl.score > dl.score ? 'player' : 'dealer';
  const wins = (high === 'player') + (low === 'player');
  return {
    high, low, result: wins === 2 ? 'win' : wins === 1 ? 'push' : 'lose',
    highCopy: ph.score === dh.score, lowCopy: pl.score === dl.score,
    hands: { player: { high: ph, low: pl }, dealer: { high: dh, low: dl } },
  };
}

/** A win's winnings on `stake`: even money less 5% commission, rounded down to whole dollars. */
export const winAmount = (stake) => Math.floor((stake * 95) / 100);
/** Dollars back to the player (stake included). */
export function settle(stake, result) {
  if (result === 'win') return stake + winAmount(stake);
  if (result === 'push') return stake;
  return 0;
}

/** One whole hand with the player's setting, for tests and simulations. */
export function playHand(stake, player, dealer, lowIds, opts = {}) {
  const p = splitByLow(player, lowIds);
  const why = checkSetting(p.high, p.low, opts);
  if (why) throw new Error(why);
  const d = houseWay(dealer, opts);
  const s = showdown(p, d, opts);
  return { ...s, dealerSet: d, returned: settle(stake, s.result) };
}

export { isJoker };
