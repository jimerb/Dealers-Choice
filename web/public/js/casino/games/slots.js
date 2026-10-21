// Slots: the Brass Crown machine. Three reels, one pay line, one to three coins, played on the
// machine's credits (ctx.machine). Rules and the reel strips live in ../engines/slots.js (no DOM).
//
// The cabinet picture has see-through windows; under it the code draws the pay table on the glass,
// the three reels (every stop of each strip as a column of symbol pictures that slides behind its
// window) and the WIN / COINS / CREDITS meters; over it, the pay line and the deck buttons.
// A spin is decided and paid onto the meter the moment Spin is pressed; the reels only reveal it.
import { STRIPS, STOPS, MAX_COINS, SYMBOLS, PAY_ROWS, rowPay, spin, describe, exactReturn } from '../engines/slots.js';
import { svg, rect, text, path, esc } from '../svg.js';
import { ART, svgArt } from '../art.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';

/** "1 credit", "1,250 credits". */
const cr = (n) => `${Number(n).toLocaleString('en-US')} credit${n === 1 ? '' : 's'}`;
// The cabinet picture is 800 x 1200; its windows in those units.
const W = 800, H = 1200;
const GLASS = { x: 117, y: 86, w: 566, h: 305 };   // pay table
const REEL = { x: 133, y: 469, w: 534, h: 304 };   // three reels
const METER = { x: 133, y: 805, w: 534, h: 62 };   // win, coins, credits
const DECK = { y: 898, h: 110 };                   // the button deck
const GAP = 8;
const RW = (REEL.w - 2 * GAP) / 3, RH = REEL.h / 3;
const LINE_Y = REEL.y + REEL.h / 2;
const COL_X = [GLASS.x + 350, GLASS.x + 432, GLASS.x + 514];
const ROW_Y = (i) => GLASS.y + 64 + i * 24.5;
const fmt = (n) => n.toLocaleString('en-US');
const reelX = (i) => REEL.x + i * (RW + GAP);

/** The strip group's offset that puts (fractional) stop `p` on the pay line. */
const stripY = (p) => REEL.y - (p + 1) * RH;
const wrap = (p) => ((p % STOPS) + STOPS) % STOPS;

/** One reel: every stop of the strip, plus two more at each end so the window always has neighbours. */
function reelStrip(i) {
  const x = reelX(i), size = RH * 0.84;
  let out = '';
  for (let k = -2; k < STOPS + 2; k++) {
    const sym = STRIPS[i][wrap(k)], cy = (k + 2.5) * RH;
    if (sym === '-') { out += `<rect x="${(x + RW * 0.22).toFixed(1)}" y="${(cy - 5).toFixed(1)}" width="${(RW * 0.56).toFixed(1)}" height="10" rx="5" class="cz-reel-blank"/>`; continue; }
    const fallback = text(x + RW / 2, cy, SYMBOLS[sym].name, { size: 22, weight: 700, cls: 'cz-reel-tx' });
    out += svgArt(ART.symbol(SYMBOLS[sym].art), x + (RW - size) / 2, cy - size / 2, size, size, fallback);
  }
  return out;
}

const deckButton = (id, label, x, hot = false) => `<g class="cz-sl-btn${hot ? ' hot' : ''}" data-sl="${id}" role="button" tabindex="0" aria-label="${esc(label)}">
  ${rect(x - 70, DECK.y + 28, 140, 54, { r: 27, cls: hot ? 'cz-mbtn hot' : 'cz-mbtn' })}${text(x, DECK.y + 55, label.toUpperCase(), { size: 18, weight: 800, cls: 'cz-mbtn-tx' })}</g>`;

/**
 * The machine as SVG. coins: the coins bet (its column lights on the glass); win, credits: the
 * meters; lit: the pay-table row to light; stops: the stop on the pay line of each reel.
 */
