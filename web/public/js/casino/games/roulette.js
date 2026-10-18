// Roulette: playable. Double-zero wheel and layout drawn by code; place chips on any number, the
// dozens, the columns or the even-money boxes; Spin; winnings go to the bank.
// Rules live in ../engines/roulette.js (no DOM). Left to do: split / street / corner / line bets on
// the lines between numbers, a ball animation, La Partage-style options, wheel and ball art.
import { WHEEL, colorOf, playSpin, betName, total, isBetKey } from '../engines/roulette.js';
import { svg, rect, text, path, esc, polar } from '../svg.js';
import { chipSVG } from '../chips.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';

// ------------------------------------------------------------------ layout geometry
// The table is laid out in (u, v) units: u runs along the layout (0 and 00, twelve columns of
// numbers, then the 2-to-1 boxes), v across it (three rows of numbers, the dozens, the even-money
// boxes). Wide screens draw u left to right; phones turn it to run top to bottom, outside bets on
// the left, so the numbers stay big enough to tap. Text never rotates.
const U = 14, V = 4.6;
const EVEN = [['low', '1–18'], ['even', 'EVEN'], ['red', ''], ['black', ''], ['odd', 'ODD'], ['high', '19–36']];

export function areas() {
  const out = [
    { key: 'n:00', u: 0, v: 0, du: 1, dv: 1.5, label: '00', fill: 'green' },
    { key: 'n:0', u: 0, v: 1.5, du: 1, dv: 1.5, label: '0', fill: 'green' },
  ];
  for (let n = 1; n <= 36; n++) {
    const row = n % 3 === 0 ? 0 : n % 3 === 2 ? 1 : 2;
    out.push({ key: `n:${n}`, u: 1 + Math.ceil(n / 3) - 1, v: row, du: 1, dv: 1, label: String(n), fill: colorOf(String(n)) });
  }
  [3, 2, 1].forEach((c, row) => out.push({ key: `col:${c}`, u: 13, v: row, du: 1, dv: 1, label: '2 to 1', small: true }));
  ['1st 12', '2nd 12', '3rd 12'].forEach((label, i) => out.push({ key: `dozen:${i + 1}`, u: 1 + i * 4, v: 3, du: 4, dv: 0.8, label }));
  EVEN.forEach(([key, label], i) => out.push({ key, u: 1 + i * 2, v: 3.8, du: 2, dv: 0.8, label, diamond: key === 'red' || key === 'black' ? key : '' }));
  return out;
}

const GEO = {
  wide: { sx: 68, sy: 68, w: U * 68, h: V * 68, place: (a, g) => ({ x: a.u * g.sx, y: a.v * g.sy, w: a.du * g.sx, h: a.dv * g.sy }) },
  tall: { sx: 72, sy: 48, w: V * 72, h: U * 48, place: (a, g) => ({ x: (V - a.v - a.dv) * g.sx, y: a.u * g.sy, w: a.dv * g.sx, h: a.du * g.sy }) },
};

/** The betting layout as SVG. bets: { key: dollars }; hit: the last winning pocket to ring. */
export function layout({ tall = false, bets = {}, hit = null } = {}) {
  const g = tall ? GEO.tall : GEO.wide;
  const P = 6; // margin so the outer lines aren't clipped
  const cells = areas().map((a) => {
    const { x, y, w, h } = g.place(a, g);
    const cx = x + w / 2 + P, cy = y + h / 2 + P;
    const amount = bets[a.key] ?? 0;
    const win = hit && a.key === `n:${hit}`;
    const fillCls = a.fill ? ` cz-num ${a.fill}` : '';
    let face;
    if (a.diamond) {
      const dx = Math.min(w, h) * 0.32, dy = Math.min(w, h) * 0.22;
      const [ax, ay] = tall ? [dy, dx] : [dx, dy];
      face = path(`M${cx} ${cy - ay} L${cx + ax} ${cy} L${cx} ${cy + ay} L${cx - ax} ${cy} Z`, { cls: `cz-diamond ${a.diamond}` });
    } else face = text(cx, cy, a.label, { size: a.small ? (tall ? 13 : 14) : a.fill ? 22 : 16, weight: 700, cls: a.fill ? 'cz-numtx' : 'cz-tx' });
    const label = `${betName(a.key)}${amount ? `, ${money(amount)} bet` : ''}`;
    return `<g class="cz-bet${win ? ' hit' : ''}" data-bet="${a.key}" role="button" tabindex="0" aria-label="${esc(label)}">
      ${rect(x + P, y + P, w, h, { cls: `cz-cell${fillCls}` })}${face}${amount ? chipSVG(cx, cy, Math.min(20, Math.min(w, h) * 0.42), amount) : ''}</g>`;
  }).join('');
  return svg(g.w + 2 * P, g.h + 2 * P, cells, { label: 'Roulette layout', cls: `cz-roulette ${tall ? 'tall' : 'wide'}` });
}

