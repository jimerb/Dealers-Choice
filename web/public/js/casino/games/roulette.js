// Roulette: playable. Double-zero or single-zero wheel and layout drawn by code; place chips on a
// number, on the lines between numbers (splits, streets, corners, six lines, the zero bets), the
// dozens, the columns or the even-money boxes; Spin; winnings go to the bank.
// Rules live in ../engines/roulette.js (no DOM).
// The wheel is three pictures (static bowl, spinning rotor, ball) over a code-drawn stand-in; the code
// draws the 38 pockets and their numbers in the rotor's open ring and turns them with it.
import { wheelOf, colorOf, betName, isBetKey, covers, settle, spin, checkLimits, OPTIONS } from '../engines/roulette.js';
import { svg, rect, text, path, esc, polar } from '../svg.js';
import { chipSVG } from '../chips.js';
import { ART, imgArt } from '../art.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';

// ------------------------------------------------------------------ layout geometry
// The table is laid out in (u, v) units: u runs along the layout (0 and 00, twelve columns of
// numbers, then the 2-to-1 boxes), v across it (three rows of numbers, the dozens, the even-money
// boxes). Wide screens draw u left to right; phones turn it to run top to bottom (1, 2, 3 across,
// 0 and 00 on top, outside bets in a column on the right), so the numbers stay big enough to tap.
// Text never rotates.
const U = 14, V = 4.6;
const EVEN = [['low', '1–18'], ['even', 'EVEN'], ['red', ''], ['black', ''], ['odd', 'ODD'], ['high', '19–36']];

export function areas(wheel = 'american') {
  const out = wheel === 'european'
    ? [{ key: 'n:0', u: 0, v: 0, du: 1, dv: 3, label: '0', fill: 'green' }]
    : [{ key: 'n:00', u: 0, v: 0, du: 1, dv: 1.5, label: '00', fill: 'green' },
      { key: 'n:0', u: 0, v: 1.5, du: 1, dv: 1.5, label: '0', fill: 'green' }];
  for (let n = 1; n <= 36; n++) {
    const row = n % 3 === 0 ? 0 : n % 3 === 2 ? 1 : 2;
    out.push({ key: `n:${n}`, u: 1 + Math.ceil(n / 3) - 1, v: row, du: 1, dv: 1, label: String(n), fill: colorOf(String(n)) });
  }
  [3, 2, 1].forEach((c, row) => out.push({ key: `col:${c}`, u: 13, v: row, du: 1, dv: 1, label: '2 to 1', small: true }));
  ['1st 12', '2nd 12', '3rd 12'].forEach((label, i) => out.push({ key: `dozen:${i + 1}`, u: 1 + i * 4, v: 3, du: 4, dv: 0.8, label }));
  EVEN.forEach(([key, label], i) => out.push({ key, u: 1 + i * 2, v: 3.8, du: 2, dv: 0.8, label, diamond: key === 'red' || key === 'black' ? key : '' }));
  return out;
}

/** Where a number sits: its column along the layout (1-12) and its row across it (0 = 3, 6 ... 36). */
const colOf = (n) => Math.ceil(n / 3);
const rowOf = (n) => (n % 3 === 0 ? 0 : n % 3 === 2 ? 1 : 2);

/**
 * The bets on the lines between numbers: thin hit areas over the lines (splits), where four numbers
 * meet (corners), along the outer edge next to the dozens (streets) and where that edge meets a
 * line between columns (six lines), plus the zero bets beside 0 and 00. In (u, v) units like areas().
 */
