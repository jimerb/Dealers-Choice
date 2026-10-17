// Grid solitaires: Poker Square, Cribbage Square, Gaps (Montana) and Slide.
import { rk, up, freshDeck, rngFor, clone, bump, cardBtn, emptySlot, cardHTML } from './util.js';
import { shuffle } from '../../core/cards.js';
import { scoreHand } from '../../games/cribbage.js';

// ------------------------------------------------------------------ Poker Square (American scoring)
const HAND_PTS = [0, 2, 5, 10, 15, 20, 25, 50, 75, 100];
export function pokerHand(cards) {
  if (cards.some((c) => !c)) return { name: '', pts: 0 };
  const v = cards.map((c) => (c.rank === 'A' ? 14 : rk(c))).sort((a, b) => b - a);
  const counts = Object.values(v.reduce((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {})).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const straight = new Set(v).size === 5 && (v[0] - v[4] === 4 || (v[0] === 14 && v[1] === 5));
  let k = 0, name = 'Nothing';
  if (straight && flush && v[0] === 14 && v[4] === 10) { k = 9; name = 'Royal flush'; }
  else if (straight && flush) { k = 8; name = 'Straight flush'; }
  else if (counts[0] === 4) { k = 7; name = 'Four of a kind'; }
  else if (counts[0] === 3 && counts[1] === 2) { k = 6; name = 'Full house'; }
  else if (flush) { k = 5; name = 'Flush'; }
  else if (straight) { k = 4; name = 'Straight'; }
  else if (counts[0] === 3) { k = 3; name = 'Three of a kind'; }
  else if (counts[0] === 2 && counts[1] === 2) { k = 2; name = 'Two pair'; }
  else if (counts[0] === 2) { k = 1; name = 'One pair'; }
  return { name, pts: HAND_PTS[k] };
}
function lines(grid, size, scorer) {
  const out = [];
  for (let r = 0; r < size; r++) out.push({ kind: 'row', i: r, ...scorer(grid.slice(r * size, r * size + size)) });
  for (let c = 0; c < size; c++) out.push({ kind: 'col', i: c, ...scorer(Array.from({ length: size }, (_, r) => grid[r * size + c])) });
  return out;
}
function gridHTML(s, size, ls, extraRight = '') {
  let html = `<div class="poker-grid" style="grid-template-columns:repeat(${size}, var(--card-w)) 120px">`;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const k = r * size + c, card = s.grid[k];
      html += card ? `<span class="pg-cell">${cardHTML(card)}</span>` : `<button class="pg-cell pg-empty" data-c="cell" data-i="${k}" aria-label="Row ${r + 1}, column ${c + 1}"></button>`;
    }
    const l = ls.find((x) => x.kind === 'row' && x.i === r);
    html += `<span class="pg-score">${l.name ? `${l.name}<b>${l.pts}</b>` : ''}</span>`;
  }
  for (let c = 0; c < size; c++) { const l = ls.find((x) => x.kind === 'col' && x.i === c); html += `<span class="pg-score col">${l.name ? `${l.name}<b>${l.pts}</b>` : ''}</span>`; }
  html += `<span class="pg-score total"><b>${ls.reduce((t, l) => t + l.pts, 0)}</b></span></div>`;
  return html + extraRight;
}

