// Crazy Eights (2–4 players). Match suit or rank; eights are wild. "Very crazy" adds
// J = skip, K = reverse, 2 = draw two (stackable), red Q = draw five and skip.
import { deck, shuffle, sortCards, rngOf, SUIT_TITLE, pipValue, SYM } from '../core/cards.js';
import { clone, log, fx, who, must, posFor, suitSpan } from './lib/common.js';
import { panel, btn, scoreTable } from '../core/table.js';
import { cardHTML, backHTML } from '../skin.js';

const pts = (c) => (c.rank === '8' ? 50 : ['J', 'Q', 'K'].includes(c.rank) ? 10 : pipValue(c));
const redQ = (c) => c.rank === 'Q' && (c.suit === 'H' || c.suit === 'D');

function deal(s) {
  const rng = rngOf(s);
  s.handNo++;
  let d = shuffle(deck(), rng);
  const per = s.n === 2 ? 7 : 5;
  s.hands = Array.from({ length: s.n }, (_, i) => sortCards(d.slice(i * per, i * per + per)));
  d = d.slice(s.n * per);
  // Starter can't be an 8.
  let k = d.findIndex((c) => c.rank !== '8');
  s.discard = [d[k]]; d.splice(k, 1);
  s.stock = d; s.suit = s.discard[0].suit;
  s.dir = 1; s.pendingDraw = 0; s.turn = (s.dealer + 1) % s.n; s.dealer = (s.dealer + 1) % s.n;
  s.phase = 'play'; s.drewThisTurn = 0; s.result = null;
  fx(s, 'shuffle');
  log(s, `Hand ${s.handNo}: the starter is the ${s.discard[0].rank}${SYM[s.suit]}.`);
  return s;
}

const top = (s) => s.discard.at(-1);
export function canPlay(s, c) {
  if (s.pendingDraw) return c.rank === '2';
  return c.rank === '8' || c.suit === s.suit || c.rank === top(s).rank;
}
const nextSeat = (s, from, steps = 1) => (((from + s.dir * steps) % s.n) + s.n) % s.n;

function drawOne(s, seat) {
  if (!s.stock.length) {
    if (s.opts.reshuffle === 'yes' && s.discard.length > 1) {
      const keep = s.discard.pop();
      s.stock = shuffle(s.discard, rngOf(s)); s.discard = [keep];
      log(s, 'The discards are reshuffled into a new stock.');
      fx(s, 'shuffle');
    } else return false;
  }
  s.hands[seat] = sortCards([...s.hands[seat], s.stock.pop()]);
  fx(s, 'deal');
  return true;
}

function endTurn(s, seat, card) {
  if (!s.hands[seat].length) return finish(s, seat);
  let skip = 0;
  if (card && s.opts.variant === 'very') {
    if (card.rank === 'J') { skip = 1; log(s, `${who(s, nextSeat(s, seat))} ${nextSeat(s, seat) === 0 ? 'are' : 'is'} skipped.`); }
    if (card.rank === 'K' && s.n > 2) { s.dir *= -1; log(s, 'Direction reversed.'); }
    if (card.rank === 'K' && s.n === 2) skip = 1;
    if (card.rank === '2') s.pendingDraw += 2;
    if (redQ(card)) {
      const victim = nextSeat(s, seat);
      for (let i = 0; i < 5; i++) drawOne(s, victim);
      log(s, `${who(s, victim)} ${victim === 0 ? 'draw' : 'draws'} five and ${victim === 0 ? 'are' : 'is'} skipped.`);
      skip = 1;
    }
  }
  s.turn = nextSeat(s, seat, 1 + skip);
  s.drewThisTurn = 0;
  if (blocked(s)) return finish(s, null);
  return s;
}

function blocked(s) {
  if (s.stock.length || (s.opts.reshuffle === 'yes' && s.discard.length > 1)) return false;
  return s.hands.every((h) => !h.some((c) => canPlay(s, c))) && !s.pendingDraw;
}

