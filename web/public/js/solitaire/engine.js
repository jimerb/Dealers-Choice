// Rules-driven solitaire engine for the "build" family (cards move between piles onto foundations).
// Each layout is a config: piles, tableau build rule, foundation specs, stock behaviour, plus optional hooks.
// Non-build games (Pyramid, Clock, Gaps, arcade games…) live in ./custom/*.js.
import { deck, shuffle, makeRng, lo, isRed } from '../core/cards.js';

export const rk = lo;
const color = (c) => (isRed(c.suit) ? 'r' : 'b');
const up = (cards) => cards.map((c) => ({ ...c, up: true }));
const down = (cards) => cards.map((c) => ({ ...c, up: false }));
const mod13 = (x) => ((x % 13) + 13) % 13;

/** Tableau build rules. */
export function builds(mode, top, card, wrap = false) {
  const d = wrap ? mod13(rk(top) - rk(card)) : rk(top) - rk(card);
  switch (mode) {
    case 'down-alt': return d === 1 && color(top) !== color(card);
    case 'down-suit': return d === 1 && top.suit === card.suit;
    case 'down-any': return d === 1;
    case 'updown-any': return d === 1 || d === (wrap ? 12 : -1);
    case 'down2-suit': return d === 2 && top.suit === card.suit;
    case 'any': return true;
    default: return false;
  }
}

// ------------------------------------------------------------------ pile builders
const P = (id, type, cards = [], extra = {}) => ({ id, type, cards, ...extra });
/** Foundation spec: base rank ('A', 'K', '2'…), 'any' (any first card) or 'global' (first card played sets one rank for all). */
const F = (id, base, extra = {}) => P(id, 'foundation', [], { base, dir: 'up', step: 1, suit: 'same', wrap: false, ...extra });
const fours = (base, extra = {}, prefix = 'f') => [0, 1, 2, 3].map((i) => F(`${prefix}${i}`, base, extra));
function columns(d, counts, faceUp = counts) {
  return counts.map((n, i) => { const cs = d.splice(0, n); return P(`t${i}`, 'tableau', [...down(cs.slice(0, n - faceUp[i])), ...up(cs.slice(n - faceUp[i]))]); });
}
const take = (d, pred) => { const i = d.findIndex(pred); return i >= 0 ? d.splice(i, 1)[0] : null; };
const stockWaste = (d) => [P('stock', 'stock', down(d.splice(0))), P('waste', 'waste')];