const pokersquare = {
  id: 'pokersquare', name: 'Poker Square', group: 'One deck', blurb: 'Place 25 cards in a 5×5 grid to make the best poker hands in every row and column.',
  how: {
    goal: `Score 70 or more by making poker hands in the five rows and five columns of a grid.`,
    deal: `An empty 5 × 5 grid. Cards come off the deck one at a time.`,
    play: [
      `Put each card in any empty square. Once placed, a card stays put.`,
      `When all 25 squares are full, every row and every column is scored as a poker hand.`,
    ],
    score: `Royal flush 100 · straight flush 75 · four of a kind 50 · full house 25 · flush 20 · straight 15 · three of a kind 10 · two pair 5 · one pair 2. Reach <b>70</b> to win.`,
    controls: `{Click} an empty square to place the next card.`,
    tip: `Save the rows for flushes and the columns for pairs and full houses.`,
  },
  newGame(seed) { const d = freshDeck(seed); return { variant: 'pokersquare', moves: 0, grid: Array(25).fill(null), next: up(d.slice(0, 25)) }; },
  render(s) {
    const ls = lines(s.grid, 5, pokerHand);
    const next = s.next[0];
    return `<div class="sol-board"><div class="row" style="gap:28px;align-items:flex-start;flex-wrap:wrap;justify-content:center">${gridHTML(s, 5, ls)}
      <div class="pile" style="--card-w:84px">${next ? cardHTML(next) : emptySlot('Done')}<span>Next card · ${s.next.length} left</span></div></div></div>`;
  },
  click(s, d) {
    const i = Number(d.i);
    if (d.c !== 'cell' || s.grid[i] || !s.next.length) return null;
    s = clone(s); bump(s); s.grid[i] = s.next.shift(); s.fx = 'card'; return s;
  },
  score: (s) => lines(s.grid, 5, pokerHand).reduce((t, l) => t + l.pts, 0),
  isWon(s) { return s.grid.every(Boolean) && this.score(s) >= 70; },
  isOver: (s) => s.grid.every(Boolean),
  status(s) { return `Score ${this.score(s)} · need 70`; },
  count: (s) => s.grid.filter(Boolean).length + s.next.length,
  targets: (s) => s.grid.map((c, i) => (c ? null : { c: 'cell', i: String(i) })).filter(Boolean),
};

// ------------------------------------------------------------------ Cribbage Square
const cribLine = (starter) => (cards) => {
  if (cards.some((c) => !c) || !starter) return { name: '', pts: 0 };
  const r = scoreHand(cards, starter);
  return { name: r.items.map(([n]) => n.replace(/ ×\d+/, '')).slice(0, 2).join(', ') || 'Nineteen', pts: r.total };
};
const cribsquare = {
  id: 'cribsquare', name: 'Cribbage Square', group: 'One deck', blurb: 'Fill a 4×4 grid with cribbage hands; the starter counts in every one.',
  how: {
    goal: `Score 75 or more with cribbage hands in the four rows and four columns of a grid.`,
    deal: `An empty 4 × 4 grid and an empty waste. Cards come off the deck one at a time.`,
    play: [
      `Put each card in an empty square, or on the waste (it holds up to four cards). Placed cards stay put.`,
      `When the grid is full, the next card becomes the <b>starter</b>, which counts in all eight hands.`,
    ],
    score: `Each row and column is scored with the starter, like a cribbage hand: 2 for each fifteen and each pair, 1 per card in a run, 4 for a flush (5 if the starter matches) and 1 for a jack of the starter's suit. A jack as the starter adds 2 once. Reach <b>75</b> to win.`,
    controls: `{Click} an empty square to place the card, or {click} the waste to throw it away.`,
    tip: `Fives and ten-cards make fifteens, so spread them across the rows and columns.`,
  },
  newGame(seed) { const d = freshDeck(seed); return { variant: 'cribsquare', moves: 0, grid: Array(16).fill(null), next: up(d), waste: [], starter: null }; },
  render(s) {
    const ls = lines(s.grid, 4, cribLine(s.starter));
    const next = s.next[0];
    const total = this.score(s);
    return `<div class="sol-board"><div class="row" style="gap:28px;align-items:flex-start;flex-wrap:wrap;justify-content:center">${gridHTML(s, 4, ls)}
      <div style="display:flex;flex-direction:column;gap:12px;align-items:center;--card-w:72px">
        ${s.starter ? `<div class="pile">${cardHTML(s.starter)}<span>Starter</span></div>` : `<div class="pile">${next ? cardHTML(next) : ''}<span>Place this card</span></div>`}
        <div class="pile"><button class="pile-btn" data-c="waste" ${s.starter || s.waste.length >= 4 ? 'disabled' : ''} aria-label="Put on the waste">${s.waste.length ? cardHTML(s.waste.at(-1)) : emptySlot('Waste')}</button><span>Waste · ${s.waste.length}/4</span></div>
        <span class="sub">Total ${total}${s.starter?.rank === 'J' ? ' (incl. heels 2)' : ''}</span></div></div></div>`;
  },
  click(s, d) {
    if (s.starter || !s.next.length) return null;
    s = clone(s);
    if (d.c === 'waste') { if (s.waste.length >= 4) return { error: 'The waste is full.' }; s.waste.push(s.next.shift()); }
    else { const i = Number(d.i); if (s.grid[i]) return null; s.grid[i] = s.next.shift(); }
    bump(s); s.fx = 'card';
    if (s.grid.every(Boolean)) { s.starter = s.next.shift(); s.fx = 'score'; }
    return s;
  },
  score(s) { return lines(s.grid, 4, cribLine(s.starter)).reduce((t, l) => t + l.pts, 0) + (s.starter?.rank === 'J' ? 2 : 0); },
  isWon(s) { return Boolean(s.starter) && this.score(s) >= 75; },
  isOver: (s) => Boolean(s.starter),
  status(s) { return s.starter ? `Score ${this.score(s)} · need 75` : `${s.grid.filter(Boolean).length} of 16 placed`; },
  count: (s) => s.grid.filter(Boolean).length + s.next.length + s.waste.length + (s.starter ? 1 : 0),
  targets: (s) => [...s.grid.map((c, i) => (c ? null : { c: 'cell', i: String(i) })).filter(Boolean), ...(s.waste.length < 4 ? [{ c: 'waste' }] : [])],
};