function play(s, seat, id, suit) {
  must(s.phase === 'play' && s.turn === seat, 'Not your turn.');
  const card = s.hands[seat].find((c) => c.id === id);
  must(card, 'Card not in hand.');
  must(canPlay(s, card), s.pendingDraw ? 'Play a 2 or draw the penalty cards.' : `Match ${SUIT_TITLE[s.suit]} or a ${top(s).rank}, or play an 8.`);
  s.hands[seat] = s.hands[seat].filter((c) => c.id !== id);
  s.discard.push(card);
  fx(s, 'card');
  if (card.rank === '8') {
    if (seat === 0 && !suit) { s.phase = 'chooseSuit'; return s; }
    s.suit = suit; log(s, `${who(s, seat)} ${seat === 0 ? 'play' : 'plays'} an 8 and ${seat === 0 ? 'call' : 'calls'} ${SUIT_TITLE[suit]}.`);
  } else s.suit = card.suit;
  return endTurn(s, seat, card);
}

function draw(s, seat) {
  must(s.phase === 'play' && s.turn === seat, 'Not your turn.');
  if (s.pendingDraw) {
    const n = s.pendingDraw; s.pendingDraw = 0;
    for (let i = 0; i < n; i++) drawOne(s, seat);
    log(s, `${who(s, seat)} ${seat === 0 ? 'draw' : 'draws'} ${n}.`);
    return endTurn(s, seat, null);
  }
  if (!drawOne(s, seat)) { log(s, `${who(s, seat)} can't draw and ${seat === 0 ? 'pass' : 'passes'}.`); return endTurn(s, seat, null); }
  s.drewThisTurn++;
  return s;
}

function finish(s, outSeat) {
  const handPts = s.hands.map((h) => h.reduce((t, c) => t + pts(c), 0));
  const gain = Array(s.n).fill(0);
  if (outSeat !== null) gain[outSeat] = handPts.reduce((a, b) => a + b, 0);
  s.scores = s.scores.map((v, i) => v + gain[i]);
  s.result = { outSeat, gain };
  log(s, outSeat === null ? 'Blocked: nobody can play.' : `${who(s, outSeat)} ${outSeat === 0 ? 'go' : 'goes'} out!`);
  const target = s.opts.target;
  const over = target === 0 || Math.max(...s.scores) >= target;
  s.phase = over ? 'gameOver' : 'handOver';
  if (over) s.gameWinner = target === 0 ? outSeat : s.scores.indexOf(Math.max(...s.scores));
  fx(s, over ? (s.gameWinner === 0 ? 'win' : 'lose') : 'score');
  s.turn = null;
  return s;
}

