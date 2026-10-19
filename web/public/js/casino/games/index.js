// Every casino game module, loaded on demand (ids match js/casino/catalog.js, file names match ids),
// so the chooser paints before any table's code arrives. A new game needs no change here: add
// games/<id>.js with the catalog's id.
import { ALL_GAMES } from '../catalog.js';

export const GAME_IDS = ALL_GAMES.map((g) => g.id);
const cache = new Map();

/** The game module for `id` (its default export), loaded once. */
export function loadGame(id) {
  if (!GAME_IDS.includes(id)) return Promise.reject(new Error(`No casino game "${id}"`));
  if (!cache.has(id)) cache.set(id, import(`./${id}.js`).then((m) => m.default));
  return cache.get(id);
}

/** Every module, by id: { blackjack: {...}, roulette: {...}, ... }. */
export async function loadAll() {
  const mods = await Promise.all(GAME_IDS.map(loadGame));
  return Object.fromEntries(GAME_IDS.map((id, i) => [id, mods[i]]));
}