// ------------------------------------------------------------------ Gaps (Montana)
const SUITS = ['S', 'H', 'C', 'D'];
function gapsDeal(cards, seed, fixedRows) {
  // fixedRows[r] = number of leading cards in row r already in order (kept); others reshuffled into remaining spots.
  const grid = Array.from({ length: 4 }, () => Array(13).fill(null));
  for (let r = 0; r < 4; r++) for (let c = 0; c < fixedRows[r].length; c++) grid[r][c] = fixedRows[r][c];
  const spots = [];
  for (let r = 0; r < 4; r++) for (let c = fixedRows[r].length; c < 13; c++) spots.push([r, c]);
  const mixed = shuffle(cards, rngFor(seed));
  spots.forEach(([r, c], i) => { const card = mixed[i]; grid[r][c] = card && card.rank !== 'A' ? { ...card, up: true } : null; });
  return grid;
}
function inOrder(grid, r) {
  const row = grid[r];
  const out = [];
  if (!row[0] || row[0].rank !== '2') return out;
  out.push(row[0]);
  for (let c = 1; c < 13; c++) { const x = row[c]; if (x && x.suit === row[0].suit && rk(x) === rk(out.at(-1)) + 1) out.push(x); else break; }
  return out;
}
function gapOK(grid, card, r, c) {
  const left = c > 0 ? grid[r][c - 1] : null;
  const right = c < 12 ? grid[r][c + 1] : null;
  if (c === 0) return card.rank === '2' || (right && right.suit === card.suit && rk(card) === rk(right) - 1);
  if (left && left.suit === card.suit && rk(card) === rk(left) + 1) return true;
  if (right && right.suit === card.suit && rk(card) === rk(right) - 1) return true;
  return false;
}
const gaps = {
  id: 'gaps', name: 'Gaps', group: 'One deck', blurb: 'Slide cards into the gaps to sort four rows from 2 to king.',
  how: {
    goal: `Sort four rows, one suit each, from 2 up to king.`,
    deal: `All cards are dealt face up in four rows of 13, with a 2 at the start of each row. The aces are taken out, leaving four gaps.`,
    play: [
      `A gap can take the <b>next higher card of the same suit</b> as the card on its left, or the <b>next lower card of the same suit</b> as the card on its right.`,
      `A gap at the far left of a row takes a 2.`,
      `When you're stuck, <b>Redeal</b>: cards already in order from the left of each row stay, and the rest are shuffled and dealt again, leaving new gaps. You get two redeals.`,
    ],
    controls: `{Click} a card, then {click} the gap it should move into. {Click} Redeal when you're stuck.`,
    tip: `Each move opens a new gap; check what can fill it before you move.`,
  },
  newGame(seed) {
    const d = freshDeck(seed);
    const twos = SUITS.map((su) => d.find((c) => c.rank === '2' && c.suit === su));
    const rest = d.filter((c) => c.rank !== '2');
    return { variant: 'gaps', moves: 0, seed, redeals: 2, sel: null, grid: gapsDeal(rest, seed, twos.map((t) => [{ ...t, up: true }])) };
  },
  render(s) {
    const rows = s.grid.map((row, r) => `<div class="gaps-row">${row.map((card, c) => (card
      ? cardBtn(card, { c: 'card', r, col: c }, { selected: s.sel && s.sel[0] === r && s.sel[1] === c })
      : `<button class="empty-slot slot-btn" data-c="gap" data-r="${r}" data-col="${c}" aria-label="Gap in row ${r + 1}"></button>`)).join('')}</div>`).join('');
    return `<div class="sol-board gaps"><div class="gaps-grid">${rows}</div><div class="row"><button class="btn sm" data-c="redeal" ${s.redeals ? '' : 'disabled'}>Redeal (${s.redeals} left)</button></div></div>`;
  },
  click(s, d) {
    if (d.c === 'redeal') {
      if (!s.redeals) return null;
      s = clone(s); s.redeals--; bump(s);
      const kept = [0, 1, 2, 3].map((r) => inOrder(s.grid, r));
      const keptIds = new Set(kept.flat().map((c) => c.id));
      const loose = s.grid.flat().filter((c) => c && !keptIds.has(c.id));
      const aces = SUITS.map((su) => ({ id: `A${su}`, rank: 'A', suit: su }));
      s.grid = gapsDeal([...loose, ...aces], s.seed + s.redeals * 977 + 1, kept);
      s.sel = null; s.fx = 'shuffle'; return s;
    }
    const r = Number(d.r), c = Number(d.col);
    if (d.c === 'card') { s = clone(s); s.sel = s.sel && s.sel[0] === r && s.sel[1] === c ? null : [r, c]; return s; }
    if (d.c === 'gap') {
      if (!s.sel) return { error: 'Pick a card first.' };
      const [sr, sc] = s.sel;
      const card = s.grid[sr][sc];
      if (!gapOK(s.grid, card, r, c)) return { error: 'That card doesn’t fit there.' };
      s = clone(s); bump(s);
      s.grid[r][c] = card; s.grid[sr][sc] = null; s.sel = null; s.fx = 'card';
      return s;
    }
    return null;
  },
  isWon: (s) => [0, 1, 2, 3].every((r) => inOrder(s.grid, r).length === 12),
  isOver(s) { return this.isWon(s); },
  status: (s) => `In order: ${[0, 1, 2, 3].reduce((t, r) => t + inOrder(s.grid, r).length, 0)} of 48 · redeals ${s.redeals}`,
  count: (s) => s.grid.flat().filter(Boolean).length,
  targets(s) {
    const out = [{ c: 'redeal' }];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 13; c++) out.push(s.grid[r][c] ? { c: 'card', r: String(r), col: String(c) } : { c: 'gap', r: String(r), col: String(c) });
    return out;
  },
};

