// Casino chips: the rack's buttons and chips drawn on a layout. Chips with art use
// assets/art/tokens/chip-<value>.webp; $5,000 and $25,000 have no art yet and draw a plain
// placeholder disc (TODO art: chip-5000.webp, chip-25000.webp, then add them to CHIP_ART).
import { CHIPS, CHIP_ART } from './catalog.js';

const ART = 'assets/art/tokens';
export const chipSrc = (v) => (CHIP_ART.has(v) ? `${ART}/chip-${v}.webp` : '');
export const chipLabel = (v) => (v >= 1000 ? `${v / 1000}K` : String(v));

/** One rack button. */
export function chipButtonHTML(v, { selected = false, disabled = false } = {}) {
  const src = chipSrc(v);
  return `<button type="button" class="cz-chip${src ? '' : ` ph ph-${v}`}" role="radio" aria-checked="${selected}" data-chip="${v}" ${disabled ? 'disabled' : ''}
    aria-label="$${v.toLocaleString('en-US')} chip" data-nosfx>${src ? `<img src="${src}" alt="" draggable="false">` : ''}<b>${chipLabel(v)}</b></button>`;
}

/** The largest chip that fits in an amount (what a stack on the layout shows on top). */
export const topChip = (amount) => [...CHIPS].reverse().find((c) => c <= amount) ?? CHIPS[0];

/** A stack on a layout: the top chip's art, with the stack's total written on it. */
export function chipSVG(cx, cy, r, amount) {
  const v = topChip(amount);
  const src = chipSrc(v);
  const face = src
    ? `<image href="${src}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" class="cz-chip-ph ph-${v}"/>`;
  const label = amount >= 1000 ? `${Math.floor(amount / 100) / 10}K`.replace('.0K', 'K') : String(amount);
  return `<g class="cz-stack" pointer-events="none"><circle cx="${cx}" cy="${cy + 2}" r="${r}" class="cz-chip-shadow"/>${face}
    <text x="${cx}" y="${cy}" font-size="${Math.round(r * (label.length > 3 ? 0.62 : 0.78))}" font-weight="800" text-anchor="middle" dominant-baseline="central" class="cz-chip-tx">${label}</text></g>`;
}
