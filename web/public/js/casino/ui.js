// Casino: the chooser (game tiles by group, each with its stakes) and the game shell that opens
// in place, the same way the solitaire parlor does. All money goes through the shared bank
// (js/core/bank.js), shown in the site header on this page and on each game's top bar.
//
// The shell hosts one game module at a time (js/casino/games/<id>.js, loaded when first needed) and
// hands it `ctx`: the bank and the round's money rules, the chip rack and staged bets, the bet bar
// and the game's own action buttons, keyboard shortcuts, the result banner, the card layer and, for
// machines, the credit meter. The module contract and the whole ctx API are written up for game
// authors in js/casino/GAMES.md; keep that file in step with this one.
import { mountChrome, esc, playerName } from '../header.js';
import { play } from '../core/sound.js';
import { paintFelt } from '../skin.js';
import { getBank, money, moneyShort, moneyPill, TIERS } from '../core/bank.js';
import { sectionsHTML } from '../core/howto.js';
import { CASINO, gameById, stakesFor, stakesById, stakesLabel, stakesShort, rackFor } from './catalog.js';
import { chipButtonHTML, bindSpots } from './chips.js';
import { loadGame } from './games/index.js';
import { ART, TIER_INK, imgArt, watchArt } from './art.js';
import { cryptoRng } from './kit/rng.js';
import { createRound, createMachine } from './kit/round.js';
import { createStaging } from './kit/bets.js';
import { cardLayer, reducedMotion } from './kit/cards.js';

watchArt();
mountChrome('casino');
const bank = getBank();
const rng = cryptoRng();

// ------------------------------------------------------------------ saved choices
const STAKES_KEY = 'dc.casino.stakes';
const HOWTO_SEEN = 'dc.casino.howto.seen', HOWTO_AUTO = 'dc.casino.howto.auto';
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const readStakes = () => readJSON(STAKES_KEY, {});
const saveStakes = (id, s) => writeJSON(STAKES_KEY, { ...readStakes(), [id]: s });
const lastKey = (id) => `dc.casino.last.${id}`;
const optsKey = (id) => `dc.casino.opts.${id}`;
const howtoAuto = () => { try { return localStorage.getItem(HOWTO_AUTO) !== '0'; } catch { return true; } };

const $ = (id) => document.getElementById(id);
const chooser = $('chooser');
const room = $('room');
const felt = $('cz-felt');
const MODS = new Map(); // id -> loaded module (for tile badges and the stats dialog)

// Everything about the game on the table; null on the chooser.
//   { game, stakes, mod, ctx, round, machine, bets, actions, keys, layers, timers, live }
let current = null;
let chip = 0;
let held = null;       // while a result is still being revealed: the bank as it was, shown instead
let heldEvents = [];   // bank news (tier up, loan repaid ...) waiting for the reveal
let openToken = 0;

// ------------------------------------------------------------------ bank pill (site header) and top bar
const pill = document.createElement('button');
pill.type = 'button';
pill.className = 'cz-pill';
pill.addEventListener('click', () => showStats());
document.querySelector('.site-header .who')?.prepend(pill);

const tierBadge = (t) => `<span class="cz-tier" style="--tier:${t.color}"><span class="cz-tier-dot" aria-hidden="true">${imgArt(ART.medal(t.id))}</span>${t.name}</span>`;
/** The tier's medallion over the code-drawn chip (which stays if the picture can't load). */
const medal = (t, cls) => `<span class="${cls}" aria-hidden="true">${imgArt(ART.medal(t.id))}</span>`;
/** The tier's card, with the tier and the player's name written in its calm lower half. */
const tierCard = (t) => `<span class="cz-card" style="--tier:${t.color};--tier-ink:${TIER_INK[t.id]}" aria-hidden="true">${imgArt(ART.tierCard(t.id))}
  <span class="cz-card-tier">${t.name}</span><span class="cz-card-name">${esc(playerName())}</span></span>`;

/** The pill's insides: full amount (or $1.25M from a million up) and a short one for phones. */
function pillHTML(s, t) {
  const loan = s.loan ? `<span class="cz-loan-mark" title="Loan ${money(s.loan)} outstanding">L</span>` : '';
  return `${medal(t, 'cz-pill-chip')}<span class="visually-hidden">Bank, ${t.name} tier: </span><b class="cz-amt-full">${moneyPill(s.bank)}</b><b class="cz-amt-short" aria-hidden="true">${moneyShort(s.bank)}</b>${loan}`;
}

function paintBank() {
  const s = held ?? bank.get();
  const t = TIERS[s.tier];
  const label = `Bank ${money(s.bank)}, ${t.name} tier${s.loan ? `, loan ${money(s.loan)} outstanding` : ''}. Open your casino stats.`;
  pill.style.setProperty('--tier', t.color);
  pill.innerHTML = pillHTML(s, t);
  pill.title = label;
  pill.setAttribute('aria-label', label);
  const top = $('cz-bank');
  top.style.setProperty('--tier', t.color);
  top.innerHTML = pillHTML(s, t);
  top.title = label;
  top.setAttribute('aria-label', label);
  if (!current) { renderBankPanel(); refreshStakes(); return; }
  paintRack();
  paintMeter();
  if (current.bets) syncBets(current);
}
$('cz-bank').addEventListener('click', () => showStats());

const EVENT_TEXT = {
  repaid: (e) => `Your ${money(e.amount)} loan has been repaid from your winnings.`,
  upgrade: (e) => `Credit extended! You're now ${TIERS[e.to].name}.`,
  hall: (e) => `Hall of Fame! ${e.entry.name} reached ${money(e.entry.bank)}. The bank starts over at $5,000.`,
  loan: (e) => `${money(e.amount)} loan added to your bank.`,
  reset: () => 'Bank reset to $5,000.',
  corrupt: () => 'Your casino bank couldn\'t be read, so it was reset to $5,000.',
};
const announce = (events) => {
  for (const e of events) {
    if (!EVENT_TEXT[e.type]) continue;
    const tier = e.type === 'upgrade' ? TIERS[e.to] : e.type === 'hall' ? TIERS[TIERS.length - 1] : null;
    toast(EVENT_TEXT[e.type](e), e.type === 'upgrade' || e.type === 'hall', tier);
  }
};
bank.subscribe((_, events) => {
  if (held) { heldEvents.push(...events); if (current) { paintMeter(); } return; }
  paintBank();
  announce(events);
});
announce(bank.drainNotices());

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

