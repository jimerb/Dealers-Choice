// Computer players for Partnership Auction Pinochle.
// Simple, readable heuristics; good enough to be a fair table partner, meant to be tuned later.
import {
  SUITS, MIN_BID, BID_STEP, computeMeld, legalPlays, trickWinnerIndex, power, isCounter,
  team, partner, minNextBid,
} from './engine.js';

/** Rough trick-taking value (counters we expect to collect) if `trump` is named. */
function trickPotential(hand, trump) {
  const trumps = hand.filter((c) => c.suit === trump);
  const aces = hand.filter((c) => c.rank === 'A' && c.suit !== trump).length;
  const trumpAces = trumps.filter((c) => c.rank === 'A').length;
  const trumpTens = trumps.filter((c) => c.rank === '10').length;
  return 20 + aces * 12 + trumpAces * 14 + trumpTens * 8 + Math.max(0, trumps.length - 3) * 12;
}

export function bestSuit(hand) {
  let best = null;
  for (const s of SUITS) {
    const v = computeMeld(hand, s).points + trickPotential(hand, s);
    if (!best || v > best.value) best = { suit: s, value: v };
  }
  return best;
}

/** Returns a bid amount or 'pass'. */
export function chooseBid(state, seat, rng = Math.random) {
  const hand = state.hands[seat];
  const { value } = bestSuit(hand);
  const partnerHigh = state.highBidder !== null && state.highBidder === partner(seat);
  // Expect partner to bring ~110 (meld + tricks); be shy about overbidding our own partner.
  let ceiling = value + (partnerHigh ? 50 : 110) + Math.round((rng() - 0.5) * 20);
  ceiling = Math.floor(ceiling / BID_STEP) * BID_STEP;
  const next = minNextBid(state);
  if (next > ceiling) return 'pass';
  if (next === MIN_BID && ceiling >= MIN_BID + 60 && state.highBidder === null) {
    // Open with a little jump on a strong hand.
    return Math.min(ceiling - 30, MIN_BID + 50);
  }
  return next;
}

export function chooseTrumpSuit(state, seat) {
  return bestSuit(state.hands[seat]).suit;
}

const cheapest = (cards) => cards.slice().sort((a, b) => (isCounter(a) - isCounter(b)) || power(a) - power(b))[0];
const richest = (cards, trump) => cards.slice().sort((a, b) =>
  (isCounter(b) - isCounter(a)) || ((a.suit === trump) - (b.suit === trump)) || power(b) - power(a))[0];

export function choosePlay(state, seat) {
  const { trick, trump } = state;
  const hand = state.hands[seat];
  const legal = legalPlays(hand, trick, trump);
  if (legal.length === 1) return legal[0].id;

  if (trick.length === 0) {
    // Lead: cash an off-suit ace, else pull trump with the ace of trump, else a cheap card from a long side suit.
    const offAce = legal.find((c) => c.rank === 'A' && c.suit !== trump);
    if (offAce) return offAce.id;
    const trumpAce = legal.find((c) => c.rank === 'A' && c.suit === trump);
    if (trumpAce && legal.filter((c) => c.suit === trump).length >= 4) return trumpAce.id;
    const side = legal.filter((c) => c.suit !== trump);
    return cheapest(side.length ? side : legal).id;
  }

  const wi = trickWinnerIndex(trick, trump);
  const winnerSeat = trick[wi].seat;
  const partnerWinning = team(winnerSeat) === team(seat);
  const lastToPlay = trick.length === 3;
  const winsIfPlayed = (c) => trickWinnerIndex([...trick, { seat, card: c }], trump) === trick.length;

  if (partnerWinning) {
    // Partner has it: feed counters when safe (last to play, or partner holds an ace / trump).
    const pc = trick[wi].card;
    const safe = lastToPlay || pc.rank === 'A' || (pc.suit === trump && power(pc) >= 5);
    return (safe ? richest(legal, trump) : cheapest(legal)).id;
  }
  const winners = legal.filter(winsIfPlayed);
  if (winners.length) {
    // Win as cheaply as possible; when last to play, win with the richest card that still wins.
    const pick = lastToPlay ? richest(winners, trump) : winners.slice().sort((a, b) => power(a) - power(b))[0];
    return pick.id;
  }
  return cheapest(legal).id;
}
