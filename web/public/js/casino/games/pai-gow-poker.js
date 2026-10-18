// Pai Gow Poker (stub): per seat a bet circle and High (5 cards) / Low (2 cards) boxes; the
// dealer's seven cards on top.
// TODO wiring (also listed on the table):
//   - engine js/casino/engines/pai-gow-poker.js: 53-card deck with one joker (aces, straights,
//     flushes), 5- and 2-card ranks, the house way for setting the dealer's hand
//   - bet from the chip rack; Deal seven each
//   - let the player split the seven into High and Low (low must rank below high); "House way" button
//   - win both: paid 1 to 1 less 5% commission; win one: push; lose both or copies: dealer
//   - settle through ctx.bank, recordHand, ctx.checkBroke()
import { pokerTable } from '../pokertable.js';
import { rect, text, polar } from '../svg.js';
import { stubGame, howtoSections } from '../stub.js';

export function layout() {
  return pokerTable({
    label: 'Pai Gow Poker table: dealer\'s seven cards on top, a bet circle and High and Low boxes at five seats',
    dealerCards: 7,
    dealerNote: 'Dealer sets the house way · copies go to the dealer',
    payLines: ['Win both hands: paid 1 to 1, less 5% commission', 'Win one hand: push · Lose both: the bet is lost'],
    spots: [{ r: 450, label: 'BET', key: 'bet', size: 14 }],
    extras: (cx, cy, a, i) => {
      const [hx, hy] = polar(cx, cy, 375, a);
      const [lx, ly] = polar(cx, cy, 315, a);
      return `<g data-spot="high:${i}">${rect(hx - 34, hy - 16, 68, 32, { r: 5 })}${text(hx, hy, 'HIGH', { size: 12 })}</g>
        <g data-spot="low:${i}">${rect(lx - 26, ly - 14, 52, 28, { r: 5 })}${text(lx, ly, 'LOW', { size: 11 })}</g>`;
    },
  });
}

export default stubGame({
  id: 'pai-gow-poker', name: 'Pai Gow Poker', layout,
  todo: [
    'Deck with one joker; five- and two-card ranks; the house way (DOM-free engine + tests)',
    'Bet from the chip rack; deal seven cards each',
    'Split your seven into High (five) and Low (two); a House way button',
    'Win both: paid even less 5% commission; win one: push; lose both or copies: lost',
    'Settle through the bank; record the hand; broke check',
  ],
  howto: howtoSections([
    ['The aim', 'Split seven cards into a five-card high hand and a two-card low hand, and beat both of the dealer\'s.'],
    ['Setting', 'Your high hand must outrank your low hand. The joker counts as an ace, or completes a straight or flush.'],
    ['Results', 'Win both: paid even money less 5%. Win one: a push. Lose both, or tie a hand (copies go to the dealer): the bet is lost.'],
  ]),
});