function toast(msg, big = false, tier = null) {
  const t = document.createElement('div');
  t.className = `cz-toast${big ? ' big' : ''}${tier ? ' medal' : ''}`;
  t.setAttribute('role', 'status');
  if (tier) t.innerHTML = medal(tier, 'cz-toast-medal');
  t.append(msg);
  document.querySelectorAll('.cz-toast').forEach((o, i, all) => { o.style.setProperty('--lift', String(all.length - i)); });
  document.body.append(t);
  if (big) play('win');
  setTimeout(() => t.classList.add('out'), 3200);
  setTimeout(() => t.remove(), 3700);
}

// Credits left in a machine when the page was closed go back to the bank first thing.
{
  const m = bank.machine;
  if (m) {
    const r = bank.machineOut();
    if (r.credits) toast(`Cashed out ${r.credits.toLocaleString('en-US')} credits (${money(r.dollars)}) left in a machine.`);
  }
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
  el.innerHTML = `<div class="cz-bank-main">${tierCard(t)}
      <div><span class="cz-bank-label">Your bank</span><b class="cz-bank-amt">${money(s.bank)}</b>${tierBadge(t)}<span class="cz-bank-next">${next}</span></div></div>
    <p class="cz-bank-loan">${loanLine}${bank.sessionNet ? ` This visit: <b>${bank.sessionNet > 0 ? '+' : ''}${money(bank.sessionNet)}</b>.` : ''}</p>
    <div class="row"><button class="btn sm${bank.loanEligible() ? ' primary' : ''}" type="button" data-bank="loan">Loan desk</button>
      <button class="btn sm" type="button" data-bank="stats">Stats</button>
      <button class="btn sm" type="button" data-bank="hall">Hall of Fame</button>
      <button class="btn sm" type="button" data-bank="reset">Reset to $5,000</button></div>
`;
}

const coverable = (s) => bank.balance >= s.min;
/** The stakes to show picked on a tile: the saved one if the bank covers it, else the first it does. */
const pickStakes = (g, saved) => { const st = stakesById(g, saved); return coverable(st) ? st : stakesFor(g).find(coverable) ?? st; };
const stakeButton = (s, on) => {
  const ok = coverable(s);
  return `<button type="button" role="radio" aria-checked="${on}" data-stakes="${s.id}" ${ok ? '' : 'disabled'}
    title="${ok ? stakesLabel(s) : `${stakesLabel(s)}: your bank can't cover the ${money(s.min)} ${s.denom ? 'credit' : 'minimum'}`}">${stakesShort(s)}</button>`;
};
const netLine = (id) => {
  const g = bank.get().stats[id];
  if (!g?.hands) return '';
  return `<span class="cz-tile-net ${g.net > 0 ? 'up' : g.net < 0 ? 'down' : ''}">Net ${g.net > 0 ? '+' : ''}${money(g.net)}</span>`;
};
/** After the bank changes on the chooser: re-check which stakes it can cover. */
function refreshStakes() {
  chooser.querySelectorAll('.cz-tile[data-game]').forEach((tile) => {
    const g = gameById(tile.dataset.game);
    const st = pickStakes(g, readStakes()[g.id]);
    tile.querySelector('.cz-stakes').innerHTML = stakesFor(g).map((s) => stakeButton(s, s.id === st.id)).join('');
    tile.querySelector('.cz-sit').href = `casino.html?g=${g.id}&s=${st.id}`;
    const net = tile.querySelector('.cz-tile-netslot');
    if (net) net.innerHTML = netLine(g.id);
  });
}

/** A tile learns whether its game deals yet once the module has loaded. */
function paintTileReady(id) {
  const mod = MODS.get(id);
  const tile = chooser.querySelector(`.cz-tile[data-game="${id}"]`);
  if (!tile || !mod) return;
  tile.classList.remove('pending');
  tile.classList.toggle('ready', Boolean(mod.ready));
  tile.querySelector('.tile-badge').textContent = mod.ready ? 'Open now' : 'Being built';
  const sit = tile.querySelector('.cz-sit');
  sit.classList.toggle('primary', Boolean(mod.ready));
  sit.textContent = mod.ready ? 'Sit down' : 'Look at the table';
}

function renderChooser() {
  const saved = readStakes();
  chooser.innerHTML = `<div class="section-head" style="margin-top:8px"><h2>Casino</h2><span style="color:var(--ink-3)">${CASINO.reduce((n, g) => n + g.games.length, 0)} games · one bank</span></div>
    ${imgArt(ART.banner, 'cz-banner')}
    <p class="cz-intro">One bankroll plays every table and machine. Pick your limits on a game, then sit down. Win big enough and your credit goes up a tier.</p>
    <div class="cz-bankpanel" id="cz-bankpanel"></div>
    ${CASINO.map((grp, gi) => `<div class="group cz-group-${gi}"><div class="group-head"><h3>${grp.title}</h3><span>${grp.blurb}</span></div><div class="tiles">${grp.games.map((g) => {
      const st = pickStakes(g, saved[g.id]);
      return `<div class="tile cz-tile pending" data-game="${g.id}">
        <div class="tile-art cz-tile-art" style="--felt:${g.felt}"><svg viewBox="0 0 64 64" aria-hidden="true">${ICONS[g.icon]}</svg>${imgArt(ART.tile(g.id))}<span class="tile-badge"></span></div>
        <div class="tile-body"><b>${esc(g.name)}</b>${g.subtitle ? `<span class="cz-tile-sub">${esc(g.subtitle)}</span>` : ''}<span>${esc(g.blurb)}</span>
          <span class="cz-tile-netslot">${netLine(g.id)}</span>
          <div class="cz-stakes" style="--n:${stakesFor(g).length}" role="radiogroup" aria-label="${g.machine ? 'Denomination' : 'Table limits'} for ${esc(g.name)}">${stakesFor(g).map((s) => stakeButton(s, s.id === st.id)).join('')}</div>
          <a class="btn sm cz-sit" href="casino.html?g=${g.id}&s=${st.id}" data-open="${g.id}">Sit down</a>
        </div></div>`;
    }).join('')}</div></div>`).join('')}`;
  renderBankPanel();
  for (const id of MODS.keys()) paintTileReady(id);
}

