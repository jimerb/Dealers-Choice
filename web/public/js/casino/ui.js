// Casino: the chooser (game tiles by group, each with its stakes) and the game shell that opens
// in place, the same way the solitaire parlor does. All money goes through the shared bank
// (js/core/bank.js), shown in the site header on this page and on each game's top bar.
//
// ---------------------------------------------------------------- game module interface
// Each js/casino/games/<id>.js default-exports:
//   {
//     id, name,            // match the catalog entry
//     ready,               // true once the game deals; stubs are false
//     howto,               // HTML for the How to play dialog (.howto-section blocks)
//     options,             // planned Options (strings), shown until the game has its own
//     todo,                // what still needs wiring (strings)
//     layout(opts),        // the betting layout as an SVG string, no DOM (tested in node)
//     mount(el, ctx),      // draw into the felt `el` and start listening
//     unmount(),           // stop listening; settle anything in flight; empty `el`
//     action(),            // the bet bar's main button (Deal / Spin / Roll / Play)
//     clear(), rebet(),    // the bet bar's Clear and Rebet buttons
//   }
// ctx, handed to mount():
//   ctx.game         the catalog entry ({ id, name, action, machine, ... })
//   ctx.stakes       { id, min, max (null = no limit), denom (machines) }; ctx.stakesText is it in words
//   ctx.bank         the shared bank: balance, canAfford(n), debit(n, {game}), credit(n, {game}),
//                    recordHand(game, net) (debit wagers, credit returns, record once per hand)
//   ctx.chip()       the chip value picked on the rack
//   ctx.play(name)   a sound effect from js/core/sound.js (chips, win, lose, error, card, deal ...)
//   ctx.message(t)   the message line under the felt
//   ctx.setTotal(n)  the amount on the table, shown in the bet bar
//   ctx.setButtons({ action, clear, rebet })  enable or disable the bet bar's buttons
//   ctx.checkBroke() after a hand: opens the broke dialog if the bank can't cover the table
//                    minimum; returns true when it did
import { mountChrome, esc } from '../header.js';
import { play } from '../core/sound.js';
import { paintFelt } from '../skin.js';
import { getBank, money, TIERS } from '../core/bank.js';
import { CASINO, gameById, stakesFor, stakesById, stakesLabel, stakesShort, rackFor } from './catalog.js';
import { chipButtonHTML } from './chips.js';
import { MODULES } from './games/index.js';

mountChrome('casino');
const bank = getBank();

const STAKES_KEY = 'dc.casino.stakes';
const readStakes = () => { try { return JSON.parse(localStorage.getItem(STAKES_KEY) || '{}') ?? {}; } catch { return {}; } };
const saveStakes = (id, s) => { try { localStorage.setItem(STAKES_KEY, JSON.stringify({ ...readStakes(), [id]: s })); } catch { /* ignore */ } };

const $ = (id) => document.getElementById(id);
const chooser = $('chooser');
const room = $('room');
const felt = $('cz-felt');

let current = null; // { game, mod, stakes }
let chip = 0;
let held = null;       // while a result is still being revealed: the bank as it was, shown instead
let heldEvents = [];   // bank news (tier up, loan repaid ...) waiting for the reveal

// ------------------------------------------------------------------ bank pill (site header)
const pill = document.createElement('a');
pill.className = 'cz-pill';
pill.href = 'casino.html';
pill.title = 'Your casino bank';
document.querySelector('.site-header .who')?.prepend(pill);

const tierBadge = (t) => `<span class="cz-tier" style="--tier:${t.color}"><span class="cz-tier-dot" aria-hidden="true"></span>${t.name}</span>`;

function paintBank() {
  const s = held ?? bank.get();
  const t = TIERS[s.tier];
  pill.style.setProperty('--tier', t.color);
  pill.innerHTML = `<span class="cz-pill-chip" aria-hidden="true"></span><span class="visually-hidden">Bank, ${t.name} tier: </span><b>${money(s.bank)}</b>`;
  const top = $('cz-bank');
  top.style.setProperty('--tier', t.color);
  top.innerHTML = `<span class="cz-pill-chip" aria-hidden="true"></span>Bank <b>${money(s.bank)}</b>${s.loan ? ` <small>loan ${money(s.loan)}</small>` : ''}`;
  if (!current) renderBankPanel();
  else paintRack();
}

