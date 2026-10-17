// Partnership Auction Pinochle: pure rules engine (no DOM).
// Seats run clockwise: 0 South (you), 1 West, 2 North, 3 East. Partners: S+N (team 0), W+E (team 1).
// Rules: 48-card deck, 12 cards each,
// min bid 100 in steps of 10, meld counts only if the team wins a trick, A/10/K = 10 each,
// last trick = 10, game to 1000.

import { pickOpponents } from '../../core/cast.js';

export const SUITS = ['S', 'H', 'C', 'D'];
export const RANKS = ['A', '10', 'K', 'Q', 'J', '9']; // high to low
export const SUIT_NAMES = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };
export const SUIT_SYMBOLS = { S: '♠', H: '♥', C: '♣', D: '♦' };
export const SEAT_NAMES = ['South', 'West', 'North', 'East'];
export const MIN_BID = 100;
export const BID_STEP = 10;
export const TARGET = 1000;

const RANK_POWER = { A: 6, 10: 5, K: 4, Q: 3, J: 2, 9: 1 };
const COUNTERS = new Set(['A', '10', 'K']);

export const team = (seat) => seat % 2;
export const partner = (seat) => (seat + 2) % 4;
export const nextSeat = (seat) => (seat + 1) % 4;
export const power = (card) => RANK_POWER[card.rank];
export const isCounter = (card) => COUNTERS.has(card.rank);
export const cardLabel = (c) => `${c.rank}${SUIT_SYMBOLS[c.suit]}`;

/** Small seeded PRNG (mulberry32) so deals and AI choices are reproducible. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newDeck() {
  const deck = [];
  for (const copy of [0, 1]) for (const suit of SUITS) for (const rank of RANKS) deck.push({ id: `${rank}${suit}${copy}`, rank, suit });
  return deck;
}

export function shuffle(cards, rng) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
export function sortHand(hand, trump = null) {
  const suitKey = (s) => (s === trump ? -1 : SUIT_ORDER[s]);
  return hand.slice().sort((a, b) => suitKey(a.suit) - suitKey(b.suit) || power(b) - power(a));
}

// ---------------------------------------------------------------- meld

/** Meld for one hand with a given trump. Returns {points, items:[{name, points}]}. */
export function computeMeld(hand, trump) {
  const n = (rank, suit) => hand.filter((c) => c.rank === rank && c.suit === suit).length;
  const items = [];
  const add = (name, count, each) => { if (count > 0) items.push({ name: count > 1 ? `${name} ×${count}` : name, points: count * each }); };

  // Sequences
  const runs = Math.min(...['A', '10', 'K', 'Q', 'J'].map((r) => n(r, trump)));
  add(`Run in ${SUIT_NAMES[trump]}`, runs, 150);
  add('Royal marriage', Math.min(n('K', trump), n('Q', trump)) - runs, 40);
  for (const s of SUITS) if (s !== trump) add(`Marriage in ${SUIT_NAMES[s]}`, Math.min(n('K', s), n('Q', s)), 20);

  // Specials
  const pinochles = Math.min(n('J', 'D'), n('Q', 'S'));
  if (pinochles === 2) items.push({ name: 'Double pinochle', points: 300 });
  else add('Pinochle', pinochles, 40);
  add('Dix (9 of trump)', n('9', trump), 10);

  // Groups ("around": one of the rank in every suit)
  for (const [rank, label, value] of [['A', 'Aces around', 100], ['K', 'Kings around', 80], ['Q', 'Queens around', 60], ['J', 'Jacks around', 40]]) {
    add(label, Math.min(...SUITS.map((s) => n(rank, s))), value);
  }
  return { points: items.reduce((t, i) => t + i.points, 0), items };
}

// ---------------------------------------------------------------- tricks

/** Index (into trick) of the currently winning play. Ties go to the card played first. */
export function trickWinnerIndex(trick, trump) {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    const c = trick[i].card, b = trick[best].card;
    const beats = (c.suit === b.suit && power(c) > power(b)) || (c.suit === trump && b.suit !== trump);
    if (beats) best = i;
  }
  return best;
}

