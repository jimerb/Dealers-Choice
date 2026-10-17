// Five-card draw poker, fixed limit, up to 6 players. Ante, bet, draw up to 3, bet, showdown.
import { deck, shuffle, sortCards, hi, rngOf } from '../core/cards.js';
import { clone, log, fx, must, posFor } from './lib/common.js';
import { panel, btn, scoreTable, cardsRow } from '../core/table.js';

const CAT = ['High card', 'One pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

/** Hand value as a comparable array: [category, ...tiebreak ranks]. */
export function evaluate(cards) {
  const v = cards.map(hi).sort((a, b) => b - a);
  const counts = {};
  v.forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
  const groups = Object.entries(counts).map(([r, n]) => [n, Number(r)]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const uniq = [...new Set(v)];
  let straightHigh = 0;
  if (uniq.length === 5 && v[0] - v[4] === 4) straightHigh = v[0];
  if (uniq.length === 5 && v[0] === 14 && v[1] === 5) straightHigh = 5; // wheel
  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][0] === 4) return [7, groups[0][1], groups[1][1]];
  if (groups[0][0] === 3 && groups[1][0] === 2) return [6, groups[0][1], groups[1][1]];
  if (flush) return [5, ...v];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][0] === 3) return [3, ...groups.map((g) => g[1])];
  if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...groups.map((g) => g[1])];
  if (groups[0][0] === 2) return [1, ...groups.map((g) => g[1])];
  return [0, ...v];
}
export const compare = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; } return 0; };
export const describe = (val) => CAT[val[0]];

const ANTE = 5, SMALL = 10, BIG = 20, MAX_RAISES = 3, START = 500;

function newGame({ names, seed, opts }) {
  const n = Number(opts.players);
  const s = { v: 1, seed, rngN: 0, n, names: names.slice(0, n), opts, chips: Array(n).fill(START), handNo: 0, dealer: n - 1, log: [], fx: [], partners: false };
  s.style = s.names.map((_, i) => (i === 0 ? null : ['tight', 'loose', 'bluffer', 'solid', 'loose'][i % 5]));
  return deal(s);
}

const live = (s) => s.chips.map((c, i) => (c > 0 || s.inHand?.[i] ? i : -1)).filter((i) => i >= 0);

function deal(s) {
  const players = s.chips.map((c, i) => (c > 0 ? i : -1)).filter((i) => i >= 0);
  s.handNo++;
  do { s.dealer = (s.dealer + 1) % s.n; } while (s.chips[s.dealer] <= 0);
  const d = shuffle(deck(), rngOf(s));
  s.hands = Array.from({ length: s.n }, () => []);
  s.inHand = Array(s.n).fill(false); s.folded = Array(s.n).fill(true);
  s.contrib = Array(s.n).fill(0); s.drawn = Array(s.n).fill(null); s.roundBet = Array(s.n).fill(0);
  let k = 0;
  for (const p of players) { s.hands[p] = sortCards(d.slice(k, k + 5)); k += 5; s.inHand[p] = true; s.folded[p] = false; }
  s.stock = d.slice(k);
  for (const p of players) put(s, p, Math.min(ANTE, s.chips[p]));
  s.result = null;
  fx(s, 'shuffle', 'chips');
  log(s, `Hand ${s.handNo}: everyone antes ${ANTE}.`);
  startRound(s, 'bet1');
  return s;
}

function put(s, p, amt) { s.chips[p] -= amt; s.contrib[p] += amt; s.roundBet[p] = (s.roundBet?.[p] ?? 0) + amt; }
const pot = (s) => s.contrib.reduce((a, b) => a + b, 0);
const active = (s) => s.inHand.map((x, i) => (x && !s.folded[i] ? i : -1)).filter((i) => i >= 0);
const canAct = (s, p) => s.inHand[p] && !s.folded[p] && s.chips[p] > 0;

function startRound(s, phase) {
  s.phase = phase; s.roundBet = Array(s.n).fill(0); s.currentBet = 0; s.raises = 0; s.acted = Array(s.n).fill(false);
  if (phase === 'draw') { s.turn = nextFrom(s, s.dealer, (p) => s.inHand[p] && !s.folded[p]); return; }
  s.turn = nextFrom(s, s.dealer, (p) => canAct(s, p));
  if (s.turn === null || active(s).length < 2) return settleRound(s);
}

function nextFrom(s, from, ok) {
  for (let k = 1; k <= s.n; k++) { const p = (from + k) % s.n; if (ok(p)) return p; }
  return null;
}

const toCall = (s, p) => Math.max(0, s.currentBet - s.roundBet[p]);
const betSize = (s) => (s.phase === 'bet1' ? SMALL : BIG);

