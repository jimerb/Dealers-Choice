// Poker hand ranks for the casino's poker games (no DOM).
//
//   evaluate(cards, { wild })  five cards -> { cat, name, score, tiebreak, wilds }
//       wild: null (default), 'deuces' (every 2 is wild), 'joker' (the joker is fully wild) or
//       'bug' (Pai Gow: the joker counts as an ace, or completes a straight, flush or straight flush)
//   best5(cards, opts)         the best five of six or seven cards -> evaluation + { cards }
//   evaluate3(cards)           three-card hands (Three Card Poker: a straight beats a flush)
//   evaluate2(cards)           two-card hands (Pai Gow's low hand; a joker there is an ace)
//   compare(a, b)              > 0 when a beats b, 0 for a tie (works on any two evaluations of the same kind)
//   describe(ev)               "Pair of jacks", "Kings full of fives", "Straight, nine high" ...
//   score5(ranks, suits)       fast path for enumerations: ranks 2..14, suits 0..3 -> score
//
// Cards are core/cards.js objects ({ rank: 'A'|'2'..'10'|'J'|'Q'|'K'|'JK', suit: 'S'|'H'|'C'|'D'|'X' }).
// `score` is one number that orders hands of the same kind: category first, then the tiebreak ranks.
// Higher is better.

/** Five-card categories, low to high. ROYAL is the ace-high straight flush; FIVE needs wild cards. */
export const HAND = { HIGH: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8, ROYAL: 9, FIVE: 10 };
export const HAND_NAMES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush', 'Royal flush', 'Five of a kind'];
/** Three-card categories, low to high (a straight beats a flush with three cards). */
export const HAND3 = { HIGH: 0, PAIR: 1, FLUSH: 2, STRAIGHT: 3, TRIPS: 4, STRAIGHT_FLUSH: 5 };
export const HAND3_NAMES = ['High card', 'Pair', 'Flush', 'Straight', 'Three of a kind', 'Straight flush'];
export const HAND2 = { HIGH: 0, PAIR: 1 };

const RANK_VALUE = { A: 14, K: 13, Q: 12, J: 11 };
const SUIT_INDEX = { S: 0, H: 1, C: 2, D: 3 };
/** 2..14 (ace high); 0 for a joker. */
export const rankValue = (c) => (c.rank === 'JK' ? 0 : RANK_VALUE[c.rank] ?? Number(c.rank));
export const suitIndex = (c) => SUIT_INDEX[c.suit] ?? -1;

const B = 15;
const pack = (cat, tb) => { let s = cat; for (let i = 0; i < 5; i++) s = s * B + (tb[i] ?? 0); return s; };

// ------------------------------------------------------------------ natural five-card hands
/** Score five natural cards (ranks may repeat, as in a multi-deck shoe; five of one rank is FIVE). */
export function score5(r, s) {
  return pack(...rank5(r, s));
}

function rank5(r, s) {
  const a = [r[0], r[1], r[2], r[3], r[4]].sort((x, y) => y - x);
  const flush = s[0] >= 0 && s[0] === s[1] && s[1] === s[2] && s[2] === s[3] && s[3] === s[4];
  const distinct = a[0] !== a[1] && a[1] !== a[2] && a[2] !== a[3] && a[3] !== a[4];
  let top = 0;
  if (distinct) {
    if (a[0] - a[4] === 4) top = a[0];
    else if (a[0] === 14 && a[1] === 5) top = 5; // the wheel: A 2 3 4 5
  }
  if (top && flush) return [top === 14 ? HAND.ROYAL : HAND.STRAIGHT_FLUSH, [top]];
  // groups by size, then rank
  const g = [];
  for (let i = 0; i < 5;) { let j = i; while (j < 5 && a[j] === a[i]) j++; g.push([j - i, a[i]]); i = j; }
  g.sort((x, y) => y[0] - x[0] || y[1] - x[1]);
  const tb = g.map((x) => x[1]);
  if (g[0][0] === 5) return [HAND.FIVE, tb];
  if (g[0][0] === 4) return [HAND.QUADS, tb];
  if (g[0][0] === 3 && g[1][0] === 2) return [HAND.FULL_HOUSE, tb];
  if (flush) return [HAND.FLUSH, a];
  if (top) return [HAND.STRAIGHT, [top]];
  if (g[0][0] === 3) return [HAND.TRIPS, tb];
  if (g[0][0] === 2 && g[1][0] === 2) return [HAND.TWO_PAIR, tb];
  if (g[0][0] === 2) return [HAND.PAIR, tb];
  return [HAND.HIGH, a];
}

