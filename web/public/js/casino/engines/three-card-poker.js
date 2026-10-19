// Three Card Poker rules (no DOM). One deck, shuffled for every hand. The player bets an Ante, a
// Pair Plus side bet, or both; sees three cards; then folds or plays (a Play bet equal to the Ante).
// The dealer needs queen high or better to qualify.
//
//   deal({ ante, pairPlus }, rng, { cards })  -> state (phase 'decide', or 'done' for Pair Plus alone)
//   resolve(state, 'play' | 'fold', opts)      -> state with `result` (phase 'done')
//   advise(cards)                              -> { play, text }: the queen-six-four rule
//
// result: { choice, play, wagered, returned, net, outcome, qualifies, lines: [{ bet, stake, back, note }] }
// `returned` is everything that goes back to the bank (stakes plus winnings), whole dollars.
import { newShoe, drawN, stack } from '../kit/shoe.js';
import { evaluate3, describe3, compare, HAND3 } from '../kit/poker.js';

/** Pair Plus tables: winnings per dollar ("x to 1") by three-card category. */
export const PAIR_PLUS = {
  '40-30-6-4-1': { label: 'Flush pays 4 to 1 (standard)', pays: { [HAND3.STRAIGHT_FLUSH]: 40, [HAND3.TRIPS]: 30, [HAND3.STRAIGHT]: 6, [HAND3.FLUSH]: 4, [HAND3.PAIR]: 1 } },
  '40-30-6-3-1': { label: 'Flush pays 3 to 1', pays: { [HAND3.STRAIGHT_FLUSH]: 40, [HAND3.TRIPS]: 30, [HAND3.STRAIGHT]: 6, [HAND3.FLUSH]: 3, [HAND3.PAIR]: 1 } },
};
export const DEFAULT_PAIR_PLUS = '40-30-6-4-1';
/** Ante bonus: paid on the Ante whenever the player plays, win or lose against the dealer. */
export const ANTE_BONUS = { [HAND3.STRAIGHT_FLUSH]: 5, [HAND3.TRIPS]: 4, [HAND3.STRAIGHT]: 1 };

export const OPTIONS = [
  { key: 'pairPlus', label: 'Pair Plus pay table', type: 'select', options: Object.entries(PAIR_PLUS).map(([k, t]) => [k, t.label]), default: DEFAULT_PAIR_PLUS },
  { key: 'hint', label: 'Show the Hint button', type: 'check', default: true },
];

/** The least a round needs: an Ante and the Play that matches it. */
export const minBuyIn = (stakes) => 2 * stakes.min;

const pairPlusTable = (opts) => (PAIR_PLUS[opts?.pairPlus] ?? PAIR_PLUS[DEFAULT_PAIR_PLUS]).pays;

/** The dealer plays with queen high or better. */
export const dealerQualifies = (ev) => ev.cat > HAND3.HIGH || ev.tiebreak[0] >= 12;

const Q64 = [12, 6, 4];
/** Queen-six-four or better: any pair or better, or high cards at least Q, 6, 4 (compared in order). */
export function atLeastQ64(ev) {
  if (ev.cat > HAND3.HIGH) return true;
  for (let i = 0; i < 3; i++) if (ev.tiebreak[i] !== Q64[i]) return ev.tiebreak[i] > Q64[i];
  return true;
}

/** The strategy hint for three cards. */
export function advise(cards) {
  const ev = evaluate3(cards);
  const play = atLeastQ64(ev);
  const name = describe3(ev);
  if (ev.cat > HAND3.HIGH) return { play, text: `Play: ${name.toLowerCase()} is better than queen-six-four.` };
  return play
    ? { play, text: `Play: ${name.toLowerCase()} at queen-six-four or better.` }
    : { play, text: `Fold: ${name.toLowerCase()} is below queen-six-four.` };
}

const whole = (n) => Number.isSafeInteger(n) && n >= 0;

/** Deal a hand. `cards` (tests) stacks the deck: the player's three, then the dealer's three. */
export function deal({ ante = 0, pairPlus = 0 } = {}, rng, { cards = null, opts = {} } = {}) {
  if (!whole(ante) || !whole(pairPlus)) throw new Error('Bets are whole dollars.');
  if (!ante && !pairPlus) throw new Error('Bet the Ante, Pair Plus, or both.');
  const shoe = newShoe({ decks: 1, penetration: 1 }, rng);
  if (cards) stack(shoe, cards);
  const player = drawN(shoe, 3), dealer = drawN(shoe, 3);
  const state = { phase: 'decide', ante, pairPlus, player, dealer, result: null };
  return ante ? state : resolve(state, 'none', opts);
}

/** The player decides (or, with no Ante, the Pair Plus alone is settled). */
export function resolve(state, choice, opts = {}) {
  if (state.phase !== 'decide') throw new Error('This hand is already over.');
  if (state.ante ? !['play', 'fold'].includes(choice) : choice !== 'none') throw new Error('Play or fold.');
  const s = structuredClone(state);
  const pev = evaluate3(s.player), dev = evaluate3(s.dealer);
  const { ante, pairPlus } = s;
  const play = choice === 'play' ? ante : 0;
  const qualifies = dealerQualifies(dev);
  const lines = [];
  let outcome = 'none';
  if (ante) {
    if (choice === 'fold') {
      outcome = 'fold';
      lines.push({ bet: 'Ante', stake: ante, back: 0, note: 'folded' });
    } else {
      const cmp = compare(pev, dev);
      if (!qualifies) {
        outcome = 'noqualify';
        lines.push({ bet: 'Ante', stake: ante, back: 2 * ante, note: 'dealer doesn\'t qualify: 1 to 1' });
        lines.push({ bet: 'Play', stake: play, back: play, note: 'push' });
      } else if (cmp > 0) {
        outcome = 'win';
        lines.push({ bet: 'Ante', stake: ante, back: 2 * ante, note: '1 to 1' });
        lines.push({ bet: 'Play', stake: play, back: 2 * play, note: '1 to 1' });
      } else if (cmp < 0) {
        outcome = 'lose';
        lines.push({ bet: 'Ante', stake: ante, back: 0, note: 'dealer wins' });
        lines.push({ bet: 'Play', stake: play, back: 0, note: 'dealer wins' });
      } else {
        outcome = 'push';
        lines.push({ bet: 'Ante', stake: ante, back: ante, note: 'tie: push' });
        lines.push({ bet: 'Play', stake: play, back: play, note: 'tie: push' });
      }
      const bonus = ANTE_BONUS[pev.cat] ?? 0;
      if (bonus) lines.push({ bet: 'Ante bonus', stake: 0, back: bonus * ante, note: `${bonus} to 1` });
    }
  }
  if (pairPlus) {
    const m = choice === 'fold' ? 0 : pairPlusTable(opts)[pev.cat] ?? 0;
    lines.push({ bet: 'Pair Plus', stake: pairPlus, back: m ? pairPlus * (m + 1) : 0, note: choice === 'fold' ? 'folded' : m ? `${m} to 1` : 'no pair' });
  }
  const wagered = ante + play + pairPlus;
  const returned = lines.reduce((t, l) => t + l.back, 0);
  s.phase = 'done';
  s.result = {
    choice, play, wagered, returned, net: returned - wagered, outcome, qualifies, lines,
    playerHand: describe3(pev), dealerHand: describe3(dev),
  };
  return s;
}
