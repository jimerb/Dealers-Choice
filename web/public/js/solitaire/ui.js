// Solitaire parlor UI: layout picker + board for both the rules-driven "build" engine and the
// custom games. Click a card (or stack) then a destination; double-click, or a second tap on the
// selected card, sends it home (double-click alone is unreliable on touch screens).
import { VARIANTS, newGame, grab, move, clickStock, autoTarget, autoPlay, isWon, undo, scoreOf, scoreName } from './engine.js';
import { CUSTOM } from './custom/index.js';
import { cardHTML, backHTML, cardName, paintFelt, preloadSkin } from '../skin.js';
import { mountChrome, esc } from '../header.js';
import { play } from '../core/sound.js';
import { SOLITAIRE } from '../catalog.js';
import { howtoHTML, controlsFor } from './howto.js';
import { planStandard, fanColumn } from './layout.js';

mountChrome('solitaire');
preloadSkin();

const params = new URLSearchParams(location.search);
const known = (id) => Boolean(VARIANTS[id] || CUSTOM[id]);
let variant = known(params.get('v')) ? params.get('v') : null;
let state = null, sel = null, customHistory = [], timer = null;
const KEY = (v) => `dc.sol.${v}.v2`;
const STATS = 'dc.sol.stats';
const SEEN = 'dc.sol.howto.seen', AUTO = 'dc.sol.howto.auto'; // layouts whose How to play was shown; '0' = don't auto-show
const isCustom = () => Boolean(CUSTOM[variant]);
const mod = () => CUSTOM[variant];
const info = (id) => VARIANTS[id] ?? CUSTOM[id];

const readStats = () => { try { return JSON.parse(localStorage.getItem(STATS) || '{}'); } catch { return {}; } };
function bumpStat(v, field) { const st = readStats(); st[v] = st[v] ?? { played: 0, won: 0 }; st[v][field]++; try { localStorage.setItem(STATS, JSON.stringify(st)); } catch { /* ignore */ } }
function save() { try { localStorage.setItem(KEY(variant), JSON.stringify(isCustom() ? state : { ...state, history: state.history.slice(-30) })); } catch { /* ignore */ } }
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN) || '[]'); } catch { return []; } };
function markSeen(v) { const seen = readSeen(); if (!seen.includes(v)) try { localStorage.setItem(SEEN, JSON.stringify([...seen, v])); } catch { /* ignore */ } }
const autoShow = () => { try { return localStorage.getItem(AUTO) !== '0'; } catch { return true; } };
function load(v) { try { const s = JSON.parse(localStorage.getItem(KEY(v))); return s?.variant === v ? s : null; } catch { return null; } }

const won = () => (isCustom() ? mod().isWon(state) : isWon(state));
const over = () => (isCustom() ? mod().isOver(state) : isWon(state));

function start(v, fresh = false) {
  variant = v; sel = null; customHistory = [];
  history.replaceState(null, '', `solitaire.html?v=${v}`);
  const saved = !fresh && load(v);
  state = saved || (isCustom() ? mod().newGame(Math.floor(Math.random() * 2 ** 31)) : newGame(v));
  if (!saved) bumpStat(v, 'played');
  state.wonCounted = state.wonCounted ?? false;
  play('shuffle');
  save(); render(); startTimer();
  if (autoShow() && !readSeen().includes(v)) showRules(); // first visit to this layout
}

function startTimer() {
  clearInterval(timer);
  if (!isCustom() || !mod().timed) return;
  timer = setInterval(() => {
    if (document.hidden || !variant || !isCustom() || state.phase !== 'play' || document.getElementById('sol-rules').open) return; // paused while reading the rules
    const before = state.phase;
    state = mod().tick(state);
    if (state.fx && state.phase !== before) { play(state.fx); state.fx = null; }
    if (state.phase === 'over') checkWin();
    save(); render();
  }, 1000);
}

function checkWin() {
  if (won() && !state.wonCounted) { state.wonCounted = true; bumpStat(variant, 'won'); play('win'); }
}

