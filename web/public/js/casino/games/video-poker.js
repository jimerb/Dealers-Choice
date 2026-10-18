// Video Poker (stub): a Jacks or Better machine: pay table, five card windows with Hold buttons,
// credit meters.
// TODO wiring (also listed on the machine):
//   - engine js/casino/engines/video-poker.js: 5-card ranks, Jacks or Better pay table (9/6), tests
//   - bet 1-5 credits at the machine's denomination (ctx.stakes.denom); Bet One / Bet Max
//   - Deal; tap cards (or the Hold buttons) to hold; Draw; pay from the table
//   - card faces from the site's skin (cardHTML); royal flush on 5 credits pays 4000
//   - credits come from and return to the bank (ctx.bank); recordHand; ctx.checkBroke()
import { svg, rect, text, cardSlot } from '../svg.js';
import { ART, svgArt } from '../art.js';
import { stubGame, howtoSections } from '../stub.js';

const PAYS = [
  ['Royal flush', [250, 500, 750, 1000, 4000]], ['Straight flush', [50, 100, 150, 200, 250]],
  ['Four of a kind', [25, 50, 75, 100, 125]], ['Full house', [9, 18, 27, 36, 45]], ['Flush', [6, 12, 18, 24, 30]],
  ['Straight', [4, 8, 12, 16, 20]], ['Three of a kind', [3, 6, 9, 12, 15]], ['Two pair', [2, 4, 6, 8, 10]],
  ['Jacks or better', [1, 2, 3, 4, 5]],
];

// The cabinet picture is 800 x 1200; its windows (where the code draws) in those units:
const TOPPER = { x: 117, y: 78, w: 566, h: 172 };  // the machine's name
const SCREEN = { x: 102, y: 297, w: 596, h: 492 }; // pay table, cards, meters
const DECK = { y: 828, h: 125 };                   // the plain button deck

export function layout() {
  const W = 800, H = 1200;
  const S = SCREEN;
  const rows = PAYS.map(([name, p], i) => {
    const y = S.y + 26 + i * 23;
    return text(S.x + 22, y, name, { size: 17, anchor: 'start', cls: 'cz-mtx' }) + p.map((v, c) => text(S.x + 270 + c * 72, y, String(v), { size: 17, cls: c === 0 ? 'cz-mtx hot' : 'cz-mtx' })).join('');
  }).join('');
  const cards = [0, 1, 2, 3, 4].map((i) => {
    const x = S.x + 70 + i * 114;
    return `${cardSlot(x, S.y + 318, 96, { cls: 'cz-mslot' })}${text(x, S.y + 404, 'HELD', { size: 15, weight: 800, cls: 'cz-mtx dim' })}`;
  }).join('');
  const meter = (i, label) => {
    const w = (S.w - 40) / 3, x = S.x + 20 + i * w;
    return `${rect(x + 4, S.y + 424, w - 8, 56, { r: 6, cls: 'cz-mscreen' })}${text(x + w / 2, S.y + 440, label, { size: 13, cls: 'cz-mtx dim' })}${text(x + w / 2, S.y + 462, '0', { size: 20, weight: 700, cls: 'cz-mtx' })}`;
  };
  const buttons = [['HOLD', 170], ['BET ONE', 320], ['BET MAX', 470], ['DEAL', 620]].map(([label, x]) =>
    `${rect(x - 64, DECK.y + 38, 128, 50, { r: 25, cls: label === 'DEAL' ? 'cz-mbtn hot' : 'cz-mbtn' })}${text(x, DECK.y + 63, label, { size: 17, weight: 800, cls: 'cz-mbtn-tx' })}`).join('');
  // a code-drawn cabinet underneath: the picture covers it, and it stands in if the picture fails
  const cabinet = rect(80, 60, 640, 1100, { r: 60, cls: 'cz-cabinet' });
  return svg(W, H, `${cabinet}${rect(TOPPER.x, TOPPER.y, TOPPER.w, TOPPER.h, { cls: 'cz-mscreen' })}
    ${text(W / 2, TOPPER.y + 72, 'JACKS OR BETTER', { size: 44, weight: 800, cls: 'cz-mtx' })}${text(W / 2, TOPPER.y + 124, 'Video Poker · 9/6 full pay', { size: 20, cls: 'cz-mtx dim' })}
    ${rect(S.x, S.y, S.w, S.h, { cls: 'cz-mscreen blue' })}${rows}${cards}${meter(0, 'WIN')}${meter(1, 'BET')}${meter(2, 'CREDITS')}
    ${svgArt(ART.vpCabinet, 0, 0, W, H)}${buttons}`,
  { label: 'Video poker machine: pay table, five cards, win, bet and credit meters, and its buttons', cls: 'cz-machine cz-cab' });
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