export function options(s, p) {
  const call = toCall(s, p);
  const o = { fold: call > 0, check: call === 0, call: call > 0 ? Math.min(call, s.chips[p]) : 0, bet: 0, raise: 0 };
  if (s.raises < MAX_RAISES && s.chips[p] > call) {
    const amt = Math.min(call + betSize(s), s.chips[p]);
    if (s.currentBet === 0) o.bet = amt; else o.raise = amt;
  }
  return o;
}

function bettingAction(s, p, kind) {
  must(s.phase.startsWith('bet') && s.turn === p, 'Not your turn.');
  const o = options(s, p);
  const nm = p === 0 ? 'You' : s.names[p];
  if (kind === 'fold') { must(o.fold, 'Nothing to fold to; check instead.'); s.folded[p] = true; log(s, `${nm} ${p === 0 ? 'fold' : 'folds'}.`); fx(s, 'pass'); }
  else if (kind === 'check') { must(o.check, 'You need to call or fold.'); log(s, `${nm} ${p === 0 ? 'check' : 'checks'}.`); fx(s, 'click'); }
  else if (kind === 'call') { must(o.call > 0, 'Nothing to call.'); put(s, p, o.call); log(s, `${nm} ${p === 0 ? 'call' : 'calls'} ${o.call}${s.chips[p] === 0 ? ' (all in)' : ''}.`); fx(s, 'chips'); }
  else if (kind === 'bet' || kind === 'raise') {
    const amt = o.bet || o.raise; must(amt > 0, 'You can’t raise now.');
    put(s, p, amt);
    if (s.roundBet[p] > s.currentBet) { s.currentBet = s.roundBet[p]; s.raises++; s.acted = s.acted.map(() => false); }
    log(s, `${nm} ${kind === 'bet' ? (p === 0 ? 'bet' : 'bets') : (p === 0 ? 'raise' : 'raises')} to ${s.currentBet}.`); fx(s, 'chips');
  }
  s.acted[p] = true;
  if (active(s).length === 1) return awardUncontested(s);
  const pending = (q) => canAct(s, q) && (!s.acted[q] || s.roundBet[q] < s.currentBet);
  const nxt = nextFrom(s, p, pending);
  if (nxt === null) return settleRound(s);
  s.turn = nxt;
  return s;
}

function settleRound(s) {
  if (active(s).length === 1) return awardUncontested(s);
  if (s.phase === 'bet1') { startRound(s, 'draw'); return s; }
  return showdown(s);
}

function drawCards(s, p, ids) {
  must(s.phase === 'draw' && s.turn === p, 'Not your turn to draw.');
  must(ids.length <= 3, 'You can draw at most three cards.');
  s.hands[p] = s.hands[p].filter((c) => !ids.includes(c.id));
  s.hands[p] = sortCards([...s.hands[p], ...s.stock.splice(0, ids.length)]);
  s.drawn[p] = ids.length;
  log(s, `${p === 0 ? 'You' : s.names[p]} ${ids.length ? `${p === 0 ? 'draw' : 'draws'} ${ids.length}` : (p === 0 ? 'stand pat' : 'stands pat')}.`);
  fx(s, ids.length ? 'deal' : 'click');
  const nxt = nextFrom(s, p, (q) => s.inHand[q] && !s.folded[q] && s.drawn[q] === null);
  if (nxt === null) startRound(s, 'bet2');
  else s.turn = nxt;
  return s;
}

function awardUncontested(s) {
  const w = active(s)[0];
  const amt = pot(s);
  s.chips[w] += amt;
  s.result = { winners: [{ seat: w, amount: amt }], showdown: false };
  log(s, `${w === 0 ? 'You win' : `${s.names[w]} wins`} ${amt} uncontested.`);
  fx(s, w === 0 ? 'chips' : 'trick');
  return endHand(s);
}

function showdown(s) {
  const vals = s.hands.map((h, i) => (s.inHand[i] && !s.folded[i] ? evaluate(h) : null));
  // Side pots by contribution level.
  const levels = [...new Set(s.contrib.filter((c) => c > 0))].sort((a, b) => a - b);
  let prev = 0;
  const wins = {};
  for (const lvl of levels) {
    const contributors = s.contrib.map((c, i) => (c >= lvl ? i : -1)).filter((i) => i >= 0);
    const amount = (lvl - prev) * contributors.length;
    const eligible = contributors.filter((i) => vals[i]);
    prev = lvl;
    if (!eligible.length) continue;
    let best = [];
    for (const i of eligible) { if (!best.length || compare(vals[i], vals[best[0]]) > 0) best = [i]; else if (compare(vals[i], vals[best[0]]) === 0) best.push(i); }
    const share = Math.floor(amount / best.length);
    best.forEach((i, k) => { wins[i] = (wins[i] || 0) + share + (k === 0 ? amount - share * best.length : 0); });
  }
  for (const [i, a] of Object.entries(wins)) s.chips[i] += a;
  s.result = { showdown: true, vals, winners: Object.entries(wins).map(([seat, amount]) => ({ seat: Number(seat), amount })) };
  for (const w of s.result.winners) log(s, `${w.seat === 0 ? 'You win' : `${s.names[w.seat]} wins`} ${w.amount} with ${describe(vals[w.seat]).toLowerCase()}.`);
  fx(s, s.result.winners.some((w) => w.seat === 0) ? 'win' : 'trick');
  return endHand(s);
}

