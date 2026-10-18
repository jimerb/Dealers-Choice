// Pitch (cutthroat, 4 players): bid 2/3/4/Smudge; points for High, Low, Jack and Game.
import { deck, shuffle, sortCards, hi, rngOf, SUIT_TITLE } from '../core/cards.js';
import { clone, log, fx, who, trickWinner, seatsVM, must, POS4 } from './lib/common.js';
import { trickHTML, panel, btn, scoreTable } from '../core/table.js';

const GAMEPTS = { 10: 10, A: 4, K: 3, Q: 2, J: 1 };
const gp = (c) => GAMEPTS[c.rank] ?? 0;
const BIDNAME = { 2: '2', 3: '3', 4: '4', 5: 'Smudge' };

function deal(s) {
  const rng = rngOf(s);
  s.handNo++; s.dealer = (s.dealer + 1) % 4;
  const d = shuffle(deck(), rng);
  s.hands = [0, 1, 2, 3].map((i) => sortCards(d.slice(i * 6, i * 6 + 6)));
  s.bids = [null, null, null, null]; s.high = 0; s.pitcher = null; s.trump = null;
  s.phase = 'bid'; s.turn = (s.dealer + 1) % 4; s.bidCount = 0;
  s.trick = []; s.trickNo = 0; s.taken = [[], [], [], []]; s.tricks = [0, 0, 0, 0]; s.result = null;
  fx(s, 'shuffle');
  log(s, `Hand ${s.handNo}: ${s.names[s.dealer]} deals.`);
  return s;
}

function bid(s, seat, v) {
  must(s.phase === 'bid' && s.turn === seat, 'Not your turn to bid.');
  if (v !== 'pass') {
    v = Number(v);
    must(v >= 2 && v <= 5 && v > s.high, `Bid more than ${s.high || 1}.`);
    s.high = v; s.pitcher = seat; s.bids[seat] = v;
    log(s, `${who(s, seat)} ${seat === 0 ? 'bid' : 'bids'} ${BIDNAME[v]}.`);
    fx(s, 'bid');
  } else { s.bids[seat] = 'pass'; log(s, `${who(s, seat)} ${seat === 0 ? 'pass' : 'passes'}.`); fx(s, 'pass'); }
  s.bidCount++;
  if (s.bidCount === 4) {
    if (s.pitcher === null) { log(s, 'Everyone passed: redeal.'); s.dealer = (s.dealer + 3) % 4; s.handNo--; return deal(s); }
    s.phase = 'play'; s.turn = s.pitcher;
    log(s, `${who(s, s.pitcher)} ${s.pitcher === 0 ? 'are' : 'is'} the pitcher; the first card played sets trump.`);
  } else s.turn = (seat + 1) % 4;
  return s;
}

export function legal(s, seat) {
  const hand = s.hands[seat];
  if (!s.trick.length) return hand.slice();
  const led = s.trick[0].card.suit;
  const f = hand.filter((c) => c.suit === led || c.suit === s.trump);
  return hand.some((c) => c.suit === led) ? f : hand.slice();
}

function play(s, seat, id) {
  const card = s.hands[seat].find((c) => c.id === id);
  must(card, 'Card not in hand.');
  must(legal(s, seat).some((c) => c.id === id), 'Follow suit or play trump.');
  if (s.trump === null) { s.trump = card.suit; log(s, `Trump is ${SUIT_TITLE[card.suit]}.`); s.hands = s.hands.map((h) => sortCards(h, { trump: s.trump })); }
  s.hands[seat] = s.hands[seat].filter((c) => c.id !== id);
  s.trick.push({ seat, card });
  fx(s, 'card');
  if (s.trick.length === 4) { s.phase = 'trickDone'; s.turn = null; s.winner = s.trick[trickWinner(s.trick, s.trump)].seat; }
  else s.turn = (seat + 1) % 4;
  return s;
}

function collect(s) {
  const w = s.winner;
  s.taken[w].push(...s.trick.map((p) => p.card)); s.tricks[w]++;
  s.trick = []; s.trickNo++;
  fx(s, 'trick');
  log(s, `${who(s, w)} ${w === 0 ? 'take' : 'takes'} the trick.`);
  if (s.trickNo === 6) return score(s);
  s.phase = 'play'; s.turn = w;
  return s;
}

