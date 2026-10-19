// Craps: playable. The player is the shooter. One end of the table, drawn by code: propositions on
// the left, the place numbers with their buy and lay strips, Come, Field, Big 6/8, Don't Pass and
// the Pass Line wrapping round the curved end, where the dice land. Phones get a portrait layout
// with the propositions in a "Center bets" drawer.
// Rules live in ../engines/craps.js (no DOM). Chips placed between rolls are staged (ctx.bets) and
// go down when Roll is pressed; bets that stay up live in the engine's table. Every roll is settled
// with the bank at once, before the dice finish tumbling.
import * as E from '../engines/craps.js';
import { svg, rect, text, circle, path, esc } from '../svg.js';
import { railBand, dieFace, tumblingDie, puck } from '../tableart.js';
import { chipSVG, bindSpots } from '../chips.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';

const PN = E.POINTS;
const PLABEL = { 4: '4', 5: '5', 6: 'SIX', 8: '8', 9: 'NINE', 10: '10' };
const TALL = '(max-width: 719px)';

// ------------------------------------------------------------------ geometry
// Each betting area: { key, x, y, w, h, d? (a path instead of a rect), body (labels), chip: [cx, cy, r] }.
// Come and don't come bets on a number are drawn as chips in the number's box; each is its own
// button (it takes odds), listed in `riders`.

function propAreas(x0, y0) {
  const w = 240, half = 120;
  const A = [];
  const row = (y, h, key, label, pays) => A.push({ key, x: x0, y, w, h, chip: [x0 + w - 22, y + h / 2, 12],
    body: text(x0 + 78, y + h / 2, label, { size: 17, weight: 700 }) + text(x0 + 162, y + h / 2, pays, { size: 13, cls: 'cz-tx dim' }) });
  const cell = (y, col, key, label, pays, dice) => {
    const x = x0 + col * half;
    A.push({ key, x, y, w: half, h: 56, chip: [x + half - 20, y + 18, 12],
      body: dice.map((v, i) => dieFace(x + 10 + i * 28, y + 6, 24, v)).join('')
        + text(x + half / 2, y + 43, `${label} · ${pays}`, { size: 13, weight: 700 }) });
  };
  row(y0, 40, 'any7', 'Any seven', '4 to 1');
  cell(y0 + 46, 0, 'hard:6', 'Hard 6', '9:1', [3, 3]); cell(y0 + 46, 1, 'hard:10', 'Hard 10', '7:1', [5, 5]);
  cell(y0 + 106, 0, 'hard:8', 'Hard 8', '9:1', [4, 4]); cell(y0 + 106, 1, 'hard:4', 'Hard 4', '7:1', [2, 2]);
  cell(y0 + 166, 0, 'two', 'Two', '30:1', [1, 1]); cell(y0 + 166, 1, 'twelve', 'Twelve', '30:1', [6, 6]);
  cell(y0 + 226, 0, 'three', 'Three', '15:1', [1, 2]); cell(y0 + 226, 1, 'yo', 'Eleven', '15:1', [5, 6]);
  row(y0 + 286, 40, 'horn', 'Horn', '2 3 11 12');
  row(y0 + 332, 40, 'craps', 'Any craps', '7 to 1');
  // C and E: the quick way onto Any craps and Eleven
  for (const [i, key, l] of [[0, 'craps', 'C'], [1, 'yo', 'E']]) {
    const cx = x0 + 30 + i * 56, cy = y0 + 400;
    A.push({ key, ce: true, x: cx - 22, y: cy - 22, w: 44, h: 44, round: true, chip: [cx + 16, cy - 16, 10],
      body: text(cx, cy, l, { size: 20, weight: 800 }) });
  }
  A.push({ label: text(x0 + 176, y0 + 400, 'one-roll bets', { size: 13, cls: 'cz-tx dim' }) });
  return A;
}

/** The number boxes: lay and buy strips over each place number. (x, y) top-left of the first. */
function numberAreas(cells) {
  const A = [];
  for (const { n, x, y, w } of cells) {
    const cx = x + w / 2;
    A.push({ key: `lay:${n}`, x, y, w, h: 22, chip: [cx + w / 2 - 16, y + 11, 10], body: text(cx - 8, y + 11, 'LAY', { size: 11, cls: 'cz-tx dim' }) });
    A.push({ key: `buy:${n}`, x, y: y + 22, w, h: 22, chip: [cx + w / 2 - 16, y + 33, 10], body: text(cx - 8, y + 33, 'BUY', { size: 11, cls: 'cz-tx dim' }) });
    const by = y + 44;
    A.push({ key: `place:${n}`, x, y: by, w, h: 104, n, chip: [cx, by + 82, 14], puckAt: [cx, by + 18],
      body: text(cx, by + 50, PLABEL[n], { size: typeof PLABEL[n] === 'string' && PLABEL[n].length > 2 ? 24 : 34, weight: 800 }) });
    A.push({ rider: `come:${n}`, key: `come:${n}-odds`, cx: cx - 24, cy: by + 18, r: 12 });
    A.push({ rider: `dc:${n}`, key: `dc:${n}-odds`, cx: cx + 24, cy: by + 18, r: 12 });
  }
  return A;
}

