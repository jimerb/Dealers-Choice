import { CATEGORIES, GAMES, SOLITAIRE } from './catalog.js';
import { cardHTML } from './skin.js';
import { mountChrome, esc, playerName, hasName } from './header.js';

mountChrome('lobby');

let filter = 'all';
const FILTERS = [['all', 'All games'], ...CATEGORIES.map((c) => [c.id, c.title])];

function renderHeroFan() {
  const fan = [['A', 'S', -16, 6], ['10', 'S', -8, 22], ['K', 'S', 0, 38], ['Q', 'S', 8, 54], ['J', 'D', 16, 70]];
  document.getElementById('hero-fan').innerHTML = fan.map(([rank, suit, r, left]) =>
    cardHTML({ rank, suit }).replace('class="card', `style="left:${left - 4}%;--r:${r}deg;transform:rotate(${r}deg)" class="card`)).join('');
}

function tile(game) {
  const ready = game.status === 'ready';
  const href = ready ? game.href : `#${game.id}`;
  return `<a class="tile${ready ? ' ready' : ''}" href="${href}" id="${game.id}" ${ready ? '' : 'aria-disabled="true"'}>
    <div class="tile-art" style="background:${game.felt}">
      ${game.show.map(([rank, suit]) => cardHTML({ rank, suit })).join('')}
      <span class="tile-badge">${ready ? 'Play now' : 'In the works'}</span>
    </div>
    <div class="tile-body"><b>${esc(game.name)}</b><span>${esc(game.players)}</span><span>${esc(game.tagline)}</span></div>
  </a>`;
}

function render() {
  document.getElementById('filters').innerHTML = FILTERS.map(([id, label]) =>
    `<button type="button" data-filter="${id}" aria-pressed="${id === filter}">${label}</button>`).join('');
  document.getElementById('groups').innerHTML = CATEGORIES.filter((c) => filter === 'all' || c.id === filter).map((c) => `
    <div class="group">
      <div class="group-head"><h3>${c.title}</h3><span>${c.blurb}</span></div>
      <div class="tiles">${GAMES.filter((g) => g.category === c.id).map(tile).join('')}</div>
    </div>`).join('');
  document.getElementById('parlor').innerHTML = SOLITAIRE.map((col) => `
    <div><h3>${col.title}</h3><ul>${col.games.map(([n, id]) => `<li class="ready"><a href="/solitaire.html?v=${id}">${esc(n)}</a></li>`).join('')}</ul></div>`).join('');
  document.getElementById('greeting').textContent = hasName() ? `Welcome back, ${playerName()}.` : 'Welcome! Set your name under Table settings.';
  renderHeroFan();
}

document.getElementById('filters').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-filter]');
  if (!b) return;
  filter = b.dataset.filter;
  render();
});
document.getElementById('groups').addEventListener('click', (e) => {
  if (e.target.closest('a[aria-disabled="true"]')) e.preventDefault();
});
window.addEventListener('dc:settings', render);
render();
