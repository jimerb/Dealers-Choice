// Casino artwork: every picture's path, and the helpers that put a picture over a code-drawn
// stand-in. The stand-in is drawn first and stays visible until the picture loads; if the picture
// fails to load it is removed and the stand-in remains, so every screen works without the art.
//
//   svgArt(href, x, y, w, h, fallbackSVG)  -> SVG: <g class="cz-fb">fallback</g><image data-art ...>
//   imgArt(src, cls)                      -> HTML <img data-art>; on failure it is removed
// watchArt() (once per page) does the hiding and removing for both.

const DIR = 'assets/art/casino';

export const SLOT_SYMBOLS = ['crown', 'ingot', 'bell', 'horseshoe', 'clover', 'cherries'];
export const TIER_IDS = ['brass', 'silver', 'gold', 'emerald', 'sapphire', 'onyx'];
export const TILE_IDS = ['blackjack', 'roulette', 'craps', 'baccarat', 'three-card-poker', 'let-it-ride',
  'caribbean-stud', 'pai-gow-poker', 'video-poker', 'slots', 'keno'];
/** Lettering colour on each tier's card and medallion (the tier's trim colour). */
export const TIER_INK = { brass: '#1B1B1B', silver: '#1D2B4A', gold: '#6B2323', emerald: '#E2C27A', sapphire: '#E2C27A', onyx: '#E8C35A' };

export const ART = {
  tile: (id) => `${DIR}/chooser/tile-${id}.webp`,
  banner: `${DIR}/chooser/casino-banner.webp`,
  medal: (tier) => `${DIR}/bank/medal-${tier}.webp`,
  tierCard: (tier) => `${DIR}/bank/tier-card-${tier}.webp`,
  loanDesk: `${DIR}/bank/loan-desk.webp`,
  hallBoard: `${DIR}/bank/hall-board.webp`,
  hallPlate: `${DIR}/bank/hall-plate.webp`,
  bowl: `${DIR}/roulette/wheel-bowl.webp`,
  rotor: `${DIR}/roulette/wheel-rotor.webp`,
  ball: `${DIR}/roulette/ball.webp`,
  rail: `${DIR}/tables/rail-leather.webp`,
  crest: `${DIR}/tables/table-crest.webp`,
  shoe: `${DIR}/props/shoe.webp`,
  tray: `${DIR}/props/discard-tray.webp`,
  die: (n) => `${DIR}/dice/die-${n}.webp`,
  tumble: (n) => `${DIR}/dice/die-tumble-${n}.webp`,
  puck: (on) => `${DIR}/dice/puck-${on ? 'on' : 'off'}.webp`,
  slotCabinet: `${DIR}/slots/cabinet-crown.webp`,
  symbol: (name) => `${DIR}/slots/crown-${name}.webp`,
  vpCabinet: `${DIR}/video/vp-cabinet.webp`,
  kenoBoard: `${DIR}/keno/keno-board.webp`,
  kenoBlower: `${DIR}/keno/keno-blower.webp`,
  kenoBall: `${DIR}/keno/keno-ball.webp`,
  kenoPaper: `${DIR}/keno/keno-paper.webp`,
};

/** Every picture the casino can ask for (the tests check each one exists). */
export function allArt() {
  const list = [];
  for (const v of Object.values(ART)) if (typeof v === 'string') list.push(v);
  list.push(...TILE_IDS.map(ART.tile), ...TIER_IDS.map(ART.medal), ...TIER_IDS.map(ART.tierCard));
  list.push(...[1, 2, 3, 4, 5, 6].map(ART.die), ART.tumble(1), ART.tumble(2), ART.puck(true), ART.puck(false));
  list.push(...SLOT_SYMBOLS.map(ART.symbol));
  return list;
}

const n = (v) => Math.round(v * 10) / 10;

/** An SVG picture over a code-drawn stand-in (shown until the picture loads, kept if it fails). */
export const svgArt = (href, x, y, w, h, fallback = '', { attrs = '', cls = '' } = {}) =>
  `${fallback ? `<g class="cz-fb">${fallback}</g>` : ''}<image class="cz-art${cls ? ` ${cls}` : ''}" data-art href="${href}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="xMidYMid meet" pointer-events="none" ${attrs}/>`;

/** An HTML picture; the element before it, if it has class cz-fb, is the stand-in. */
export const imgArt = (src, cls = '', alt = '') =>
  `<img class="cz-art${cls ? ` ${cls}` : ''}" data-art src="${src}" alt="${alt}" draggable="false" decoding="async">`;

/** The SVG <pattern> that fills shapes with a tiled picture (rail leather, ticket paper). */
export const tilePattern = (id, href, size) =>
  `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"><image href="${href}" width="${size}" height="${size}"/></pattern>`;

// Whether each picture loads is checked once per URL with an Image() probe (SVG <image> elements
// don't report a load when the picture is already cached, so their own events can't be relied on).
const probes = new Map();
function probe(url) {
  if (!probes.has(url)) {
    probes.set(url, new Promise((done) => {
      const im = new Image();
      im.onload = () => done(true);
      im.onerror = () => done(false);
      im.src = url;
    }));
  }
  return probes.get(url);
}

function settle(el) {
  if (el.dataset.artSettled) return;
  el.dataset.artSettled = '1';
  probe(el.getAttribute('src') ?? el.getAttribute('href')).then((ok) => {
    if (!el.isConnected) return;
    const host = el.parentElement;
    if (ok) {
      host?.classList.add('art-ok');
      const fb = el.previousElementSibling;
      if (fb?.classList.contains('cz-fb')) fb.style.display = 'none';
    } else {
      el.remove();
      host?.classList.remove('art-ok');
      host?.classList.add('art-missing');
    }
  });
}

let watching = false;
/** Hide each stand-in once its picture has loaded; drop a picture that fails, keeping the stand-in. */
export function watchArt(doc = document) {
  if (watching) return;
  watching = true;
  const scan = (node) => {
    if (!(node instanceof Element)) return;
    if (node.hasAttribute('data-art')) settle(node);
    node.querySelectorAll('[data-art]').forEach(settle);
  };
  new MutationObserver((records) => { for (const r of records) r.addedNodes.forEach(scan); })
    .observe(doc.documentElement, { childList: true, subtree: true });
  scan(doc.documentElement);
}