function set(next, sound = 'card') {
  if (!next) { play('error'); return; }
  if (next.error) { flash(next.error); play('error'); return; }
  if (isCustom() && !mod().timed) customHistory = [...customHistory.slice(-60), state];
  state = next; sel = null;
  play(state.fx ?? sound); state.fx = null;
  checkWin();
  save(); render();
}

// ------------------------------------------------------------------ rendering
const chooser = document.getElementById('chooser');
const board = document.getElementById('board');

function renderChooser() {
  const stats = readStats();
  chooser.innerHTML = `<div class="section-head" style="margin-top:8px"><h2>Solitaire parlor</h2><span style="color:var(--ink-3)">${SOLITAIRE.reduce((t, g) => t + g.games.length, 0)} layouts</span></div>
    <img class="sol-banner" src="assets/art/lobby/solitaire-banner.webp" width="1536" height="480" alt="" decoding="async">
    <p class="sol-intro">Pick a layout to deal. On the table, click or tap a card, then the spot where it should go; double-click it, or tap it a second time, to send it home. Every layout has a <b>How to play</b> guide with its rules.</p>
    <a class="sol-feature" href="solitaire.html?v=klondike">
      <span class="sol-feature-eyebrow">Start here · the classic</span>
      <b>Klondike</b>
      <span>${esc(info('klondike').blurb)} The game that came with Windows.</span>
      <span class="sol-feature-go">Play Klondike →</span>
    </a>
    ${SOLITAIRE.map((g, i) => `<div class="group sol-group-${i}"><div class="group-head"><h3>${g.title}</h3></div><div class="tiles">${g.games.map(([name, id]) => {
      const v = info(id);
      return `<a class="tile ready sol-tile" href="solitaire.html?v=${id}" data-v="${id}"><div class="tile-body"><b>${esc(name)}</b><span>${esc(v.blurb)}</span>
        ${stats[id] ? `<span style="color:var(--brass-2)">Won ${stats[id].won} of ${stats[id].played}</span>` : ''}</div></a>`;
    }).join('')}</div></div>`).join('')}`;
}

const PILE_LABEL = { stock: 'Stock', waste: 'Waste', cell: 'Cell', reserve: 'Reserve', bouquet: 'Bouquet' };
const RANK_OF = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function pileHTML(p) {
  const isSel = (i) => sel && sel.pile === p.id && i >= sel.i;
  if (p.type === 'tableau') {
    const { tops, height } = fanColumn(p.cards, L.w, L.colRoom);
    const cards = p.cards.map((c, i) => `<button class="sol-card${isSel(i) ? ' sel' : ''}" style="top:${tops[i]}px" data-pile="${p.id}" data-i="${i}" aria-label="${c.up ? cardName(c) : 'face-down card'}">${c.up ? cardHTML(c) : backHTML()}</button>`).join('');
    return `<div class="sol-col" data-drop="${p.id}" style="height:${Math.ceil(height)}px"><span class="sol-empty" data-drop="${p.id}"></span>${cards}</div>`;
  }
  if (p.type === 'bouquet') return `<div class="sol-bouquet" data-drop="${p.id}">${p.cards.map((c, i) => `<button class="sol-flat${isSel(i) ? ' sel' : ''}" data-pile="${p.id}" data-i="${i}" aria-label="${cardName(c)}">${cardHTML(c)}</button>`).join('')}</div>`;
  if (p.type === 'guide') return `<div class="sol-pile">${cardHTML(p.cards[0])}<span class="sol-label">Sultan</span></div>`;
  const t = p.cards.at(-1);
  const i = p.cards.length - 1;
  let inner, label = '';
  if (p.type === 'stock') {
    if (p.reshuffle) { const left = (VARIANTS[variant].rules.redeals ?? 0) - state.passes; inner = `<button class="btn sm" data-stock="1" ${left ? '' : 'disabled'}>Reshuffle (${left} left)</button>`; }
    else { inner = `<button class="sol-flat" data-stock="1" aria-label="Stock, ${p.cards.length} cards">${p.cards.length ? backHTML() : '<span class="empty-slot">↻</span>'}</button>`; label = String(p.cards.length); }
  } else if (p.type === 'waste' && t) {
    const show = p.cards.slice(-3);
    inner = `<div class="sol-waste" data-drop="${p.id}">${show.map((c, k) => (k === show.length - 1 ? `<button class="sol-flat${isSel(i) ? ' sel' : ''}" data-pile="${p.id}" data-i="${i}" aria-label="${cardName(c)}">${cardHTML(c)}</button>` : `<span class="sol-under">${cardHTML(c)}</span>`)).join('')}</div>`;
  } else if (t) inner = t.up ? `<button class="sol-flat${isSel(i) ? ' sel' : ''}" data-pile="${p.id}" data-i="${i}" aria-label="${cardName(t)}">${cardHTML(t)}</button>` : backHTML();
  else {
    let text = PILE_LABEL[p.type] ?? '';
    if (p.type === 'foundation') text = p.base === 'global' ? (state.baseRank ? RANK_OF[state.baseRank] : '?') : p.base === 'any' ? '' : p.base;
    if (p.kings) text = 'Kings';
    inner = `<span class="empty-slot" data-drop="${p.id}">${text}</span>`;
  }
  if (p.type === 'foundation' && (p.golf || p.acesup)) label = String(p.cards.length);
  if (p.type === 'reserve' && p.cards.length > 1) label = String(p.cards.length);
  const guide = p.guide ? `<span class="sol-guide" title="Builds by ${p.step}">+${p.step}</span>` : '';
  return `<div class="sol-pile is-${p.type}" data-drop="${p.id}">${guide}${inner}<span class="sol-label">${label}</span></div>`;
}