const EVENT_TEXT = {
  repaid: (e) => `Your ${money(e.amount)} loan has been repaid from your winnings.`,
  upgrade: (e) => `Credit extended! You're now ${TIERS[e.to].name}.`,
  hall: (e) => `Hall of Fame! ${e.entry.name} reached ${money(e.entry.bank)}. The bank starts over at $5,000.`,
  loan: (e) => `${money(e.amount)} loan added to your bank.`,
  reset: () => 'Bank reset to $5,000.',
};
const announce = (events) => { for (const e of events) if (EVENT_TEXT[e.type]) toast(EVENT_TEXT[e.type](e), e.type === 'upgrade' || e.type === 'hall'); };
bank.subscribe((_, events) => {
  if (held) { heldEvents.push(...events); return; }
  paintBank();
  announce(events);
});
/** Keep showing the bank as it is now until the returned function is called (a game settles at
 *  once but reveals the result after its animation). */
function holdBank() {
  held = structuredClone(bank.get());
  heldEvents = [];
  let done = false;
  return () => {
    if (done) return;
    done = true;
    held = null;
    paintBank();
    announce(heldEvents.splice(0));
  };
}

function toast(msg, big = false) {
  const t = document.createElement('div');
  t.className = `cz-toast${big ? ' big' : ''}`;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.append(t);
  if (big) play('win');
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// ------------------------------------------------------------------ chooser
const ICONS = {
  cards: '<rect x="14" y="10" width="26" height="36" rx="3"/><rect x="26" y="16" width="26" height="36" rx="3" transform="rotate(12 39 34)"/>',
  wheel: '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="12"/><path d="M32 10v10M32 44v10M10 32h10M44 32h10M16.4 16.4l7 7M40.6 40.6l7 7M16.4 47.6l7-7M40.6 23.4l7-7"/>',
  dice: '<rect x="8" y="18" width="24" height="24" rx="5"/><rect x="34" y="12" width="22" height="22" rx="5" transform="rotate(14 45 23)"/><circle cx="15" cy="25" r="2" class="f"/><circle cx="25" cy="35" r="2" class="f"/><circle cx="20" cy="30" r="2" class="f"/>',
  reels: '<rect x="8" y="14" width="48" height="36" rx="5"/><path d="M24 14v36M40 14v36M8 32h48"/>',
  keno: '<circle cx="18" cy="20" r="6"/><circle cx="32" cy="20" r="6"/><circle cx="46" cy="20" r="6" class="f"/><circle cx="18" cy="34" r="6" class="f"/><circle cx="32" cy="34" r="6"/><circle cx="46" cy="34" r="6"/><circle cx="25" cy="48" r="6"/><circle cx="39" cy="48" r="6" class="f"/>',
};

function renderBankPanel() {
  const el = $('cz-bankpanel');
  if (!el) return;
  const s = bank.get();
  const t = TIERS[s.tier];
  const next = s.tier < TIERS.length - 1 ? `Next tier at ${money(t.next)}` : `Hall of Fame at ${money(t.next)}`;
  const loanLine = s.loan ? `Loan outstanding: <b>${money(s.loan)}</b>. It is repaid automatically once your bank reaches ${money(t.next)}.`
    : bank.loanEligible() ? `The loan desk can lend you <b>${money(bank.loanAmount())}</b>.` : `Loans are offered when the bank drops under $1,000.`;
  el.style.setProperty('--tier', t.color);
  el.innerHTML = `<div class="cz-bank-main"><span class="cz-bank-chip" aria-hidden="true"></span>
      <div><span class="cz-bank-label">Your bank</span><b class="cz-bank-amt">${money(s.bank)}</b>${tierBadge(t)}<span class="cz-bank-next">${next}</span></div></div>
    <p class="cz-bank-loan">${loanLine}${bank.sessionNet ? ` This visit: <b>${bank.sessionNet > 0 ? '+' : ''}${money(bank.sessionNet)}</b>.` : ''}</p>
    <div class="row">${bank.loanEligible() ? `<button class="btn sm primary" type="button" data-bank="loan">Take a ${money(bank.loanAmount())} loan</button>` : ''}
      <button class="btn sm" type="button" data-bank="stats">Stats</button>
      <button class="btn sm" type="button" data-bank="reset">Reset to $5,000</button></div>
    ${s.hall.length ? `<p class="cz-hall">Hall of Fame: ${s.hall.map((h) => `${esc(h.name)} (${esc(h.date)})`).join(', ')}</p>` : ''}`;
}

function renderChooser() {
  const saved = readStakes();
  chooser.innerHTML = `<div class="section-head" style="margin-top:8px"><h2>Casino</h2><span style="color:var(--ink-3)">${CASINO.reduce((n, g) => n + g.games.length, 0)} games · one bank</span></div>
    <p class="cz-intro">One bankroll plays every table and machine. Pick your limits on a game, then sit down. Win big enough and your credit goes up a tier.</p>
    <div class="cz-bankpanel" id="cz-bankpanel"></div>
    ${CASINO.map((grp, gi) => `<div class="group cz-group-${gi}"><div class="group-head"><h3>${grp.title}</h3><span>${grp.blurb}</span></div><div class="tiles">${grp.games.map((g) => {
      const mod = MODULES[g.id];
      const st = stakesById(g, saved[g.id]);
      return `<div class="tile cz-tile${mod.ready ? ' ready' : ''}" data-game="${g.id}">
        <div class="cz-tile-art"><svg viewBox="0 0 64 64" aria-hidden="true">${ICONS[g.icon]}</svg><span class="tile-badge">${mod.ready ? 'Open now' : 'Being built'}</span></div>
        <div class="tile-body"><b>${esc(g.name)}</b><span>${esc(g.blurb)}</span>
          <div class="cz-stakes" role="radiogroup" aria-label="${g.machine ? 'Denomination' : 'Table limits'} for ${esc(g.name)}">${stakesFor(g).map((s) =>
            `<button type="button" role="radio" aria-checked="${s.id === st.id}" data-stakes="${s.id}" title="${stakesLabel(s)}">${stakesShort(s)}</button>`).join('')}</div>
          <a class="btn sm${mod.ready ? ' primary' : ''} cz-sit" href="casino.html?g=${g.id}&s=${st.id}" data-open="${g.id}">${mod.ready ? 'Sit down' : 'Look at the table'}</a>
        </div></div>`;
    }).join('')}</div></div>`).join('')}`;
  renderBankPanel();
}

chooser.addEventListener('click', (e) => {
  const st = e.target.closest('[data-stakes]');
  if (st) {
    const tile = st.closest('[data-game]');
    const id = tile.dataset.game;
    saveStakes(id, st.dataset.stakes);
    tile.querySelectorAll('[data-stakes]').forEach((b) => b.setAttribute('aria-checked', String(b === st)));
    tile.querySelector('.cz-sit').href = `casino.html?g=${id}&s=${st.dataset.stakes}`;
    play('click');
    return;
  }
  const open = e.target.closest('[data-open]');
  if (open) { e.preventDefault(); openGame(open.dataset.open, readStakes()[open.dataset.open], { push: true }); return; }
  const b = e.target.closest('[data-bank]');
  if (b) {
    if (b.dataset.bank === 'loan') bank.takeLoan();
    if (b.dataset.bank === 'stats') showStats();
    if (b.dataset.bank === 'reset') confirmReset();
  }
});

// ------------------------------------------------------------------ game shell
/** Keep the address in step: the screen's own history, and the site shell's address bar. */
function syncShell() {
  try { if (window.top !== window) window.top.history.replaceState(window.top.history.state, '', location.pathname + location.search); } catch { /* other origin */ }
}
function setAddress(url, push) {
  if (push) history.pushState({ cz: true }, '', url); else history.replaceState(history.state, '', url);
  syncShell();
}

function openGame(id, stakesId, { push = false } = {}) {
  const game = gameById(id);
  if (!game) return;
  closeGame();
  const stakes = stakesById(game, stakesId);
  saveStakes(id, stakes.id);
  current = { game, stakes, mod: MODULES[id] };
  setAddress(`casino.html?g=${id}&s=${stakes.id}`, push);
  document.body.classList.add('cz-playing');
  chooser.hidden = true;
  room.hidden = false;
  $('cz-title').textContent = game.name;
  $('cz-subtitle').textContent = game.subtitle ?? '';
  $('cz-stakes').textContent = game.machine ? `${stakesLabel(stakes)}` : `Table limits ${stakesLabel(stakes)}`;
  $('cz-action').textContent = game.action;
  document.title = `${game.name} · Casino · Dealers Choice`;
  room.dataset.game = id;
  const rack = rackFor(stakes);
  if (!rack.includes(chip)) chip = rack[0];
  paintFelt(felt);
  paintBank();
  paintRack();
  current.mod.mount(felt, makeCtx());
  window.scrollTo(0, 0);
  checkBroke();
}

function closeGame() {
  if (!current) return;
  const { mod } = current;
  current = null; // first, so nothing the game does while unmounting can reach the shell
  mod.unmount();
  held = null;
  if (heldEvents.length) announce(heldEvents.splice(0));
  delete room.dataset.game;
  document.body.classList.remove('cz-playing');
  if (dlg.open) dlg.close();
}

function showChooser({ address = true } = {}) {
  closeGame();
  if (address) setAddress('casino.html', false);
  document.title = 'Casino · Dealers Choice';
  room.hidden = true;
  chooser.hidden = false;
  renderChooser();
}

function makeCtx() {
  const { game, stakes } = current;
  return {
    game, stakes, bank,
    stakesText: game.machine ? stakesLabel(stakes) : `table limits ${stakesLabel(stakes)}`,
    chip: () => chip,
    play,
    message: (t) => { $('cz-msg').textContent = t; },
    setTotal: (n) => { $('cz-total').textContent = money(n); },
    setButtons,
    checkBroke,
    holdBank,
  };
}

// A button that gets disabled while it has focus (Spin, mid-spin) would drop focus to the page:
// park it on the message line, then hand it back to the first useful button once one is enabled.
let focusParked = false;
function setButtons({ action, clear, rebet }) {
  const set = (id, on) => {
    if (on === undefined) return;
    const b = $(id);
    if (!on && document.activeElement === b) { $('cz-msg').focus({ preventScroll: true }); focusParked = true; }
    b.disabled = !on;
  };
  set('cz-action', action); set('cz-clear', clear); set('cz-rebet', rebet);
  if (focusParked && document.activeElement === $('cz-msg')) {
    const next = ['cz-action', 'cz-rebet'].map($).find((b) => !b.disabled);
    if (next) { next.focus({ preventScroll: true }); focusParked = false; }
  } else focusParked = false;
}

function paintRack() {
  if (!current) return;
  const rack = rackFor(current.stakes);
  $('cz-rack').innerHTML = rack.map((v) => chipButtonHTML(v, { selected: v === chip, disabled: v > bank.balance && v !== chip })).join('');
}
$('cz-rack').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chip]');
  if (!b || b.disabled) return;
  chip = Number(b.dataset.chip);
  play('chips');
  paintRack();
});

