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
import { ART, svgArt } from '../art.js';
import { stubGame, howtoSections } from '../stub.js';

export const PAYS = [
  ['Crown Crown Crown', '800 (3 coins: 3,200)'], ['Three ingots', '100'], ['Three bells', '40'], ['Three horseshoes', '20'],
  ['Three clovers', '10'], ['Any three mixed, no cherries', '3'], ['Three cherries', '10'], ['Any two cherries', '5'], ['Any one cherry', '2'],
];
// What shows through each reel window (top, pay line, bottom); null is a blank stop (drawn by code).
const REELS = [['clover', 'crown', null], [null, 'ingot', 'cherries'], ['bell', 'crown', null]];
const NAMES = { crown: 'Crown', ingot: 'Ingots', bell: 'Bell', horseshoe: 'Horseshoe', clover: 'Clover', cherries: 'Cherries' };

// The cabinet picture is 800 x 1200; its windows (where the code draws) in those units:
const GLASS = { x: 117, y: 86, w: 566, h: 305 };   // pay table
const REEL = { x: 133, y: 469, w: 534, h: 304 };   // three reels
const METER = { x: 133, y: 805, w: 534, h: 62 };   // win, coins, credits
const DECK = { y: 898, h: 110 };                   // the plain button deck

export function layout() {
  const W = 800, H = 1200;
  const rw = (REEL.w - 16) / 3, rh = REEL.h / 3;
  const reels = REELS.map((rows, i) => {
    const x = REEL.x + i * (rw + 8);
    const strip = `<rect x="${x}" y="${REEL.y}" width="${rw}" height="${REEL.h}" class="cz-reel"/>`;
    const syms = rows.map((sym, j) => {
      const cy = REEL.y + rh * (j + 0.5), size = rh * 0.86;
      if (!sym) return `<rect x="${x + rw * 0.2}" y="${cy - 5}" width="${rw * 0.6}" height="10" rx="5" class="cz-reel-blank"/>`;
      const fallback = text(x + rw / 2, cy, NAMES[sym], { size: 22, weight: 700, cls: 'cz-reel-tx' });
      return svgArt(ART.symbol(sym), x + (rw - size) / 2, cy - size / 2, size, size, fallback);
    }).join('');
    return strip + syms;
  }).join('');
  // the reels curve away at the top and bottom of the window
  const shade = `<defs><linearGradient id="cz-reel-sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".38"/>
    <stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient></defs>
    <rect x="${REEL.x}" y="${REEL.y}" width="${REEL.w}" height="${REEL.h}" fill="url(#cz-reel-sh)" class="cz-reel-shade"/>`;
  const payline = path(`M${REEL.x - 6} ${REEL.y + REEL.h / 2} H${REEL.x + REEL.w + 6}`, { cls: 'cz-payline' });
  const pays = PAYS.map(([name, v], i) => text(GLASS.x + 30, GLASS.y + 66 + i * 26.5, name, { size: 21, anchor: 'start', cls: 'cz-mtx' })
    + text(GLASS.x + GLASS.w - 30, GLASS.y + 66 + i * 26.5, v, { size: 21, anchor: 'end', cls: 'cz-mtx' })).join('');
  const glass = `${rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h, { cls: 'cz-mscreen' })}
    ${text(W / 2, GLASS.y + 30, 'BRASS CROWN · PAYS PER COIN', { size: 23, weight: 800, cls: 'cz-mtx' })}${pays}`;
  const mw = METER.w / 3;
  const meters = ['WIN', 'COINS', 'CREDITS'].map((label, i) => `${rect(METER.x + i * mw + 4, METER.y + 4, mw - 8, METER.h - 8, { r: 6, cls: 'cz-mscreen' })}
    ${text(METER.x + i * mw + mw / 2, METER.y + 20, label, { size: 14, cls: 'cz-mtx dim' })}${text(METER.x + i * mw + mw / 2, METER.y + 42, '0', { size: 22, weight: 700, cls: 'cz-mtx' })}`).join('');
  const buttons = [['BET ONE', 250], ['BET MAX', 400], ['SPIN', 550]].map(([label, x]) =>
    `${rect(x - 64, DECK.y + 30, 128, 50, { r: 25, cls: label === 'SPIN' ? 'cz-mbtn hot' : 'cz-mbtn' })}${text(x, DECK.y + 55, label, { size: 18, weight: 800, cls: 'cz-mbtn-tx' })}`).join('');
  // a code-drawn cabinet underneath: the picture covers it, and it stands in if the picture fails
  const cabinet = rect(80, 60, 640, 1100, { r: 60, cls: 'cz-cabinet' });
  return svg(W, H, `${cabinet}${glass}${reels}${shade}${meters}${svgArt(ART.slotCabinet, 0, 0, W, H)}${payline}${buttons}`,
  { label: 'Brass Crown slot machine: pay table, three reels with one pay line, win, coin and credit meters', cls: 'cz-machine cz-cab' });
}

export default stubGame({
  id: 'slots', name: 'Slots', layout,
  todo: [
    'Brass Crown reel strips, crypto spin and pay table; an exact return-to-player test (DOM-free engine)',
    'Bet one to three coins at the machine\'s denomination: Bet One, Bet Max, Spin',
    'Reels stop left to right with three rows showing through each window',
    'Credits from and to the bank, cashed out on leaving; record each spin; broke check',
  ],
  options: ['Fast reels', 'Autoplay 10, 25 or 50 spins'],
  howto: howtoSections([
    ['Play', 'Bet one to three coins and spin. Symbols lined up on the pay line pay the amounts on the machine, times your coins.'],
    ['Crowns', 'The crown is wild for ingots, bells, horseshoes and clovers (not cherries). One crown in a win doubles it, two crowns pay four times. Three crowns is the top award, boosted on three coins.'],
  ]),
});
