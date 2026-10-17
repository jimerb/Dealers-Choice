// Helpers shared by the custom (non-build) solitaires.
//
// Custom game contract (default export of each module entry):
//   id, name, group, blurb, how (HTML)
//   newGame(seed) -> state (JSON-serializable; must include variant: id, moves)
//   render(state) -> HTML; clickable elements carry data-c="<kind>" plus data-* payload
//   click(state, data) -> new state | { error } | null  (data = element dataset)
//   isWon(state), isOver(state), status(state) -> short text
//   count(state) -> cards in play (tests), targets(state) -> list of datasets a player could click (tests)
//   timed?: true, tick(state) -> state (called once per second while playing)
import { deck, shuffle, makeRng, lo } from '../../core/cards.js';
import { cardHTML, backHTML, cardName } from '../../skin.js';

export const rk = lo;
export const up = (cs) => cs.map((c) => ({ ...c, up: true }));
export const freshDeck = (seed, opts) => shuffle(deck(opts), makeRng(seed));
export const rngFor = (seed) => makeRng(seed);
export const clone = (s) => structuredClone(s);
export const bump = (s) => { s.moves = (s.moves ?? 0) + 1; return s; };

/** A clickable card. attrs: object of data-* values (kind under "c"). */
export function cardBtn(card, attrs, { selected = false, disabled = false, faceDown = false } = {}) {
  const data = Object.entries(attrs).map(([k, v]) => `data-${k}="${v}"`).join(' ');
  return `<button class="sol-flat${selected ? ' sel' : ''}${disabled ? ' covered' : ''}" ${data} ${disabled ? 'disabled' : ''} aria-label="${faceDown ? 'face-down card' : cardName(card)}">${faceDown ? backHTML() : cardHTML(card)}</button>`;
}
export const slot = (attrs, label = '') => `<button class="empty-slot slot-btn" ${Object.entries(attrs).map(([k, v]) => `data-${k}="${v}"`).join(' ')}>${label}</button>`;
export const emptySlot = (label = '') => `<span class="empty-slot">${label}</span>`;
export { cardHTML, backHTML };
