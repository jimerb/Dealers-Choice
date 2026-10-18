// Blackjack (stub): the half-moon table with five betting spots. Not dealt yet.
// TODO wiring (also listed on the table):
//   - engine js/casino/engines/blackjack.js: 6-deck shoe, cut card, hand totals with soft aces
//   - bets on the spots through the chip rack, table min/max per spot
//   - Deal: two cards each, dealer hole card; blackjack pays 3 to 2; insurance when the dealer shows an ace
//   - Hit / Stand / Double / Split (and re-split) buttons in the bet bar while a hand is live
//   - dealer plays out: stands on all 17s (option: hits soft 17)
//   - settle through ctx.bank, recordHand, ctx.checkBroke(); cosmetic co-players optional
import { svg, path, text, arcText, spot, cardSlot, rect, polar, seatAngles, tableRail } from '../svg.js';
import { stubGame, howtoSections } from '../stub.js';

export function layout() {
  const W = 1000, H = 560;
  const { cx, cy, r, d } = tableRail(W, H, 30);
  const seats = seatAngles(5, 155, 25).map((a, i) => {
    const [x, y] = polar(cx, cy, r - 70, a);
    const [cxs, cys] = polar(cx, cy, r - 165, a);
    return spot(x, y, 36, String(5 - i), { key: `spot:${i}` }) + cardSlot(cxs, cys, 42);
  }).join('');
  return svg(W, H, `${path(d, { cls: 'cz-rail' })}
    ${rect(820, 44, 110, 70, { cls: 'cz-ln', r: 8 })}${text(875, 79, 'Shoe', { size: 18 })}
    ${rect(70, 44, 90, 70, { cls: 'cz-ln', r: 8 })}${text(115, 79, 'Discards', { size: 16 })}
    ${cardSlot(470, 95, 48)}${cardSlot(530, 95, 48)}${text(500, 150, 'Dealer', { size: 18, cls: 'cz-tx dim' })}
    ${arcText(cx, cy, 200, 160, 20, 'BLACKJACK PAYS 3 TO 2', { size: 26 })}
    ${arcText(cx, cy, 240, 160, 20, 'Dealer must draw to 16 and stand on all 17s', { size: 17, weight: 500 })}
    ${arcText(cx, cy, 285, 150, 30, 'INSURANCE PAYS 2 TO 1', { size: 18 })}
    ${seats}`, { label: 'Blackjack table: dealer at the top, five betting spots along the rail' });
}

export default stubGame({
  id: 'blackjack', name: 'Blackjack', layout,
  todo: [
    'Shoe of six decks with a cut card; hand totals with soft aces (DOM-free engine + tests)',
    'Bets on the five spots from the chip rack, within the table limits',
    'Deal; blackjack pays 3 to 2; insurance when the dealer shows an ace',
    'Hit, Stand, Double and Split buttons while a hand is live',
    'Dealer stands on all 17s (Options: hit soft 17)',
    'Settle each spot through the bank; record the hand; broke check',
  ],
  options: ['Dealer hits soft 17', 'Number of decks', 'Double after split'],
  howto: howtoSections([
    ['The aim', 'Finish closer to 21 than the dealer without going over. Number cards count their value, face cards 10, aces 1 or 11.'],
    ['Payouts', '<ul><li>A win pays even money.</li><li>A blackjack (ace and a ten-card on the first two cards) pays 3 to 2.</li><li>Insurance pays 2 to 1.</li></ul>'],
    ['The dealer', 'The dealer draws to 16 and stands on all 17s.'],
  ]),
});
