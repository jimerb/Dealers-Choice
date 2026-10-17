// Spades: partners (you + North vs West + East). Spades are always trump. Bid tricks, nil or blind nil.
import { deck, shuffle, sortCards, hi, rngOf } from '../core/cards.js';
import { clone, log, fx, who, trickWinner, followSuit, followPlay, seatsVM, trickPlays, must, POS4 } from './lib/common.js';
import { trickHTML, panel, btn, scoreTable } from '../core/table.js';

const team = (seat) => seat % 2;

function deal(s) {
  const rng = rngOf(s);
  s.handNo++; s.dealer = (s.dealer + 1) % 4;
  const d = shuffle(deck(), rng);
  s.hands = [0, 1, 2, 3].map((i) => sortCards(d.slice(i * 13, i * 13 + 13), { desc: false }));
  s.bids = [null, null, null, null]; s.blind = [false, false, false, false];
  s.tricks = [0, 0, 0, 0]; s.trick = []; s.trickNo = 0; s.broken = false; s.result = null;
  s.turn = (s.dealer + 1) % 4;
  s.phase = 'bid'; s.seen = false;
  fx(s, 'shuffle');
  log(s, `Hand ${s.handNo}: ${s.names[s.dealer]} deals.`);
  return s;
}

/** Estimated tricks for a hand (used for AI bids). */
export function estimate(hand) {
  let t = 0;
  const bySuit = (su) => hand.filter((c) => c.suit === su);
  for (const su of ['H', 'C', 'D']) {
    const cs = bySuit(su), r = new Set(cs.map((c) => c.rank));
    if (r.has('A')) t += cs.length <= 6 ? 1 : 0.6;
    if (r.has('K') && cs.length >= 2) t += cs.length <= 5 ? 0.8 : 0.4;
    if (r.has('Q') && cs.length >= 3 && cs.length <= 4) t += 0.3;
  }
  const sp = bySuit('S');
  for (const c of sp) { const v = hi(c); if (v === 14) t += 1; else if (v === 13) t += sp.length >= 2 ? 0.9 : 0.5; else if (v === 12) t += sp.length >= 3 ? 0.7 : 0.2; }
  t += Math.max(0, sp.length - 3) * 0.85;
  for (const su of ['H', 'C', 'D']) if (sp.length >= 3 && bySuit(su).length <= 1) t += bySuit(su).length === 0 ? 0.8 : 0.4;
  return t;
}

function aiBid(s, seat) {
  const hand = s.hands[seat];
  const est = estimate(hand);
  const highSpades = hand.filter((c) => c.suit === 'S' && hi(c) >= 12).length;
  const partnerBid = s.bids[(seat + 2) % 4];
  if (est < 1.3 && highSpades === 0 && hand.filter((c) => hi(c) >= 12).length <= 2 && partnerBid !== 0) return 0;
  return Math.max(1, Math.min(13, Math.round(est)));
}

function bid(s, seat, n, blind = false) {
  must(s.phase === 'bid' && s.turn === seat, 'Not your turn to bid.');
  must(Number.isInteger(n) && n >= 0 && n <= 13, 'Bid 0 to 13 tricks.');
  s.bids[seat] = n; s.blind[seat] = blind;
  fx(s, 'bid');
  log(s, `${who(s, seat)} ${seat === 0 ? 'bid' : 'bids'} ${n === 0 ? (blind ? 'blind nil' : 'nil') : n}.`);
  if (s.bids.every((b) => b !== null)) { s.phase = 'play'; s.turn = (s.dealer + 1) % 4; s.seen = true; }
  else s.turn = (seat + 1) % 4;
  return s;
}

export function legal(s, seat) {
  const hand = s.hands[seat];
  if (!s.trick.length) {
    const non = hand.filter((c) => c.suit !== 'S');
    return s.broken || !non.length ? hand.slice() : non;
  }
  return followSuit(hand, s.trick);
}

function play(s, seat, id) {
  const card = s.hands[seat].find((c) => c.id === id);
  must(card, 'Card not in hand.');
  must(legal(s, seat).some((c) => c.id === id), s.trick.length ? 'You must follow suit.' : "Spades haven't been broken yet.");
  s.hands[seat] = s.hands[seat].filter((c) => c.id !== id);
  s.trick.push({ seat, card });
  if (card.suit === 'S') s.broken = true;
  fx(s, 'card');
  if (s.trick.length === 4) { s.phase = 'trickDone'; s.turn = null; s.winner = s.trick[trickWinner(s.trick, 'S')].seat; }
  else s.turn = (seat + 1) % 4;
  return s;
}

