// Three Card Poker (stub): at each seat Pair Plus, Ante and Play; the dealer's three cards on top.
// TODO wiring (also listed on the table):
//   - engine js/casino/engines/three-card-poker.js: 3-card hand ranks (straight beats flush), compare
//   - bets: Ante and/or Pair Plus from the chip rack; Play equals the Ante
//   - Deal; then Play or Fold buttons in the bet bar
//   - dealer qualifies with queen high; ante bonus and Pair Plus pay tables
//   - settle through ctx.bank, recordHand, ctx.checkBroke()
import { pokerTable } from '../pokertable.js';
import { stubGame, howtoSections } from '../stub.js';

export function layout() {
  return pokerTable({
    name: 'Three Card Poker',
    label: 'Three Card Poker table: dealer cards on top, Pair Plus, Ante and Play spots at five seats',
    dealerCards: 3,
    dealerNote: 'Dealer plays with queen high or better',
    payLines: ['Ante bonus', 'Straight flush 5 to 1 · Three of a kind 4 to 1 · Straight 1 to 1',
      'Pair Plus', 'Straight flush 40 to 1 · Three of a kind 30 to 1 · Straight 6 to 1', 'Flush 3 to 1 · Pair 1 to 1'],
    spots: [
      { r: 340, label: 'PAIR PLUS', shape: 'diamond', key: 'pairplus', size: 9 },
      { r: 400, label: 'ANTE', shape: 'circle', key: 'ante', size: 12 },
      { r: 455, label: 'PLAY', shape: 'box', key: 'play', size: 13 },
    ],
  });
}

export default stubGame({
  id: 'three-card-poker', name: 'Three Card Poker', layout,
  todo: [
    'Three-card hand ranks (a straight beats a flush) and the comparison (DOM-free engine + tests)',
    'Ante and Pair Plus bets from the chip rack; Play matches the Ante',
    'Deal, then Play or Fold',
    'Dealer qualifies with queen high; ante bonus and Pair Plus pay tables',
    'Settle through the bank; record the hand; broke check',
  ],
  howto: howtoSections([
    ['The aim', 'Beat the dealer\'s three-card hand. After seeing your cards, fold (losing the Ante) or play by matching the Ante.'],
    ['Hand ranks', 'From the top: straight flush, three of a kind, straight, flush, pair, high card.'],
    ['Pair Plus', 'A side bet paid on your own hand alone, whatever the dealer holds.'],
  ]),
});
