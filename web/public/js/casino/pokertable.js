// The shared half-moon layout of the poker-style table games (Three Card Poker, Let It Ride,
// Caribbean Stud, Pai Gow Poker): dealer's cards along the straight edge, a pay table in the
// middle, and at each of five seats a column of betting spots running toward the player.
import { svg, path, text, arcText, cardSlot, rect, polar, seatAngles, tableRail, circle } from './svg.js';

/**
 * spots: [{ r, label, shape: 'circle' | 'box' | 'diamond', key }] at radius r from the dealer's edge.
 * extras(cx, cy, a, i): more SVG for seat i at angle a (card boxes and so on).
 */
export function pokerTable({ label, dealerCards = 3, dealerNote = '', spots, payLines = [], arcLine = '', extras = () => '' }) {
  const W = 1000, H = 560;
  const { cx, cy, r, d } = tableRail(W, H, 30);
  const dealer = Array.from({ length: dealerCards }, (_, i) => cardSlot(500 + (i - (dealerCards - 1) / 2) * 54, 90, 44)).join('');
  const shape = (x, y, s, a) => {
    if (s.shape === 'box') return rect(x - 30, y - 22, 60, 44, { r: 6 }) + text(x, y, s.label, { size: s.size ?? 14 });
    if (s.shape === 'diamond') return path(`M${x} ${y - 30} L${x + 30} ${y} L${x} ${y + 30} L${x - 30} ${y} Z`) + text(x, y, s.label, { size: s.size ?? 11 });
    return circle(x, y, s.radius ?? 27) + text(x, y, s.label, { size: s.size ?? 16, weight: 700 });
  };
  const seats = seatAngles(5, 152, 28).map((a, i) => spots.map((s) => {
    const [x, y] = polar(cx, cy, s.r, a);
    return `<g data-spot="${s.key}:${i}">${shape(x, y, s, a)}</g>`;
  }).join('') + extras(cx, cy, a, i)).join('');
  const pays = payLines.map((t, i) => text(500, 168 + i * 21, t, { size: i === 0 ? 15 : 14, weight: i === 0 ? 700 : 500, cls: i === 0 ? 'cz-tx' : 'cz-tx dim' })).join('');
  return svg(W, H, `${path(d, { cls: 'cz-rail' })}${dealer}
    ${dealerNote ? text(500, 140, dealerNote, { size: 15, cls: 'cz-tx dim' }) : ''}
    ${pays}${arcLine ? arcText(cx, cy, 300, 160, 20, arcLine, { size: 18 }) : ''}${seats}`, { label });
}