// ------------------------------------------------------------------ variants
export const VARIANTS = {
  klondike: {
    name: 'Klondike', group: 'One deck', blurb: 'The classic. Build down in alternating colors; draw one at a time.',
    rules: { build: 'down-alt', move: 'seq', empty: 'king', stock: 'waste', draw: 1, redeals: Infinity, foundToTab: true },
    deal(d) { const t = columns(d, [1, 2, 3, 4, 5, 6, 7], [1, 1, 1, 1, 1, 1, 1]); return [...stockWaste(d), ...fours('A'), ...t]; },
    how: `<p><b>Goal:</b> move all 52 cards to the four foundations, building each suit up from ace to king.</p>
      <p><b>Tableau:</b> seven columns; only the top card of each starts face up. Build down in alternating colors (red 6 on black 7). You can move a whole ordered run. Turn over face-down cards as they're uncovered. Only a king (or a run starting with a king) may fill an empty column.</p>
      <p><b>Stock:</b> click it to turn one card onto the waste; the top waste card can be played. When the stock is empty, click it to turn the waste back over (unlimited passes).</p>`,
  },
  klondike3: {
    name: 'Klondike (draw 3)', group: 'One deck', blurb: 'Klondike turning three cards at a time.',
    rules: { build: 'down-alt', move: 'seq', empty: 'king', stock: 'waste', draw: 3, redeals: Infinity, foundToTab: true },
    deal(d) { return VARIANTS.klondike.deal(d); },
    how: `<p>Played exactly like Klondike, except the stock turns <b>three cards at a time</b> and only the top one of the three is playable. Unlimited passes through the stock.</p>`,
  },
  yukon: {
    name: 'Yukon', group: 'One deck', blurb: 'Like Klondike with no stock: move any face-up group.',
    rules: { build: 'down-alt', move: 'any', empty: 'king', foundToTab: true },
    deal(d) { return [...fours('A'), ...columns(d, [1, 6, 7, 8, 9, 10, 11], [1, 5, 5, 5, 5, 5, 5])]; },
    how: `<p><b>Goal:</b> build all four suits up from ace to king on the foundations.</p>
      <p>All 52 cards are dealt to seven columns. Build down in alternating colors. Unlike Klondike, you can move <b>any face-up card together with everything on top of it</b>, even if those cards aren't in order. Only kings fill empty columns. There is no stock.</p>`,
  },
  spider: {
    name: 'Spider', group: 'Two decks', decks: 2, blurb: 'Build full suits from King to Ace; complete runs fly off.',
    rules: { build: 'down-any', moveBuild: 'down-suit', move: 'seq', empty: 'any', noFoundationDrops: true, stock: 'deal-all', spider: true },
    deal(d) { const t = columns(d, [6, 6, 6, 6, 5, 5, 5, 5, 5, 5], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]); return [P('stock', 'stock', down(d)), ...Array.from({ length: 8 }, (_, i) => F(`f${i}`, 'K')), ...t]; },
    how: `<p><b>Goal:</b> assemble eight complete suits, each running king down to ace. A finished run leaves the table by itself.</p>
      <p>Build down regardless of suit, but only runs of the <b>same suit</b> move together. Any card or run may fill an empty column. Click the stock to deal one card onto every column (all columns must have at least one card).</p>`,
  },
  spiderette: {
    name: 'Spiderette', group: 'One deck', blurb: 'One-deck Spider on a Klondike layout.',
    rules: { build: 'down-any', moveBuild: 'down-suit', move: 'seq', empty: 'any', noFoundationDrops: true, stock: 'deal-all', spider: true },
    deal(d) { const t = columns(d, [1, 2, 3, 4, 5, 6, 7], [1, 1, 1, 1, 1, 1, 1]); return [P('stock', 'stock', down(d)), ...fours('K'), ...t]; },
    how: `<p>One-deck Spider. Seven columns are dealt Klondike style. Build down regardless of suit; only same-suit runs move as a unit. Complete king-to-ace suits are removed automatically. Click the stock to deal a card to each column. Win by clearing all four suits.</p>`,
  },
  fourfree: {
    name: 'Four Free', group: 'One deck', blurb: 'FreeCell-style: four free cells, build down in alternating colors.',
    rules: { build: 'down-alt', move: 'seq', supermove: true, empty: 'any' },
    deal(d) { return [...Array.from({ length: 4 }, (_, i) => P(`c${i}`, 'cell')), ...fours('A'), ...columns(d, [7, 7, 7, 7, 6, 6, 6, 6])]; },
    how: `<p>All cards are dealt face up into eight columns. Four <b>free cells</b> each hold one card. Build columns down in alternating colors and foundations up in suit from ace. Runs can be moved as long as there are enough free cells and empty columns to move them one card at a time. Any card fills an empty column.</p>`,
  },
  eightoff: {
    name: 'Eight Off', group: 'One deck', blurb: 'Eight free cells (four start filled); build down in suit.',
    rules: { build: 'down-suit', move: 'seq', supermove: true, empty: 'king' },
    deal(d) { const t = columns(d, Array(8).fill(6)); return [...Array.from({ length: 8 }, (_, i) => P(`c${i}`, 'cell', i < 4 ? up(d.splice(0, 1)) : [])), ...fours('A'), ...t]; },
    how: `<p>Eight columns of six face-up cards and eight free cells, four of which start with a card. Build columns down <b>in suit</b>; foundations up in suit from ace. Runs move if there's enough free space. Only kings fill empty columns.</p>`,
  },
  seahaven: {
    name: 'Seahaven Towers', group: 'One deck', blurb: 'Ten columns, four cells; build down in suit, kings to empty columns.',
    rules: { build: 'down-suit', move: 'seq', supermove: true, empty: 'king' },
    deal(d) { const t = columns(d, Array(10).fill(5)); return [...Array.from({ length: 4 }, (_, i) => P(`c${i}`, 'cell', i === 1 || i === 2 ? up(d.splice(0, 1)) : [])), ...fours('A'), ...t]; },
    how: `<p>Ten columns of five face-up cards, plus four free cells (two start occupied). Build down in suit, foundations up in suit from ace. Runs move given enough free cells. Only kings fill empty columns.</p>`,
  },
  bakers: {
    name: "Baker's Dozen", group: 'One deck', blurb: 'Thirteen columns of four; build down regardless of suit. Kings start at the bottom.',
    rules: { build: 'down-any', move: 'single', empty: 'none' },
    deal(d) { const t = columns(d, Array(13).fill(4)); for (const c of t) c.cards.sort((a, b) => (b.rank === 'K') - (a.rank === 'K')); return [...fours('A'), ...t]; },
    how: `<p>Thirteen columns of four face-up cards; kings are moved to the bottom of their columns at the start. Move one card at a time, building down regardless of suit. Empty columns can't be filled. Build the foundations up in suit from ace to king.</p>`,
  },
  castle: {
    name: 'Beleaguered Castle', group: 'One deck', blurb: 'Aces start on the foundations; build down regardless of suit, one card at a time.',
    rules: { build: 'down-any', move: 'single', empty: 'any' },
    deal(d) { const f = fours('A'); f.forEach((x, i) => { x.cards = up([take(d, (c) => c.rank === 'A' && c.suit === 'SHCD'[i])]); }); return [...f, ...columns(d, Array(8).fill(6))]; },
    how: `<p>The four aces start on the foundations; the rest are dealt into eight rows. Move one card at a time, building down regardless of suit. Any card can fill an empty row. Build foundations up in suit to the kings.</p>`,
  },
  forty: {
    name: 'Forty Thieves', group: 'Two decks', decks: 2, blurb: 'Ten columns of four; build down in suit, one card at a time. One pass through the stock.',
    rules: { build: 'down-suit', move: 'single', empty: 'any', stock: 'waste', draw: 1, redeals: 0 },
    deal(d) { const t = columns(d, Array(10).fill(4)); return [...stockWaste(d), ...Array.from({ length: 8 }, (_, i) => F(`f${i}`, 'A')), ...t]; },
    how: `<p>Two decks. Ten columns of four face-up cards. Build down in suit, moving one card at a time; any card fills an empty column. Turn the stock one card at a time, with <b>no redeal</b>. Build all eight foundations up in suit from ace.</p>`,
  },
  canfield: {
    name: 'Canfield', group: 'One deck', blurb: 'Foundations start from a random rank and wrap around; build down in alternating colors.',
    rules: { build: 'down-alt', move: 'seq', empty: 'any', autoFill: 'reserve', stock: 'waste', draw: 3, redeals: Infinity, wrap: true },
    deal(d) {
      const reserve = d.splice(0, 13);
      const baseCard = d.shift();
      const f = fours(baseCard.rank, { wrap: true }); f[0].cards = up([baseCard]);
      const t = columns(d, [1, 1, 1, 1]);
      return [...stockWaste(d), P('reserve', 'reserve', [...down(reserve.slice(0, 12)), ...up(reserve.slice(12))]), ...f, ...t];
    },
    how: `<p>A 13-card <b>reserve</b>, four tableau piles and a foundation card that sets the starting rank for all foundations (they build up in suit and wrap from king to ace).</p>
      <p>Build tableau piles down in alternating colors, wrapping from ace to king; move runs freely. Empty piles fill automatically from the reserve; when it's empty, fill them with any card. The stock turns three at a time with unlimited passes.</p>`,
  },
  scorpion: {
    name: 'Scorpion', group: 'One deck', blurb: 'Build down in suit; move any face-up group. Three extra cards wait in the stock.',
    rules: { build: 'down-suit', move: 'any', empty: 'king', noFoundationDrops: true, stock: 'deal-first3', spider: true },
    deal(d) { const t = columns(d, Array(7).fill(7), [4, 4, 4, 4, 7, 7, 7]); return [P('stock', 'stock', down(d)), ...fours('K'), ...t]; },
    how: `<p><b>Goal:</b> build four complete suits, king down to ace, within the columns; finished suits leave the table.</p>
      <p>Seven columns of seven (three cards face down in each of the first four). Build down in suit, and move any face-up card with everything above it. Only kings fill empty columns. The three stock cards are dealt to the first three columns when you click the stock.</p>`,
  },
  flower: {
    name: 'Flower Garden', group: 'One deck', blurb: 'Six beds of six; the 16-card bouquet is all available. Build down regardless of suit.',
    rules: { build: 'down-any', move: 'single', empty: 'any' },
    deal(d) { const t = columns(d, Array(6).fill(6)); return [P('bouquet', 'bouquet', up(d)), ...fours('A'), ...t]; },
    how: `<p>Six "flower beds" of six face-up cards and a <b>bouquet</b> of 16 cards, every one of which can be played. Build the beds down regardless of suit, one card at a time; any card fills an empty bed. Build foundations up in suit from ace.</p>`,
  },
  golf: {
    name: 'Golf', group: 'One deck', blurb: 'Clear the seven columns onto the pile, one rank up or down. Fewer cards left is a better score.',
    rules: { build: 'none', move: 'single', empty: 'none', stock: 'to-found' },
    deal(d) { const t = columns(d, Array(7).fill(5)); const first = d.shift(); return [P('stock', 'stock', down(d)), F('pile', 'any', { dir: 'updown', suit: 'any', golf: true, cards: up([first]) }), ...t]; },
    won: (s) => tabs(s).every((p) => !p.cards.length),
    score: (s) => tabs(s).reduce((t, p) => t + p.cards.length, 0), scoreName: 'Cards left',
    how: `<p>Seven columns of five face-up cards. Move the top card of any column onto the pile if it is <b>one rank higher or lower</b> than the pile's top card (suits don't matter, no wrapping). When stuck, click the stock to turn a new card onto the pile. Clear every column to win; otherwise your score is the number of cards left (lower is better).</p>`,
  },
  acesup: {
    name: 'Aces Up', group: 'One deck', blurb: 'Discard any card when a higher card of its suit shows on another column. Leave only the four aces.',
    rules: { build: 'none', move: 'single', empty: 'any', stock: 'deal-each' },
    deal(d) { const t = columns(d, [1, 1, 1, 1]); return [P('stock', 'stock', down(d)), F('discard', 'any', { acesup: true }), ...t]; },
    won: (s) => tabs(s).every((p) => p.cards.length === 1 && p.cards[0].rank === 'A') && !pile(s, 'stock').cards.length,
    score: (s) => pile(s, 'discard').cards.length, scoreName: 'Discarded',
    how: `<p>Four columns. Move a card to the discard pile when <b>another column shows a higher card of the same suit</b> (aces are high). Any top card can fill an empty column. Click the stock to deal a card onto each column. Win by ending with only the four aces on the table.</p>`,
  },

  // ---------------------------------------------------------------- one deck, added
  bristol: {
    name: 'Bristol', group: 'One deck', blurb: 'Build down regardless of suit; the stock feeds three reserve piles.',
    rules: { build: 'down-any', move: 'single', empty: 'none', maxCol: 15, stock: 'to-reserves', reserves: 3 },
    deal(d) { const t = columns(d, Array(8).fill(3)); return [P('stock', 'stock', down(d)), ...[0, 1, 2].map((i) => P(`r${i}`, 'reserve')), ...fours('A', { suit: 'any' }), ...t]; },
    how: `<p><b>Goal:</b> build four foundations up from ace to king, <b>regardless of suit</b>.</p>
      <p>Eight columns of three. Build down regardless of suit, one card at a time (a column holds at most 15 cards). Empty columns can't be filled. Click the stock to deal three cards, one onto each of three reserve piles; the top card of each reserve can be played. No redeals.</p>`,
  },
  calculation: {
    name: 'Calculation', group: 'One deck', blurb: 'Four foundations count by ones, twos, threes and fours; park cards on five piles.',
    rules: { build: 'any', move: 'single', empty: 'any', tabFrom: ['waste'], stock: 'waste-forced' },
    deal(d) {
      const guides = ['A', '2', '3', '4'].map((r) => take(d, (c) => c.rank === r));
      return [P('stock', 'stock', down(d)), P('waste', 'waste'), ...[1, 2, 3, 4].map((k, i) => F(`f${i}`, String(2 * k), { suit: 'any', step: k, wrap: true, max: 12, guide: guides[i] })),
        ...[0, 1, 2, 3, 4].map((i) => P(`t${i}`, 'tableau'))];
    },
    won: (s) => foundationCount(s) === 48,
    how: `<p>Four foundations count up <b>regardless of suit</b> by different steps; the A-2-3-4 guide cards show the step:</p>
      <ul><li>by 1: 2 3 4 5 6 7 8 9 10 J Q K</li><li>by 2: 4 6 8 10 Q A 3 5 7 9 J K</li><li>by 3: 6 9 Q 2 5 8 J A 4 7 10 K</li><li>by 4: 8 Q 3 7 J 2 6 10 A 5 9 K</li></ul>
      <p>Turn the stock one card at a time. Each card must go onto a foundation or one of five waste piles before you turn the next. Only the top card of a waste pile can be played (to a foundation). No redeals: plan your piles!</p>`,
  },
  betsyross: {
    name: 'Betsy Ross', group: 'One deck', blurb: 'Like Calculation, but with the foundations started and three passes through the stock.',
    rules: { build: 'none', stock: 'waste', draw: 1, redeals: 2 },
    deal(d) {
      const guides = ['A', '2', '3', '4'].map((r) => take(d, (c) => c.rank === r));
      const f = [1, 2, 3, 4].map((k, i) => F(`f${i}`, String(2 * k), { suit: 'any', step: k, wrap: true, max: 12, guide: guides[i] }));
      f.forEach((x, i) => { x.cards = up([take(d, (c) => c.rank === String(2 * (i + 1)))]); });
      return [...stockWaste(d), ...f];
    },
    won: (s) => foundationCount(s) === 48,
    how: `<p>Four foundations start with a 2, 4, 6 and 8, and build up <b>regardless of suit</b> by 1, 2, 3 and 4 (wrapping past king) until each ends with a king:</p>
      <ul><li>2 3 4 5 6 7 8 9 10 J Q K</li><li>4 6 8 10 Q A 3 5 7 9 J K</li><li>6 9 Q 2 5 8 J A 4 7 10 K</li><li>8 Q 3 7 J 2 6 10 A 5 9 K</li></ul>
      <p>Turn the stock one card at a time and play to the foundations. Two redeals are allowed.</p>`,
  },
  eaglewing: {
    name: 'Eagle Wing', group: 'One deck', blurb: 'A random starting rank; columns of at most three fed from a 14-card reserve.',
    rules: { build: 'down-suit', move: 'seq', empty: 'any', autoFill: 'reserve', maxCol: 3, stock: 'waste', draw: 1, redeals: 1, wrap: true },
    deal(d) {
      const baseCard = d.shift();
      const f = fours(baseCard.rank, { wrap: true }); f[0].cards = up([baseCard]);
      const reserve = d.splice(0, 14);
      const t = columns(d, Array(8).fill(1));
      return [...stockWaste(d), P('reserve', 'reserve', [...down(reserve.slice(0, 13)), ...up(reserve.slice(13))]), ...f, ...t];
    },
    how: `<p>The first foundation card sets the starting rank; build all four foundations up in suit, wrapping from king to ace.</p>
      <p>Eight columns build down in suit (wrapping) and hold <b>at most three cards</b>. Single cards and whole ordered columns can move. Empty columns fill automatically from the 14-card reserve; once it's empty, fill them with any card. The stock turns one card at a time with one redeal.</p>`,
  },
  eliminator: {
    name: 'Eliminator', group: 'One deck', blurb: 'Clear four columns onto eight foundations built up or down from any card.',
    rules: { build: 'none', move: 'single', empty: 'none' },
    deal(d) { return [...Array.from({ length: 8 }, (_, i) => F(`f${i}`, 'any', { dir: 'updown', suit: 'any', wrap: true })), ...columns(d, Array(4).fill(13))]; },
    won: (s) => tabs(s).every((p) => !p.cards.length),
    score: (s) => foundationsOf(s).filter((f) => !f.cards.length).length * 10 + foundationCount(s), scoreName: 'Score',
    how: `<p>All 52 cards are dealt face up into four columns. Move top cards onto eight foundations. Each foundation can <b>start with any card</b> and then builds up or down by one, regardless of suit (wrapping between king and ace). Cards can't move between columns.</p>
      <p>Clear every column to win. For a challenge, use as few foundations as possible: each unused foundation is worth 10 bonus points.</p>`,
  },
  fortress: {
    name: 'Fortress', group: 'One deck', blurb: 'You choose the foundation rank; rows build up or down regardless of suit.',
    rules: { build: 'updown-any', move: 'single', empty: 'any', maxCol: 13, wrap: true },
    deal(d) { return [...fours('global', { wrap: true }), ...columns(d, [6, 6, 5, 5, 5, 5, 5, 5, 5, 5])]; },
    how: `<p>All cards are dealt face up into ten rows. First, move the top card of any row to a foundation: its rank becomes the <b>starting rank for all four foundations</b>, which build up in suit and wrap from king to ace.</p>
      <p>Rows build up <i>or</i> down by one regardless of suit (wrapping), one card at a time, at most 13 cards per row. Any card fills an empty row.</p>`,
  },
  fourseasons: {
    name: 'Four Seasons', group: 'One deck', blurb: 'Five piles in a cross, foundations in the corners from a random rank.',
    rules: { build: 'down-any', move: 'single', empty: 'any', stock: 'waste', draw: 1, redeals: 0, wrap: true },
    deal(d) { const baseCard = d.shift(); const f = fours(baseCard.rank, { wrap: true }); f[0].cards = up([baseCard]); const t = columns(d, Array(5).fill(1)); return [...stockWaste(d), ...f, ...t]; },
    how: `<p>The first foundation card sets the starting rank; build the four corner foundations up in suit, wrapping from king to ace. Five piles form a cross: build them <b>down regardless of suit</b> (wrapping), one card at a time. Fill empty piles with the top card of the waste or another pile. The stock turns one card at a time, with no redeal.</p>`,
  },
  labellelucie: {
    name: 'La Belle Lucie', group: 'One deck', blurb: 'Sixteen fans of three; build down in suit. Three reshuffles.',
    rules: { build: 'down-suit', move: 'single', empty: 'none', maxCol: 7, stock: 'reshuffle', redeals: 3 },
    deal(d) { const f = fours('A'); f.forEach((x, i) => { x.cards = up([take(d, (c) => c.rank === 'A' && c.suit === 'SHCD'[i])]); }); return [P('stock', 'stock', [], { reshuffle: true }), ...f, ...columns(d, Array(16).fill(3))]; },
    how: `<p>The aces start on the foundations; the other cards are fanned out in sixteen groups of three. Build fans down <b>in suit</b>, moving one card at a time (at most seven cards per fan). Empty fans can't be refilled. Build the foundations up in suit.</p>
      <p>When you're stuck, click <b>Reshuffle</b> to gather the fans, shuffle and deal them out again in threes. You get three reshuffles.</p>`,
  },
  penguin: {
    name: 'Penguin', group: 'One deck', blurb: 'The "beak" card sets the rank; seven columns, seven single-card cells.',
    rules: { build: 'down-suit', move: 'seq', empty: 'any', maxCol: 18, wrap: true },
    deal(d) {
      const beak = d[0];
      const f = fours(beak.rank, { wrap: true });
      const others = d.filter((c) => c.rank === beak.rank && c.id !== beak.id);
      others.forEach((c, i) => { f[i].cards = up([c]); d.splice(d.indexOf(c), 1); });
      return [...Array.from({ length: 7 }, (_, i) => P(`c${i}`, 'cell')), ...f, ...columns(d, Array(7).fill(7))];
    },
    how: `<p>One card (the "beak") sets the starting rank; the other three cards of that rank start three foundations, and the beak is somewhere in the columns. Build foundations up in suit, wrapping from king to ace.</p>
      <p>Seven columns of seven, all face up. Build down in suit (wrapping); move single cards or ordered runs. Seven <b>cells</b> each hold one card. Any card or run fills an empty column.</p>`,
  },
  shamrocks: {
    name: 'Shamrocks', group: 'One deck', blurb: 'Eighteen little rows of three; choose the foundation rank.',
    rules: { build: 'updown-any', move: 'single', empty: 'none', maxCol: 3, wrap: true },
    deal(d) { return [...fours('global', { wrap: true }), ...columns(d, [...Array(17).fill(3), 1])]; },
    how: `<p>Cards are dealt face up into 17 rows of three and one single card. First move the top card of any row to a foundation: its rank starts <b>all four foundations</b>, which build up in suit (wrapping from king to ace).</p>
      <p>Rows build up or down by one regardless of suit (wrapping), one card at a time, and may never hold more than three cards. Empty rows stay empty.</p>`,
  },
  strategy: {
    name: 'Strategy', group: 'One deck', blurb: 'Deal the whole stock onto eight columns, then play off in one go.',
    rules: { build: 'any', move: 'single', empty: 'any', tabFrom: ['waste'], maxCol: 13, stock: 'waste-forced' },
    deal(d) { const f = fours('A'); f.forEach((x, i) => { x.cards = up([take(d, (c) => c.rank === 'A' && c.suit === 'SHCD'[i])]); }); return [P('stock', 'stock', down(d)), P('waste', 'waste'), ...f, ...Array.from({ length: 8 }, (_, i) => P(`t${i}`, 'tableau'))]; },
    canDrop(s, from, to) {
      const stockLeft = pile(s, 'stock').cards.length + pile(s, 'waste').cards.length;
      if (to.type === 'foundation') return stockLeft ? false : from.type === 'tableau';
      return undefined;
    },
    how: `<p>The aces start on the foundations. Turn the stock one card at a time and place each card on <b>any of eight columns</b> (up to 13 cards each); you can't play to the foundations yet.</p>
      <p>Once the stock is used up, play top cards from the columns to the foundations, building up in suit to the kings. Cards never move between columns. Tip: never bury a card under a lower card of the same suit.</p>`,
  },

  // ---------------------------------------------------------------- two decks, added
  acesandkings: {
    name: 'Aces and Kings', group: 'Two decks', decks: 2, blurb: 'Four foundations build up from aces, four down from kings, regardless of suit.',
    rules: { build: 'none', move: 'single', empty: 'any', autoFill: 'stock', stock: 'waste', draw: 1, redeals: 0, foundToFound: true },
    deal(d) {
      const r1 = d.splice(0, 13), r2 = d.splice(0, 13);
      const t = columns(d, [1, 1, 1, 1]);
      return [...stockWaste(d), P('r0', 'reserve', up(r1)), P('r1', 'reserve', up(r2)), ...fours('A', { suit: 'any' }), ...fours('K', { suit: 'any', dir: 'down' }, 'k'), ...t];
    },
    canDrop(s, from, to) { if (from.type === 'waste' && to.type === 'tableau') return pile(s, 'stock').cards.length === 0 && !to.cards.length; return undefined; },
    how: `<p>Two decks. Four foundations build <b>up from ace</b> and four build <b>down from king</b>, regardless of suit, all to completion.</p>
      <p>Play the top cards of the two 13-card reserves, the four tableau piles and the waste to the foundations. Empty tableau piles refill from the stock automatically; once the stock is gone, any available card may fill them. You may move a top card from one foundation to another. One pass through the stock.</p>`,
  },
  alhambra: {
    name: 'Alhambra', group: 'Two decks', decks: 2, blurb: 'Eight reserves; build on the waste up or down in suit.',
    rules: { build: 'none', stock: 'waste', draw: 1, redeals: 2 },
    deal(d) {
      const aces = 'SHCD'.split('').map((s) => take(d, (c) => c.rank === 'A' && c.suit === s));
      const kings = 'SHCD'.split('').map((s) => take(d, (c) => c.rank === 'K' && c.suit === s));
      const fa = fours('A'); fa.forEach((x, i) => { x.cards = up([aces[i]]); });
      const fk = fours('K', { dir: 'down' }, 'k'); fk.forEach((x, i) => { x.cards = up([kings[i]]); });
      const reserves = Array.from({ length: 8 }, (_, i) => P(`r${i}`, 'reserve', up(d.splice(0, 4))));
      return [...stockWaste(d), ...fa, ...fk, ...reserves];
    },
    canDrop(s, from, to, cards) {
      if (to.type === 'waste') { const t = to.cards.at(-1); return from.type === 'reserve' && Boolean(t) && t.suit === cards[0].suit && (mod13(rk(t) - rk(cards[0])) === 1 || mod13(rk(cards[0]) - rk(t)) === 1); }
      return undefined;
    },
    how: `<p>Two decks. One ace and one king of each suit start the foundations: aces build <b>up</b> in suit, kings build <b>down</b> in suit.</p>
      <p>Eight reserve piles of four: their top cards can go to the foundations, or onto the <b>waste</b> if they're one rank above or below the waste's top card in the same suit (wrapping). Turn the stock one card at a time; two redeals.</p>`,
  },
  batsford: {
    name: 'Batsford', group: 'Two decks', decks: 2, blurb: 'Two-deck Klondike with a three-king reserve.',
    rules: { build: 'down-alt', move: 'seq', empty: 'king', stock: 'waste', draw: 1, redeals: 0, kingsReserve: 3 },
    deal(d) { const t = columns(d, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], Array(10).fill(1)); return [...stockWaste(d), P('kings', 'reserve', [], { kings: true }), ...Array.from({ length: 8 }, (_, i) => F(`f${i}`, 'A')), ...t]; },
    how: `<p>Two decks dealt Klondike style into ten columns. Build columns down in alternating colors; move single cards or ordered runs; only kings (or runs starting with a king) fill empty columns. Foundations build up in suit from ace.</p>
      <p>A special reserve can hold <b>up to three kings</b> parked from anywhere; its top king can later go to an empty column or a foundation. The stock turns one card at a time, with no redeal.</p>`,
  },
  colorado: {
    name: 'Colorado', group: 'Two decks', decks: 2, blurb: 'Twenty piles; every stock card must be played somewhere.',
    rules: { build: 'any', move: 'single', empty: 'none', autoFill: 'stock', tabFrom: ['waste'], stock: 'waste-forced' },
    deal(d) { const t = columns(d, Array(20).fill(1)); return [P('stock', 'stock', down(d)), P('waste', 'waste'), ...fours('A', { unique: 'up' }), ...fours('K', { dir: 'down', unique: 'down' }, 'k'), ...t]; },
    how: `<p>Two decks. Four foundations build <b>up</b> in suit from ace and four build <b>down</b> in suit from king, one of each suit in each direction.</p>
      <p>Twenty piles start with one card each. Only their top cards can be played, and only to the foundations. Empty piles refill from the stock. Turn the stock one card at a time: each card <b>must</b> be played to a foundation or placed on top of any pile before you turn the next. No redeal.</p>`,
  },
  mountolympus: {
    name: 'Mount Olympus', group: 'Two decks', decks: 2, blurb: 'Foundations climb by twos: odds from aces, evens from twos.',
    rules: { build: 'down2-suit', move: 'seq', empty: 'any', autoFill: 'stock', stock: 'deal-each' },
    deal(d) {
      const fa = Array.from({ length: 8 }, (_, i) => F(`a${i}`, 'A', { step: 2, max: 7 }));
      const f2 = Array.from({ length: 8 }, (_, i) => F(`b${i}`, '2', { step: 2, max: 6 }));
      'SHCDSHCD'.split('').forEach((su, i) => { fa[i].cards = up([take(d, (c) => c.rank === 'A' && c.suit === su)]); f2[i].cards = up([take(d, (c) => c.rank === '2' && c.suit === su)]); });
      const t = columns(d, Array(9).fill(1));
      return [P('stock', 'stock', down(d)), ...fa, ...f2, ...t];
    },
    how: `<p>Two decks. The eight aces and eight twos start sixteen foundations that build up <b>by twos</b> in suit: A 3 5 7 9 J K on the aces, 2 4 6 8 10 Q on the twos.</p>
      <p>Nine columns build <b>down by twos</b> in suit (9 on J, 6 on 8…); single cards and ordered runs move. Empty columns refill from the stock automatically; once it's gone, use any card or run. Click the stock to deal a card onto every column.</p>`,
  },
  redandblack: {
    name: 'Red and Black', group: 'Two decks', decks: 2, blurb: 'Foundations and columns both alternate colors.',
    rules: { build: 'down-alt', move: 'single', empty: 'any', autoFill: 'waste-or-stock', stock: 'waste', draw: 1, redeals: 1 },
    deal(d) { const f = Array.from({ length: 8 }, (_, i) => F(`f${i}`, 'A', { suit: 'alt' })); f.forEach((x) => { x.cards = up([take(d, (c) => c.rank === 'A')]); }); const t = columns(d, Array(8).fill(1)); return [...stockWaste(d), ...f, ...t]; },
    how: `<p>Two decks. The eight aces start the foundations, which build up in <b>alternating colors</b> regardless of suit (black 2 on a red ace…). Eight columns build down in alternating colors, one card at a time. Empty columns fill automatically from the waste (or the stock). One redeal.</p>`,
  },
  sultan: {
    name: 'Sultan', group: 'Two decks', decks: 2, blurb: 'Surround the Sultan: seven kings build A–Q, the heart ace builds to the queen.',
    rules: { build: 'none', stock: 'waste', draw: 1, redeals: 2 },
    deal(d) {
      const sultan = take(d, (c) => c.rank === 'K' && c.suit === 'H');
      const kings = ['H', 'S', 'S', 'C', 'C', 'D', 'D'].map((su) => take(d, (c) => c.rank === 'K' && c.suit === su));
      const ace = take(d, (c) => c.rank === 'A' && c.suit === 'H');
      const fk = kings.map((k, i) => F(`k${i}`, 'K', { wrap: true, max: 13, cards: up([k]) }));
      const fa = F('aH', 'A', { max: 12, cards: up([ace]) });
      const cells = Array.from({ length: 8 }, (_, i) => P(`c${i}`, 'cell', up(d.splice(0, 1)), { fromWaste: true }));
      return [...stockWaste(d), P('sultan', 'guide', up([sultan])), fa, ...fk, ...cells];
    },
    won: (s) => foundationCount(s) === 103,
    how: `<p>Two decks. The king of hearts sits in the middle as the Sultan. Seven other kings start foundations that build up in suit <b>wrapping from king to ace and on to queen</b>; an ace of hearts starts a foundation that builds up to the queen.</p>
      <p>Eight side spaces each hold one card; refill empty spaces from the waste. Turn the stock one card at a time; two redeals. Complete every foundation to win.</p>`,
  },
  terrace: {
    name: 'Terrace', group: 'Two decks', decks: 2, blurb: 'Pick the starting rank from three cards; alternate colors everywhere.',
    rules: { build: 'down-alt', move: 'single', empty: 'any', autoFill: 'waste-or-stock', maxCol: 15, stock: 'waste', draw: 1, redeals: 0, wrap: true },
    deal(d) {
      const res = d.splice(0, 11);
      const t = Array.from({ length: 9 }, (_, i) => P(`t${i}`, 'tableau', i < 3 ? up(d.splice(0, 1)) : []));
      return [...stockWaste(d), P('reserve', 'reserve', up(res), { toFoundationOnly: true }), ...Array.from({ length: 8 }, (_, i) => F(`f${i}`, 'global', { suit: 'alt', wrap: true })), ...t];
    },
    canDrop(s, from, to) {
      if (!s.baseRank) return to.type === 'foundation' && from.type === 'tableau' ? undefined : false;
      if (from.type === 'reserve' && to.type !== 'foundation') return false;
      return undefined;
    },
    how: `<p>Two decks. Begin by moving one of the three cards in the first tableau columns to a foundation: its rank becomes the <b>starting rank for all eight foundations</b>, which build up in alternating colors and wrap from king to ace. Then the other columns are dealt.</p>
      <p>Columns build down in alternating colors (wrapping), one card at a time, at most 15 cards. Empty columns refill from the waste or stock. The top card of the 11-card reserve can only go to the foundations. One pass through the stock.</p>`,
  },
};