const dealFor = { key: '', state: null };
let L = { w: 80, gap: 8, rows: 1, perRow: 7, colRoom: 600, boardW: 0, topLines: 1 }; // the current table plan

/** The felt fills the window below its top edge, so a game never needs scrolling while you play. */
function sizeFelt() {
  const phone = innerWidth < 761;
  const top = area.getBoundingClientRect().top + scrollY;
  const min = innerHeight < 560 ? Math.max(240, innerHeight - 90) : phone ? 360 : 440; // short screens scroll once, to the felt
  area.style.height = `${Math.round(Math.max(min, innerHeight - top - (phone ? 8 : 14)))}px`;
  const cs = getComputedStyle(area);
  return { W: area.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), H: area.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) };
}

function renderStandard(box) {
  const top = state.piles.filter((p) => p.type !== 'tableau' && p.type !== 'bouquet');
  const tabs = state.piles.filter((p) => p.type === 'tableau');
  const bouquet = state.piles.find((p) => p.type === 'bouquet');
  const pickBase = state.piles.some((p) => p.base === 'global') && !state.baseRank;
  // Plan from the deal, not the current position, so the cards keep one size all game.
  const key = `${variant}:${state.seed}`;
  if (dealFor.key !== key) { dealFor.key = key; dealFor.state = newGame(variant, state.seed ?? 1); }
  L = planStandard(dealFor.state, VARIANTS[variant].rules, { ...box, banner: pickBase ? (box.W < 560 ? 76 : 54) : 0, minW: innerWidth < 761 ? 22 : 40 });
  // One line of top piles: foundations sit at the right-hand end, over the last columns.
  const push = L.topLines === 1 && top.filter((p) => p.type === 'foundation').length > 1 ? top.findIndex((p, i) => p.type === 'foundation' && i > 0 && top[i - 1].type !== 'foundation') : -1;
  return `<div class="sol-board" style="--card-w:${L.w}px;--gap:${L.gap}px;width:${Math.ceil(L.boardW)}px">
    ${pickBase ? '<div class="banner-inline">First move a card to a foundation: its rank starts every foundation.</div>' : ''}
    ${top.length ? `<div class="sol-top">${top.map((p, i) => (i === push ? pileHTML(p).replace('class="sol-pile ', 'class="sol-pile push ') : pileHTML(p))).join('')}</div>` : ''}
    ${bouquet ? pileHTML(bouquet) : ''}
    ${tabs.length ? `<div class="sol-tableau" style="--cols:${L.perRow}">${tabs.map(pileHTML).join('')}</div>` : ''}</div>`;
}