export function layout({ coins = 1, win = 0, credits = 0, lit = null, stops = [0, 11, 22] } = {}) {
  // the glass: the pay table, one column per coin count
  const col = rect(COL_X[coins - 1] - 38, GLASS.y + 10, 76, ROW_Y(PAY_ROWS.length - 1) - GLASS.y + 4, { r: 8, cls: 'cz-sl-col' });
  const head = text(GLASS.x + 24, GLASS.y + 30, 'BRASS CROWN', { size: 24, weight: 800, anchor: 'start', cls: 'cz-mtx' })
    + COL_X.map((x, i) => text(x, GLASS.y + 30, `${i + 1} COIN${i ? 'S' : ''}`, { size: 14, weight: 800, cls: `cz-mtx${i + 1 === coins ? ' hot' : ' dim'}`, attrs: `data-colhead="${i + 1}"` })).join('');
  const rows = PAY_ROWS.map((r, i) => {
    const y = ROW_Y(i);
    return `${rect(GLASS.x + 10, y - 12, GLASS.w - 20, 24, { r: 5, cls: `cz-sl-row${r.key === lit ? ' lit' : ''}`, attrs: `data-row="${r.key}"` })}
      ${text(GLASS.x + 24, y, r.label, { size: 19, anchor: 'start', cls: 'cz-mtx' })}
      ${[1, 2, 3].map((c) => text(COL_X[c - 1], y, fmt(rowPay(r.key, c)), { size: 19, weight: 700, cls: `cz-mtx${r.key === 'WWW' && c === 3 ? ' hot' : ''}` })).join('')}`;
  }).join('');
  const foot = text(W / 2, GLASS.y + GLASS.h - 22, 'Crowns are wild (not for cherries): one doubles a win, two pay x4', { size: 15, cls: 'cz-mtx dim' });
  const glass = `${rect(GLASS.x, GLASS.y, GLASS.w, GLASS.h, { cls: 'cz-mscreen' })}${col}${head}${rows}${foot}`;

  // the reels: a cream band, a glow behind the pay-line stop, and the sliding strip, clipped to the window
  const clips = [0, 1, 2].map((i) => `<clipPath id="cz-sl-clip${i}"><rect x="${reelX(i).toFixed(1)}" y="${REEL.y}" width="${RW.toFixed(1)}" height="${REEL.h}"/></clipPath>`).join('');
  const reels = [0, 1, 2].map((i) => `${rect(reelX(i), REEL.y, RW, REEL.h, { cls: 'cz-reel' })}
    ${rect(reelX(i) + 4, LINE_Y - RH / 2 + 3, RW - 8, RH - 6, { r: 10, cls: 'cz-sl-hit', attrs: `data-hit="${i}"` })}
    <g clip-path="url(#cz-sl-clip${i})" class="cz-sl-reel" data-reel="${i}"><g class="cz-sl-strip" transform="translate(0 ${stripY(stops[i]).toFixed(1)})">${reelStrip(i)}</g></g>`).join('');
  const shade = `<linearGradient id="cz-reel-sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".42"/>
    <stop offset=".22" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient>`;
  const shadeRect = `<rect x="${REEL.x}" y="${REEL.y}" width="${REEL.w}" height="${REEL.h}" fill="url(#cz-reel-sh)" class="cz-reel-shade"/>`;

  // the meters
  const mw = METER.w / 3;
  const meters = [['win', 'WIN', win], ['coins', 'COINS', coins], ['credits', 'CREDITS', credits]].map(([id, label, v], i) => `${rect(METER.x + i * mw + 4, METER.y + 4, mw - 8, METER.h - 8, { r: 6, cls: 'cz-mscreen' })}
    ${text(METER.x + i * mw + mw / 2, METER.y + 19, label, { size: 13, weight: 700, cls: 'cz-mtx dim' })}${text(METER.x + i * mw + mw / 2, METER.y + 42, fmt(v), { size: 24, weight: 800, cls: 'cz-mtx', attrs: `data-m="${id}"` })}`).join('');

  // over the picture: the pay line (and its win tag) and the deck buttons
  const payline = path(`M${REEL.x - 8} ${LINE_Y} H${REEL.x + REEL.w + 8}`, { cls: 'cz-payline' });
  const tag = `<g class="cz-sl-tag" hidden>${rect(W / 2 - 90, REEL.y + REEL.h - 50, 180, 40, { r: 20, cls: 'cz-sl-tagbg' })}${text(W / 2, REEL.y + REEL.h - 30, '', { size: 22, weight: 800, cls: 'cz-sl-tagtx' })}</g>`;
  const deck = deckButton('one', 'Bet one', 240) + deckButton('max', 'Bet max', 400) + deckButton('spin', 'Spin', 560, true);
  const cabinet = rect(80, 60, 640, 1100, { r: 60, cls: 'cz-cabinet' });
  return svg(W, H, `<defs>${clips}${shade}</defs>${cabinet}${glass}${reels}${shadeRect}${meters}${svgArt(ART.slotCabinet, 0, 0, W, H)}${payline}${tag}${deck}`,
    { label: 'Brass Crown slot machine: pay table, three reels with one pay line, win, coin and credit meters', cls: 'cz-machine cz-cab cz-sl' });
}