function fieldBody(x, y, w, h, opts, tall) {
  const nums = [2, 3, 4, 9, 10, 11, 12];
  const left = tall ? x + 16 : x + 60;
  const step = (w - (left - x) - 20) / (nums.length - 1);
  const cy = y + h * 0.4;
  const n = nums.map((v, i) => {
    const cx = left + i * step;
    return (v === 2 || v === 12 ? circle(cx, cy, tall ? 15 : 18) : '') + text(cx, cy, String(v), { size: tall ? 18 : 22, weight: 700 });
  }).join('');
  const twelve = opts.field12 === 3 ? 'triple' : 'double';
  return (tall ? '' : text(x + 26, y + h / 2, 'FIELD', { size: 20, weight: 800, rotate: -90 }))
    + n + text(x + w / 2 + (tall ? 0 : 20), y + h - 14, tall ? `FIELD · 2 pays double · 12 pays ${twelve}` : `2 pays double · 12 pays ${twelve}`, { size: 12, cls: 'cz-tx dim' });
}

function wideAreas(opts) {
  const A = propAreas(24, 24);
  A.push({ key: 'dc', x: 280, y: 24, w: 90, h: 148, chip: [325, 132, 14], puckAt: [325, 44],
    body: text(325, 78, "DON'T", { size: 14, weight: 700 }) + text(325, 96, 'COME', { size: 14, weight: 700 }) + text(325, 114, 'BAR', { size: 11, cls: 'cz-tx dim' })
      + dieFace(303, 152, 18, 6) + dieFace(329, 152, 18, 6) });
  A.push(...numberAreas(PN.map((n, i) => ({ n, x: 370 + i * 82, y: 24, w: 82 }))));
  A.push({ key: 'come', x: 280, y: 178, w: 582, h: 62, chip: [800, 209, 15], body: text(560, 209, 'COME', { size: 40, weight: 800 }) });
  A.push({ key: 'big6', x: 280, y: 246, w: 90, h: 72, chip: [348, 262, 12], body: text(318, 270, 'BIG', { size: 13, cls: 'cz-tx dim' }) + text(318, 294, '6', { size: 28, weight: 800 }) });
  A.push({ key: 'big8', x: 280, y: 318, w: 90, h: 72, chip: [348, 334, 12], body: text(318, 342, 'BIG', { size: 13, cls: 'cz-tx dim' }) + text(318, 366, '8', { size: 28, weight: 800 }) });
  A.push({ key: 'field', x: 370, y: 246, w: 492, h: 72, chip: [838, 305, 11], body: fieldBody(370, 246, 492, 72, opts, false) });
  A.push({ key: 'dp', x: 370, y: 324, w: 412, h: 42, chip: [752, 345, 14],
    body: text(560, 345, "DON'T PASS BAR", { size: 19, weight: 800 }) + dieFace(672, 335, 20, 6) + dieFace(696, 335, 20, 6) });
  A.push({ key: 'dp-odds', x: 782, y: 324, w: 80, h: 42, chip: [838, 345, 12], body: text(806, 345, 'ODDS', { size: 12, cls: 'cz-tx dim' }) });
  A.push({ key: 'pass', d: 'M280 396 H870 V178 H924 V414 Q924 440 898 440 H280 Z', x: 280, y: 178, w: 644, h: 262, chip: [820, 418, 15],
    body: text(560, 418, 'PASS LINE', { size: 30, weight: 800 }) + text(897, 300, 'PASS LINE', { size: 20, weight: 800, rotate: 90 }) });
  A.push({ key: 'pass-odds', x: 280, y: 444, w: 644, h: 32, chip: [820, 460, 13], body: text(560, 460, 'PASS LINE ODDS · TRUE ODDS, NO HOUSE EDGE', { size: 12, cls: 'cz-tx dim' }) });
  return A;
}