// ------------------------------------------------------------------ helpers
const pile = (s, id) => s.piles.find((p) => p.id === id);
const tabs = (s) => s.piles.filter((p) => p.type === 'tableau');
const foundationsOf = (s) => s.piles.filter((p) => p.type === 'foundation');
const foundationCount = (s) => foundationsOf(s).reduce((t, p) => t + p.cards.length, 0);
const top = (p) => p.cards.at(-1);
const vOf = (s) => VARIANTS[s.variant];
const rules = (s) => vOf(s).rules;

export function newGame(variant, seed = Math.floor(Math.random() * 2 ** 31)) {
  const v = VARIANTS[variant];
  const rng = makeRng(seed);
  const d = shuffle(deck({ copies: v.decks ?? 1 }), rng);
  const s = { variant, seed, piles: v.deal(d, rng), moves: 0, history: [], passes: 0, baseRank: null };
  after(s);
  return s;
}

const snapshot = (s) => JSON.stringify({ piles: s.piles, passes: s.passes, baseRank: s.baseRank });
function push(s) { s.history = [...s.history.slice(-99), snapshot(s)]; s.moves++; }
export function undo(s) {
  if (!s.history.length) return s;
  const prev = JSON.parse(s.history.at(-1));
  return { ...s, ...prev, history: s.history.slice(0, -1), moves: s.moves + 1 };
}