/** Load every game's module in the background so the tiles can say which tables deal. */
function warmModules() {
  for (const g of CASINO.flatMap((grp) => grp.games)) {
    loadGame(g.id).then((m) => { MODS.set(g.id, m); paintTileReady(g.id); }).catch((e) => console.error(e));
  }
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
  if (open) { e.preventDefault(); openGame(open.dataset.open, pickStakes(gameById(open.dataset.open), readStakes()[open.dataset.open]).id, { push: true }); return; }
  const b = e.target.closest('[data-bank]');
  if (b) {
    if (b.dataset.bank === 'loan') loanDesk();
    if (b.dataset.bank === 'stats') showStats();
    if (b.dataset.bank === 'hall') showHall();
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

const cssLoaded = new Set();
function loadCSS(href) {
  if (!href || cssLoaded.has(href)) return;
  cssLoaded.add(href);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.append(l);
}

async function openGame(id, stakesId, { push = false } = {}) {
  const game = gameById(id);
  if (!game) return;
  const token = ++openToken;
  let mod;
  try { mod = await loadGame(id); } catch (e) { console.error(e); toast(`${game.name} couldn't be loaded. Try again in a moment.`); return; }
  if (token !== openToken) return; // another table was asked for meanwhile
  MODS.set(id, mod);
  closeGame();
  const stakes = stakesById(game, stakesId);
  saveStakes(id, stakes.id);
  current = {
    game, stakes, mod, live: true,
    round: createRound(bank, id),
    machine: mod.credits ? createMachine(bank, id, stakes.denom ?? stakes.min) : null,
    bets: null, actions: [], keys: new Map(), layers: [], timers: new Set(), label: game.action,
  };
  loadCSS(mod.css);
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
  room.classList.toggle('cz-credits', Boolean(current.machine));
  const rack = rackFor(stakes);
  if (!rack.includes(chip)) chip = rack[0];
  paintFelt(felt);
  showRack(!current.machine);
  renderActions();
  clearBanner();
  setButtons({ action: false, clear: false, rebet: false, undo: false });
  $('cz-erase').hidden = true;
  paintBank();
  current.ctx = makeCtx(current);
  current.mod.mount(felt, current.ctx);
  window.scrollTo(0, 0);
  if (!maybeShowHowto()) checkBroke();
}

/** Leave the table: bets that may be taken down come back, the rest is forfeited, a machine cashes out. */
function closeGame() {
  if (!current) return;
  const c = current;
  current = null; // first, so nothing the game does while unmounting can reach the shell
  c.live = false;
  try { c.mod.unmount(); } catch (e) { console.error(e); }
  for (const t of c.timers) clearTimeout(t);
  for (const l of c.layers) l.destroy();
  c.unbind?.();
  const { back, lost } = c.round.leave();
  if (back) toast(`${money(back)} in bets came back to your bank.`);
  if (lost) toast(`${money(lost)} on the table was forfeited.`);
  if (c.machine) {
    c.machine.leave();
    const out = c.machine.cashOut();
    if (out.credits) toast(`Cashed out ${out.credits.toLocaleString('en-US')} credits (${money(out.dollars)}).`);
  }
  felt.innerHTML = '';
  held = null;
  if (heldEvents.length) announce(heldEvents.splice(0));
  delete room.dataset.game;
  document.body.classList.remove('cz-playing');
  for (const d of document.querySelectorAll('#cz-dialog, #cz-rules')) if (d.open) d.close();
}

/** What leaving now would cost (bets that can't be taken down, a dealt machine hand). */
const leaveCost = () => (current ? current.round.atRisk + (current.machine?.atRisk ?? 0) : 0);

/** Run `go` once the player agrees to leave (straight away when nothing would be lost). */
function guardLeave(go, onStay) {
  const cost = leaveCost();
  if (!cost) { go(); return; }
  dialog('Leave the table?', `<p>Leave now? You'll forfeit <b>${money(cost)}</b> on the table.</p>`, [
    { label: 'Stay', primary: true, run: onStay },
    { label: 'Leave and forfeit', run: go },
  ]);
}

function showChooser({ address = true } = {}) {
  closeGame();
  if (address) setAddress('casino.html', false);
  document.title = 'Casino · Dealers Choice';
  room.hidden = true;
  chooser.hidden = false;
  renderChooser();
}

function leaveToChooser() {
  guardLeave(() => {
    closeGame();
    if (history.state?.cz) history.back(); // popstate shows the chooser
    else showChooser();
  });
}

// ------------------------------------------------------------------ ctx: what a game gets
function makeCtx(c) {
  const { game, stakes } = c;
  const live = () => c.live;
  const guard = (fn) => (...a) => (c.live ? fn(...a) : undefined);
  const ctx = {
    game, stakes, bank, rng,
    stakesText: game.machine ? stakesLabel(stakes) : `table limits ${stakesLabel(stakes)}`,
    opts: readOpts(c.mod),
    reduced: reducedMotion,
    get live() { return live(); },
    chip: () => chip,
    play: guard(play),
    message: guard((t) => { $('cz-msg').textContent = t; }),
    banner: guard((title, o) => (title == null ? clearBanner() : showBanner(title, o))),
    toast: guard((t) => toast(t)),
    setTotal: guard((n, o) => setTotal(n, o)),
    setButtons: guard(setButtons),
    actions: guard((defs) => { c.actions = defs.map((d) => ({ ...d })); renderActions(); }),
    setActions: guard(setActions),
    keys: guard((map) => { for (const [k, fn] of Object.entries(map)) c.keys.set(k.length === 1 ? k.toLowerCase() : k, fn); }),
    showRack: guard(showRack),
    checkBroke: guard((o) => checkBroke(o)),
    holdBank,
    // money: debit at commit, settle at once (kit/round.js)
    wager: (n, o) => (live() ? c.round.wager(n, o) : false),
    refund: (n) => (live() ? c.round.refund(n) : 0),
    pay: (n) => (live() ? c.round.pay(n) : 0),
    settle: (o) => (live() ? c.round.settle(o) : null),
    apply: (r) => (live() ? c.round.apply(r) : { ok: false, error: 'The table is closed.' }),
    setReturnable: (n) => { if (live()) c.round.setReturnable(n); },
    get onTable() { return c.round.onTable; },
    bets: guard((spec) => makeBets(c, spec)),
    cards: (stage, svg, o) => { const l = cardLayer(stage, svg, o); c.layers.push(l); return l; },
    /** setTimeout that is cancelled when the game closes. */
    after: (ms, fn) => {
      const t = setTimeout(() => { c.timers.delete(t); if (c.live) fn(); }, ms);
      c.timers.add(t);
      return t;
    },
    cancel: (t) => { clearTimeout(t); c.timers.delete(t); },
    machine: c.machine ? makeMachineCtx(c) : null,
  };
  return ctx;
}

// ---- house-rule options (module.settings), saved per game
function readOpts(mod) {
  const saved = readJSON(optsKey(mod.id), {});
  const out = {};
  for (const s of mod.settings ?? []) {
    const v = saved[s.key];
    const okSelect = s.type === 'select' && (s.options ?? []).some(([val]) => val === v);
    out[s.key] = s.type === 'check' ? (typeof v === 'boolean' ? v : s.default) : okSelect ? v : s.default;
  }
  return out;
}

// ---- bet bar
// A button that gets disabled while it has focus (Spin, mid-spin) would drop focus to the page:
// park it on the message line, then hand it back to the first useful button once one is enabled.
let focusParked = false;
function setButtons({ action, clear, rebet, undo, label } = {}) {
  const set = (id, on) => {
    if (on === undefined) return;
    const b = $(id);
    if (!on && document.activeElement === b) { $('cz-msg').focus({ preventScroll: true }); focusParked = true; }
    b.disabled = !on;
  };
  set('cz-action', action); set('cz-clear', clear); set('cz-rebet', rebet); set('cz-undo', undo);
  if (label != null) $('cz-action').textContent = label;
  if (focusParked && document.activeElement === $('cz-msg')) {
    const next = ['cz-action', 'cz-rebet'].map($).find((b) => !b.disabled) ?? $('cz-actions').querySelector('button:not([disabled]):not([hidden])');
    if (next) { next.focus({ preventScroll: true }); focusParked = false; }
  } else focusParked = false;
}

function setTotal(n, { staged = false } = {}) {
  $('cz-total').textContent = money(n);
  const after = $('cz-after');
  after.textContent = staged && n > 0 ? `Bank after bet ${money(Math.max(0, bank.balance - n))}` : '';
}

function showRack(on = true) {
  $('cz-rack').hidden = !on;
  if (current) current.rackShown = on;
}

function paintRack() {
  if (!current) return;
  const rack = rackFor(current.stakes);
  const staged = current.bets?.staging.total() ?? 0;
  $('cz-rack').innerHTML = rack.map((v) => chipButtonHTML(v, { selected: v === chip, disabled: v > bank.balance - staged && v !== chip })).join('');
  $('cz-rack').querySelectorAll('[data-chip]').forEach((b) => { b.tabIndex = Number(b.dataset.chip) === chip ? 0 : -1; });
}
function pickChip(v, { focus = false } = {}) {
  chip = v;
  play('chips');
  paintRack();
  if (focus) $('cz-rack').querySelector(`[data-chip="${v}"]`)?.focus();
}
$('cz-rack').addEventListener('click', (e) => {
  const b = e.target.closest('[data-chip]');
  if (!b || b.disabled) return;
  pickChip(Number(b.dataset.chip));
});
// arrow keys move through the rack (a radio group): only enabled chips
$('cz-rack').addEventListener('keydown', (e) => {
  const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const chips = [...$('cz-rack').querySelectorAll('[data-chip]:not([disabled])')];
  const i = chips.findIndex((b) => Number(b.dataset.chip) === chip);
  const next = chips[(i + step + chips.length) % chips.length];
  if (next) pickChip(Number(next.dataset.chip), { focus: true });
});

// ---- the game's own buttons (Hit, Stand, Hold, Draw ...): ctx.actions([...]) and ctx.setActions({...})
function renderActions() {
  const bar = $('cz-actions');
  const defs = current?.actions ?? [];
  bar.hidden = !defs.some((d) => !d.hidden);
  bar.innerHTML = defs.map((d, i) => `<button type="button" class="btn${d.primary ? ' primary' : ''}${d.small ? ' sm' : ''}" data-act="${i}" data-id="${esc(d.id)}"
    ${d.hidden ? 'hidden' : ''} ${d.disabled ? 'disabled' : ''} ${d.title ? `title="${esc(d.title)}"` : ''} ${d.pressed != null ? `aria-pressed="${Boolean(d.pressed)}"` : ''}>${esc(d.label)}${d.key ? `<kbd aria-hidden="true">${esc(d.key.toUpperCase())}</kbd>` : ''}</button>`).join('');
}
/** setActions({ hit: true, split: false, insurance: { hidden: true }, draw: { label: 'Draw' } }):
 *  true/false enable or disable (and show) a button; an object sets any of disabled/hidden/label/pressed. */
function setActions(map) {
  if (!current) return;
  for (const [id, v] of Object.entries(map)) {
    const d = current.actions.find((a) => a.id === id);
    if (!d) continue;
    if (typeof v === 'boolean') { d.disabled = !v; d.hidden = false; } else Object.assign(d, v);
  }
  const focusedId = document.activeElement?.closest?.('#cz-actions [data-id]')?.dataset.id;
  renderActions();
  if (focusedId) {
    const b = $('cz-actions').querySelector(`[data-id="${CSS.escape(focusedId)}"]`);
    if (b && !b.disabled && !b.hidden) b.focus({ preventScroll: true });
    else ($('cz-actions').querySelector('button:not([disabled]):not([hidden])') ?? $('cz-msg')).focus({ preventScroll: true });
  }
}
function runAction(d) {
  if (!d || d.disabled || d.hidden) return false;
  d.run?.();
  return true;
}
$('cz-actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && current) runAction(current.actions[Number(b.dataset.act)]);
});

// ---- result banner over the felt (aria-live), cleared by the next bet
function showBanner(title, { tone = 'info', detail = '' } = {}) {
  const b = $('cz-result');
  b.className = `cz-result ${tone}`;
  b.innerHTML = `<b>${esc(title)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}`;
  b.hidden = false;
}
function clearBanner() { const b = $('cz-result'); b.hidden = true; b.innerHTML = ''; }
$('cz-result').addEventListener('click', clearBanner);

// ---- staged bets on the layout's spots: ctx.bets({ ... })
function makeBets(c, spec = {}) {
  const { stakes, game } = c;
  const staging = createStaging({
    spot: spec.spot ?? (() => ({})),
    limits: { min: stakes.min, max: stakes.max },
    available: () => bank.balance,
    validate: spec.validate ?? null,
  });
  const helper = {
    staging, removeMode: false,
    amounts: () => staging.amounts(),
    amount: (k) => staging.amount(k),
    total: () => staging.total(),
    get locked() { return staging.locked; },
    get last() { return readJSON(lastKey(game.id), null); },
    place: (key, n = chip) => place(key, n, 1),
    remove: (key, n = chip) => place(key, n, -1),
    undo() { if (staging.undo()) { play('chips'); changed(); } },
    clear() { if (staging.total() && staging.clear()) { play('chips'); c.ctx.message('Bets cleared.'); changed(); } },
    rebet(times = 1) {
      const saved = helper.last;
      if (!saved?.length || staging.locked) return;
      const r = staging.rebet(saved, times);
      if (!r.placed) { play('error'); c.ctx.message(`Rebet needs more than the ${money(bank.balance)} in the bank.`); return; }
      play('chips');
      if (r.short) toast('Not enough in the bank to rebet everything.');
      c.ctx.message(`${times > 1 ? 'Double the' : 'Same'} bets again: ${money(staging.total())}.`);
      clearBanner();
      changed();
    },
    /**
     * Commit the staged chips: check the limits (a spot under its minimum offers to raise it), take
     * the total from the bank, remember the layout for Rebet, lock the spots and call
     * fn(amounts, release). With { hold: true } the bank display keeps its pre-bet figure until the
     * game calls release() (after its reveal). Returns true when it committed straight away.
     */
    commit(fn, { hold = false } = {}) {
      if (staging.locked) return false;
      const problem = staging.check();
      if (problem?.key) {
        play('error');
        const raise = problem.min - staging.amount(problem.key);
        dialog('Table minimum', `<p>${esc(problem.error)} Bet ${money(problem.min)}?</p>`, [
          { label: 'Cancel' },
          { label: `Bet ${money(problem.min)}`, primary: true, disabled: raise > bank.balance - staging.total(), run: () => { staging.set({ ...staging.amounts(), [problem.key]: problem.min }); changed(); helper.commit(fn, { hold }); } },
        ]);
        return false;
      }
      if (problem) { play('error'); c.ctx.message(problem.error); return false; }
      const amounts = staging.amounts();
      const total = staging.total();
      if (!total) { play('error'); c.ctx.message('Place a bet first.'); return false; }
      const release = hold ? holdBank() : () => {};
      if (!c.round.wager(total)) { release(); play('error'); c.ctx.message('The bank can\'t cover those bets.'); return false; }
      writeJSON(lastKey(game.id), staging.layout());
      staging.lock();
      clearBanner();
      changed();
      fn(amounts, release);
      return true;
    },
    /** The round is over: clear the staged chips off the felt and open the spots for the next bet. */
    release() { staging.lock(false); staging.clear(); changed(); },
    lock(on = true) { staging.lock(on); changed(); },
    /** Re-run the bet bar's buttons and the game's onChange (after the game changes phase). */
    sync: () => changed(),
  };
  function place(key, n, sign) {
    if (sign > 0 && helper.removeMode) sign = -1;
    const r = sign > 0 ? staging.place(key, n) : staging.remove(key, n);
    if (!r.ok) { if (r.error) { play('error'); c.ctx.message(r.error); } return; }
    play('chips');
    clearBanner();
    const label = spec.spot?.(key)?.label ?? key;
    c.ctx.message(r.amount ? `${label}: ${money(r.amount)}. On the felt ${money(staging.total())}.` : `${label} cleared. On the felt ${money(staging.total())}.`);
    changed();
  }
  function changed() {
    if (!c.live) return;
    syncBets(c);
    spec.onChange?.(staging.amounts(), helper);
  }
  c.bets = helper;
  c.autoButtons = spec.autoButtons !== false;
  c.unbind?.();
  if (spec.root) c.unbind = bindSpots(spec.root, spec.attr ?? 'data-spot', (key, sign) => place(key, chip, sign));
  $('cz-erase').hidden = !matchMedia('(pointer: coarse)').matches;
  syncBets(c);
  return helper;
}

/** The bet bar follows the staged chips: total, Clear / Undo / Rebet, and the main button. */
function syncBets(c) {
  const h = c.bets;
  if (!h) return;
  const t = h.staging.total(), locked = h.staging.locked;
  setTotal(locked ? c.round.onTable : t, { staged: !locked });
  if (c.autoButtons === false) return;
  setButtons({ action: !locked && t > 0, clear: !locked && t > 0, undo: !locked && t > 0, rebet: !locked && t === 0 && Boolean(h.last?.length) });
  paintRack();
}

$('cz-erase').addEventListener('click', () => {
  const h = current?.bets;
  if (!h) return;
  h.removeMode = !h.removeMode;
  $('cz-erase').setAttribute('aria-pressed', String(h.removeMode));
  $('cz-erase').classList.toggle('on', h.removeMode);
  current.ctx.message(h.removeMode ? 'Remove mode: tap a bet to take a chip off.' : 'Tap a bet to add a chip.');
});

// ---- machines: the credit meter, Insert bills and Cash out
function makeMachineCtx(c) {
  const m = c.machine;
  return {
    get denom() { return m.denom; },
    get credits() { return m.credits; },
    get betting() { return m.betting; },
    /** Take `credits` off the meter for a round; false if it is short (and offers Insert bills). */
    bet(credits) {
      if (!c.live) return false;
      if (!m.held && bank.machine) { c.ctx.message('This machine was cashed out from another window. Insert bills to play.'); paintMeter(); return false; }
      if (m.bet(credits)) { paintMeter(); return true; }
      play('error');
      c.ctx.message(m.credits ? `That needs ${credits} credits; the meter has ${m.credits}.` : 'Insert bills to play.');
      if (!m.credits) insertBills();
      return false;
    },
    /** The round is decided: `won` credits onto the meter, the round recorded in dollars. */
    pay(won = 0) { if (!c.live) return null; const r = m.pay(won); paintMeter(); return r; },
    insert: () => insertBills(),
    cashOut: () => cashOut(),
  };
}

function paintMeter() {
  const c = current;
  const box = $('cz-meter');
  if (!c?.machine) { box.hidden = true; return; }
  box.hidden = false;
  const m = c.machine;
  $('cz-credits').textContent = m.credits.toLocaleString('en-US');
  $('cz-credits-usd').textContent = `= ${money(m.credits * m.denom)}`;
  $('cz-cashout').disabled = !m.credits || m.betting > 0;
}

function insertBills() {
  const c = current;
  if (!c?.machine) return;
  const m = c.machine;
  if (m.blocked) {
    const other = bank.machine;
    const name = gameById(other.game)?.name ?? 'another machine';
    dialog('Insert bills', `<p>${esc(name)} is holding ${other.credits.toLocaleString('en-US')} credits of your money. Cash out there first.</p>`, [
      { label: 'Not now' },
      { label: 'Cash it out now', primary: true, run: () => { const r = bank.machineOut(); toast(`Cashed out ${r.credits.toLocaleString('en-US')} credits (${money(r.dollars)}).`); paintMeter(); } },
    ]);
    return;
  }
  const amounts = [20, 100, 500, 1000];
  const max = Math.floor(bank.balance / m.denom) * m.denom;
  dialog('Insert bills', `<p>Credits on this machine are <b>${money(m.denom)}</b> each. Bank <b>${money(bank.balance)}</b>.</p>
    <div class="cz-bills">${amounts.map((a) => `<button type="button" class="btn sm" data-bill="${a}" ${a > bank.balance || a < m.denom ? 'disabled' : ''}>+${money(a)}</button>`).join('')}
      <button type="button" class="btn sm" data-bill="${max}" ${max < m.denom ? 'disabled' : ''}>All</button></div>
    <label class="cz-bill-amt">Amount <input type="number" inputmode="numeric" min="${m.denom}" step="${m.denom}" max="${max}" value="${Math.min(100, max) || ''}" id="cz-bill-in"></label>`, [
    { label: 'Cancel' },
    { label: 'Insert', primary: true, disabled: max < m.denom, run: () => feed(Number($('cz-bill-in')?.value)) },
  ]);
  const dlgEl = $('cz-dialog');
  dlgEl.querySelectorAll('[data-bill]').forEach((b) => b.addEventListener('click', () => { dlgEl.close(); feed(Number(b.dataset.bill)); }));
  function feed(dollars) {
    const r = m.insert(Math.floor(dollars) || 0);
    if (!r.ok) {
      toast(r.reason === 'full' ? 'The meter is full.' : r.reason === 'other-machine' ? 'Another machine is holding your credits. Cash out there first.' : `Insert at least ${money(m.denom)}.`);
      return;
    }
    play('chips');
    current?.ctx.message(`${r.credits.toLocaleString('en-US')} credits added.`);
    paintMeter();
  }
}

function cashOut() {
  const c = current;
  if (!c?.machine) return;
  if (c.machine.betting) { c.ctx.message('Finish this hand before cashing out.'); return; }
  const r = c.machine.cashOut();
  if (r.credits) { play('chips'); toast(`Cashed out ${r.credits.toLocaleString('en-US')} credits (${money(r.dollars)}).`); }
  paintMeter();
}

// ------------------------------------------------------------------ commands: buttons and keys
function command(cmd, { times = 1 } = {}) {
  const c = current;
  if (!c) return;
  const { mod } = c;
  if (cmd === 'menu') return leaveToChooser();
  if (cmd === 'rules') return showRules();
  if (cmd === 'options') return showOptions();
  if (cmd === 'stats') return showStats();
  if (cmd === 'insert') return insertBills();
  if (cmd === 'cashout') return cashOut();
  if (cmd === 'action') return mod.action();
  if (cmd === 'clear') return mod.clear ? mod.clear() : c.bets?.clear();
  if (cmd === 'rebet') return mod.rebet ? mod.rebet(times) : c.bets?.rebet(times);
  if (cmd === 'undo') return mod.undo ? mod.undo() : c.bets?.undo();
}

room.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (b && current) command(b.dataset.cmd);
});

