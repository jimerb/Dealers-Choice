// Video Poker: a single-hand draw poker machine with three pay tables (Jacks or Better 9/6, Bonus
// Poker 8/5, full-pay Deuces Wild). Bet one to five credits from the machine's meter, deal, hold
// cards by clicking them (or keys 1-5), draw, and get paid from the pay table on the screen.
// Rules and the exact hold values live in ../engines/video-poker.js (no DOM); the Hint runs them in
// a Web Worker (../engines/video-poker-worker.js) so the page never stalls.
//
// The cabinet is a picture with clear windows; the code draws everything in them (pay table, card
// slots, HELD, the WIN / BET / CREDITS meters) as live SVG text, and the card layer puts the site's
// own card faces over the five slots.
import { MACHINES, MACHINE_IDS, machineOf, init, step, payingMask, holdValues, bestHold, describeHold, cardText } from '../engines/video-poker.js';
import { svg, rect, text, cardSlot } from '../svg.js';
import { ART, svgArt } from '../art.js';
import { money } from '../../core/bank.js';

// ------------------------------------------------------------------ geometry (cabinet picture units)
// The cabinet picture is 800 x 1200; its clear windows, where the code draws:
const W = 800, H = 1200;
const TOPPER = { x: 117, y: 78, w: 566, h: 172 };  // the machine's name
const SCREEN = { x: 102, y: 297, w: 596, h: 492 }; // pay table, cards, status
const PLATE = { x: 122, y: 832, w: 558, h: 116 };  // the gold plate: the meters
const PAY = { y0: 305, y1: 535 };                  // the pay table band on the screen
const CARD = { y: 636, w: 100, xs: [180, 290, 400, 510, 620] };
const HELD_Y = 724, STATUS_Y = 760;
// Views: the whole cabinet when the window is tall enough, else a close-up of screen and meters.
const VIEWS = { full: [0, 0, W, H], close: [84, 282, 632, 676] };
const TALL_MQ = '(min-height: 1060px) and (min-width: 700px)';
const NARROW_MQ = '(max-width: 560px)';

const cardAt = (i) => ({ x: CARD.xs[i], y: CARD.y, w: CARD.w });

/** The pay table: every coin column (the bet's column lit) or, on a phone, just the bet's pays in two columns. */
function payTableSVG(m, coins, win, narrow) {
  const n = m.rows.length;
  let out = '';
  if (!narrow) {
    const h = (PAY.y1 - PAY.y0) / n;
    const size = n > 10 ? 19 : 21;
    const colX = (c) => SCREEN.x + 262 + c * 68;
    out += rect(colX(coins - 1) - 33, PAY.y0 - 2, 66, PAY.y1 - PAY.y0 + 4, { r: 6, cls: 'vp-col' });
    m.rows.forEach((r, i) => {
      const y = PAY.y0 + h * (i + 0.5);
      if (i === win) out += rect(SCREEN.x + 8, y - h / 2 + 1, SCREEN.w - 16, h - 2, { r: 5, cls: 'vp-winrow' });
      const cls = i === win ? 'vp-tx win' : 'vp-tx';
      out += text(SCREEN.x + 18, y, r.label, { size, anchor: 'start', cls, weight: 700 });
      out += r.pays.map((p, c) => text(colX(c), y, String(p), { size, cls: `${cls}${c === coins - 1 ? ' on' : ''}`, weight: 700 })).join('');
    });
    return out;
  }
  const per = Math.ceil(n / 2);
  const h = (PAY.y1 - PAY.y0) / per;
  const colW = SCREEN.w / 2;
  m.rows.forEach((r, i) => {
    const col = i < per ? 0 : 1, k = i % per;
    const x0 = SCREEN.x + col * colW, y = PAY.y0 + h * (k + 0.5);
    if (i === win) out += rect(x0 + 6, y - h / 2 + 2, colW - 12, h - 4, { r: 5, cls: 'vp-winrow' });
    const cls = i === win ? 'vp-tx win' : 'vp-tx';
    out += text(x0 + 16, y, r.short, { size: 25, anchor: 'start', cls, weight: 700 });
    out += text(x0 + colW - 14, y, String(r.pays[coins - 1]), { size: 25, anchor: 'end', cls: `${cls} on`, weight: 800 });
  });
  return out;
}

