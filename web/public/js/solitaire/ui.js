// Solitaire parlor UI: layout picker + board for both the rules-driven "build" engine and the
// custom games. Click a card (or stack) then a destination; double-click sends a card home.
import { VARIANTS, newGame, grab, move, clickStock, autoTarget, autoPlay, isWon, undo, scoreOf, scoreName } from './engine.js';
import { CUSTOM } from './custom/index.js';
import { cardHTML, backHTML, cardName, paintFelt } from '../skin.js';
import { mountChrome, esc } from '../header.js';
import { play } from '../core/sound.js';
import { SOLITAIRE } from '../catalog.js';

mountChrome('solitaire');

const params = new URLSearchParams(location.search);
const known = (id) => Boolean(VARIANTS[id] || CUSTOM[id]);
let variant = known(params.get('v')) ? params.get('v') : null;
let state = null, sel = null, customHistory = [], timer = null;
const KEY = (v) => `dc.sol.${v}.v2`;
const STATS = 'dc.sol.stats';
const isCustom = () => Boolean(CUSTOM[variant]);
const mod = () => CUSTOM[variant];
const info = (id) => VARIANTS[id] ?? CUSTOM[id];

const readStats = () => { try { return JSON.parse(localStorage.getItem(STATS) || '{}'); } catch { return {}; } };
function bumpStat(v, field) { const st = readStats(); st[v] = st[v] ?? { played: 0, won: 0 }; st[v][field]++; try { localStorage.setItem(STATS, JSON.stringify(st)); } catch { /* ignore */ } }
function save() { try { localStorage.setItem(KEY(variant), JSON.stringify(isCustom() ? state : { ...state, history: state.history.slice(-30) })); } catch { /* ignore */ } }
function load(v) { try { const s = JSON.parse(localStorage.getItem(KEY(v))); return s?.variant === v ? s : null; } catch { return null; } }

const won = () => (isCustom() ? mod().isWon(state) : isWon(state));
const over = () => (isCustom() ? mod().isOver(state) : isWon(state));