function collect(s) {
  const w = s.winner;
  s.tricks[w]++; s.trickNo++; s.trick = [];
  log(s, `${who(s, w)} ${w === 0 ? 'take' : 'takes'} the trick.`);
  fx(s, 'trick');
  if (s.trickNo === 13) return score(s);
  s.phase = 'play'; s.turn = w;
  return s;
}

function score(s) {
  const per = [0, 1].map((t) => {
    const seats = [t, t + 2];
    let pts = 0, bags = 0;
    const notes = [];
    let contract = 0, made = 0;
    for (const p of seats) {
      if (s.bids[p] === 0) {
        const v = s.blind[p] ? 200 : 100;
        if (s.tricks[p] === 0) { pts += v; notes.push(`${who(s, p)}: ${s.blind[p] ? 'blind ' : ''}nil made +${v}`); }
        else { pts -= v; bags += s.tricks[p]; notes.push(`${who(s, p)}: nil set −${v}`); }
      } else { contract += s.bids[p]; made += s.tricks[p]; }
    }
    if (contract > 0) {
      if (made >= contract) { pts += contract * 10 + (made - contract); bags += made - contract; notes.push(`Bid ${contract}, took ${made}: +${contract * 10 + made - contract}`); }
      else { pts -= contract * 10; notes.push(`Bid ${contract}, took ${made}: set −${contract * 10}`); }
    }
    return { pts, bags, notes };
  });
  for (const t of [0, 1]) {
    s.scores[t] += per[t].pts;
    s.bags[t] += per[t].bags;
    if (s.bags[t] >= 10) { s.bags[t] -= 10; s.scores[t] -= 100; per[t].notes.push('10 bags: −100'); }
  }
  s.result = per;
  const { win, lose } = s.opts;
  const done = s.scores.some((v) => v >= win || v <= lose);
  if (done && s.scores[0] !== s.scores[1]) {
    s.phase = 'gameOver';
    const ok = (t) => s.scores[t] > lose;
    s.winnerTeam = ok(0) && !ok(1) ? 0 : ok(1) && !ok(0) ? 1 : s.scores[0] > s.scores[1] ? 0 : 1;
    fx(s, s.winnerTeam === 0 ? 'win' : 'lose');
  } else { s.phase = 'handOver'; fx(s, 'score'); }
  s.turn = null;
  return s;
}

function aiPlay(s, seat) {
  const L = legal(s, seat);
  if (L.length === 1) return L[0].id;
  const myNil = s.bids[seat] === 0;
  const p = (seat + 2) % 4;
  const t = s.trick;
  const teamTricks = s.tricks[seat] + s.tricks[p];
  const need = (s.bids[seat] || 0) + (s.bids[p] || 0) - teamTricks;
  if (myNil) {
    // Try to lose: highest card that won't win, else lowest.
    if (!t.length) return L.slice().sort((a, b) => hi(a) - hi(b))[0].id;
    const losing = L.filter((c) => trickWinner([...t, { seat, card: c }], 'S') !== t.length);
    return (losing.length ? losing.sort((a, b) => hi(b) - hi(a)) : L.slice().sort((a, b) => hi(a) - hi(b)))[0].id;
  }
  if (!t.length) {
    const aces = L.filter((c) => c.suit !== 'S' && c.rank === 'A');
    if (aces.length) return aces[0].id;
    const side = L.filter((c) => c.suit !== 'S');
    if (side.length) return side.sort((a, b) => hi(a) - hi(b))[0].id;
    return L.sort((a, b) => hi(b) - hi(a))[0].id;
  }
  const partnerNil = s.bids[p] === 0;
  if (need <= 0 && !partnerNil) {
    // Contract made: duck to avoid bags.
    const losing = L.filter((c) => trickWinner([...t, { seat, card: c }], 'S') !== t.length);
    if (losing.length) return losing.sort((a, b) => hi(b) - hi(a))[0].id;
  }
  return followPlay(L, t, seat, 'S', { partnerOf: partnerNil ? null : p }).id;
}

const RULES = `<p>Partners sit across: you and North against West and East. Spades are always trump. Each player bids how many tricks they'll take; a team must take at least its combined bid.</p>
<h3>Play</h3><p>Follow suit if you can, otherwise trump or discard. Spades can't be led until one has been played.</p>
<h3>Scoring</h3><ul><li>Made bid: 10 per trick bid, plus 1 per extra trick (a "bag").</li><li>Set: −10 per trick bid.</li><li>Nil (take no tricks): ±100. Blind nil (bid before seeing your cards): ±200.</li><li>Every 10 bags costs 100 points.</li></ul>`;

