// Tiny SVG string helpers for the casino layouts. Layouts are drawn by code over the felt, with
// every number and label as live text; colours come from classes in css/casino.css, so the lines
// and lettering follow the table (dark ink on a light table, cream on felt).

export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const n = (v) => Math.round(v * 10) / 10;

/** The outer <svg>. `label` describes the whole layout for screen readers. */
export const svg = (w, h, body, { label = '', cls = '' } = {}) =>
  `<svg class="cz-svg ${cls}" viewBox="0 0 ${w} ${h}" role="img"${label ? ` aria-label="${esc(label)}"` : ''} xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const rect = (x, y, w, h, { cls = 'cz-ln', r = 0, attrs = '' } = {}) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"${r ? ` rx="${r}"` : ''} class="${cls}" ${attrs}/>`;

export const circle = (cx, cy, r, { cls = 'cz-ln', attrs = '' } = {}) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" class="${cls}" ${attrs}/>`;

export const path = (d, { cls = 'cz-ln', attrs = '' } = {}) => `<path d="${d}" class="${cls}" ${attrs}/>`;

export const text = (x, y, s, { size = 18, cls = 'cz-tx', anchor = 'middle', weight = 600, rotate = 0, attrs = '' } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="central" class="${cls}"${rotate ? ` transform="rotate(${rotate} ${n(x)} ${n(y)})"` : ''} ${attrs}>${esc(s)}</text>`;

/** Point on a circle; angles in degrees, 0 = right, 90 = down (SVG's y runs down). */
export const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

/** Arc from angle a0 to a1 (degrees). Going from a larger to a smaller angle runs counter-clockwise,
 *  which is how text reads left to right along the bottom of a circle. */
export function arc(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${n(x0)} ${n(y0)} A${r} ${r} 0 ${large} ${sweep} ${n(x1)} ${n(y1)}`;
}

/** A band between two radii from a0 to a1 (a betting arc). */
export function band(cx, cy, r0, r1, a0, a1, opts) {
  const [ax, ay] = polar(cx, cy, r1, a0);
  const [bx, by] = polar(cx, cy, r0, a1);
  return path(`${arc(cx, cy, r1, a0, a1)} L${n(bx)} ${n(by)} ${arc(cx, cy, r0, a1, a0).replace(/^M[^A]+/, '')} L${n(ax)} ${n(ay)} Z`, opts);
}

let arcIds = 0;
/** Text set along an arc (left to right along the bottom of the circle when a0 > a1). */
export function arcText(cx, cy, r, a0, a1, s, { size = 18, cls = 'cz-tx', weight = 700 } = {}) {
  const id = `cz-arc-${++arcIds}`;
  return `<path id="${id}" d="${arc(cx, cy, r, a0, a1)}" fill="none" stroke="none"/>
    <text font-size="${size}" font-weight="${weight}" class="${cls}" letter-spacing="2"><textPath href="#${id}" startOffset="50%" text-anchor="middle">${esc(s)}</textPath></text>`;
}

/** An empty card outline (5:7), centred on (cx, cy). */
export const cardSlot = (cx, cy, w = 46, opts = {}) => rect(cx - w / 2, cy - (w * 1.4) / 2, w, w * 1.4, { cls: 'cz-slot', r: 4, ...opts });

/** A betting circle with a label inside. */
export const spot = (cx, cy, r, label, { size = Math.round(r * 0.45), key = '' } = {}) =>
  `<g class="cz-spot"${key ? ` data-spot="${esc(key)}"` : ''}>${circle(cx, cy, r)}${label ? text(cx, cy, label, { size }) : ''}</g>`;

/** One die face showing `v` pips, top-left at (x, y). */
export function die(x, y, s, v) {
  const P = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  const step = s / 4;
  return rect(x, y, s, s, { cls: 'cz-die', r: s * 0.18 }) + P[v].map(([i, j]) => circle(x + step * (i + 1), y + step * (j + 1), s * 0.09, { cls: 'cz-pip' })).join('');
}

/** The usual top-down card table: a straight edge at the top (dealer), a curved rail toward the
 *  players. Returns the rail path for a w x h box; the arc's centre is (w/2, top). */
export const tableRail = (w, h, top = 30) => {
  const r = Math.min(w / 2 - 10, h - top - 10);
  return { cx: w / 2, cy: top, r, d: `M${w / 2 - r} ${top} H${w / 2 + r} ${arc(w / 2, top, r, 0, 180).replace(/^M[^A]+/, '')} Z` };
};

/** Positions of `count` seats along an arc of radius r (left to right as the player sees them). */
export const seatAngles = (count, from = 150, to = 30) =>
  Array.from({ length: count }, (_, i) => from + ((to - from) * i) / (count - 1));
