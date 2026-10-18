// Baccarat (stub): Player, Banker and Tie betting arcs, with the two hands' card boxes on top.
// TODO wiring (also listed on the table):
//   - engine js/casino/engines/baccarat.js: 8-deck shoe, hand values mod 10, the third-card rules
//   - bets on PLAYER / BANKER / TIE from the chip rack
//   - Deal: draw by the tableau, show both hands, announce the winner
//   - pay Player 1 to 1, Banker 1 to 1 less 5% commission (rounded down to whole dollars), Tie 8 to 1;
//     a tie pushes Player and Banker bets
//   - settle through ctx.bank, recordHand, ctx.checkBroke(); scoreboard of recent results
import { svg, path, text, arcText, band, cardSlot, tableRail } from '../svg.js';
import { railBand, tableCrest, shoe, discardTray, CREST_TOP } from '../tableart.js';
import { stubGame, howtoSections } from '../stub.js';

export function layout() {
  const W = 1000, H = 560;
  const { cx, cy, r, d, edge } = tableRail(W, H, 30);
  const hand = (x, label) => `${cardSlot(x - 55, 100, 46)}${cardSlot(x, 100, 46)}${cardSlot(x + 55, 100, 46)}${text(x, 160, label, { size: 18, cls: 'cz-tx dim' })}`;
  return svg(W, H, `${railBand(edge, d, W, H)}${path(d, { cls: 'cz-rail' })}${tableCrest('Baccarat')}
    ${shoe()}${discardTray()}
    ${hand(330, 'Player hand')}${hand(670, 'Banker hand')}
    ${band(cx, cy, 280, 330, 155, 25, { cls: 'cz-area', attrs: 'data-spot="tie"' })}${arcText(cx, cy, 298, 155, 25, 'TIE PAYS 8 TO 1', { size: 22 })}
    ${band(cx, cy, 340, 402, 162, 18, { cls: 'cz-area', attrs: 'data-spot="banker"' })}${arcText(cx, cy, 364, 162, 18, 'BANKER PAYS 1 TO 1 LESS 5%', { size: 24 })}
    ${band(cx, cy, 412, 476, 167, 13, { cls: 'cz-area', attrs: 'data-spot="player"' })}${arcText(cx, cy, 436, 167, 13, 'PLAYER PAYS 1 TO 1', { size: 26 })}`,
  { label: 'Baccarat table: Player and Banker hands at the top, Tie, Banker and Player betting arcs', top: CREST_TOP });
}

export default stubGame({
  id: 'baccarat', name: 'Baccarat', layout,
  todo: [
    'Eight-deck shoe; hand values (last digit of the total); the third-card tableau (DOM-free engine + tests)',
    'Bets on Player, Banker or Tie from the chip rack',
    'Deal both hands by the rules and announce the winner',
    'Pay Player 1 to 1, Banker 1 to 1 less 5% commission, Tie 8 to 1; a tie pushes Player and Banker',
    'Settle through the bank; record the hand; broke check; scoreboard of recent results',
  ],
  options: ['Commission-free variant (Banker 6 pays half)'],
  howto: howtoSections([
    ['The aim', 'Bet on which hand will finish closer to 9: the Player or the Banker. Or bet on a tie.'],
    ['Counting', 'Aces count 1, tens and face cards 0, other cards their value. Only the last digit of the total counts: 7 + 8 = 15 counts as 5.'],
    ['Payouts', '<ul><li>Player pays 1 to 1.</li><li>Banker pays 1 to 1, less a 5% commission.</li><li>Tie pays 8 to 1.</li></ul>'],
  ]),
});