/** A bet-bar button by its key, pressed only if it is there and enabled. */
const press = (id, opts) => { const b = $(id); if (!b || b.disabled || b.closest('[hidden]')) return false; command(b.dataset.cmd, opts); return true; };

document.addEventListener('keydown', (e) => {
  const c = current;
  if (!c || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // the game's own keys come first (action buttons, then ctx.keys)
  const d = c.actions.find((a) => a.key && a.key.toLowerCase() === k);
  if (d) { if (runAction(d)) e.preventDefault(); return; }
  const fn = c.keys.get(k);
  if (fn) { e.preventDefault(); fn(e); return; }
  const onControl = e.target.closest?.('button, a, [role="button"], [tabindex]:not(#cz-msg):not(#cz-felt)');
  if ((k === 'Enter' || k === ' ') && !onControl) { e.preventDefault(); press('cz-action'); return; }
  if (/^[1-8]$/.test(k) && !$('cz-rack').hidden) {
    const chips = [...$('cz-rack').querySelectorAll('[data-chip]')];
    const b = chips[Number(k) - 1];
    if (b && !b.disabled) { e.preventDefault(); pickChip(Number(b.dataset.chip)); }
    return;
  }
  if (k === 'c') { if (press('cz-clear')) e.preventDefault(); return; }
  if (k === 'r') { if (press('cz-rebet', { times: e.shiftKey ? 2 : 1 })) e.preventDefault(); return; }
  if (k === 'Backspace') { e.preventDefault(); press('cz-undo'); }
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

/** Can the bank cover the table minimum (the game's minBuyIn, or a machine's one coin)? If not,
 *  offer a loan, a reset, or the way out. Returns true when it opened the dialog. */
function checkBroke({ need } = {}) {
  const c = current;
  if (!c || room.hidden) return false;
  if (c.machine) {
    if (bank.balance + c.machine.credits * c.machine.denom >= c.machine.denom) return false;
    need = c.machine.denom;
  } else {
    need ??= c.mod.minBuyIn?.(c.stakes, c.ctx?.opts) ?? c.stakes.min;
    if (bank.balance >= need || c.round.onTable > 0) return false;
  }
  const s = bank.get();
  const why = s.loan ? `You already have a ${money(s.loan)} loan outstanding.`
    : bank.loanEligible() ? `The loan desk will lend you ${money(bank.loanAmount())} at your ${TIERS[s.tier].name} tier.`
      : 'Loans are offered when the bank drops under $1,000; a table with lower limits may suit you.';
  dialog('Out of chips', `<p>The minimum here is <b>${money(need)}</b> and your bank has <b>${money(bank.balance)}</b>.</p><p>${why}</p>`, [
    { label: bank.loanEligible() ? `Take a ${money(bank.loanAmount())} loan` : 'Take a loan', primary: true, disabled: !bank.loanEligible(), run: () => loanDesk({ back: checkBroke }) },
    { label: 'Reset to $5,000', run: () => confirmReset({ back: checkBroke }) },
    { label: 'Leave the table', run: () => leaveToChooser() },
  ]);
  return true;
}

/** `back` runs when the player backs out (the broke dialog reopens itself that way). */
function confirmReset({ back } = {}) {
  dialog('Reset your bank?', `<p>Your bank goes back to <b>$5,000</b> on the Brass tier. Any loan and all your casino stats are cleared. The Hall of Fame is kept.</p>`, [
    { label: 'Cancel', run: back },
    { label: 'Reset to $5,000', primary: true, run: () => bank.reset() },
  ]);
}

/** The loan desk: what you can borrow and on what terms, or what you owe. */
function loanDesk({ back } = {}) {
  const s = bank.get();
  const t = TIERS[s.tier];
  const head = `<div class="cz-dlg-art">${imgArt(ART.loanDesk)}</div><p>Bank <b>${money(s.bank)}</b> · ${tierBadge(t)}</p>`;
  const terms = `It's repaid automatically once your bank reaches ${money(t.next)}. While a loan is out, your tier can't go up.`;
  if (s.loan) return dialog('Loan desk', `${head}<p>You owe <b>${money(s.loan)}</b>. ${terms}</p>`, [{ label: 'Close', primary: true, run: back }]);
  if (s.machine) return dialog('Loan desk', `${head}<p>Cash out of ${esc(gameById(s.machine.game)?.name ?? 'the machine')} first: it is holding ${money(s.machine.credits * s.machine.denom)} of your money.</p>`, [{ label: 'Close', primary: true, run: back }]);
  if (!bank.loanEligible()) return dialog('Loan desk', `${head}<p>Loans are for balances under $1,000.</p>`, [{ label: 'Close', primary: true, run: back }]);
  const amount = bank.loanAmount();
  dialog('Loan desk', `${head}<p>We can lend you <b>${money(amount)}</b>.</p><p>${terms}</p>`, [
    { label: 'Not now', run: back },
    { label: `Take ${money(amount)}`, primary: true, run: () => bank.takeLoan() },
  ]);
}

function showStats() {
  const s = bank.get();
  const here = current?.game.id;
  const rows = CASINO.flatMap((grp) => grp.games).map((g) => {
    const st = s.stats[g.id];
    if (!st?.hands) return '';
    const sign = (n) => `${n > 0 ? '+' : ''}${money(n)}`;
    return `<tr${g.id === here ? ' class="here"' : ''}><td>${esc(g.name)}</td><td>${st.hands.toLocaleString('en-US')}</td><td>${money(st.wagered)}</td><td>${money(st.won)}</td><td>${sign(st.net)}</td><td>${money(st.biggest)}</td></tr>`;
  }).join('');
  const t = TIERS[s.tier];
  const pct = s.tier < TIERS.length - 1 ? Math.min(100, Math.floor((s.bank / t.next) * 100)) : null;
  dialog('Your casino record', `<p>Bank <b>${money(s.bank)}</b> · ${tierBadge(t)}${s.loan ? ` · loan ${money(s.loan)}` : ''} · this visit <b>${bank.sessionNet > 0 ? '+' : ''}${money(bank.sessionNet)}</b></p>
    ${pct != null ? `<p class="cz-next">Next tier: ${TIERS[s.tier + 1].name} at ${money(t.next)} <span class="cz-meterbar" role="img" aria-label="${pct}% of the way"><span style="width:${pct}%"></span></span></p>` : ''}
    ${rows ? `<div class="cz-stats-wrap"><table class="score cz-stats"><thead><tr><th>Game</th><th>Hands</th><th>Bet</th><th>Paid</th><th>Net</th><th>Best</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No hands played yet.</p>'}`,
  [{ label: 'Loan desk', run: () => loanDesk({ back: showStats }) }, { label: 'Hall of Fame', run: () => showHall() }, { label: 'Close', primary: true }]);
}

/** The Hall of Fame: a walnut board with a brass plate per player who reached a billion. */
function showHall() {
  const { hall } = bank.get();
  const plate = (txt, sub = '') => `<li class="cz-plate">${imgArt(ART.hallPlate)}<span>${txt}${sub ? `<small>${sub}</small>` : ''}</span></li>`;
  const rows = hall.length
    ? hall.map((h, i) => plate(`${i + 1}. ${esc(h.name)}`, `${esc(new Date(`${h.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}${h.hands ? ` · ${Number(h.hands).toLocaleString('en-US')} hands` : ''}`)).join('')
    : plate('Your name here');
  dialog('Hall of Fame', `<div class="cz-hall-board"><ol class="cz-plates">${rows}</ol></div>
    ${hall.length ? '' : '<p class="muted">No names yet. A billion dollars gets you on the wall.</p>'}`, [{ label: 'Close', primary: true }]);
}

/** House rules: one select or checkbox per module setting, saved per game. */
function showOptions() {
  const c = current;
  const { mod } = c;
  const settings = mod.settings ?? [];
  if (!settings.length) {
    dialog(`${mod.name} options`, `<p class="muted">This table plays the standard rules for now. Options planned here:</p>
      <ul>${(mod.options ?? []).map((o) => `<li>${esc(o)}</li>`).join('') || '<li>None yet.</li>'}</ul>`, [{ label: 'Close', primary: true }]);
    return;
  }
  const o = c.ctx.opts;
  const field = (s) => (s.type === 'check'
    ? `<label class="choice"><input type="checkbox" data-opt="${esc(s.key)}" ${o[s.key] ? 'checked' : ''}> ${esc(s.label)}</label>`
    : `<label class="cz-opt">${esc(s.label)} <select data-opt="${esc(s.key)}">${s.options.map(([v, l]) => `<option value="${esc(String(v))}" ${v === o[s.key] ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`);
  dialog(`${mod.name} options`, `<div class="cz-opts">${settings.map(field).join('')}</div><p class="muted">Changes apply from the next round.</p>`, [
    { label: 'Cancel' },
    {
      label: 'Save', primary: true,
      run: () => {
        if (current !== c) return;
        const next = {};
        for (const s of settings) {
          const el = dlg.querySelector(`[data-opt="${CSS.escape(s.key)}"]`);
          if (!el) continue;
          next[s.key] = s.type === 'check' ? el.checked : s.options.find(([v]) => String(v) === el.value)?.[0] ?? s.default;
        }
        writeJSON(optsKey(mod.id), next);
        c.ctx.opts = readOpts(mod);
        mod.optionsChanged?.(c.ctx.opts);
      },
    },
  ]);
}

function howtoBody(mod) {
  return typeof mod.howto === 'string' ? mod.howto : sectionsHTML(mod.howto, mod.settings ?? []);
}
function showRules() {
  const d = $('cz-rules');
  $('cz-rules-title').textContent = `How to play ${current.mod.name}`;
  $('cz-rules-body').innerHTML = howtoBody(current.mod);
  $('cz-howto-auto').checked = howtoAuto();
  if (!d.open) d.showModal();
  $('cz-rules-body').scrollTop = 0;
}
/** The first time a game opens, its How to play shows by itself (unless turned off). */
function maybeShowHowto() {
  const id = current.game.id;
  const seen = readJSON(HOWTO_SEEN, []);
  if (seen.includes(id)) return false;
  writeJSON(HOWTO_SEEN, [...seen, id]);
  if (!howtoAuto()) return false;
  showRules();
  $('cz-rules').addEventListener('close', () => { if (current?.game.id === id) checkBroke(); }, { once: true });
  return true;
}
$('cz-howto-auto').addEventListener('change', (e) => { try { localStorage.setItem(HOWTO_AUTO, e.target.checked ? '1' : '0'); } catch { /* ignore */ } });

window.addEventListener('dc:settings', () => {
  if (!current) return;
  paintFelt(felt);
  for (const l of current.layers) l.repaint();
});

// ------------------------------------------------------------------ start: casino.html?g=roulette&s=25 or casino.html#roulette
const params = new URLSearchParams(location.search);
const deep = params.get('g') || location.hash.slice(1);
renderChooser();
paintBank();
warmModules();
if (gameById(deep)) openGame(deep, params.get('s') ?? readStakes()[deep]);

// Back and forward between the chooser and a table.
window.addEventListener('popstate', () => {
  syncShell();
  const p = new URLSearchParams(location.search);
  const id = p.get('g');
  const same = current && current.game.id === id && current.stakes.id === p.get('s');
  if (same) return;
  if (current && leaveCost()) {
    // put the table back in the address bar while the player decides
    const c = current;
    history.pushState({ cz: true }, '', `casino.html?g=${c.game.id}&s=${c.stakes.id}`);
    syncShell();
    guardLeave(() => { closeGame(); if (gameById(id)) openGame(id, p.get('s')); else showChooser(); });
    return;
  }
  if (gameById(id)) openGame(id, p.get('s'));
  else showChooser({ address: false });
});
