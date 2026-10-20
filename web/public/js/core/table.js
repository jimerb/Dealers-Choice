// Generic card-table runner. A game module provides pure rules + AI + a view model; this file
// renders it, paces computer turns, plays sounds, saves progress and handles settings and How to play.
//
// Game module contract (default export):
//   id, title, howto (the How to play guide; see core/howto.js), settings?: [{key,label,options:[[value,label]],default}]
//   seats?: fixed player count (newGame gets that many names; saved games are trimmed to it).
//           Without it newGame gets MAX_SEATS names and seats as many as its settings ask for.
//           Computer seats are filled from the cast (core/cast.js); 'again' should keep s.names.
//   newGame({names, seed, opts}) -> state      (state must be JSON-serializable)
//   actor(state) -> seat number | 'auto' | null   (0 = the human; 'auto' = timed step; null = over)
//   act(state, action) -> state                  (human action; throw Error('...') if illegal)
//   aiAct(state) -> state                        (acts for actor(state); must also handle seat 0 for tests)
//   view(state, ui) -> view model (see renderTable)
//   delay?(state) -> ms
// View model extras: vm.board (HTML for a full-width row above the center, e.g. the cribbage board),
// vm.trump ({ suit, caption? }: the trump plaque in the felt's corner; see core/pieces.js).
// Engines may set state.fx = ['card', ...] (sound event names) on transitions.
import { variantTip } from './tip.js';
import { GAMES } from '../catalog.js';
import { cardHTML, backHTML, cardName, paintFelt, preloadSkin } from '../skin.js';
import { mountChrome, esc, playerName, playerAvatar, avatarHTML } from '../header.js';
import { play } from './sound.js';
import { pickOpponents, castByName, renamePlaceholders } from './cast.js';
import { trumpPlaqueHTML } from './pieces.js';
import { howtoHTML, setupHowto } from './howto.js';

const MAX_SEATS = 6;
const pace = () => { try { return localStorage.getItem('dc.speed') === 'fast' ? 0.45 : 1; } catch { return 1; } };

export function cardButton(card, { act = 'play', legal = false, selected = false, from = null, dim = false } = {}) {
  const cls = ['slot', legal ? 'legal' : '', selected ? 'selected' : '', dim ? 'dim' : ''].join(' ');
  return `<button type="button" class="${cls}" data-act="${act}" data-id="${card.id}"${from !== null ? ` data-from="${from}"` : ''} ${legal ? '' : 'disabled'} aria-pressed="${selected}" aria-label="${cardName(card)}${legal ? (act === 'select' ? ', selectable' : ', playable') : ''}">${cardHTML(card)}</button>`;
}