function foundationAccepts(s, f, card) {
  if (f.acesup) {
    return tabs(s).some((p) => top(p) && top(p) !== card && top(p).suit === card.suit && (top(p).rank === 'A' ? 14 : rk(top(p))) > (card.rank === 'A' ? 14 : rk(card)));
  }
  if (f.max && f.cards.length >= f.max) return false;
  const t = top(f);
  if (!t) {
    if (f.base === 'any') return true;
    if (f.base === 'global') return s.baseRank ? rk(card) === s.baseRank : true;
    if (card.rank !== f.base) return false;
    if (f.unique) return !foundationsOf(s).some((x) => x !== f && x.unique === f.unique && x.cards.length && x.cards[0].suit === card.suit);
    if ((vOf(s).decks ?? 1) === 1 && f.suit === 'same') return !foundationsOf(s).some((x) => x !== f && x.cards.length && x.base === f.base && x.cards[0].suit === card.suit);
    return true;
  }
  const raw = rk(card) - rk(t);
  const d = f.wrap ? mod13(raw) : raw;
  const upOK = d === f.step;
  const downOK = f.wrap ? d === 13 - f.step : raw === -f.step;
  const dirOK = f.dir === 'up' ? upOK : f.dir === 'down' ? downOK : upOK || downOK;
  if (!dirOK) return false;
  if (f.suit === 'same') return card.suit === t.suit;
  if (f.suit === 'alt') return color(card) !== color(t);
  return true;
}

