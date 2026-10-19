// Basic strategy for the hint button and the house-edge simulation: the best play for a hand against
// the dealer's up card under the table's rules (dealer stands or hits soft 17, double after split,
// late surrender, the number of decks), with a short reason in plain words. No DOM.
//
//   advise({ cards, up, rules, can: { double, split, surrender } })
//     -> { action: 'hit' | 'stand' | 'double' | 'split' | 'surrender', why }
//   insuranceAdvice(trueCount) -> { take, why }
import { cardValue, handValue } from './blackjack.js';

/** The up card as 2..11 (ace = 11). */
const upValue = (c) => cardValue(c);
const among = (u, ...list) => list.includes(u);
const range = (u, lo, hi) => u >= lo && u <= hi;

// Codes: H hit, S stand, D double (else hit), Ds double (else stand), P split, R surrender (else hit),
// Rs surrender (else stand), Rp surrender (else split).

function pairPlay(rank, u, r) {
  const das = r.das;
  switch (rank) {
    case 11: return 'P';
    case 10: return null;
    case 9: return among(u, 7, 10, 11) ? null : 'P';
    case 8: return u === 11 && r.h17 && r.surrender === 'late' ? 'Rp' : 'P';
    case 7: return u <= 7 ? 'P' : null;
    case 6: return (das ? range(u, 2, 6) : range(u, 3, 6)) ? 'P' : null;
    case 5: return null;
    case 4: return das && among(u, 5, 6) ? 'P' : null;
    default: return (das ? range(u, 2, 7) : range(u, 4, 7)) ? 'P' : null; // 2s and 3s
  }
}

function softPlay(total, u, r) {
  if (total >= 20) return 'S';
  if (total === 19) return u === 6 && r.h17 ? 'Ds' : 'S';
  if (total === 18) {
    if (range(u, 3, 6) || (u === 2 && r.h17)) return 'Ds';
    if (among(u, 2, 7, 8)) return 'S';
    return 'H';
  }
  if (total === 17) return range(u, 3, 6) ? 'D' : 'H';
  if (total >= 15) return range(u, 4, 6) ? 'D' : 'H';
  if (total <= 12) return 'H'; // two aces that can't be split
  return range(u, 5, 6) ? 'D' : 'H'; // soft 13, 14
}

function hardPlay(total, u, r) {
  const few = r.decks <= 2;
  if (total >= 17) return total === 17 && u === 11 && r.h17 && r.surrender === 'late' ? 'Rs' : 'S';
  if (total === 16) return r.surrender === 'late' && among(u, 9, 10, 11) ? 'R' : u <= 6 ? 'S' : 'H';
  if (total === 15) return r.surrender === 'late' && (u === 10 || (u === 11 && r.h17)) ? 'R' : u <= 6 ? 'S' : 'H';
  if (total >= 13) return u <= 6 ? 'S' : 'H';
  if (total === 12) return range(u, 4, 6) ? 'S' : 'H';
  if (total === 11) return u === 11 && !r.h17 && !few ? 'H' : 'D';
  if (total === 10) return u <= 9 ? 'D' : 'H';
  if (total === 9) return range(u, 3, 6) || (u === 2 && few) ? 'D' : 'H';
  return 'H';
}