// ------------------------------------------------------------------ Slide
const slide = {
  id: 'slide', name: 'Slide', group: 'One deck', blurb: 'Slide rows left and right to line up three of a kind in a column.',
  how: {
    goal: `Score 300 or more by lining up three cards of the same rank in a column.`,
    deal: `Twenty-four cards in four rows of six. The other 28 are the stock, with its next card showing.`,
    play: [
      `<b>Slide</b> a row left or right: the next stock card comes in at one end and the card at the other end drops off.`,
      `A card that drops off goes to the waste, unless the row now holds two cards of the same rank; then it goes back under the stock to come round again.`,
      `Three cards of the same rank in one column are removed at once.`,
      `You can also drop the next stock card straight into an empty space.`,
      `The game ends when the stock runs out.`,
    ],
    score: `Each set scores its rank times its place in line: the first set 1 × rank, the second 2 × rank, and so on (A = 1, J = 11, Q = 12, K = 13). Reach <b>300</b> to win.`,
    controls: `{Click} the ◀ or ▶ arrow beside a row to slide it. {Click} an empty space to drop the next card there.`,
    tip: `Later sets are worth more, so high ranks pay off best late in the game.`,
  },
  newGame(seed) { const d = up(freshDeck(seed)); return { variant: 'slide', moves: 0, grid: [0, 1, 2, 3].map((r) => d.slice(r * 6, r * 6 + 6)), stock: d.slice(24), waste: [], sets: 0, score: 0 }; },
  render(s) {
    const rows = s.grid.map((row, r) => `<div class="slide-row"><button class="btn sm" data-c="slide" data-r="${r}" data-dir="left" aria-label="Slide row ${r + 1} left" ${s.stock.length ? '' : 'disabled'}>◀</button>
      ${row.map((card, c) => (card ? `<span>${cardHTML(card)}</span>` : `<button class="empty-slot slot-btn" data-c="fill" data-r="${r}" data-col="${c}" ${s.stock.length ? '' : 'disabled'} aria-label="Fill this space"></button>`)).join('')}
      <button class="btn sm" data-c="slide" data-r="${r}" data-dir="right" aria-label="Slide row ${r + 1} right" ${s.stock.length ? '' : 'disabled'}>▶</button></div>`).join('');
    return `<div class="sol-board"><div class="row" style="gap:24px;align-items:flex-start;flex-wrap:wrap;justify-content:center"><div class="slide-grid">${rows}</div>
      <div class="pile" style="--card-w:72px">${s.stock.length ? cardHTML(s.stock[0]) : emptySlot('Empty')}<span>Next · ${s.stock.length} in stock</span>
      ${s.waste.length ? cardHTML(s.waste.at(-1)) : emptySlot('Waste')}<span>Waste · ${s.waste.length}</span></div></div></div>`;
  },
  click(s, d) {
    if (!s.stock.length) return null;
    s = clone(s);
    const r = Number(d.r);
    if (d.c === 'fill') { const c = Number(d.col); if (s.grid[r][c]) return null; s.grid[r][c] = s.stock.shift(); }
    else if (d.c === 'slide') {
      const row = s.grid[r];
      const enter = s.stock.shift();
      let off;
      if (d.dir === 'right') { off = row.pop(); row.unshift(enter); } else { off = row.shift(); row.push(enter); }
      if (off) {
        const ranks = row.filter(Boolean).map((c) => c.rank);
        if (new Set(ranks).size < ranks.length) s.stock.push(off); else s.waste.push(off);
      }
    } else return null;
    bump(s); s.fx = 'card';
    // Remove columns with three of a kind.
    for (let c = 0; c < 6; c++) {
      const col = s.grid.map((row) => row[c]);
      const counts = {};
      col.forEach((x) => { if (x) counts[x.rank] = (counts[x.rank] || 0) + 1; });
      const hit = Object.entries(counts).find(([, n]) => n >= 3);
      if (hit) {
        let removed = 0;
        for (let rr = 0; rr < 4 && removed < 3; rr++) if (s.grid[rr][c]?.rank === hit[0]) { s.found = [...(s.found ?? []), s.grid[rr][c]]; s.grid[rr][c] = null; removed++; }
        s.sets++; s.score += Math.min(13, s.sets) * rk({ rank: hit[0] }); s.fx = 'match';
      }
    }
    return s;
  },
  isWon: (s) => !s.stock.length && s.score >= 300,
  isOver: (s) => !s.stock.length,
  status: (s) => `Score ${s.score} · sets ${s.sets} · need 300`,
  count: (s) => s.grid.flat().filter(Boolean).length + s.stock.length + s.waste.length + (s.found?.length ?? 0),
  targets(s) {
    const out = [];
    for (let r = 0; r < 4; r++) { out.push({ c: 'slide', r: String(r), dir: 'left' }, { c: 'slide', r: String(r), dir: 'right' }); for (let c = 0; c < 6; c++) if (!s.grid[r][c]) out.push({ c: 'fill', r: String(r), col: String(c) }); }
    return out;
  },
};

export default [pokersquare, cribsquare, gaps, slide];
