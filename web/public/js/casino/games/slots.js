// Slots (stub): "Brass Crown", three reels and one pay line: reel windows, meters, pay table.
// Symbols (art to come, crown-*.png): crown W (wild, top award), gold ingots D, bell B,
// horseshoe H, clover C, cherries R; blanks between them are drawn by code.
// TODO wiring (also listed on the machine):
//   - engine js/casino/engines/slots.js: the three 32-stop reel strips, crypto spin, the pay table
//     below, crowns wild for ingots/bell/horseshoe/clover (x2 with one crown, x4 with two);
//     a test that enumerates all 32,768 stops and checks the return (about 93.8%, 94.6% at 3 coins)
//   - bet 1-3 coins at the machine's denomination (ctx.stakes.denom); Bet One, Bet Max, Spin
//   - Spin: reels stop left to right; three rows show through each window
//   - credits from and to the bank (ctx.bank, cash out on leave); recordHand; ctx.checkBroke()
import { svg, rect, text, path } from '../svg.js';
import { stubGame, howtoSections } from '../stub.js';

export const PAYS = [
  ['Crown Crown Crown', '800 (3 coins: 3,200)'], ['Three ingots', '100'], ['Three bells', '40'], ['Three horseshoes', '20'],
  ['Three clovers', '10'], ['Any three mixed, no cherries', '3'], ['Three cherries', '10'], ['Any two cherries', '5'], ['Any one cherry', '2'],
];
const REELS = [['Clover', 'Crown', 'Bell'], ['Horseshoe', 'Ingots', 'Cherries'], ['Bell', 'Clover', 'Horseshoe']];

export function layout() {
  const W = 620, H = 760;
  const windows = REELS.map((_, i) => rect(90 + i * 150, 110, 130, 190, { r: 10, cls: 'cz-mslot' })).join('');
  const symbols = REELS.map((rows, i) => rows.map((sym, j) =>
    text(155 + i * 150, 142 + j * 63, sym, { size: j === 1 ? 20 : 15, weight: j === 1 ? 700 : 500, cls: j === 1 ? 'cz-mtx' : 'cz-mtx dim' })).join('')).join('');
  const reels = `${windows}${path('M70 205 H530', { cls: 'cz-payline' })}${symbols}`;
  const pays = PAYS.map(([name, v], i) => text(130, 468 + i * 26, name, { size: 16, anchor: 'start', cls: 'cz-mtx' }) + text(490, 468 + i * 26, v, { size: 16, anchor: 'end', cls: 'cz-mtx' })).join('');
  const meter = (x, label) => `${rect(x, 330, 140, 56, { r: 6, cls: 'cz-mscreen' })}${text(x + 70, 346, label, { size: 13, cls: 'cz-mtx dim' })}${text(x + 70, 368, '0', { size: 20, cls: 'cz-mtx' })}`;
  return svg(W, H, `${rect(10, 10, 560, H - 20, { r: 30, cls: 'cz-cabinet' })}
    ${rect(60, 30, 480, 56, { r: 10, cls: 'cz-mscreen' })}${text(300, 58, 'BRASS CROWN', { size: 26, weight: 700, cls: 'cz-mtx' })}
    ${reels}
    ${meter(80, 'WIN')}${meter(230, 'COINS')}${meter(380, 'CREDITS')}
    ${rect(100, 410, 420, 320, { r: 8, cls: 'cz-mscreen' })}${text(310, 434, 'PAYS PER COIN', { size: 15, weight: 700, cls: 'cz-mtx' })}${pays}
    ${text(310, 712, 'Crown is wild except for cherries: one crown x2, two crowns x4', { size: 13, cls: 'cz-mtx dim' })}
    ${rect(578, 150, 14, 160, { r: 7, cls: 'cz-lever' })}<circle cx="585" cy="140" r="20" class="cz-lever-knob"/>`,
  { label: 'Brass Crown slot machine: three reels with one pay line, win, coin and credit meters, pay table', cls: 'cz-machine' });
}

export default stubGame({
  id: 'slots', name: 'Slots', layout,
  todo: [
    'Brass Crown reel strips, crypto spin and pay table; an exact return-to-player test (DOM-free engine)',
    'Bet one to three coins at the machine\'s denomination: Bet One, Bet Max, Spin',
    'Reels stop left to right with three rows showing through each window',
    'Crown, ingot, bell, horseshoe, clover and cherry symbol art (text symbols until it arrives)',
    'Credits from and to the bank, cashed out on leaving; record each spin; broke check',
  ],
  options: ['Fast reels', 'Autoplay 10, 25 or 50 spins'],
  howto: howtoSections([
    ['Play', 'Bet one to three coins and spin. Symbols lined up on the pay line pay the amounts on the machine, times your coins.'],
    ['Crowns', 'The crown is wild for ingots, bells, horseshoes and clovers (not cherries). One crown in a win doubles it, two crowns pay four times. Three crowns is the top award, boosted on three coins.'],
  ]),
});