/** The wheel: 38 pockets in wheel order, 0 at the top before it turns. */
export function wheelSVG() {
  const C = 100, step = 360 / WHEEL.length;
  const pockets = WHEEL.map((p, i) => {
    const a0 = (i - 0.5) * step - 90, a1 = (i + 0.5) * step - 90;
    const [x0, y0] = polar(C, C, 96, a0), [x1, y1] = polar(C, C, 96, a1);
    const [x2, y2] = polar(C, C, 62, a1), [x3, y3] = polar(C, C, 62, a0);
    const f = (v) => v.toFixed(2);
    return `<path d="M${f(x0)} ${f(y0)} A96 96 0 0 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A62 62 0 0 0 ${f(x3)} ${f(y3)} Z" class="cz-pocket ${colorOf(p)}"/>
      <text x="${C}" y="${C - 85}" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="central" class="cz-wheel-tx" transform="rotate(${(i * step).toFixed(2)} ${C} ${C})">${p}</text>`;
  }).join('');
  return `<svg viewBox="0 0 200 200" aria-hidden="true" class="cz-wheel-svg"><circle cx="${C}" cy="${C}" r="99" class="cz-wheel-rim"/>${pockets}
    <circle cx="${C}" cy="${C}" r="60" class="cz-wheel-cone"/><circle cx="${C}" cy="${C}" r="16" class="cz-wheel-hub"/></svg>`;
}

// ------------------------------------------------------------------ the table
const TALL = '(max-width: 640px)';
let root = null, ctx = null, mq = null;
let bets = {}, last = null, spinning = false, timer = null, pending = null, release = null, hit = null, history = [], turn = 0;

const spinMs = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 300 : 2600);

function draw() {
  if (!root) return;
  const tall = mq?.matches ?? false;
  // Redrawing replaces the cells: keep keyboard focus on the same bet.
  const focused = root.ownerDocument.activeElement?.closest?.('[data-bet]')?.dataset.bet;
  root.querySelector('.cz-rl-grid').innerHTML = layout({ tall, bets, hit });
  if (focused) root.querySelector(`[data-bet="${focused}"]`)?.focus({ preventScroll: true });
  root.querySelector('.cz-rl-history').innerHTML = history.length
    ? `<span class="cz-rl-hlabel">Last spins</span>${history.map((p) => `<span class="cz-rl-ball ${colorOf(p)}">${p}</span>`).join('')}`
    : '<span class="cz-rl-hlabel">Place your chips, then spin</span>';
  sync();
}

function sync() {
  const t = total(bets);
  ctx.setTotal(t);
  ctx.setButtons({ action: t > 0 && !spinning, clear: t > 0 && !spinning, rebet: Boolean(last) && t === 0 && !spinning });
}

function place(key, sign = 1) {
  if (spinning || !isBetKey(key)) return;
  const chip = ctx.chip();
  const { max } = ctx.stakes;
  const now = bets[key] ?? 0;
  if (sign < 0) {
    if (!now) return;
    const left = Math.max(0, now - chip);
    if (left) bets[key] = left; else delete bets[key];
    ctx.play('chips');
    hit = null;
    return draw();
  }
  if (total(bets) + chip > ctx.bank.balance) { ctx.play('error'); return ctx.message(`Not enough in the bank for another ${money(chip)} chip.`); }
  if (max != null && now + chip > max) { ctx.play('error'); return ctx.message(`The most on one bet at this table is ${money(max)}.`); }
  bets[key] = now + chip;
  hit = null;
  ctx.play('chips');
  ctx.message(`${betName(key)}: ${money(bets[key])}. Total on the table ${money(total(bets))}.`);
  draw();
}

function action() {
  if (spinning) return;
  // Settled now (bank debited, hand recorded, winnings paid); the wheel only reveals the result.
  release = ctx.holdBank(); // the bank display keeps the pre-spin figure until the ball lands
  const r = playSpin(ctx.bank, bets, ctx.stakes);
  if (r.error) { release(); release = null; ctx.play('error'); return ctx.message(r.error); }
  spinning = true;
  pending = r;
  last = { ...bets };
  // turn the wheel so the winning pocket stops under the marker at the top
  const step = 360 / WHEEL.length;
  const target = -WHEEL.indexOf(r.pocket) * step;
  turn += 360 * 4 + ((((target - turn) % 360) + 360) % 360);
  const wheel = root.querySelector('.cz-wheel-spin');
  wheel.style.transitionDuration = `${spinMs()}ms`;
  wheel.style.transform = `rotate(${turn}deg)`;
  root.querySelector('.cz-rl-ball-dot').hidden = true;
  ctx.message('No more bets…');
  ctx.play('shuffle');
  sync();
  timer = setTimeout(reveal, spinMs());
}

