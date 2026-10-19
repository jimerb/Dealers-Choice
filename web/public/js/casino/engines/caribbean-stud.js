// Caribbean Stud rules (no DOM). One deck, shuffled for every hand. The player antes (and may add a
// $1 bonus bet), gets five cards and sees one of the dealer's five. Fold (losing the Ante and the
// bonus) or raise: a Bet of twice the Ante. The dealer needs ace-king or better to qualify. If not,
// the Ante pays 1 to 1 and the Bet comes back. If so, the better hand wins: the Ante pays 1 to 1 and
// the Bet by the pay table; a tie returns both. The bonus pays on the player's hand alone.
//
//   deal({ ante, bonus }, rng, { cards })  -> state, phase 'decide' (bonus: 0 or 1 dollar)
//   resolve(state, 'raise' | 'fold')       -> state with `result` (phase 'done')
//   advise(player, dealerUp)               -> { raise, text }
import { newShoe, drawN, stack } from '../kit/shoe.js';
import { evaluate, describe, compare, rankValue, HAND } from '../kit/poker.js';

/** The Bet's pay table: x to 1 by five-card category (a pair or less pays 1 to 1). */
export const BET_PAYS = {
  [HAND.ROYAL]: 100, [HAND.STRAIGHT_FLUSH]: 50, [HAND.QUADS]: 20, [HAND.FULL_HOUSE]: 7, [HAND.FLUSH]: 5,
  [HAND.STRAIGHT]: 4, [HAND.TRIPS]: 3, [HAND.TWO_PAIR]: 2, [HAND.PAIR]: 1, [HAND.HIGH]: 1,
};
/** The $1 bonus bet: fixed winnings in dollars (the dollar comes back too). */
export const BONUS_PAYS = { [HAND.ROYAL]: 200000, [HAND.STRAIGHT_FLUSH]: 20000, [HAND.QUADS]: 500, [HAND.FULL_HOUSE]: 100, [HAND.FLUSH]: 50 };
export const BONUS_BET = 1;

export const OPTIONS = [
  { key: 'bonus', label: 'Offer the $1 bonus bet', type: 'check', default: true },
  { key: 'hint', label: 'Show the Hint button', type: 'check', default: false },
];

/** The Ante plus room for the Bet (twice the Ante). */
export const minBuyIn = (stakes) => 3 * stakes.min;

/** The dealer plays with ace-king or better. */
export const dealerQualifies = (ev) => ev.cat > HAND.HIGH || (ev.tiebreak[0] === 14 && ev.tiebreak[1] === 13);

/** Raise or fold, given the player's five cards and the dealer's face-up card. */
export function advise(player, up) {
  const ev = evaluate(player);
  if (ev.cat > HAND.HIGH) return { raise: true, text: `Raise: ${describe(ev).toLowerCase()}, and a pair or better always raises.` };
  const [a, b] = ev.tiebreak;
  if (!(a === 14 && b === 13)) return { raise: false, text: `Fold: ${describe(ev).toLowerCase()} is less than ace-king.` };
  const ranks = ev.tiebreak; // A, K and three more, high to low
  const u = rankValue(up);
  const match = ranks.includes(u);
  if (match && u >= 2 && u <= 12) return { raise: true, text: 'Raise: ace-king, and one of your cards matches the dealer\'s up card.' };
  if ((u === 14 || u === 13) && (ranks.includes(12) || ranks.includes(11))) return { raise: true, text: 'Raise: ace-king with a queen or jack against the dealer\'s ace or king.' };
  if (!match && ranks.includes(12) && u < ranks[3]) return { raise: true, text: 'Raise: ace-king-queen, and the dealer\'s up card is lower than your fourth card.' };
  return { raise: false, text: 'Fold: ace-king alone isn\'t quite enough against this up card.' };
}

const whole = (n) => Number.isSafeInteger(n) && n >= 0;

/** Deal a hand. `cards` (tests) stacks the deck: the player's five, then the dealer's five (the last one face up). */
export function deal({ ante, bonus = 0 } = {}, rng, { cards = null } = {}) {
  if (!whole(ante) || ante < 1) throw new Error('Bet the Ante first.');
  if (bonus !== 0 && bonus !== BONUS_BET) throw new Error('The bonus bet is $1.');
  const shoe = newShoe({ decks: 1, penetration: 1 }, rng);
  if (cards) stack(shoe, cards);
  return { phase: 'decide', ante, bonus, player: drawN(shoe, 5), dealer: drawN(shoe, 5), result: null };
}

/** The dealer's face-up card. */
export const upCard = (state) => state.dealer[4];

export function resolve(state, choice) {
  if (state.phase !== 'decide') throw new Error('This hand is already over.');
  if (!['raise', 'fold'].includes(choice)) throw new Error('Raise or fold.');
  const s = structuredClone(state);
  const pev = evaluate(s.player), dev = evaluate(s.dealer);
  const { ante, bonus } = s;
  const bet = choice === 'raise' ? 2 * ante : 0;
  const qualifies = dealerQualifies(dev);
  const lines = [];
  let outcome;
  if (choice === 'fold') {
    outcome = 'fold';
    lines.push({ bet: 'Ante', stake: ante, back: 0 });
  } else if (!qualifies) {
    outcome = 'noqualify';
    lines.push({ bet: 'Ante', stake: ante, back: 2 * ante });
    lines.push({ bet: 'Bet', stake: bet, back: bet });
  } else {
    const cmp = compare(pev, dev);
    outcome = cmp > 0 ? 'win' : cmp < 0 ? 'lose' : 'push';
    const m = BET_PAYS[pev.cat];
    lines.push({ bet: 'Ante', stake: ante, back: cmp > 0 ? 2 * ante : cmp === 0 ? ante : 0 });
    lines.push({ bet: 'Bet', stake: bet, back: cmp > 0 ? bet * (m + 1) : cmp === 0 ? bet : 0, note: cmp > 0 ? `${m} to 1` : '' });
  }
  if (bonus) {
    const w = choice === 'fold' ? 0 : BONUS_PAYS[pev.cat] ?? 0;
    lines.push({ bet: 'Bonus', stake: bonus, back: w ? w + bonus : 0 });
  }
  const wagered = ante + bet + bonus;
  const returned = lines.reduce((t, l) => t + l.back, 0);
  s.phase = 'done';
  s.result = {
    choice, bet, wagered, returned, net: returned - wagered, outcome, qualifies, lines,
    playerHand: describe(pev), dealerHand: describe(dev), playerCat: pev.cat,
  };
  return s;
}