function tallAreas(opts) {
  const A = [];
  const w = 376 / 3;
  A.push(...numberAreas(PN.map((n, i) => ({ n, x: 12 + (i % 3) * w, y: 12 + Math.floor(i / 3) * 150, w }))));
  A.push({ key: 'dc', x: 12, y: 312, w: 100, h: 60, chip: [90, 342, 12], puckAt: [36, 342],
    body: text(62, 334, "DON'T COME", { size: 11, weight: 700 }) + text(62, 352, 'BAR 12', { size: 10, cls: 'cz-tx dim' }) });
  A.push({ key: 'come', x: 112, y: 312, w: 276, h: 60, chip: [356, 342, 14], body: text(250, 342, 'COME', { size: 30, weight: 800 }) });
  A.push({ key: 'field', x: 12, y: 378, w: 288, h: 78, chip: [284, 441, 10], body: fieldBody(12, 378, 288, 78, opts, true) });
  A.push({ key: 'big6', x: 300, y: 378, w: 88, h: 39, chip: [366, 397, 11], body: text(332, 397, 'BIG 6', { size: 15, weight: 800 }) });
  A.push({ key: 'big8', x: 300, y: 417, w: 88, h: 39, chip: [366, 436, 11], body: text(332, 436, 'BIG 8', { size: 15, weight: 800 }) });
  A.push({ key: 'dp', x: 12, y: 462, w: 288, h: 44, chip: [272, 484, 13], body: text(140, 484, "DON'T PASS BAR", { size: 16, weight: 800 }) });
  A.push({ key: 'dp-odds', x: 300, y: 462, w: 88, h: 44, chip: [366, 484, 11], body: text(330, 484, 'ODDS', { size: 11, cls: 'cz-tx dim' }) });
  A.push({ key: 'pass', x: 12, y: 512, w: 376, h: 52, chip: [350, 538, 15], body: text(180, 538, 'PASS LINE', { size: 26, weight: 800 }) });
  A.push({ key: 'pass-odds', x: 12, y: 568, w: 376, h: 34, chip: [350, 585, 12], body: text(180, 585, 'PASS LINE ODDS', { size: 12, cls: 'cz-tx dim' }) });
  return A;
}

// ------------------------------------------------------------------ drawing
const EMPTY = { bets: {}, point: null, opts: E.DEFAULTS };

function stackFor(cx, cy, r, committed, staged, off) {
  const amount = committed + staged;
  if (!amount) return '';
  return `${chipSVG(cx, cy, r, amount)}${staged ? circle(cx, cy, r + 3, { cls: 'cz-cr-staged' }) : ''}${off ? `<g class="cz-cr-off" pointer-events="none">${rect(cx - 14, cy + r - 2, 28, 13, { cls: 'cz-cr-offbg', r: 6 })}${text(cx, cy + r + 4.5, 'OFF', { size: 9, weight: 800, cls: 'cz-cr-offtx' })}</g>` : ''}`;
}

function ariaFor(key, table, staged, opts) {
  const now = table.bets[key] ?? 0, add = staged[key] ?? 0;
  let s = `${E.betName(key)}, pays ${E.paysText(key, opts)}`;
  if (now) s += `. ${money(now)} on it${E.isWorking(table, key) ? '' : ', off this roll'}`;
  if (add) s += `. ${money(add)} more going down`;
  return s;
}

/** All the betting areas as SVG: shapes and labels, then chips, then the come bets on numbers. */
function drawAreas(A, v) {
  const { table, staged, hits, open } = v;
  const opts = table.opts;
  const amt = (k) => [table.bets[k] ?? 0, staged[k] ?? 0];
  const spots = A.map((a) => {
    if (a.label) return a.label;
    if (a.rider) return '';
    const cls = `cz-cr-spot${open(a.key) ? '' : ' shut'}${hits[a.key] ? ` ${hits[a.key]}` : ''}`;
    const shape = a.d ? path(a.d, { cls: 'cz-area' }) : a.round ? circle(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, { cls: 'cz-area' }) : rect(a.x, a.y, a.w, a.h, { cls: 'cz-area' });
    return `<g class="${cls}" data-spot="${a.key}" role="button" tabindex="0" aria-label="${esc(ariaFor(a.key, table, staged, opts))}">${shape}${a.body ?? ''}</g>`;
  }).join('');
  const chips = A.map((a) => {
    if (!a.key || a.rider || a.ce) return '';
    const [c, s] = amt(a.key);
    const off = c > 0 && !E.isWorking(table, a.key);
    return stackFor(a.chip[0], a.chip[1], a.chip[2], c, s, off);
  }).join('');
  // a come or don't come bet on its number: a chip that takes odds when clicked
  const riders = A.filter((a) => a.rider).map((a) => {
    const flat = table.bets[a.rider] ?? 0;
    if (!flat) return '';
    const [c, s] = amt(a.key);
    const off = c > 0 && !E.isWorking(table, a.key);
    const label = `${E.betName(a.rider)}, ${money(flat)}${c ? `, odds ${money(c)}${off ? ' (off this roll)' : ''}` : ''}${s ? `, ${money(s)} more odds going down` : ''}. Click to add odds, right-click to take odds down`;
    return `<g class="cz-cr-spot cz-cr-rider${hits[a.rider] ? ` ${hits[a.rider]}` : ''}" data-spot="${a.key}" role="button" tabindex="0" aria-label="${esc(label)}">
      ${circle(a.cx, a.cy, a.r + 4, { cls: 'cz-cr-hit' })}${chipSVG(a.cx, a.cy, a.r, flat)}${a.rider.startsWith('dc') ? text(a.cx, a.cy - a.r - 6, "DON'T", { size: 8, weight: 800, cls: 'cz-cr-tag' }) : ''}
      ${c + s ? stackFor(a.cx + 9, a.cy + 12, 9, c, s, off) : ''}</g>`;
  }).join('');
  // the puck: OFF in the don't come box on the come-out, ON on the point's number
  const at = table.point ? A.find((a) => a.key === `place:${table.point}`)?.puckAt : A.find((a) => a.key === 'dc')?.puckAt;
  const pk = at ? `<g class="cz-cr-puck" pointer-events="none">${puck(at[0], at[1], table.point ? 14 : 13, Boolean(table.point))}</g>` : '';
  return spots + chips + pk + riders;
}