// ------------------------------------------------------------------ wild cards
/** The highest straight top (5..14) whose window holds every rank in `ranks` (distinct), or 0. */
function straightTop(ranks) {
  for (let t = 14; t >= 5; t--) {
    const inWindow = (x) => (t === 5 ? (x === 14 || (x >= 2 && x <= 5)) : x >= t - 4 && x <= t);
    if (ranks.every(inWindow)) return t;
  }
  return 0;
}

/** The best hand from natural cards (ranks r, suits s) plus w wild cards; `only` limits the categories. */
function rankWild(r, s, w, only = null) {
  const ok = (cat) => !only || only.includes(cat);
  const cnt = new Array(15).fill(0);
  for (const x of r) cnt[x]++;
  const desc = [...r].sort((x, y) => y - x);
  const distinct = new Set(r).size === r.length;
  const oneSuit = s.every((x) => x >= 0 && x === s[0]);
  const highest = (need) => { for (let x = 14; x >= 2; x--) if (cnt[x] + w >= need && (cnt[x] > 0 || r.length === 0)) return x; return 0; };
  const rest = (x) => desc.filter((y) => y !== x);

  if (ok(HAND.FIVE)) { const x = r.length ? highest(5) : 14; if (x) return [HAND.FIVE, [x]]; }
  if (ok(HAND.STRAIGHT_FLUSH) && oneSuit && distinct) {
    const t = straightTop(r);
    if (t) return [t === 14 ? HAND.ROYAL : HAND.STRAIGHT_FLUSH, [t]];
  }
  if (ok(HAND.QUADS)) { const x = highest(4); if (x) return [HAND.QUADS, [x, ...rest(x)]]; }
  if (ok(HAND.FULL_HOUSE) && w === 1) {
    const pairs = desc.filter((x, i) => cnt[x] === 2 && desc.indexOf(x) === i);
    if (pairs.length === 2) return [HAND.FULL_HOUSE, pairs];
  }
  if (ok(HAND.FLUSH) && oneSuit) {
    const fill = [];
    for (let x = 14; x >= 2 && fill.length < w; x--) if (!cnt[x]) fill.push(x);
    return [HAND.FLUSH, [...desc, ...fill].sort((x, y) => y - x)];
  }
  if (ok(HAND.STRAIGHT) && distinct) { const t = straightTop(r); if (t) return [HAND.STRAIGHT, [t]]; }
  if (ok(HAND.TRIPS)) { const x = highest(3); if (x) return [HAND.TRIPS, [x, ...rest(x)]]; }
  if (ok(HAND.PAIR)) { const x = highest(2); if (x) return [HAND.PAIR, [x, ...rest(x)]]; }
  return null;
}

const isWild = (c, wild) => (wild === 'deuces' ? c.rank === '2' : (wild === 'joker' || wild === 'bug') && c.rank === 'JK');

/**
 * Five cards -> { cat, name, score, tiebreak, wilds }. `wilds` is how many wild cards the hand
 * holds (deuces wild pays four deuces and natural royals apart). A joker without a wild rule counts
 * as an ace.
 */
export function evaluate(cards, { wild = null } = {}) {
  if (cards.length !== 5) throw new RangeError(`evaluate: ${cards.length} cards, need 5`);
  const nat = cards.filter((c) => !isWild(c, wild));
  const w = 5 - nat.length;
  let best;
  if (!w) {
    best = rank5(cards.map((c) => rankValue(c) || 14), cards.map(suitIndex));
  } else if (wild === 'bug') {
    // the joker is an ace ...
    const asAce = rank5([...nat.map(rankValue), 14], [...nat.map(suitIndex), -1]);
    // ... or fills a straight, flush or straight flush
    const filled = rankWild(nat.map(rankValue), nat.map(suitIndex), w, [HAND.STRAIGHT_FLUSH, HAND.FLUSH, HAND.STRAIGHT]);
    best = filled && pack(...filled) > pack(...asAce) ? filled : asAce;
  } else {
    best = rankWild(nat.map(rankValue), nat.map(suitIndex), w);
  }
  const [cat, tiebreak] = best;
  return { cat, name: HAND_NAMES[cat], score: pack(cat, tiebreak), tiebreak, wilds: w };
}

/** Every k-card subset of `list` (in order). */
export function combinations(list, k) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i <= list.length - (k - acc.length); i++) { acc.push(list[i]); pick(i + 1, acc); acc.pop(); }
  };
  pick(0, []);
  return out;
}

/** The best five-card hand among 5 to 7 cards: the evaluation plus `cards` (the five used). */
export function best5(cards, opts = {}) {
  let best = null;
  for (const five of combinations(cards, 5)) {
    const ev = evaluate(five, opts);
    if (!best || ev.score > best.score) best = { ...ev, cards: five };
  }
  return best;
}