/** Cards that would move if you grab pile `p` at index `i` (or null if not movable). */
export function grab(s, p, i) {
  const r = rules(s);
  if (p.type === 'bouquet') return p.cards[i] ? [p.cards[i]] : null;
  if (p.type === 'guide' || p.type === 'stock') return null;
  const cards = p.cards.slice(i);
  if (!cards.length || !cards[0].up) return null;
  if (p.type !== 'tableau') return i === p.cards.length - 1 ? cards : null;
  if (cards.length === 1) return cards;
  if (r.move === 'single') return null;
  if (r.move === 'any') return cards;
  const mb = r.moveBuild ?? r.build;
  for (let k = 1; k < cards.length; k++) if (!builds(mb, cards[k - 1], cards[k], r.wrap)) return null;
  return cards;
}

function maxSupermove(s, toEmpty) {
  const cells = s.piles.filter((p) => p.type === 'cell' && !p.cards.length).length;
  const empties = tabs(s).filter((p) => !p.cards.length).length - (toEmpty ? 1 : 0);
  return (cells + 1) * 2 ** Math.max(0, empties);
}

export function canDrop(s, fromId, i, toId) {
  if (fromId === toId) return false;
  const from = pile(s, fromId), to = pile(s, toId);
  if (!from || !to) return false;
  const cards = grab(s, from, i);
  if (!cards) return false;
  const v = vOf(s), r = rules(s);
  const hook = v.canDrop?.(s, from, to, cards);
  if (hook !== undefined) return hook;
  const first = cards[0];
  switch (to.type) {
    case 'foundation':
      if (cards.length !== 1 || r.noFoundationDrops) return false;
      if (from.type === 'foundation' && !r.foundToFound) return false;
      return foundationAccepts(s, to, first);
    case 'cell':
      if (cards.length !== 1 || to.cards.length) return false;
      return to.fromWaste ? from.type === 'waste' : true;
    case 'reserve':
      return Boolean(to.kings) && cards.length === 1 && first.rank === 'K' && to.cards.length < 3;
    case 'tableau': {
      if (r.tabFrom && !r.tabFrom.includes(from.type)) return false;
      if (from.type === 'foundation' && !r.foundToTab) return false;
      if (from.toFoundationOnly) return false;
      if (r.maxCol && to.cards.length + cards.length > r.maxCol) return false;
      if (r.supermove && cards.length > maxSupermove(s, !to.cards.length)) return false;
      if (!to.cards.length) {
        if (r.empty === 'none') return false;
        if (r.empty === 'king') return first.rank === 'K';
        return true;
      }
      const t = top(to);
      return t.up && builds(r.build, t, first, r.wrap);
    }
    default: return false;
  }
}

