// Casino chips: the rack's buttons and chips drawn on a layout, from
// assets/art/tokens/chip-<value>.webp (a value without art would draw a plain disc).
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

/**
 * Make a layout's betting spots take chips: every element under `root` with the attribute `attr`
 * (its value is the spot's key) adds a chip on click, Enter or Space, and takes one off on
 * right-click, shift-click, shift-Enter or a long press (half a second) on a touch screen.
 * onPlace(key, +1 | -1). Returns a function that stops listening.
 */
export function bindSpots(root, attr, onPlace) {
  const sel = `[${attr}]`;
  const keyOf = (el) => el.getAttribute(attr);
  let pressTimer = 0, longPressed = null, sx = 0, sy = 0;
  const click = (e) => {
    const g = e.target.closest(sel);
    if (!g || !root.contains(g)) return;
    if (longPressed === g) { longPressed = null; return; } // the long press already took a chip off
    onPlace(keyOf(g), e.shiftKey ? -1 : 1);
  };
  const context = (e) => { const g = e.target.closest(sel); if (g && root.contains(g)) { e.preventDefault(); onPlace(keyOf(g), -1); } };
  const key = (e) => {
    const g = e.target.closest(sel);
    if (g && root.contains(g) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPlace(keyOf(g), e.shiftKey ? -1 : 1); }
  };
  const down = (e) => {
    if (e.pointerType !== 'touch') return;
    const g = e.target.closest(sel);
    if (!g || !root.contains(g)) return;
    clearTimeout(pressTimer);
    sx = e.clientX; sy = e.clientY;
    pressTimer = setTimeout(() => { longPressed = g; onPlace(keyOf(g), -1); navigator.vibrate?.(15); }, 500);
  };
  const up = (e) => { if (e.type !== 'pointermove' || Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(pressTimer); };
  root.addEventListener('click', click);
  root.addEventListener('contextmenu', context);
  root.addEventListener('keydown', key);
  root.addEventListener('pointerdown', down);
  for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove']) root.addEventListener(t, up);
  return () => {
    clearTimeout(pressTimer);
    root.removeEventListener('click', click);
    root.removeEventListener('contextmenu', context);
    root.removeEventListener('keydown', key);
    root.removeEventListener('pointerdown', down);
    for (const t of ['pointerup', 'pointercancel', 'pointerleave', 'pointermove']) root.removeEventListener(t, up);
  };
}
