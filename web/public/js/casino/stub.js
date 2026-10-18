// A table that is laid out but not dealt yet: draws the game's layout and lists what still needs
// wiring. Each games/<id>.js that isn't playable yet is stubGame({ ... }); swap it for a real
// module (see the interface at the top of ui.js) when the game is built.
import { esc } from './svg.js';

export function stubGame({ id, name, layout, stage = layout, todo, howto, options = [] }) {
  let root = null;
  return {
    id, name, todo, howto, options, layout, stage, ready: false,
    mount(el, ctx) {
      root = el;
      el.innerHTML = `<div class="cz-stage">${stage()}</div>
        <details class="cz-todo"><summary>This table is still being built</summary>
        <ul>${todo.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
      ctx.setTotal(0);
      ctx.setButtons({ action: false, clear: false, rebet: false });
      ctx.message(`${name} is set up but not dealing yet. Roulette is open now.`);
    },
    unmount() { if (root) root.innerHTML = ''; root = null; },
    action() {}, clear() {}, rebet() {},
  };
}

/** A short How to play body from a few [heading, html] sections. */
export const howtoSections = (sections) => sections.map(([h, body]) =>
  `<section class="howto-section"><h3>${esc(h)}</h3>${body.startsWith('<') ? body : `<p>${body}</p>`}</section>`).join('');
