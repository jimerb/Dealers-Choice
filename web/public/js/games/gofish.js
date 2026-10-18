// Go Fish (4 players): ask a player for a rank you hold; collect books of four.
import { deck, shuffle, sortCards, rngOf, lo } from '../core/cards.js';
import { clone, log, fx, who, must, seatsVM } from './lib/common.js';
import { panel, btn, scoreTable } from '../core/table.js';
import { backHTML } from '../skin.js';

const RANK_PLURAL = (r) => ({ A: 'aces', K: 'kings', Q: 'queens', J: 'jacks', 6: 'sixes' })[r] ?? `${r}s`;
const sortHand = (h) => sortCards(h, { rankFn: lo, bySuit: false, desc: false });

function newGame({ names, seed, opts }) {
  const s = { v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, log: [], fx: [], partners: false };
  const d = shuffle(deck(), rngOf(s));
  s.hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 5, i * 5 + 5)));
  s.stock = d.slice(20);
  s.books = [[], [], [], []];
  s.memory = [[], [], [], []]; // ranks each player was seen asking for
  s.turn = 0; s.phase = 'ask';
  for (let i = 0; i < 4; i++) makeBooks(s, i);
  fx(s, 'shuffle');
  log(s, 'Five cards each. You go first.');
  return s;
}

function makeBooks(s, seat) {
  const counts = {};
  s.hands[seat].forEach((c) => { counts[c.rank] = (counts[c.rank] || 0) + 1; });
  for (const [r, n] of Object.entries(counts)) if (n === 4) {
    s.hands[seat] = s.hands[seat].filter((c) => c.rank !== r);
    s.books[seat].push(r);
    log(s, `${who(s, seat)} ${seat === 0 ? 'make' : 'makes'} a book of ${RANK_PLURAL(r)}!`);
    fx(s, 'match');
  }
}

function refill(s, seat) {
  if (s.hands[seat].length || !s.stock.length) return;
  const n = Math.min(5, s.stock.length);
  s.hands[seat] = sortHand([...s.hands[seat], ...s.stock.splice(-n)]);
  makeBooks(s, seat);
}

function nextTurn(s, seat) {
  if (s.books.flat().length === 13) return finish(s);
  let t = seat;
  for (let k = 0; k < 4; k++) {
    t = (t + 1) % 4;
    refill(s, t);
    if (s.hands[t].length) { s.turn = t; s.phase = 'ask'; return s; }
  }
  return finish(s);
}

function ask(s, seat, target, rank) {
  must(s.phase === 'ask' && s.turn === seat, 'Not your turn.');
  must(target !== seat && s.hands[target]?.length, 'Ask a player who has cards.');
  must(s.hands[seat].some((c) => c.rank === rank), 'You can only ask for a rank you hold.');
  s.memory[seat] = [...s.memory[seat].filter((r) => r !== rank), rank].slice(-6);
  const got = s.hands[target].filter((c) => c.rank === rank);
  if (got.length) {
    s.hands[target] = s.hands[target].filter((c) => c.rank !== rank);
    s.hands[seat] = sortHand([...s.hands[seat], ...got]);
    log(s, `${who(s, seat)} ${seat === 0 ? 'ask' : 'asks'} ${target === 0 ? 'you' : s.names[target]} for ${RANK_PLURAL(rank)} and ${seat === 0 ? 'get' : 'gets'} ${got.length}.`);
    fx(s, 'deal');
    makeBooks(s, seat);
    refill(s, target);
    if (!s.hands[seat].length) refill(s, seat);
    if (!s.hands[seat].length) return nextTurn(s, seat);
    if (s.books.flat().length === 13) return finish(s);
    return s; // go again
  }
  log(s, `${who(s, seat)} ${seat === 0 ? 'ask' : 'asks'} ${target === 0 ? 'you' : s.names[target]} for ${RANK_PLURAL(rank)}. Go fish!`);
  fx(s, 'bubble');
  if (!s.stock.length) return nextTurn(s, seat);
  const card = s.stock.pop();
  s.hands[seat] = sortHand([...s.hands[seat], card]);
  makeBooks(s, seat);
  if (card.rank === rank) {
    log(s, `${who(s, seat)} fished the ${RANK_PLURAL(rank).replace(/s$/, '')} ${seat === 0 ? 'you' : 'they'} wanted, so ${seat === 0 ? 'go' : 'goes'} again!`);
    refill(s, seat);
    if (!s.hands[seat].length) return nextTurn(s, seat);
    return s;
  }
  if (seat === 0) s.lastFish = card.id;
  return nextTurn(s, seat);
}

function finish(s) {
  s.phase = 'gameOver'; s.turn = null;
  const best = Math.max(...s.books.map((b) => b.length));
  s.winners = s.books.map((b, i) => (b.length === best ? i : -1)).filter((i) => i >= 0);
  fx(s, s.winners.includes(0) ? 'win' : 'lose');
  log(s, 'All the books are made.');
  return s;
}