const heldSVG = (held = []) => CARD.xs.map((x, i) => text(x, HELD_Y, held[i] ? 'HELD' : '', { size: 22, weight: 800, cls: 'vp-held' })).join('');

function metersSVG({ won = 0, bet = 0, credits = 0, denom = 1 }) {
  const w = 172, gap = 12, x0 = PLATE.x + (PLATE.w - 3 * w - 2 * gap) / 2;
  return [['WIN', won], ['BET', bet], ['CREDITS', credits]].map(([label, v], i) => {
    const x = x0 + i * (w + gap), cx = x + w / 2;
    return `${rect(x, PLATE.y + 12, w, PLATE.h - 24, { r: 10, cls: 'vp-led' })}${text(cx, PLATE.y + 30, label, { size: 16, weight: 800, cls: 'vp-led-label' })}
      ${text(cx, PLATE.y + 64, Number(v).toLocaleString('en-US'), { size: 36, weight: 800, cls: 'vp-led-tx' })}${label === 'CREDITS' ? text(cx, PLATE.y + 91, `= ${money(v * denom)}`, { size: 14, weight: 700, cls: 'vp-led-label' }) : ''}`;
  }).join('');
}

/** The whole machine as an SVG string (no DOM). */
export function layout({ machine = 'jacks', coins = 5, win = -1, held = [], status = 'BET 1–5 CREDITS · DEAL · TAP CARDS TO HOLD', won = 0, bet = 0, credits = 0, denom = 1, narrow = false, view = 'full' } = {}) {
  const m = machineOf(machine);
  const [vx, vy, vw, vh] = VIEWS[view] ?? VIEWS.full;
  const S = SCREEN;
  const standIn = `${rect(60, 40, 680, 1120, { r: 60, cls: 'cz-cabinet' })}`;
  const body = `${rect(TOPPER.x, TOPPER.y, TOPPER.w, TOPPER.h, { cls: 'vp-glass' })}${rect(S.x, S.y, S.w, S.h, { cls: 'vp-glass screen' })}
    ${svgArt(ART.vpCabinet, 0, 0, W, H, standIn)}
    <g class="vp-topper">${text(W / 2, TOPPER.y + 70, m.title, { size: 50, weight: 800, cls: 'vp-title' })}${text(W / 2, TOPPER.y + 126, m.subtitle, { size: 22, cls: 'vp-sub' })}</g>
    <g class="vp-pay">${payTableSVG(m, coins, win, narrow)}</g>
    ${CARD.xs.map((x) => cardSlot(x, CARD.y, CARD.w, { cls: 'vp-slot' })).join('')}
    <g class="vp-heldrow">${heldSVG(held)}</g>
    <g class="vp-status">${text(S.x + S.w / 2, STATUS_Y, status, { size: 24, weight: 800, cls: 'vp-status-tx' })}</g>
    <g class="vp-meters">${metersSVG({ won, bet, credits, denom })}</g>`;
  return svg(W, H, body, { label: `${m.name} video poker machine: pay table, five cards, win, bet and credit meters`, cls: 'cz-machine cz-cab vp-cab' })
    .replace(/viewBox="[^"]*"/, `viewBox="${vx} ${vy} ${vw} ${vh}" style="--vp-ratio:${vw / vh}"`);
}

// ------------------------------------------------------------------ the machine on the page
const OPTS_KEY = 'dc.casino.opts.video-poker';
let root = null, ctx = null, stage = null, svgEl = null, layer = null;
let state = null, busy = false, lastCoins = 5, wonShown = 0, hint = null, hintFor = 0, handNo = 0;
let worker = null, workerBroken = false, pending = new Map(), seq = 0;
let unsub = null, mqTall = null, mqNarrow = null, revealing = false;

const machine = () => machineOf(state.machine);
const speed = () => (ctx.reduced() ? 0 : ctx.opts.speed === 'normal' ? 160 : 70);
const wait = (ms) => new Promise((r) => (ms > 0 ? ctx.after(ms, r) : r()));
const viewName = () => (mqTall?.matches ? 'full' : 'close');
const narrow = () => mqNarrow?.matches ?? false;

