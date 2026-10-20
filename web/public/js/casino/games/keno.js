// Keno: mark one to ten numbers on the 80-number board, pick a ticket price and how many games in a
// row, and watch twenty balls come out of the blower. Played in dollars (ctx.wager / ctx.settle):
// each game is paid for when it starts and settled the moment its balls are drawn; the board and
// the tray only reveal it. Rules live in ../engines/keno.js (no DOM).
import { PAYS, MAX_SPOTS, MAX_GAMES, DRAWN, NUMBERS, pricesFor, play, quickPick, expectedReturn, pCatch } from '../engines/keno.js';
import { svg, rect, text, circle } from '../svg.js';
import { ART, svgArt } from '../art.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';

// ------------------------------------------------------------------ the board
// Wide screens: the board picture (1200 x 800) with 1-40 over 41-80 in its window, ten across.
// Phones: a code-drawn board eight across, so every number is a finger wide.
const WIDE = { W: 1200, H: 800, x: 94, y: 86, w: 1012, h: 586, cols: 10, gap: 12 };
const TALL = { W: 800, H: 1040, x: 36, y: 36, w: 728, h: 968, cols: 8, gap: 16 };

function cellClass(n, marks, drawn) {
  const mk = marks.has(n), dr = drawn.has(n);
  return `cz-kn-cell${mk ? ' mk' : ''}${dr ? ' dr' : ''}${mk && dr ? ' ct' : ''}`;
}

/** The number board. marks, drawn: numbers marked on the ticket and drawn so far. */
export function layout({ marks = [], drawn = [], tall = false } = {}) {
  const g = tall ? TALL : WIDE;
  const M = new Set(marks), Dr = new Set(drawn);
  const rows = NUMBERS / g.cols;
  const cw = g.w / g.cols, ch = (g.h - g.gap) / rows;
  const cells = Array.from({ length: NUMBERS }, (_, i) => {
    const n = i + 1, col = i % g.cols, row = Math.floor(i / g.cols);
    const x = g.x + col * cw, y = g.y + row * ch + (row >= rows / 2 ? g.gap : 0);
    const r = Math.min(cw, ch) * 0.4;
    return `<g data-n="${n}" class="${cellClass(n, M, Dr)}" role="button" tabindex="-1" aria-pressed="${M.has(n)}" aria-label="${n}">
      ${rect(x + 4, y + 4, cw - 8, ch - 8, { r: 8, cls: 'cz-kcell' })}${circle(x + cw / 2, y + ch / 2, r, { cls: 'cz-kn-ring' })}
      ${text(x + cw / 2, y + ch / 2, String(n), { size: tall ? 38 : 32, weight: 700, cls: 'cz-ktx' })}</g>`;
  }).join('');
  const frame = rect(10, 10, g.W - 20, g.H - 20, { r: 18, cls: 'cz-kframe' });
  const panel = rect(g.x, g.y, g.w, g.h, { cls: 'cz-kpanel' });
  const split = rect(g.x, g.y + g.h / 2 - 2, g.w, 4, { cls: 'cz-kn-split' });
  return svg(g.W, g.H, `${frame}${panel}${split}${cells}${tall ? '' : svgArt(ART.kenoBoard, 0, 0, g.W, g.H)}`,
    { label: 'Keno board: numbers 1 to 80. Click a number to mark it on your ticket.', cls: `cz-keno-board cz-kn-board${tall ? ' tall' : ''}` });
}

// ------------------------------------------------------------------ the blower and the tray
const ballSVG = (cx, cy, r, n, cls = '') => `<g class="cz-kn-ball${cls ? ` ${cls}` : ''}">${svgArt(ART.kenoBall, cx - r, cy - r, 2 * r, 2 * r, circle(cx, cy, r * 0.82, { cls: 'cz-kball' }))}${text(cx, cy + 1, String(n), { size: Math.round(r * 0.8), weight: 800, cls: 'cz-kball-tx' })}</g>`;

