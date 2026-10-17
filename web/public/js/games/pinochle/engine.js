// Pinochle: pure rules engine (no DOM) for five ways to play (see VARIANTS).
// Four-handed seats run clockwise: 0 South (you), 1 West, 2 North, 3 East. In the partnership
// games S+N are team 0 and W+E team 1; in Cutthroat every seat scores alone.
// Two-handed: 0 South (you) and 1 North.

import { pickOpponents } from '../../core/cast.js';

export const SUITS = ['S', 'H', 'C', 'D'];
export const RANKS = ['A', '10', 'K', 'Q', 'J', '9']; // high to low
export const SUIT_NAMES = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };
export const SUIT_SYMBOLS = { S: '♠', H: '♥', C: '♣', D: '♦' };
export const SEAT_NAMES = ['South', 'West', 'North', 'East'];
export const BID_STEP = 10;

/**
 * The five games. players: seats at the table; partners: opposite seats score together;
 * bidding: an auction decides trump (else a dealt card is turned up); stock: two-handed drawing game;
 * packs: 2 = the 80-card deck (four each of A 10 K Q J); lastTrick: bonus for the final trick.
 */
export const VARIANTS = {
  auction: { id: 'auction', name: 'Partnership Auction', short: 'Auction', players: 4, partners: true, bidding: true, packs: 1, handSize: 12, minBid: 100, lastTrick: 10, target: 1000 },
  'two-handed': { id: 'two-handed', name: 'Two-Handed', short: 'Two-Handed', players: 2, partners: false, bidding: false, stock: true, packs: 1, handSize: 12, lastTrick: 10, target: 1000 },
  'double-pack': { id: 'double-pack', name: 'Double-Pack', short: 'Double-Pack', players: 4, partners: true, bidding: true, packs: 2, handSize: 20, minBid: 500, lastTrick: 20, target: 3550 },
  partnership: { id: 'partnership', name: 'Partnership', short: 'Partnership', players: 4, partners: true, bidding: false, packs: 1, handSize: 12, lastTrick: 10, target: 1000 },
  cutthroat: { id: 'cutthroat', name: 'Cutthroat', short: 'Cutthroat', players: 4, partners: false, bidding: false, packs: 1, handSize: 12, lastTrick: 10, target: 1000 },
};
export const VARIANT_IDS = Object.keys(VARIANTS);
/** The rules a state is played under (saves from before variants are Partnership Auction). */
export const variantOf = (s) => VARIANTS[s?.variant] ?? VARIANTS.auction;

export const MIN_BID = VARIANTS.auction.minBid;
export const TARGET = VARIANTS.auction.target;

const RANK_POWER = { A: 6, 10: 5, K: 4, Q: 3, J: 2, 9: 1 };
const COUNTERS = new Set(['A', '10', 'K']);
// Two-handed counts cards by rank instead of 10 per counter.
const CARD_POINTS_2 = { A: 11, 10: 10, K: 4, Q: 3, J: 2, 9: 0 };

export const team = (seat) => seat % 2;
export const partner = (seat) => (seat + 2) % 4;
export const nextSeat = (seat) => (seat + 1) % 4;
export const power = (card) => RANK_POWER[card.rank];
export const isCounter = (card) => COUNTERS.has(card.rank);
export const cardLabel = (c) => `${c.rank}${SUIT_SYMBOLS[c.suit]}`;
const isDix = (c, trump) => c.rank === '9' && c.suit === trump;
const sum = (xs) => xs.reduce((t, x) => t + x, 0);

// ---------------------------------------------------------------- seats and sides

export const seatCount = (s) => s.hands.length;
export const next = (s, seat) => (seat + 1) % s.hands.length;
/** Scoring sides: two teams, or one per player in Cutthroat and Two-Handed. */
export const sideCount = (s) => (variantOf(s).partners ? 2 : variantOf(s).players);
export const sideOf = (s, seat) => (variantOf(s).partners ? seat % 2 : seat);
export const seatsOf = (s, side) => s.hands.map((_, i) => i).filter((i) => sideOf(s, i) === side);
export const sameSide = (s, a, b) => sideOf(s, a) === sideOf(s, b);
/** Points one taken card is worth. */
export const cardPoints = (s, card) => (variantOf(s).stock ? CARD_POINTS_2[card.rank] : isCounter(card) ? 10 : 0);

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

