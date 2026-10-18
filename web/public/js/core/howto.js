// How to play for the card games (the shared table and the Pinochle page), drawn with the shared
// .howto dialog styles in site.css. Each game carries its guide as structured content:
//   howto: { goal, deal, play: [], score, options: { <setting key>: text } | text, controls, tip?, fig? }
//   goal / deal / play / score: a string or a list of strings (inline HTML allowed)
//   options: one explanation per setting key (shown after the setting's label), or a sentence for a game without settings
//   controls: one sentence written with {Click}/{click}/{clicking}; it becomes "Tap"/"tap"/"tapping" for touch screens
//   fig: { cards: 'JD QS', caption } or a list of them: a few small cards; tokens that aren't cards (+, ·) show as text
import { cardHTML } from '../skin.js';

export const SECTIONS = { goal: 'The goal', deal: 'The deal', play: 'How to play', score: 'Scoring & winning', options: 'Options', controls: 'Controls' };
const SEEN = 'dc.games.howto.seen', AUTO = 'dc.games.howto.auto'; // games whose How to play was shown; '0' = don't auto-show

const CARD = /^(10|[2-9AJQK])([SHCD])$/;
const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const prose = (x) => (Array.isArray(x) ? `<ul>${x.map((t) => `<li>${t}</li>`).join('')}</ul>` : `<p>${x}</p>`);
const section = (key, inner) => `<section class="howto-section"><h3>${SECTIONS[key]}</h3>${inner}</section>`;

/** A few small cards with a caption. */
export function figHTML(f) {
  const cards = f.cards.split(' ').map((t) => { const m = CARD.exec(t); return m ? cardHTML({ rank: m[1], suit: m[2] }) : `<span class="howto-op${t === '·' ? ' gap' : ''}" aria-hidden="true">${t}</span>`; }).join('');
  return `<figure class="howto-fig"><div class="howto-cards">${cards}</div>${f.caption ? `<figcaption>${f.caption}</figcaption>` : ''}</figure>`;
}

/** { mouse, touch } control lines from a guide's controls sentence. */
export function controlsOf(h) {
  const say = (word) => h.controls.replace(/\{Click\}/g, word).replace(/\{click\}/g, word.toLowerCase()).replace(/\{clicking\}/g, `${word.toLowerCase()}ping`);
  return { mouse: say('Click'), touch: say('Tap') };
}

/** One line per setting: its label and what it does (settings come from the game module). */
export function optionsHTML(h, settings = []) {
  if (!settings.length) return prose(h.options);
  return `<p>Choose these when you deal a <b>New game</b>:</p><ul>${settings.map((s) => `<li><b>${s.label}</b>: ${h.options[s.key]}</li>`).join('')}</ul>`;
}

/** The sections of one guide. */
export function sectionsHTML(h, settings = []) {
  const c = controlsOf(h);
  return [
    section('goal', prose(h.goal)),
    section('deal', prose(h.deal)),
    section('play', prose(h.play) + list(h.fig).map(figHTML).join('')),
    section('score', prose(h.score)),
    section('options', optionsHTML(h, settings)),
    section('controls', `<dl class="howto-controls"><div><dt>With a mouse</dt><dd>${c.mouse}</dd></div><div><dt>On a touch screen</dt><dd>${c.touch}</dd></div></dl>`),
    h.tip ? `<p class="howto-tip"><b>Tip:</b> ${h.tip}</p>` : '',
  ].join('');
}

/** The body of a table game's How to play dialog. */
export const howtoHTML = (game) => sectionsHTML(game.howto, game.settings);

const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN) || '[]'); } catch { return []; } };
function markSeen(id) { const seen = readSeen(); if (!seen.includes(id)) try { localStorage.setItem(SEEN, JSON.stringify([...seen, id])); } catch { /* ignore */ } }
const autoShow = () => { try { return localStorage.getItem(AUTO) !== '0'; } catch { return true; } };

/**
 * Wires the page's #howto dialog and its How to play button (#btn-howto) for one game, and shows it
 * the first time the player opens that game (unless they turned that off). title/body are functions
 * so the dialog always shows the current game (Pinochle's body depends on the variant). auto: false
 * skips the first-visit showing (when another dialog needs the player first).
 */
export function setupHowto({ id, title, body, auto = true }) {
  const d = document.getElementById('howto');
  const box = d.querySelector('#howto-body');
  function open() {
    d.querySelector('#howto-title').textContent = title();
    box.innerHTML = body();
    d.querySelector('#howto-auto').checked = autoShow();
    markSeen(id);
    if (!d.open) d.showModal();
    box.scrollTop = 0;
  }
  document.getElementById('btn-howto').addEventListener('click', open);
  d.querySelector('#howto-auto').addEventListener('change', (e) => { try { localStorage.setItem(AUTO, e.target.checked ? '1' : '0'); } catch { /* ignore */ } });
  if (auto && autoShow() && !readSeen().includes(id)) open(); // first visit to this game
  return { open, isOpen: () => d.open };
}
