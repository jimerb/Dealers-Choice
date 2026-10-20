// The card games page: every card game, grouped by kind, with a filter.
import { CATEGORIES, GAMES, PINOCHLE_VARIANTS } from './catalog.js';
import { mountChrome } from './header.js';
import { gameTile, variantChips } from './tiles.js';

mountChrome('games');

const FILTERS = [['all', 'All games'], ...CATEGORIES.map((c) => [c.id, c.title])];
const ids = new Set(FILTERS.map(([id]) => id));
// games.html#trick opens on that kind of game; any other hash (a game's id) scrolls to its tile.
let filter = ids.has(location.hash.slice(1)) ? location.hash.slice(1) : 'all';

const variantCount = GAMES.reduce((n, g) => n + (g.variants?.length ?? 0), 0);
const withVariants = GAMES.filter((g) => g.variants?.length).map((g) => g.name);
document.getElementById('games-intro').textContent =
  `${GAMES.length} card games to sit down at: bid and take tricks, meld and peg, play a hand of draw poker, or deal a quick family game. Pick a table and a cast of characters fills the other seats.`;
document.getElementById('games-note').textContent =
  `${withVariants.slice(0, -1).join(', ')} and ${withVariants.at(-1)} come in ${variantCount} variants between them: choose one when you sit down.`;
document.getElementById('pinochle-variants').innerHTML = variantChips(PINOCHLE_VARIANTS);

function render() {
  document.getElementById('filters').innerHTML = FILTERS.map(([id, label]) =>
    `<button type="button" data-filter="${id}" aria-pressed="${id === filter}">${label}</button>`).join('');
  document.getElementById('groups').innerHTML = CATEGORIES.filter((c) => filter === 'all' || c.id === filter).map((c) => `
    <div class="group">
      <div class="group-head"><h3>${c.title}</h3><span>${c.blurb}</span></div>
      <div class="tiles">${GAMES.filter((g) => g.category === c.id).map(gameTile).join('')}</div>
    </div>`).join('');
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
render();
// The tiles are drawn after the browser looked for the hash's target: look again now.
const target = location.hash.length > 1 && !ids.has(location.hash.slice(1)) && document.getElementById(location.hash.slice(1));
if (target) target.scrollIntoView({ block: 'center' });