export default {
  id: 'spades', title: 'Spades', version: 1, seats: 4, rulesHTML: RULES,
  settings: [
    { key: 'win', label: 'Winning score', options: [[250, '250'], [500, '500'], [750, '750'], [1000, '1,000']], default: 500 },
    { key: 'lose', label: 'Losing score', options: [[-100, '−100'], [-200, '−200'], [-300, '−300'], [-400, '−400']], default: -300 },
  ],
  newGame({ names, seed, opts }) {
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, scores: [0, 0], bags: [0, 0], handNo: 0, dealer: 3, log: [], fx: [] });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'trickDone') return 'auto';
    if (s.phase === 'handOver') return 0;
    return s.turn;
  },
  delay: (s) => (s.phase === 'trickDone' ? 1100 : s.phase === 'bid' ? 900 : 650),
  act(state, a) {
    const s = clone(state);
    if (a.act === 'show') { must(s.phase === 'bid', 'Bidding is over.'); s.seen = true; return s; }
    if (a.act === 'bid') return bid(s, 0, Number(a.v), a.blind === '1');
    if (a.act === 'play') { must(s.phase === 'play' && s.turn === 0, 'Wait for your turn.'); return play(s, 0, a.id); }
    if (a.act === 'next') { must(s.phase === 'handOver', 'Hand not over.'); return deal(s); }
    if (a.act === 'again') return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'trickDone') return collect(s);
    if (s.phase === 'handOver') return deal(s);
    if (s.phase === 'bid') return bid(s, s.turn, aiBid(s, s.turn));
    return play(s, s.turn, aiPlay(s, s.turn));
  },
  view(s) {
    let overlay = '', banner = '';
    const myBidTurn = s.phase === 'bid' && s.turn === 0;
    if (myBidTurn && !s.seen) {
      overlay = panel('Your bid', `<p>Want to bid <b>blind nil</b> before looking at your cards? It scores ±200.</p>
        <div class="row">${btn('Blind nil', 'bid', 'data-v="0" data-blind="1"')}${btn('Show my hand', 'show', '', true)}</div>`);
    } else if (myBidTurn) {
      const pb = s.bids[2];
      overlay = panel('Your bid', `<p>${pb === null ? 'North hasn’t bid yet.' : `North bid ${pb === 0 ? 'nil' : pb}.`} How many tricks will you take?</p>
        <div class="row" style="max-width:420px">${btn('Nil', 'bid', 'data-v="0"')}${Array.from({ length: 13 }, (_, i) => btn(String(i + 1), 'bid', `data-v="${i + 1}"`, i + 1 === Math.max(1, Math.round(estimate(s.hands[0]))))).join('')}</div>`);
    } else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      const title = s.phase === 'gameOver' ? (s.winnerTeam === 0 ? 'You and North win!' : 'West and East win') : `Hand ${s.handNo}`;
      overlay = panel(title, `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;font-size:14px">
        <div><b>Us</b><br>${r[0].notes.join('<br>')}</div><div><b>Them</b><br>${r[1].notes.join('<br>')}</div></div>
        ${scoreTable(['Us', 'Them'], [['This hand', r[0].pts, r[1].pts], ['Bags', s.bags[0], s.bags[1]], ['Score', `<b>${s.scores[0]}</b>`, `<b>${s.scores[1]}</b>`]])}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next hand', 'next', '', true)}</div>`);
    } else if (s.phase === 'trickDone') banner = `${who(s, s.winner)} ${s.winner === 0 ? 'take' : 'takes'} it`;
    else if (s.phase === 'bid') banner = `${who(s, s.turn)} is bidding…`;
    else banner = s.turn === 0 ? (s.trick.length ? 'Your turn: follow suit' : 'Your lead') : `${who(s, s.turn)} to play`;
    const tag = (i) => (s.bids[i] === null ? '' : `${s.tricks[i]}/${s.bids[i] === 0 ? (s.blind[i] ? 'BN' : 'Nil') : s.bids[i]}`);
    const showHand = s.seen || s.phase !== 'bid';
    return {
      subtitle: `Hand ${s.handNo} · to ${s.opts.win}`,
      scores: [{ label: 'Us', value: `${s.scores[0]} (${s.bags[0]} bags)`, us: true }, { label: 'Them', value: `${s.scores[1]} (${s.bags[1]} bags)` }],
      seats: seatsVM(s, 4, (i) => ({ tag: tag(i) })),
      hand: showHand ? { cards: s.hands[0], legal: s.phase === 'play' && s.turn === 0 ? legal(s, 0).map((c) => c.id) : null } : { cards: [] },
      center: trickHTML(trickPlays(s, 4), s.phase === 'trickDone' ? POS4[s.winner] : null),
      banner, overlay,
      side: [{ title: 'Contracts', html: scoreTable(['Bid', 'Took'], [0, 1, 2, 3].map((i) => [i === 0 ? 'You' : s.names[i], s.bids[i] === null ? '–' : s.bids[i] === 0 ? 'Nil' : s.bids[i], s.tricks[i]])) }],
    };
  },
};