/** The blower with balls tumbling in its glass and the ball just drawn beside it. */
export function blower(current = null) {
  const tumble = [[150, 120, 7], [205, 150, 23], [120, 175, 41], [180, 205, 66], [235, 95, 12], [100, 120, 58], [225, 205, 79], [160, 70, 35]];
  const glass = circle(185, 135, 84, { cls: 'cz-kglass' });
  const inside = tumble.map(([x, y, n], i) => `<g class="cz-kn-tumble t${i % 4}">${ballSVG(x + 20, y, 18, n)}</g>`).join('');
  return svg(520, 300, `${svgArt(ART.kenoBlower, 20, 0, 330, 330, glass)}<g class="cz-kn-air">${inside}</g>${currentBall(current)}`, { label: 'The ball blower', cls: 'cz-kn-blower' });
}
/** The ball just drawn, big, beside the blower (and how many are out). */
const currentBall = (n, count = 0) => `<g class="cz-kn-current">${n ? `${ballSVG(430, 140, 64, n)}${text(430, 236, `Ball ${count} of ${DRAWN}`, { size: 20, weight: 700, cls: 'cz-kn-count' })}` : ''}</g>`;

/** The tray of drawn balls: twenty places, `cols` across. caught: the balls that hit the ticket. */
export function tray(balls = [], caught = [], cols = 10) {
  const C = new Set(caught), rows = DRAWN / cols;
  const slots = Array.from({ length: DRAWN }, (_, i) => {
    const cx = 30 + (i % cols) * 51, cy = 30 + Math.floor(i / cols) * 54;
    return balls[i] != null ? ballSVG(cx, cy, 23, balls[i], C.has(balls[i]) ? 'ct' : '') : circle(cx, cy, 20, { cls: 'cz-kn-slot' });
  }).join('');
  return svg(cols * 51 + 9, rows * 54 + 6, slots, { label: `Balls drawn: ${balls.length} of ${DRAWN}`, cls: `cz-kn-tray${cols < 10 ? ' narrow' : ''}` });
}

// ------------------------------------------------------------------ the ticket
function paysRows(spots, price, hit = null) {
  if (!spots) return '<tr><td colspan="2">Mark numbers to see what they pay.</td></tr>';
  return Object.entries(PAYS[spots]).sort((a, b) => b[0] - a[0]).map(([k, p]) =>
    `<tr data-catch="${k}"${Number(k) === hit ? ' class="lit"' : ''}><th scope="row">${k} of ${spots}</th><td>${money(p * price)}</td></tr>`).join('');
}

/** The ticket panel (HTML on keno paper). */
export function ticket({ spots = 0, price = 1, prices = [1], games = 1, hit = null } = {}) {
  return `<section class="cz-kn-ticket" aria-label="Your ticket">
    <h3>Ticket</h3>
    <p class="cz-kn-spots">Spots marked <b data-k="spots">${spots}</b> of ${MAX_SPOTS}</p>
    <div class="cz-kn-line"><span>Price</span><div class="cz-kn-prices" role="radiogroup" aria-label="Ticket price">${prices.map((p) =>
    `<button type="button" class="cz-kn-chip${p === price ? ' on' : ''}" data-price="${p}" role="radio" aria-checked="${p === price}">${money(p)}</button>`).join('')}</div></div>
    <div class="cz-kn-line"><span>Games</span><div class="cz-kn-games"><button type="button" class="cz-kn-step" data-games="-1" aria-label="Fewer games">−</button><b data-k="games">${games}</b><button type="button" class="cz-kn-step" data-games="1" aria-label="More games">+</button></div></div>
    <p class="cz-kn-total">Total <b data-k="total">${money(price * games)}</b></p>
    <table class="cz-kn-pays"><caption>Pays on a ${money(price)} ticket</caption><tbody data-k="pays">${paysRows(spots, price, hit)}</tbody></table>
  </section>`;
}

/** Everything at once, for drawing without a browser. */
export const stage = ({ marks = [], tall = false, price = 1, prices = [1], games = 1 } = {}) => `<div class="cz-keno cz-kn">${layout({ marks, tall })}
  <div class="cz-kn-side"><div class="cz-kn-drawcol">${blower()}${tray([], [], tall ? 10 : 5)}</div>${ticket({ spots: marks.length, price, prices, games })}</div></div>`;

// ------------------------------------------------------------------ playing
const PHONE = '(max-width: 640px)';
const SPEED = { slow: 250, normal: 120, instant: 0 };
let root = null, ctx = null, mq = null;
let marks = [];               // the ticket, in the order marked (Undo takes the last)
let price = null, games = 1;  // remembered between visits
let drawing = null;           // { result, shown, finish() } while balls come out
let run = null;               // { total, played, stop } while a run of games is on
let last = null;              // the last game's result, still shown on the board
let tick = null;

const $ = (s) => root?.querySelector(s);
const prices = () => pricesFor(ctx?.stakes.denom ?? 1);
const busy = () => Boolean(drawing || run);