function endHand(s) {
  s.turn = null;
  const left = s.chips.filter((c) => c > 0).length;
  const limit = Number(s.opts.hands);
  if (s.chips[0] <= 0 || left === 1 || (limit && s.handNo >= limit)) { s.phase = 'gameOver'; fx(s, s.chips[0] === Math.max(...s.chips) ? 'win' : 'lose'); }
  else s.phase = 'handOver';
  return s;
}

// ---------------------------------------------------------------- AI
function strength(hand) {
  const v = evaluate(hand);
  let x = v[0] * 10 + (v[1] ?? 0) / 2; // e.g. pair of jacks ≈ 15.5
  if (v[0] === 0) {
    const suits = {}; hand.forEach((c) => { suits[c.suit] = (suits[c.suit] || 0) + 1; });
    if (Math.max(...Object.values(suits)) === 4) x += 9; // flush draw
    const r = [...new Set(hand.map(hi))].sort((a, b) => a - b);
    for (let i = 0; i + 3 < r.length; i++) if (r[i + 3] - r[i] === 3) x += 7; // open-ended straight draw
  }
  return x;
}

function aiDraw(hand) {
  const v = evaluate(hand);
  if (v[0] >= 4 && v[0] !== 7) return []; // straight or better (keep quads' kicker too)
  if (v[0] === 7) return [];
  const counts = {}; hand.forEach((c) => { counts[hi(c)] = (counts[hi(c)] || 0) + 1; });
  if (v[0] >= 1) return hand.filter((c) => counts[hi(c)] === 1).slice(0, 3).map((c) => c.id);
  const suits = {}; hand.forEach((c) => (suits[c.suit] ??= []).push(c));
  const four = Object.values(suits).find((g) => g.length === 4);
  if (four) return hand.filter((c) => !four.includes(c)).map((c) => c.id);
  const sorted = hand.slice().sort((a, b) => hi(b) - hi(a));
  return sorted.slice(hi(sorted[0]) >= 13 ? 1 : 2).slice(-3).map((c) => c.id);
}

function aiBet(s, p) {
  const o = options(s, p);
  const rng = rngOf(s);
  const style = s.style[p];
  let x = strength(s.hands[p]);
  if (s.phase === 'bet2') x = evaluate(s.hands[p])[0] * 10 + (evaluate(s.hands[p])[1] ?? 0) / 2;
  const bluff = rng() < (style === 'bluffer' ? 0.18 : style === 'loose' ? 0.08 : 0.03);
  const nerve = style === 'tight' ? 3 : style === 'loose' ? -3 : 0;
  if ((x >= 22 + nerve || bluff) && (o.bet || o.raise)) return o.bet ? 'bet' : 'raise';
  if (o.check) return 'check';
  const callNeed = (s.phase === 'bet1' ? 13 : 16) + nerve;
  if (x >= callNeed || (o.call <= SMALL && x >= callNeed - 4) || bluff) return 'call';
  return 'fold';
}

const RULES = `<p>Five-card draw, no wild cards, fixed limit. Everyone antes, gets five cards, and bets. Then each player may discard up to three cards and draw replacements, and there's a second, bigger round of betting. The best hand at the showdown wins the pot.</p>
<h3>Betting</h3><p>Check or bet when nobody has bet; otherwise fold, call, or raise. Bets are ${SMALL} before the draw and ${BIG} after, with at most ${MAX_RAISES} raises per round.</p>
<h3>Hands, high to low</h3><p>Straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card.</p>`;

