// Baccarat (punto banco) rules, with no DOM: the shoe, card points, the third-card tableau for the
// Player and Banker hands, the payouts and the scorecard (bead plate) of the current shoe.
//
//   const shoe = newBaccaratShoe({ decks: 8 }, rng)
//   const coup = dealCoup(shoe)            -> { player: [cards], banker: [cards], pTotal, bTotal, winner, natural }
//   settleBets({ player: 10, tie: 5 }, coup.winner, { tie: 8 }) -> { wagered, returned, net, lines }
//   playRound(state, bets, rng)            -> { state, coup, result, shuffled } (shoe, scorecard)
//
// Points: ace 1, 2-9 face value, 10/J/Q/K 0; a hand counts the last digit of its total. A natural
// (8 or 9 on the first two cards of either hand) ends the coup. Otherwise the Player draws on 0-5
// and stands on 6-7; then the Banker draws by the tableau (bankerDraws). The shoe's cut card sits 14
// cards from the end; once it comes out the coup is finished and the shoe is reshuffled before the
// next one. No cards are burned.
import { newShoe, reshuffle, draw, needsShuffle } from '../kit/shoe.js';

export const OPTIONS = [
  { key: 'decks', label: 'Decks in the shoe', type: 'select', options: [[8, '8 decks'], [6, '6 decks']], default: 8 },
  { key: 'tie', label: 'Tie pays', type: 'select', options: [[8, '8 to 1'], [9, '9 to 1']], default: 8 },
  { key: 'scorecard', label: 'Show the scorecard', type: 'check', default: true },
];
export const DEFAULTS = Object.fromEntries(OPTIONS.map((o) => [o.key, o.default]));

/** Cards left behind the cut card when it comes out. */
export const CUT_FROM_END = 14;
export const SPOTS = { player: 'Player', banker: 'Banker', tie: 'Tie' };
export const isSpot = (key) => Object.hasOwn(SPOTS, key);

export const minBuyIn = (stakes) => stakes.min;

/** A card's points: ace 1, 2-9 their value, tens and faces 0. */
export function points(card) {
  if (card.rank === 'A') return 1;
  const v = Number(card.rank);
  return v >= 2 && v <= 9 ? v : 0;
}
/** A hand's total: the last digit of its points. */
export const handTotal = (cards) => cards.reduce((t, c) => t + points(c), 0) % 10;

/** The Player hand draws a third card on 0-5 and stands on 6-7 (8-9 are naturals). */
export const playerDraws = (total) => total <= 5;

/**
 * Does the Banker draw? `total` is the Banker's two-card total, `p` the point value of the Player's
 * third card, or null when the Player stood.
 *   Player stood:      Banker draws on 0-5, stands on 6-7.
 *   Player drew p:     0-2 always; 3 unless p is 8; 4 on p 2-7; 5 on p 4-7; 6 on p 6-7; 7 stands.
 */
export function bankerDraws(total, p) {
  if (p == null) return total <= 5;
  switch (total) {
    case 0: case 1: case 2: return true;
    case 3: return p !== 8;
    case 4: return p >= 2 && p <= 7;
    case 5: return p >= 4 && p <= 7;
    case 6: return p === 6 || p === 7;
    default: return false;
  }
}

/**
 * Play one coup out of `next` (a function that returns the next card): deal Player, Banker,
 * Player, Banker, then the third cards by the rules. Pure apart from what `next` draws.
 */
export function playCoup(next) {
  const player = [next()], banker = [next()];
  player.push(next()); banker.push(next());
  let pTotal = handTotal(player), bTotal = handTotal(banker);
  const natural = pTotal >= 8 || bTotal >= 8;
  if (!natural) {
    let p = null;
    if (playerDraws(pTotal)) { const c = next(); player.push(c); p = points(c); pTotal = handTotal(player); }
    if (bankerDraws(bTotal, p)) { banker.push(next()); bTotal = handTotal(banker); }
  }
  const winner = pTotal > bTotal ? 'player' : bTotal > pTotal ? 'banker' : 'tie';
  return { player, banker, pTotal, bTotal, winner, natural };
}

/** A coup dealt from a shoe (the shoe's position moves on). */
export const dealCoup = (shoe) => playCoup(() => draw(shoe));

/** A Banker win's winnings on `stake`: even money less 5% commission, rounded down. */
export const bankerWin = (stake) => Math.floor((stake * 95) / 100);

/**
 * Settle the bets on a coup's result. bets: { player, banker, tie } in dollars; winner: 'player',
 * 'banker' or 'tie'; tie: what a Tie pays to 1 (8 or 9). A tie pushes Player and Banker bets.
 * Returns { wagered, returned, net, lines: [{ key, stake, returned, outcome: 'win'|'push'|'lose' }] }.
 */