/** The pay table again as a readable card beside the machine (wide screens only). */
export function payCard(coins = 1, lit = null) {
  const th = [1, 2, 3].map((c) => `<th scope="col" data-c="${c}"${c === coins ? ' class="on"' : ''}>${c} coin${c > 1 ? 's' : ''}</th>`).join('');
  const rows = PAY_ROWS.map((r) => `<tr data-row="${r.key}"${r.key === lit ? ' class="lit"' : ''}><th scope="row">${esc(r.label)}</th>${[1, 2, 3].map((c) => `<td data-c="${c}"${c === coins ? ' class="on"' : ''}>${fmt(rowPay(r.key, c))}</td>`).join('')}</tr>`).join('');
  return `<aside class="cz-sl-card" aria-label="Pay table"><h3>Pays</h3><table><thead><tr><th></th>${th}</tr></thead><tbody>${rows}</tbody></table>
    <p>Crowns are wild for everything but cherries: one crown doubles a win, two pay four times.</p></aside>`;
}

// ------------------------------------------------------------------ the machine at play
let root = null, ctx = null, meterRelease = null;
let coins = 1;                 // remembered between visits
let pos = [0, 11, 22];         // the stop on the pay line of each reel (fractional while spinning)
let spinning = null;           // { result, finish() } while the reels turn
let auto = 0;                  // spins left in an autoplay run
let shownCredits = null;       // the credits the meters show while a result is being revealed
let frame = 0, countT = null;

// Phones show the reels, meters and deck only, so the machine fits above the bet bar; the pay
// card (hidden beside the full cabinet on mid-size screens) shows under it instead.
const PHONE = '(max-width: 640px)';
let mq = null;
function fit() {
  const s = root?.querySelector('.cz-sl');
  if (!s) return;
  const small = mq?.matches;
  s.setAttribute('viewBox', small ? `0 ${REEL.y - 40} ${W} ${DECK.y + DECK.h + 20 - (REEL.y - 40)}` : `0 0 ${W} ${H}`);
  s.classList.toggle('crop', Boolean(small));
}

const FAST = { normal: [600, 800, 1000], fast: [200, 300, 400] };
const $ = (sel) => root?.querySelector(sel);
const credits = () => ctx?.machine?.credits ?? 0;