function set(sel, html) { const g = svgEl?.querySelector(sel); if (g) g.innerHTML = html; }
function paintPay() { set('.vp-pay', payTableSVG(machine(), state.coins, state.phase === 'paid' && state.result ? state.result.row : -1, narrow())); }
function paintHeld() { set('.vp-heldrow', heldSVG(state.phase === 'hold' ? state.held : [])); }
function paintStatus(s) { set('.vp-status', text(SCREEN.x + SCREEN.w / 2, STATUS_Y, s, { size: 24, weight: 800, cls: 'vp-status-tx' })); }
function paintMeters() {
  if (revealing || !ctx?.machine) return;
  set('.vp-meters', metersSVG({ won: wonShown, bet: state.coins, credits: ctx.machine.credits, denom: ctx.machine.denom }));
}
function paintTopper() {
  const m = machine();
  set('.vp-topper', text(W / 2, TOPPER.y + 70, m.title, { size: 50, weight: 800, cls: 'vp-title' }) + text(W / 2, TOPPER.y + 126, m.subtitle, { size: 22, cls: 'vp-sub' }));
  root?.querySelectorAll('[data-machine]').forEach((b) => {
    const on = b.dataset.machine === state.machine;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    b.disabled = state.phase === 'hold' || busy;
  });
}

/** The machine picker: three buttons beside (or above, on a phone) the cabinet. */
const pickerHTML = () => `<div class="vp-pick" role="radiogroup" aria-label="Machine">${MACHINE_IDS.map((id) => {
  const m = MACHINES[id];
  return `<button type="button" class="vp-pick-btn" role="radio" data-machine="${id}" aria-checked="false"><b>${m.name}</b><span>${m.subtitle} · ${m.returnPct.toFixed(2)}%</span></button>`;
}).join('')}</div>`;

function drawMachine() {
  const [, , vw, vh] = VIEWS[viewName()];
  root.querySelector('.vp')?.style.setProperty('--vp-ratio', String(vw / vh));
  stage.innerHTML = layout({ machine: state.machine, coins: state.coins, win: -1, narrow: narrow(), view: viewName(), denom: ctx.machine.denom, credits: ctx.machine.credits, bet: state.coins, won: wonShown });
  svgEl = stage.querySelector('svg');
  layer?.destroy();
  layer = ctx.cards(stage, svgEl, { from: { x: 400, y: CARD.y }, clickable: true, label: 'Your five cards', minWidth: 40 });
  // cards from the last hand stay on the screen; before the first deal, five backs
  for (let i = 0; i < 5; i++) {
    const c = state.hand[i] ?? null;
    layer.place(`c${i}`, c, cardAt(i), { face: Boolean(c) });
  }
  markCards();
  paintPay(); paintHeld(); paintMeters(); paintTopper();
  paintStatus(statusText());
}

function statusText() {
  if (state.phase === 'hold') return 'HOLD CARDS, THEN DRAW';
  if (state.phase === 'paid' && state.result) return state.result.credits ? `${state.result.label.toUpperCase()} · WIN ${state.result.credits}` : 'GAME OVER';
  if (!ctx.machine.credits) return 'INSERT BILLS TO PLAY';
  return `PLAY ${state.coins} CREDIT${state.coins > 1 ? 'S' : ''} · DEAL`;
}

function markCards() {
  if (!layer) return;
  const win = state.phase === 'paid' && state.result?.credits ? payingMask(state.machine, state.hand) : 0;
  const hinted = state.phase === 'hold' && hint?.shown && hint.hand === handNo ? hint.mask : -1;
  for (let i = 0; i < 5; i++) {
    layer.mark(`c${i}`, 'held', state.phase === 'hold' && state.held[i]);
    layer.mark(`c${i}`, 'win', Boolean(win & (1 << i)));
    layer.mark(`c${i}`, 'vp-hint', hinted >= 0 && Boolean(hinted & (1 << i)));
    const el = layer.el(`c${i}`);
    if (el) {
      el.disabled = state.phase !== 'hold' || busy;
      const c = state.hand[i];
      if (c) el.setAttribute('aria-label', `Card ${i + 1}: ${cardText(c)}${state.phase === 'hold' ? (state.held[i] ? ', held' : ', not held') : ''}`);
      if (state.phase === 'hold') el.setAttribute('aria-pressed', String(state.held[i])); else el.removeAttribute('aria-pressed');
    }
  }
}