function paintBoard() {
  if (!root) return;
  const M = new Set(marks), Dr = new Set(drawing ? drawing.result.balls.slice(0, drawing.shown) : last?.balls ?? []);
  root.querySelectorAll('[data-n]').forEach((g) => {
    const n = Number(g.dataset.n);
    g.setAttribute('class', cellClass(n, M, Dr));
    g.setAttribute('aria-pressed', String(M.has(n)));
  });
}
function paintTicket() {
  if (!root) return;
  const set = (k, v) => { const e = $(`[data-k="${k}"]`); if (e) e.innerHTML = v; };
  const res = drawing ? null : last;
  set('spots', String(marks.length));
  set('games', String(games));
  set('total', money(price * games));
  set('pays', paysRows(marks.length, price, res && res.spots === marks.length && res.perOne ? res.catches : null));
  const cap = $('.cz-kn-pays caption');
  if (cap) cap.textContent = `Pays on a ${money(price)} ticket`;
  root.querySelectorAll('[data-price]').forEach((b) => { const on = Number(b.dataset.price) === price; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.disabled = busy(); });
  root.querySelectorAll('[data-games]').forEach((b) => { b.disabled = busy() || (b.dataset.games === '1' ? games >= MAX_GAMES : games <= 1); });
  ctx.setTotal(price * games);
}
function paintDraw() {
  if (!root) return;
  const balls = drawing ? drawing.result.balls.slice(0, drawing.shown) : last?.balls ?? [];
  const caught = (drawing ? drawing.result : last)?.caught ?? [];
  $('.cz-kn-tray').outerHTML = tray(balls, caught, mq?.matches ? 10 : 5);
  const cur = drawing && drawing.shown ? balls[balls.length - 1] : null;
  const g = $('.cz-kn-current');
  if (g) g.outerHTML = currentBall(cur, balls.length);
  if (drawing && drawing.shown && !ctx.reduced()) $('.cz-kn-tray .cz-kn-ball:last-of-type')?.classList.add('new');
}
function paintButtons() {
  if (!ctx) return;
  const n = marks.length;
  ctx.setButtons({ action: drawing ? true : !run && n > 0, clear: !busy() && n > 0, undo: !busy() && n > 0, rebet: false, label: drawing ? 'Show all' : 'Play' });
  ctx.setActions({ quick: !busy(), erase: !busy() && n > 0, stop: { hidden: !run || run.total < 2, disabled: !run || run.stop } });
}
function paintAll() { paintBoard(); paintTicket(); paintDraw(); paintButtons(); }

/** A ticket change: the last game's balls come off the board. */
function changed() {
  if (last) { last = null; ctx.banner(null); paintDraw(); }
  paintBoard(); paintTicket(); paintButtons();
}

function toggle(n) {
  if (run) {
    if (!run.stop) { run.stop = true; paintButtons(); ctx.message('The ticket is in play. The run stops after this game; then you can change it.'); }
    return;
  }
  if (drawing) return;
  const i = marks.indexOf(n);
  if (i >= 0) marks.splice(i, 1);
  else if (marks.length >= MAX_SPOTS) { ctx.play('error'); ctx.message(`A ticket has at most ${MAX_SPOTS} spots. Click a marked number to take it off.`); return; }
  else marks.push(n);
  ctx.play('click');
  changed();
  spotsMessage();
}
function spotsMessage() {
  const n = marks.length;
  if (!n) { ctx.message(`Mark one to ${MAX_SPOTS} numbers, or Quick pick. Then Play.`); return; }
  const top = Math.max(...Object.values(PAYS[n]));
  ctx.message(`${n} spot${n > 1 ? 's' : ''} marked. Catch ${n > 1 ? `all ${n}` : 'it'} and a ${money(price)} ticket pays ${money(top * price)}.`);
}

function quick() {
  if (busy()) return;
  const n = marks.length || Number(ctx.opts.autoPick) || 5;
  marks = quickPick(n, ctx.rng);
  ctx.play('shuffle');
  changed();
  spotsMessage();
}
function erase() {
  if (busy() || !marks.length) return;
  marks = [];
  ctx.play('click');
  changed();
  spotsMessage();
}
function undo() {
  if (busy() || !marks.length) return;
  marks.pop();
  changed();
  spotsMessage();
}

function action() {
  if (!ctx) return;
  if (drawing) { drawing.finish(); return; }
  if (run || !marks.length) { if (!marks.length) spotsMessage(); return; }
  run = { total: games, played: 0, stop: false };
  next();
}