/** Legal cards: follow suit (and head the trick if you can), else trump (overtrumping if you can), else anything. */
export function legalPlays(hand, trick, trump) {
  if (trick.length === 0) return hand.slice();
  const led = trick[0].card.suit;
  const winning = trick[trickWinnerIndex(trick, trump)].card;
  const follow = hand.filter((c) => c.suit === led);
  if (follow.length) {
    if (winning.suit !== led) return follow; // already trumped: any card of the led suit
    const higher = follow.filter((c) => power(c) > power(winning));
    return higher.length ? higher : follow;
  }
  const trumps = hand.filter((c) => c.suit === trump);
  if (trumps.length) {
    if (winning.suit === trump) {
      const higher = trumps.filter((c) => power(c) > power(winning));
      return higher.length ? higher : trumps;
    }
    return trumps;
  }
  return hand.slice();
}

// ---------------------------------------------------------------- game state

export function newGame({ seed = Date.now(), names = null } = {}) {
  names ??= ['You', ...pickOpponents(3, { gameId: 'pinochle', rng: makeRng(seed) }).map((c) => c.name)];
  const state = { seed, names, scores: [0, 0], handNo: 0, dealer: 3, history: [], log: [], winner: null };
  return dealHand(state);
}

export function dealHand(prev) {
  const handNo = prev.handNo + 1;
  const rng = makeRng(prev.seed + handNo * 7919);
  const deck = shuffle(newDeck(), rng);
  const dealer = nextSeat(prev.dealer);
  const hands = [0, 1, 2, 3].map((s) => sortHand(deck.slice(s * 12, s * 12 + 12)));
  const first = nextSeat(dealer);
  return {
    ...prev,
    handNo, dealer, hands,
    phase: 'bidding',
    turn: first,
    bids: [null, null, null, null], // last call per seat: number | 'pass'
    passed: [false, false, false, false],
    highBid: 0, highBidder: null, dumped: false,
    trump: null, melds: null,
    trick: [], leader: null, taken: [[], [], [], []], tricksWon: [0, 0, 0, 0], lastTrick: null, lastTrickWinner: null,
    result: null,
    log: [...prev.log, `Hand ${handNo}: ${prev.names[dealer]} deals.`].slice(-60),
  };
}

const log = (s, line) => ({ ...s, log: [...s.log, line].slice(-60) });

export function minNextBid(s) { return s.highBid ? s.highBid + BID_STEP : MIN_BID; }

/** amount: a number (bid) or 'pass'. */
export function applyBid(s, seat, amount) {
  if (s.phase !== 'bidding' || seat !== s.turn) throw new Error('Not your turn to bid');
  let st = { ...s, bids: s.bids.slice(), passed: s.passed.slice() };
  if (amount === 'pass') {
    st.passed[seat] = true; st.bids[seat] = 'pass';
    st = log(st, `${s.names[seat]} passes.`);
  } else {
    if (amount < minNextBid(s) || amount % BID_STEP) throw new Error(`Bid must be at least ${minNextBid(s)}`);
    st.bids[seat] = amount; st.highBid = amount; st.highBidder = seat;
    st = log(st, `${s.names[seat]} bids ${amount}.`);
  }
  const live = [0, 1, 2, 3].filter((i) => !st.passed[i]);
  if (live.length === 1 && st.highBidder !== null && live[0] === st.highBidder) return winBid(st);
  if (live.length === 1 && st.highBidder === null) {
    // Everyone else passed without a bid: the bid is dumped on the last player at the minimum.
    const stuck = live[0];
    st = { ...st, highBid: MIN_BID, highBidder: stuck, dumped: true };
    st = log(st, `All others passed: the bid is dumped on ${s.names[stuck]} at ${MIN_BID}.`);
    return winBid(st);
  }
  if (live.length === 0) throw new Error('Unreachable: everyone passed');
  let t = nextSeat(seat);
  while (st.passed[t]) t = nextSeat(t);
  return { ...st, turn: t };
}

function winBid(st) {
  return log({ ...st, phase: 'trump', turn: st.highBidder }, `${st.names[st.highBidder]} wins the bid at ${st.highBid}.`);
}