/** Trick layout: plays = [{pos, card}] ; winPos highlights one. */
export function trickHTML(plays, winPos = null) {
  return `<div class="trick" aria-label="Cards on the table">${plays.map((p) =>
    `<div class="play pos-${p.pos}${p.pos === winPos ? ' win' : ''}">${cardHTML(p.card)}</div>`).join('')}</div>`;
}
export const panel = (title, body, style = '') => `<div class="card-panel" style="${style}"><h3>${title}</h3>${body}</div>`;
export const btn = (label, act, extra = '', primary = false) => `<button class="btn ${primary ? 'primary' : ''}" data-act="${act}" ${extra}>${label}</button>`;
export const cardsRow = (cards, w = 54) => `<div class="row" style="--card-w:${cw(w)};gap:4px">${cards.map((c) => cardHTML(c)).join('')}</div>`;
export const scoreTable = (heads, rows) => `<table class="score"><thead><tr><th></th>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td>${r.slice(1).map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** A card width that grows and shrinks with the table: `px` is its size beside the old 84px card. */
export const cw = (px) => `calc(${px}px * var(--k, 1))`;

// -------- fitting the table to the screen (card-game pages: main.cardgame; see table.css)
const BASE_CW = 84; // the card width the px sizes in the games were drawn for
/**
 * Sizes the felt to the rest of the screen and picks the largest cards that keep everything on it in
 * view: the hand, the other seats, the trick or panel in the middle. Long hands overlap more instead
 * of running off the side. When even the smallest cards do not fit, the felt grows and the page scrolls.
 */
export function fitTable(felt) {
  const main = felt.closest('.cardgame');
  if (!main || !felt.isConnected) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const phone = vw <= 760;
  felt.classList.remove('overfull');
  const top = felt.getBoundingClientRect().top + window.scrollY;
  const minH = vh < 560 ? 300 : phone ? 420 : 460;
  const h = Math.max(minH, Math.floor(vh - top - (phone ? 6 : 14)));
  main.style.setProperty('--felt-h', `${h}px`);
  const cs = getComputedStyle(felt);
  const iw = felt.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ih = felt.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const minCw = phone ? 40 : vh < 560 ? 44 : 58;
  const fits = (c) => {
    applyCw(felt, c, minCw);
    return felt.scrollHeight <= felt.clientHeight + 1 && felt.scrollWidth <= felt.clientWidth + 1;
  };
  // The largest card width that fits, to within a pixel or two: a few layout passes, no repaint.
  let hi = Math.max(minCw, Math.min(200, ih / 3.3, iw / 4.2));
  if (fits(hi)) return;
  let lo = minCw;
  if (!fits(lo)) { felt.classList.add('overfull'); return; }
  while (hi - lo > 1.5) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  applyCw(felt, lo, minCw);
}
function applyCw(felt, c, minCw) {
  felt.style.setProperty('--cw', `${c.toFixed(1)}px`);
  felt.style.setProperty('--k', (c / BASE_CW).toFixed(3));
  for (const hand of felt.querySelectorAll('.hand')) fitHand(hand, c * 1.06, minCw);
}
/** One row of cards: as big as the table allows, overlapping just enough to fit the width. */
function fitHand(hand, want, minCw) {
  const n = hand.children.length;
  if (!n) return;
  const avail = (hand.parentElement?.clientWidth ?? 600) - 8;
  const MIN_VIS = 0.27, MAX_VIS = 0.62;
  let w = want, vis = n > 1 ? (avail - w) / ((n - 1) * w) : 1;
  if (vis < MIN_VIS) { vis = MIN_VIS; w = Math.max(Math.min(minCw, want), avail / (1 + (n - 1) * MIN_VIS)); }
  hand.style.setProperty('--card-w', `${w.toFixed(1)}px`);
  hand.style.setProperty('--vis', Math.min(MAX_VIS, vis).toFixed(3));
}
/** Keeps a felt fitted: after each render (call fit()), on resize, and once the fonts arrive. */
export function autoFit(felt) {
  let raf = 0;
  const fit = () => { cancelAnimationFrame(raf); fitTable(felt); };
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitTable(felt)); };
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
  document.fonts?.ready.then(later);
  // the top bar can change height on its own (a note shown or dismissed, scores wrapping)
  const bar = document.querySelector('.cardgame .table-top');
  if (bar && 'ResizeObserver' in window) new ResizeObserver(later).observe(bar);
  const main = felt.closest('.cardgame');
  if (main) new MutationObserver(later).observe(main, { childList: true });
  return fit;
}

export function mountTable(game) {
  mountChrome(game.id);
  preloadSkin();
  document.title = `${game.title} · Dealers Choice`;
  const KEY = `dc.game.${game.id}.v1`;
  const OPTS = `dc.game.${game.id}.opts`;
  const readOpts = () => {
    const d = Object.fromEntries((game.settings ?? []).map((s) => [s.key, s.default]));
    try { return { ...d, ...JSON.parse(localStorage.getItem(OPTS) || '{}') }; } catch { return d; }
  };
  // A new game seats you plus fresh picks from the cast; saved games keep whoever was sitting in.
  const names = () => [playerName(), ...pickOpponents((game.seats ?? MAX_SEATS) - 1, { gameId: game.id }).map((c) => c.name)];
  const fresh = () => game.newGame({ names: names(), seed: Math.floor(Math.random() * 2 ** 31), opts: readOpts() });
  const load = () => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s || s.v !== game.version) return null;
      // Older builds handed every game six names; keep only the seats this game has.
      if (game.seats && Array.isArray(s.names) && s.names.length > game.seats) s.names = s.names.slice(0, game.seats);
      // Older builds also named the computer seats 'West', 'North' …; seat members of the cast there.
      s.names = renamePlaceholders(s.names, { gameId: game.id });
      return s;
    } catch { return null; }
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } };

  let state = load();
  if (!state) state = fresh();
  save(); // save at once so a reload keeps the same opponents (new, or renamed in an old save)
  const ui = { selected: new Set() };
  let timer = null;
  let howto = null;
  const fit = autoFit(document.getElementById('felt'));

  function set(next) {
    state = next;
    for (const f of state.fx ?? []) play(f);
    state.fx = [];
    save(); render(); schedule();
  }
  function schedule() {
    clearTimeout(timer);
    const a = game.actor(state);
    if (a === null || a === 0) return;
    const ms = (game.delay?.(state) ?? (a === 'auto' ? 1200 : 750)) * pace();
    timer = setTimeout(() => {
      if (howto?.isOpen()) return schedule(); // the table waits while you read How to play
      try { set(game.aiAct(state)); } catch (e) { console.error(e); }
    }, ms);
  }

  // -------- render
  const POS_AREA = { south: 'south', west: 'west', east: 'east', north: 'top', nw: 'top', ne: 'top' };
  function seatHTML(st) {
    const cls = ['plate', st.mine ? 'me' : '', st.partner ? 'partner' : '', st.turn ? 'turn' : ''].join(' ');
    // Portraits come from the seat's saved name (plate names may carry extras, e.g. chip counts).
    const who = state.names?.[st.seat] ?? st.name;
    const guest = st.mine ? null : castByName(who);
    const plate = `<span class="${cls}"${guest ? ` title="${esc(guest.bio)}"` : ''}>${avatarHTML(st.name, st.mine ? playerAvatar() : guest?.portrait)}${esc(st.name)}${st.mine ? ' (you)' : ''}${st.partner ? ' · partner' : ''}
      ${st.dealer ? '<span class="dealer" title="Dealer">D</span>' : ''}${st.tag ? `<span class="bubble${st.tagMuted ? ' pass' : ''}">${esc(st.tag)}</span>` : ''}</span>`;
    let cards = '';
    if (st.faceUp?.length) {
      const pl = new Set(st.playable ?? []);
      cards = `<div class="faceup" style="--card-w:${cw(st.faceUpWidth ?? 44)}" aria-label="${esc(st.faceUpLabel ?? 'Face-up cards')}">${st.faceUp.map((c) =>
        pl.size ? cardButton(c, { legal: pl.has(c.id), from: st.seat, dim: !pl.has(c.id) }) : cardHTML(c)).join('')}</div>`;
    } else if (st.count) {
      const vertical = st.pos === 'west' || st.pos === 'east';
      const n = Math.min(st.count, 20);
      cards = `<div class="backs${vertical ? ' vertical' : ''}" aria-label="${st.count} cards">${Array.from({ length: n }, () => backHTML()).join('')}</div>${st.count > 20 ? `<span class="count">${st.count}</span>` : ''}`;
    }
    if (st.extra) cards += st.extra;
    return { area: POS_AREA[st.pos], html: `<div class="seat pos-${st.pos}">${st.pos === 'south' ? '' : plate}${cards}${st.pos === 'south' ? plate : ''}</div>` };
  }

  function handHTML(h) {
    if (!h) return '';
    const legal = new Set(h.legal ?? []);
    const mode = h.mode ?? 'play';
    return `<div class="hand${h.cards.length > 13 ? ' tight' : ''}" role="group" aria-label="Your hand">${h.cards.map((c) =>
      cardButton(c, { act: mode, legal: legal.has(c.id), selected: ui.selected.has(c.id), dim: h.legal && !legal.has(c.id) && mode === 'play' })).join('')}</div>`;
  }

  function render() {
    const vm = game.view(state, ui);
    document.getElementById('game-title').textContent = game.title;
    document.getElementById('sub').textContent = vm.subtitle ?? '';
    document.getElementById('scores').innerHTML = (vm.scores ?? []).map((s) =>
      `<span class="score-chip${s.us ? ' us' : ''}"><b>${esc(s.label)}</b>${esc(String(s.value))}</span>`).join('');
    const felt = document.getElementById('felt');
    paintFelt(felt);
    felt.classList.toggle('with-board', !!vm.board);
    const areas = { top: [], west: [], east: [], south: [] };
    for (const st of vm.seats) { const r = seatHTML(st); areas[r.area].push(r.html); }
    const south = vm.seats.find((s) => s.pos === 'south');
    felt.innerHTML = `
      <div class="area-top">${areas.top.join('')}</div>
      ${vm.board ? `<div class="area-board">${vm.board}</div>` : ''}${vm.trump ? trumpPlaqueHTML(vm.trump.suit, vm.trump) : ''}
      <div class="area-west">${areas.west.join('')}</div>
      <div class="area-east">${areas.east.join('')}</div>
      <div class="center">${vm.center ?? ''}${vm.banner ? `<div class="banner" role="status">${esc(vm.banner)}</div>` : ''}${vm.overlay ? `<div class="overlay">${vm.overlay}</div>` : ''}</div>
      <div class="area-south">${handHTML(vm.hand)}${south ? areas.south.join('') : ''}</div>`;
    const side = (vm.side ?? []).map((p) => `<section class="panel"><h2>${p.title}</h2>${p.html}</section>`).join('');
    const log = (state.log ?? []).slice(-14).reverse().map((l) => `<div>${esc(l)}</div>`).join('');
    document.getElementById('side').innerHTML = `${side}<section class="panel"><h2>Table talk</h2><div class="log" aria-live="polite">${log}</div></section>`;
    fit();
  }

  // -------- input
  document.getElementById('felt').addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const a = { ...el.dataset };
    if (a.act === 'select') {
      const vm = game.view(state, ui);
      const max = vm.hand?.maxSelect ?? 99;
      if (ui.selected.has(a.id)) ui.selected.delete(a.id);
      else {
        if (max === 1) ui.selected.clear();
        if (ui.selected.size < max) ui.selected.add(a.id);
      }
      play('flip');
      render();
      return;
    }
    if (a.withSel !== undefined) a.ids = [...ui.selected];
    try {
      const next = game.act(state, a);
      ui.selected.clear();
      set(next);
    } catch (err) {
      play('error');
      flash(err.message);
    }
  });

  function flash(msg) {
    const b = document.createElement('div');
    b.className = 'toast'; b.setAttribute('role', 'alert'); b.textContent = msg;
    document.getElementById('felt').append(b);
    setTimeout(() => b.remove(), 2200);
  }

  // -------- top bar buttons
  document.getElementById('btn-new').addEventListener('click', () => openSettings(true));
  // Only games with real variants (listed in the catalog, the same list as the lobby badge) get the note.
  const variants = GAMES.find((g) => g.id === game.id)?.variants ?? [];
  if (variants.length) variantTip(game.id, `This game has ${variants.length} variants: ${variants.map(esc).join(' and ')}. Choose <b>New game</b> to pick one.`);
  function openSettings() {
    const d = document.getElementById('game-settings');
    const o = readOpts();
    d.querySelector('#gs-title').textContent = `New ${game.title} game`;
    d.querySelector('#gs-body').innerHTML = (game.settings ?? []).map((s) => `<div class="field"><label for="gs-${s.key}">${s.label}</label>
      <select id="gs-${s.key}" data-key="${s.key}">${s.options.map(([v, l]) => `<option value="${v}" ${String(o[s.key]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')
      + '<p style="color:var(--ink-3);font-size:14px;margin:0 0 8px">Starting a new game ends the one in progress.</p>';
    d.showModal();
  }
  document.getElementById('gs-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const o = {};
    document.querySelectorAll('#gs-body select').forEach((s) => {
      const def = (game.settings ?? []).find((x) => x.key === s.dataset.key).default;
      o[s.dataset.key] = typeof def === 'number' ? Number(s.value) : s.value;
    });
    try { localStorage.setItem(OPTS, JSON.stringify(o)); } catch { /* ignore */ }
    document.getElementById('game-settings').close();
    ui.selected.clear();
    set({ ...fresh(), fx: ['shuffle'] });
  });
  document.getElementById('gs-cancel').addEventListener('click', () => document.getElementById('game-settings').close());

  window.addEventListener('dc:settings', () => {
    if (state.names) state = { ...state, names: [playerName(), ...state.names.slice(1)] };
    save(); render();
  });

  render();
  howto = setupHowto({ id: game.id, title: () => `How to play ${game.title}`, body: () => howtoHTML(game) });
  schedule();
}