function syncControls() {
  const hold = state.phase === 'hold';
  ctx.setButtons({ action: !busy, clear: false, rebet: false, undo: false, label: hold ? 'Draw' : 'Deal' });
  ctx.setActions({
    betone: { disabled: busy || hold, hidden: false },
    betmax: { disabled: busy || hold, hidden: false },
    holdall: { disabled: busy || !hold, hidden: !hold },
    discardall: { disabled: busy || !hold, hidden: !hold },
    hint: { disabled: busy || !hold, hidden: !hold || !ctx.opts.hint },
  });
  ctx.setTotal(state.coins * ctx.machine.denom);
  paintTopper();
  markCards();
}

function apply(action) {
  const r = step(state, action, { rng: ctx.rng });
  state = r.state;
  return r;
}

// ---- betting
function betOne() {
  if (busy || state.phase === 'hold') return;
  const credits = ctx.machine.credits;
  let n = state.coins >= 5 ? 1 : state.coins + 1;
  if (credits > 0 && n > credits) n = 1;
  apply({ type: 'coins', n });
  lastCoins = state.coins;
  leavePaid();
  ctx.play('click');
  paintPay(); paintMeters(); paintStatus(statusText());
  syncControls();
  ctx.message(`Betting ${state.coins} credit${state.coins > 1 ? 's' : ''} (${money(state.coins * ctx.machine.denom)}). ${state.coins < 5 ? 'Five credits pay 4,000 for a royal flush.' : 'Deal when ready.'}`);
}
function betMax() {
  if (busy || state.phase === 'hold') return;
  apply({ type: 'coins', n: 5 });
  lastCoins = 5;
  deal();
}
/** After a paid hand, the next bet clears the win lights. */
function leavePaid() {
  if (state.phase !== 'paid') return;
  state = { ...state, phase: 'bet', result: null };
  wonShown = 0;
  markCards();
}

async function deal() {
  if (busy || state.phase === 'hold') return;
  const credits = ctx.machine.credits;
  if (credits > 0 && credits < state.coins) {
    apply({ type: 'coins', n: credits });
    ctx.toast(`Betting your last ${credits} credit${credits > 1 ? 's' : ''}.`);
  }
  if (!ctx.machine.bet(state.coins)) { paintStatus(statusText()); return; }
  leavePaid();
  wonShown = 0;
  ctx.banner(null);
  apply('deal');
  handNo++;
  hint = null;
  if (ctx.opts.autohold) {
    const mask = payingMask(state.machine, state.hand);
    state.held = state.held.map((_, i) => Boolean(mask & (1 << i)));
  }
  busy = true;
  paintPay(); paintMeters(); paintStatus('');
  set('.vp-heldrow', heldSVG([]));
  syncControls();
  ctx.play('deal');
  // turn all five face down, then up one by one
  for (let i = 0; i < 5; i++) layer.flip(`c${i}`, null, false);
  await wait(speed() ? 220 : 0);
  if (!ctx.live) return;
  for (let i = 0; i < 5; i++) {
    layer.flip(`c${i}`, state.hand[i]);
    ctx.play('card');
    await wait(speed());
    if (!ctx.live) return;
  }
  busy = false;
  paintHeld();
  paintStatus(statusText());
  syncControls();
  const made = payingMask(state.machine, state.hand) ? `You were dealt a paying hand${ctx.opts.autohold ? ' (held for you)' : ''}. ` : '';
  ctx.message(`${made}Click cards (or press 1–5) to hold them, then Draw.`);
  if (ctx.opts.hint) requestHint(false);
}

