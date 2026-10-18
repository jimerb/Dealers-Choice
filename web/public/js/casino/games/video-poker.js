// Video Poker (stub): a Jacks or Better machine: pay table, five card windows with Hold buttons,
// credit meters.
// TODO wiring (also listed on the machine):
//   - engine js/casino/engines/video-poker.js: 5-card ranks, Jacks or Better pay table (9/6), tests
//   - bet 1-5 credits at the machine's denomination (ctx.stakes.denom); Bet One / Bet Max
//   - Deal; tap cards (or the Hold buttons) to hold; Draw; pay from the table
//   - card faces from the site's skin (cardHTML); royal flush on 5 credits pays 4000
//   - credits come from and return to the bank (ctx.bank); recordHand; ctx.checkBroke()
import { svg, rect, text, cardSlot } from '../svg.js';
import { stubGame, howtoSections } from '../stub.js';

const PAYS = [
  ['Royal flush', [250, 500, 750, 1000, 4000]], ['Straight flush', [50, 100, 150, 200, 250]],
  ['Four of a kind', [25, 50, 75, 100, 125]], ['Full house', [9, 18, 27, 36, 45]], ['Flush', [6, 12, 18, 24, 30]],
  ['Straight', [4, 8, 12, 16, 20]], ['Three of a kind', [3, 6, 9, 12, 15]], ['Two pair', [2, 4, 6, 8, 10]],
  ['Jacks or better', [1, 2, 3, 4, 5]],
];

export function layout() {
  const W = 720, H = 660;
  const rows = PAYS.map(([name, p], i) => {
    const y = 64 + i * 24;
    return text(70, y, name, { size: 16, anchor: 'start', cls: 'cz-mtx' }) + p.map((v, c) => text(330 + c * 72, y, String(v), { size: 16, cls: 'cz-mtx' })).join('');
  }).join('');
  const cards = [0, 1, 2, 3, 4].map((i) => {
    const x = 120 + i * 120;
    return `${cardSlot(x, 400, 92, { cls: 'cz-mslot' })}<g data-hold="${i}">${rect(x - 44, 488, 88, 36, { r: 6, cls: 'cz-mbtn' })}${text(x, 506, 'HOLD', { size: 15, cls: 'cz-mtx' })}</g>`;
  }).join('');
  const meter = (x, label) => `${rect(x, 556, 180, 56, { r: 6, cls: 'cz-mscreen' })}${text(x + 90, 572, label, { size: 13, cls: 'cz-mtx dim' })}${text(x + 90, 594, '0', { size: 20, cls: 'cz-mtx' })}`;
  return svg(W, H, `${rect(10, 10, W - 20, H - 20, { r: 26, cls: 'cz-cabinet' })}
    ${rect(50, 40, W - 100, 236, { r: 8, cls: 'cz-mscreen' })}${rows}
    ${text(W / 2, 300, 'JACKS OR BETTER', { size: 22, weight: 700, cls: 'cz-mtx' })}
    ${cards}${meter(70, 'WIN')}${meter(270, 'BET')}${meter(470, 'CREDITS')}`,
  { label: 'Video poker machine: pay table, five cards with Hold buttons, win, bet and credit meters', cls: 'cz-machine' });
}

export default stubGame({
  id: 'video-poker', name: 'Video Poker', layout,
  todo: [
    'Five-card ranks and the Jacks or Better (9/6) pay table (DOM-free engine + tests)',
    'Bet one to five credits at the machine\'s denomination; Bet One and Bet Max',
    'Deal; tap cards or Hold buttons; Draw; pay from the table (royal flush on five credits pays 4000)',
    'Cards drawn with the site\'s card skin',
    'Credits come from and go back to the bank; record the hand; broke check',
  ],
  howto: howtoSections([
    ['The aim', 'Make the best five-card poker hand. A pair of jacks or better pays.'],
    ['Play', 'Bet one to five credits and deal. Hold the cards you want to keep and draw new ones for the rest. Paid from the pay table on the machine.'],
  ]),
});
