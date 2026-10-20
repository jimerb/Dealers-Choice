// Table pieces drawn from the token art: chip stacks, the cribbage board and its pegs, the card tray
// and the trump plaque. Small pure helpers (numbers and HTML strings) for the games' view models.

const ART = 'assets/art';
const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

// ---------------------------------------------------------------- chips
export const CHIP_VALUES = [1000, 500, 100, 25, 5, 1];

/** Greedy breakdown of an amount into chips, largest first: [{ value, count }]. */
export function chipBreakdown(amount) {
  let left = Math.max(0, Math.floor(Number(amount) || 0));
  const out = [];
  for (const value of CHIP_VALUES) {
    const count = Math.floor(left / value);
    if (count) { out.push({ value, count }); left -= count * value; }
  }
  return out;
}

/** The stacks to draw: the largest few denominations, each showing at most a few chips. */
export function chipStacks(amount, { stacks = 3, perStack = 5 } = {}) {
  return chipBreakdown(amount).slice(0, stacks).map(({ value, count }) => ({ value, count, shown: Math.min(count, perStack) }));
}

const chipLabel = (v) => (v >= 1000 ? `${v / 1000}K` : String(v));

/** Small chip stacks for an amount. Decorative: the amount must also appear as text nearby
 *  (pass `text` to print it under the stacks). `labels` writes each stack's value on its top chip. */
export function chipsHTML(amount, { size = 22, stacks = 3, perStack = 5, labels = size >= 24, text = '' } = {}) {
  const cols = chipStacks(amount, { stacks, perStack }).map(({ value, shown }) =>
    `<span class="chip-col" style="--n:${shown}">${Array.from({ length: shown }, (_, i) =>
      `<img src="${ART}/tokens/chip-${value}.webp" alt="" style="--i:${i}">`).join('')}${labels ? `<b>${chipLabel(value)}</b>` : ''}</span>`).join('');
  return `<span class="chips" style="--chip:${size}px"><span class="chip-cols" aria-hidden="true">${cols}</span>${text ? `<span class="chips-text">${text}</span>` : ''}</span>`;
}

// ---------------------------------------------------------------- cribbage board
// Coordinates are in the board image's own pixels (1475 x 431). Each player has a U-shaped track:
// out along the outer row (holes 1-60, left to right) and back along the inner row (61-120, right
// to left), in groups of five. Two start holes sit before hole 1; the game hole (121) after hole 120.
export const BOARD = { w: 1475, h: 431 };
const X0 = 200, PITCH = 17, GAP = 16;
const ROWS = [{ out: 313, back: 255 }, { out: 118, back: 176 }]; // track 0: you (near side), 1: opponent
const START = [160, 128];
const FINISH_X = 160;

/** x of the i-th hole along a row (0-59), leaving a gap after every fifth hole. */
export const holeX = (i) => X0 + i * PITCH + Math.floor(i / 5) * GAP;

/** Where a peg for `score` sits on `track`. `spare` picks the second start hole for score 0. */
export function pegHole(score, track, spare = false) {
  const r = ROWS[track];
  if (score <= 0) return { x: START[spare ? 1 : 0], y: r.out };
  if (score >= 121) return { x: FINISH_X, y: r.back };
  if (score <= 60) return { x: holeX(score - 1), y: r.out };
  return { x: holeX(120 - score), y: r.back };
}

/** Front peg at the current score, back peg at the previous one (both start in the start holes). */
export function pegPositions(score, prev, track) {
  return { front: pegHole(score, track), back: pegHole(prev, track, prev <= 0 && score <= 0) };
}

/** Every hole on one track, for drawing: [{x, y, r}]. */
export function trackHoles(track) {
  const holes = [];
  for (let s = 1; s <= 120; s++) holes.push({ ...pegHole(s, track), r: 6 });
  holes.push({ ...pegHole(0, track), r: 6 }, { ...pegHole(0, track, true), r: 6 }, { ...pegHole(121, track), r: 9 });
  return holes;
}

/** The board with both tracks and pegs. players: [{ name, score, prev, peg }] (index = track). */
export function cribbageBoardHTML(players) {
  const P = 28; // peg head size
  const holes = players.map((_, t) => trackHoles(t).map((h) =>
    `<circle cx="${h.x}" cy="${h.y}" r="${h.r}"/>`).join('')).join('');
  const pegs = players.map((p, t) => {
    const { front, back } = pegPositions(p.score, p.prev ?? 0, t);
    const img = (at) => `<image href="${ART}/tokens/peg-${p.peg}.webp" x="${at.x - P / 2}" y="${at.y - P / 2}" width="${P}" height="${P}"/>`;
    return img(back) + img(front);
  }).join('');
  const label = players.map((p) => `${p.name} ${p.score}`).join(', ');
  return `<figure class="crib-board" role="img" aria-label="Cribbage board: ${label} of 121">
    <svg viewBox="0 0 ${BOARD.w} ${BOARD.h}" aria-hidden="true" focusable="false">
      <image href="${ART}/tokens/cribbage-board.webp" width="${BOARD.w}" height="${BOARD.h}"/>
      <line class="divider" x1="${START[1] - 20}" x2="${holeX(59) + 20}" y1="215.5" y2="215.5"/>
      <g class="holes">${holes}</g>${pegs}
    </svg>
    <figcaption>${players.map((p) => `<span class="peg-key"><img src="${ART}/tokens/peg-${p.peg}.webp" alt="">${p.name} <b>${p.score}</b></span>`).join('')}</figcaption>
  </figure>`;
}

// ---------------------------------------------------------------- tray
/** The walnut tray holding up to four cards (pass `inner` as card HTML), with a text label under it.
 *  `width` is in px, or any CSS length (e.g. one that scales with the table). */
export const trayHTML = (inner, { label = '', width = 220 } = {}) =>
  `<figure class="tray-wrap"><div class="tray" style="--tray-w:${typeof width === 'number' ? `${width}px` : width}">${inner}</div>${label ? `<figcaption>${label}</figcaption>` : ''}</figure>`;

// ---------------------------------------------------------------- trump plaque
/** The brass trump plaque: suit art centred on it (or short text such as "NT"), caption below. */
export function trumpPlaqueHTML(suit, { caption } = {}) {
  const name = SUIT_NAME[suit];
  const face = name ? `<img src="${ART}/pips/pip-${suit}.webp" alt="">` : `<span>${suit}</span>`;
  return `<figure class="trump-plaque"><div class="plaque" aria-hidden="true">${face}</div><figcaption>${caption ?? `Trump: ${name ?? suit}`}</figcaption></figure>`;
}
