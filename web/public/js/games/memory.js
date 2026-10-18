// Memory Match: find pairs (same rank, same color). Solo for score, or race a computer player.
// Options: deck difficulty, wild jokers, and for two players a race to a number of pairs and a peek.
import { deck, shuffle, rngOf, isRed, RANKS } from '../core/cards.js';
import { clone, log, fx, must } from './lib/common.js';
import { panel, btn, scoreTable } from '../core/table.js';
import { cardHTML, backHTML } from '../skin.js';

const GRIDS = { 16: [4, 4], 24: [4, 6], 36: [6, 6] };
const FACTOR = { 16: 5, 24: 8, 36: 12 };
const DECK_FACTOR = { easy: 0.75, medium: 1, hard: 1.4 }; // harder decks score more per pair
const DECK_NAME = { easy: 'easy deck', medium: 'medium deck', hard: 'hard deck' };
const isJoker = (c) => c.rank === 'JK';
// Easy decks pair by rank alone; the others need the same rank and color (9♥ + 9♦).
const keyOf = (s, c) => (isJoker(c) ? 'JK' : s.opts.deck === 'easy' ? c.rank : `${c.rank}${isRed(c.suit) ? 'r' : 'b'}`);
const two = (s) => s.opts.mode === 'two';
const raceTo = (s) => (two(s) ? Number(s.opts.race) || 0 : 0);
const card = (rank, suit) => ({ id: `${rank}${suit}`, rank, suit });

/** The cards for one board: `size` cells of pairs, built for the chosen deck difficulty. */
function boardCards(s, rng) {
  const size = Number(s.opts.size);
  const pairs = [];
  if (s.opts.deck === 'easy') {
    // One pair per rank (any colors), so no two pairs look alike until the ranks run out.
    const ranks = shuffle(RANKS, rng);
    for (let i = 0; pairs.length < size; i++) {
      const [a, b] = i < 13 ? ['S', 'H'] : ['C', 'D'];
      pairs.push(card(ranks[i % 13], a), card(ranks[i % 13], b));
    }
  } else if (s.opts.deck === 'hard') {
    // Both colors of every rank used: lots of look-alike near misses.
    for (const r of shuffle(RANKS, rng)) {
      if (pairs.length >= size) break;
      pairs.push(card(r, 'S'), card(r, 'C'), card(r, 'H'), card(r, 'D'));
    }
    pairs.length = size;
  } else {
    // Pairs: same rank & color (e.g. 9♥ + 9♦).
    for (const c of shuffle(deck().filter((x) => x.suit === 'S' || x.suit === 'H'), rng)) {
      if (pairs.length >= size) break;
      const mate = { S: 'C', H: 'D' }[c.suit];
      pairs.push(c, { id: `${c.rank}${mate}`, rank: c.rank, suit: mate });
    }
  }
  // Two wild jokers take the place of one pair.
  if (s.opts.wild === 'jokers') pairs.splice(-2, 2, { id: 'JK.0', rank: 'JK', suit: 'X' }, { id: 'JK.1', rank: 'JK', suit: 'X' });
  return pairs;
}

function layout(s) {
  const rng = rngOf(s);
  s.cells = shuffle(boardCards(s, rng), rng).map((c) => ({ card: c, state: 'down' }));
  s.flipped = []; s.wildMatch = false;
  s.mem = {}; // AI memory: cell index -> key
  s.phase = two(s) && s.opts.peek === 'yes' ? 'peek' : 'pick';
  fx(s, 'shuffle');
  return s;
}

function newGame({ names, seed, opts }) {
  const s = { v: 1, seed, rngN: 0, names: names.slice(0, 2), opts, log: [], fx: [], partners: false };
  s.matched = [0, 0]; s.misses = 0; s.streak = 0; s.bonuses = 0;
  s.turn = 0; s.board = 1;
  layout(s);
  log(s, two(s) ? (raceTo(s) ? `First to ${raceTo(s)} pairs wins.` : `Find more pairs than ${s.names[1]}.`) : 'Find every pair.');
  if (s.phase === 'peek') log(s, 'Take a good look before the cards turn over!');
  return s;
}

/** A match for `seat` (a pair, or a wild joker with a card and its mate). */
function scoreMatch(s, seat, rank) {
  s.matched[seat]++;
  fx(s, 'match');
  if (seat === 0) { s.streak++; if (s.streak % 3 === 0) { s.bonuses++; log(s, 'Three in a row: bonus!'); } }
  log(s, `${seat === 0 ? 'You' : s.names[seat]} found a pair of ${rank === 'JK' ? 'jokers' : `${rank}s`}.`);
}