room.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (!b || !current) return;
  const c = b.dataset.cmd;
  if (c === 'menu') {
    if (history.state?.cz) return history.back(); // popstate shows the chooser
    return showChooser();
  }
  if (c === 'rules') return showRules();
  if (c === 'options') return showOptions();
  if (c === 'stats') return showStats();
  if (c === 'action') return current.mod.action();
  if (c === 'clear') return current.mod.clear();
  if (c === 'rebet') return current.mod.rebet();
});

// ------------------------------------------------------------------ dialogs
const dlg = $('cz-dialog');
/** Fill the shared dialog: title, body HTML and buttons [{ label, primary, run, disabled }]. */
function dialog(title, body, buttons) {
  dlg.innerHTML = `<h2 id="cz-dialog-title">${esc(title)}</h2><div class="cz-dialog-body">${body}</div>
    <div class="dialog-actions cz-dialog-actions">${buttons.map((b, i) => `<button class="btn${b.primary ? ' primary' : ''}" type="button" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`).join('')}</div>`;
  dlg.onclick = (e) => {
    const btn = e.target.closest('[data-i]');
    if (!btn) return;
    const b = buttons[Number(btn.dataset.i)];
    dlg.close();
    b.run?.();
  };
  if (!dlg.open) dlg.showModal();
}