// ------------------------------------------------------------------ three and two cards
/** Three cards: straight flush, three of a kind, straight, flush, pair, high card. A-2-3 is the
 *  lowest straight and A-K-Q the highest. A joker counts as an ace. */
export function evaluate3(cards) {
  if (cards.length !== 3) throw new RangeError(`evaluate3: ${cards.length} cards, need 3`);
  const a = cards.map((c) => rankValue(c) || 14).sort((x, y) => y - x);
  const s = cards.map(suitIndex);
  const flush = s[0] >= 0 && s[0] === s[1] && s[1] === s[2];
  const distinct = a[0] !== a[1] && a[1] !== a[2];
  const top = !distinct ? 0 : a[0] - a[2] === 2 ? a[0] : a[0] === 14 && a[1] === 3 && a[2] === 2 ? 3 : 0;
  let cat, tb;
  if (top && flush) { cat = HAND3.STRAIGHT_FLUSH; tb = [top]; }
  else if (a[0] === a[2]) { cat = HAND3.TRIPS; tb = [a[0]]; }
  else if (top) { cat = HAND3.STRAIGHT; tb = [top]; }
  else if (flush) { cat = HAND3.FLUSH; tb = a; }
  else if (a[0] === a[1] || a[1] === a[2]) { const p = a[1]; cat = HAND3.PAIR; tb = [p, a[0] === p ? a[2] : a[0]]; }
  else { cat = HAND3.HIGH; tb = a; }
  return { cat, name: HAND3_NAMES[cat], score: pack(cat, tb), tiebreak: tb };
}

/** Two cards (Pai Gow's low hand): a pair beats any two odd cards. A joker is an ace. */
export function evaluate2(cards) {
  if (cards.length !== 2) throw new RangeError(`evaluate2: ${cards.length} cards, need 2`);
  const a = cards.map((c) => rankValue(c) || 14).sort((x, y) => y - x);
  const cat = a[0] === a[1] ? HAND2.PAIR : HAND2.HIGH;
  return { cat, name: cat ? 'Pair' : 'High card', score: pack(cat, a), tiebreak: a };
}

export const compare = (a, b) => Math.sign(a.score - b.score);

// ------------------------------------------------------------------ names
const WORD = { 14: 'ace', 13: 'king', 12: 'queen', 11: 'jack', 10: 'ten', 9: 'nine', 8: 'eight', 7: 'seven', 6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two' };
const PLURAL = { 14: 'aces', 13: 'kings', 12: 'queens', 11: 'jacks', 10: 'tens', 9: 'nines', 8: 'eights', 7: 'sevens', 6: 'sixes', 5: 'fives', 4: 'fours', 3: 'threes', 2: 'twos' };
const cap = (t) => t[0].toUpperCase() + t.slice(1);

/** A five-card evaluation in words: "Pair of jacks", "Two pair, kings and fives", "Straight, nine high". */
export function describe(ev) {
  const [a, b] = ev.tiebreak;
  switch (ev.cat) {
    case HAND.FIVE: return `Five ${PLURAL[a]}`;
    case HAND.ROYAL: return 'Royal flush';
    case HAND.STRAIGHT_FLUSH: return `Straight flush, ${WORD[a]} high`;
    case HAND.QUADS: return `Four ${PLURAL[a]}`;
    case HAND.FULL_HOUSE: return `${cap(PLURAL[a])} full of ${PLURAL[b]}`;
    case HAND.FLUSH: return `Flush, ${WORD[a]} high`;
    case HAND.STRAIGHT: return `Straight, ${WORD[a]} high`;
    case HAND.TRIPS: return `Three ${PLURAL[a]}`;
    case HAND.TWO_PAIR: return `Two pair, ${PLURAL[a]} and ${PLURAL[b]}`;
    case HAND.PAIR: return `Pair of ${PLURAL[a]}`;
    default: return `${cap(WORD[a])} high`;
  }
}

/** A three-card evaluation in words. */
export function describe3(ev) {
  const [a] = ev.tiebreak;
  switch (ev.cat) {
    case HAND3.STRAIGHT_FLUSH: return `Straight flush, ${WORD[a]} high`;
    case HAND3.TRIPS: return `Three ${PLURAL[a]}`;
    case HAND3.STRAIGHT: return `Straight, ${WORD[a]} high`;
    case HAND3.FLUSH: return `Flush, ${WORD[a]} high`;
    case HAND3.PAIR: return `Pair of ${PLURAL[a]}`;
    default: return `${cap(WORD[a])} high`;
  }
}
