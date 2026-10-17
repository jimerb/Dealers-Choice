// Memory Match: find pairs (same rank, same color). Solo for score, or race a computer player.
import { deck, shuffle, rngOf, isRed } from '../core/cards.js';
import { clone, log, fx, must } from './lib/common.js';
import { panel, btn, scoreTable } from '../core/table.js';
import { cardHTML, backHTML } from '../skin.js';

const GRIDS = { 16: [4, 4], 24: [4, 6], 36: [6, 6] };
const FACTOR = { 16: 5, 24: 8, 36: 12 };
const key = (c) => `${c.rank}${isRed(c.suit) ? 'r' : 'b'}`;

function newGame({ names, seed, opts }) {
  const s = { v: 1, seed, rngN: 0, names: [names[0], 'North'], opts, log: [], fx: [], partners: false };
  const rng = rngOf(s);
  const size = Number(opts.size);
  // Pairs: same rank & color (e.g. 9♥ + 9♦).
  const pairs = [];
  for (const c of shuffle(deck().filter((x) => x.suit === 'S' || x.suit === 'H'), rng)) {
    if (pairs.length >= size) break;
    const mate = { S: 'C', H: 'D' }[c.suit];
    pairs.push(c, { id: `${c.rank}${mate}`, rank: c.rank, suit: mate });
  }
  s.cells = shuffle(pairs, rng).map((c) => ({ card: c, state: 'down' }));
  s.flipped = []; s.matched = [0, 0]; s.misses = 0; s.streak = 0; s.bonuses = 0;
  s.turn = 0; s.phase = 'pick';
  s.mem = {}; // AI memory: cell index -> key
  fx(s, 'shuffle');
  log(s, opts.mode === 'two' ? 'Find more pairs than North.' : 'Find every pair.');
  return s;
}

function pickCell(s, seat, i) {
  must(s.phase === 'pick' && s.turn === seat, 'Not your turn.');
  const cell = s.cells[i];
  must(cell && cell.state === 'down', 'Pick a face-down card.');
  cell.state = 'up'; s.flipped.push(i);
  s.mem[i] = key(cell.card);
  fx(s, 'flip');
  if (s.flipped.length === 2) {
    const [a, b] = s.flipped.map((k) => s.cells[k]);
    if (key(a.card) === key(b.card)) {
      a.state = b.state = 'gone'; s.matched[seat]++; s.flipped = [];
      fx(s, 'match');
      if (seat === 0) { s.streak++; if (s.streak % 3 === 0) { s.bonuses++; log(s, 'Three in a row: bonus!'); } }
      log(s, `${seat === 0 ? 'You' : 'North'} found a pair of ${a.card.rank}s.`);
      if (s.cells.every((c) => c.state === 'gone')) return finish(s);
    } else {
      s.phase = 'reveal';
      if (seat === 0) { s.misses++; s.streak = 0; }
    }
  }
  return s;
}

function hide(s) {
  for (const k of s.flipped) s.cells[k].state = 'down';
  s.flipped = []; s.phase = 'pick';
  if (s.opts.mode === 'two') s.turn = 1 - s.turn;
  return s;
}

function finish(s) {
  s.phase = 'gameOver'; s.turn = null;
  const f = FACTOR[s.cells.length];
  s.score = Math.max(0, Math.round(s.matched[0] * f + s.bonuses * 1.5 * f - s.misses * 0.5 * f));
  const won = s.opts.mode === 'two' ? s.matched[0] > s.matched[1] : true;
  fx(s, won ? 'win' : 'lose');
  return s;
}