function bestSuit(hand) {
  const c = { S: 0, H: 0, C: 0, D: 0 };
  hand.filter((x) => x.rank !== '8').forEach((x) => c[x.suit]++);
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

function aiTurn(s, seat) {
  const hand = s.hands[seat];
  const playable = hand.filter((c) => canPlay(s, c));
  if (!playable.length) return draw(s, seat);
  const non8 = playable.filter((c) => c.rank !== '8');
  const counts = (su) => hand.filter((c) => c.suit === su).length;
  const pick = non8.length ? non8.sort((a, b) => counts(b.suit) - counts(a.suit) || pts(b) - pts(a))[0] : playable[0];
  return play(s, seat, pick.id, pick.rank === '8' ? bestSuit(hand.filter((c) => c.id !== pick.id)) : undefined);
}

const RULES = `<p>Get rid of all your cards. On your turn, play a card that matches the top card's <b>suit or rank</b>, or play an <b>8</b> (wild) and call a suit. Otherwise draw until you can play. You may draw even if you could play.</p>
<h3>Very Crazy Eights</h3><ul><li>Jack: skip the next player.</li><li>King: reverse direction.</li><li>2: the next player draws two unless they play a 2 (which passes four on, and so on).</li><li>Red queen: the next player draws five and is skipped.</li></ul>
<h3>Scoring</h3><p>The player who goes out scores the cards left in everyone else's hands: 8s are 50, face cards 10, others their number.</p>`;

export default {
  id: 'crazy8', title: 'Crazy Eights', version: 1, rulesHTML: RULES,
  settings: [
    { key: 'players', label: 'Players', options: [[2, 'You + 1'], [3, 'You + 2'], [4, 'You + 3']], default: 4 },
    { key: 'variant', label: 'Game type', options: [['normal', 'Crazy Eights'], ['very', 'Very Crazy Eights']], default: 'normal' },
    { key: 'target', label: 'Play to', options: [[0, 'Single hand'], [100, '100 points'], [200, '200 points'], [300, '300 points'], [400, '400 points']], default: 100 },
    { key: 'reshuffle', label: 'When the stock runs out', options: [['yes', 'Reshuffle the discards'], ['no', 'Game ends when blocked']], default: 'yes' },
  ],
  newGame({ names, seed, opts }) {
    const n = Number(opts.players);
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, n), n, opts, scores: Array(n).fill(0), handNo: 0, dealer: n - 1, log: [], fx: [], partners: false });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'handOver' || s.phase === 'chooseSuit') return 0;
    return s.turn;
  },
  delay: () => 800,
  act(state, a) {
    const s = clone(state);
    if (a.act === 'play') return play(s, 0, a.id);
    if (a.act === 'draw') return draw(s, 0);
    if (a.act === 'suit') {
      must(s.phase === 'chooseSuit', 'No suit to choose.');
      s.phase = 'play'; s.suit = a.suit;
      log(s, `You call ${SUIT_TITLE[a.suit]}.`);
      return endTurn(s, 0, top(s));
    }
    if (a.act === 'next') return deal(s);
    if (a.act === 'again') return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'handOver') return deal(s);
    if (s.phase === 'chooseSuit') { s.phase = 'play'; s.suit = bestSuit(s.hands[0]); return endTurn(s, 0, top(s)); }
    return aiTurn(s, s.turn);
  },
  view(s) {
    const myTurn = s.phase === 'play' && s.turn === 0;
    let overlay = '', banner = '';
    if (s.phase === 'chooseSuit') overlay = panel('Call a suit', `<div class="row">${['S', 'H', 'C', 'D'].map((x) => btn(`${suitSpan(x)} ${SUIT_TITLE[x]}`, 'suit', `data-suit="${x}"`)).join('')}</div>`);
    else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      overlay = panel(s.phase === 'gameOver' ? (s.gameWinner === 0 ? 'You win!' : `${who(s, s.gameWinner)} wins`) : (r.outSeat === null ? 'Blocked hand' : `${who(s, r.outSeat)} went out`),
        `${scoreTable(s.names.map((n, i) => (i === 0 ? 'You' : n)), [['This hand', ...r.gain], ['Score', ...s.scores.map((v) => `<b>${v}</b>`)]])}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next hand', 'next', '', true)}</div>`);
    } else if (myTurn) banner = s.pendingDraw ? `Play a 2 or draw ${s.pendingDraw}` : `Match ${SYM[s.suit]} or ${top(s).rank}, play an 8, or draw`;
    else banner = `${who(s, s.turn)} to play`;
    const center = `<div class="row" style="gap:28px;--card-w:84px">
      <div class="pile"><button class="pile-btn" data-act="draw" ${myTurn ? '' : 'disabled'} aria-label="Draw a card">${s.stock.length ? backHTML() : '<span class="empty-slot">Empty</span>'}</button><span>${myTurn ? (s.pendingDraw ? `Draw ${s.pendingDraw}` : 'Draw') : 'Stock'} · ${s.stock.length}</span></div>
      <div class="pile">${cardHTML(top(s))}<span>Suit: ${suitSpan(s.suit)} ${SUIT_TITLE[s.suit]}</span></div></div>`;
    return {
      subtitle: `${s.opts.variant === 'very' ? 'Very Crazy' : 'Classic'} · ${s.opts.target ? `to ${s.opts.target}` : 'single hand'}`,
      scores: s.opts.target ? s.names.map((n, i) => ({ label: i === 0 ? 'You' : n, value: s.scores[i], us: i === 0 })) : [],
      seats: Array.from({ length: s.n }, (_, i) => ({ seat: i, pos: posFor(s.n, i), name: s.names[i], mine: i === 0, turn: s.turn === i, count: i ? s.hands[i].length : 0, tag: i ? `${s.hands[i].length} cards` : '' })),
      hand: { cards: s.hands[0], legal: myTurn ? s.hands[0].filter((c) => canPlay(s, c)).map((c) => c.id) : null },
      center, banner, overlay,
      side: [{ title: 'Direction', html: s.n > 2 ? (s.dir === 1 ? 'Clockwise' : 'Counter-clockwise') : 'Two players' }],
    };
  },
};