function setMeter(id, v) { const t = $(`[data-m="${id}"]`); if (t) t.textContent = fmt(v); }
function paintMeters({ win } = {}) {
  if (!root) return;
  setMeter('coins', coins);
  setMeter('credits', shownCredits ?? credits());
  if (win != null) setMeter('win', win);
}
function paintCoins() {
  if (!root) return;
  const c = $('.cz-sl-col');
  if (c) c.setAttribute('x', (COL_X[coins - 1] - 38).toFixed(1));
  root.querySelectorAll('[data-colhead]').forEach((t) => t.setAttribute('class', `cz-mtx${Number(t.dataset.colhead) === coins ? ' hot' : ' dim'}`));
  root.querySelectorAll('.cz-sl-card [data-c]').forEach((t) => t.classList.toggle('on', Number(t.dataset.c) === coins));
  ctx?.setTotal(coins * (ctx.machine?.denom ?? 1));
  paintMeters();
}
function setLit(key) {
  root?.querySelectorAll('.cz-sl-row, .cz-sl-card tr[data-row]').forEach((r) => r.classList.toggle('lit', r.dataset.row === key));
}
function setHits(reels) {
  root?.querySelectorAll('.cz-sl-hit').forEach((r) => r.classList.toggle('on', reels.includes(Number(r.dataset.hit))));
  $('.cz-payline')?.classList.toggle('win', reels.length > 0);
}
function setTag(label) {
  const g = $('.cz-sl-tag');
  if (!g) return;
  g.hidden = !label;
  if (label) g.querySelector('text').textContent = label;
}
function placeReel(i, p) {
  const g = root?.querySelector(`[data-reel="${i}"] .cz-sl-strip`);
  if (g) g.setAttribute('transform', `translate(0 ${stripY(wrap(p)).toFixed(1)})`);
}

function setButtons() {
  if (!ctx) return;
  const busy = Boolean(spinning);
  ctx.setButtons({ action: true, clear: false, rebet: false, undo: false, label: auto > 0 || (busy && auto) ? 'Stop' : 'Spin' });
  ctx.setActions({ one: !busy && !auto, max: !busy && !auto && coins < MAX_COINS, playmax: !busy && !auto });
}

function betOne() {
  if (spinning || auto) return;
  coins = coins >= MAX_COINS ? 1 : coins + 1;
  ctx.play('click');
  paintCoins(); setButtons();
  ctx.message(`${coins} coin${coins > 1 ? 's' : ''} bet (${money(coins * ctx.machine.denom)} a spin).${coins === MAX_COINS ? ' The third coin pays 3,200 for three crowns.' : ''}`);
}
function betMax() {
  if (spinning || auto) return;
  coins = MAX_COINS;
  ctx.play('click');
  paintCoins(); setButtons();
  ctx.message(`Three coins bet (${money(coins * ctx.machine.denom)} a spin): three crowns pay 3,200.`);
}

/** Spin (or, while the reels turn, stop them at once; during autoplay, stop the run). */
function action() {
  if (!ctx) return;
  if (auto > 0 && spinning) { auto = 0; setButtons(); ctx.message('Autoplay stopped.'); return; }
  if (spinning) { spinning.finish(); return; }
  if (auto > 0) { auto = 0; setButtons(); return; }
  const run = Number(ctx.opts.autoplay) || 0;
  if (run > 1) auto = run;
  go();
}

function go() {
  if (!ctx?.live) return;
  if (countT) { ctx.cancel(countT); countT = null; }
  ctx.banner(null);
  if (!ctx.machine.bet(coins)) { auto = 0; setButtons(); return; }
  // decided and paid now; the reels only show it
  const r = spin(ctx.rng, coins);
  const before = credits();
  // the shell's meter (and Cash out) wait for the reels, as the cabinet's meters do
  meterRelease = ctx.machine.hold();
  ctx.machine.pay(r.won);
  shownCredits = before;
  if (auto > 0) auto--;
  setLit(null); setHits([]); setTag('');
  paintMeters({ win: 0 });
  ctx.play('deal');
  ctx.message(auto > 0 ? `Spinning… autoplay, ${auto} more after this.` : 'Spinning…');
  turn(r);
}