export function zones(wheel = 'american', { tu = 0.24, tv = 0.24, straddle = false } = {}) {
  // tu: how thick a hit area is across a line between columns (along u), tv: across a line between
  // rows (along v). Phones make them thicker, so a finger has 32 px or more to land on.
  const hu = tu / 2, hv = tv / 2;
  // the bets on the outer edge (streets, six lines, the basket or first four): inside the row by the
  // dozens, or (phones) astride the edge, so they don't eat the row's own numbers
  const ev = straddle ? 3 - hv : 3 - tv;
  const su = Math.max(0.22, hu + 0.01), sv = Math.max(0.25, hv + 0.01); // where a split's area starts in its cell
  const out = [];
  const box = (key, u, v, du, dv) => out.push({ key, u, v, du, dv });
  for (let n = 1; n <= 36; n++) {
    const c = colOf(n), r = rowOf(n);
    if (n % 3 !== 0) box(`split:${n}-${n + 1}`, c + su, r - hv, 1 - 2 * su, tv);              // up a street
    if (n <= 33) box(`split:${n}-${n + 3}`, c + 1 - hu, r + sv, tu, 1 - 2 * sv);                 // along a row
    if (n % 3 !== 0 && n <= 32) box(`corner:${n}-${n + 1}-${n + 3}-${n + 4}`, c + 1 - hu, r - hv, tu, tv);
  }
  for (let a = 1; a <= 34; a += 3) {
    box(`street:${a}`, colOf(a) + su, ev, 1 - 2 * su, tv);
    if (a <= 31) box(`line:${a}-${a + 5}`, colOf(a) + 1 - hu, ev, tu, tv);
  }
  if (wheel === 'european') {
    box('split:0-3', 1 - hu, sv, tu, 1 - 2 * sv);
    box('split:0-2', 1 - hu, 1 + sv, tu, 1 - 2 * sv);
    box('split:0-1', 1 - hu, 2 + sv, tu, 1 - 2 * sv);
    box('street:0-2-3', 1 - hu, 1 - hv, tu, tv);
    box('street:0-1-2', 1 - hu, 2 - hv, tu, tv);
    box('first4', 1 - hu, ev, tu, tv);
  } else {
    box('split:0-00', 0.22, 1.5 - hv, Math.min(0.56, 0.77 - hu), tv);
    box('split:00-3', 1 - hu, sv, tu, 1 - 2 * sv);
    box('street:00-2-3', 1 - hu, 1 - hv, tu, tv);
    box('split:00-2', 1 - hu, 1 + hv + 0.02, tu, 0.47 - hv);
    box('split:0-2', 1 - hu, 1.52, tu, 0.47 - hv);
    box('street:0-1-2', 1 - hu, 2 - hv, tu, tv);
    box('split:0-1', 1 - hu, 2 + sv, tu, 1 - 2 * sv);
    box('basket', 1 - hu, ev, tu, tv);
  }
  return out;
}

const GEO = {
  wide: { sx: 68, sy: 68, w: U * 68, h: V * 68, place: (a, g) => ({ x: a.u * g.sx, y: a.v * g.sy, w: a.du * g.sx, h: a.dv * g.sy }) },
  tall: { sx: 72, sy: 68, w: V * 72, h: U * 68, zones: { tu: 0.5, tv: 0.45, straddle: true }, place: (a, g) => ({ x: (a.v >= 3 ? a.v : 3 - a.v - a.dv) * g.sx, y: a.u * g.sy, w: a.dv * g.sx, h: a.du * g.sy }) },
};