function start(v, fresh = false) {
  variant = v; sel = null; customHistory = [];
  history.replaceState(null, '', `/solitaire.html?v=${v}`);
  const saved = !fresh && load(v);
  state = saved || (isCustom() ? mod().newGame(Math.floor(Math.random() * 2 ** 31)) : newGame(v));
  if (!saved) bumpStat(v, 'played');
  state.wonCounted = state.wonCounted ?? false;
  play('shuffle');
  save(); render(); startTimer();
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
    <img class="sol-banner" src="/assets/art/lobby/solitaire-banner.png" width="1536" height="480" alt="" decoding="async">
    ${SOLITAIRE.map((g) => `<div class="group"><div class="group-head"><h3>${g.title}</h3></div><div class="tiles">${g.games.map(([name, id]) => {
      const v = info(id);
      return `<a class="tile ready sol-tile" href="/solitaire.html?v=${id}" data-v="${id}"><div class="tile-body"><b>${esc(name)}</b><span>${esc(v.blurb)}</span>
        ${stats[id] ? `<span style="color:var(--brass-2)">Won ${stats[id].won} of ${stats[id].played}</span>` : ''}</div></a>`;
    }).join('')}</div></div>`).join('')}`;
}

const PILE_LABEL = { stock: 'Stock', waste: 'Waste', cell: 'Cell', reserve: 'Reserve', bouquet: 'Bouquet' };
const RANK_OF = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function pileHTML(p) {
  const isSel = (i) => sel && sel.pile === p.id && i >= sel.i;
  if (p.type === 'tableau') {
    let y = 0;
    const n = p.cards.length;
    const gapUp = n > 14 ? 16 : 24, gapDown = 8;
    const cards = p.cards.map((c, i) => {
      const html = `<button class="sol-card${isSel(i) ? ' sel' : ''}" style="top:${y}px" data-pile="${p.id}" data-i="${i}" aria-label="${c.up ? cardName(c) : 'face-down card'}">${c.up ? cardHTML(c) : backHTML()}</button>`;
      y += c.up ? gapUp : gapDown;
      return html;
    }).join('');
    return `<div class="sol-col" data-drop="${p.id}" style="height:${Math.max(120, y + 100)}px"><span class="sol-empty" data-drop="${p.id}"></span>${cards}</div>`;
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
  return `<div class="sol-pile" data-drop="${p.id}">${guide}${inner}<span class="sol-label">${label}</span></div>`;
}

function renderStandard() {
  const top = state.piles.filter((p) => p.type !== 'tableau' && p.type !== 'bouquet');
  const tabs = state.piles.filter((p) => p.type === 'tableau');
  const bouquet = state.piles.find((p) => p.type === 'bouquet');
  const wide = tabs.length >= 10 || top.length >= 12;
  const pickBase = state.piles.some((p) => p.base === 'global') && !state.baseRank;
  return `<div class="sol-board${wide ? ' wide' : ''}${tabs.length > 13 ? ' xwide' : ''}" style="--cols:${tabs.length}">
    ${pickBase ? '<div class="banner-inline">First move a card to a foundation: its rank starts every foundation.</div>' : ''}
    <div class="sol-top">${top.map(pileHTML).join('')}</div>
    ${bouquet ? pileHTML(bouquet) : ''}
    <div class="sol-tableau">${tabs.map(pileHTML).join('')}</div></div>`;
}

function render() {
  if (!variant) { chooser.hidden = false; board.hidden = true; renderChooser(); document.getElementById('sol-title').textContent = 'Solitaire'; document.title = 'Solitaire · Dealers Choice'; return; }
  chooser.hidden = true; board.hidden = false;
  const v = info(variant);
  document.getElementById('sol-title').textContent = v.name;
  document.title = `${v.name} · Dealers Choice`;
  document.getElementById('sol-sub').textContent = v.blurb;
  const custom = isCustom();
  const body = custom ? mod().render(state) : renderStandard();
  const status = custom ? mod().status(state) : `${scoreName(state)}: ${scoreOf(state)}`;
  document.getElementById('sol-status').textContent = `${status} · moves ${state.moves}`;
  const timed = custom && mod().timed;
  document.querySelector('[data-cmd="undo"]').hidden = timed;
  document.querySelector('[data-cmd="auto"]').hidden = custom;
  document.querySelector('[data-cmd="restart"]').hidden = timed;
  const finished = over();
  const felt = document.getElementById('sol-area');
  paintFelt(felt);
  felt.innerHTML = body + (finished ? `<div class="overlay sol-win"><div class="card-panel"><h3>${won() ? 'You won!' : 'Game over'}</h3><p>${esc(status)}.</p>
    <div class="row"><button class="btn primary" data-cmd="new">Deal again</button><button class="btn" data-cmd="menu">Choose another</button></div></div></div>` : '');
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
    if (cardEl && cardEl.dataset.pile === sel.pile && Number(cardEl.dataset.i) === sel.i) { sel = null; return render(); }
  }
  if (cardEl) {
    const pile = state.piles.find((p) => p.id === cardEl.dataset.pile);
    const i = Number(cardEl.dataset.i);
    if (grab(state, pile, i)) { sel = { pile: pile.id, i }; play('flip'); }
    else sel = null;
    render();
  }
});
area.addEventListener('dblclick', (e) => {
  if (!variant || isCustom()) return;
  const cardEl = e.target.closest('[data-pile]');
  if (!cardEl) return;
  const to = autoTarget(state, cardEl.dataset.pile, Number(cardEl.dataset.i));
  if (to) set(move(state, cardEl.dataset.pile, Number(cardEl.dataset.i), to));
});

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
  if (c === 'rules') {
    const d = document.getElementById('sol-rules');
    d.querySelector('#sol-rules-title').textContent = `How to play ${info(variant).name}`;
    d.querySelector('#sol-rules-body').innerHTML = info(variant).how;
    return d.showModal();
  }
  if (c === 'menu') { clearInterval(timer); variant = null; history.replaceState(null, '', '/solitaire.html'); return render(); }
}
board.addEventListener('click', (e) => { const b = e.target.closest('[data-cmd]'); if (b) command(b.dataset.cmd); });
chooser.addEventListener('click', (e) => { const t = e.target.closest('[data-v]'); if (t) { e.preventDefault(); start(t.dataset.v); } });
window.addEventListener('dc:settings', () => (variant ? render() : renderChooser()));

if (variant) start(variant); else render();
