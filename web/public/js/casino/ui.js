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
/** "1 credit", "1,250 credits". */
const cr = (n) => `${Number(n).toLocaleString('en-US')} credit${n === 1 ? '' : 's'}`;
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

/** Dollars sitting in a machine as credits, as the meter shows them (a held meter keeps a spin's
 *  result back until the reels stop). The pills count them, so every spin moves the balance. */
function machineDollars(s) {
  const m = s.machine;
  if (!m) return 0;
  const shown = meterHeld && current?.machine && current.meterShown != null ? current.meterShown : m.credits;
  return shown * m.denom;
}

/** The pill's insides: full amount (or $1.25M from a million up) and a short one for phones. */
function pillHTML(s, t) {
  const loan = s.loan ? `<span class="cz-loan-mark" title="Loan ${money(s.loan)} outstanding">L</span>` : '';
  const total = s.bank + machineDollars(s);
  return `${medal(t, 'cz-pill-chip')}<span class="visually-hidden">Balance, ${t.name} tier: </span><b class="cz-amt-full">${moneyPill(total)}</b><b class="cz-amt-short" aria-hidden="true">${moneyShort(total)}</b>${loan}`;
}

function paintBank() {
  const s = held ?? bank.get();
  const t = TIERS[s.tier];
  const inMachine = machineDollars(s);
  const label = `${inMachine ? `Balance ${money(s.bank + inMachine)}: bank ${money(s.bank)} plus ${money(inMachine)} in the machine` : `Bank ${money(s.bank)}`}, ${t.name} tier${s.loan ? `, loan ${money(s.loan)} outstanding` : ''}. Open your casino stats.`;
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
  repaid: (e) => (e.manual ? `Loan of ${money(e.amount)} paid back. Thanks for settling up.` : `Your ${money(e.amount)} loan has been repaid from your winnings.`),
  loan: (e) => `${money(e.amount)} loan added to your bank.`,
  reset: () => 'Bank reset to $5,000.',
  corrupt: () => 'Your casino bank couldn\'t be read, so it was reset to $5,000.',
};
/** Bank news: toasts, and one dialog for a tier climbed (naming the highest tier reached), the Hall
 *  of Fame overlay, or the read-only notice. */
const announce = (events) => {
  for (const e of events) if (EVENT_TEXT[e.type]) toast(EVENT_TEXT[e.type](e));
  const fame = events.filter((e) => e.type === 'hall').pop();
  const ups = events.filter((e) => e.type === 'upgrade');
  if (events.some((e) => e.type === 'readonly')) readOnlyNotice();
  else if (fame) hallOfFameMoment(fame.entry);
  else if (ups.length) tierUp(Math.max(...ups.map((e) => e.to)));
};

/** "Welcome to Gold": the tier's card and what the new tier lends. */
function tierUp(to) {
  const t = TIERS[to];
  play('win');
  dialog(`Welcome to ${t.name}`, `<div class="cz-tierup" style="--tier:${t.color}">${tierCard(t)}
    <p>Your bank passed <b>${money(TIERS[to - 1].next)}</b>. ${t.name} members can borrow up to <b>${money(t.loan)}</b>.</p>
    <p class="muted">${to < TIERS.length - 1 ? `Next: ${TIERS[to + 1].name} at ${money(t.next)}.` : `At ${money(t.next)} your name goes on the Hall of Fame.`}</p></div>`,
  [{ label: 'Nice', primary: true }]);
}

/** A billion dollars: a full-screen moment, then the Hall of Fame. */
function hallOfFameMoment(entry) {
  document.querySelector('.cz-fame')?.remove();
  const o = document.createElement('div');
  o.className = 'cz-fame';
  o.setAttribute('role', 'alertdialog');
  o.setAttribute('aria-modal', 'true');
  o.setAttribute('aria-labelledby', 'cz-fame-title');
  o.innerHTML = `<div class="cz-fame-card">${medal(TIERS[TIERS.length - 1], 'cz-fame-medal')}
    <h2 id="cz-fame-title">Hall of Fame</h2>
    <p>You've reached a billion dollars, ${esc(entry.name)}! Your name goes on the wall.</p>
    <p class="muted">Your bank starts over at $5,000 on the Brass tier.</p>
    <button class="btn primary" type="button">See the Hall of Fame</button></div>`;
  document.body.append(o);
  play('score');
  const btn = o.querySelector('button');
  btn.addEventListener('click', () => { o.remove(); showHall(); });
  o.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); o.remove(); } });
  btn.focus();
}