// ---- holding
function toggle(i) {
  if (busy || state.phase !== 'hold') return;
  apply({ type: 'hold', i });
  ctx.play('click');
  paintHeld(); markCards();
}
function holdAll(on) {
  if (busy || state.phase !== 'hold') return;
  apply(on ? 'holdAll' : 'discardAll');
  ctx.play('click');
  paintHeld(); markCards();
}

// ---- the draw
async function draw() {
  if (busy || state.phase !== 'hold') return;
  const before = state.held.slice();
  const r = apply('draw');
  // paid now, before the cards turn: leaving during the reveal never loses a win
  revealing = true;
  ctx.machine.pay(r.done.won);
  busy = true;
  hint = hint && { ...hint, shown: false };
  syncControls();
  set('.vp-heldrow', heldSVG(before));
  for (let i = 0; i < 5; i++) if (!before[i]) layer.flip(`c${i}`, null, false);
  if (r.state.result.drawn.length) await wait(speed() ? 200 : 0);
  if (!ctx.live) return;
  for (const i of r.state.result.drawn) {
    layer.flip(`c${i}`, state.hand[i]);
    ctx.play('card');
    await wait(speed());
    if (!ctx.live) return;
  }
  busy = false;
  revealing = false;
  const res = state.result;
  wonShown = res.credits;
  set('.vp-heldrow', heldSVG([]));
  paintPay(); paintMeters(); paintStatus(statusText());
  syncControls();
  if (res.credits) {
    ctx.play(res.row === 0 ? 'score' : 'win');
    ctx.message(`${res.label}! You win ${res.credits.toLocaleString('en-US')} credits (${money(res.credits * ctx.machine.denom)}). Deal again or Cash out.`);
    if (res.row === 0 || res.credits >= 100 * state.coins) ctx.banner(res.label, { tone: 'win', detail: `${res.credits.toLocaleString('en-US')} credits` });
  } else {
    ctx.play('lose');
    ctx.message(ctx.machine.credits ? 'No win this time. Deal again.' : 'No win, and the meter is empty. Insert bills to keep playing.');
  }
  if (!ctx.machine.credits) ctx.checkBroke();
}