export function move(s, fromId, i, toId) {
  if (!canDrop(s, fromId, i, toId)) return null;
  s = structuredClone(s);
  push(s);
  const from = pile(s, fromId), to = pile(s, toId);
  const cards = from.type === 'bouquet' ? from.cards.splice(i, 1) : from.cards.splice(i);
  if (to.type === 'foundation' && to.base === 'global' && !s.baseRank) s.baseRank = rk(cards[0]);
  to.cards.push(...cards);
  after(s);
  return s;
}

/** Housekeeping after every change: flip tops, sweep Spider runs, auto-fill empty columns, Terrace's deal. */
function after(s) {
  const r = rules(s);
  for (const p of tabs(s)) if (p.cards.length && !top(p).up) top(p).up = true;
  const res = pile(s, 'reserve');
  if (res?.cards.length) top(res).up = true;
  if (r.spider) {
    for (const p of tabs(s)) {
      if (p.cards.length < 13) continue;
      const run = p.cards.slice(-13);
      if (run.every((c) => c.up) && run[0].rank === 'K' && run.every((c, k) => k === 0 || (c.suit === run[0].suit && rk(run[k - 1]) - rk(c) === 1))) {
        p.cards.splice(-13);
        const f = foundationsOf(s).find((x) => !x.cards.length);
        if (f) f.cards.push(...run);
        if (p.cards.length) top(p).up = true;
      }
    }
  }
  if (s.variant === 'terrace' && s.baseRank && !s.terraceDealt) {
    s.terraceDealt = true;
    const stock = pile(s, 'stock');
    for (const p of tabs(s)) if (!p.cards.length && stock.cards.length) p.cards.push({ ...stock.cards.pop(), up: true });
  }
  if (r.autoFill && !(s.variant === 'terrace' && !s.baseRank)) {
    for (const p of tabs(s)) {
      if (p.cards.length) continue;
      if (r.autoFill === 'reserve' && res?.cards.length) { p.cards.push({ ...res.cards.pop(), up: true }); if (res.cards.length) top(res).up = true; continue; }
      if (r.autoFill === 'waste-or-stock') { const w = pile(s, 'waste'); if (w?.cards.length) { p.cards.push(w.cards.pop()); continue; } }
      if (r.autoFill === 'stock' || r.autoFill === 'waste-or-stock') { const st = pile(s, 'stock'); if (st?.cards.length) p.cards.push({ ...st.cards.pop(), up: true }); }
    }
  }
}