function aiPick(s) {
  const rng = rngOf(s);
  const recall = s.opts.skill === 'expert' ? 0.95 : s.opts.skill === 'intermediate' ? 0.7 : 0.4;
  const down = s.cells.map((c, i) => (c.state === 'down' ? i : -1)).filter((i) => i >= 0);
  const known = Object.entries(s.mem).filter(([i]) => s.cells[i].state === 'down' && rng() < recall);
  if (s.flipped.length === 1) {
    const want = key(s.cells[s.flipped[0]].card);
    const hit = known.find(([i, k]) => k === want && Number(i) !== s.flipped[0]);
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
<h3>Two players</h3><p>Take turns against North. A match lets you go again; whoever finds the most pairs wins.</p>`;

export default {
  id: 'memory', title: 'Memory Match', version: 1, rulesHTML: RULES,
  settings: [
    { key: 'mode', label: 'Players', options: [['solo', 'Just me'], ['two', 'Me vs North']], default: 'solo' },
    { key: 'size', label: 'Grid', options: [[16, '4 × 4 (8 pairs)'], [24, '4 × 6 (12 pairs)'], [36, '6 × 6 (18 pairs)']], default: 24 },
    { key: 'skill', label: 'North’s memory', options: [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['expert', 'Expert']], default: 'intermediate' },
  ],
  newGame,
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'reveal') return 'auto';
    return s.turn;
  },
  delay: (s) => (s.phase === 'reveal' ? 1100 : 700),
  act(state, a) {
    const s = clone(state);
    if (a.act === 'cell') return pickCell(s, 0, Number(a.i));
    if (a.act === 'again') return newGame({ names: [s.names[0]], seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'reveal') return hide(s);
    return pickCell(s, s.turn, aiPick(s));
  },
  view(s) {
    const [rows, cols] = GRIDS[s.cells.length];
    const myTurn = s.phase === 'pick' && s.turn === 0;
    const grid = `<div class="memory-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));--card-w:${s.cells.length > 24 ? 50 : 60}px">${s.cells.map((c, i) =>
      c.state === 'gone' ? '<span class="empty-slot" aria-hidden="true"></span>'
        : c.state === 'up' ? `<span>${cardHTML(c.card)}</span>`
          : `<button class="pile-btn" data-act="cell" data-i="${i}" ${myTurn ? '' : 'disabled'} aria-label="Face-down card ${i + 1}">${backHTML()}</button>`).join('')}</div>`;
    let overlay = '';
    if (s.phase === 'gameOver') {
      overlay = s.opts.mode === 'two'
        ? panel(s.matched[0] > s.matched[1] ? 'You win!' : s.matched[0] === s.matched[1] ? 'A tie!' : 'North wins', `<p>Pairs: you ${s.matched[0]}, North ${s.matched[1]}.</p><div class="row" style="justify-content:flex-end">${btn('Play again', 'again', '', true)}</div>`)
        : panel('Board cleared!', `${scoreTable(['Count'], [['Pairs', s.matched[0]], ['3-in-a-row bonuses', s.bonuses], ['Misses', s.misses], ['Score', `<b>${s.score}</b>`]])}<div class="row" style="justify-content:flex-end">${btn('Play again', 'again', '', true)}</div>`);
    }
    const two = s.opts.mode === 'two';
    return {
      subtitle: `${rows} × ${cols} grid`,
      scores: two ? [{ label: 'You', value: `${s.matched[0]} pairs`, us: true }, { label: 'North', value: `${s.matched[1]} pairs` }] : [{ label: 'Pairs', value: s.matched[0], us: true }, { label: 'Misses', value: s.misses }],
      seats: two ? [{ seat: 0, pos: 'south', name: s.names[0], mine: true, turn: s.turn === 0 }, { seat: 1, pos: 'north', name: 'North', turn: s.turn === 1, tag: `${s.matched[1]} pairs` }] : [{ seat: 0, pos: 'south', name: s.names[0], mine: true }],
      hand: null,
      center: grid,
      banner: s.phase === 'pick' ? (s.turn === 0 ? (s.flipped.length ? 'Find its match' : 'Turn over a card') : 'North is thinking…') : '',
      overlay,
      side: [],
    };
  },
};
