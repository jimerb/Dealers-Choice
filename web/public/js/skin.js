// Card skins. Every card, card back and table surface in the site is drawn through here,
// so our own art drops in by adding a skin (or replacing files under assets/skins/<name>/).
//
// A skin is either:
//   type 'image': cards at   assets/skins/<name>/cards/<RANK><SUIT>.webp   (e.g. 10H.webp, QS.webp)
//                 backs at   assets/skins/<name>/backs/<back>.webp
//                 tables at  assets/skins/<name>/tables/<table>.webp
//                 specials: true  -> jokers, Tarot trumps/knights and the Excuse are images too
//                                    (cards/JK1.webp, JK2.webp, T1..T21.webp, EX.webp, CS.webp ...)
//                 tile: true      -> tables are seamless tiles, repeated instead of stretched
//                 lightTables     -> pale surfaces (Linen): the felt gets data-tone="light" for dark ink
//   type 'drawn': cards rendered with HTML/CSS (no image files needed).

export const SKINS = {
  parlor: {
    label: 'Parlor',
    type: 'image',
    base: 'assets/skins/parlor',
    backs: ['parlor-green', 'parlor-oxblood', 'parlor-midnight', 'deco-fan', 'botanical', 'starfield'],
    tables: ['felt-green', 'felt-oxblood', 'felt-midnight', 'walnut', 'linen', 'slate'],
    specials: true,
    tile: true,
    lightTables: ['linen'],
  },
  house: {
    label: 'Dealers Choice (drawn)',
    type: 'drawn',
    backs: ['brass', 'oxblood', 'midnight'],
    tables: ['felt'],
  },
};

const SYMBOL = { S: '♠', H: '♥', C: '♣', D: '♦', T: '✦', X: '★' };
const SUIT_WORD = { S: 'spades', H: 'hearts', C: 'clubs', D: 'diamonds' };
const RANK_WORD = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack', C: 'Knight' };
const STANDARD = new Set(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const isStandard = (c) => STANDARD.has(c.rank) && 'SHCD'.includes(c.suit);

function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
export function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: ignore */ }
}

export function currentSkin() {
  const name = readPref('dc.skin', 'parlor');
  return SKINS[name] ? name : 'parlor';
}
export function currentBack(name = currentSkin()) {
  const skin = SKINS[name];
  const b = readPref(`dc.back.${name}`, skin.backs[0]);
  return skin.backs.includes(b) ? b : skin.backs[0];
}
export function currentTable(name = currentSkin()) {
  const skin = SKINS[name];
  const t = readPref(`dc.table.${name}`, skin.tables[0]);
  return skin.tables.includes(t) ? t : skin.tables[0];
}

const backURL = (skin, back) => `${skin.base}/backs/${back}.webp`;
const tableURL = (skin, table) => `${skin.base}/tables/${table}.webp`;

// Images already asked for, kept referenced so the fetch isn't dropped.
const warmed = new Map();
function warm(url) {
  if (warmed.has(url)) return;
  const img = new Image();
  img.src = url;
  img.decode?.().catch(() => { /* a failed preload just loads later */ });
  warmed.set(url, img);
}

/** Fetch a skin's card back and table ahead of use (defaults: the saved choices). Faces load as dealt. */
export function preloadSkin(name = currentSkin(), back = currentBack(name), table = currentTable(name)) {
  const skin = SKINS[name];
  if (skin?.type !== 'image' || typeof Image === 'undefined') return;
  warm(backURL(skin, back));
  warm(tableURL(skin, table));
}

export const cardName = (c) => {
  if (c.rank === 'JK') return 'Joker';
  if (c.rank === 'EX') return 'the Excuse';
  if (c.suit === 'T') return `trump ${c.rank}`;
  return `${RANK_WORD[c.rank] ?? c.rank} of ${SUIT_WORD[c.suit]}`;
};