/** The ball has landed: show what playSpin() already settled. */
function reveal() {
  clearTimeout(timer);
  const r = pending;
  pending = null;
  spinning = false;
  release?.(); release = null;
  if (!r || !root) return;
  bets = {};
  hit = r.pocket;
  history = [r.pocket, ...history].slice(0, 12);
  root.querySelector('.cz-rl-ball-dot').hidden = false;
  const name = `${r.pocket} ${colorOf(r.pocket)}`;
  if (r.net > 0) { ctx.play('win'); ctx.message(`${name}. You win ${money(r.net)} (${money(r.returned)} back from ${money(r.wagered)} bet).`); }
  else if (r.returned) { ctx.play('chips'); ctx.message(`${name}. ${money(r.returned)} back from ${money(r.wagered)} bet.`); }
  else { ctx.play('lose'); ctx.message(`${name}. The house takes ${money(r.wagered)}.`); }
  draw();
  ctx.checkBroke();
}

function onClick(e) {
  const g = e.target.closest('[data-bet]');
  if (g) place(g.dataset.bet, e.shiftKey ? -1 : 1);
}
function onContext(e) {
  const g = e.target.closest('[data-bet]');
  if (g) { e.preventDefault(); place(g.dataset.bet, -1); }
}
function onKey(e) {
  const g = e.target.closest('[data-bet]');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); place(g.dataset.bet, e.shiftKey ? -1 : 1); }
}
const onResize = () => draw();

export default {
  id: 'roulette',
  name: 'Roulette',
  ready: true,
  layout,
  todo: [
    'Split, street, corner, six-line and the five-number bets on the lines between numbers',
    'Ball animation and wheel/ball art (the wheel is drawn by code for now)',
    'Options: single-zero wheel; surrender on 0 and 00 for even-money bets',
  ],
  options: ['Single-zero wheel', 'Half back on even-money bets when 0 or 00 comes up'],
  howto: howtoSections([
    ['Placing bets', 'Choose a chip on the rack, then click or tap a number or box to put it there. Click again to add more. Right-click (or shift-click) takes a chip back off. Clear removes everything; Rebet repeats your last spin\'s bets.'],
    ['Payouts', '<ul><li>A single number (straight up) pays 35 to 1.</li><li>A dozen or a column pays 2 to 1.</li><li>Red, black, odd, even, 1–18 and 19–36 pay even money.</li><li>0 and 00 lose every bet except a straight-up bet on them.</li></ul>'],
    ['Table limits', 'Your bets together must reach the table minimum, and no single bet may go over the table maximum.'],
  ]),

  mount(el, c) {
    root = el; ctx = c;
    bets = {}; hit = null; spinning = false; pending = null;
    el.innerHTML = `<div class="cz-rl">
      <div class="cz-rl-wheel"><div class="cz-wheel-spin" style="transform:rotate(${turn}deg)">${wheelSVG()}</div>
        <span class="cz-wheel-marker" aria-hidden="true"></span><span class="cz-rl-ball-dot" aria-hidden="true"${history.length ? '' : ' hidden'}></span></div>
      <div class="cz-rl-main"><div class="cz-rl-history" aria-live="off"></div><div class="cz-rl-grid"></div></div></div>`;
    mq = matchMedia(TALL);
    mq.addEventListener('change', onResize);
    el.addEventListener('click', onClick);
    el.addEventListener('contextmenu', onContext);
    el.addEventListener('keydown', onKey);
    draw();
    ctx.message(`Place your chips: ${ctx.stakesText}. Then Spin.`);
  },
  unmount() {
    // Anything spinning was settled when Spin was pressed: just drop the reveal.
    clearTimeout(timer);
    pending = null; spinning = false;
    release?.(); release = null;
    mq?.removeEventListener('change', onResize);
    if (root) { root.removeEventListener('click', onClick); root.removeEventListener('contextmenu', onContext); root.removeEventListener('keydown', onKey); root.innerHTML = ''; }
    root = null; bets = {};
  },
  action,
  clear() { if (spinning) return; bets = {}; hit = null; ctx.play('chips'); ctx.message('Bets cleared.'); draw(); },
  rebet() {
    if (spinning || !last) return;
    if (total(last) > ctx.bank.balance) { ctx.play('error'); return ctx.message(`Rebet needs ${money(total(last))}; the bank has ${money(ctx.bank.balance)}.`); }
    bets = { ...last }; hit = null; ctx.play('chips'); ctx.message(`Same bets again: ${money(total(bets))}.`); draw();
  },
};
