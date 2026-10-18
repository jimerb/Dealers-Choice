// Keno (stub): the 80-number board (1-40 over 41-80) and a ticket panel.
// TODO wiring (also listed on the board):
//   - engine js/casino/engines/keno.js: draw 20 of 80 (crypto), pay tables for 1 to 10 spots, tests
//   - tap numbers on the board to mark up to ten spots (data-n on each cell); Quick pick; Clear
//   - ticket price at the machine's denomination (ctx.stakes.denom) times credits
//   - Play: reveal the 20 balls one by one; count catches; pay from the table
//   - settle through ctx.bank, recordHand, ctx.checkBroke()
import { svg, rect, text } from '../svg.js';
import { stubGame, howtoSections } from '../stub.js';

export function layout() {
  const W = 900, H = 520, S = 56;
  const cells = Array.from({ length: 80 }, (_, i) => {
    const n = i + 1, col = i % 10, row = Math.floor(i / 10);
    const x = 30 + col * S, y = 30 + row * S + (row >= 4 ? 16 : 0);
    return `<g data-n="${n}">${rect(x + 3, y + 3, S - 6, S - 6, { r: 8, cls: 'cz-kcell' })}${text(x + S / 2, y + S / 2, String(n), { size: 20 })}</g>`;
  }).join('');
  const pays = [['Spots', 'Catch', 'Pays'], ['1', '1', '3'], ['4', '4', '120'], ['6', '6', '1,500'], ['8', '8', '10,000'], ['10', '10', '100,000']];
  return svg(W, H, `${cells}<path d="M30 ${30 + 4 * S + 8} H${30 + 10 * S}" class="cz-ln"/>
    ${rect(620, 30, 250, 470, { r: 14, cls: 'cz-ln' })}${text(745, 60, 'Ticket', { size: 22, weight: 700 })}
    ${text(745, 96, 'Spots marked: 0 of 10', { size: 15, cls: 'cz-tx dim' })}
    ${pays.map((r, i) => r.map((c, j) => text(660 + j * 85, 140 + i * 30, c, { size: i ? 15 : 13, weight: i ? 500 : 700, cls: i ? 'cz-tx' : 'cz-tx dim' })).join('')).join('')}
    ${text(745, 330, '(full pay tables to come)', { size: 13, cls: 'cz-tx dim' })}
    ${text(745, 400, 'Balls drawn', { size: 15, cls: 'cz-tx dim' })}${text(745, 430, '0 of 20', { size: 24, weight: 700 })}`,
  { label: 'Keno board: numbers 1 to 80 in two halves, and a ticket panel' });
}

export default stubGame({
  id: 'keno', name: 'Keno', layout,
  todo: [
    'Draw 20 of 80 with crypto randomness; pay tables for 1 to 10 spots (DOM-free engine + tests)',
    'Tap numbers to mark up to ten spots; Quick pick; Clear',
    'Ticket price at the chosen denomination',
    'Play: reveal the 20 balls one at a time and count the catches',
    'Settle through the bank; record each game; broke check',
  ],
  howto: howtoSections([
    ['Play', 'Mark from one to ten numbers on the board and play. Twenty numbers of 80 are drawn.'],
    ['Payouts', 'The more of your numbers come up (catches), the more you win. The pay table depends on how many spots you marked.'],
  ]),
});