/** The save came from a newer version of the casino (another tab): nothing changes until a reload. */
const READONLY_TEXT = 'The casino was updated in another tab. Reload to keep playing.';
function readOnlyNotice() {
  document.body.classList.add('cz-readonly');
  dialog('The casino was updated', `<p>${READONLY_TEXT}</p><p class="muted">Until then your bank is shown but can't change.</p>`,
    [{ label: 'Not now' }, { label: 'Reload', primary: true, run: () => location.reload() }]);
}

// ---- big wins: a brief card with a brass burst once the result is revealed
let bigQueue = null;
let meterHeld = false; // a machine's meter is showing the old figure while its result is revealed
function queueBigWin(w) {
  bigQueue = w;
  setTimeout(flushBigWin, 0); // a game may hold the bank just after it settles
}
function flushBigWin() {
  if (!bigQueue || held || meterHeld || !current) return;
  const { title = 'Big win!', detail = '' } = bigQueue;
  bigQueue = null;
  document.querySelector('.cz-bigwin')?.remove();
  const o = document.createElement('div');
  o.className = 'cz-bigwin';
  o.setAttribute('role', 'status');
  o.innerHTML = `<div class="cz-bigwin-card"><span class="cz-bigwin-burst" aria-hidden="true"></span><b>${esc(title)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}</div>`;
  document.body.append(o);
  // the result banner gives way while the card is up, then comes back (it says what the card doesn't)
  $('cz-result').classList.add('under-big');
  play('score');
  const done = () => { o.classList.add('out'); setTimeout(() => { o.remove(); if (!document.querySelector('.cz-bigwin')) unhideBanner(); }, 400); document.removeEventListener('pointerdown', done, true); document.removeEventListener('keydown', done, true); };
  setTimeout(() => { document.addEventListener('pointerdown', done, true); document.addEventListener('keydown', done, true); }, 250);
  setTimeout(done, reducedMotion() ? 2500 : 4000);
}
/** A settled round worth a fanfare: a net win of 50 times the table minimum or more. */
function bigCheck(c, settled) {
  if (settled && settled.net > 0 && settled.net >= 50 * c.stakes.min) queueBigWin({ title: 'Big win!', detail: `+${money(settled.net)}` });
  return settled;
}
bank.subscribe((_, events) => {
  if (held) { heldEvents.push(...events); if (current) { paintMeter(); } return; }
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
    flushBigWin();
    announce(heldEvents.splice(0));
  };
}

