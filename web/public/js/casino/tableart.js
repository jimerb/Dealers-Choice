// The dressing every code-drawn table shares: the padded leather rail round its edge, the brass
// crest with the game's name, and the dealer's shoe and discard tray. Each piece is a picture over a
// code-drawn stand-in (see art.js), so tables look right with or without the art.
import { ART, svgArt, tilePattern } from './art.js';
import { rect, text, circle, die } from './svg.js';

/** Room above a half-moon table's straight (dealer's) edge for the crest. */
export const CREST_TOP = 170;
const CREST_RATIO = 900 / 413; // the built crest picture

/**
 * The padded rail: a leather band just outside the table's edge. `band` is the path the rail follows
 * (the curved edge of a half-moon table, or the whole outline), `inside` the closed table shape; the
 * band is masked to the outside of it so it never covers the layout.
 */
export function railBand(band, inside, w, h, width = 26) {
  const m = 80;
  const box = `x="${-m}" y="${-m - CREST_TOP}" width="${w + 2 * m}" height="${h + 2 * m + CREST_TOP}"`;
  const s = (cls, sw) => `<path d="${band}" class="${cls}" stroke-width="${sw}" mask="url(#cz-rail-out)"/>`;
  return `<defs>${tilePattern('cz-leather', ART.rail, 300)}
    <mask id="cz-rail-out" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/><path d="${inside}" fill="#000"/></mask></defs>
    ${s('cz-rail-edge', width * 2 + 4)}${s('cz-rail-base', width * 2)}${s('cz-rail-leather', width * 2)}${s('cz-rail-shine', width)}`;
}

/** The crest centred at cx with its top at y, `w` wide, with the game's name in its ribbon. */
export function crest(cx, y, w, name) {
  const h = w / CREST_RATIO;
  const ty = y + h * 0.655;
  const fallback = rect(cx - w * 0.36, ty - h * 0.1, w * 0.72, h * 0.2, { cls: 'cz-crest-fb', r: h * 0.1 });
  return `<g class="cz-crest">${svgArt(ART.crest, cx - w / 2, y, w, h, fallback)}
    ${text(cx, ty, name.toUpperCase(), { size: Math.round(h * 0.115), weight: 800, cls: 'cz-crest-tx', attrs: 'letter-spacing="2"' })}</g>`;
}

/** The crest for a half-moon table whose straight edge is at y = 30, sitting above that edge. */
export const tableCrest = (name, w = 340) => crest(500, 22 - w / CREST_RATIO, w, name);

/** The dealer's shoe, centred at (cx, cy), its mouth turned toward the dealer's spot (left). */
export function shoe(cx = 875, cy = 80) {
  const fallback = rect(cx - 55, cy - 35, 110, 70, { r: 8 }) + text(cx, cy, 'Shoe', { size: 18 });
  return svgArt(ART.shoe, cx - 38, cy - 72, 76, 144, fallback, { attrs: `transform="rotate(90 ${cx} ${cy})"` });
}

/** The discard tray, centred at (cx, cy), open toward the dealer (right). */
export function discardTray(cx = 115, cy = 80) {
  const fallback = rect(cx - 45, cy - 35, 90, 70, { r: 8 }) + text(cx, cy, 'Discards', { size: 16 });
  return svgArt(ART.tray, cx - 30, cy - 44, 60, 88, fallback, { attrs: `transform="rotate(-90 ${cx} ${cy})"` });
}

/** A die face showing v pips, top-left at (x, y), s wide (the picture's die fills 78% of its canvas). */
export function dieFace(x, y, s, v, { rotate = 0 } = {}) {
  const S = s / 0.78125, o = (S - s) / 2;
  const t = rotate ? `transform="rotate(${rotate} ${x + s / 2} ${y + s / 2})"` : '';
  return `<g ${t}>${svgArt(ART.die(v), x - o, y - o, S, S, die(x, y, s, v))}</g>`;
}

/** A die caught mid-roll (frame 1 or 2), centred at (cx, cy), about s wide. */
export function tumblingDie(cx, cy, s, frame, v) {
  const S = s * 1.4;
  return svgArt(ART.tumble(frame), cx - S / 2, cy - S / 2, S, S, die(cx - s / 2, cy - s / 2, s, v));
}

/** The craps puck, centred at (cx, cy) with radius r: ON (cream) or OFF (black), lettered by code. */
export function puck(cx, cy, r, on) {
  const R = r / 0.85;
  const fallback = circle(cx, cy, r, { cls: on ? 'cz-puck on' : 'cz-puck' });
  return `<g class="cz-puck-g${on ? ' on' : ''}">${svgArt(ART.puck(on), cx - R, cy - R, 2 * R, 2 * R, fallback)}
    ${text(cx, cy, on ? 'ON' : 'OFF', { size: Math.round(r * 0.62), weight: 800, cls: on ? 'cz-puck-tx on' : 'cz-puck-tx' })}</g>`;
}