/** Custom layouts: scale the whole board so it fills the felt without spilling out of it. */
function fitCustom(board, box) {
  if (!board) return;
  const phone = innerWidth < 761;
  const extent = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (r) => { if (!r.width && !r.height) return; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); };
    const walk = (el) => {
      for (const c of el.children) {
        if (c.matches('.overlay, .toast')) continue;
        if (c.matches('.card, button, table, .empty-slot, .card-panel, .pg-cell') || !c.children.length) {
          if (c.children.length || c.matches('.card, button, table, .empty-slot, .pg-cell')) add(c.getBoundingClientRect());
          else { const r = document.createRange(); r.selectNodeContents(c); add(r.getBoundingClientRect()); }
        } else walk(c);
      }
    };
    walk(board);
    const b = board.getBoundingClientRect();
    return { w: Math.max(1, x1 - x0, b.width > box.W + 1 ? b.width : 0), h: Math.max(1, y1 - y0, b.height) };
  };
  // Search for the biggest zoom that fits; wrapping rows make the size jump, so keep a bracket.
  const cap = phone ? 1 : 2.2;
  let z = 1, fits = 0, fails = Infinity;
  board.style.zoom = '';
  for (let k = 0; k < 10; k++) {
    const e = extent();
    const f = Math.min(box.W / e.w, box.H / e.h);
    if (f >= 1) fits = Math.max(fits, z); else fails = Math.min(fails, z);
    if ((f >= 1 && (f < 1.03 || z >= cap)) ) break;
    let next = Math.max(0.4, Math.min(cap, z * f * (f < 1 ? 0.99 : 0.995)));
    if (next >= fails || next <= fits) next = (Math.max(fits, 0.4) + Math.min(fails, cap)) / 2;
    if (Math.abs(next - z) < 0.004) break;
    z = next; board.style.zoom = String(z);
  }
  if (z !== fits && fits) board.style.zoom = String(fits);
}

function render() {
  if (!variant) { chooser.hidden = false; board.hidden = true; renderChooser(); document.getElementById('sol-title').textContent = 'Solitaire'; document.title = 'Solitaire · Dealers Choice'; return; }
  chooser.hidden = true; board.hidden = false;
  const v = info(variant);
  document.getElementById('sol-title').textContent = v.name;
  document.title = `${v.name} · Dealers Choice`;
  document.getElementById('sol-sub').textContent = v.blurb;
  const c = controlsFor(v);
  document.getElementById('sol-hint').textContent = `${matchMedia('(pointer: coarse)').matches ? c.touch : c.mouse} Stuck? Open How to play.`;
  const custom = isCustom();
  const felt = document.getElementById('sol-area');
  felt.classList.toggle('custom', custom);
  const status = custom ? mod().status(state) : `${scoreName(state)}: ${scoreOf(state)}`;
  document.getElementById('sol-status').textContent = `${status} · moves ${state.moves}`;
  const timed = custom && mod().timed;
  document.querySelector('[data-cmd="undo"]').hidden = timed;
  document.querySelector('[data-cmd="auto"]').hidden = custom;
  document.querySelector('[data-cmd="restart"]').hidden = timed;
  const box = sizeFelt(); // after the bar above it has its final text
  const body = custom ? mod().render(state) : renderStandard(box);
  const finished = over();
  paintFelt(felt);
  // Keep keyboard focus on the same spot across the redraw.
  const f = document.activeElement && felt.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = f && ['pile', 'i', 'drop', 'stock', 'c', 'k', 'r', 'col', 'dir'].map((k) => (f.dataset[k] !== undefined ? `[data-${k}="${f.dataset[k]}"]` : '')).join('');
  felt.innerHTML = body + (finished ? `<div class="overlay sol-win"><div class="card-panel"><h3>${won() ? 'You won!' : 'Game over'}</h3><p>${esc(status)} · ${state.moves} move${state.moves === 1 ? '' : 's'}.${winTally()}</p>
    <div class="row"><button class="btn primary" data-cmd="new">Deal again</button><button class="btn" data-cmd="menu">Choose another</button></div></div></div>` : '');
  if (custom) fitCustom(felt.firstElementChild, box);
  if (focusKey) (felt.querySelector(`button${focusKey}:not([disabled])`) ?? felt.querySelector('.sol-win .btn'))?.focus({ preventScroll: true });
  else if (finished) felt.querySelector('.sol-win .btn')?.focus({ preventScroll: true });
}