/** Start the next game of the run: pay for it, draw and settle at once, then reveal. */
function next() {
  if (!ctx?.live || !run) return;
  if (run.played >= run.total || run.stop) { endRun(); return; }
  if (!ctx.wager(price)) {
    ctx.play('error');
    ctx.message(run.played ? `The bank can't cover another ${money(price)} game. The run stops here.` : `The bank can't cover a ${money(price)} ticket.`);
    endRun(true);
    return;
  }
  run.played++;
  const result = play([...marks].sort((a, b) => a - b), price, ctx.rng);
  const release = ctx.holdBank(); // before settling, so the pill keeps the figure from before the draw
  ctx.settle({ returned: result.returned });
  ctx.banner(null);
  last = null;
  const ms = ctx.reduced() ? 0 : SPEED[ctx.opts.speed] ?? SPEED.normal;
  const label = run.total > 1 ? `Game ${run.played} of ${run.total}: ` : '';
  ctx.message(`${label}drawing…`);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    if (tick) { ctx.cancel(tick); tick = null; }
    drawing = null;
    last = result;
    release();
    reveal(result, label);
  };
  drawing = { result, shown: 0, finish };
  paintAll();
  if (!ms) { finish(); return; }
  const step = () => {
    tick = null;
    if (!drawing || drawing.result !== result) return;
    drawing.shown++;
    const ball = result.balls[drawing.shown - 1];
    const hit = marks.includes(ball);
    ctx.play(hit ? 'score' : 'bubble');
    paintBoard(); paintDraw();
    if (drawing.shown >= DRAWN) { tick = ctx.after(250, finish); return; }
    tick = ctx.after(ms, step);
  };
  tick = ctx.after(Math.min(ms, 200), step);
}

function reveal(r, label) {
  if (!ctx?.live) return;
  paintAll();
  const caught = `Caught ${r.catches} of ${r.spots}`;
  if (r.returned > r.wagered) {
    ctx.play('win');
    ctx.banner(`${caught} · You win ${money(r.returned - r.wagered)}`, { tone: 'win', detail: `${money(r.returned)} back on a ${money(r.wagered)} ticket` });
  } else if (r.returned) {
    ctx.play('chips');
    ctx.banner(`${caught} · Ticket back`, { tone: 'push', detail: `${money(r.returned)} back` });
  } else {
    ctx.play('lose');
    ctx.banner(caught, { tone: 'lose', detail: `The ${money(r.wagered)} ticket loses` });
  }
  const more = run && run.played < run.total && !run.stop;
  ctx.message(`${label}${caught}${r.catches ? ` (${r.caught.join(', ')})` : ''}. ${r.returned ? `Pays ${money(r.returned)}.` : 'No pay.'}${more ? ` Next game in a moment (${run.total - run.played} left).` : ''}`);
  if (more) tick = ctx.after(ctx.reduced() ? 700 : 1600, next);
  else endRun();
}

function endRun(broke = false) {
  const wasRun = run && run.total > 1;
  const played = run?.played ?? 0;
  run = null;
  if (!ctx?.live) return;
  paintAll();
  if (wasRun && !broke && played) ctx.toast(`Run over: ${played} game${played > 1 ? 's' : ''} played.`);
  ctx.checkBroke();
}

function redrawBoard() {
  if (!root) return;
  const at = $('.cz-kn-board');
  if (at) at.outerHTML = layout({ marks, tall: mq?.matches });
  paintBoard(); paintDraw();
}

function onClick(e) {
  const cell = e.target.closest?.('[data-n]');
  if (cell) { toggle(Number(cell.dataset.n)); return; }
  const p = e.target.closest?.('[data-price]');
  if (p && !busy()) { price = Number(p.dataset.price); ctx.play('click'); paintTicket(); spotsMessage(); return; }
  const g = e.target.closest?.('[data-games]');
  if (g && !busy()) { games = Math.max(1, Math.min(MAX_GAMES, games + Number(g.dataset.games))); ctx.play('click'); paintTicket(); ctx.message(`${games} game${games > 1 ? 's' : ''} in a row, ${money(price)} each: ${money(price * games)} in all, paid one game at a time.`); }
}

