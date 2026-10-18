// Let It Ride (stub): three bets per seat (1, 2 and $), two community cards in the middle.
// TODO wiring (also listed on the table):
//   - engine js/casino/engines/let-it-ride.js: 5-card hand ranks from 3 own + 2 community cards
//   - three equal bets from the chip rack
//   - Deal three cards; Pull back bet 1 or Let it ride; first community card; same for bet 2;
//     second community card; pay the hand on every bet still up
//   - pay table: pair of tens or better pays
//   - settle through ctx.bank, recordHand, ctx.checkBroke()
import { pokerTable } from '../pokertable.js';
import { stubGame, howtoSections } from '../stub.js';

export function layout() {
  return pokerTable({
    name: 'Let It Ride',
    label: 'Let It Ride table: two community cards on top, bets 1, 2 and $ at five seats',
    dealerCards: 2,
    dealerNote: 'Community cards',
    payLines: ['Pays on every bet still riding', 'Royal flush 1000 to 1 · Straight flush 200 to 1 · Four of a kind 50 to 1',
      'Full house 11 to 1 · Flush 8 to 1 · Straight 5 to 1', 'Three of a kind 3 to 1 · Two pair 2 to 1 · Tens or better 1 to 1'],
    spots: [
      { r: 335, label: '1', key: 'bet1', radius: 25, size: 20 },
      { r: 395, label: '2', key: 'bet2', radius: 25, size: 20 },
      { r: 455, label: '$', key: 'bet3', radius: 25, size: 20 },
    ],
  });
}

export default stubGame({
  id: 'let-it-ride', name: 'Let It Ride', layout,
  todo: [
    'Five-card hand ranks from your three cards and two community cards (DOM-free engine + tests)',
    'Three equal bets from the chip rack',
    'Pull back bet 1 or let it ride; turn the first community card; the same for bet 2; turn the second',
    'Pay the hand on every bet still riding: tens or better pays',
    'Settle through the bank; record the hand; broke check',
  ],
  howto: howtoSections([
    ['The aim', 'Make a pair of tens or better with your three cards and the two community cards.'],
    ['Taking bets back', 'You place three equal bets. After seeing your cards you may pull back the first; after the first community card, the second. The $ bet always rides.'],
  ]),
});