/** Turn the reels to the result's stops, left to right, then show the result. */
function turn(r) {
  const times = ctx.reduced() ? [0, 120, 240] : FAST[ctx.opts.speed === 'fast' ? 'fast' : 'normal'];
  const reduced = ctx.reduced();
  const start = pos.map((p) => Math.round(wrap(p)));
  const dist = r.stops.map((t, i) => (reduced ? 0 : (i + 1) * STOPS) + wrap(start[i] - t));
  const stopped = [false, false, false];
  const t0 = performance.now();
  const ease = (u) => 1 - (1 - u) ** 3;
  const stopReel = (i) => {
    if (stopped[i]) return;
    stopped[i] = true;
    pos[i] = r.stops[i];
    placeReel(i, pos[i]);
    ctx.play('click');
  };
  const finish = () => {
    cancelAnimationFrame(frame);
    for (let i = 0; i < 3; i++) stopReel(i);
    spinning = null;
    reveal(r);
  };
  spinning = { result: r, finish };
  setButtons();
  const tick = (now) => {
    if (!root || spinning?.result !== r) return;
    const t = now - t0;
    for (let i = 0; i < 3; i++) {
      if (stopped[i]) continue;
      const T = times[i];
      if (t >= T) { stopReel(i); continue; }
      if (reduced) continue;   // reduced motion: the reels jump to their stops, one after another
      const u = t / T, over = 0.35;
      // run on a little past the stop, then settle back onto it
      const p = u < 0.86 ? ease(u / 0.86) * (dist[i] + over) : dist[i] + over * (1 - (u - 0.86) / 0.14);
      pos[i] = start[i] - p;
      placeReel(i, pos[i]);
    }
    if (stopped.every(Boolean)) finish();
    else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

/** The reels have stopped: light the row and the line, count the win onto the meters. */
function reveal(r) {
  if (!ctx?.live) return;
  const bet = r.coins;
  const after = credits();
  const hits = !r.row ? [] : r.row.startsWith('R') ? r.line.map((s, i) => (s === 'R' ? i : -1)).filter((i) => i >= 0) : [0, 1, 2];
  setLit(r.row); setHits(hits);
  const words = describe(r);
  const settle = () => {
    shownCredits = null;
    paintMeters({ win: r.won });
    meterRelease?.(); meterRelease = null;
    setButtons();
    next();
  };
  if (r.won) {
    setTag(`WIN ${fmt(r.won)}`);
    ctx.play('win');
    const big = r.won >= 20 * bet;
    ctx.message(`${words}: ${fmt(r.won)} credit${r.won > 1 ? 's' : ''} (${money(r.won * ctx.machine.denom)}).`);
    if (big) ctx.banner(r.row === 'WWW' ? 'Three crowns!' : `You win ${cr(r.won)}`, { tone: 'win', detail: `${words} on ${bet} coin${bet > 1 ? 's' : ''}: ${money(r.won * ctx.machine.denom)}` });
    if (big && auto) { auto = 0; ctx.message(`${words}: ${cr(r.won)}. Autoplay stopped on the big win.`); }
    // count the win up onto the meters (quickly; at once under reduced motion)
    const from = shownCredits ?? after - r.won;
    const steps = ctx.reduced() ? 1 : Math.min(r.won, 24);
    let k = 0;
    const step = () => {
      k++;
      const v = Math.round((r.won * k) / steps);
      setMeter('win', v);
      setMeter('credits', from + v);
      if (k < steps) countT = ctx.after(Math.max(16, Math.min(60, 900 / steps)), step);
      else settle();
    };
    step();
  } else {
    ctx.message(auto > 0 ? `No win. Autoplay: ${auto} spin${auto > 1 ? 's' : ''} left.` : `No win. ${cr(after)} left.`);
    settle();
  }
}

/** After a spin: the next autoplay spin, or the broke check. */
function next() {
  if (!ctx?.live) return;
  if (auto > 0) {
    if (credits() < coins) { auto = 0; setButtons(); ctx.message('Autoplay stopped: the meter is out of credits.'); }
    else { countT = ctx.after(ctx.reduced() ? 250 : 450, () => { if (auto > 0 && !spinning) go(); }); return; }
  }
  if (!credits()) ctx.checkBroke();
}

function onDeck(id) {
  if (id === 'one') betOne();
  else if (id === 'max') betMax();
  else if (id === 'spin') action();
}

const RET = exactReturn();
const pct = (x) => `${(x * 100).toFixed(1)}%`;

export default {
  id: 'slots',
  name: 'Slots',
  ready: true,
  credits: true,
  css: 'css/casino/slots.css',
  layout,
  settings: [
    { key: 'speed', label: 'Reel speed', type: 'select', options: [['normal', 'Normal'], ['fast', 'Fast']], default: 'normal' },
    { key: 'autoplay', label: 'Autoplay (spins per press of Spin)', type: 'select', options: [[0, 'Off'], [10, '10 spins'], [25, '25 spins'], [50, '50 spins']], default: 0 },
  ],
  howto: howtoSections([
    ['Play', `Insert bills to buy credits (each credit costs the machine's denomination). Bet one to three coins with Bet One or Bet Max, then Spin. Three reels turn and stop left to right; whatever lines up on the red pay line pays the amount on the glass for the coins you bet. Cash out puts your credits back in the bank; leaving the machine cashes out for you.`],
    ['Pays (per coin)', `<ul>${PAY_ROWS.map((r) => `<li>${esc(r.label)}: ${fmt(r.pay)}${r.key === 'WWW' ? ' (3,200 on three coins instead of 2,400)' : ''}</li>`).join('')}</ul><p>Only the best win on the line is paid. Blanks break every line except cherries.</p>`],
    ['Crowns', 'The crown is wild for ingots, bells, horseshoes and clovers (not cherries). A win with one crown in it pays double, with two crowns four times. Three crowns is the top award, and the third coin raises it from 2,400 to 3,200.'],
    ['Odds', `Every stop on every reel is equally likely. The machine returns ${pct(RET.base)} of what is bet at one or two coins and ${pct(RET.max)} at three coins; about one spin in ${(1 / RET.hit).toFixed(1)} wins something, and three crowns come up once in ${fmt(RET.n)} spins.`],
    ['Keys', 'Space, Enter or S spins; press again to stop the reels at once (or click the reels). B bets one more coin, M bets max, X plays max (bet max and spin).'],
    ['Options', 'Fast reels, and autoplay: one press of Spin plays 10, 25 or 50 spins, stopping on any win of 20 times the bet or more, when the meter runs out, or when you press Stop.'],
  ]),

  mount(el, c) {
    root = el; ctx = c;
    spinning = null; auto = 0; shownCredits = null;
    pos = pos.map((p) => Math.round(wrap(p)));
    el.innerHTML = `<div class="cz-stage cz-sl-stage">${layout({ coins, credits: credits(), stops: pos })}${payCard(coins)}</div>`;
    mq = matchMedia(PHONE);
    mq.addEventListener('change', fit);
    fit();
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    meterRelease = null;
    ctx.machine.onChange(() => { if (root && shownCredits == null) paintMeters(); });
    ctx.actions([
      { id: 'one', label: 'Bet one', key: 'b', run: betOne },
      { id: 'max', label: 'Bet max', key: 'm', run: betMax },
      { id: 'playmax', label: 'Play max', key: 'x', run: () => { if (spinning || auto) return; if (coins !== MAX_COINS) { coins = MAX_COINS; paintCoins(); } action(); } },
    ]);
    ctx.keys({ s: () => action() });
    setButtons();
    ctx.setTotal(coins * ctx.machine.denom);
    ctx.message(credits() ? `${cr(credits())} on the meter. Bet one to three coins and spin.` : `Insert bills to buy credits (${money(ctx.machine.denom)} each), then spin.`);
  },
  unmount() {
    // a spin in progress was paid when Spin was pressed: just drop the reveal
    cancelAnimationFrame(frame);
    if (countT) ctx?.cancel(countT);
    spinning = null; auto = 0; shownCredits = null;
    pos = pos.map((p) => Math.round(wrap(p)));
    meterRelease = null;
    mq?.removeEventListener('change', fit); mq = null;
    if (root) { root.removeEventListener('click', onClick); root.removeEventListener('keydown', onKey); root.innerHTML = ''; }
    root = null; ctx = null;
  },
  action,
};

function onClick(e) {
  const b = e.target.closest?.('[data-sl]');
  if (b) { onDeck(b.dataset.sl); return; }
  if (spinning && e.target.closest?.('.cz-sl-reel, .cz-reel')) spinning.finish();
}
function onKey(e) {
  const b = e.target.closest?.('[data-sl]');
  if (!b || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  e.stopPropagation();
  onDeck(b.dataset.sl);
}