/** The betting layout as SVG. bets: { key: dollars }; hit: the last winning pocket to ring. */
export function layout({ tall = false, bets = {}, hit = null, wheel = 'american' } = {}) {
  const g = tall ? GEO.tall : GEO.wide;
  const P = 6; // margin so the outer lines aren't clipped
  const cells = areas(wheel).map((a) => {
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
  // the line bets go on top of the cells (out of the tab order: there are over a hundred of them)
  const lines = zones(wheel, g.zones).map((z) => {
    const { x, y, w, h } = g.place(z, g);
    const cx = x + w / 2 + P, cy = y + h / 2 + P;
    const amount = bets[z.key] ?? 0;
    const label = `${betName(z.key)}${amount ? `, ${money(amount)} bet` : ''}`;
    return `<g class="cz-bet cz-zone${amount ? ' on' : ''}" data-bet="${z.key}" role="button" tabindex="-1" aria-label="${esc(label)}">
      ${rect(x + P, y + P, w, h, { cls: 'cz-zone-hit' })}${amount ? chipSVG(cx, cy, 13, amount) : ''}</g>`;
  }).join('');
  return svg(g.w + 2 * P, g.h + 2 * P, cells + lines, { label: 'Roulette layout', cls: `cz-roulette ${tall ? 'tall' : 'wide'}` });
}

// Wheel geometry, in the pictures' 1024-unit square (centre 512, 512): the rotor's open ring for the
// pockets runs from r 290 to 382, the ball track from 400 to 470.
const C = 512, POCKET_IN = 290, POCKET_OUT = 382, NUM_R = 356, FLOOR_R = 312, TRACK_R = 436, BALL = 34;
const stepOf = (wheel) => 360 / wheelOf(wheel).length;

/** The pocket ring (and, under the rotor picture, a plain cone and hub in case it doesn't load):
 *  38 (or 37) pockets in wheel order, 0 at the top before the wheel turns. */
export function wheelSVG(wheel = 'american') {
  const f = (v) => v.toFixed(1);
  const WHEEL = wheelOf(wheel), STEP = stepOf(wheel);
  const pockets = WHEEL.map((p, i) => {
    const a0 = (i - 0.5) * STEP - 90, a1 = (i + 0.5) * STEP - 90;
    const [x0, y0] = polar(C, C, POCKET_OUT, a0), [x1, y1] = polar(C, C, POCKET_OUT, a1);
    const [x2, y2] = polar(C, C, POCKET_IN, a1), [x3, y3] = polar(C, C, POCKET_IN, a0);
    const flip = i * STEP > 90 && i * STEP < 270 ? ` rotate(180 ${C} ${C - NUM_R})` : '';
    return `<path d="M${f(x0)} ${f(y0)} A${POCKET_OUT} ${POCKET_OUT} 0 0 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${POCKET_IN} ${POCKET_IN} 0 0 0 ${f(x3)} ${f(y3)} Z" class="cz-pocket ${colorOf(p)}" data-pocket="${p}"/>
      <text x="${C}" y="${C - NUM_R}" font-size="${p.length > 1 ? 27 : 30}" font-weight="700" text-anchor="middle" dominant-baseline="central" class="cz-wheel-tx" transform="rotate(${(i * STEP).toFixed(2)} ${C} ${C})${flip}">${p}</text>`;
  }).join('');
  const frets = WHEEL.map((_, i) => {
    const a = (i - 0.5) * STEP - 90;
    const [x0, y0] = polar(C, C, POCKET_OUT, a), [x1, y1] = polar(C, C, POCKET_IN, a);
    return `M${f(x0)} ${f(y0)} L${f(x1)} ${f(y1)}`;
  }).join(' ');
  return `<svg viewBox="0 0 1024 1024" aria-hidden="true" class="cz-wheel-layer">${pockets}
    <circle cx="${C}" cy="${C}" r="${(POCKET_IN + 333) / 2}" class="cz-pocket-floor" stroke-width="${333 - POCKET_IN}"/>
    <path d="${frets}" class="cz-fret"/><circle cx="${C}" cy="${C}" r="333" class="cz-fret-ring"/>
    <circle cx="${C}" cy="${C}" r="${POCKET_IN}" class="cz-wheel-cone"/><circle cx="${C}" cy="${C}" r="70" class="cz-wheel-hub"/></svg>`;
}

/** The whole wheel: the static parts, the turning rotor with its pockets, the bowl, the ball. */
export function wheelHTML(turn = 0, wheel = 'american') {
  return `<svg viewBox="0 0 1024 1024" aria-hidden="true" class="cz-wheel-layer"><circle cx="${C}" cy="${C}" r="500" class="cz-wheel-rim"/>
      <circle cx="${C}" cy="${C}" r="468" class="cz-wheel-track"/><circle cx="${C}" cy="${C}" r="402" class="cz-wheel-well"/></svg>
    <div class="cz-wheel-spin" style="transform:rotate(${turn}deg)">${wheelSVG(wheel)}${imgArt(ART.rotor, 'cz-wheel-layer')}</div>
    ${imgArt(ART.bowl, 'cz-wheel-layer')}
    <div class="cz-rl-orbit" hidden><span class="cz-rl-pearl">${imgArt(ART.ball)}</span></div>`;
}

// ------------------------------------------------------------------ the table
const TALL = '(max-width: 640px)';
let root = null, ctx = null, mq = null, bets = null;
let spinning = false, timer = null, frame = 0, pending = null, release = null, hit = null, history = [], turn = 0;
let wheel = 'american';   // the wheel on the table (a new one comes in between spins)
let armed = null;         // touch: the line bet tapped once, waiting for the second tap { key, t }
let lastPointer = 'mouse';
const STEP = () => stepOf(wheel);

const spinMs = () => (ctx?.reduced() ? 300 : ctx?.opts.quick ? 1300 : 3500);
const easeOut = (u) => 1 - (1 - u) ** 3;

/** Put the ball at angle `deg` (0 = top, clockwise) and radius `r` (wheel units). */
function placeBall(deg, r) {
  const orbit = root?.querySelector('.cz-rl-orbit');
  if (!orbit) return;
  orbit.hidden = false;
  orbit.style.transform = `rotate(${deg}deg)`;
  orbit.firstElementChild.style.top = `${((C - r - BALL / 2) / 1024) * 100}%`;
}
const setRotor = (deg) => { const w = root?.querySelector('.cz-wheel-spin'); if (w) w.style.transform = `rotate(${deg}deg)`; };

/**
 * Spin the rotor from `from` to `to` (degrees, clockwise) over T ms while the ball runs the other way
 * round the track, drops in, and rides the rotor in pocket `idx`, which ends at the top.
 */
function animate(from, to, idx, T) {
  cancelAnimationFrame(frame);
  const rotor = (t) => from + (to - from) * easeOut(Math.min(1, t / T));
  const lock = (t) => rotor(t) + idx * STEP();           // the winning pocket's angle at time t
  const t2 = T * 0.72, t1 = T * 0.42;                  // the ball leaves the track at t1, is caught at t2
  // laps so the ball starts where it rests now (the top), running counter-clockwise
  const laps = 4 + (((-lock(t2)) % 360) + 360) % 360 / 360;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(T, now - start);
    let deg, r;
    if (t < t2) {
      deg = lock(t2) + laps * 360 * (1 - t / t2) ** 2;
      if (t < T * 0.06) r = FLOOR_R + (TRACK_R - FLOOR_R) * easeOut(t / (T * 0.06));
      else if (t < t1) r = TRACK_R;
      else { const v = (t - t1) / (t2 - t1); r = TRACK_R - (TRACK_R - FLOOR_R) * v * v + Math.sin(v * Math.PI * 3) * 16 * (1 - v); }
    } else {
      const v = Math.min(1, (t - t2) / (T * 0.1));
      deg = lock(t);
      r = FLOOR_R + Math.sin(v * Math.PI) * 10 * (1 - v);
    }
    setRotor(rotor(t));
    placeBall(deg, r);
    if (t < T && root) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

function draw() {
  if (!root) return;
  const tall = mq?.matches ?? false;
  // Redrawing replaces the cells: keep keyboard focus on the same bet.
  const focused = root.ownerDocument.activeElement?.closest?.('[data-bet]')?.dataset.bet;
  root.querySelector('.cz-rl-grid').innerHTML = layout({ tall, bets: bets.amounts(), hit, wheel });
  if (focused) root.querySelector(`[data-bet="${focused}"]`)?.focus({ preventScroll: true });
  const hist = root.querySelector('.cz-rl-history');
  hist.hidden = ctx?.opts.history === false;
  hist.innerHTML = history.length
    ? `<span class="cz-rl-hlabel">Last spins</span>${history.map((p) => `<span class="cz-rl-ball ${colorOf(p)}">${p}</span>`).join('')}`
    : '<span class="cz-rl-hlabel">Place your chips, then spin</span>';
}

function action() {
  if (spinning) return;
  // Settled now (bank debited, hand recorded, winnings paid); the wheel only reveals the result.
  // The bank display keeps the pre-spin figure until the ball lands.
  bets.commit((amounts, hold) => {
    const pocket = spin(ctx.rng, wheel);
    const r = settle(amounts, pocket, { halfback: Boolean(ctx.opts.halfback) });
    ctx.settle({ returned: r.returned });
    release = hold;
    spinning = true;
    pending = { pocket, ...r };
    // turn the wheel so the winning pocket stops under the marker at the top, the ball in it
    const idx = wheelOf(wheel).indexOf(pocket);
    const from = turn;
    turn += 360 * 4 + ((((-idx * STEP() - turn) % 360) + 360) % 360);
    if (ctx.reduced()) { setRotor(turn); placeBall(0, FLOOR_R); } else animate(from, turn, idx, spinMs());
    ctx.message('No more bets…');
    ctx.play('shuffle');
    ctx.setButtons({ action: false });
    timer = setTimeout(reveal, spinMs());
  }, { hold: true });
}

/** The ball has landed: show what was already settled. */
function reveal() {
  clearTimeout(timer);
  const r = pending;
  pending = null;
  spinning = false;
  release?.(); release = null;
  if (!r || !root) return;
  hit = r.pocket;
  root.dataset.pocket = r.pocket;
  history = [r.pocket, ...history].slice(0, 12);
  cancelAnimationFrame(frame);
  setRotor(turn);
  placeBall(0, FLOOR_R);
  bets.release(); // the chips come off the layout (the result is shown below); Rebet remembers them
  hit = r.pocket;
  draw();
  const name = `${r.pocket} ${colorOf(r.pocket)}`;
  if (r.net > 0) {
    ctx.play('win');
    ctx.banner(`${name} · You win ${money(r.net)}`, { tone: 'win', detail: `${money(r.returned)} back from ${money(r.wagered)} bet` });
    ctx.message(`${name}. You win ${money(r.net)} (${money(r.returned)} back from ${money(r.wagered)} bet).`);
  } else if (r.returned) {
    const half = r.halves.length ? ` (half back on ${r.halves.map((x) => betName(x.key).toLowerCase()).join(', ')})` : '';
    ctx.play('chips');
    ctx.banner(`${name} · ${money(r.returned)} back`, { tone: 'push', detail: `from ${money(r.wagered)} bet${half}` });
    ctx.message(`${name}. ${money(r.returned)} back from ${money(r.wagered)} bet${half}.`);
  } else {
    ctx.play('lose');
    ctx.banner(`${name}`, { tone: 'lose', detail: `The house takes ${money(r.wagered)}` });
    ctx.message(`${name}. The house takes ${money(r.wagered)}.`);
  }
  if (pendingWheel) setWheel(pendingWheel);
  ctx.checkBroke();
}

const onResize = () => draw();

// ---- the line bets: hovering lights the numbers a bet covers; on a touch screen the first tap on a
// line shows them and a second tap within 1.5 s puts the chip down, so a fat finger can't misplace it
let pendingWheel = null;
function light(key) {
  root?.querySelectorAll('.cz-bet.cover').forEach((g) => g.classList.remove('cover'));
  for (const p of (key && covers(key, wheel)) || []) root?.querySelector(`[data-bet="n:${p}"]`)?.classList.add('cover');
}
function onOver(e) {
  const z = e.target.closest?.('.cz-zone');
  light(z ? z.dataset.bet : null);
}
function onDown(e) { lastPointer = e.pointerType || 'mouse'; }
function onTap(e) {
  const z = e.target.closest?.('.cz-zone');
  if (!z || lastPointer !== 'touch' || spinning) return;
  const key = z.dataset.bet;
  if (armed?.key === key && performance.now() - armed.t < 1500) { armed = null; return; } // second tap: bet
  e.stopPropagation();
  e.preventDefault();
  armed = { key, t: performance.now() };
  light(key);
  ctx.message(`${betName(key)}: tap again to bet.`);
}

/** Put a different wheel on the table (between spins): chips on bets it doesn't have come off. */
function setWheel(name) {
  pendingWheel = null;
  if (name === wheel) return;
  wheel = name;
  const amounts = bets.amounts();
  const keep = Object.fromEntries(Object.entries(amounts).filter(([k]) => isBetKey(k, wheel)));
  if (Object.keys(keep).length !== Object.keys(amounts).length) { bets.staging.set(keep); bets.sync(); ctx.toast('Chips on bets this wheel doesn\'t have came off.'); }
  history = [];
  hit = null;
  turn = 0;
  const w = root.querySelector('.cz-rl-wheel');
  w.innerHTML = `${wheelHTML(turn, wheel)}<span class="cz-wheel-marker" aria-hidden="true"></span>`;
  draw();
}

export default {
  id: 'roulette',
  name: 'Roulette',
  ready: true,
  bannerAt: 'bottom', // over the outside bets, clear of the numbers and the wheel's result
  layout,
  settings: [
    ...OPTIONS,
    { key: 'history', label: 'Show the last numbers', type: 'check', default: true },
    { key: 'quick', label: 'Quick spin', type: 'check', default: false },
  ],
  howto: howtoSections([
    ['Placing bets', 'Choose a chip on the rack, then click or tap a number or box to put it there. Click again to add more. Right-click, shift-click or a long press takes a chip back off. Undo takes back the last chip, Clear removes everything, and Rebet repeats your last spin\'s bets (as much as your bank covers).'],
    ['Bets on the lines', '<ul><li><b>Split</b>: on the line between two numbers.</li><li><b>Street</b>: on the outer edge of a row of three (next to the dozens).</li><li><b>Corner</b>: where four numbers meet.</li><li><b>Six line</b>: on the outer edge where two rows of three meet.</li><li>Beside the zeros: 0-00, 0-1, 0-2, 00-2 and 00-3 splits, the 0-1-2 and 00-2-3 streets and the five-number bet (0, 00, 1, 2, 3) at the bottom corner. On the single-zero wheel: 0-1, 0-2 and 0-3 splits, the 0-1-2 and 0-2-3 streets and the first four (0, 1, 2, 3).</li></ul>Pointing at a line lights up the numbers it covers. On a touch screen, tap a line once to see them and again to bet.'],
    ['Payouts', '<ul><li>A single number (straight up) pays 35 to 1, a split 17 to 1, a street 11 to 1, a corner or the first four 8 to 1, the five-number bet 6 to 1, a six line 5 to 1.</li><li>A dozen or a column pays 2 to 1.</li><li>Red, black, odd, even, 1–18 and 19–36 pay even money.</li><li>0 and 00 lose every bet that doesn\'t cover them.</li></ul>'],
    ['The odds', 'On the double-zero wheel every bet gives the house 5.26%, except the five-number bet (7.89%). On the single-zero wheel it is 2.70%. With half back, even-money bets lose only half when a zero comes up, which halves their edge (1.35% on the single-zero wheel). Past numbers don\'t change the next spin.'],
    ['Options', 'Wheel: double zero (0 and 00) or single zero. Half back: even-money bets get half their stake back when the ball lands in a zero. A new wheel comes in after the current spin. Show the last numbers: the row of recent results over the layout. Quick spin: the ball drops in about a second.'],
    ['Table limits', 'Your bets on numbers and lines together must reach the table minimum, each outside bet must reach it on its own, and no single bet may go over the table maximum.'],
    ['Keys', 'Number keys 1 to 8 pick a chip, Enter or Space spins, Backspace undoes, C clears, R rebets and Shift+R rebets double.'],
  ]),

  mount(el, c) {
    root = el; ctx = c;
    hit = null; spinning = false; pending = null; armed = null; pendingWheel = null;
    const want = ctx.opts.wheel === 'european' ? 'european' : 'american';
    if (want !== wheel) { wheel = want; history = []; turn = 0; }
    el.innerHTML = `<div class="cz-rl">
      <div class="cz-rl-wheel">${wheelHTML(turn, wheel)}<span class="cz-wheel-marker" aria-hidden="true"></span></div>
      <div class="cz-rl-main"><div class="cz-rl-history" aria-live="off"></div><div class="cz-rl-grid"></div></div></div>`;
    mq = matchMedia(TALL);
    mq.addEventListener('change', onResize);
    bets = ctx.bets({
      root: el, attr: 'data-bet',
      // every pocket and box takes chips up to the table maximum; the minimums are checked as a whole
      spot: (key) => (isBetKey(key, wheel) && !spinning ? { label: betName(key), min: 0 } : null),
      validate: (b) => checkLimits(b, ctx.stakes),
      onChange: () => { if (!spinning) hit = null; draw(); },
    });
    const grid = el.querySelector('.cz-rl-grid');
    grid.addEventListener('click', onTap, true);
    grid.addEventListener('pointerdown', onDown, true);
    grid.addEventListener('pointerover', onOver);
    grid.addEventListener('pointerleave', () => light(null));
    if (history.length) placeBall(0, FLOOR_R); // the last ball still sits in its pocket
    draw();
    ctx.message(`Place your chips: ${ctx.stakesText}. Then Spin.`);
  },
  unmount() {
    // Anything spinning was settled when Spin was pressed: just drop the reveal.
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    pending = null; spinning = false;
    release?.(); release = null;
    mq?.removeEventListener('change', onResize);
    if (root) root.innerHTML = '';
    root = null; bets = null; armed = null;
  },
  optionsChanged(opts) {
    if (!root) return;
    draw();
    const want = opts.wheel === 'european' ? 'european' : 'american';
    if (spinning) { pendingWheel = want; return; }
    setWheel(want);
  },
  action,
};