/** After a match: the race may be won, or the board may be cleared (then a new board, or the end). */
function afterMatch(s, seat) {
  if (raceTo(s) && s.matched[seat] >= raceTo(s)) return finish(s);
  // A joker left with no other cards can't be matched; clear it away.
  if (s.cells.every((c) => c.state === 'gone' || isJoker(c.card))) {
    for (const c of s.cells) c.state = 'gone';
    if (!raceTo(s)) return finish(s);
    s.board++;
    log(s, `Board ${s.board}: the race goes on.`);
    return layout(s);
  }
  return s;
}

function pickCell(s, seat, i) {
  must(s.phase === 'pick' && s.turn === seat, 'Not your turn.');
  const cell = s.cells[i];
  must(cell && cell.state === 'down', 'Pick a face-down card.');
  cell.state = 'up'; s.flipped.push(i);
  s.mem[i] = keyOf(s, cell.card);
  fx(s, 'flip');
  if (s.flipped.length === 2) {
    const [a, b] = s.flipped.map((k) => s.cells[k]);
    if (keyOf(s, a.card) === keyOf(s, b.card)) {
      a.state = b.state = 'gone'; s.flipped = [];
      scoreMatch(s, seat, a.card.rank);
      return afterMatch(s, seat);
    }
    if (isJoker(a.card) || isJoker(b.card)) {
      // A wild joker turns over the other card's mate, and all three leave the board.
      const k = s.flipped[isJoker(a.card) ? 1 : 0];
      const want = keyOf(s, s.cells[k].card);
      const mate = s.cells.findIndex((c, j) => j !== k && c.state === 'down' && keyOf(s, c.card) === want);
      if (mate >= 0) { s.cells[mate].state = 'up'; s.flipped.push(mate); }
      s.wildMatch = true; s.phase = 'reveal';
      scoreMatch(s, seat, s.cells[k].card.rank);
      return s;
    }
    s.phase = 'reveal';
    if (seat === 0) { s.misses++; s.streak = 0; }
  }
  return s;
}

function hide(s) {
  if (s.wildMatch) {
    for (const k of s.flipped) s.cells[k].state = 'gone';
    s.flipped = []; s.wildMatch = false; s.phase = 'pick';
    return afterMatch(s, s.turn);
  }
  for (const k of s.flipped) s.cells[k].state = 'down';
  s.flipped = []; s.phase = 'pick';
  if (two(s)) s.turn = 1 - s.turn;
  return s;
}

/** The peek is over: the computer player remembers some of what it saw. */
function endPeek(s) {
  const rng = rngOf(s);
  const recall = s.opts.skill === 'expert' ? 0.6 : s.opts.skill === 'intermediate' ? 0.35 : 0.15;
  s.cells.forEach((c, i) => { if (rng() < recall) s.mem[i] = keyOf(s, c.card); });
  s.phase = 'pick';
  return s;
}

function finish(s) {
  s.phase = 'gameOver'; s.turn = null;
  const f = FACTOR[s.cells.length] * (DECK_FACTOR[s.opts.deck] ?? 1);
  s.score = Math.max(0, Math.round(s.matched[0] * f + s.bonuses * 1.5 * f - s.misses * 0.5 * f));
  const won = two(s) ? s.matched[0] > s.matched[1] : true;
  fx(s, won ? 'win' : 'lose');
  return s;
}

function aiPick(s) {
  const rng = rngOf(s);
  const recall = s.opts.skill === 'expert' ? 0.95 : s.opts.skill === 'intermediate' ? 0.7 : 0.4;
  const down = s.cells.map((c, i) => (c.state === 'down' ? i : -1)).filter((i) => i >= 0);
  const known = Object.entries(s.mem).filter(([i]) => s.cells[i].state === 'down' && rng() < recall);
  if (s.flipped.length === 1) {
    const want = keyOf(s, s.cells[s.flipped[0]].card);
    const hit = known.find(([i, k]) => k === want && Number(i) !== s.flipped[0]) ?? known.find(([, k]) => k === 'JK');
    if (hit) return Number(hit[0]);
  } else {
    const seen = {};
    for (const [i, k] of known) { if (seen[k] !== undefined) return seen[k]; seen[k] = Number(i); }
  }
  const unknown = down.filter((i) => s.mem[i] === undefined && !s.flipped.includes(i));
  const pool = unknown.length ? unknown : down.filter((i) => !s.flipped.includes(i));
  return pool[Math.floor(rng() * pool.length)];
}

const RULES = `<p>Cards are dealt face down in a grid. Turn over two cards: if they match (same rank and same color, like 9♥ and 9♦) they're removed; if not, they turn back over.</p>
<h3>Scoring (solo)</h3><p>Each pair, each run of three pairs in a row, and each miss changes your score. Bigger grids multiply everything.</p>
<h3>Two players</h3><p>Take turns against a computer opponent. A match lets you go again; whoever finds the most pairs wins.</p>
<p>Options: an easy deck matches by rank alone and a hard deck uses both colors of every rank (harder decks score more); wild jokers turn up the other card's match and take all three; two players can race to a number of pairs over several boards and peek at each board first.</p>`;