export function chooseTrump(s, seat, suit) {
  if (s.phase !== 'trump' || seat !== s.highBidder) throw new Error('Not your call');
  const hands = s.hands.map((h) => sortHand(h, suit));
  const melds = hands.map((h) => computeMeld(h, suit));
  return log({ ...s, trump: suit, hands, melds, phase: 'meld', turn: s.highBidder }, `${s.names[seat]} names ${SUIT_NAMES[suit]} trump.`);
}

export function teamMeld(s, t) { return s.melds[t].points + s.melds[t + 2].points; }

export function startPlay(s) {
  if (s.phase !== 'meld') throw new Error('Not in meld phase');
  return { ...s, phase: 'play', leader: s.highBidder, turn: s.highBidder, trick: [] };
}

export function playCard(s, seat, cardId) {
  if (s.phase !== 'play' || seat !== s.turn) throw new Error('Not your turn');
  const hand = s.hands[seat];
  const card = hand.find((c) => c.id === cardId);
  if (!card) throw new Error('Card not in hand');
  if (!legalPlays(hand, s.trick, s.trump).some((c) => c.id === cardId)) throw new Error('That card is not a legal play');
  const hands = s.hands.slice();
  hands[seat] = hand.filter((c) => c.id !== cardId);
  const trick = [...s.trick, { seat, card }];
  if (trick.length < 4) return { ...s, hands, trick, turn: nextSeat(seat) };
  // Trick complete: hold it on the table (phase 'trickDone') so the UI can show it, then collect.
  const w = trick[trickWinnerIndex(trick, s.trump)].seat;
  return { ...s, hands, trick, turn: null, phase: 'trickDone', pendingWinner: w };
}

export function collectTrick(s) {
  if (s.phase !== 'trickDone') throw new Error('No trick to collect');
  const w = s.pendingWinner;
  const taken = s.taken.slice(); taken[w] = [...taken[w], ...s.trick.map((p) => p.card)];
  const tricksWon = s.tricksWon.slice(); tricksWon[w]++;
  let st = { ...s, taken, tricksWon, lastTrick: s.trick, lastTrickWinner: w, trick: [], pendingWinner: null };
  const counters = s.trick.filter((p) => isCounter(p.card)).length;
  st = log(st, `${s.names[w]} takes the trick${counters ? ` (${counters * 10} in counters)` : ''}.`);
  if (st.hands.every((h) => h.length === 0)) return scoreHand(st);
  return { ...st, phase: 'play', leader: w, turn: w };
}

export function scoreHand(s) {
  const per = [0, 1].map((t) => {
    const cards = [...s.taken[t], ...s.taken[t + 2]];
    const counters = cards.filter(isCounter).length * 10 + (team(s.lastTrickWinner) === t ? 10 : 0);
    const tookTrick = s.tricksWon[t] + s.tricksWon[t + 2] > 0;
    const meld = teamMeld(s, t);
    const meldEarned = tookTrick ? meld : 0;
    return { counters, meld, meldEarned, tookTrick, total: counters + meldEarned };
  });
  const bt = team(s.highBidder);
  const made = per[bt].total >= s.highBid;
  const delta = [0, 0];
  delta[bt] = made ? per[bt].total : -s.highBid;
  delta[1 - bt] = per[1 - bt].total;
  const scores = [s.scores[0] + delta[0], s.scores[1] + delta[1]];
  // Bidding team wins a tie past the target (it "goes out" first).
  let winner = null;
  if (scores[bt] >= TARGET) winner = bt;
  else if (scores[1 - bt] >= TARGET) winner = 1 - bt;
  const result = { bidTeam: bt, bid: s.highBid, made, per, delta, scores };
  let st = { ...s, scores, result, phase: winner === null ? 'handOver' : 'gameOver', winner, turn: null, history: [...s.history, result] };
  st = log(st, made ? `Bid made: ${per[bt].total} of ${s.highBid}.` : `Set! Needed ${s.highBid}, took ${per[bt].total}.`);
  return st;
}

export function nextHand(s) {
  if (s.phase !== 'handOver') throw new Error('Hand not over');
  return dealHand(s);
}