// ---- the hint (exact values of all 32 holds, worked out in a worker)
function getWorker() {
  if (worker || workerBroken || typeof Worker !== 'function') return worker;
  try {
    worker = new Worker(new URL('../engines/video-poker-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data); } };
    worker.onerror = () => { workerBroken = true; worker?.terminate(); worker = null; for (const p of pending.values()) p(null); pending.clear(); };
  } catch { workerBroken = true; worker = null; }
  return worker;
}
/** Values of the 32 holds for this hand: in the worker if there is one, else here (a moment's pause). */
function computeHint(m, cards, coins) {
  const w = getWorker();
  if (w) {
    const id = ++seq;
    return new Promise((done) => { pending.set(id, done); w.postMessage({ id, machine: m, cards, coins }); })
      .then((d) => d && !d.error ? d : computeHere(m, cards, coins));
  }
  return new Promise((done) => setTimeout(() => done(computeHere(m, cards, coins)), 30));
}
function computeHere(m, cards, coins) {
  const values = holdValues(m, cards, coins);
  const b = bestHold(m, cards, coins, values);
  return { values: Array.from(values), mask: b.mask, value: b.value, text: b.text };
}

async function requestHint(show) {
  if (state.phase !== 'hold') return;
  const n = handNo;
  if (hint?.hand === n) {
    if (!show) return;
    if (hint.waiting) { hint.show = true; ctx.message('Working out the best hold…'); } else showHint();
    return;
  }
  hint = { hand: n, waiting: true, show };
  if (show) ctx.message('Working out the best hold…');
  const d = await computeHint(state.machine, state.hand, state.coins);
  if (!ctx?.live || handNo !== n || !d || state.phase !== 'hold') return;
  const wanted = hint?.show;
  hint = { ...d, hand: n, shown: false };
  if (wanted) showHint();
}
function showHint() {
  if (state.phase !== 'hold') return;
  if (!hint || hint.hand !== handNo || hint.waiting) { requestHint(true); return; }
  hint.shown = true;
  const cards = state.hand.filter((_, i) => hint.mask & (1 << i)).map(cardText).join(' ');
  const mine = state.held.reduce((mk, h, i) => mk | (h ? 1 << i : 0), 0);
  const fmt = (v) => v.toFixed(2);
  const best = `${hint.mask ? `Hold ${cards}: ` : ''}${hint.text}`;
  const yours = mine === hint.mask ? 'That is what you are holding now.' : `Your hold now (${describeHold(state.machine, state.hand, mine)}) averages ${fmt(hint.values[mine])}.`;
  ctx.message(`Hint: ${best[0].toUpperCase()}${best.slice(1)}. It returns ${fmt(hint.value)} credits on average for your ${state.coins}-credit bet. ${yours}`);
  markCards();
}

// ---- machines
function pickMachine(id) {
  if (busy || state.phase === 'hold' || !MACHINES[id] || id === state.machine) return;
  apply({ type: 'machine', id });
  leavePaid();
  try {
    const saved = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}');
    localStorage.setItem(OPTS_KEY, JSON.stringify({ ...saved, machine: id }));
  } catch { /* storage may be off: the choice lasts this visit */ }
  if (ctx.opts) ctx.opts.machine = id;
  ctx.play('click');
  paintTopper(); paintPay(); paintStatus(statusText());
  const m = machine();
  ctx.message(`${m.name} (${m.subtitle}). Pays back ${m.returnPct.toFixed(2)}% with perfect play at five credits.`);
  getWorker()?.postMessage({ warm: id });
}

function onCardClick(e) {
  const b = e.target.closest('[data-card]');
  if (!b || !stage.contains(b)) return;
  toggle(Number(b.dataset.card.slice(1)));
}
function onPick(e) {
  const b = e.target.closest('[data-machine]');
  if (b) pickMachine(b.dataset.machine);
}
function onPickKey(e) {
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!step || !e.target.closest('[data-machine]')) return;
  e.preventDefault();
  const i = MACHINE_IDS.indexOf(state.machine);
  pickMachine(MACHINE_IDS[(i + step + MACHINE_IDS.length) % MACHINE_IDS.length]);
  root.querySelector(`[data-machine="${state.machine}"]`)?.focus();
}
function action() {
  if (!state || busy) return;
  if (state.phase === 'hold') draw(); else deal();
}
const onMedia = () => { if (root && !busy) drawMachine(); };