/** Click on the stock: deal according to the variant. Returns new state, null (nothing to do) or {error}. */
export function clickStock(s) {
  const r = rules(s);
  const st = pile(s, 'stock');
  if (!st) return null;
  s = structuredClone(s);
  const stock = pile(s, 'stock');
  const waste = pile(s, 'waste');
  switch (r.stock) {
    case 'waste': {
      if (!stock.cards.length) {
        if (!waste.cards.length || s.passes >= r.redeals) return null;
        push(s); s.passes++;
        stock.cards = down(waste.cards.reverse()); waste.cards = [];
        return s;
      }
      push(s);
      for (let k = 0; k < r.draw && stock.cards.length; k++) waste.cards.push({ ...stock.cards.pop(), up: true });
      after(s);
      return s;
    }
    case 'waste-forced':
      if (!stock.cards.length) return null;
      if (waste.cards.length) return { ...s, error: 'Play the turned card first.' };
      push(s); waste.cards.push({ ...stock.cards.pop(), up: true });
      return s;
    case 'reshuffle': {
      if (s.passes >= r.redeals) return null;
      push(s); s.passes++;
      const cards = tabs(s).flatMap((p) => p.cards.splice(0));
      const mixed = shuffle(cards, makeRng(s.seed + s.passes * 31));
      tabs(s).forEach((p, i) => { p.cards = up(mixed.slice(i * 3, i * 3 + 3)); });
      return s;
    }
  }
  if (!stock.cards.length) return null;
  if (r.stock === 'deal-all') {
    if (tabs(s).some((p) => !p.cards.length)) return { ...s, error: 'Fill every empty column before dealing.' };
    push(s);
    for (const p of tabs(s)) if (stock.cards.length) p.cards.push({ ...stock.cards.pop(), up: true });
  } else if (r.stock === 'deal-first3') { push(s); for (const p of tabs(s).slice(0, 3)) if (stock.cards.length) p.cards.push({ ...stock.cards.pop(), up: true }); }
  else if (r.stock === 'deal-each') { push(s); for (const p of tabs(s)) if (stock.cards.length) p.cards.push({ ...stock.cards.pop(), up: true }); }
  else if (r.stock === 'to-reserves') { push(s); for (const p of s.piles.filter((x) => x.type === 'reserve')) if (stock.cards.length) p.cards.push({ ...stock.cards.pop(), up: true }); }
  else if (r.stock === 'to-found') { push(s); foundationsOf(s)[0].cards.push({ ...stock.cards.pop(), up: true }); }
  else return null;
  after(s);
  return s;
}

