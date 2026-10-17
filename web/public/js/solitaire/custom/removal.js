// Removal solitaires: pick exposed cards that form a valid set and take them away.
// Baroness (pairs to 13), Nestor (pairs of a rank), Triplets (three in sequence), Pyramid (pairs to 13).
import { rk, up, freshDeck, clone, bump, cardBtn, emptySlot, backHTML, cardHTML } from './util.js';

// ------------------------------------------------------------------ shared column games
function colsRender(s, { reserve = false } = {}) {
  const isSel = (key) => s.sel.includes(key);
  const cols = s.cols.map((col, ci) => {
    const n = col.length;
    return `<div class="sol-col" style="height:${Math.max(110, (n - 1) * 22 + 100)}px">${col.length ? '' : '<span class="sol-empty"></span>'}${col.map((c, i) =>
      `<div class="sol-card" style="top:${i * 22}px">${i === n - 1 ? cardBtn(c, { c: 'pick', k: `c${ci}` }, { selected: isSel(`c${ci}`) }) : cardHTML(c)}</div>`).join('')}</div>`;
  }).join('');
  const res = reserve ? `<div class="sol-top">${s.reserve.map((c, i) => (c ? cardBtn(c, { c: 'pick', k: `r${i}` }, { selected: isSel(`r${i}`) }) : emptySlot())).join('')}</div>` : '';
  return `${res}<div class="sol-tableau" style="--cols:${s.cols.length}">${cols}</div>`;
}
const cardAt = (s, key) => (key[0] === 'c' ? s.cols[Number(key.slice(1))].at(-1) : s.reserve[Number(key.slice(1))]);
function removeKey(s, key) {
  if (key[0] === 'c') s.found.push(s.cols[Number(key.slice(1))].pop());
  else { s.found.push(s.reserve[Number(key.slice(1))]); s.reserve[Number(key.slice(1))] = null; }
}
const colTargets = (s) => [...s.cols.map((c, i) => (c.length ? { c: 'pick', k: `c${i}` } : null)), ...(s.reserve ?? []).map((c, i) => (c ? { c: 'pick', k: `r${i}` } : null))].filter(Boolean);

/** Toggle a selection; when `complete(cards)` says the selection is a valid set, remove it. */
function pickWith(s, key, { complete, max }) {
  const card = cardAt(s, key);
  if (!card) return null;
  s = clone(s);
  if (s.sel.includes(key)) { s.sel = s.sel.filter((k) => k !== key); return s; }
  s.sel = [...s.sel, key];
  const cards = s.sel.map((k) => cardAt(s, k));
  const verdict = complete(cards);
  if (verdict === 'remove') { for (const k of s.sel) removeKey(s, k); s.sel = []; bump(s); s.fx = 'match'; return s; }
  if (s.sel.length >= max || verdict === 'bad') { s.sel = [key]; if (complete([card]) === 'remove') { removeKey(s, key); s.sel = []; bump(s); s.fx = 'match'; } }
  return s;
}

const baroness = {
  id: 'baroness', name: 'Baroness', group: 'One deck', blurb: 'Remove pairs that add up to 13; kings go alone.',
  how: `<p><b>Goal:</b> remove every card.</p><p>Click two exposed cards (the top card of each of the five columns) that <b>add up to 13</b> to remove them: A+Q, 2+J, 3+10, 4+9, 5+8, 6+7. A king (13) is removed by itself. Cards never move between columns.</p>
    <p>When you're stuck, click the stock to deal a new row of five cards, one on each column. The last two cards are dealt onto the first two columns.</p>`,
  newGame(seed) { const d = freshDeck(seed); return { variant: 'baroness', moves: 0, cols: [0, 1, 2, 3, 4].map((i) => up([d[i]])), stock: d.slice(5), found: [], sel: [] }; },
  render(s) {
    return `<div class="sol-board"><div class="sol-top"><div class="sol-pile">${s.stock.length ? `<button class="sol-flat" data-c="stock" aria-label="Deal">${backHTML()}</button>` : emptySlot('Empty')}<span class="sol-label">${s.stock.length}</span></div>
      <div class="sol-pile">${emptySlot(String(s.found.length))}<span class="sol-label">Removed</span></div></div>${colsRender(s)}</div>`;
  },
  click(s, d) {
    if (d.c === 'stock') {
      if (!s.stock.length) return null;
      s = clone(s); bump(s); s.sel = [];
      const n = Math.min(5, s.stock.length);
      for (let i = 0; i < n; i++) s.cols[i].push({ ...s.stock.shift(), up: true });
      s.fx = 'deal'; return s;
    }
    return pickWith(s, d.k, { max: 2, complete: (cs) => (cs.length === 1 && rk(cs[0]) === 13 ? 'remove' : cs.length === 2 && rk(cs[0]) + rk(cs[1]) === 13 ? 'remove' : cs.length === 2 ? 'bad' : 'wait') });
  },
  isWon: (s) => s.found.length === 52,
  isOver: (s) => s.found.length === 52,
  status: (s) => `Removed ${s.found.length} of 52`,
  count: (s) => s.found.length + s.stock.length + s.cols.flat().length,
  targets: (s) => [...colTargets(s), ...(s.stock.length ? [{ c: 'stock' }] : [])],
};

