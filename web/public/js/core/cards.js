// Shared card utilities: decks, shuffling (seeded), ranking, sorting, labels.

export const SUITS = ['S', 'H', 'C', 'D'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SYM = { S: '♠', H: '♥', C: '♣', D: '♦' };
export const SUIT_NAME = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };
export const SUIT_TITLE = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };
export const isRed = (s) => s === 'H' || s === 'D';
export const RANK_NAME = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', C: 'Knight' };

/** Ace-high numeric rank: 2..14. */
export const hi = (c) => ({ A: 14, K: 13, Q: 12, J: 11 })[c.rank] ?? Number(c.rank);
/** Ace-low numeric rank: 1..13. */
export const lo = (c) => ({ A: 1, K: 13, Q: 12, J: 11 })[c.rank] ?? Number(c.rank);
/** Count value (face cards 10, ace 1), as in Cribbage and Gin. */
export const pipValue = (c) => Math.min(10, lo(c));

export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return rng;
}
export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Rng whose position lives in serializable game state (state.seed + state.rngN). */
export function rngOf(state) {
  return () => {
    state.rngN = (state.rngN || 0) + 1;
    return makeRng((state.seed + Math.imul(state.rngN, 2654435761)) >>> 0)();
  };
}

export function deck({ ranks = RANKS, suits = SUITS, copies = 1, jokers = 0 } = {}) {
  const out = [];
  for (let k = 0; k < copies; k++) for (const s of suits) for (const r of ranks) out.push({ id: `${r}${s}${copies > 1 ? `.${k}` : ''}`, rank: r, suit: s });
  for (let j = 0; j < jokers; j++) out.push({ id: `JK.${j}`, rank: 'JK', suit: 'X' });
  return out;
}

export function shuffle(cards, rng) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3, X: 4 };
/** Sort by suit (alternating colors), then by rank within the suit. `rankFn` defaults to ace-high. */
export function sortCards(cards, { rankFn = hi, trump = null, desc = true, bySuit = true } = {}) {
  const sk = (s) => (s === trump ? -1 : SUIT_ORDER[s] ?? 5);
  return cards.slice().sort((a, b) => (bySuit ? sk(a.suit) - sk(b.suit) : 0) || (desc ? rankFn(b) - rankFn(a) : rankFn(a) - rankFn(b)) || (bySuit ? 0 : sk(a.suit) - sk(b.suit)));
}

export const label = (c) => (c.rank === 'JK' ? 'Joker' : `${c.rank}${SYM[c.suit] ?? ''}`);
export const removeIds = (cards, ids) => { const set = new Set(ids); return cards.filter((c) => !set.has(c.id)); };
export const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
export const sum = (arr, f = (x) => x) => arr.reduce((t, x) => t + f(x), 0);
export const clone = (x) => structuredClone(x);