/** Can the bank cover the table minimum? If not, offer a loan, a reset, or the way out. */
function checkBroke() {
  if (!current || room.hidden) return false;
  const need = current.stakes.min;
  if (bank.balance >= need) return false;
  const s = bank.get();
  const why = s.loan ? `You already have a ${money(s.loan)} loan outstanding.`
    : bank.loanEligible() ? `The loan desk will lend you ${money(bank.loanAmount())} at your ${TIERS[s.tier].name} tier.`
      : 'Loans are offered when the bank drops under $1,000; a table with lower limits may suit you.';
  dialog('Out of chips', `<p>The minimum here is <b>${money(need)}</b> and your bank has <b>${money(bank.balance)}</b>.</p><p>${why}</p>`, [
    { label: bank.loanEligible() ? `Take a ${money(bank.loanAmount())} loan` : 'Take a loan', primary: true, disabled: !bank.loanEligible(), run: () => { bank.takeLoan(); } },
    { label: 'Reset to $5,000', run: () => bank.reset() },
    { label: 'Leave the table', run: () => showChooser() },
  ]);
  return true;
}

function confirmReset() {
  dialog('Reset your bank?', `<p>Your bank goes back to <b>$5,000</b> on the Brass tier. Any loan and all your casino stats are cleared. The Hall of Fame is kept.</p>`, [
    { label: 'Cancel' },
    { label: 'Reset to $5,000', primary: true, run: () => bank.reset() },
  ]);
}