const WHY = {
  blackjack: 'You have 21. Stand and let the dealer try to match it.',
  splitAces: 'Always split aces: two hands that start at 11 beat one soft 12.',
  splitEights: 'Always split eights: two hands starting at 8 beat a hard 16, the worst total there is.',
  splitNines: 'Split nines here: two hands starting at 9 do better than standing on 18 against this card.',
  splitSmall: 'Split small pairs against a weak dealer card: each hand gets a fresh start while the dealer may bust.',
  splitSevens: 'Split sevens against a 7 or lower: 14 is a poor total, two hands starting at 7 do better.',
  splitSixes: 'Split sixes against a weak dealer card: 12 is weak, and the dealer may bust.',
  noTens: 'Never split tens: 20 already wins most hands.',
  surrender: 'Surrender: this hand loses so often against that card that getting half your bet back is the better deal.',
  double11: 'Double on 11: one card will very often give you 21 or close to it.',
  double10: 'Double on 10: one card will often give you 20, and the dealer\'s card is weaker than your ten.',
  double9: 'Double on 9 against a weak dealer card: you are ahead, so put more money out.',
  doubleSoft: 'Double this soft hand against a weak dealer card: you can\'t bust with one card, and the dealer may.',
  standStiff: 'Stand: the dealer shows a weak card and must draw, so let the dealer take the risk of busting.',
  hitStiff: 'Hit: the dealer shows a strong card and will usually make 17 or more, so standing on this total usually loses.',
  hit12: 'Hit 12 against a 2 or 3: you only bust with a ten, and the dealer is not weak enough to stand on it.',
  standMade: 'Stand: 17 or more is a made hand. Taking a card would bust you too often.',
  softStand: 'Stand on this soft total: it is good enough here.',
  softHit: 'Hit this soft hand: no card can bust you, and the total is too weak to stand on.',
  low: 'Hit: no card can bust you.',
};

function reason(code, { total, soft, pair, u }) {
  if (code === 'P') return pair === 11 ? WHY.splitAces : pair === 8 ? WHY.splitEights : pair === 9 ? WHY.splitNines : pair === 7 ? WHY.splitSevens : pair === 6 ? WHY.splitSixes : WHY.splitSmall;
  if (code === 'R' || code === 'Rs' || code === 'Rp') return WHY.surrender;
  if (code === 'D' || code === 'Ds') return soft ? WHY.doubleSoft : total === 11 ? WHY.double11 : total === 10 ? WHY.double10 : WHY.double9;
  if (code === 'S') {
    if (total === 21) return WHY.blackjack;
    if (soft) return WHY.softStand;
    if (total >= 17) return WHY.standMade;
    return WHY.standStiff;
  }
  if (soft) return WHY.softHit;
  if (total <= 11) return WHY.low;
  if (total === 12 && u <= 3) return WHY.hit12;
  return WHY.hitStiff;
}

/**
 * The basic-strategy play. `can` says which of double / split / surrender the table allows right
 * now (a play that isn't open falls back to the next best one).
 */
export function advise({ cards, up, rules, can = {} }) {
  const u = upValue(up);
  const { total, soft } = handValue(cards);
  const pair = cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]) ? cardValue(cards[0]) : 0;
  let code = null;
  if (pair && can.split) code = pairPlay(pair, u, rules);
  if (code === 'Rp') code = can.surrender ? 'R' : 'P';
  if (!code) code = soft ? softPlay(total, u, rules) : hardPlay(total, u, rules);
  if ((code === 'R' || code === 'Rs') && !can.surrender) code = code === 'Rs' ? 'S' : null;
  if (code === null) code = hardPlay(total, u, { ...rules, surrender: 'never' });
  if (code === 'D' && !can.double) code = 'H';
  if (code === 'Ds' && !can.double) code = 'S';
  const action = { H: 'hit', S: 'stand', D: 'double', Ds: 'double', P: 'split', R: 'surrender', Rs: 'surrender' }[code];
  let why = reason(code, { total, soft, pair, u });
  if (pair === 10 && action !== 'split' && can.split) why = WHY.noTens;
  return { action, why };
}

/** Insurance pays when a third or more of the unseen cards are tens: about a true count of +3. */
export function insuranceAdvice(trueCount = null) {
  if (trueCount != null && trueCount >= 3) return { take: true, why: `The true count is +${trueCount}: enough tens are left that insurance is worth taking this time.` };
  return { take: false, why: 'Skip insurance. It is a side bet that the hole card is a ten, and it loses money in the long run.' };
}

/** A line about the count, for the hint when the count is shown. */
export function countNote(running, trueCount) {
  if (trueCount >= 2) return `The count is +${trueCount}: more tens and aces are left, which favors you.`;
  if (trueCount <= -2) return `The count is ${trueCount}: more small cards are left, which favors the dealer.`;
  return `The count is near zero (running ${running > 0 ? '+' : ''}${running}): the shoe is about neutral.`;
}
