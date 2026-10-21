// The lobby: a welcome, then a look into each of the three rooms (card games, the solitaire parlor
// and the casino), a few featured games apiece and a way into the room's full list.
import { CATEGORIES, GAMES, SOLITAIRE, PINOCHLE_VARIANTS } from './catalog.js';
import { ALL_GAMES as CASINO_GAMES } from './casino/catalog.js';
import { KEY as BANK_KEY, START as BANK_START, normalize, TIERS, moneyPill } from './core/bank.js';
import { mountChrome, esc, playerName, hasName } from './header.js';
import { gameTile, variantChips } from './tiles.js';

// Old links to a game or a kind of game in the lobby (lobby.html#hearts, #trick) now live on the
// card games page. The lobby's own rooms (#games, #solitaire, #casino) stay here.
const hash = location.hash.slice(1);
if (hash && !document.getElementById(hash) && (GAMES.some((g) => g.id === hash) || CATEGORIES.some((c) => c.id === hash))) location.replace(`games.html#${hash}`);

mountChrome('lobby');

/** The featured games in each room (the rest are a click away). */
const FEATURED_GAMES = ['hearts', 'spades', 'bridge', 'cribbage'];
const FEATURED_SOLITAIRE = [
  ['klondike', 'Klondike', 'The classic', 'Build down in alternating colors and draw one card at a time.'],
  ['spider', 'Spider', 'Two decks', 'Build full suits from King to Ace and watch the runs fly off.'],
  ['pyramid', 'Pyramid', 'Quick to learn', 'Pair up uncovered cards that add to thirteen and clear the pyramid.'],
];
const FEATURED_CASINO = ['blackjack', 'roulette', 'craps', 'slots'];

const SOL_COUNT = SOLITAIRE.reduce((n, col) => n + col.games.length, 0);

const more = ({ href, count, unit, title, line, go }) => `<a class="lb-more" href="${href}">
    <span class="lb-more-count"><b>${count}</b> ${unit}</span>
    <span class="lb-more-title">${title}</span>
    <span class="lb-more-line">${line}</span>
    <span class="lb-go">${go} <span aria-hidden="true">→</span></span>
  </a>`;

const doors = [
  { href: '#games', art: 'assets/art/lobby/tile-pinochle.webp', title: 'Card games', line: `${GAMES.length} tables, from Pinochle to Go Fish` },
  { href: '#solitaire', art: 'assets/art/lobby/solitaire-banner.webp', title: 'Solitaire parlor', line: `${SOL_COUNT} layouts for one` },
  { href: '#casino', art: 'assets/art/casino/chooser/casino-banner.webp', title: 'Casino', line: `${CASINO_GAMES.length} games, one bankroll` },
];

function casinoTile(game) {
  return `<a class="tile ready" href="casino.html?g=${game.id}">
    <div class="tile-art" style="background:${game.felt}">
      <img src="assets/art/casino/chooser/tile-${game.id}.webp" width="1200" height="750" alt="" loading="lazy" decoding="async">
      <span class="tile-badge">${game.machine ? 'Machine' : 'Table'}</span>
    </div>
    <div class="tile-body"><b>${esc(game.name)}</b><span>${esc(game.blurb)}</span></div>
  </a>`;
}

const solTile = ([id, name, tag, line]) => `<a class="lb-sol" href="solitaire.html?v=${id}">
    <span class="lb-sol-tag">${tag}</span><b>${name}</b><span>${line}</span>
    <span class="lb-go">Deal <span aria-hidden="true">→</span></span>
  </a>`;

/** The casino bank, read straight from storage (the lobby never changes it). */
function readBank() {
  let raw = null;
  try { raw = localStorage.getItem(BANK_KEY); } catch { /* private mode */ }
  if (!raw) return null;
  try { return normalize(JSON.parse(raw)); } catch { return null; }
}

function paintBank() {
  const s = readBank();
  const el = document.getElementById('bank');
  if (!s) {
    el.style.setProperty('--tier', TIERS[0].color);
    el.innerHTML = `<span class="lb-bank-label">Your stake</span><b>${moneyPill(BANK_START)}</b><span class="lb-bank-tier">waiting at the cage</span>`;
    el.setAttribute('aria-label', `Enter the casino: a ${moneyPill(BANK_START)} stake is waiting for you`);
    return;
  }
  const tier = TIERS[s.tier] ?? TIERS[0];
  const balance = s.bank + (s.machine ? s.machine.credits * s.machine.denom : 0);
  el.style.setProperty('--tier', tier.color);
  el.innerHTML = `<span class="lb-bank-label">Your bank</span><b>${moneyPill(balance)}</b><span class="lb-bank-tier">${esc(tier.name)} tier${s.loan ? ' · loan out' : ''}</span>`;
  el.setAttribute('aria-label', `Enter the casino: your bank is ${moneyPill(balance)}, ${tier.name} tier`);
}

function render() {
  document.getElementById('greeting').textContent = hasName() ? `Welcome back, ${playerName()}.` : 'Welcome! Set your name under Table settings.';
  document.getElementById('hero-line').textContent =
    `${GAMES.length} card games, ${SOL_COUNT} solitaire layouts and ${CASINO_GAMES.length} casino games under one roof. Take a seat with a cast of twelve characters, deal a quiet hand on your own, or try your luck at the tables.`;
  document.getElementById('doors').innerHTML = doors.map((d) => `<a class="lb-door" href="${d.href}">
      <img src="${d.art}" alt="" loading="lazy" decoding="async">
      <span><b>${d.title}</b><span>${d.line}</span></span><span class="lb-door-go" aria-hidden="true">↓</span>
    </a>`).join('');
  document.getElementById('pinochle-variants').innerHTML = variantChips(PINOCHLE_VARIANTS);

  document.getElementById('games-tiles').innerHTML = FEATURED_GAMES.map((id) => GAMES.find((g) => g.id === id)).filter(Boolean).map(gameTile).join('')
    + more({ href: 'games.html', count: GAMES.length, unit: 'games', title: 'More card games', line: 'Trick-taking, melding, draw poker and family games', go: 'See them all' });
  document.getElementById('sol-tiles').innerHTML = FEATURED_SOLITAIRE.map(solTile).join('')
    + more({ href: 'solitaire.html', count: SOL_COUNT, unit: 'layouts', title: 'All solitaires', line: 'One deck, two decks and arcade games', go: 'Open the parlor' });
  document.getElementById('casino-tiles').innerHTML = FEATURED_CASINO.map((id) => CASINO_GAMES.find((g) => g.id === id)).filter(Boolean).map(casinoTile).join('')
    + more({ href: 'casino.html', count: CASINO_GAMES.length, unit: 'games', title: 'Enter the casino', line: 'Card tables, dice, the wheel, machines and Keno', go: 'Step inside' });
  paintBank();
}

window.addEventListener('dc:settings', render);
// The bank changed in another tab (a casino window left open).
window.addEventListener('storage', (e) => { if (e.key === BANK_KEY) paintBank(); });
render();
