// Card skins. Every card, card back and table surface in the site is drawn through here,
// so our own art drops in by adding a skin (or replacing files under assets/skins/<name>/).
//
// A skin is either:
//   type 'image': cards at   assets/skins/<name>/cards/<RANK><SUIT>.png   (e.g. 10H.png, QS.png)
//                 backs at   assets/skins/<name>/backs/<back>.png
//                 tables at  assets/skins/<name>/tables/<table>.png
//   type 'drawn': cards rendered with HTML/CSS (no image files needed).

export const SKINS = {
  parlor: {
    label: 'Parlor',
    type: 'image',
    base: '/assets/skins/parlor',
    backs: ['parlor-green', 'parlor-oxblood', 'parlor-midnight', 'deco-fan', 'botanical', 'starfield'],
    tables: ['felt-green', 'felt-oxblood', 'felt-midnight', 'walnut', 'linen', 'slate'],
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
export function currentBack() {
  const skin = SKINS[currentSkin()];
  const b = readPref(`dc.back.${currentSkin()}`, skin.backs[0]);
  return skin.backs.includes(b) ? b : skin.backs[0];
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
  if (!isStandard(card)) return specialHTML(card, extra);
  if (skin.type === 'image') {
    return `<span class="card face ${extra}" data-skin="${name}"><img src="${skin.base}/cards/${card.rank}${card.suit}.png" alt="${cardName(card)}" draggable="false"></span>`;
  }
  return `<span class="card face drawn ${red ? 'red' : 'black'} ${extra}" role="img" aria-label="${cardName(card)}">
    <span class="idx">${card.rank}<br>${SYMBOL[card.suit]}</span>
    <span class="pip">${SYMBOL[card.suit]}</span>
    <span class="idx flip">${card.rank}<br>${SYMBOL[card.suit]}</span></span>`;
}

/** Cards outside the standard 52 (jokers, Tarot trumps/knights, the Excuse) are always drawn. */
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
    return `<span class="card back ${extra}"><img src="${skin.base}/backs/${back}.png" alt="" draggable="false"></span>`;
  }
  return `<span class="card back drawn back-${back} ${extra}" aria-hidden="true"></span>`;
}

/** CSS background for the play surface. */
export function tableBackground() {
  const skin = SKINS[currentSkin()];
  if (skin.type === 'image') return `url("${skin.base}/tables/${skin.tables[0]}.png") center / cover`;
  return '';
}
