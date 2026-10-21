// Helpers shared by the game modules: seating, tricks, logging, simple AI choices, view pieces.
import { hi, SYM, SUIT_TITLE } from '../../core/cards.js';

export const POS4 = ['south', 'west', 'north', 'east'];
export const POS3 = ['south', 'west', 'east'];
export const POS2 = ['south', 'north'];
export const POS5 = ['south', 'west', 'nw', 'ne', 'east'];
export const POS6 = ['south', 'west', 'nw', 'north', 'ne', 'east'];
const POS_BY_N = { 2: POS2, 3: POS3, 4: POS4, 5: POS5, 6: POS6 };
export const posFor = (n, seat) => POS_BY_N[n]?.[seat];

export const clone = (x) => structuredClone(x);
export function log(s, line) { s.log = [...(s.log ?? []), line].slice(-60); return s; }
export function fx(s, ...names) { s.fx = [...(s.fx ?? []), ...names]; return s; }
/** '1 book', '3 books'. */
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const who = (s, seat) => (seat === 0 ? 'You' : s.names[seat]);
export const whoVerb = (s, seat, you, other) => `${who(s, seat)} ${seat === 0 ? you : other}`;
export const suitSpan = (su) => `<span class="trump-sym${su === 'H' || su === 'D' ? ' red-suit' : ''}">${SYM[su]}</span>`;
export const suitLabel = (su) => `${suitSpan(su)} ${SUIT_TITLE[su]}`;

/** Winner index of a trick [{seat, card}] given trump and a rank function (higher wins; ties: first). */
export function trickWinner(trick, trump, rank = hi) {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    const c = trick[i].card, b = trick[best].card;
    if ((c.suit === b.suit && rank(c) > rank(b)) || (trump && c.suit === trump && b.suit !== trump)) best = i;
  }
  return best;
}

/** Must follow the led suit if able (suitOf lets Euchre treat the left bower as trump). */
export function followSuit(hand, trick, suitOf = (c) => c.suit) {
  if (!trick.length) return hand.slice();
  const led = suitOf(trick[0].card);
  const f = hand.filter((c) => suitOf(c) === led);
  return f.length ? f : hand.slice();
}

export const byRank = (rank) => (a, b) => rank(a) - rank(b);
export const lowest = (cards, rank = hi) => cards.slice().sort(byRank(rank))[0];
export const highest = (cards, rank = hi) => cards.slice().sort(byRank(rank)).at(-1);

/** Typical trick-taking follow: win cheaply if possible (unless partner already winning), else dump lowest. */
export function followPlay(legal, trick, seat, trump, { rank = hi, partnerOf = null, suitOf = (c) => c.suit, value = () => 0 } = {}) {
  if (!trick.length) return null;
  const wi = trickWinner(trick.map((p) => ({ ...p, card: { ...p.card, suit: suitOf(p.card) } })), trump, rank);
  const partnerWinning = partnerOf !== null && trick[wi].seat === partnerOf;
  const wins = (c) => trickWinner([...trick, { seat, card: c }].map((p) => ({ ...p, card: { ...p.card, suit: suitOf(p.card) } })), trump, rank) === trick.length;
  const dump = () => legal.slice().sort((a, b) => value(a) - value(b) || rank(a) - rank(b))[0];
  if (partnerWinning) return trick.length === 3 ? legal.slice().sort((a, b) => value(b) - value(a) || rank(a) - rank(b))[0] : dump();
  const winners = legal.filter(wins);
  if (winners.length) return winners.slice().sort((a, b) => rank(a) - rank(b))[0];
  return dump();
}

/** Seat list for the view model. */
export function seatsVM(s, n, extra = () => ({})) {
  return Array.from({ length: n }, (_, i) => ({
    seat: i,
    pos: posFor(n, i),
    name: s.names[i],
    mine: i === 0,
    partner: n === 4 && s.partners !== false && i === 2,
    turn: s.turn === i,
    dealer: s.dealer === i,
    count: i === 0 ? 0 : s.hands?.[i]?.length ?? 0,
    ...extra(i),
  }));
}

export const trickPlays = (s, n, trick = s.trick) => trick.map((p) => ({ pos: posFor(n, p.seat), card: p.card }));

/** Lightweight guard for human actions. */
export function must(cond, msg) { if (!cond) throw new Error(msg); }