function aiChoice(s, seat) {
  const rng = rngOf(s);
  const hand = s.hands[seat];
  const ranks = [...new Set(hand.map((c) => c.rank))];
  const skill = s.opts.skill;
  const memLen = skill === 'expert' ? 6 : skill === 'intermediate' ? 3 : 0;
  const others = [0, 1, 2, 3].filter((i) => i !== seat && s.hands[i].length);
  for (const t of others) {
    const recalled = s.memory[t].slice(-memLen).filter((r) => ranks.includes(r));
    if (recalled.length) return { target: t, rank: recalled.at(-1) };
  }
  const counts = (r) => hand.filter((c) => c.rank === r).length;
  const rank = ranks.sort((a, b) => counts(b) - counts(a))[rng() < 0.6 ? 0 : Math.floor(rng() * ranks.length)];
  const target = others.sort((a, b) => s.hands[b].length - s.hands[a].length)[rng() < 0.6 ? 0 : Math.floor(rng() * others.length)];
  return { target, rank };
}

const HOWTO = {
  goal: 'Collect the most <b>books</b>: all four cards of one rank.',
  deal: 'Four players, five cards each; the rest of the deck is the pond. Any book you’re dealt is laid down at once. You go first.',
  play: [
    'On your turn, pick a rank you hold and ask another player for it.',
    'If they have any, they hand over all of them and you ask again.',
    'If not, <b>Go fish!</b> Draw a card from the pond. If it’s the rank you asked for, you go again; otherwise the turn passes to the left.',
    'As soon as you hold all four of a rank, the book is laid down for you.',
    'If your hand runs out, you draw five more cards (while the pond lasts).',
  ],
  score: 'The game ends when all 13 books are made. The player with the most books wins, and a tie shares the win.',
  options: {
    skill: 'how much the computer players remember about who asked for what: Beginner forgets, Intermediate remembers a little, and Expert remembers the last few asks.',
  },
  controls: '{Click} a card in your hand to choose its rank, then {click} the Ask button beside the player you want to ask.',
  tip: 'Watch the table talk: when someone asks for a rank, they’re holding it. Ask them for it as soon as you get one too.',
};

export default {
  id: 'gofish', title: 'Go Fish', version: 1, seats: 4, howto: HOWTO,
  settings: [{ key: 'skill', label: 'Computer players', options: [['beginner', 'Beginner (forgetful)'], ['intermediate', 'Intermediate'], ['expert', 'Expert (remembers asks)']], default: 'intermediate' }],
  newGame,
  actor: (s) => (s.phase === 'gameOver' ? null : s.turn),
  delay: () => 1200,
  act(state, a) {
    const s = clone(state);
    if (a.act === 'ask') {
      must(a.ids?.length === 1, 'First pick a card in your hand.');
      const card = s.hands[0].find((c) => c.id === a.ids[0]);
      must(card, 'Pick a card in your hand.');
      s.lastFish = null;
      return ask(s, 0, Number(a.target), card.rank);
    }
    if (a.act === 'again') return newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    const { target, rank } = aiChoice(s, s.turn);
    return ask(s, s.turn, target, rank);
  },
  view(s, ui) {
    const myTurn = s.phase === 'ask' && s.turn === 0;
    const sel = ui.selected.size === 1 ? s.hands[0].find((c) => c.id === [...ui.selected][0]) : null;
    let overlay = '', banner = '';
    if (s.phase === 'gameOver') {
      overlay = panel(s.winners.includes(0) ? (s.winners.length > 1 ? 'A tie, and you share the win!' : 'You win!') : `${s.winners.map((i) => s.names[i]).join(' & ')} ${s.winners.length > 1 ? 'win' : 'wins'}`,
        `${scoreTable(['Books'], s.names.map((n, i) => [i === 0 ? 'You' : n, s.books[i].length]))}<div class="row" style="justify-content:flex-end">${btn('Play again', 'again', '', true)}</div>`);
    } else if (myTurn) banner = sel ? `Ask someone for ${RANK_PLURAL(sel.rank)}` : 'Pick a card, then choose who to ask';
    else banner = `${who(s, s.turn)} is asking…`;
    const askBtn = (i) => (myTurn && s.hands[i].length ? `<button class="btn sm ${sel ? 'primary' : ''}" data-act="ask" data-target="${i}" data-with-sel ${sel ? '' : 'disabled'}>Ask ${s.names[i]}</button>` : '');
    const center = `<div class="pile" style="--card-w:70px">${s.stock.length ? backHTML() : '<span class="empty-slot">Empty</span>'}<span>The pond · ${s.stock.length} cards</span>
      ${s.lastFish ? '<span>You fished a card.</span>' : ''}</div>`;
    return {
      subtitle: `${s.books.flat().length} of 13 books made`,
      scores: s.names.map((n, i) => ({ label: i === 0 ? 'You' : n, value: `${s.books[i].length} books`, us: i === 0 })),
      seats: seatsVM(s, 4, (i) => ({ partner: false, tag: `${s.books[i].length} books`, extra: i ? askBtn(i) : '' })),
      hand: { cards: s.hands[0], legal: myTurn ? s.hands[0].map((c) => c.id) : [], mode: 'select', maxSelect: 1 },
      center, banner, overlay,
      side: [{ title: 'Books', html: s.names.map((n, i) => `<div>${i === 0 ? 'You' : n}: ${s.books[i].length ? s.books[i].map((r) => r).join(' ') : '—'}</div>`).join('') }],
    };
  },
};
