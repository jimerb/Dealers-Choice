// Sizing for the solitaire table: pick a card width that fills the felt (width and height) and
// fan each column so it always fits the room it was given. Pure functions, so tests can run them.
//
// The plan reserves height for a "late game" column (all its face-down cards plus a full run),
// so cards keep their size from deal to finish; any column that grows past that squeezes its fan.

export const CARD_H = 1.4; // cards are 5:7
const LABEL = 16; // the count/label line under a pile in the top row
const FAN = { up: 0.28, down: 0.12, upMin: 0.19, downMin: 0.07 }; // fan steps as fractions of the card width

export const gapFor = (w) => Math.round(Math.min(18, Math.max(4, w * 0.1)));

/** Widths of the top-row piles at card width w (the waste fans three cards). */
function topWidths(top, w) {
  return top.map((p) => (p.type === 'waste' ? w * 1.6 : p.reshuffle ? Math.max(w, 150) : w));
}

/** Greedy flex-wrap of widths into lines no wider than W: { lines, width } */
export function wrapLines(widths, gap, W) {
  if (!widths.length) return { lines: 0, width: 0 };
  let lines = 1, cur = 0, width = 0;
  for (const x of widths) {
    if (cur && cur + gap + x > W + 0.5) { lines++; width = Math.max(width, cur); cur = x; }
    else cur = cur ? cur + gap + x : x;
  }
  return { lines, width: Math.max(width, cur) };
}

/** How many cards a column may hold late in the game: [face-down, face-up]. */
export function plannedColumn(state, rules = {}) {
  const tabs = state.piles.filter((p) => p.type === 'tableau');
  let down = 0, up = 1;
  const grows = rules.build !== 'none' || rules.stock === 'deal-each' || rules.stock === 'deal-all';
  for (const t of tabs) {
    const d = t.cards.filter((c) => !c.up).length;
    down = Math.max(down, d);
    up = Math.max(up, t.cards.length - d);
  }
  if (grows) up = Math.min(rules.maxCol ?? 99, Math.max(up, 13));
  return [down, up];
}

/** Height of a planned column at card width w: comfortable for the deal plus a few cards, readable when full. */
function columnHeight(w, [down, up], dealt) {
  const full = down * FAN.downMin + (up - 1) * FAN.upMin; // the fullest column, squeezed to readable steps
  const roomy = down * FAN.down + (up - 1) * FAN.up; // the fullest column at comfortable steps
  const easy = dealt[0] * FAN.down + (dealt[1] - 1 + 3) * FAN.up; // the deal plus three cards, comfortable
  return w * (CARD_H + Math.max(full, Math.min(easy, roomy)));
}

/**
 * Lay out a rules-driven board in a W x H box.
 * Returns { w, gap, rows, perRow, colRoom, boardW, topLines } where colRoom is the height each column may use.
 */
export function planStandard(state, rules, { W, H, maxW = 190, minW = 22, banner = 0 }) {
  const top = state.piles.filter((p) => p.type !== 'tableau' && p.type !== 'bouquet');
  const n = state.piles.filter((p) => p.type === 'tableau').length;
  const bouquet = state.piles.find((p) => p.type === 'bouquet');
  const plan = plannedColumn(state, rules);
  const dealt = (() => {
    let d = 0, u = 1;
    for (const t of state.piles.filter((p) => p.type === 'tableau')) { const dd = t.cards.filter((c) => !c.up).length; d = Math.max(d, dd); u = Math.max(u, t.cards.length - dd); }
    return [d, u];
  })();

  function measure(w, rows) {
    const gap = gapFor(w);
    const perRow = Math.ceil(n / rows) || 0;
    const tabW = perRow ? perRow * w + (perRow - 1) * gap : 0;
    const t = wrapLines(topWidths(top, w), gap, W);
    let h = banner + (t.lines ? t.lines * (w * CARD_H + LABEL) + (t.lines - 1) * gap : 0);
    if (bouquet) { const b = wrapLines([w, ...Array(15).fill(w * 0.55 + 4)], 0, W); h += b.lines * (w * CARD_H + 4) + gap * 1.5; }
    const colH = n ? columnHeight(w, plan, dealt) : 0;
    if (n) h += (t.lines || bouquet ? gap * 1.5 : 0) + rows * colH + (rows - 1) * gap * 1.5;
    return { gap, perRow, tabW, top: t, h, colH, ok: tabW <= W + 0.5 && t.width <= W + 0.5 && h <= H + 0.5 };
  }
  function fit(rows) {
    let lo = minW, hi = maxW;
    if (!measure(lo, rows).ok) return lo;
    while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (measure(mid, rows).ok) lo = mid; else hi = mid; }
    return Math.floor(lo);
  }
  let rows = 1, w = fit(1);
  // Very wide layouts can split the tableau into two or three rows when that makes the cards much bigger.
  if (n >= 9) for (const r of [2, 3]) { if (Math.ceil(n / r) < 4) break; const wr = fit(r); if (wr > w * 1.1) { w = wr; rows = r; } }
  const m = measure(w, rows);
  // Give the columns any height left over, so long columns squeeze as late as possible.
  const spare = Math.max(0, H - m.h);
  const colRoom = n ? m.colH + spare / rows : 0;
  return { w, gap: m.gap, rows, perRow: m.perRow, colRoom, boardW: Math.max(m.tabW, m.top.width), topLines: m.top.lines, height: m.h };
}

/** Top offsets for a column's cards so the column's height stays within `room`. Returns { tops, height }. */
export function fanColumn(cards, w, room) {
  const n = cards.length;
  const h = w * CARD_H;
  if (!n) return { tops: [], height: h };
  let up = Math.max(FAN.up * w, 10), down = Math.max(FAN.down * w, 4);
  let nu = 0, nd = 0;
  for (let i = 0; i < n - 1; i++) (cards[i].up ? nu++ : nd++);
  const max = Math.max(0, room - h);
  const over = () => nu * up + nd * down > max;
  if (over() && nd) down = Math.max(Math.min(down, Math.max(FAN.downMin * w, 3)), (max - nu * up) / nd); // face-down cards squeeze first
  if (over() && nu) up = Math.max(0, (max - nd * down) / nu);
  if (up < down) up = down = Math.min(down, max / (nu + nd)); // only when even that is not enough
  const tops = [];
  let y = 0;
  for (let i = 0; i < n; i++) { tops.push(Math.round(y * 10) / 10); y += cards[i].up ? up : down; }
  return { tops, height: tops[n - 1] + h };
}
