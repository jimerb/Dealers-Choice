// Keno (stub): the 80-number board (1-40 over 41-80) and a ticket panel.
// TODO wiring (also listed on the board):
//   - engine js/casino/engines/keno.js: draw 20 of 80 (crypto), pay tables for 1 to 10 spots, tests
//   - tap numbers on the board to mark up to ten spots (data-n on each cell); Quick pick; Clear
//   - ticket price at the machine's denomination (ctx.stakes.denom) times credits
//   - Play: reveal the 20 balls one by one; count catches; pay from the table
//   - settle through ctx.bank, recordHand, ctx.checkBroke()
import { svg, rect, text, circle } from '../svg.js';
import { ART, svgArt, tilePattern } from '../art.js';
import { stubGame, howtoSections } from '../stub.js';

// The board picture is 1200 x 800; its magenta panel (where the code draws the numbers) in those units:
const PANEL = { x: 94, y: 86, w: 1012, h: 586 };

/** The lounge's number board: 1-40 over 41-80 in the board's window. */
export function layout() {
  const W = 1200, H = 800, gap = 12;
  const cw = PANEL.w / 10, ch = (PANEL.h - gap) / 8;
  const cells = Array.from({ length: 80 }, (_, i) => {
    const n = i + 1, col = i % 10, row = Math.floor(i / 10);
    const x = PANEL.x + col * cw, y = PANEL.y + row * ch + (row >= 4 ? gap : 0);
    return `<g data-n="${n}">${rect(x + 5, y + 5, cw - 10, ch - 10, { r: 8, cls: 'cz-kcell' })}${text(x + cw / 2, y + ch / 2, String(n), { size: 32, weight: 700, cls: 'cz-ktx' })}</g>`;
  }).join('');
  // a code-drawn frame underneath: the picture covers it, and it stands in if the picture fails
  const frame = rect(10, 10, W - 20, H - 20, { r: 18, cls: 'cz-kframe' });
  return svg(W, H, `${frame}${rect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, { cls: 'cz-kpanel' })}${cells}
    ${svgArt(ART.kenoBoard, 0, 0, W, H)}`,
  { label: 'Keno board: numbers 1 to 80 in two halves', cls: 'cz-keno-board' });
}

/** The blower with a few balls in its glass, and the ticket on keno paper. */
function side() {
  const W = 520, H = 800;
  const balls = [[150, 120, 7], [205, 150, 23], [120, 175, 41], [180, 205, 66], [235, 95, 12], [100, 120, 58], [225, 205, 79], [160, 70, 35]];
  const ball = (cx, cy, r, n) => `${svgArt(ART.kenoBall, cx - r, cy - r, 2 * r, 2 * r, circle(cx, cy, r * 0.82, { cls: 'cz-kball' }))}${text(cx, cy + 1, String(n), { size: Math.round(r * 0.8), weight: 800, cls: 'cz-kball-tx' })}`;
  // the blower picture is drawn 330 wide at (20, 0): its glass is a circle about (170, 130) r 82
  const glass = circle(185, 135, 84, { cls: 'cz-kglass' });
  const blower = `${svgArt(ART.kenoBlower, 20, 0, 330, 330, glass)}${balls.map(([x, y, n]) => ball(x + 20, y, 18, n)).join('')}`;
  const drawn = [7, 23, 41].map((n, i) => ball(400 + i * 0, 60 + i * 64, 26, n)).join('');
  const pays = [['Spots', 'Catch', 'Pays'], ['1', '1', '3'], ['4', '4', '120'], ['6', '6', '1,500'], ['8', '8', '10,000'], ['10', '10', '100,000']];
  const ticket = `<defs>${tilePattern('cz-kpaper', ART.kenoPaper, 400)}</defs>
    ${rect(20, 350, 480, 430, { r: 10, cls: 'cz-ticket' })}${rect(20, 350, 480, 430, { r: 10, cls: 'cz-ticket-paper' })}
    ${text(260, 390, 'Ticket', { size: 26, weight: 800, cls: 'cz-ticket-tx' })}
    ${text(260, 426, 'Spots marked: 0 of 10', { size: 18, cls: 'cz-ticket-tx dim' })}
    ${pays.map((r, i) => r.map((c, j) => text(120 + j * 140, 476 + i * 36, c, { size: i ? 19 : 16, weight: i ? 500 : 800, cls: i ? 'cz-ticket-tx' : 'cz-ticket-tx dim' })).join('')).join('')}
    ${text(260, 706, '(full pay tables to come)', { size: 15, cls: 'cz-ticket-tx dim' })}
    ${text(260, 744, 'Balls drawn: 0 of 20', { size: 20, weight: 700, cls: 'cz-ticket-tx' })}`;
  return svg(W, H, `${blower}${drawn}${ticket}`, { label: 'The ball blower and your keno ticket', cls: 'cz-keno-side' });
}

const stage = () => `<div class="cz-keno">${layout()}${side()}</div>`;

export default stubGame({
  id: 'keno', name: 'Keno', layout, stage,
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
