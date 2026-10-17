// How to play: every solitaire's guide uses the same sections, styled by the shared .howto rules in site.css.
// Each layout carries its text as `how: { goal, deal, play: [], score?, tip?, fig?, controls? }`.
//   play / score: strings or lists of strings (inline HTML allowed)
//   fig: { cards: '7S 6H 5C', caption, fan? } or a list of them; tokens that aren't cards (+, ·) show as text
//   controls: one sentence written with {Click}/{click}; it becomes "Tap"/"tap" for touch screens.
//             Rules-driven layouts leave it out and get the standard click-then-destination controls.
import { cardHTML } from '../skin.js';

export const SECTIONS = { goal: 'Goal', deal: 'The deal', play: 'How to play', score: 'Scoring & winning', controls: 'Controls' };

const CARD = /^(10|[2-9AJQK])([SHCD])$/;
const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const prose = (x) => (Array.isArray(x) ? `<ul>${x.map((t) => `<li>${t}</li>`).join('')}</ul>` : `<p>${x}</p>`);

function figHTML(f) {
  const cards = f.cards.split(' ').map((t) => { const m = CARD.exec(t); return m ? cardHTML({ rank: m[1], suit: m[2] }) : `<span class="howto-op" aria-hidden="true">${t}</span>`; }).join('');
  return `<figure class="howto-fig"><div class="howto-cards${f.fan ? ' fan' : ''}">${cards}</div>${f.caption ? `<figcaption>${f.caption}</figcaption>` : ''}</figure>`;
}

/** Standard controls for the rules-driven layouts (click a card, then where it goes). */
function buildControls(v) {
  const r = v.rules;
  const runs = r.move === 'seq' || r.move === 'any';
  const home = r.noFoundationDrops ? 'the best column for it' : 'its best spot, usually a foundation';
  const stock = r.stock === 'reshuffle' ? ' {Click} Reshuffle when you are stuck.' : r.stock ? ' {Click} the stock to deal.' : '';
  return {
    mouse: `Click a card${runs ? ' (or a card partway down a column to take the cards on top of it too)' : ''}, then click where it should go. Double-click a card to send it to ${home}.${stock}`.replace(/\{Click\}/g, 'Click'),
    touch: `Tap a card, then tap where it should go. Tap the selected card again to send it to ${home}; tap the felt to let go of it.${stock}`.replace(/\{Click\}/g, 'Tap'),
  };
}

/** { mouse, touch } control lines for a layout (custom layouts write theirs with {Click}). */
export function controlsFor(v) {
  if (typeof v.how === 'string') return { mouse: 'Click a card, then where it should go.', touch: 'Tap a card, then where it should go.' }; // LEGACY: until every layout is converted
  if (!v.how.controls) return buildControls(v);
  const say = (word) => v.how.controls.replace(/\{Click\}/g, word).replace(/\{click\}/g, word.toLowerCase());
  return { mouse: say('Click'), touch: say('Tap') };
}

/** The body of a layout's How to play dialog. */
export function howtoHTML(v) {
  const h = v.how;
  if (typeof h === 'string') return h; // LEGACY
  const c = controlsFor(v);
  const sec = (key, inner) => `<section class="howto-section"><h3>${SECTIONS[key]}</h3>${inner}</section>`;
  return [
    sec('goal', prose(h.goal)),
    sec('deal', prose(h.deal)),
    sec('play', prose(list(h.play)) + list(h.fig).map(figHTML).join('')),
    h.score ? sec('score', prose(h.score)) : '',
    sec('controls', `<dl class="howto-controls"><div><dt>With a mouse</dt><dd>${c.mouse}</dd></div><div><dt>On a touch screen</dt><dd>${c.touch}</dd></div></dl>`),
    h.tip ? `<p class="howto-tip"><b>Tip:</b> ${h.tip}</p>` : '',
  ].join('');
}