function toast(msg, { big = false, tier = null } = {}) {
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
  const loanLine = s.loan ? `Loan outstanding: <b>${money(s.loan)}</b>. It is repaid automatically once your bank reaches ${money(t.next)}${bank.canRepay() ? ', or pay it back now at the loan desk' : ''}.`
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
const stakeButton = (s, on, g) => {
  const ok = coverable(s);
  return `<button type="button" role="radio" aria-checked="${on}" data-stakes="${s.id}" ${ok ? '' : 'disabled'}
    title="${ok ? stakesLabel(s, g) : `${stakesLabel(s, g)}: your bank can't cover the ${money(s.min)} ${s.denom && !g?.room ? 'credit' : 'minimum'}`}">${stakesShort(s)}</button>`;
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
    tile.querySelector('.cz-stakes').innerHTML = stakesFor(g).map((s) => stakeButton(s, s.id === st.id, g)).join('');
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
          <div class="cz-stakes" style="--n:${stakesFor(g).length}" role="radiogroup" aria-label="${g.machine ? 'Denomination' : 'Table limits'} for ${esc(g.name)}">${stakesFor(g).map((s) => stakeButton(s, s.id === st.id, g)).join('')}</div>
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
    bets: null, actions: [], keys: new Map(), layers: [], timers: new Set(), offs: [], label: game.action, meterShown: null,
  };
  loadCSS(mod.css);
  setAddress(`casino.html?g=${id}&s=${stakes.id}`, push);
  document.body.classList.add('cz-playing');
  chooser.hidden = true;
  room.hidden = false;
  $('cz-title').textContent = game.name;
  $('cz-subtitle').textContent = game.subtitle ?? '';
  $('cz-stakes').textContent = game.machine ? `${stakesLabel(stakes, game)}` : `Table limits ${stakesLabel(stakes)}`;
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
  // buttons a game has no use for are not shown at all (a machine plays on credits: no Undo, Clear or Rebet)
  const hide = new Set(mod.hideButtons ?? (current.machine ? ['undo', 'clear', 'rebet'] : []));
  for (const b of ['undo', 'clear', 'rebet']) $(`cz-${b}`).hidden = hide.has(b);
  $('cz-erase').hidden = true;
  paintBank();
  current.ctx = makeCtx(current);
  current.mod.mount(felt, current.ctx);
  window.scrollTo(0, 0);
  fitTable();
  current.ctx.after(350, () => fitTable()); // pictures and fonts that arrived since
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
    if (out.credits) toast(`Cashed out ${cr(out.credits)} (${money(out.dollars)}).`);
  }
  for (const off of c.offs) off();
  felt.innerHTML = '';
  held = null;
  meterHeld = false;
  bigQueue = null;
  clearTimeout(bannerTimer);
  if (heldEvents.length) announce(heldEvents.splice(0));
  delete room.dataset.game;
  room.classList.remove('cz-side');
  room.style.removeProperty('--cz-fit');
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
    stakesText: game.machine ? stakesLabel(stakes, game) : `table limits ${stakesLabel(stakes)}`,
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
    /** Save house-rule options the game changed itself (a preset filling in its rules, a machine
     *  picked beside the cabinet): saveOpt('machine', 'deuces') or saveOpt({ ... }). ctx.opts follows. */
    saveOpt: guard((key, value) => {
      const patch = typeof key === 'object' && key ? key : { [key]: value };
      writeJSON(optsKey(c.mod.id), { ...readJSON(optsKey(c.mod.id), {}), ...patch });
      ctx.opts = readOpts(c.mod);
      return ctx.opts;
    }),
    /** A win worth a fanfare: shown as the big-win card once the result is revealed. */
    bigWin: guard((title, detail) => queueBigWin({ title, detail })),
    // money: debit at commit, settle at once (kit/round.js)
    wager: (n, o) => (live() ? c.round.wager(n, o) : false),
    refund: (n) => (live() ? c.round.refund(n) : 0),
    pay: (n) => (live() ? c.round.pay(n) : 0),
    settle: (o) => (live() ? bigCheck(c, c.round.settle(o)) : null),
    apply: (r) => { if (!live()) return { ok: false, error: 'The table is closed.' }; const out = c.round.apply(r); if (out.settled) bigCheck(c, out.settled); return out; },
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

/** The bet bar's total. With `staged`, also what the bank keeps once the staged bets go down:
 *  `debit` is what they take (default n; less when n also counts bets already on the table). */
function setTotal(n, { staged = false, debit = n } = {}) {
  $('cz-total').textContent = money(n);
  const after = $('cz-after');
  after.textContent = staged && debit > 0 ? `Bank after bet ${money(Math.max(0, bank.balance - debit))}` : '';
}

function showRack(on = true) {
  $('cz-rack').hidden = !on;
  if (current) current.rackShown = on;
}