/** The dice: tumbling while they roll (or before the first roll), resting faces after. */
function diceSVG(x, y, s, v) {
  if (v.rolling || !v.dice) {
    const f = v.frame ?? 1;
    const [a, b] = v.tumble ?? [6, 1];
    return `<g class="cz-cr-dice${v.rolling ? ' rolling' : ''}">${tumblingDie(x + s / 2, y + s / 2, s, f, a)}${tumblingDie(x + s * 1.75, y + s / 2 + 3, s, 3 - f, b)}</g>`;
  }
  const [a, b] = v.dice;
  return `<g class="cz-cr-dice">${dieFace(x, y, s, a, { rotate: -8 })}${dieFace(x + s * 1.25, y + 4, s, b, { rotate: 11 })}</g>`;
}

function status(table) {
  return table.point ? ['POINT', String(table.point)] : ['COME-OUT', 'ROLL'];
}

/** The craps layout. v: { tall, table, staged, dice, rolling, frame, tumble, hist, hits, open }. */
export function layout(v = {}) {
  const view = { table: EMPTY, staged: {}, hits: {}, hist: [], open: () => true, ...v };
  const opts = view.table.opts;
  const [st1, st2] = status(view.table);
  const last = view.dice && !view.rolling ? `${view.dice[0] + view.dice[1]}` : '';
  const lastName = view.dice && !view.rolling ? E.rollName(view.dice) : view.rolling ? 'rolling…' : 'shooter ready';
  if (view.tall) {
    const W = 400, H = 692;
    const hist = view.hist.slice(0, 8).map((t, i) => text(300 + (i % 4) * 22, 642 + Math.floor(i / 4) * 22, String(t), { size: 13, weight: i ? 600 : 800, cls: i ? 'cz-tx dim' : 'cz-tx' })).join('');
    return svg(W, H, `${rect(4, 4, W - 8, H - 8, { cls: 'cz-rail', r: 18 })}
      ${drawAreas(tallAreas(opts), view)}
      ${rect(12, 610, 376, 72, { cls: 'cz-cr-tray', r: 10 })}
      ${diceSVG(26, 622, 46, view)}
      ${text(196, 634, `${st1} ${st2 === 'ROLL' ? '' : st2}`.trim(), { size: 14, weight: 800 })}
      ${text(196, 656, last ? `${last} · ${lastName}` : lastName, { size: 15, weight: 700 })}
      ${view.hist.length ? text(300, 620, 'LAST ROLLS', { size: 9, cls: 'cz-tx dim', anchor: 'start' }) : ''}${hist}`,
    { label: 'Craps layout: place numbers, Come, Field, Big 6 and 8, Don\'t Pass and Pass Line; the dice below', cls: 'cz-craps tall' });
  }
  const W = 1080, H = 500;
  const tub = 'M12 12 H930 Q1068 12 1068 250 Q1068 488 930 488 H12 Z';
  const hist = view.hist.slice(0, 5).map((t, i) => text(996, 372 + i * 19, String(t), { size: i ? 13 : 15, weight: i ? 600 : 800, cls: i ? 'cz-tx dim' : 'cz-tx' })).join('');
  return svg(W, H, `${railBand(tub, tub, W, H, 22)}${path(tub, { cls: 'cz-rail' })}
    ${drawAreas(wideAreas(opts), view)}
    ${text(996, 92, st1, { size: 14, weight: 800, cls: 'cz-tx dim' })}${text(996, 124, st2, { size: st2 === 'ROLL' ? 18 : 34, weight: 800 })}
    ${diceSVG(948, 196, 40, view)}
    ${text(996, 276, last, { size: 30, weight: 800 })}${text(996, 302, lastName, { size: 13, cls: 'cz-tx dim' })}
    ${view.hist.length ? text(996, 350, 'LAST ROLLS', { size: 10, cls: 'cz-tx dim' }) : ''}${hist}`,
  { label: 'Craps layout: propositions on the left; place numbers, Come, Field, Don\'t Pass and Pass Line; the dice on the right', cls: 'cz-craps wide' });
}