// Arrow keys move along the board; Enter or Space marks the number under the focus.
function onKey(e) {
  const cell = e.target.closest?.('[data-n]');
  if (!cell) return;
  const n = Number(cell.dataset.n), cols = mq?.matches ? TALL.cols : WIDE.cols;
  const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[e.key];
  if (move) {
    e.preventDefault(); e.stopPropagation();
    const to = Math.min(NUMBERS, Math.max(1, n + move));
    root.querySelectorAll('[data-n]').forEach((c) => c.setAttribute('tabindex', '-1'));
    const t = root.querySelector(`[data-n="${to}"]`);
    t.setAttribute('tabindex', '0'); t.focus();
  } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggle(n); }
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export default {
  id: 'keno',
  name: 'Keno',
  ready: true,
  credits: false,
  css: 'css/casino/keno.css',
  layout,
  stage,
  minBuyIn: (stakes) => stakes.denom ?? stakes.min,
  settings: [
    { key: 'speed', label: 'Drawing speed', type: 'select', options: [['slow', 'Relaxed (4 balls a second)'], ['normal', 'Quick (8 balls a second)'], ['instant', 'Instant']], default: 'normal' },
    { key: 'autoPick', label: 'Quick pick on an empty ticket marks', type: 'select', options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, `${n} number${n > 1 ? 's' : ''}`]), default: 5 },
  ],
  howto: howtoSections([
    ['Play', `Mark from one to ${MAX_SPOTS} numbers (spots) on the board, or press Quick pick. Choose a ticket price and how many games in a row to play with the same ticket, then press Play. Each game, ${DRAWN} of the ${NUMBERS} balls come out of the blower; every one of your numbers among them is a catch.`],
    ['Payouts', `<p>What a ticket pays depends on how many spots you marked and how many you catch. Pays below are for a $1 ticket and include the dollar (so "1" gives your ticket back); a dearer ticket pays in proportion.</p><ul>${Object.entries(PAYS).map(([n, t]) =>
      `<li>${n} spot${n > 1 ? 's' : ''}: ${Object.entries(t).map(([k, p]) => `catch ${k} pays ${p.toLocaleString('en-US')}`).join(', ')}</li>`).join('')}</ul>`],
    ['Odds', `Fewer spots win more often but pay less; the return is about the same either way: ${Object.keys(PAYS).map((n) => `${n} spot${n > 1 ? 's' : ''} ${pct(expectedReturn(Number(n)))}`).join(', ')}. A one-spot ticket catches one game in ${(1 / pCatch(1, 1)).toFixed(0)}; catching all ten of ten happens about once in ${Math.round(1 / pCatch(10, 10)).toLocaleString('en-US')} games.`],
    ['Games in a row', `Play up to ${MAX_GAMES} games with one ticket. Each game is paid for when it starts, so stopping or leaving between games costs nothing more. Changing the ticket or pressing Stop ends the run after the game being drawn.`],
    ['Keys', 'Enter or Space plays (and, while balls are coming out, shows them all at once). Q quick picks, E erases the ticket, Backspace takes off the last number marked, S stops a run. On the board, arrow keys move and Enter or Space marks a number.'],
    ['Options', 'Drawing speed (relaxed, quick or instant) and how many numbers Quick pick marks on an empty ticket. Reduced motion shows the draw at once.'],
  ]),

  mount(el, c) {
    root = el; ctx = c;
    drawing = null; run = null; last = null; tick = null;
    if (!prices().includes(price)) price = prices()[0];
    mq = matchMedia(PHONE);
    el.innerHTML = stage({ marks, tall: mq.matches, price, prices: prices(), games });
    const paper = $('.cz-kn-ticket');
    if (paper) paper.style.backgroundImage = `url(${ART.kenoPaper})`;
    root.querySelector('[data-n="1"]')?.setAttribute('tabindex', '0');
    mq.addEventListener('change', redrawBoard);
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    ctx.showRack(false);
    ctx.actions([
      { id: 'quick', label: 'Quick pick', key: 'q', run: quick },
      { id: 'erase', label: 'Erase', key: 'e', run: erase },
      { id: 'stop', label: 'Stop run', key: 's', hidden: true, run: () => { if (run && !run.stop) { run.stop = true; paintButtons(); ctx.message('The run stops after this game.'); } } },
    ]);
    paintAll();
    spotsMessage();
  },
  unmount() {
    // a game being drawn was settled when it started: just drop the reveal and the rest of the run
    if (tick) ctx?.cancel(tick);
    drawing = null; run = null; last = null; tick = null;
    mq?.removeEventListener('change', redrawBoard); mq = null;
    if (root) { root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root.innerHTML = ''; }
    root = null; ctx = null;
  },
  action,
  clear: erase,
  undo,
  rebet() {},
};
