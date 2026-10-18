// Caribbean Stud (stub): Ante and Bet boxes per seat; the dealer's five cards on top.
// TODO wiring (also listed on the table):
//   - engine js/casino/engines/caribbean-stud.js: 5-card hand ranks and comparison
//   - Ante from the chip rack; Deal five each, one dealer card up
//   - Raise (Bet = 2 x Ante) or Fold
//   - dealer qualifies with ace-king or better; if not, the Ante pays 1 to 1 and the Bet pushes
//   - bonus pay table on the Bet; settle through ctx.bank, recordHand, ctx.checkBroke()
//   (progressive jackpot side bet: deferred, not in this version)
import { pokerTable } from '../pokertable.js';
import { stubGame, howtoSections } from '../stub.js';

export function layout() {
  return pokerTable({
    label: 'Caribbean Stud table: dealer\'s five cards on top, Ante and Bet boxes at five seats',
    dealerCards: 5,
    dealerNote: 'Dealer qualifies with ace-king or better',
    payLines: ['Bet pays', 'Royal flush 100 to 1 · Straight flush 50 to 1 · Four of a kind 20 to 1',
      'Full house 7 to 1 · Flush 5 to 1 · Straight 4 to 1', 'Three of a kind 3 to 1 · Two pair 2 to 1 · Pair 1 to 1'],
    spots: [
      { r: 360, label: 'BET', shape: 'box', key: 'bet', size: 15 },
      { r: 440, label: 'ANTE', shape: 'box', key: 'ante', size: 15 },
    ],
  });
}

export default stubGame({
  id: 'caribbean-stud', name: 'Caribbean Stud', layout,
  todo: [
    'Five-card hand ranks and the comparison (DOM-free engine + tests)',
    'Ante from the chip rack; deal five cards each with one dealer card face up',
    'Raise (the Bet is twice the Ante) or Fold',
    'Dealer qualifies with ace-king: if not, the Ante pays even and the Bet pushes',
    'Bonus pay table on the Bet; settle through the bank; record the hand; broke check',
  ],
  howto: howtoSections([
    ['The aim', 'Beat the dealer\'s five-card hand. After seeing your cards and one of the dealer\'s, fold or raise.'],
    ['Qualifying', 'The dealer needs ace-king or better. If the dealer doesn\'t qualify, your Ante pays even money and the Bet comes back.'],
  ]),
});
