// Card-game tiles, shared by the lobby (a few featured games) and the card games page (all of them).
import { esc } from './header.js';

/** One game's tile: its art, a badge (variants / play now / in the works), name, players and tagline. */
export function gameTile(game) {
  const ready = game.status === 'ready';
  const href = ready ? game.href : `#${game.id}`;
  return `<a class="tile${ready ? ' ready' : ''}" href="${href}" id="${game.id}" ${ready ? '' : 'aria-disabled="true"'}>
    <div class="tile-art" style="background:${game.felt}">
      <img src="assets/art/lobby/tile-${game.id}.webp" width="1200" height="750" alt="" loading="lazy" decoding="async">
      <span class="tile-badge">${!ready ? 'In the works' : game.variants?.length ? `${game.variants.length} Variants` : 'Play now'}</span>
    </div>
    <div class="tile-body"><b>${esc(game.name)}</b><span>${esc(game.players)}</span><span>${esc(game.tagline)}</span></div>
  </a>`;
}

/** Pinochle's variants as chips, each opening its own table. */
export const variantChips = (variants) => variants.map((v) => `<li><a href="${v.href}">${esc(v.name)}</a></li>`).join('');
