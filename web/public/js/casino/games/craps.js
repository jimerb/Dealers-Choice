// Craps (stub): one end of the table from the shooter's side: propositions on the left, then
// place numbers, Come, Field, Don't Pass and the Pass Line wrapping round the curved end.
// TODO wiring (also listed on the table):
//   - engine js/casino/engines/craps.js: come-out / point state, the puck, every bet's win/lose/push
//   - bets from the chip rack on every box (data-spot keys below); odds behind pass and come
//   - Roll: two dice with crypto randomness and a roll animation (dice art optional)
//   - field pays double on 2 and 12; place 4/10 9:5, 5/9 7:5, 6/8 7:6; propositions as marked
//   - settle through ctx.bank, recordHand per roll that resolves a bet, ctx.checkBroke()
import { svg, path, rect, text, die, circle } from '../svg.js';
import { stubGame, howtoSections } from '../stub.js';

function props() {
  // the proposition box: x 30-270
  const x = 30, w = 240;
  const box = (y, h, label, pays, key, dice = []) => {
    const d = dice.map((v, i) => die(x + 14 + i * 34, y + h / 2 - 14, 28, v)).join('');
    return `<g data-spot="${key}">${rect(x, y, w, h, { cls: 'cz-area' })}${d}${text(x + (dice.length ? 160 : w / 2), y + h / 2 - (pays ? 9 : 0), label, { size: 17 })}${pays ? text(x + (dice.length ? 160 : w / 2), y + h / 2 + 12, pays, { size: 14, cls: 'cz-tx dim' }) : ''}</g>`;
  };
  const half = (y, cx, label, pays, key, dice) => {
    const d = dice.map((v, i) => die(cx - 30 + i * 32, y + 8, 26, v)).join('');
    return `<g data-spot="${key}">${rect(cx - 60, y, 120, 70, { cls: 'cz-area' })}${d}${text(cx, y + 50, `${label} ${pays}`, { size: 14 })}</g>`;
  };
  return `${box(40, 52, 'Seven', '4 for 1', 'any7')}
    ${half(96, x + 60, 'Hard 6', '9:1', 'hard6', [3, 3])}${half(96, x + 180, 'Hard 10', '7:1', 'hard10', [5, 5])}
    ${half(170, x + 60, 'Hard 8', '9:1', 'hard8', [4, 4])}${half(170, x + 180, 'Hard 4', '7:1', 'hard4', [2, 2])}
    ${half(244, x + 60, 'Two', '30:1', 'two', [1, 1])}${half(244, x + 180, 'Twelve', '30:1', 'twelve', [6, 6])}
    ${half(318, x + 60, 'Three', '15:1', 'three', [1, 2])}${half(318, x + 180, 'Eleven', '15:1', 'yo', [5, 6])}
    ${box(392, 52, 'Any craps', '7 for 1', 'anycraps')}
    ${text(x + w / 2, 470, 'Propositions', { size: 15, cls: 'cz-tx dim' })}`;
}

export function layout() {
  const W = 1000, H = 560;
  const L = 290; // left edge of the main layout
  const placeW = 82;
  const place = [4, 5, 'SIX', 8, 'NINE', 10].map((v, i) => `<g data-spot="place:${i}">${rect(L + 100 + i * placeW, 40, placeW, 100, { cls: 'cz-area' })}${text(L + 100 + i * placeW + placeW / 2, 90, String(v), { size: typeof v === 'string' ? 22 : 34, weight: 700 })}</g>`).join('');
  const field = `<g data-spot="field">${rect(L + 100, 260, 492, 92, { cls: 'cz-area' })}
    ${text(L + 140, 306, 'FIELD', { size: 22, weight: 700, rotate: -90 })}
    ${[2, 3, 4, 9, 10, 11, 12].map((v, i) => { const x = L + 200 + i * 62; const dbl = v === 2 || v === 12; return (dbl ? circle(x, 296, 20) : '') + text(x, 296, String(v), { size: 24 }); }).join('')}
    ${text(L + 386, 334, '2 and 12 pay double', { size: 14, cls: 'cz-tx dim' })}</g>`;
  return svg(W, H, `${path('M20 20 H800 Q980 20 980 280 Q980 540 800 540 H20 Z', { cls: 'cz-rail' })}
    ${props()}
    <g data-spot="dontcome">${rect(L, 40, 100, 100, { cls: 'cz-area' })}${text(L + 50, 76, "DON'T", { size: 15 })}${text(L + 50, 96, 'COME', { size: 15 })}${text(L + 50, 116, 'BAR ⚅⚅', { size: 13 })}</g>
    ${place}
    <g data-spot="come">${rect(L, 150, 592, 100, { cls: 'cz-area' })}${text(L + 296, 200, 'COME', { size: 46, weight: 700 })}</g>
    ${field}
    <g data-spot="big68">${rect(L, 260, 100, 160, { cls: 'cz-area' })}${text(L + 50, 320, 'BIG', { size: 18 })}${text(L + 50, 350, '6 · 8', { size: 26, weight: 700 })}</g>
    <g data-spot="dontpass">${rect(L + 100, 362, 492, 58, { cls: 'cz-area' })}${text(L + 346, 391, "DON'T PASS BAR ⚅⚅", { size: 20 })}</g>
    <g data-spot="pass">${path(`M${L} 430 H${L + 602} V150 H${L + 652} V420 Q${L + 652} 500 ${L + 572} 500 H${L} Z`, { cls: 'cz-area' })}
      ${text(L + 300, 465, 'PASS LINE', { size: 34, weight: 700 })}${text(L + 627, 290, 'PASS LINE', { size: 24, weight: 700, rotate: 90 })}</g>
    ${circle(L + 50, 175, 18, { cls: 'cz-puck' })}${text(L + 50, 175, 'OFF', { size: 11, cls: 'cz-puck-tx', weight: 800 })}`,
  { label: 'Craps layout: propositions on the left; place numbers, Come, Field, Don\'t Pass and Pass Line' });
}

export default stubGame({
  id: 'craps', name: 'Craps', layout,
  todo: [
    'Come-out and point rounds with the On/Off puck (DOM-free engine + tests)',
    'Bets on every box from the chip rack; odds behind Pass and Come',
    'Roll two dice with a short animation',
    'Field pays double on 2 and 12; place 4 and 10 pay 9 to 5, 5 and 9 pay 7 to 5, 6 and 8 pay 7 to 6',
    'Propositions as marked on the layout (one-roll and hardway bets)',
    'Settle through the bank; record each roll that settles a bet; broke check',
  ],
  options: ['Field pays triple on 12', 'Maximum odds (3-4-5x)'],
  howto: howtoSections([
    ['The come-out roll', 'On the Pass Line, 7 or 11 wins and 2, 3 or 12 loses. Any other number becomes the point.'],
    ['The point', 'Roll the point again before a 7 and the Pass Line wins; a 7 first loses. Don\'t Pass is the opposite (12 on the come-out is a push).'],
    ['Other bets', 'Come works like a new Pass Line bet. The Field wins on the next roll if it shows 2, 3, 4, 9, 10, 11 or 12. Place bets win when their number rolls before a 7.'],
  ]),
});
