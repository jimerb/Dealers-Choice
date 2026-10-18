// Slots (stub): a three-reel, one-line machine: reel windows, pay line, meters, pay table.
// TODO wiring (also listed on the machine):
//   - engine js/casino/engines/slots.js: reel strips (our own symbol theme), crypto spin, pay table,
//     tests for the return-to-player figure
//   - bet 1-3 credits at the machine's denomination (ctx.stakes.denom)
//   - Spin: reels stop left to right with a short animation (reel symbol art optional; text first)
//   - credits from and to the bank (ctx.bank); recordHand; ctx.checkBroke()
import { svg, rect, text, path } from '../svg.js';
import { stubGame, howtoSections } from '../stub.js';

const PAYS = [['Three sevens', 200], ['Three bars', 50], ['Three bells', 20], ['Three cherries', 10], ['Two cherries', 5], ['One cherry', 2]];

export function layout() {
  const W = 620, H = 660;
  const reels = [0, 1, 2].map((i) => `${rect(90 + i * 150, 110, 130, 190, { r: 10, cls: 'cz-mslot' })}${text(155 + i * 150, 205, '?', { size: 54, cls: 'cz-mtx dim' })}`).join('');
  const pays = PAYS.map(([name, v], i) => text(150, 470 + i * 24, name, { size: 16, anchor: 'start', cls: 'cz-mtx' }) + text(460, 470 + i * 24, `${v} per credit`, { size: 16, anchor: 'end', cls: 'cz-mtx' })).join('');
  const meter = (x, label) => `${rect(x, 330, 140, 56, { r: 6, cls: 'cz-mscreen' })}${text(x + 70, 346, label, { size: 13, cls: 'cz-mtx dim' })}${text(x + 70, 368, '0', { size: 20, cls: 'cz-mtx' })}`;
  return svg(W, H, `${rect(10, 10, 560, H - 20, { r: 30, cls: 'cz-cabinet' })}
    ${rect(60, 30, 480, 56, { r: 10, cls: 'cz-mscreen' })}${text(300, 58, 'Reel theme to come', { size: 20, cls: 'cz-mtx dim' })}
    ${reels}${path('M70 205 H530', { cls: 'cz-payline' })}
    ${meter(80, 'WIN')}${meter(230, 'BET')}${meter(380, 'CREDITS')}
    ${rect(110, 420, 380, 200, { r: 8, cls: 'cz-mscreen' })}${text(300, 442, 'PAYS', { size: 15, weight: 700, cls: 'cz-mtx' })}${pays}
    ${rect(578, 150, 14, 160, { r: 7, cls: 'cz-lever' })}<circle cx="585" cy="140" r="20" class="cz-lever-knob"/>`,
  { label: 'Slot machine: three reels with one pay line, win, bet and credit meters, pay table', cls: 'cz-machine' });
}

export default stubGame({
  id: 'slots', name: 'Slots', layout,
  todo: [
    'Reel strips with our own symbol theme; pay table and its return-to-player figure (DOM-free engine + tests)',
    'Bet one to three credits at the machine\'s denomination',
    'Spin: reels stop left to right with a short animation',
    'Reel symbol and cabinet art (optional; the machine works with text symbols first)',
    'Credits from and to the bank; record each spin; broke check',
  ],
  howto: howtoSections([
    ['Play', 'Choose your bet and spin. Symbols lined up on the pay line pay the amounts on the machine, times your credits bet.'],
  ]),
});