function paintRack() {
  if (!current) return;
  const rack = rackFor(current.stakes);
  const staged = current.bets?.staging.cost() ?? 0;
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

// ---- fitting the table to the screen
// On a tablet or a computer the table, its message line and the bet bar all fit on the screen
// without scrolling, and the table takes all the room that is left: the shell works out the height
// a drawing on the felt may take and hands it to the CSS as --cz-fit (px). Where the screen is wide
// for its height the controls go beside the felt instead of under it (#room.cz-side), when that
// gives the table more room. Phones scroll, with the controls docked at the bottom, and keep their
// own sizes.
const PHONE_MQ = matchMedia('(max-width: 640px)');
const SIDE_MIN_W = 1100;
let fitMode = 'bottom', fitTimer = 0, fitDockH = 0;
const dockEl = room.querySelector('.cz-dock');
/** The area of the biggest drawing on the felt, as drawn (a letterboxed SVG counts its drawing only). */
function drawnArea() {
  let best = 0;
  for (const s of felt.querySelectorAll('svg[viewBox]')) {
    const r = s.getBoundingClientRect();
    const vb = s.viewBox?.baseVal;
    if (!r.width || !r.height || !vb?.width || !vb?.height) continue;
    const k = Math.min(r.width / vb.width, r.height / vb.height);
    best = Math.max(best, vb.width * k * vb.height * k);
  }
  return best;
}
/** Lay the room out in `mode` and size --cz-fit so nothing runs past the bottom of the screen. */
function applyFit(mode) {
  fitMode = mode;
  room.classList.toggle('cz-side', mode === 'side');
  const vh = innerHeight;
  const fr = felt.getBoundingClientRect();
  const cs = getComputedStyle(felt);
  const pads = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const bar = room.querySelector('.cz-betbar');
  const below = mode === 'side' ? 0 : bar.getBoundingClientRect().bottom - fr.bottom;
  let fit = Math.floor(vh - (fr.top + scrollY) - pads - below - 10);
  for (let i = 0; i < 3; i++) {
    room.style.setProperty('--cz-fit', `${Math.max(240, fit)}px`);
    const bottom = mode === 'side'
      ? Math.max(felt.getBoundingClientRect().bottom, dockEl.getBoundingClientRect().bottom)
      : bar.getBoundingClientRect().bottom;
    const over = Math.ceil(bottom + scrollY + 10 - vh);
    if (over <= 1 || fit <= 240) break;
    fit -= over;
  }
  fitDockH = dockEl.getBoundingClientRect().height;
}
/** Pick the layout (controls under the felt or beside it) and fit the table to the screen. */
function fitTable({ pick = true } = {}) {
  if (!current || room.hidden) return;
  if (PHONE_MQ.matches) {
    room.classList.remove('cz-side');
    room.style.removeProperty('--cz-fit');
    fitMode = 'bottom';
    return;
  }
  const y = scrollY;
  if (!pick || innerWidth < SIDE_MIN_W) { applyFit(pick ? 'bottom' : fitMode); scrollTo(0, y); return; }
  applyFit('side');
  const side = drawnArea();
  const sideOK = dockEl.getBoundingClientRect().bottom + scrollY <= innerHeight;
  applyFit('bottom');
  if (sideOK && side > drawnArea() * 1.1) applyFit('side');
  scrollTo(0, y);
}
const refit = (o) => { cancelAnimationFrame(fitTimer); fitTimer = requestAnimationFrame(() => fitTable(o)); };
addEventListener('resize', () => refit());
// the controls under the felt grow (a second row of buttons): the table makes room
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(() => {
    if (!current || fitMode === 'side' || Math.abs(dockEl.getBoundingClientRect().height - fitDockH) < 2) return;
    refit({ pick: false });
  }).observe(dockEl);
}

// ---- result banner over the felt (aria-live), cleared by the next bet
// Where it sits: `at` 'middle' (default), 'top' (over the crest) or 'bottom' (over the betting
// area), per call or for the whole game with the module's `bannerAt`. It goes by itself after
// `ms` (default 4.5 s; 0 = stays until the next bet or a click).
let bannerTimer = 0;
const BANNER_AT = ['top', 'middle', 'bottom'];
function showBanner(title, { tone = 'info', detail = '', at = current?.mod.bannerAt, ms = 4500 } = {}) {
  const b = $('cz-result');
  clearTimeout(bannerTimer);
  b.className = `cz-result ${tone} at-${BANNER_AT.includes(at) ? at : 'middle'}`;
  b.innerHTML = `<b>${esc(title)}</b>${detail ? `<span>${esc(detail)}</span>` : ''}`;
  b.hidden = false;
  if (ms > 0) bannerTimer = setTimeout(fadeBanner, ms);
}
function fadeBanner() {
  const b = $('cz-result');
  if (b.hidden) return;
  if (reducedMotion()) { clearBanner(); return; }
  b.classList.add('out');
  bannerTimer = setTimeout(clearBanner, 400);
}
/** After a big-win card: the banner shows again for a moment before it fades. */
function unhideBanner() {
  const b = $('cz-result');
  if (!b.classList.contains('under-big')) return;
  b.classList.remove('under-big');
  if (!b.hidden) { clearTimeout(bannerTimer); bannerTimer = setTimeout(fadeBanner, 2500); }
}
function clearBanner() { clearTimeout(bannerTimer); const b = $('cz-result'); b.hidden = true; b.innerHTML = ''; b.classList.remove('out'); }
$('cz-result').addEventListener('click', clearBanner);