function winTally() {
  const st = readStats()[variant];
  return st?.played ? `<br>You have won ${st.won} of ${st.played} ${esc(info(variant).name)} deal${st.played === 1 ? '' : 's'}.` : '';
}

function flash(msg) {
  const b = document.createElement('div');
  b.className = 'toast'; b.setAttribute('role', 'alert'); b.textContent = msg;
  document.getElementById('sol-area').append(b);
  setTimeout(() => b.remove(), 2000);
}

// ------------------------------------------------------------------ input
const area = document.getElementById('sol-area');
area.addEventListener('click', (e) => {
  if (!variant || e.target.closest('[data-cmd]')) return;
  if (isCustom()) {
    const el = e.target.closest('[data-c]');
    if (!el || el.disabled) return;
    return set(mod().click(state, { ...el.dataset }));
  }
  if (e.target.closest('[data-stock]')) { sel = null; return set(clickStock(state), 'flip'); }
  const cardEl = e.target.closest('[data-pile]');
  const dropEl = e.target.closest('[data-drop]');
  if (sel) {
    const to = cardEl?.dataset.pile ?? dropEl?.dataset.drop;
    if (to && to !== sel.pile) { const n = move(state, sel.pile, sel.i, to); if (n) return set(n); play('error'); }
    // A second click or tap on the selected card sends it to its best spot (this is also how double-click works).
    if (cardEl && cardEl.dataset.pile === sel.pile && Number(cardEl.dataset.i) === sel.i) return sendHome(sel.pile, sel.i);
    if (!to) { sel = null; return render(); } // the bare felt lets go
  }
  if (cardEl) {
    const pile = state.piles.find((p) => p.id === cardEl.dataset.pile);
    const i = Number(cardEl.dataset.i);
    if (grab(state, pile, i)) { sel = { pile: pile.id, i }; play('flip'); }
    else sel = null;
    render();
  }
});
function sendHome(pile, i) {
  const to = autoTarget(state, pile, i);
  sel = null;
  if (to) return set(move(state, pile, i, to));
  render();
}