const nestor = {
  id: 'nestor', name: 'Nestor', group: 'One deck', blurb: 'Pair up cards of the same rank from the columns and the reserve.',
  how: `<p><b>Goal:</b> remove every card in pairs.</p><p>Six columns of seven cards plus ten single reserve cards. Click two available cards <b>of the same rank</b> (two 5s, two jacks…) to remove them. Available cards are the top card of each column and every reserve card. There's no stock.</p>`,
  newGame(seed) { const d = freshDeck(seed); return { variant: 'nestor', moves: 0, cols: [0, 1, 2, 3, 4, 5].map((i) => up(d.slice(i * 7, i * 7 + 7))), reserve: up(d.slice(42)), found: [], sel: [] }; },
  render(s) { return `<div class="sol-board">${colsRender(s, { reserve: true })}</div>`; },
  click(s, d) { return pickWith(s, d.k, { max: 2, complete: (cs) => (cs.length === 2 ? (cs[0].rank === cs[1].rank ? 'remove' : 'bad') : 'wait') }); },
  isWon: (s) => s.found.length === 52,
  isOver: (s) => s.found.length === 52,
  status: (s) => `Removed ${s.found.length} of 52`,
  count: (s) => s.found.length + s.cols.flat().length + s.reserve.filter(Boolean).length,
  targets: colTargets,
};

/** Three ranks in sequence, wrapping around (Q-K-A and K-A-2 count). */
export function isTriplet(cs) {
  const v = cs.map(rk);
  for (let shift = 0; shift < 13; shift++) {
    const w = v.map((x) => (x - 1 + shift) % 13).sort((a, b) => a - b);
    if (w[1] === w[0] + 1 && w[2] === w[1] + 1) return true;
  }
  return false;
}
const triplets = {
  id: 'triplets', name: 'Triplets', group: 'One deck', blurb: 'Remove three cards in sequence at a time; end with one card left.',
  how: `<p><b>Goal:</b> remove every card but one.</p><p>Sixteen rows of three and two rows of two, all face up. Click the top cards of three rows that form a <b>run of three ranks</b>, regardless of suit (7-8-9, Q-K-A and K-A-2 all count) to remove them. Cards never move between rows. If the last card left is a king, your score triples.</p>`,
  newGame(seed) { const d = freshDeck(seed); const counts = [...Array(16).fill(3), 2, 2]; let k = 0; return { variant: 'triplets', moves: 0, cols: counts.map((n) => { const c = up(d.slice(k, k + n)); k += n; return c; }), found: [], sel: [] }; },
  render(s) { return `<div class="sol-board wide">${colsRender(s)}</div>`; },
  click(s, d) { return pickWith(s, d.k, { max: 3, complete: (cs) => (cs.length === 3 ? (isTriplet(cs) ? 'remove' : 'bad') : 'wait') }); },
  isWon: (s) => s.found.length === 51,
  isOver: (s) => s.found.length >= 51,
  status: (s) => { const left = s.cols.flat(); return `Removed ${s.found.length} of 51${left.length === 1 && left[0].rank === 'K' ? ' · last card a king: score ×3' : ''}`; },
  count: (s) => s.found.length + s.cols.flat().length,
  targets: colTargets,
};