function score(s) {
  const tr = s.trump;
  const all = s.taken.flatMap((cards, seat) => cards.map((c) => ({ c, seat })));
  const trumps = all.filter((x) => x.c.suit === tr);
  const highW = trumps.reduce((a, b) => (hi(b.c) > hi(a.c) ? b : a)).seat;
  const lowW = trumps.reduce((a, b) => (hi(b.c) < hi(a.c) ? b : a)).seat;
  const jack = trumps.find((x) => x.c.rank === 'J');
  const gameTot = s.taken.map((cards) => cards.reduce((t, c) => t + gp(c), 0));
  const best = Math.max(...gameTot);
  const gameW = gameTot.filter((g) => g === best).length === 1 ? gameTot.indexOf(best) : null;
  const awards = [['High', highW], ['Low', lowW], ['Jack', jack ? jack.seat : null], ['Game', gameW]];
  const pitcherGot = awards.filter(([, w]) => w === s.pitcher).length;
  const smudgeMade = s.high === 5 && pitcherGot === 4 && s.tricks[s.pitcher] === 6;
  const made = s.high === 5 ? smudgeMade : pitcherGot >= s.high;
  const delta = [0, 0, 0, 0];
  let winner = null;
  const target = s.opts.target;
  const apply = (seat, v) => { if (winner !== null) return; delta[seat] += v; if (s.scores[seat] + delta[seat] >= target) winner = seat; };
  for (const [, w] of awards) {
    if (w === null) continue;
    if (w === s.pitcher && !made) continue;
    apply(w, 1);
  }
  if (made && s.high === 5) apply(s.pitcher, 1);
  if (!made) delta[s.pitcher] -= s.high;
  s.scores = s.scores.map((v, i) => v + delta[i]);
  s.result = { awards, made, delta, gameTot };
  log(s, made ? `${who(s, s.pitcher)} made ${BIDNAME[s.high]}.` : `${who(s, s.pitcher)} ${s.pitcher === 0 ? 'are' : 'is'} set back ${s.high}.`);
  if (winner === null && Math.max(...s.scores) >= target) winner = s.scores.indexOf(Math.max(...s.scores));
  if (winner !== null) { s.phase = 'gameOver'; s.gameWinner = winner; fx(s, winner === 0 ? 'win' : 'lose'); }
  else { s.phase = 'handOver'; fx(s, 'score'); }
  s.turn = null;
  return s;
}

function estimate(hand, su) {
  const t = hand.filter((c) => c.suit === su);
  if (!t.length) return 0;
  let e = 0;
  const top = Math.max(...t.map(hi));
  if (top === 14) e += 1; else if (top === 13) e += 0.6; else if (top === 12) e += 0.3;
  if (t.some((c) => c.rank === 'J')) e += 0.75;
  const bottom = Math.min(...t.map(hi));
  if (bottom <= 3) e += 0.7; else if (bottom <= 5) e += 0.35;
  e += Math.min(0.8, hand.filter((c) => c.rank === '10' || c.rank === 'A').length * 0.2) + (t.length >= 3 ? 0.4 : 0);
  return e;
}

function aiBid(s, seat) {
  const est = Math.max(...['S', 'H', 'C', 'D'].map((su) => estimate(s.hands[seat], su)));
  let b = Math.floor(est + 0.4);
  if (s.dealer === seat && s.high === 0 && s.bidCount === 3) b = Math.max(b, 2); // dealer opens a dead hand
  return b >= 2 && b > s.high ? Math.min(b, 4) : 'pass';
}

function aiPlay(s, seat) {
  const L = legal(s, seat);
  if (L.length === 1) return L[0].id;
  if (s.trump === null) {
    let best = null;
    for (const su of ['S', 'H', 'C', 'D']) { const e = estimate(s.hands[seat], su); if (!best || e > best.e) best = { su, e }; }
    return L.filter((c) => c.suit === best.su).sort((a, b) => hi(b) - hi(a))[0].id;
  }
  const t = s.trick;
  if (!t.length) {
    const tr = L.filter((c) => c.suit === s.trump);
    if (seat === s.pitcher && tr.length && hi(tr.sort((a, b) => hi(b) - hi(a))[0]) >= 13) return tr[0].id;
    const side = L.filter((c) => c.suit !== s.trump && !gp(c));
    return (side.length ? side : L).slice().sort((a, b) => hi(a) - hi(b))[0].id;
  }
  const wins = (c) => trickWinner([...t, { seat, card: c }], s.trump) === t.length;
  const valuable = t.some((p) => gp(p.card) >= 3 || (p.card.suit === s.trump && p.card.rank === 'J'));
  const w = L.filter(wins);
  if (w.length && (valuable || t.length === 3)) return w.sort((a, b) => hi(a) - hi(b))[0].id;
  const losers = L.filter((c) => !wins(c) && !gp(c) && !(c.suit === s.trump && (c.rank === 'J' || hi(c) <= 3)));
  return (losers.length ? losers : L).slice().sort((a, b) => hi(a) - hi(b))[0].id;
}