/** The propositions on their own, for the phone's Center bets drawer. */
export function propsLayout(v = {}) {
  const view = { table: EMPTY, staged: {}, hits: {}, open: () => true, ...v };
  return svg(264, 452, drawAreas(propAreas(12, 8), view), { label: 'Center bets: hardways and one-roll bets', cls: 'cz-craps props' });
}

// ------------------------------------------------------------------ the table
let root = null, ctx = null, bets = null, mq = null, unbind = null;
let table = null;       // the engine's table: the bets that are up and the point
let shown = null;       // while the dice roll: the table as it was (the result isn't shown yet)
let rolling = false, dice = null, hist = [], hits = {}, frame = 1, tumble = [6, 1];
let tick = null, done = null, bannerT = null, pendingOpts = null, drawerOpen = false;

const tall = () => mq?.matches ?? false;
const staged = () => bets?.amounts() ?? {};
const open = (key) => !rolling && !E.whyNot(table, key, staged());

function view() {
  return { tall: tall(), table: shown ?? table, staged: rolling ? {} : staged(), dice, rolling, frame, tumble, hist, hits, open };
}

function draw() {
  if (!root) return;
  const focused = root.ownerDocument.activeElement?.closest?.('[data-spot]')?.dataset.spot;
  const v = view();
  root.querySelector('.cz-cr-table').innerHTML = layout(v);
  const drawer = root.querySelector('.cz-cr-drawer');
  drawer.hidden = !(v.tall && drawerOpen);
  if (v.tall) root.querySelector('.cz-cr-props').innerHTML = propsLayout(v);
  else root.querySelector('.cz-cr-props').innerHTML = '';
  if (focused) root.querySelector(`[data-spot="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  sync();
}

/** Only the dice (while they tumble). */
function drawDice() {
  const g = root?.querySelector('.cz-cr-dice');
  if (!g) return;
  const v = view();
  const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  wrap.innerHTML = v.tall ? diceSVG(26, 622, 46, v) : diceSVG(948, 196, 40, v);
  g.replaceWith(wrap.firstElementChild);
}

function sync() {
  if (!ctx?.live) return;
  const s = bets?.total() ?? 0;
  ctx.setTotal(E.onTable(shown ?? table) + s); // while the dice roll, the table as it was
  ctx.setButtons({ action: !rolling, clear: !rolling && s > 0, undo: !rolling && s > 0, rebet: !rolling && s === 0 && Boolean(bets?.last?.length), label: 'Roll' });
  const numbered = Object.keys(table.bets).some((k) => /^(come|dc):\d+$/.test(k));
  ctx.setActions({
    odds: { hidden: !table.point && !numbered, disabled: rolling || !oddsTargets().length },
    center: { hidden: !tall(), pressed: drawerOpen, disabled: false },
  });
}

// ---- odds
const oddsKey = (k) => `${k}-odds`;
function oddsTargets() {
  const out = [];
  for (const k of ['pass', 'dp', ...PN.flatMap((n) => [`come:${n}`, `dc:${n}`])]) {
    const key = oddsKey(k);
    if (E.whyNot(table, key, staged())) continue;
    if (roomFor(key) > 0) out.push(key);
  }
  return out;
}
/** How much more odds `key` may take now (the bank and the multiple allow). */
function roomFor(key) {
  const lim = E.limits(table, key, ctx.stakes, staged());
  if (!lim) return 0;
  const cash = ctx.bank.balance - bets.total();
  return Math.max(0, Math.min(lim.max - (staged()[key] ?? 0), cash));
}
/** Fill the odds behind a line or come bet to the most allowed (a neat amount that pays whole dollars). */
function maxOdds(key, { quiet = false } = {}) {
  const have = (table.bets[key] ?? 0) + (staged()[key] ?? 0);
  const room = roomFor(key);
  if (room <= 0) {
    if (!quiet) { ctx.play('error'); ctx.message(`${E.betName(key)} is already at the most: ${money(have)}.`); }
    return false;
  }
  const want = E.neatOdds(table, key, have + room) - have;
  if (want <= 0) return false;
  bets.place(key, want);
  return true;
}
function allOdds() {
  if (rolling) return;
  const keys = oddsTargets();
  if (!keys.length) { ctx.play('error'); ctx.message('No line or come bet can take more odds right now.'); return; }
  let n = 0;
  for (const k of keys) if (maxOdds(k, { quiet: true })) n++;
  if (n) ctx.message(`Odds taken behind ${n === 1 ? E.betName(keys[0]).replace(/ odds$/, '') : `${n} bets`}. On the felt ${money(E.onTable(table) + bets.total())}.`);
}

// ---- clicks on the layout
function onSpot(key, sign) {
  if (rolling || !bets) return;
  if (sign > 0 && bets.removeMode) sign = -1;
  if (sign < 0) {
    if (bets.amount(key) > 0) { bets.remove(key); return; }
    return takeDownBet(key);
  }
  const s = staged();
  const opts = table.opts;
  // after the point, a click on a line bet backs it with odds (the most, with the option on;
  // without it a click on Pass adds to the line bet, and one on Don't Pass adds a chip of odds)
  if ((key === 'pass' || key === 'dp') && table.point && table.bets[key]) {
    if (opts.maxOdds) { maxOdds(oddsKey(key)); return; }
    if (key === 'dp') key = 'dp-odds';
  }
  if (opts.maxOdds && /^(come|dc):\d+-odds$/.test(key) && !E.whyNot(table, key, s)) { maxOdds(key); return; }
  const why = E.whyNot(table, key, s);
  if (why) { ctx.play('error'); ctx.message(why); return; }
  bets.place(key);
  const p = E.parseKey(key);
  if (p?.kind === 'place' && (p.n === 6 || p.n === 8)) {
    const total = (table.bets[key] ?? 0) + bets.amount(key);
    if (total % 6) ctx.toast('Place 6 and 8 in multiples of $6 so they pay in full.');
  }
}

function takeDownBet(key) {
  const k = table.bets[key] ? key : null;
  if (!k) { ctx.play('error'); ctx.message(`There is nothing on ${E.betName(key)} to take down.`); return; }
  const why = E.whyFixed(table, k);
  if (why) { ctx.play('error'); ctx.message(why); return; }
  const r = E.takeDown(table, k);
  table = r.state;
  ctx.refund(r.refund);
  ctx.setReturnable(E.returnable(table));
  ctx.play('chips');
  ctx.banner(null);
  ctx.message(`${r.keys.map(E.betName).join(' and ')} taken down: ${money(r.refund)} back to your bank.`);
  draw();
}

// ---- the roll
const ROLL_MS = 1000;
function action() {
  if (rolling || !bets) return;
  const s = staged();
  const total = bets.total();
  if (!total) { roll({}, 0, ctx.holdBank()); return; }
  const err = E.checkStaged(table, s, ctx.stakes, { mins: false });
  if (err) { ctx.play('error'); ctx.message(err); return; }
  const vig = E.vigFor(s);
  if (ctx.bank.balance < total + vig) {
    ctx.play('error');
    ctx.message(`Those bets need ${money(total + vig)} with the ${money(vig)} commission; the bank has ${money(ctx.bank.balance)}.`);
    return;
  }
  bets.commit((amounts, release) => {
    const v = E.vigFor(amounts);
    if (v && !ctx.wager(v)) {
      // the bank moved under us (another window): hand the bets back and stay put
      ctx.refund(Object.values(amounts).reduce((a, b) => a + b, 0));
      release();
      bets.release();
      bets.staging.set(amounts);
      ctx.message('The bank can\'t cover the commission on those bets.');
      draw();
      return;
    }
    roll(amounts, v, release);
  }, { hold: true });
}

function roll(amounts, vig, release) {
  let before;
  try { before = E.commit(table, amounts); } catch (e) {
    // checked before committing, so this shouldn't happen: hand everything back
    ctx.refund(Object.values(amounts).reduce((a, b) => a + b, 0) + vig);
    release();
    bets.release();
    ctx.play('error');
    ctx.message(e.message);
    return;
  }
  const d = E.rollDice(ctx.rng);
  const r = E.resolve(before, d);
  // settled now: a reload or leaving while the dice tumble never loses a payout
  const m = E.rollMoney(r, vig);
  if (m.settle) ctx.settle(m); else ctx.setReturnable(m.returnable);
  table = r.state;
  shown = before;
  rolling = true;
  hits = {};
  drawerOpen = false;
  ctx.cancel(bannerT);
  ctx.banner(null);
  bets.release();          // the staged chips are on the table now (redraws)
  ctx.play('shuffle');
  ctx.message(`${vig ? `${money(vig)} commission. ` : ''}Dice are rolling…`);
  done = { r, before, vig, release };
  if (ctx.reduced()) { finish(); return; }
  const start = performance.now();
  const step = () => {
    if (!rolling) return;
    frame = 3 - frame;
    tumble = E.rollDice(ctx.rng); // decoration only: the roll was decided before the dice left the hand
    drawDice();
    if (performance.now() - start < ROLL_MS) tick = ctx.after(90, step); else finish();
  };
  draw();
  step();
}

/** The dice have landed: show what was already settled. */
function finish() {
  const pend = done;
  done = null;
  if (!pend || !root) return;
  ctx.cancel(tick);
  const { r, before, vig, release } = pend;
  rolling = false;
  shown = null;
  dice = r.dice;
  hist = [r.total, ...hist].slice(0, 12);
  for (const o of r.outcomes) hits[o.key] = o.result === 'win' ? 'win' : o.result === 'lose' ? 'lose' : '';
  if (pendingOpts && table.point == null) { table = { ...table, opts: { ...table.opts, ...pendingOpts } }; pendingOpts = null; }
  release?.();
  draw();
  const net = r.returned - r.wagered - vig;
  const line = E.describe(r, before);
  ctx.message(`${line}${vig ? ` Commission ${money(vig)}.` : ''}`);
  const title = {
    natural: `${r.total} · Winner on the come-out`,
    craps: `${r.total} · Craps`,
    point: `Point is ${r.total}`,
    made: `${r.total} · Point made!`,
    sevenout: '7 · Seven out',
  }[r.event] ?? `${r.total} · ${E.rollName(r.dice)}`;
  const settled = r.outcomes.some((o) => o.result !== 'move' && o.result !== 'push');
  const detail = net > 0 ? `You win ${money(net)}` : net < 0 ? `You lose ${money(-net)}` : settled ? 'Even on this roll' : r.event === 'point' ? 'Roll it again before a 7' : 'No bets settled';
  ctx.banner(title, { tone: net > 0 ? 'win' : net < 0 ? 'lose' : 'info', detail });
  bannerT = ctx.after(ctx.reduced() ? 2500 : 1800, () => ctx.banner(null));
  ctx.play(net > 0 ? 'win' : net < 0 ? 'lose' : 'chips');
  ctx.checkBroke();
}

function rebet(times = 1) {
  if (rolling || !bets || bets.total()) return;
  const saved = bets.last;
  if (!saved?.length) return;
  const r = bets.staging.rebet(saved, times);
  if (!r.placed) { ctx.play('error'); ctx.message('None of your last bets can go down right now.'); bets.sync(); return; }
  ctx.play('chips');
  ctx.banner(null);
  ctx.message(`${times > 1 ? 'Double the' : 'Same'} bets again: ${money(bets.total())}${r.short ? ' (some of the last bets can\'t go down now, or the bank is short)' : ''}.`);
  bets.sync();
}

function toggleDrawer(on = !drawerOpen) {
  if (!tall()) return;
  drawerOpen = on;
  draw();
  if (on) root.querySelector('.cz-cr-drawer [data-spot]')?.focus({ preventScroll: true });
}

const onResize = () => { if (!tall()) drawerOpen = false; draw(); };

const settings = E.OPTIONS;

export default {
  id: 'craps',
  name: 'Craps',
  ready: true,
  css: 'css/casino/craps.css',
  layout,
  settings,
  minBuyIn: (stakes) => E.minBuyIn(stakes),
  howto: howtoSections([
    ['The idea', 'You are the shooter. Bet on the layout, then press <b>Roll</b>. Most bets are decided by whether a number comes up before a 7.'],
    ['The come-out and the point', '<p>The first roll of a round is the <b>come-out</b>. On the <b>Pass line</b>, 7 or 11 wins and 2, 3 or 12 (craps) loses. Any other total (4, 5, 6, 8, 9 or 10) becomes the <b>point</b>, and the puck flips to ON over that number.</p><p>Now keep rolling: the point again before a 7 and the Pass line wins; a 7 first is a <b>seven out</b> and it loses. Then the puck goes OFF and a new come-out begins.</p>'],
    ['Line bets', '<ul><li><b>Pass line</b> pays even money. Once a point is set it stays up until it is decided.</li><li><b>Don\'t pass</b> is the other side: 2 or 3 on the come-out wins, 12 is a tie, 7 or 11 loses; after the point, a 7 wins and the point loses. It goes down only before the come-out, and may be taken down any time.</li><li><b>Come</b> and <b>Don\'t come</b> work the same way but start on any roll while a point is on. After their first roll they travel to the number rolled, where you see them as a chip in the number\'s box.</li></ul>'],
    ['Odds', '<p>Once a line or come bet has a number, you can back it with <b>odds</b>. Odds pay the true chances, so the house has no edge on them at all: 2 to 1 on 4 and 10, 3 to 2 on 5 and 9, 6 to 5 on 6 and 8. Don\'t odds pay the other way round (1 to 2, 2 to 3, 5 to 6). Odds can be as much as the table\'s multiple (3 times the line bet unless you change it in Options); a don\'t bet\'s odds may <i>win</i> up to that multiple.</p><p>Click the <b>Pass line odds</b> strip or the Don\'t pass <b>Odds</b> box, click a come bet\'s chip on its number, or press <b>Max odds</b> (O) to back everything as far as it goes. Come odds are off on a come-out roll: if their bet is decided then, they come back to you.</p>'],
    ['Place, buy and lay', '<ul><li><b>Place</b> a number to win when it rolls before a 7: 4 and 10 pay 9 to 5, 5 and 9 pay 7 to 5, 6 and 8 pay 7 to 6 (bet 6 and 8 in sixes so they pay in full).</li><li><b>Buy</b> (the strip above a number) pays the true odds, but costs a 5% commission when it goes down ($1 at least), which isn\'t handed back.</li><li><b>Lay</b> (the top strip) bets that a 7 comes before the number, at true odds, with a 5% commission on what it would win.</li></ul><p>These go down while a point is on and stay up after they win. Place and buy bets are off on the come-out roll (unless you change that in Options); lays always work.</p>'],
    ['The field and the center', '<ul><li><b>Field</b>: one roll. 3, 4, 9, 10 or 11 pay even money, 2 pays double, 12 pays double (or triple, in Options); 5, 6, 7 and 8 lose.</li><li><b>Big 6</b> and <b>Big 8</b> pay even money if that number comes before a 7.</li><li><b>Hardways</b>: hard 4 or 10 pays 7 to 1, hard 6 or 8 pays 9 to 1, when the number rolls as a pair before it rolls the easy way or a 7.</li><li>One-roll bets: <b>Any seven</b> 4 to 1, <b>Any craps</b> (2, 3 or 12) 7 to 1, <b>Two</b> and <b>Twelve</b> 30 to 1, <b>Three</b> and <b>Eleven</b> 15 to 1. <b>C</b> and <b>E</b> are quick spots for Any craps and Eleven. The <b>Horn</b> splits into four equal bets on 2, 3, 11 and 12 (bet in fours).</li></ul><p>On a phone the center bets are in the <b>Center bets</b> drawer.</p>'],
    ['Placing and taking down', '<p>Pick a chip, then click or tap a spot to add it; chips you add sit on the layout with a dashed ring until you roll. Right-click, shift-click, a long press or Remove mode takes a chip back off before the roll, and on a bet already up it <b>takes the bet down</b> and hands it back. Pass line and come bets can\'t be taken down once they have a number; everything else can. Each bet must reach the table minimum, except odds.</p><p>If you leave in the middle of a point, every bet that could be taken down comes back to you; Pass line and come bets that have a number are lost.</p>'],
    ['Keys', 'Number keys 1 to 8 pick a chip. Tab moves through the betting spots; Enter or Space adds a chip, Shift+Enter takes one off (or takes the bet down). Enter or Space anywhere else rolls. <b>O</b> takes the most odds, <b>B</b> opens the center bets on a phone, Backspace undoes, C clears, R rebets and Shift+R rebets double.'],
    ['Good bets', 'The Pass line and Come cost you about 1.4% of what you bet, and Don\'t pass about 1.4% too; odds cost nothing, so they are the best bets on the table. Place 6 and 8 are close behind at 1.5%. The one-roll bets in the center cost 11% to 17%.'],
  ]),

  mount(el, c) {
    root = el; ctx = c;
    table = E.newTable(ctx.opts);
    shown = null; rolling = false; dice = null; hist = []; hits = {}; pendingOpts = null; drawerOpen = false; done = null;
    el.innerHTML = `<div class="cz-cr">
      <div class="cz-cr-table"></div>
      <div class="cz-cr-drawer" hidden role="group" aria-label="Center bets">
        <div class="cz-cr-drawer-head"><b>Center bets</b><span>hardways and one-roll bets</span><button type="button" class="btn sm" data-cr="close">Done</button></div>
        <div class="cz-cr-props"></div>
      </div></div>`;
    mq = matchMedia(TALL);
    mq.addEventListener('change', onResize);
    el.querySelector('[data-cr="close"]').addEventListener('click', () => toggleDrawer(false));
    ctx.actions([
      { id: 'odds', label: 'Max odds', key: 'o', title: 'Back every line and come bet with the most odds', run: allOdds },
      { id: 'center', label: 'Center bets', key: 'b', hidden: true, run: () => toggleDrawer() },
    ]);
    bets = ctx.bets({
      root: null, // spots are bound below, so a bet already up can be taken down from the same clicks
      spot: (key) => {
        if (rolling || !table) return null;
        const lim = E.limits(table, key, ctx.stakes, staged());
        return lim ? { label: E.betName(key), ...lim } : null;
      },
      validate: (amounts) => E.checkStaged(table, amounts, ctx.stakes, { mins: false }),
      onChange: () => { if (!rolling) { hits = {}; draw(); } },
      autoButtons: false,
    });
    unbind = bindSpots(el, 'data-spot', onSpot);
    draw();
    ctx.message(`Place your chips (${ctx.stakesText}), then Roll. The puck is OFF: this is the come-out roll.`);
  },
  unmount() {
    // a roll in progress was settled when it started: just drop the reveal
    if (tick) ctx?.cancel(tick);
    if (bannerT) ctx?.cancel(bannerT);
    done?.release?.();
    done = null; rolling = false;
    unbind?.(); unbind = null;
    mq?.removeEventListener('change', onResize);
    if (root) root.innerHTML = '';
    root = null; bets = null; table = null; shown = null;
  },
  action,
  rebet,
  optionsChanged(opts) {
    if (!table) return;
    if (table.point == null && !rolling) { table = { ...table, opts: { ...table.opts, ...opts } }; draw(); ctx.message('New options are in play.'); }
    else { pendingOpts = { ...opts }; ctx.message('New options apply from the next come-out roll.'); }
  },
};