export default {
  id: 'video-poker',
  name: 'Video Poker',
  ready: true,
  credits: true,
  css: 'css/casino/video-poker.css',
  layout,
  settings: [
    { key: 'machine', label: 'Machine', type: 'select', options: [['jacks', 'Jacks or Better 9/6'], ['bonus', 'Bonus Poker 8/5'], ['deuces', 'Deuces Wild (full pay)']], default: 'jacks' },
    { key: 'speed', label: 'Dealing speed', type: 'select', options: [['fast', 'Fast'], ['normal', 'Normal']], default: 'fast' },
    { key: 'hint', label: 'Show the Hint button', type: 'check', default: true },
    { key: 'autohold', label: 'Hold paying hands for me', type: 'check', default: false },
  ],
  howto: {
    goal: 'Make the best five-card poker hand you can. You play against the pay table, not other players: any hand on the table pays.',
    deal: 'Every hand is dealt from a freshly shuffled 52-card deck. You get five cards; the cards you throw away are replaced from the same deck.',
    play: [
      'Insert bills to put credits on the machine (each credit is worth the machine\'s denomination). Cash out sends the credits back to your bank, and leaving the machine cashes out for you.',
      '<b>Bet One</b> raises the bet one credit at a time (1 to 5, then back to 1). <b>Bet Max</b> bets five credits and deals at once. <b>Deal</b> deals with the bet shown.',
      'Click the cards you want to keep: HELD shows under them. Click again to let a card go. <b>Hold All</b> and <b>Discard All</b> do all five at once.',
      '<b>Draw</b> replaces every card you did not hold. The final hand is paid from the table.',
      'Pick the machine beside the cabinet (or in Options) between hands: <b>Jacks or Better 9/6</b> (99.54% with perfect play), <b>Bonus Poker 8/5</b> with big pays for four of a kind (99.17%), or <b>Deuces Wild</b>, where every 2 is wild (100.76%).',
    ],
    score: [
      'Pays are per credit bet; the pay table shows the pay for each bet, with your bet\'s column lit and the winning row lit after the draw.',
      'A royal flush pays 250 per credit, but 4,000 for a five-credit bet: always bet five credits if you can.',
      'Jacks or Better and Bonus Poker pay from a pair of jacks or better. Bonus Poker pays four aces 80 and four 2s, 3s or 4s 40 per credit.',
      'Deuces Wild pays from three of a kind. A natural royal (no deuces) pays the top award, four deuces pay 200, a royal flush made with deuces 25 and five of a kind 15.',
    ],
    options: {
      machine: 'which pay table the machine plays (you can also pick it beside the cabinet).',
      speed: 'how quickly the cards are dealt and turned.',
      hint: 'the Hint button works out the best hold exactly, by checking every possible draw for all 32 ways to hold your hand.',
      autohold: 'when the deal already pays, its cards are held for you (you can still change them).',
    },
    controls: '{Click} a card to hold or release it. Keys: 1–5 hold cards, D or Enter deals and draws, B bets one, M bets max, A holds all, R discards all, H shows the hint, C cashes out.',
    tip: 'Never break up a pat straight, flush or better except for four to a royal flush, and in Deuces Wild never throw away a deuce.',
  },

  mount(el, c) {
    root = el; ctx = c;
    busy = false; revealing = false; hint = null; wonShown = 0;
    state = init({ machine: ctx.opts.machine, coins: lastCoins });
    el.innerHTML = `<div class="vp">${pickerHTML()}<div class="cz-stage vp-stage"></div></div>`;
    stage = el.querySelector('.vp-stage');
    mqTall = matchMedia(TALL_MQ);
    mqNarrow = matchMedia(NARROW_MQ);
    mqTall.addEventListener('change', onMedia);
    mqNarrow.addEventListener('change', onMedia);
    drawMachine();
    stage.addEventListener('click', onCardClick);
    el.querySelector('.vp-pick').addEventListener('click', onPick);
    el.querySelector('.vp-pick').addEventListener('keydown', onPickKey);
    ctx.showRack(false);
    ctx.actions([
      { id: 'betone', label: 'Bet One', key: 'b', run: betOne },
      { id: 'betmax', label: 'Bet Max', key: 'm', run: betMax },
      { id: 'holdall', label: 'Hold All', key: 'a', small: true, hidden: true, run: () => holdAll(true) },
      { id: 'discardall', label: 'Discard All', key: 'r', small: true, hidden: true, run: () => holdAll(false) },
      { id: 'hint', label: 'Hint', key: 'h', small: true, hidden: true, run: () => showHint() },
    ]);
    const keys = { d: () => action(), c: () => { if (!busy && state.phase !== 'hold') ctx.machine.cashOut(); } };
    for (let i = 1; i <= 5; i++) keys[String(i)] = () => toggle(i - 1);
    ctx.keys(keys);
    unsub = ctx.bank.subscribe(() => { if (root) { paintMeters(); if (state.phase !== 'hold' && !busy) paintStatus(statusText()); } });
    syncControls();
    ctx.message(ctx.machine.credits
      ? `${machine().name}: ${ctx.machine.credits} credits on the meter. Bet One or Bet Max, then Deal.`
      : `${machine().name} on a ${money(ctx.machine.denom)} machine. Insert bills to play.`);
    if (ctx.opts.hint) getWorker()?.postMessage({ warm: state.machine });
  },
  unmount() {
    unsub?.(); unsub = null;
    mqTall?.removeEventListener('change', onMedia);
    mqNarrow?.removeEventListener('change', onMedia);
    worker?.terminate(); worker = null; pending.clear();
    layer = null; svgEl = null; stage = null;
    if (root) root.innerHTML = '';
    root = null;
    busy = false; revealing = false;
  },
  action,
  optionsChanged(opts) {
    if (!state) return;
    if (opts.machine && opts.machine !== state.machine && state.phase !== 'hold' && !busy) pickMachine(opts.machine);
    syncControls();
  },
};

