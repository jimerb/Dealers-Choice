// Cards on a casino table: the site's own card faces and backs (js/skin.js, so they follow the
// player's chosen card style and back) laid over a game's SVG layout, positioned in the layout's
// own units, with deal, flip and gather animations. Respects prefers-reduced-motion.
//
//   const layer = cardLayer(stageEl, svgEl, { from: { x: 875, y: 80 }, minWidth: 40 });
//   await layer.deal('p0', card, { x: 470, y: 400, w: 70 });         // slides from the shoe, turns face up
//   await layer.deal('hole', null, { x: 530, y: 95, w: 70 });        // face down (no face yet)
//   await layer.flip('hole', card);                                  // turn it over
//   layer.place('p1', card, { x: 540, y: 400, w: 70, rot: 4 });      // no animation
//   layer.mark('p0', 'win', true);  layer.el('p0')                   // classes, the element itself
//   await layer.gather({ x: 115, y: 80 });                           // everything to the discard tray
//   layer.destroy()
//
// stageEl must contain svgEl (any position); the layer sits exactly over the SVG and follows it when
// it resizes. A card's `w` is in layout units, but it is never drawn narrower than `minWidth` pixels,
// so cards stay readable on a phone (they overlap a little more instead).
import { cardHTML, backHTML, cardName } from '../../skin.js';

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const DEAL_MS = 300;
export const FLIP_MS = 260;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function cardLayer(stage, svg, { from = { x: 875, y: 80 }, minWidth = 40, clickable = false, label = 'Cards on the table' } = {}) {
  const layer = document.createElement('div');
  layer.className = 'cz-cards';
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', label);
  stage.classList.add('cz-cardhost');
  stage.append(layer);
  const cards = new Map(); // id -> { el, card, face }
  let vb = svg.viewBox?.baseVal ?? { x: 0, y: 0, width: 1000, height: 560 };

  // Keep the layer exactly over the SVG; --u is pixels per layout unit.
  const fit = () => {
    vb = svg.viewBox?.baseVal?.width ? svg.viewBox.baseVal : vb;
    const s = svg.getBoundingClientRect(), h = stage.getBoundingClientRect();
    Object.assign(layer.style, { left: `${s.left - h.left + stage.scrollLeft}px`, top: `${s.top - h.top + stage.scrollTop}px`, width: `${s.width}px`, height: `${s.height}px` });
    layer.style.setProperty('--u', String(s.width / (vb.width || 1)));
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  ro?.observe(svg);
  ro?.observe(stage);
  fit();

  const pos = (el, { x, y, w = 70, rot = 0, z }) => {
    el.style.left = `${((x - vb.x) / vb.width) * 100}%`;
    el.style.top = `${((y - vb.y) / vb.height) * 100}%`;
    el.style.setProperty('--w', String(w));
    el.style.setProperty('--rot', `${rot}deg`);
    el.style.setProperty('--minw', `${minWidth}px`);
    if (z != null) el.style.zIndex = String(z);
  };
  const faceHTML = (card) => (card ? cardHTML(card) : '');
  const labelFor = (c) => (c.face && c.card ? cardName(c.card) : 'Face-down card');

  function make(id) {
    const el = document.createElement(clickable ? 'button' : 'div');
    if (clickable) el.type = 'button';
    el.className = 'cz-c';
    el.dataset.card = id;
    el.innerHTML = `<span class="cz-c-in"><span class="cz-c-face"></span><span class="cz-c-back">${backHTML()}</span></span>`;
    layer.append(el);
    return el;
  }
  function paint(id) {
    const c = cards.get(id);
    c.el.querySelector('.cz-c-face').innerHTML = faceHTML(c.card);
    c.el.classList.toggle('down', !c.face);
    if (clickable) c.el.setAttribute('aria-label', labelFor(c)); else { c.el.setAttribute('role', 'img'); c.el.setAttribute('aria-label', labelFor(c)); }
  }

  const self = {
    el: (id) => cards.get(id)?.el ?? null,
    has: (id) => cards.has(id),
    ids: () => [...cards.keys()],
    /** Put a card in place at once. card null = face down with no face yet. */
    place(id, card, at, { face = Boolean(card) } = {}) {
      let c = cards.get(id);
      if (!c) { c = { el: make(id), card: null, face: false }; cards.set(id, c); }
      c.card = card ?? c.card;
      c.face = face && Boolean(c.card);
      c.el.classList.add('still');
      pos(c.el, at);
      paint(id);
      c.el.offsetWidth; // apply without a transition
      c.el.classList.remove('still');
      return c.el;
    },
    /** Slide a card from the shoe (or `from`) to `at`, turning it face up on the way if `face`. */
    async deal(id, card, at, { face = Boolean(card), from: start = from, delay = 0 } = {}) {
      if (delay) await wait(delay);
      if (reducedMotion()) { self.place(id, card, at, { face }); return; }
      self.place(id, card, { ...at, ...start, rot: 0 }, { face: false });
      await nextFrame();
      const c = cards.get(id);
      if (!c) return;
      pos(c.el, at);
      if (face && c.card) { c.face = true; c.el.classList.remove('down'); paint(id); }
      await wait(DEAL_MS);
    },
    /** Turn a card over (giving it its face if it had none). */
    async flip(id, card = null, face = true) {
      const c = cards.get(id);
      if (!c) return;
      if (card) { c.card = card; c.el.querySelector('.cz-c-face').innerHTML = faceHTML(card); }
      c.face = face && Boolean(c.card);
      paint(id);
      if (!reducedMotion()) await wait(FLIP_MS);
    },
    /** Move a card already on the table. */
    async move(id, at) {
      const c = cards.get(id);
      if (!c) return;
      pos(c.el, at);
      if (!reducedMotion()) await wait(DEAL_MS);
    },
    /** Add or remove a class on a card ('win', 'held', 'dim' ...). */
    mark(id, cls, on = true) { cards.get(id)?.el.classList.toggle(cls, on); },
    remove(id) { cards.get(id)?.el.remove(); cards.delete(id); },
    clear() { for (const id of [...cards.keys()]) self.remove(id); },
    /** Sweep every card (face down) to `to`, then clear the table. */
    async gather(to = { x: 115, y: 80 }) {
      if (!cards.size) return;
      if (!reducedMotion()) {
        for (const c of cards.values()) { c.face = false; c.el.classList.add('down'); pos(c.el, { ...to, w: Number(c.el.style.getPropertyValue('--w')) || 70 }); }
        await wait(DEAL_MS);
      }
      self.clear();
    },
    /** Redraw every face (the player changed the card style). */
    repaint() { for (const [id, c] of cards) { c.el.querySelector('.cz-c-back').innerHTML = backHTML(); paint(id); } },
    fit,
    destroy() { ro?.disconnect(); layer.remove(); cards.clear(); },
  };
  return self;
}