export default {
  id: 'poker', title: 'Poker', version: 1, rulesHTML: RULES,
  settings: [
    { key: 'players', label: 'Players', options: [[4, '4 players'], [5, '5 players'], [6, '6 players']], default: 6 },
    { key: 'hands', label: 'Game ends', options: [[0, 'When one player has all the money'], [25, 'After 25 hands'], [50, 'After 50 hands']], default: 25 },
  ],
  newGame,
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'handOver') return 0;
    return s.turn;
  },
  delay: () => 850,
  act(state, a) {
    const s = clone(state);
    if (['fold', 'check', 'call', 'bet', 'raise'].includes(a.act)) return bettingAction(s, 0, a.act);
    if (a.act === 'draw') return drawCards(s, 0, a.ids ?? []);
    if (a.act === 'next') return deal(s);
    if (a.act === 'again') return newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'handOver') return deal(s);
    if (s.phase === 'draw') return drawCards(s, s.turn, aiDraw(s.hands[s.turn]));
    return bettingAction(s, s.turn, aiBet(s, s.turn));
  },
  view(s, ui) {
    const my = s.turn === 0;
    let overlay = '', banner = '', actions = '';
    if (s.phase.startsWith('bet') && my) {
      const o = options(s, 0);
      actions = [o.fold ? btn('Fold', 'fold') : '', o.check ? btn('Check', 'check') : '', o.call ? btn(`Call ${o.call}`, 'call', '', true) : '',
        o.bet ? btn(`Bet ${o.bet}`, 'bet', '', !o.call) : '', o.raise ? btn(`Raise ${o.raise}`, 'raise') : ''].join('');
      banner = `Your move: ${o.call ? `${o.call} to call` : 'check or bet'}`;
    } else if (s.phase === 'draw' && my) {
      const n = ui.selected.size;
      actions = btn(n ? `Draw ${n}` : 'Stand pat', 'draw', 'data-with-sel', true);
      banner = 'Select up to three cards to replace';
    } else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      const rows = r.showdown ? s.names.map((nm, i) => (r.vals[i] ? `<div style="margin-bottom:6px"><b>${i === 0 ? 'You' : nm}</b>: ${describe(r.vals[i])}${cardsRow(s.hands[i], 36)}</div>` : '')).join('') : '';
      const title = s.phase === 'gameOver' ? (s.chips[0] === Math.max(...s.chips) ? 'You finish on top!' : s.chips[0] <= 0 ? 'You’re out of chips' : 'Game over') : `Hand ${s.handNo}`;
      overlay = panel(title, `<div class="verdict ${r.winners.some((w) => w.seat === 0) ? 'good' : ''}">${r.winners.map((w) => `${w.seat === 0 ? 'You win' : `${s.names[w.seat]} wins`} ${w.amount}`).join(' · ')}</div>
        <div style="max-height:44vh;overflow:auto">${rows}</div>
        ${s.phase === 'gameOver' ? scoreTable(['Chips'], s.names.map((nm, i) => [i === 0 ? 'You' : nm, s.chips[i]])) : ''}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next hand', 'next', '', true)}</div>`, 'max-width:560px');
    } else if (s.turn !== null) banner = `${s.names[s.turn]} ${s.phase === 'draw' ? 'is drawing…' : 'is betting…'}`;
    const seats = Array.from({ length: s.n }, (_, i) => {
      const tag = !s.inHand[i] ? (s.chips[i] <= 0 ? 'Out' : '') : s.folded[i] ? 'Folded' : s.phase.startsWith('bet') && s.roundBet[i] ? `Bet ${s.roundBet[i]}` : s.drawn[i] !== null && s.phase !== 'bet1' ? `Drew ${s.drawn[i]}` : '';
      const showdown = (s.phase === 'handOver' || s.phase === 'gameOver') && s.result?.showdown && s.result.vals[i];
      return { seat: i, pos: posFor(s.n, i), name: `${i === 0 ? s.names[0] : s.names[i]} · ${s.chips[i]}`, mine: i === 0, turn: s.turn === i,
        dealer: s.dealer === i, count: i && s.inHand[i] && !s.folded[i] && !showdown ? 5 : 0, faceUp: i && showdown ? s.hands[i] : null, faceUpWidth: 36, tag, tagMuted: s.folded[i] };
    });
    const center = `<div class="pot" aria-label="Pot ${pot(s)}"><span class="chip-stack" aria-hidden="true"></span><b>Pot ${pot(s)}</b>${s.phase.startsWith('bet') ? `<span>Bet to call: ${s.currentBet}</span>` : ''}</div>${actions ? `<div class="hand-actions">${actions}</div>` : ''}`;
    return {
      subtitle: `Hand ${s.handNo}${Number(s.opts.hands) ? ` of ${s.opts.hands}` : ''} · ante ${ANTE} · bets ${SMALL}/${BIG}`,
      scores: [{ label: 'Your chips', value: s.chips[0], us: true }],
      seats,
      hand: s.inHand[0] ? (s.phase === 'draw' && my ? { cards: s.hands[0], legal: s.hands[0].map((c) => c.id), mode: 'select', maxSelect: 3 } : { cards: s.hands[0], legal: null }) : null,
      center, banner, overlay,
      side: [{ title: 'Your hand', html: s.inHand[0] && s.hands[0].length ? `<div class="big">${describe(evaluate(s.hands[0]))}</div>` : 'Sitting out' },
        { title: 'Chips', html: scoreTable(['Chips'], s.names.map((nm, i) => [i === 0 ? 'You' : nm, s.chips[i]])) }],
    };
  },
};