// Drag and drop (rules-driven layouts): press on a card you could pick up, drag it (and the cards on
// top of it) and let go over the spot where it should go. A short press is still an ordinary click.
let drag = null, swallowClick = false;
area.addEventListener('pointerdown', (e) => {
  if (!variant || isCustom() || e.button !== 0 || !e.isPrimary) return;
  const cardEl = e.target.closest('[data-pile]');
  if (!cardEl || cardEl.closest('.sol-win')) return;
  const pile = state.piles.find((p) => p.id === cardEl.dataset.pile);
  const i = Number(cardEl.dataset.i);
  if (!pile || !grab(state, pile, i)) return;
  drag = { id: e.pointerId, pile: pile.id, i, x: e.clientX, y: e.clientY, el: cardEl, ghost: null };
});
function startDrag(e) {
  const els = drag.el.classList.contains('sol-card') ? [...drag.el.parentElement.querySelectorAll(`.sol-card[data-pile="${drag.pile}"]`)].filter((b) => Number(b.dataset.i) >= drag.i) : [drag.el];
  const r0 = els[0].getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'sol-ghost';
  ghost.style.cssText = `left:${r0.left}px;top:${r0.top}px;--card-w:${r0.width}px`;
  for (const b of els) {
    const r = b.getBoundingClientRect();
    const c = b.firstElementChild.cloneNode(true);
    c.style.cssText = `position:absolute;left:0;top:${r.top - r0.top}px`;
    ghost.append(c);
    b.classList.add('dragging');
  }
  document.body.append(ghost);
  drag.ghost = ghost; drag.els = els; drag.dx = e.clientX - r0.left; drag.dy = e.clientY - r0.top;
  sel = null;
  try { area.setPointerCapture(drag.id); } catch { /* ignore */ }
}
function dropTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  const to = el?.closest('[data-pile]')?.dataset.pile ?? el?.closest('[data-drop]')?.dataset.drop;
  if (to) return to;
  // Below the bottom of a column still counts as that column.
  for (const col of area.querySelectorAll('.sol-col')) {
    const r = col.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top) return col.dataset.drop;
  }
  return null;
}
area.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.ghost) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return; startDrag(e); }
  e.preventDefault();
  drag.ghost.style.left = `${e.clientX - drag.dx}px`;
  drag.ghost.style.top = `${e.clientY - drag.dy}px`;
});
function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.ghost) return; // just a click
  swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
  d.ghost.remove();
  for (const b of d.els) b.classList.remove('dragging');
  const to = cancel ? null : dropTarget(e.clientX, e.clientY);
  if (to && to !== d.pile) { const n = move(state, d.pile, d.i, to); if (n) return set(n); play('error'); }
  render();
}
area.addEventListener('pointerup', (e) => endDrag(e, false));
area.addEventListener('pointercancel', (e) => endDrag(e, true));
area.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.stopImmediatePropagation(); } }, true);

function command(c) {
  if (c === 'new') return start(variant, true);
  if (c === 'restart') {
    sel = null; customHistory = [];
    state = isCustom() ? mod().newGame(state.seed ?? Math.floor(Math.random() * 2 ** 31)) : newGame(variant, state.seed);
    save(); render(); return play('shuffle');
  }
  if (c === 'undo') {
    if (isCustom()) { if (!customHistory.length) return play('error'); state = customHistory.pop(); }
    else { if (!state.history.length) return play('error'); state = undo(state); }
    sel = null; save(); render(); return play('flip');
  }
  if (c === 'auto') { const n = autoPlay(state); if (n === state) return play('error'); return set(n, 'trick'); }
  if (c === 'rules') return showRules();
  if (c === 'menu') { clearInterval(timer); variant = null; history.replaceState(null, '', 'solitaire.html'); return render(); }
}
function showRules() {
  const d = document.getElementById('sol-rules');
  d.querySelector('#sol-rules-title').textContent = `How to play ${info(variant).name}`;
  const body = d.querySelector('#sol-rules-body');
  body.innerHTML = howtoHTML(info(variant));
  d.querySelector('#sol-howto-auto').checked = autoShow();
  markSeen(variant);
  if (!d.open) d.showModal();
  body.scrollTop = 0;
}
document.getElementById('sol-howto-auto').addEventListener('change', (e) => { try { localStorage.setItem(AUTO, e.target.checked ? '1' : '0'); } catch { /* ignore */ } });
board.addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) command(b.dataset.cmd); });
// Keys: Escape lets go of a selected card; Ctrl+Z (Cmd+Z) is Undo.
document.addEventListener('keydown', (e) => {
  if (!variant || document.getElementById('sol-rules').open || e.target.closest?.('input, textarea, select')) return;
  if (e.key === 'Escape' && sel) { sel = null; render(); }
  else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !(isCustom() && mod().timed)) { e.preventDefault(); command('undo'); }
});
chooser.addEventListener('click', (e) => { const t = e.target.closest('[data-v]'); if (t) { e.preventDefault(); start(t.dataset.v); } });
window.addEventListener('dc:settings', () => (variant ? render() : renderChooser()));
// A new window size (or a turned tablet) re-plans the table.
let lastSize = '';
let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => { resizeQueued = false; const size = `${innerWidth}x${innerHeight}`; if (variant && size !== lastSize) { lastSize = size; render(); } });
});

if (variant) start(variant); else render();