/** 48 cards (two each of A 10 K Q J 9), or 80 for Double-Pack (four each of A 10 K Q J). */
export function newDeck(variant = 'auction') {
  const double = VARIANTS[variant]?.packs === 2;
  const ranks = double ? RANKS.filter((r) => r !== '9') : RANKS;
  const deck = [];
  for (let copy = 0; copy < (double ? 4 : 2); copy++) for (const suit of SUITS) for (const rank of ranks) deck.push({ id: `${rank}${suit}${copy}`, rank, suit });
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

// ---------------------------------------------------------------- meld (whole hand at once)

// Double-Pack: a double scores ten times the single meld, a triple 15 times, a quadruple 20 times;
// pinochles have their own ladder.
const DP_TIMES = [0, 1, 10, 15, 20];
const DP_PINOCHLE = [0, 40, 300, 600, 900];
const MULTI = ['', '', 'Double', 'Triple', 'Quadruple'];

/** Meld for one hand with a given trump. Returns {points, items:[{name, points}]}. */
export function computeMeld(hand, trump, variant = 'auction') {
  const dp = VARIANTS[variant]?.packs === 2;
  const n = (rank, suit) => hand.filter((c) => c.rank === rank && c.suit === suit).length;
  const items = [];
  const add = (name, count, each) => { if (count > 0) items.push({ name: count > 1 ? `${name} ×${count}` : name, points: count * each }); };
  // a meld that can repeat: Double-Pack names and scales the set, otherwise each copy counts once
  const set = (name, count, base) => {
    if (count <= 0) return;
    if (!dp || count === 1) return add(name, count, base);
    items.push({ name: `${MULTI[count]} ${name[0].toLowerCase()}${name.slice(1)}`, points: base * DP_TIMES[count] });
  };

  // Sequences
  const runs = Math.min(...['A', '10', 'K', 'Q', 'J'].map((r) => n(r, trump)));
  set(`Run in ${SUIT_NAMES[trump]}`, runs, 150);
  add('Royal marriage', Math.min(n('K', trump), n('Q', trump)) - runs, 40);
  for (const s of SUITS) if (s !== trump) add(`Marriage in ${SUIT_NAMES[s]}`, Math.min(n('K', s), n('Q', s)), 20);

  // Specials
  const pinochles = Math.min(n('J', 'D'), n('Q', 'S'));
  if (dp && pinochles > 1) items.push({ name: `${MULTI[pinochles]} pinochle`, points: DP_PINOCHLE[pinochles] });
  else if (pinochles === 2) items.push({ name: 'Double pinochle', points: 300 });
  else add('Pinochle', pinochles, 40);
  add('Dix (9 of trump)', n('9', trump), 10);

  // Groups ("around": one of the rank in every suit)
  for (const [rank, label, value] of [['A', 'Aces around', 100], ['K', 'Kings around', 80], ['Q', 'Queens around', 60], ['J', 'Jacks around', 40]]) {
    set(label, Math.min(...SUITS.map((s) => n(rank, s))), value);
  }
  return { points: sum(items.map((i) => i.points)), items };
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

/** Two-handed, once the stock is gone: follow suit (beating a trump lead if you can), else trump, else anything. */
export function lastTricksLegal(hand, trick, trump) {
  if (trick.length === 0) return hand.slice();
  const led = trick[0].card;
  const follow = hand.filter((c) => c.suit === led.suit);
  if (follow.length) {
    if (led.suit !== trump) return follow;
    const higher = follow.filter((c) => power(c) > power(led));
    return higher.length ? higher : follow;
  }
  const trumps = hand.filter((c) => c.suit === trump);
  return trumps.length ? trumps : hand.slice();
}

/** True while a two-handed game is still drawing from the stock (anything may be played). */
export const drawing = (s) => Boolean(variantOf(s).stock && s.turnUp);

/** The cards `seat` may play now. */
export function legalFor(s, seat) {
  const hand = s.hands[seat];
  if (variantOf(s).stock) return drawing(s) ? hand.slice() : lastTricksLegal(hand, s.trick, s.trump);
  return legalPlays(hand, s.trick, s.trump);
}

// ---------------------------------------------------------------- game state

export function newGame({ seed = Date.now(), names = null, variant = 'auction' } = {}) {
  const v = VARIANTS[variant] ?? VARIANTS.auction;
  names ??= ['You', ...pickOpponents(v.players - 1, { gameId: 'pinochle', rng: makeRng(seed) }).map((c) => c.name)];
  names = names.slice(0, v.players);
  const state = { variant: v.id, seed, names, scores: Array(v.partners ? 2 : v.players).fill(0), handNo: 0, dealer: v.players - 1, history: [], log: [], winner: null };
  return dealHand(state);
}

export function dealHand(prev) {
  const v = variantOf(prev);
  const n = v.players, size = v.handSize;
  const handNo = prev.handNo + 1;
  const rng = makeRng(prev.seed + handNo * 7919);
  const deck = shuffle(newDeck(v.id), rng);
  const dealer = (prev.dealer + 1) % n;
  const dealt = Array.from({ length: n }, (_, s) => deck.slice(s * size, s * size + size));
  const seats = dealt.map(() => null);
  let st = {
    ...prev,
    variant: v.id, handNo, dealer, hands: dealt.map((h) => sortHand(h)),
    phase: 'bidding',
    turn: (dealer + 1) % n,
    bids: seats.slice(), // last call per seat: number | 'pass'
    passed: seats.map(() => false),
    highBid: 0, highBidder: null, dumped: false,
    trump: null, melds: null, turnUp: null, dixTrade: null,
    trick: [], leader: null, taken: seats.map(() => []), tricksWon: seats.map(() => 0), lastTrick: null, lastTrickWinner: null,
    result: null,
    log: [...prev.log, `Hand ${handNo}: ${prev.names[dealer]} deals.`].slice(-60),
  };
  if (v.bidding) return st;
  if (v.stock) return dealTwoHanded(st, deck);
  return dealTurnUp(st, dealt[dealer][size - 1]);
}

const log = (s, line) => ({ ...s, log: [...s.log, line].slice(-60) });

// ---------------------------------------------------------------- the auction (Partnership Auction, Double-Pack)

export function minNextBid(s) { return s.highBid ? s.highBid + BID_STEP : variantOf(s).minBid; }

/** amount: a number (bid) or 'pass'. */
export function applyBid(s, seat, amount) {
  if (s.phase !== 'bidding' || seat !== s.turn) throw new Error('Not your turn to bid');
  const min = variantOf(s).minBid;
  let st = { ...s, bids: s.bids.slice(), passed: s.passed.slice() };
  if (amount === 'pass') {
    st.passed[seat] = true; st.bids[seat] = 'pass';
    st = log(st, `${s.names[seat]} passes.`);
  } else {
    if (amount < minNextBid(s) || amount % BID_STEP) throw new Error(`Bid must be at least ${minNextBid(s)}`);
    st.bids[seat] = amount; st.highBid = amount; st.highBidder = seat;
    st = log(st, `${s.names[seat]} bids ${amount}.`);
  }
  const live = st.passed.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  if (live.length === 1 && st.highBidder !== null && live[0] === st.highBidder) return winBid(st);
  if (live.length === 1 && st.highBidder === null) {
    // Everyone else passed without a bid: the bid is dumped on the last player at the minimum.
    const stuck = live[0];
    st = { ...st, highBid: min, highBidder: stuck, dumped: true };
    st = log(st, `All others passed: the bid is dumped on ${s.names[stuck]} at ${min}.`);
    return winBid(st);
  }
  if (live.length === 0) throw new Error('Unreachable: everyone passed');
  let t = next(st, seat);
  while (st.passed[t]) t = next(st, t);
  return { ...st, turn: t };
}

function winBid(st) {
  return log({ ...st, phase: 'trump', turn: st.highBidder }, `${st.names[st.highBidder]} wins the bid at ${st.highBid}.`);
}

export function chooseTrump(s, seat, suit) {
  if (s.phase !== 'trump' || seat !== s.highBidder) throw new Error('Not your call');
  return enterMeld(log({ ...s, trump: suit, turn: s.highBidder }, `${s.names[seat]} names ${SUIT_NAMES[suit]} trump.`));
}

// ---------------------------------------------------------------- turned trump and the dix (Partnership, Cutthroat)

/** The dealer's last card is turned up for trump; then each player from the dealer's left may trade the dix for it. */
function dealTurnUp(st, card) {
  st = { ...st, trump: card.suit, turnUp: card, hands: st.hands.map((h) => sortHand(h, card.suit)), bids: null, passed: null };
  st = log(st, `${st.names[st.dealer]} turns up the ${cardLabel(card)}: ${SUIT_NAMES[card.suit]} are trump.`);
  if (isDix(card, card.suit)) return enterMeld(log(st, `It's the dix: ${st.names[st.dealer]} scores 10.`));
  return offerDix(st, st.dealer);
}

/** Pass the dix offer to the next player after `from` (never the dealer) who holds a 9 of trump. */
function offerDix(st, from) {
  for (let t = next(st, from); t !== st.dealer; t = next(st, t)) {
    if (st.hands[t].some((c) => isDix(c, st.trump))) return { ...st, phase: 'dix', turn: t };
  }
  return enterMeld(st);
}

/** The offered player trades their 9 of trump for the turned-up card (scoring 10), or keeps it. */
export function tradeDix(s, seat, accept) {
  if (s.phase !== 'dix' || seat !== s.turn) throw new Error('No dix offer for you');
  if (!accept) return offerDix(log(s, `${s.names[seat]} keeps the dix.`), seat);
  const nine = s.hands[seat].find((c) => isDix(c, s.trump));
  const hands = s.hands.slice();
  hands[seat] = sortHand([...hands[seat].filter((c) => c.id !== nine.id), s.turnUp], s.trump);
  hands[s.dealer] = sortHand([...hands[s.dealer].filter((c) => c.id !== s.turnUp.id), nine], s.trump);
  const st = { ...s, hands, dixTrade: { seat, card: nine, got: s.turnUp } };
  return enterMeld(log(st, `${s.names[seat]} trades the dix for the ${cardLabel(s.turnUp)} (10 points).`));
}

/** Everyone's meld is shown at once. A dix traded to the dealer scores for the trader, not again for the dealer. */
function enterMeld(st) {
  const v = variantOf(st);
  const hands = st.hands.map((h) => sortHand(h, st.trump));
  const melds = hands.map((h, seat) => {
    const traded = st.dixTrade;
    const m = computeMeld(traded && seat === st.dealer ? h.filter((c) => c.id !== traded.card.id) : h, st.trump, v.id);
    if (traded && seat === traded.seat) return { points: m.points + 10, items: [...m.items, { name: 'Dix exchange', points: 10 }] };
    return m;
  });
  return { ...st, hands, melds, phase: 'meld', turn: v.bidding ? st.highBidder : st.dealer };
}

export function teamMeld(s, t) { return sum(seatsOf(s, t).map((x) => s.melds[x].points)); }
export const sideMeld = teamMeld;

export function startPlay(s) {
  if (s.phase !== 'meld') throw new Error('Not in meld phase');
  const lead = variantOf(s).bidding ? s.highBidder : next(s, s.dealer);
  return { ...s, phase: 'play', leader: lead, turn: lead, trick: [] };
}

// ---------------------------------------------------------------- play

export function playCard(s, seat, cardId) {
  if (s.phase !== 'play' || seat !== s.turn) throw new Error('Not your turn');
  const hand = s.hands[seat];
  const card = hand.find((c) => c.id === cardId);
  if (!card) throw new Error('Card not in hand');
  if (!legalFor(s, seat).some((c) => c.id === cardId)) throw new Error('That card is not a legal play');
  const hands = s.hands.slice();
  hands[seat] = hand.filter((c) => c.id !== cardId);
  let st = { ...s, hands };
  if (s.table) { st.table = s.table.slice(); st.table[seat] = s.table[seat].filter((id) => id !== cardId); }
  const trick = [...s.trick, { seat, card }];
  if (trick.length < seatCount(s)) return { ...st, trick, turn: next(s, seat) };
  // Trick complete: hold it on the table (phase 'trickDone') so the UI can show it, then collect.
  const w = trick[trickWinnerIndex(trick, s.trump)].seat;
  return { ...st, trick, turn: null, phase: 'trickDone', pendingWinner: w };
}

export function collectTrick(s) {
  if (s.phase !== 'trickDone') throw new Error('No trick to collect');
  const w = s.pendingWinner;
  const taken = s.taken.slice(); taken[w] = [...taken[w], ...s.trick.map((p) => p.card)];
  const tricksWon = s.tricksWon.slice(); tricksWon[w]++;
  let st = { ...s, taken, tricksWon, lastTrick: s.trick, lastTrickWinner: w, trick: [], pendingWinner: null };
  const pts = sum(s.trick.map((p) => cardPoints(s, p.card)));
  st = log(st, `${s.names[w]} takes the trick${pts ? ` (${pts} in ${variantOf(s).stock ? 'cards' : 'counters'})` : ''}.`);
  if (st.hands.every((h) => h.length === 0)) return scoreHand(st);
  if (drawing(st)) return { ...st, phase: 'declare', turn: w, leader: w, declared: { meld: false, dix: false } };
  return { ...st, phase: 'play', leader: w, turn: w };
}

// ---------------------------------------------------------------- Two-Handed: stock, drawing and melding as you go

function dealTwoHanded(st, deck) {
  const turnUp = deck[24];
  st = {
    ...st, trump: turnUp.suit, turnUp, stock: deck.slice(25), bids: null, passed: null,
    hands: st.hands.map((h) => sortHand(h, turnUp.suit)),
    table: [[], []], // ids of each player's melded cards lying face up (still part of the hand)
    used: [{}, {}], // card id -> meld classes it has scored in
    shown: [[], []], // melds on the table: [{ key, ids }]
    declaredMelds: [[], []], // every meld scored this hand: [{ name, points }]
    dixTraded: false, declared: null,
  };
  st = log(st, `The ${cardLabel(turnUp)} is turned: ${SUIT_NAMES[turnUp.suit]} are trump.`);
  if (isDix(turnUp, turnUp.suit)) {
    st.declaredMelds = st.declaredMelds.map((m, i) => (i === st.dealer ? [{ name: 'Dix turned up', points: 10 }] : m));
    st = log({ ...st, dixTraded: true }, `It's the dix: ${st.names[st.dealer]} scores 10.`);
  }
  const lead = next(st, st.dealer);
  return { ...st, phase: 'play', leader: lead, turn: lead };
}

// Meld classes: 1 sequences and marriages, 2 groups "around", 3 pinochles and the dix. A card may
// score again only in another class, or in the bigger meld of its own class (run over royal
// marriage, double pinochle over pinochle), which then scores the difference.
function meldKinds(trump) {
  return [
    { key: 'run', cls: 1, points: 150, name: `Run in ${SUIT_NAMES[trump]}`, slots: ['A', '10', 'K', 'Q', 'J'].map((r) => [r, trump]), over: 'royal' },
    { key: 'royal', cls: 1, points: 40, name: 'Royal marriage', slots: [['K', trump], ['Q', trump]] },
    ...SUITS.filter((x) => x !== trump).map((x) => ({ key: `marriage-${x}`, cls: 1, points: 20, name: `Marriage in ${SUIT_NAMES[x]}`, slots: [['K', x], ['Q', x]] })),
    ...[['A', 'aces', 'Aces around', 100], ['K', 'kings', 'Kings around', 80], ['Q', 'queens', 'Queens around', 60], ['J', 'jacks', 'Jacks around', 40]]
      .map(([r, key, name, points]) => ({ key, cls: 2, points, name, slots: SUITS.map((x) => [r, x]) })),
    { key: 'pinochle', cls: 3, points: 40, name: 'Pinochle', slots: [['J', 'D'], ['Q', 'S']] },
    { key: 'double-pinochle', cls: 3, points: 300, name: 'Double pinochle', slots: [['J', 'D'], ['J', 'D'], ['Q', 'S'], ['Q', 'S']], over: 'pinochle' },
  ];
}

/** Cards filling `slots` (beyond the `fixed` ones) not yet scored in `cls`, with at least one from the hand. */
function pickMeldCards(slots, hand, onTable, used, cls, fixed = []) {
  const open = slots.slice();
  for (const f of fixed) open.splice(open.findIndex(([r, x]) => r === f.rank && x === f.suit), 1);
  const ok = (c, r, x, taken) => c.rank === r && c.suit === x && !taken.has(c.id) && !(used[c.id] ?? []).includes(cls);
  const picked = [];
  const taken = new Set(fixed.map((c) => c.id));
  for (const [r, x] of open) {
    // reuse cards already on the table where allowed, keeping hand cards for later melds
    const cands = hand.filter((c) => ok(c, r, x, taken)).sort((a, b) => onTable.has(b.id) - onTable.has(a.id));
    if (!cands.length) return null;
    picked.push(cands[0]); taken.add(cands[0].id);
  }
  if (!picked.some((c) => !onTable.has(c.id))) {
    // every card came off the table: swap one for a card from the hand if there is one
    const swap = picked.findIndex((p) => hand.some((c) => !onTable.has(c.id) && ok(c, p.rank, p.suit, taken)));
    if (swap < 0) return null;
    const p = picked[swap];
    picked[swap] = hand.find((c) => !onTable.has(c.id) && ok(c, p.rank, p.suit, taken));
  }
  return [...fixed, ...picked].map((c) => c.id);
}

/** What the trick winner may declare now: [{ key, name, points }] (the dix trade and dix meld included). */
export function meldOptions(s, seat) {
  if (s.phase !== 'declare' || seat !== s.turn) return [];
  const hand = s.hands[seat], onTable = new Set(s.table[seat]), used = s.used[seat];
  const out = [];
  if (!s.declared.meld) {
    for (const k of meldKinds(s.trump)) {
      const ids = pickMeldCards(k.slots, hand, onTable, used, k.cls);
      if (ids) { out.push({ key: k.key, name: k.name, points: k.points, ids }); continue; }
      if (!k.over) continue;
      // build on a smaller meld of the same class that is still whole on the table
      const lowerKind = meldKinds(s.trump).find((x) => x.key === k.over);
      const base = s.shown[seat].findIndex((m) => m.key === k.over && m.ids.every((id) => onTable.has(id)));
      if (base < 0) continue;
      const fixed = s.shown[seat][base].ids.map((id) => hand.find((c) => c.id === id));
      const up = pickMeldCards(k.slots, hand, onTable, used, k.cls, fixed);
      if (up) out.push({ key: k.key, name: `${k.name} (on the ${lowerKind.name.toLowerCase()})`, points: k.points - lowerKind.points, ids: up, replaces: base });
    }
  }
  if (!s.declared.dix && hand.some((c) => isDix(c, s.trump) && !onTable.has(c.id))) {
    if (!s.dixTraded && s.turnUp && !isDix(s.turnUp, s.trump)) out.push({ key: 'dix-trade', name: `Trade the dix for the ${cardLabel(s.turnUp)}`, points: 10 });
    out.push({ key: 'dix', name: 'Dix (9 of trump)', points: 10 });
  }
  return out.sort((a, b) => b.points - a.points);
}

/** Declare one of meldOptions (by key). One regular meld and one dix action per won trick. */
export function declareMeld(s, seat, key) {
  const opt = meldOptions(s, seat).find((o) => o.key === key);
  if (!opt) throw new Error('That meld is not available');
  const st = { ...s, declared: { ...s.declared }, declaredMelds: s.declaredMelds.slice() };
  st.declaredMelds[seat] = [...s.declaredMelds[seat], { name: opt.key === 'dix-trade' ? 'Dix exchange' : opt.name.replace(/ \(on the .*\)$/, ''), points: opt.points }];
  const who = s.names[seat];
  if (key === 'dix-trade') {
    const nine = s.hands[seat].find((c) => isDix(c, s.trump) && !s.table[seat].includes(c.id));
    const hands = s.hands.slice();
    hands[seat] = sortHand([...hands[seat].filter((c) => c.id !== nine.id), s.turnUp], s.trump);
    st.declared.dix = true;
    return log({ ...st, hands, turnUp: nine, dixTraded: true }, `${who} trades the dix for the ${cardLabel(s.turnUp)} (10).`);
  }
  const cls = key === 'dix' ? 3 : meldKinds(s.trump).find((k) => k.key === key).cls;
  const ids = key === 'dix' ? [s.hands[seat].find((c) => isDix(c, s.trump) && !s.table[seat].includes(c.id)).id] : opt.ids;
  const table = s.table.slice(); table[seat] = [...new Set([...s.table[seat], ...ids])];
  const used = s.used.slice(); used[seat] = { ...s.used[seat] };
  for (const id of ids) used[seat][id] = [...(used[seat][id] ?? []), cls];
  const shown = s.shown.slice(); shown[seat] = s.shown[seat].filter((_, i) => i !== opt.replaces).concat([{ key, ids }]);
  if (key === 'dix') st.declared.dix = true; else st.declared.meld = true;
  return log({ ...st, table, used, shown }, `${who} melds ${opt.name.toLowerCase()} (${opt.points}).`);
}

/** Finish declaring: winner then loser draw (the loser takes the turned card after the last stock card), winner leads. */
export function endDeclare(s, seat) {
  if (s.phase !== 'declare' || seat !== s.turn) throw new Error('Not your turn');
  const other = next(s, seat);
  const hands = s.hands.slice(), stock = s.stock.slice();
  const top = stock.shift();
  hands[seat] = sortHand([...hands[seat], top], s.trump);
  let st = { ...s, hands, stock, declared: null, phase: 'play', turn: seat, leader: seat };
  if (stock.length) {
    hands[other] = sortHand([...hands[other], stock.shift()], s.trump);
    return { ...st, stock };
  }
  hands[other] = sortHand([...hands[other], s.turnUp], s.trump);
  st = log({ ...st, turnUp: null, table: [[], []] }, `${s.names[seat]} draws the last card (${cardLabel(top)}), ${s.names[other]} takes the ${cardLabel(s.turnUp)}.`);
  return log(st, 'The stock is gone: melds go back in hand, and now you must follow suit.');
}

/** Meld points scored so far this hand (two-handed), per seat. */
export const declaredPoints = (s, seat) => sum((s.declaredMelds?.[seat] ?? []).map((m) => m.points));

// ---------------------------------------------------------------- scoring

export function scoreHand(s) {
  const v = variantOf(s);
  const per = Array.from({ length: sideCount(s) }, (_, side) => {
    const seats = seatsOf(s, side);
    const counters = sum(seats.flatMap((x) => s.taken[x]).map((c) => cardPoints(s, c))) + (sideOf(s, s.lastTrickWinner) === side ? v.lastTrick : 0);
    const tookTrick = seats.some((x) => s.tricksWon[x] > 0);
    // two-handed melds were scored as they were made (only a trick winner can meld)
    const meld = v.stock ? sum(seats.map((x) => declaredPoints(s, x))) : teamMeld(s, side);
    const meldEarned = tookTrick || v.stock ? meld : 0;
    return { counters, meld, meldEarned, tookTrick, total: counters + meldEarned };
  });
  const delta = per.map((p) => p.total);
  let bt = null, made = null;
  if (v.bidding) {
    bt = sideOf(s, s.highBidder);
    made = per[bt].total >= s.highBid;
    if (!made) delta[bt] = -s.highBid;
  }
  const scores = s.scores.map((x, i) => x + delta[i]);
  // Past the target: the bidding side wins (it "goes out" first); otherwise the highest score, and a
  // tie at the top plays another hand.
  let winner = null;
  const over = scores.map((x, i) => (x >= v.target ? i : -1)).filter((i) => i >= 0);
  if (bt !== null && over.includes(bt)) winner = bt;
  else if (over.length) {
    const top = Math.max(...over.map((i) => scores[i]));
    const leaders = over.filter((i) => scores[i] === top);
    if (leaders.length === 1) winner = leaders[0];
  }
  const result = { bidTeam: bt, bid: v.bidding ? s.highBid : null, made, per, delta, scores };
  let st = { ...s, scores, result, phase: winner === null ? 'handOver' : 'gameOver', winner, turn: null, history: [...s.history, result] };
  if (v.bidding) st = log(st, made ? `Bid made: ${per[bt].total} of ${s.highBid}.` : `Set! Needed ${s.highBid}, took ${per[bt].total}.`);
  else st = log(st, `Hand ${s.handNo} scored.`);
  return st;
}

export function nextHand(s) {
  if (s.phase !== 'handOver') throw new Error('Hand not over');
  return dealHand(s);
}

/** Who acts next: a seat, 'table' while a finished trick waits to be collected, or null. */
export function actor(s) {
  if (s.phase === 'trump' || s.phase === 'meld') return variantOf(s).bidding ? s.highBidder : s.dealer;
  if (s.phase === 'trickDone') return 'table';
  if (['bidding', 'dix', 'play', 'declare'].includes(s.phase)) return s.turn;
  return null;
}