// ---- staged bets on the layout's spots: ctx.bets({ ... })
function makeBets(c, spec = {}) {
  const { stakes, game } = c;
  const staging = createStaging({
    spot: spec.spot ?? (() => ({})),
    limits: { min: stakes.min, max: stakes.max },
    available: () => bank.balance,
    validate: spec.validate ?? null,
    cost: spec.cost ?? null,
  });
  /** What the bet bar shows: what the staged chips will take (and, with withTable, the bets already up). */
  const shown = () => staging.cost() + (spec.withTable ? c.round.onTable : 0);
  const helper = {
    staging, removeMode: false,
    amounts: () => staging.amounts(),
    amount: (k) => staging.amount(k),
    total: () => staging.total(),
    /** What committing the staged layout takes from the bank (spec.cost, or the sum of the spots). */
    cost: () => staging.cost(),
    /** The bet bar's figure: cost(), plus the bets already on the table with spec.withTable. */
    shown,
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
      c.ctx.message(`${times > 1 ? 'Double the' : 'Same'} bets again. On the felt ${money(shown())}.`);
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
          { label: `Bet ${money(problem.min)}`, primary: true, disabled: raise <= 0 || staging.costOf({ ...staging.amounts(), [problem.key]: problem.min }) > bank.balance, run: () => { staging.set({ ...staging.amounts(), [problem.key]: problem.min }); changed(); helper.commit(fn, { hold }); } },
        ]);
        return false;
      }
      if (problem) { play('error'); c.ctx.message(problem.error); return false; }
      const amounts = staging.amounts();
      const total = staging.cost();
      if (!total) { play('error'); c.ctx.message('Place a bet first.'); return false; }
      const release = hold ? holdBank() : () => {};
      if (!c.round.wager(total)) { release(); play('error'); c.ctx.message(bank.readOnly ? READONLY_TEXT : 'The bank can\'t cover those bets.'); return false; }
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
    c.ctx.message(r.amount ? `${label}: ${money(r.amount)}. On the felt ${money(shown())}.` : `${label} cleared. On the felt ${money(shown())}.`);
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
  setTotal(locked ? c.round.onTable : h.shown(), { staged: !locked, debit: h.cost() });
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
      c.ctx.message(m.credits ? `That needs ${cr(credits)}; the meter has ${m.credits}.` : 'Insert bills to play.');
      if (!m.credits) insertBills();
      return false;
    },
    /** The round is decided: `won` credits onto the meter, the round recorded in dollars. */
    pay(won = 0) {
      if (!c.live) return null;
      const r = m.pay(won);
      paintMeter();
      if (r.net >= 100) queueBigWin({ title: 'Big win!', detail: `${cr(r.won)} (${money(r.won * m.denom)})` });
      return r;
    },
    /** Keep the shell's credit meter (and Cash out) on the figure it shows now while the game reveals
     *  a result it has already paid; returns release(). Call it after bet() and before pay(). */
    hold() {
      if (!c.live) return () => {};
      c.meterShown = m.credits;
      meterHeld = true;
      paintMeter();
      paintBank();
      let done = false;
      return () => {
        if (done || current !== c) return;
        done = true;
        c.meterShown = null;
        meterHeld = false;
        paintMeter();
        paintBank();
        flushBigWin();
      };
    },
    /** Call fn(credits) whenever the meter changes (bills in, cash out, another window); returns a
     *  function that stops listening (done for you when the game closes). */
    onChange(fn) {
      const off = bank.subscribe(() => { if (c.live) fn(m.credits); });
      c.offs.push(off);
      return off;
    },
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
  const n = c.meterShown ?? m.credits;
  $('cz-credits').textContent = n.toLocaleString('en-US');
  $('cz-credits-usd').textContent = `= ${money(n * m.denom)}`;
  // mid-hand Cash out stays pressable and says why it can't pay out yet (a disabled button can't)
  const out = $('cz-cashout'), busy = m.betting > 0;
  out.disabled = c.meterShown != null || (!m.credits && !busy);
  out.classList.toggle('cz-wait', busy);
  out.setAttribute('aria-disabled', String(busy));
  out.title = busy ? 'Finish this hand before cashing out' : '';
}