// ------------------------------------------------------------------ Pyramid
const ROW_START = [0, 1, 3, 6, 10, 15, 21];
const pyrIndex = (row, col) => ROW_START[row] + col;
function pyrRowCol(i) { let r = 0; while (r < 6 && ROW_START[r + 1] <= i) r++; return [r, i - ROW_START[r]]; }
export function pyrExposed(s, i) {
  const [row, col] = pyrRowCol(i);
  if (s.pyr[i].gone) return false;
  return row === 6 || (s.pyr[pyrIndex(row + 1, col)].gone && s.pyr[pyrIndex(row + 1, col + 1)].gone);
}
const pyramid = {
  id: 'pyramid', name: 'Pyramid', group: 'One deck', blurb: 'Remove exposed pairs that total 13 (kings go alone). J=11, Q=12, K=13.',
  how: `<p><b>Goal:</b> clear the 28-card pyramid.</p><p>A card is <b>exposed</b> when no cards overlap it. Click two exposed cards that add up to 13 (A=1, J=11, Q=12) to remove them: A+Q, 2+J, 3+10, 4+9, 5+8, 6+7. Kings are removed alone.</p>
    <p>Click the stock to turn a card onto the waste; the top waste card can be paired with a pyramid card. One pass through the stock.</p>`,
  newGame(seed) { const d = freshDeck(seed); return { variant: 'pyramid', moves: 0, pyr: d.slice(0, 28).map((c) => ({ ...c, up: true, gone: false })), stock: up(d.slice(28)), waste: [], found: 0, sel: null }; },
  render(s) {
    const rows = [];
    for (let r = 0; r < 7; r++) {
      const cells = [];
      for (let c = 0; c <= r; c++) {
        const i = pyrIndex(r, c), card = s.pyr[i], ex = pyrExposed(s, i);
        cells.push(card.gone ? '<span class="pyr-gap"></span>' : cardBtn(card, { c: 'pyr', i }, { selected: s.sel === `p${i}`, disabled: !ex }));
      }
      rows.push(`<div class="pyr-row">${cells.join('')}</div>`);
    }
    const w = s.waste.at(-1);
    return `<div class="sol-board"><div class="pyr">${rows.join('')}</div><div class="sol-top" style="justify-content:center;margin-top:16px">
      <div class="sol-pile">${s.stock.length ? `<button class="sol-flat" data-c="stock" aria-label="Stock">${backHTML()}</button>` : emptySlot('Empty')}<span class="sol-label">${s.stock.length}</span></div>
      <div class="sol-pile">${w ? cardBtn(w, { c: 'waste' }, { selected: s.sel === 'w' }) : emptySlot('Waste')}</div>
      <div class="sol-pile">${emptySlot(String(s.found))}<span class="sol-label">Removed</span></div></div></div>`;
  },
  click(s, d) {
    if (d.c === 'stock') { if (!s.stock.length) return null; s = clone(s); bump(s); s.waste.push(s.stock.pop()); s.sel = null; s.fx = 'flip'; return s; }
    const key = d.c === 'waste' ? 'w' : `p${d.i}`;
    const card = key === 'w' ? s.waste.at(-1) : s.pyr[Number(d.i)];
    if (!card || (key !== 'w' && !pyrExposed(s, Number(d.i)))) return null;
    s = clone(s);
    const del = (k) => { if (k === 'w') s.waste.pop(); else s.pyr[Number(k.slice(1))].gone = true; s.found++; };
    if (rk(card) === 13) { del(key); s.sel = null; bump(s); s.fx = 'match'; return s; }
    if (!s.sel || s.sel === key) { s.sel = s.sel === key ? null : key; return s; }
    const other = s.sel === 'w' ? s.waste.at(-1) : s.pyr[Number(s.sel.slice(1))];
    if (rk(other) + rk(card) === 13) { const a = s.sel; del(a); del(key); s.sel = null; bump(s); s.fx = 'match'; return s; }
    s.sel = key; return s;
  },
  isWon: (s) => s.pyr.every((c) => c.gone),
  isOver: (s) => s.pyr.every((c) => c.gone),
  status: (s) => `Pyramid cards left: ${s.pyr.filter((c) => !c.gone).length}`,
  count: (s) => s.pyr.filter((c) => !c.gone).length + s.stock.length + s.waste.length + s.found,
  targets: (s) => [...s.pyr.map((c, i) => (pyrExposed(s, i) ? { c: 'pyr', i: String(i) } : null)).filter(Boolean), ...(s.waste.length ? [{ c: 'waste' }] : []), ...(s.stock.length ? [{ c: 'stock' }] : [])],
};

export default [baroness, nestor, triplets, pyramid];