/** Best automatic target for a card (foundation first, then a sensible tableau spot). */
export function autoTarget(s, fromId, i) {
  const ps = s.piles;
  for (const p of ps) if (p.type === 'foundation' && canDrop(s, fromId, i, p.id)) return p.id;
  for (const p of ps) if (p.type === 'tableau' && p.cards.length && canDrop(s, fromId, i, p.id)) return p.id;
  const from = pile(s, fromId);
  for (const p of ps) if (p.type === 'tableau' && !p.cards.length && canDrop(s, fromId, i, p.id) && (from.type !== 'tableau' || i > 0)) return p.id;
  for (const p of ps) if ((p.type === 'cell' || p.type === 'waste' || p.type === 'reserve') && canDrop(s, fromId, i, p.id)) return p.id;
  return null;
}

/** Move every playable top card to the foundations. */
export function autoPlay(s) {
  const r = rules(s);
  if (r.noFoundationDrops || vOf(s).rules.stock === 'to-found') return s;
  // The whole auto-finish is a single undo step.
  const before = s.history, start = snapshot(s), moves = s.moves;
  let changed = true, n = 0, any = false;
  while (changed && n++ < 300) {
    changed = false;
    for (const p of s.piles) {
      if (!['tableau', 'waste', 'cell', 'reserve', 'bouquet'].includes(p.type) || !p.cards.length) continue;
      const f = s.piles.find((x) => x.type === 'foundation' && !x.acesup && canDrop(s, p.id, p.cards.length - 1, x.id));
      if (f) { s = move(s, p.id, p.cards.length - 1, f.id); changed = any = true; break; }
    }
  }
  if (any) { s.history = [...before.slice(-99), start]; s.moves = moves + 1; }
  return s;
}

export function isWon(s) {
  const v = vOf(s);
  if (v.won) return v.won(s);
  return foundationCount(s) === 52 * (v.decks ?? 1);
}

export function scoreOf(s) {
  const v = vOf(s);
  return v.score ? v.score(s) : foundationCount(s);
}
export const scoreName = (s) => vOf(s).scoreName ?? 'Cards home';
