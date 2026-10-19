// A dealing shoe of one or more decks, as plain data (so it can live in an engine's state and be
// saved as JSON). Cards are the site's card objects from core/cards.js: { id, rank, suit } with
// ranks 'A' '2'..'10' 'J' 'Q' 'K', suits 'S' 'H' 'C' 'D', and jokers { id: 'JK.0', rank: 'JK', suit: 'X' }.
// With several decks the ids carry the deck number ('QH.3'), so every card in the shoe is unique.
//
//   const shoe = newShoe({ decks: 6, penetration: 0.75 }, rng);
//   draw(shoe)            -> a card (the shoe's position moves on: clone engine state before a step)
//   burn(shoe, 1)         -> the burned cards
//   needsShuffle(shoe)    -> true once the cut card has come out (check between rounds only)
//   reshuffle(shoe, rng)  -> all cards back in, shuffled, new cut card
//   remaining(shoe), dealt(shoe)
//   stack(shoe, ['AS', 'KH'])  tests: these cards come out next, in this order
import { deck } from '../../core/cards.js';
import { shuffle } from './rng.js';

/** Every card of `decks` decks plus `jokers` jokers (Pai Gow: 1 deck + 1 joker = 53). */
export const shoeCards = (decks = 1, jokers = 0) => deck({ copies: decks, jokers });

/**
 * decks: how many 52-card decks; jokers: jokers added; penetration: the share of the shoe dealt
 * before the cut card comes out (1 = deal to the end; single-deck games that reshuffle every hand
 * just call reshuffle() each round). `cutVariance` moves the cut card by up to that share of the shoe
 * either way, at random, as a dealer placing it by hand would.
 */
export function newShoe({ decks = 1, jokers = 0, penetration = 0.75, cutVariance = 0 } = {}, rng) {
  const shoe = { decks, jokers, penetration, cutVariance, cards: [], pos: 0, cut: 0 };
  return reshuffle(shoe, rng);
}

/** All cards back in, shuffled, with a new cut card. Returns the shoe. */
export function reshuffle(shoe, rng) {
  shoe.cards = shuffle(shoeCards(shoe.decks, shoe.jokers), rng);
  shoe.pos = 0;
  const n = shoe.cards.length;
  let cut = Math.round(n * shoe.penetration);
  if (shoe.cutVariance > 0) {
    const span = Math.round(n * shoe.cutVariance);
    cut += rng.int(2 * span + 1) - span;
  }
  shoe.cut = Math.max(1, Math.min(n, cut));
  return shoe;
}

export const remaining = (shoe) => shoe.cards.length - shoe.pos;
export const dealt = (shoe) => shoe.pos;
/** The cards already dealt (the discard tray, once the hands are cleared away). */
export const discards = (shoe) => shoe.cards.slice(0, shoe.pos);
/** The cut card has come out: shuffle before the next round. */
export const needsShuffle = (shoe) => shoe.pos >= shoe.cut;

/** The next card. Throws on an empty shoe (an engine should reshuffle between rounds instead). */
export function draw(shoe) {
  if (shoe.pos >= shoe.cards.length) throw new Error('The shoe is empty.');
  return shoe.cards[shoe.pos++];
}
/** The next n cards. */
export const drawN = (shoe, n) => Array.from({ length: n }, () => draw(shoe));
/** Burn n cards face down. */
export const burn = (shoe, n = 1) => drawN(shoe, n);

/**
 * Tests and demos: make the next cards come out in the given order. `ids` are card ids, or
 * rank+suit codes ('AS', '10H', 'JK') that match the first undealt card of that face.
 */
export function stack(shoe, ids) {
  const rest = shoe.cards.slice(shoe.pos);
  const front = ids.map((code) => {
    const i = rest.findIndex((c) => c.id === code || `${c.rank}${c.suit === 'X' ? '' : c.suit}` === code);
    if (i < 0) throw new Error(`stack: no ${code} left in the shoe`);
    return rest.splice(i, 1)[0];
  });
  shoe.cards = [...shoe.cards.slice(0, shoe.pos), ...front, ...rest];
  return shoe;
}

/** A card from a short code, for tests and how-to figures: 'AS', '10H', 'JK'. */
export function card(code) {
  if (code === 'JK') return { id: 'JK.0', rank: 'JK', suit: 'X' };
  const m = /^(10|[2-9AJQK])([SHCD])$/.exec(code);
  if (!m) throw new Error(`card: ${code} is not a card code`);
  return { id: code, rank: m[1], suit: m[2] };
}
/** Several cards from a space-separated list: cards('AS KS QS JS 10S'). */
export const cards = (codes) => codes.trim().split(/\s+/).map(card);