const HOWTO = {
  goal: 'Be the first to the winning score (11 by default) by taking the points for High, Low, Jack and Game.',
  deal: 'Four players, each for themselves. Each gets six cards; the rest of the deck isn’t used that hand.',
  play: [
    '<b>Bidding</b> goes once around, starting left of the dealer: bid 2, 3, 4 or <b>Smudge</b> (all four points and all six tricks), or pass. Each bid must be higher than the last. If everyone passes, the cards are redealt.',
    'The high bidder, the <b>pitcher</b>, leads first, and the suit of that card becomes <b>trump</b>.',
    'If you can follow suit, you must play either that suit or a trump: you may always trump. If you can’t follow, play anything.',
    'The highest trump wins the trick, or else the highest card of the suit led. The winner leads next.',
  ],
  score: [
    '<b>High</b>: 1 point for taking the highest trump in play. <b>Low</b>: 1 for taking the lowest trump in play. <b>Jack</b>: 1 for taking the jack of trump, if it was dealt. <b>Game</b>: 1 for the most card points in your tricks (10s are 10, aces 4, kings 3, queens 2, jacks 1); a tie gives it to nobody.',
    'The pitcher must win at least as many points as the bid. Otherwise they’re <b>set back</b>: they lose the bid amount and score nothing that hand. A Smudge that’s made is worth 5.',
    'Points are counted in order: High, Low, Jack, Game. The first player to reach the winning score wins, even if someone else would have passed it later in the count.',
  ],
  options: {
    target: 'play to 7, 11 or 21 points.',
  },
  controls: 'When it’s your bid, {click} Pass or a bid. To play, {click} a highlighted card.',
  tip: 'Bid on a long suit with the ace or a very low card in it: High and Low are the points you can count on.',
};

export default {
  id: 'pitch', title: 'Pitch', version: 1, seats: 4, howto: HOWTO,
  settings: [{ key: 'target', label: 'Winning score', options: [[7, '7'], [11, '11'], [21, '21']], default: 11 }],
  newGame({ names, seed, opts }) {
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, scores: [0, 0, 0, 0], handNo: 0, dealer: 3, log: [], fx: [], partners: false });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'trickDone') return 'auto';
    if (s.phase === 'handOver') return 0;
    return s.turn;
  },
  delay: (s) => (s.phase === 'trickDone' ? 1100 : 800),
  act(state, a) {
    const s = clone(state);
    if (a.act === 'bid') return bid(s, 0, a.v);
    if (a.act === 'play') { must(s.phase === 'play' && s.turn === 0, 'Wait for your turn.'); return play(s, 0, a.id); }
    if (a.act === 'next') return deal(s);
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
    if (s.phase === 'bid' && s.turn === 0) {
      overlay = panel('Your bid', `<p>${s.high ? `High bid: ${BIDNAME[s.high]} by ${who(s, s.pitcher)}.` : 'No bids yet.'}${s.dealer === 0 ? ' You are the dealer and bid last.' : ''}</p>
        <div class="row">${btn('Pass', 'bid', 'data-v="pass"')}${[2, 3, 4, 5].filter((v) => v > s.high).map((v) => btn(BIDNAME[v], 'bid', `data-v="${v}"`)).join('')}</div>`);
    } else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      overlay = panel(s.phase === 'gameOver' ? (s.gameWinner === 0 ? 'You win!' : `${s.names[s.gameWinner]} wins`) : `Hand ${s.handNo}`,
        `<div class="verdict ${r.made ? 'good' : 'bad'}">${who(s, s.pitcher)} ${r.made ? 'made' : 'missed'} ${BIDNAME[s.high]}</div>
        ${scoreTable(['Won by'], r.awards.map(([n, w]) => [n, w === null ? '—' : who(s, w)]))}
        ${scoreTable(s.names.map((n, i) => (i === 0 ? 'You' : n)), [['This hand', ...r.delta], ['Score', ...s.scores.map((v) => `<b>${v}</b>`)]])}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next hand', 'next', '', true)}</div>`);
    } else if (s.phase === 'trickDone') banner = `${who(s, s.winner)} ${s.winner === 0 ? 'take' : 'takes'} it`;
    else if (s.phase === 'bid') banner = `${who(s, s.turn)} is bidding…`;
    else banner = s.turn === 0 ? (s.trump === null ? 'Pitch a card: its suit becomes trump' : s.trick.length ? 'Follow suit or trump' : 'Your lead') : `${who(s, s.turn)} to play`;
    return {
      subtitle: `Hand ${s.handNo} · to ${s.opts.target}`,
      scores: s.names.map((n, i) => ({ label: i === 0 ? 'You' : n, value: s.scores[i], us: i === 0 })),
      seats: seatsVM(s, 4, (i) => ({ partner: false, tag: s.phase === 'bid' && s.bids[i] !== null ? (s.bids[i] === 'pass' ? 'Pass' : BIDNAME[s.bids[i]]) : i === s.pitcher ? `Pitcher ${BIDNAME[s.high]}` : '', tagMuted: s.bids[i] === 'pass' && s.phase === 'bid' })),
      hand: { cards: s.hands[0], legal: s.phase === 'play' && s.turn === 0 ? legal(s, 0).map((c) => c.id) : null },
      center: trickHTML(s.trick.map((p) => ({ pos: POS4[p.seat], card: p.card })), s.phase === 'trickDone' ? POS4[s.winner] : null),
      banner, overlay,
      trump: s.trump ? { suit: s.trump } : null,
      side: s.trump ? [] : [{ title: 'Trump', html: '<div>Set by the first card played</div>' }],
    };
  },
};