function showStats() {
  const s = bank.get();
  const rows = Object.values(MODULES).map((m) => {
    const g = s.stats[m.id];
    if (!g) return '';
    return `<tr><td>${esc(m.name)}</td><td>${g.hands}</td><td>${money(g.wagered)}</td><td>${money(g.won)}</td><td>${money(g.net)}</td><td>${money(g.biggest)}</td></tr>`;
  }).join('');
  const t = TIERS[s.tier];
  dialog('Casino stats', `<p>Bank <b>${money(s.bank)}</b> · ${tierBadge(t)}${s.loan ? ` · loan ${money(s.loan)}` : ''} · this visit <b>${money(bank.sessionNet)}</b></p>
    ${rows ? `<div class="cz-stats-wrap"><table class="score cz-stats"><thead><tr><th>Game</th><th>Hands</th><th>Bet</th><th>Paid</th><th>Net</th><th>Best</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No hands played yet.</p>'}`,
  [{ label: 'Close', primary: true }]);
}

function showOptions() {
  const { mod } = current;
  dialog(`${mod.name} options`, `<p class="muted">This table plays the standard rules for now. Options planned here:</p>
    <ul>${(mod.options ?? []).map((o) => `<li>${esc(o)}</li>`).join('') || '<li>None yet.</li>'}</ul>`, [{ label: 'Close', primary: true }]);
}

function showRules() {
  const d = $('cz-rules');
  $('cz-rules-title').textContent = `How to play ${current.mod.name}`;
  $('cz-rules-body').innerHTML = current.mod.howto;
  if (!d.open) d.showModal();
  $('cz-rules-body').scrollTop = 0;
}

window.addEventListener('dc:settings', () => { if (current) paintFelt(felt); });

// ------------------------------------------------------------------ start: casino.html?g=roulette&s=25 or casino.html#roulette
const params = new URLSearchParams(location.search);
const deep = params.get('g') || location.hash.slice(1);
renderChooser();
paintBank();
if (gameById(deep)) openGame(deep, params.get('s') ?? readStakes()[deep]);

// Back and forward between the chooser and a table.
window.addEventListener('popstate', () => {
  syncShell();
  const p = new URLSearchParams(location.search);
  const id = p.get('g');
  if (gameById(id)) { if (current?.game.id !== id || current?.stakes.id !== p.get('s')) openGame(id, p.get('s')); }
  else if (current) showChooser({ address: false });
});