function insertBills() {
  const c = current;
  if (!c?.machine) return;
  const m = c.machine;
  if (m.blocked) {
    const other = bank.machine;
    const name = gameById(other.game)?.name ?? 'another machine';
    dialog('Insert bills', `<p>${esc(name)} is holding ${cr(other.credits)} of your money. Cash out there first.</p>`, [
      { label: 'Not now' },
      { label: 'Cash it out now', primary: true, run: () => { const r = bank.machineOut(); toast(`Cashed out ${cr(r.credits)} (${money(r.dollars)}).`); paintMeter(); } },
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
      toast(r.reason === 'readonly' ? READONLY_TEXT : r.reason === 'full' ? 'The meter is full.' : r.reason === 'other-machine' ? 'Another machine is holding your credits. Cash out there first.' : `Insert at least ${money(m.denom)}.`);
      return;
    }
    play('chips');
    current?.ctx.message(`${cr(r.credits)} added.`);
    paintMeter();
  }
}

function cashOut() {
  const c = current;
  if (!c?.machine) return;
  if (c.machine.betting) { play('error'); c.ctx.message('Finish this hand before cashing out: the bet is still on the machine.'); return; }
  if (c.meterShown != null) return; // a result is still being revealed
  const r = c.machine.cashOut();
  if (r.credits) { play('chips'); toast(`Cashed out ${cr(r.credits)} (${money(r.dollars)}).`); }
  paintMeter();
}

// ------------------------------------------------------------------ commands: buttons and keys
/** Phones: when play starts, bring the whole table up between the top of the screen and the docked
 *  bet bar (if it fits there), so the cards and the bets aren't under the bar. */
function phoneToTable() {
  if (!PHONE_MQ.matches) return;
  const f = room.querySelector('.cz-feltwrap').getBoundingClientRect();
  const dockH = dockEl.getBoundingClientRect().height;
  if (f.height + dockH > innerHeight) return;
  const y = scrollY + f.top - Math.max(4, innerHeight - dockH - f.height - 4);
  if (y > scrollY + 2) scrollTo({ top: y, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

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
  if (cmd === 'action') { phoneToTable(); return mod.action(); }
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

// Enter and Space press the main button. A spot or card on the felt that has focus only because it
// was clicked doesn't keep them: they go to the main button (Deal, Spin, Draw) as if nothing had
// focus. Focus moved there with the keyboard (Tab, arrows) keeps them, so a spot can be bet by key.
let pointerFocus = false;
document.addEventListener('pointerdown', () => { pointerFocus = true; }, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || e.key.startsWith('Arrow')) { pointerFocus = false; return; }
  if ((e.key !== 'Enter' && e.key !== ' ') || !pointerFocus || !current || e.ctrlKey || e.metaKey || e.altKey) return;
  const f = document.activeElement;
  if (!f || f === felt || !felt.contains(f) || f.closest('input, select, textarea') || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  e.stopPropagation();
  press('cz-action');
}, true);

document.addEventListener('keydown', (e) => {
  const c = current;
  if (!c || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  // the game's own keys come first (action buttons, then ctx.keys)
  // (a hidden or disabled button's key falls through, so R still rebets when Surrender is hidden)
  const d = c.actions.find((a) => a.key && a.key.toLowerCase() === k && !a.hidden && !a.disabled);
  if (d && runAction(d)) { e.preventDefault(); return; }
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
// A closed dialog hands focus back to the button that opened it (How to play, Options, Stats), where
// Enter would only open it again: at a table, focus goes to the play instead.
function focusPlay() {
  if (!current || room.hidden || document.querySelector('dialog[open]')) return;
  const a = document.activeElement;
  if (a && a !== document.body && !a.closest('.table-top, .site-header')) return;
  const next = [$('cz-action'), ...$('cz-actions').querySelectorAll('button')].find((b) => !b.disabled && !b.hidden && !b.closest('[hidden]'));
  (next ?? $('cz-msg')).focus({ preventScroll: true });
}
for (const d of [dlg, $('cz-rules')]) d.addEventListener('close', () => setTimeout(focusPlay, 0));
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
  const terms = `It's repaid automatically once your bank reaches ${money(t.next)}, or pay it back any time. While a loan is out, your tier can't go up.`;
  if (s.loan) {
    const can = bank.canRepay();
    return dialog('Loan desk', `${head}<p>You owe <b>${money(s.loan)}</b>. It's repaid automatically once your bank reaches ${money(t.next)}, or pay it back now. While a loan is out, your tier can't go up.</p>
      ${can ? '' : `<p class="muted">You'll need ${money(s.loan)} in the bank to repay it.</p>`}`, [
      { label: 'Close', run: back },
      { label: 'Pay it back now', primary: can, disabled: !can, run: () => { if (!bank.repayLoan()) toast('The bank can\'t cover the loan yet.'); } },
    ]);
  }
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
  [{ label: 'Loan desk', run: () => loanDesk({ back: showStats }) }, { label: 'Hall of Fame', run: () => showHall() },
    { label: 'Reset bank…', run: () => confirmReset({ back: showStats }) }, { label: 'Close', primary: true }]);
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
  // a game may show its options filled in (a rule set's own rules) and keep the form consistent
  // while it is edited (picking a rule set fills in its rules; changing a rule makes it Custom)
  const o = mod.optionsShown ? mod.optionsShown({ ...c.ctx.opts }) : c.ctx.opts;
  const field = (s) => (s.type === 'check'
    ? `<label class="choice"><input type="checkbox" data-opt="${esc(s.key)}" ${o[s.key] ? 'checked' : ''}> ${esc(s.label)}</label>`
    : `<label class="cz-opt">${esc(s.label)} <select data-opt="${esc(s.key)}">${s.options.map(([v, l]) => `<option value="${esc(String(v))}" ${v === o[s.key] ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`);
  const input = (s) => dlg.querySelector(`[data-opt="${CSS.escape(s.key)}"]`);
  const readForm = () => {
    const next = {};
    for (const s of settings) {
      const el = input(s);
      if (!el) continue;
      next[s.key] = s.type === 'check' ? el.checked : s.options.find(([v]) => String(v) === el.value)?.[0] ?? s.default;
    }
    return next;
  };
  dialog(`${mod.name} options`, `<div class="cz-opts">${settings.map(field).join('')}</div><p class="muted">Changes apply from the next round.</p>`, [
    { label: 'Cancel' },
    {
      label: 'Save', primary: true,
      run: () => {
        if (current !== c) return;
        writeJSON(optsKey(mod.id), readForm());
        c.ctx.opts = readOpts(mod);
        mod.optionsChanged?.(c.ctx.opts);
      },
    },
  ]);
  if (mod.optionsInput) {
    dlg.querySelector('.cz-opts').addEventListener('change', (e) => {
      const key = e.target.closest('[data-opt]')?.dataset.opt;
      const patch = key ? mod.optionsInput(key, readForm()) : null;
      for (const [k, v] of Object.entries(patch ?? {})) {
        const s = settings.find((x) => x.key === k);
        const el = s && input(s);
        if (!el) continue;
        if (s.type === 'check') el.checked = Boolean(v); else el.value = String(v);
      }
    });
  }
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
// News from loading the bank (a save it couldn't read, or one from a newer version) ...
announce(bank.drainNotices());
// ... and credits left in a machine when the page was closed go back to the bank first thing (a
// tier reached that way gets its dialog: everything it needs is defined by now).
if (bank.machine) {
  const r = bank.machineOut();
  if (r.credits) toast(`Cashed out ${cr(r.credits)} (${money(r.dollars)}) left in a machine.`);
}
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
