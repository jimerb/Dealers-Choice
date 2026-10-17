// Computer players for every Pinochle variant.
// Simple, readable heuristics; good enough to be a fair table partner, meant to be tuned later.
import * as P from './engine.js';
import {
  SUITS, BID_STEP, computeMeld, trickWinnerIndex, power, isCounter, minNextBid, variantOf,
  legalFor, sameSide, seatCount, meldOptions, drawing, cardPoints,
} from './engine.js';

/** Rough trick-taking value (counters we expect to collect) if `trump` is named. */
function trickPotential(hand, trump) {
  const trumps = hand.filter((c) => c.suit === trump);
  const aces = hand.filter((c) => c.rank === 'A' && c.suit !== trump).length;
  const trumpAces = trumps.filter((c) => c.rank === 'A').length;
  const trumpTens = trumps.filter((c) => c.rank === '10').length;
  // a fair share of trump is a quarter of the suit: 3 of 12 cards, 5 of 20
  const share = Math.round(hand.length / 4);
  return 20 + aces * 12 + trumpAces * 14 + trumpTens * 8 + Math.max(0, trumps.length - share) * 12;
}

export function bestSuit(hand, variant = 'auction') {
  let best = null;
  for (const s of SUITS) {
    const v = computeMeld(hand, s, variant).points + trickPotential(hand, s);
    if (!best || v > best.value) best = { suit: s, value: v };
  }
  return best;
}

/** Returns a bid amount or 'pass'. */
export function chooseBid(state, seat, rng = Math.random) {
  const v = variantOf(state);
  const hand = state.hands[seat];
  const { value } = bestSuit(hand, v.id);
  const partnerHigh = state.highBidder !== null && sameSide(state, state.highBidder, seat);
  // What partner is expected to bring (meld + tricks); be shy about overbidding our own partner.
  const help = v.packs === 2 ? (partnerHigh ? 150 : 280) : (partnerHigh ? 50 : 110);
  let ceiling = value + help + Math.round((rng() - 0.5) * 20);
  ceiling = Math.floor(ceiling / BID_STEP) * BID_STEP;
  const next = minNextBid(state);
  if (next > ceiling) return 'pass';
  if (next === v.minBid && ceiling >= v.minBid + 60 && state.highBidder === null) {
    // Open with a little jump on a strong hand.
    return Math.min(ceiling - 30, v.minBid + 50);
  }
  return next;
}

export function chooseTrumpSuit(state, seat) {
  return bestSuit(state.hands[seat], variantOf(state).id).suit;
}

const cheapest = (cards) => cards.slice().sort((a, b) => (isCounter(a) - isCounter(b)) || power(a) - power(b))[0];
const richest = (cards, trump) => cards.slice().sort((a, b) =>
  (isCounter(b) - isCounter(a)) || ((a.suit === trump) - (b.suit === trump)) || power(b) - power(a))[0];

export function choosePlay(state, seat) {
  if (variantOf(state).stock) return chooseTwoHandedPlay(state, seat);
  const { trick, trump } = state;
  const legal = legalFor(state, seat);
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
  const partnerWinning = sameSide(state, winnerSeat, seat);
  const lastToPlay = trick.length === seatCount(state) - 1;
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

// ---------------------------------------------------------------- Two-Handed

/** How much a card is worth keeping while melds can still be made (higher = hold on to it). */
function keepValue(c, hand, trump) {
  const has = (r, s) => hand.some((x) => x.rank === r && x.suit === s && x.id !== c.id);
  let v = power(c);
  if (c.suit === trump) v += 4;
  if (c.rank === 'A') v += 3;
  if ((c.rank === 'K' && has('Q', c.suit)) || (c.rank === 'Q' && has('K', c.suit))) v += 4;
  if ((c.rank === 'J' && c.suit === 'D') || (c.rank === 'Q' && c.suit === 'S')) v += 3;
  if (c.rank === '9' && c.suit === trump) v += 3; // the dix
  return v;
}

/** Meld this seat could declare if it won the trick now. */
function pendingMeld(state, seat) {
  const probe = { ...state, phase: 'declare', turn: seat, declared: { meld: false, dix: false } };
  return Math.max(0, ...meldOptions(probe, seat).map((o) => o.points));
}

function chooseTwoHandedPlay(state, seat) {
  const { trick, trump } = state;
  const hand = state.hands[seat];
  const legal = legalFor(state, seat);
  if (legal.length === 1) return legal[0].id;
  const junk = (cards) => cards.slice().sort((a, b) => keepValue(a, hand, trump) - keepValue(b, hand, trump))[0];
  const lowest = (cards) => cards.slice().sort((a, b) => cardPoints(state, a) - cardPoints(state, b) || power(a) - power(b))[0];

  if (drawing(state)) {
    if (!trick.length) {
      const side = legal.filter((c) => c.suit !== trump && c.rank !== 'A' && c.rank !== '10');
      return junk(side.length ? side : legal).id;
    }
    const led = trick[0].card;
    const winners = legal.filter((c) => trickWinnerIndex([...trick, { seat, card: c }], trump) === 1);
    const cheapWin = winners.length ? junk(winners) : null;
    const worthIt = led.rank === 'A' || led.rank === '10' || pendingMeld(state, seat) >= 40;
    if (cheapWin && (worthIt || keepValue(cheapWin, hand, trump) <= 4)) return cheapWin.id;
    return junk(legal).id;
  }

  // Last twelve tricks: cash aces and high trump, win cheaply when you can, else shed the least.
  if (!trick.length) {
    const ace = legal.find((c) => c.rank === 'A');
    return (ace ?? lowest(legal)).id;
  }
  const winners = legal.filter((c) => trickWinnerIndex([...trick, { seat, card: c }], trump) === 1);
  if (winners.length) return winners.slice().sort((a, b) => power(a) - power(b) || (a.suit === trump) - (b.suit === trump))[0].id;
  return lowest(legal).id;
}

/** The trick winner's declaring: trade the dix if possible, else meld it; then the best meld; then draw. */
export function chooseDeclare(state, seat) {
  const opts = meldOptions(state, seat);
  const pick = opts.find((o) => o.key === 'dix-trade') ?? opts.find((o) => o.key !== 'dix') ?? opts.find((o) => o.key === 'dix');
  return pick ? pick.key : null;
}

/** One computer action for whoever is due to act (seat or table). Returns the next state. */
export function act(state, rng = Math.random) {
  const s = state;
  switch (s.phase) {
    case 'bidding': return P.applyBid(s, s.turn, chooseBid(s, s.turn, rng));
    case 'trump': return P.chooseTrump(s, s.highBidder, chooseTrumpSuit(s, s.highBidder));
    case 'dix': return P.tradeDix(s, s.turn, true); // always worth it: 10 points and a better trump
    case 'meld': return P.startPlay(s);
    case 'play': return P.playCard(s, s.turn, choosePlay(s, s.turn));
    case 'declare': {
      const key = chooseDeclare(s, s.turn);
      return key ? P.declareMeld(s, s.turn, key) : P.endDeclare(s, s.turn);
    }
    case 'trickDone': return P.collectTrick(s);
    default: throw new Error(`Nothing to do in phase ${s.phase}`);
  }
}