/** HTML for a face-up card. `extra` = additional class names. */
export function cardHTML(card, extra = '') {
  const name = currentSkin();
  const skin = SKINS[name];
  const red = card.suit === 'H' || card.suit === 'D';
  const standard = isStandard(card);
  if (!standard && !(skin.type === 'image' && skin.specials)) return specialHTML(card, extra);
  if (skin.type === 'image') {
    const file = standard ? `${card.rank}${card.suit}` : specialFile(card);
    return `<span class="card face img ${extra}" data-skin="${name}"><img src="${skin.base}/cards/${file}.webp" alt="${cardName(card)}" draggable="false"></span>`;
  }
  return `<span class="card face drawn ${red ? 'red' : 'black'} ${extra}" role="img" aria-label="${cardName(card)}">
    <span class="idx">${card.rank}<br>${SYMBOL[card.suit]}</span>
    <span class="pip">${SYMBOL[card.suit]}</span>
    <span class="idx flip">${card.rank}<br>${SYMBOL[card.suit]}</span></span>`;
}

/** Image file for a card outside the standard 52. Jokers alternate JK1/JK2 by their id number. */
function specialFile(card) {
  if (card.rank === 'JK') return Number(String(card.id).split('.')[1] ?? 0) % 2 ? 'JK2' : 'JK1';
  if (card.rank === 'EX') return 'EX';
  if (card.suit === 'T') return `T${card.rank}`;
  return `${card.rank}${card.suit}`; // knights: CS, CH, CD, CC
}

/** Drawn versions of the cards outside the standard 52, for skins without `specials`. */
function specialHTML(card, extra) {
  if (card.rank === 'JK') return `<span class="card face drawn special joker ${extra}" role="img" aria-label="Joker"><span class="idx">J<br>★</span><span class="pip">★</span><span class="word">JOKER</span></span>`;
  if (card.rank === 'EX') return `<span class="card face drawn special trump ${extra}" role="img" aria-label="the Excuse"><span class="idx">★</span><span class="pip">★</span><span class="word">EXCUSE</span></span>`;
  if (card.suit === 'T') return `<span class="card face drawn special trump ${extra}" role="img" aria-label="trump ${card.rank}"><span class="idx">${card.rank}</span><span class="pip">${card.rank}</span><span class="word">TRUMP</span></span>`;
  const red = card.suit === 'H' || card.suit === 'D';
  return `<span class="card face drawn ${red ? 'red' : 'black'} ${extra}" role="img" aria-label="${cardName(card)}">
    <span class="idx">${card.rank}<br>${SYMBOL[card.suit]}</span><span class="pip">${SYMBOL[card.suit]}</span><span class="idx flip">${card.rank}<br>${SYMBOL[card.suit]}</span></span>`;
}

export function backHTML(extra = '') {
  const name = currentSkin();
  const skin = SKINS[name];
  const back = currentBack();
  if (skin.type === 'image') {
    return `<span class="card back img ${extra}"><img src="${backURL(skin, back)}" alt=""" draggable="false"></span>`;
  }
  return `<span class="card back drawn back-${back} ${extra}" aria-hidden="true"></span>`;
}

/** CSS background for the play surface ('' = the stylesheet's own felt). */
export function tableBackground() {
  const skin = SKINS[currentSkin()];
  if (skin.type !== 'image') return '';
  const url = `url("${tableURL(skin, currentTable())}")`;
  // 1024px tiles drawn at 512 CSS px stay sharp on high-DPI screens.
  return skin.tile ? `${url} 0 0 / 512px repeat` : `${url} center / cover`;
}

/** 'light' for pale table surfaces, where felt text and outlines need dark ink; otherwise 'dark'. */
export function tableTone() {
  return SKINS[currentSkin()].lightTables?.includes(currentTable()) ? 'light' : 'dark';
}

/** Paint a felt element with the chosen table, under a light shade so cards stand out. */
export function paintFelt(el) {
  const bg = tableBackground();
  el.style.background = bg ? `linear-gradient(rgba(10,40,30,.25), rgba(10,40,30,.25)), ${bg}` : '';
  el.dataset.tone = tableTone();
}