export function settleBets(bets, winner, { tie = 8 } = {}) {
  const lines = [];
  let wagered = 0, returned = 0;
  for (const key of Object.keys(SPOTS)) {
    const stake = bets[key] ?? 0;
    if (!stake) continue;
    let back = 0, outcome = 'lose';
    if (key === 'tie') { if (winner === 'tie') { back = stake * (1 + Number(tie)); outcome = 'win'; } }
    else if (winner === 'tie') { back = stake; outcome = 'push'; }
    else if (winner === key) { back = stake + (key === 'banker' ? bankerWin(stake) : stake); outcome = 'win'; }
    wagered += stake;
    returned += back;
    lines.push({ key, stake, returned: back, outcome });
  }
  return { wagered, returned, net: returned - wagered, lines };
}

/** Table limits: something must be bet; each bet is within the table maximum. Error text or null. */
export function checkBets(bets, { min, max }) {
  const placed = Object.entries(bets).filter(([, v]) => v > 0);
  if (!placed.length) return 'Place a bet first.';
  if (placed.some(([k]) => !isSpot(k))) return 'That is not a baccarat bet.';
  const small = placed.find(([, v]) => v < min);
  if (small) return `Each bet must be at least the table minimum of $${min.toLocaleString('en-US')}.`;
  if (max != null && placed.some(([, v]) => v > max)) return `The most on one bet is $${max.toLocaleString('en-US')}.`;
  return null;
}

// ------------------------------------------------------------------ the shoe and the scorecard
/** An eight- (or six-) deck shoe with the cut card 14 cards from the end. */
export function newBaccaratShoe({ decks = 8 } = {}, rng) {
  const n = decks * 52;
  return newShoe({ decks, penetration: (n - CUT_FROM_END) / n }, rng);
}

/** A fresh table: a shuffled shoe and an empty scorecard. */
export function init({ opts = {}, rng }) {
  const o = { ...DEFAULTS, ...opts };
  return { decks: Number(o.decks), shoe: newBaccaratShoe({ decks: Number(o.decks) }, rng), road: [], coups: 0 };
}

/** Scorecard counts for the current shoe. */
export function roadCounts(road) {
  const c = { player: 0, banker: 0, tie: 0 };
  for (const r of road) c[r.winner]++;
  return c;
}

/** How a round shows on the scorecard: 'single' when one bet was placed, 'sat' for none or several. */
export function betStyle(bets) {
  const placed = Object.values(bets).filter((v) => v > 0).length;
  return placed === 1 ? 'single' : 'sat';
}

/**
 * One whole round: shuffle first if the cut card came out last time (or the deck count changed),
 * deal the coup, settle the bets, add the result to the scorecard. Never changes `state`.
 * Returns { state, coup, result, shuffled }.
 */
export function playRound(state, bets, rng, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const s = structuredClone(state);
  let shuffled = false;
  const decks = Number(o.decks);
  if (s.decks !== decks) { s.decks = decks; s.shoe = newBaccaratShoe({ decks }, rng); s.road = []; shuffled = true; }
  else if (needsShuffle(s.shoe)) { reshuffle(s.shoe, rng); s.road = []; shuffled = true; }
  const coup = dealCoup(s.shoe);
  const result = settleBets(bets, coup.winner, { tie: o.tie });
  s.road.push({ winner: coup.winner, p: coup.pTotal, b: coup.bTotal, style: betStyle(bets), net: Math.sign(result.net) });
  s.coups++;
  return { state: s, coup, result, shuffled };
}

/** The cut card has come out: the next round starts with a fresh shoe. */
export const shoeDue = (state) => needsShuffle(state.shoe);

// ------------------------------------------------------------------ exact odds
/**
 * The exact chance of a Player win, Banker win and tie off the top of a full shoe of `decks` decks
 * (cards dealt without replacement), by enumerating every run of six card values.
 * Returns { player, banker, tie } (they sum to 1).
 */
export function exactOdds(decks = 8) {
  const counts = new Array(10).fill(4 * decks);
  counts[0] = 16 * decks; // 10, J, Q, K
  const total = 52 * decks;
  const out = { player: 0, banker: 0, tie: 0 };
  const seq = new Array(6);
  const rec = (depth, prob, left) => {
    if (depth === 6) {
      let i = 0;
      const r = playCoup(() => ({ rank: RANKS[seq[i++]] }));
      out[r.winner] += prob;
      return;
    }
    for (let v = 0; v < 10; v++) {
      if (!counts[v]) continue;
      const p = prob * (counts[v] / left);
      counts[v]--; seq[depth] = v;
      rec(depth + 1, p, left - 1);
      counts[v]++;
    }
  };
  rec(0, 1, total);
  return out;
}
const RANKS = ['10', 'A', '2', '3', '4', '5', '6', '7', '8', '9'];

/** House edge of each bet (share of the stake lost on average) from exact odds. */
export function houseEdges(odds, { tie = 8 } = {}) {
  const { player, banker, tie: t } = odds;
  return {
    player: -(player - banker),
    banker: -(banker * 0.95 - player),
    tie: -(t * tie - (1 - t)),
  };
}