export default {
  id: 'memory', title: 'Memory Match', version: 1, seats: 2, rulesHTML: RULES,
  settings: [
    { key: 'mode', label: 'Players', options: [['solo', 'Just me'], ['two', 'Me vs an opponent']], default: 'solo' },
    { key: 'size', label: 'Grid', options: [[16, '4 × 4 (8 pairs)'], [24, '4 × 6 (12 pairs)'], [36, '6 × 6 (18 pairs)']], default: 24 },
    { key: 'deck', label: 'Deck', options: [['easy', 'Easy: match the rank'], ['medium', 'Medium: rank and color'], ['hard', 'Hard: every look-alike in play']], default: 'medium' },
    { key: 'wild', label: 'Wild cards', options: [['none', 'None'], ['jokers', 'Two jokers']], default: 'none' },
    { key: 'race', label: 'Two players: winning', options: [[0, 'Most pairs on one board'], [10, 'First to 10 pairs'], [15, 'First to 15 pairs'], [20, 'First to 20 pairs']], default: 0 },
    { key: 'peek', label: 'Two players: peek first', options: [['no', 'No'], ['yes', 'Show the cards before each board']], default: 'no' },
    { key: 'skill', label: 'Opponent’s memory', options: [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['expert', 'Expert']], default: 'intermediate' },
  ],
  newGame,
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'reveal' || s.phase === 'peek') return 'auto';
    return s.turn;
  },
  delay: (s) => (s.phase === 'peek' ? 1500 + s.cells.length * 90 : s.phase === 'reveal' ? 1100 : 700),
  act(state, a) {
    const s = clone(state);
    if (a.act === 'cell') return pickCell(s, 0, Number(a.i));
    if (a.act === 'again') return newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'reveal') return hide(s);
    if (s.phase === 'peek') return endPeek(s);
    return pickCell(s, s.turn, aiPick(s));
  },
  view(s) {
    const opp = s.names[1];
    const [rows, cols] = GRIDS[s.cells.length];
    const myTurn = s.phase === 'pick' && s.turn === 0;
    const peek = s.phase === 'peek';
    const grid = `<div class="memory-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));--card-w:${s.cells.length > 24 ? 50 : 60}px">${s.cells.map((c, i) =>
      c.state === 'gone' ? '<span class="empty-slot" aria-hidden="true"></span>'
        : c.state === 'up' || peek ? `<span>${cardHTML(c.card)}</span>`
          : `<button class="pile-btn" data-act="cell" data-i="${i}" ${myTurn ? '' : 'disabled'} aria-label="Face-down card ${i + 1}">${backHTML()}</button>`).join('')}</div>`;
    let overlay = '';
    if (s.phase === 'gameOver') {
      overlay = two(s)
        ? panel(s.matched[0] > s.matched[1] ? 'You win!' : s.matched[0] === s.matched[1] ? 'A tie!' : `${opp} wins`, `<p>Pairs: you ${s.matched[0]}, ${opp} ${s.matched[1]}.</p><div class="row" style="justify-content:flex-end">${btn('Play again', 'again', '', true)}</div>`)
        : panel('Board cleared!', `${scoreTable(['Count'], [['Pairs', s.matched[0]], ['3-in-a-row bonuses', s.bonuses], ['Misses', s.misses], ['Score', `<b>${s.score}</b>`]])}<div class="row" style="justify-content:flex-end">${btn('Play again', 'again', '', true)}</div>`);
    }
    const race = raceTo(s);
    const extras = [s.opts.deck && s.opts.deck !== 'medium' ? DECK_NAME[s.opts.deck] : '', s.opts.wild === 'jokers' ? 'jokers' : '', race ? `race to ${race} · board ${s.board ?? 1}` : ''].filter(Boolean);
    return {
      subtitle: `${rows} × ${cols} grid${extras.length ? ` · ${extras.join(' · ')}` : ''}`,
      scores: two(s) ? [{ label: 'You', value: `${s.matched[0]} pairs`, us: true }, { label: opp, value: `${s.matched[1]} pairs` }] : [{ label: 'Pairs', value: s.matched[0], us: true }, { label: 'Misses', value: s.misses }],
      seats: two(s) ? [{ seat: 0, pos: 'south', name: s.names[0], mine: true, turn: s.turn === 0 }, { seat: 1, pos: 'north', name: opp, turn: s.turn === 1, tag: `${s.matched[1]} pairs` }] : [{ seat: 0, pos: 'south', name: s.names[0], mine: true }],
      hand: null,
      center: grid,
      banner: peek ? 'Memorize the cards!' : s.phase === 'pick' ? (s.turn === 0 ? (s.flipped.length ? 'Find its match' : 'Turn over a card') : `${opp} is thinking…`) : s.wildMatch ? 'Wild joker!' : '',
      overlay,
      side: [],
    };
  },
};
