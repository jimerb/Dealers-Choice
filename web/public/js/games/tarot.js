// French Tarot (4 players): 78 cards, 21 trumps + the Excuse; one taker against three defenders.
import { shuffle, rngOf } from '../core/cards.js';
import { clone, log, fx, who, must, POS4 } from './lib/common.js';
import { trickHTML, panel, btn, scoreTable } from '../core/table.js';
import { cardHTML } from '../skin.js';

const SUITS = ['S', 'H', 'C', 'D'];
const SRANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'C', 'Q', 'K']; // A = the 1
const BIDS = [null, 'Prise', 'Garde', 'Garde Sans', 'Garde Contre'];
const MULT = [0, 1, 2, 4, 6];
const NEED = [56, 51, 41, 36];

export function tarotDeck() {
  const d = [];
  for (const s of SUITS) for (const r of SRANKS) d.push({ id: `${r}${s}`, rank: r, suit: s });
  for (let n = 1; n <= 21; n++) d.push({ id: `T${n}`, rank: String(n), suit: 'T' });
  d.push({ id: 'EX', rank: 'EX', suit: 'X' });
  return d;
}
const isTrump = (c) => c.suit === 'T';
const isExcuse = (c) => c.rank === 'EX';
export const isBout = (c) => c.id === 'T1' || c.id === 'T21' || c.id === 'EX';
export function pts(c) {
  if (isBout(c)) return 4.5;
  if (c.suit === 'T') return 0.5;
  return { K: 4.5, Q: 3.5, C: 2.5, J: 1.5 }[c.rank] ?? 0.5;
}
const power = (c) => (isExcuse(c) ? -1 : isTrump(c) ? 100 + Number(c.rank) : SRANKS.indexOf(c.rank));
const sortHand = (h) => h.slice().sort((a, b) => {
  const g = (c) => (isTrump(c) ? -1 : isExcuse(c) ? -2 : SUITS.indexOf(c.suit));
  return g(a) - g(b) || power(b) - power(a);
});

function deal(s) {
  const rng = rngOf(s);
  s.dealNo++; s.dealer = (s.dealer + 1) % 4;
  const d = shuffle(tarotDeck(), rng);
  s.hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 18, i * 18 + 18)));
  s.chien = d.slice(72);
  // A player holding only the 1 of trump (petit sec) forces a redeal.
  if (s.hands.some((h) => h.filter(isTrump).length === 1 && h.some((c) => c.id === 'T1') && !h.some(isExcuse))) { s.dealNo--; s.dealer = (s.dealer + 3) % 4; log(s, 'Petit sec: redeal.'); return deal(s); }
  s.bids = [null, null, null, null]; s.high = 0; s.taker = null; s.bidCount = 0;
  s.phase = 'bid'; s.turn = (s.dealer + 1) % 4;
  s.trick = []; s.trickNo = 0; s.won = [[], [], [], []]; s.excuseOwner = null; s.excuseTrickWinner = null; s.lastTrickHadPetit = null; s.result = null;
  s.discard = []; s.trickWins = [0, 0, 0, 0]; s.poignees = [];
  // Misère (an option): a hand dealt with no trumps, or with no court cards, may be declared for a bonus.
  s.misere = s.opts.misere === 'yes' ? [0, 1, 2, 3].filter((p) => miserable(s.hands[p])) : [];
  fx(s, 'shuffle');
  log(s, `Deal ${s.dealNo}: ${s.names[s.dealer]} deals.`);
  return s;
}

function bid(s, p, v) {
  must(s.phase === 'bid' && s.turn === p, 'Not your turn to bid.');
  v = Number(v);
  if (v) { must(v > s.high && v <= 4, 'Bid higher or pass.'); s.high = v; s.taker = p; s.bids[p] = v; log(s, `${who(s, p)}: ${BIDS[v]}.`); fx(s, 'bid'); }
  else { s.bids[p] = 0; log(s, `${who(s, p)} ${p === 0 ? 'pass' : 'passes'}.`); fx(s, 'pass'); }
  s.bidCount++;
  if (s.bidCount < 4) { s.turn = (p + 1) % 4; return s; }
  if (s.taker === null) { log(s, 'Everyone passed: redeal.'); return deal(s); }
  log(s, `${who(s, s.taker)} ${s.taker === 0 ? 'take' : 'takes'} with a ${BIDS[s.high]}.`);
  if (s.high <= 2) { s.phase = 'chien'; s.turn = s.taker; }
  else startPlay(s);
  return s;
}

function takeChien(s, p) {
  must(s.phase === 'chien' && s.turn === p, 'Not your chien.');
  s.hands[p] = sortHand([...s.hands[p], ...s.chien]); s.shownChien = s.chien; s.chien = [];
  s.phase = 'ecart';
  fx(s, 'deal');
  return s;
}
const canDiscard = (h, c) => !isTrump(c) && !isExcuse(c) && c.rank !== 'K';
function ecart(s, p, ids) {
  must(s.phase === 'ecart' && s.turn === p && ids.length === 6, 'Choose six cards to set aside.');
  const cards = s.hands[p].filter((c) => ids.includes(c.id));
  const ok = s.hands[p].filter((c) => canDiscard(s.hands[p], c)).length;
  must(cards.every((c) => canDiscard(s.hands[p], c)) || ok < 6, 'You can’t set aside trumps, kings or the Excuse.');
  s.discard = cards; s.hands[p] = s.hands[p].filter((c) => !ids.includes(c.id));
  startPlay(s);
  return s;
}

const COURTS = ['K', 'Q', 'C', 'J'];
/** Misère: no trumps (the Excuse doesn't count), or no kings, queens, knights or jacks. */
export const miserable = (h) => !h.some(isTrump) || !h.some((c) => COURTS.includes(c.rank) && !isTrump(c));
/** Poignée: 10, 13 or 15 trumps shown (the Excuse may count as one) for 20, 30 or 40 points. */
export function poignee(h) {
  const n = h.filter(isTrump).length + (h.some(isExcuse) ? 1 : 0);
  return n >= 15 ? { n, pts: 40, name: 'triple' } : n >= 13 ? { n, pts: 30, name: 'double' } : n >= 10 ? { n, pts: 20, name: 'single' } : null;
}

function startPlay(s) {
  // The player next to the dealer leads, or by option the taker.
  s.phase = 'play'; s.turn = s.opts.firstLead === 'taker' ? s.taker : (s.dealer + 1) % 4;
  // Declarations are made before the first trick (shown automatically).
  for (const p of s.misere ?? []) log(s, `${who(s, p)} ${p === 0 ? 'declare' : 'declares'} misère.`);
  if (s.opts.bonuses === 'yes') {
    for (let p = 0; p < 4; p++) {
      const pg = poignee(s.hands[p]);
      if (!pg) continue;
      s.poignees.push({ seat: p, ...pg });
      log(s, `${who(s, p)} ${p === 0 ? 'show' : 'shows'} a ${pg.name} poignée (${pg.n} trumps).`);
    }
  }
}

export function legal(s, p) {
  const h = s.hands[p];
  const plays = s.trick.filter((x) => !isExcuse(x.card));
  if (!plays.length) return h.slice();
  const led = plays[0].card.suit;
  const exc = h.filter(isExcuse);
  const highestTrump = Math.max(0, ...plays.filter((x) => isTrump(x.card)).map((x) => Number(x.card.rank)));
  const overTrumps = (ts) => { const over = ts.filter((c) => Number(c.rank) > highestTrump); return over.length ? over : ts; };
  if (led === 'T') {
    const ts = h.filter(isTrump);
    return ts.length ? [...overTrumps(ts), ...exc] : h.slice();
  }
  const follow = h.filter((c) => c.suit === led);
  if (follow.length) return [...follow, ...exc];
  const ts = h.filter(isTrump);
  if (ts.length) return [...overTrumps(ts), ...exc];
  return h.slice();
}

function winnerIdx(trick) {
  let best = -1;
  trick.forEach((x, i) => {
    if (isExcuse(x.card)) return;
    if (best < 0) { best = i; return; }
    const b = trick[best].card, c = x.card;
    if ((isTrump(c) && !isTrump(b)) || (c.suit === b.suit && power(c) > power(b))) best = i;
  });
  return best < 0 ? 0 : best;
}

function play(s, p, id) {
  must(s.phase === 'play' && s.turn === p, 'Not your turn.');
  const card = s.hands[p].find((c) => c.id === id);
  must(card, 'Card not in hand.');
  must(legal(s, p).some((c) => c.id === id), 'Follow suit; if you can’t, you must trump (and overtrump if you can).');
  s.hands[p] = s.hands[p].filter((c) => c.id !== id);
  s.trick.push({ seat: p, card });
  fx(s, 'card');
  if (s.trick.length === 4) { s.phase = 'trickDone'; s.winner = s.trick[winnerIdx(s.trick)].seat; s.turn = null; }
  else s.turn = (p + 1) % 4;
  return s;
}

function collect(s) {
  const w = s.winner;
  if (s.trickWins) s.trickWins[w]++;
  for (const x of s.trick) {
    if (isExcuse(x.card)) { s.won[x.seat].push(x.card); s.excuseOwner = x.seat; s.excuseTrickWinner = w; }
    else s.won[w].push(x.card);
  }
  s.trickNo++;
  if (s.trickNo === 18) s.lastTrickHadPetit = s.trick.some((x) => x.card.id === 'T1') ? w : null;
  s.trick = [];
  fx(s, 'trick');
  log(s, `${who(s, w)} ${w === 0 ? 'take' : 'takes'} the trick.`);
  if (s.trickNo === 18) return score(s);
  s.phase = 'play'; s.turn = w;
  return s;
}

function score(s) {
  const t = s.taker;
  const side = (p) => (p === t ? 0 : 1);
  const cards = [[], []];
  s.won.forEach((cs, p) => cards[side(p)].push(...cs));
  if (s.high <= 2) cards[0].push(...s.discard);
  else if (s.high === 3) cards[0].push(...s.chien);
  else cards[1].push(...s.chien);
  let takerPts = cards[0].reduce((a, c) => a + pts(c), 0);
  // The Excuse is kept by its owner, who gives a half-point card in exchange.
  if (s.excuseOwner !== null && side(s.excuseOwner) !== side(s.excuseTrickWinner)) takerPts += side(s.excuseOwner) === 0 ? -0.5 : 0.5;
  const bouts = cards[0].filter(isBout).length;
  const need = NEED[bouts];
  const diff = takerPts - need;
  const made = diff >= 0;
  const mult = MULT[s.high];
  let base = (25 + Math.ceil(Math.abs(diff))) * mult;
  let petit = 0;
  if (s.lastTrickHadPetit !== null) petit = (side(s.lastTrickHadPetit) === 0 ? 10 : -10) * mult;
  // Poignées and a slam (chelem: every trick) add to the score, whichever side wins it.
  let bonus = 0;
  if (s.opts.bonuses === 'yes') {
    bonus += (s.poignees ?? []).reduce((a, x) => a + x.pts, 0);
    if (s.trickWins?.[t] === 18) bonus += 200;
  }
  const takerScore = (made ? base + bonus : -(base + bonus)) + petit;
  const delta = [0, 1, 2, 3].map((p) => (p === t ? 3 * takerScore : -takerScore));
  // Misère is paid apart from the deal: 30 to the declarer, 10 from each other player.
  for (const m of s.misere ?? []) for (let p = 0; p < 4; p++) delta[p] += p === m ? 30 : -10;
  s.scores = s.scores.map((v, i) => v + delta[i]);
  s.result = { takerPts, bouts, need, made, delta, petit, base, bonus, slam: s.trickWins?.[t] === 18 };
  log(s, `${who(s, t)} ${made ? (t === 0 ? 'make' : 'makes') : (t === 0 ? 'miss' : 'misses')} the contract (${takerPts} of ${need}).`);
  s.turn = null;
  const target = Number(s.opts.target);
  if (Math.max(...s.scores) >= target) { s.phase = 'gameOver'; fx(s, s.scores[0] === Math.max(...s.scores) ? 'win' : 'lose'); }
  else { s.phase = 'handOver'; fx(s, (t === 0) === made ? 'score' : 'lose'); }
  return s;
}

// ------------------------------------------------------------------ AI
function strength(h) {
  const trumps = h.filter(isTrump);
  let v = trumps.length * 1.1;
  if (h.some((c) => c.id === 'T21')) v += 4;
  if (h.some(isExcuse)) v += 3;
  if (h.some((c) => c.id === 'T1')) v += trumps.length >= 6 ? 3 : -1;
  v += trumps.filter((c) => Number(c.rank) >= 16).length * 0.8;
  for (const su of SUITS) {
    const cs = h.filter((c) => c.suit === su);
    if (cs.some((c) => c.rank === 'K')) v += 2.5;
    if (cs.some((c) => c.rank === 'Q') && cs.some((c) => c.rank === 'K')) v += 1;
    if (!cs.length) v += 2; else if (cs.length === 1) v += 1;
  }
  return v;
}
function aiBid(s, p) {
  const v = strength(s.hands[p]);
  const want = v >= 40 ? 4 : v >= 34 ? 3 : v >= 27 ? 2 : v >= 22 ? 1 : 0;
  return want > s.high ? want : 0;
}
function aiEcart(s, p) {
  const h = s.hands[p];
  const ok = h.filter((c) => canDiscard(h, c));
  const bySuitLen = (c) => h.filter((x) => x.suit === c.suit).length;
  const pick = ok.sort((a, b) => bySuitLen(a) - bySuitLen(b) || pts(b) - pts(a) || power(a) - power(b)).slice(0, 6);
  if (pick.length < 6) pick.push(...h.filter((c) => !pick.includes(c) && !isExcuse(c) && c.id !== 'T1' && c.id !== 'T21').sort((a, b) => power(a) - power(b)).slice(0, 6 - pick.length));
  return pick.map((c) => c.id);
}
function aiPlay(s, p) {
  const L = legal(s, p);
  if (L.length === 1) return L[0].id;
  const t = s.trick;
  const isTaker = p === s.taker;
  const mates = (a, b) => a !== s.taker && b !== s.taker;
  const nonEx = L.filter((c) => !isExcuse(c));
  if (s.hands[p].length <= 2 && L.some(isExcuse)) return 'EX';
  if (!t.length) {
    if (isTaker) { const ts = nonEx.filter(isTrump).sort((a, b) => power(b) - power(a)); if (ts.length >= 6) return ts[0].id; }
    const kings = nonEx.filter((c) => c.rank === 'K');
    if (kings.length) return kings[0].id;
    const side = nonEx.filter((c) => !isTrump(c));
    return (side.length ? side : nonEx).sort((a, b) => pts(a) - pts(b) || power(a) - power(b))[0].id;
  }
  const wi = winnerIdx(t);
  const ally = !isTaker && mates(t[wi].seat, p);
  const wins = (c) => winnerIdx([...t, { seat: p, card: c }]) === t.length;
  const last = t.length === 3;
  if (ally && (last || power(t[wi].card) >= 115)) return nonEx.sort((a, b) => pts(b) - pts(a) || power(a) - power(b))[0].id;
  const w = nonEx.filter(wins);
  const trickPts = t.reduce((a, x) => a + pts(x.card), 0);
  if (w.length && (trickPts >= 3 || last || isTaker)) {
    const petitSafe = w.find((c) => c.id === 'T1');
    if (petitSafe && last) return petitSafe.id;
    return w.sort((a, b) => power(a) - power(b))[0].id;
  }
  const cheap = nonEx.filter((c) => c.id !== 'T1').sort((a, b) => pts(a) - pts(b) || power(a) - power(b));
  return (cheap[0] ?? nonEx[0] ?? L[0]).id;
}

const RULES = `<p>Four players; one <b>taker</b> plays against the other three. The deck has four suits (K, Q, Knight, J, 10…1), 21 numbered <b>trumps</b> and the <b>Excuse</b>. Eighteen cards each; six form the <b>chien</b>.</p>
<h3>Bidding</h3><p>Prise &lt; Garde &lt; Garde Sans &lt; Garde Contre (multipliers 1, 2, 4, 6). After a Prise or Garde, the taker takes the chien and sets six cards aside (no trumps, kings or the Excuse). With Garde Sans the chien counts for the taker unseen; with Garde Contre it goes to the defenders.</p>
<h3>Play</h3><p>Follow suit; if you can't, you must trump, and overtrump if you can. The Excuse can be played any time, never wins, and stays with its owner.</p>
<h3>Scoring</h3><p>Bouts (trump 1, trump 21, the Excuse) and kings are worth 4½, queens 3½, knights 2½, jacks 1½, everything else ½. The points the taker needs depend on bouts won: 0 bouts 56, 1 bout 51, 2 bouts 41, 3 bouts 36. The score is (25 + the margin) × the multiplier, paid by or to each defender. Winning the last trick with the trump 1 (<i>petit au bout</i>) is worth 10 × the multiplier.</p>
<p>Options: the taker may lead the first trick; a poignée (10, 13 or 15 trumps, shown before play) adds 20, 30 or 40 and a slam by the taker adds 200 to the winning side's score; a misère (dealt no trumps, or no court cards) earns 30 from the table.</p>`;

export default {
  id: 'tarot', title: 'Tarot', version: 1, seats: 4, rulesHTML: RULES,
  settings: [
    { key: 'target', label: 'Game ends when a player reaches', options: [[500, '500 points'], [1000, '1,000 points']], default: 500 },
    { key: 'firstLead', label: 'First lead', options: [['dealer', 'Player next to the dealer'], ['taker', 'The taker']], default: 'dealer' },
    { key: 'bonuses', label: 'Poignée and slam bonuses', options: [['no', 'No'], ['yes', 'Yes']], default: 'no' },
    { key: 'misere', label: 'Misère declarations', options: [['no', 'Not allowed'], ['yes', 'Allowed']], default: 'no' },
  ],
  newGame({ names, seed, opts }) {
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, scores: [0, 0, 0, 0], dealNo: 0, dealer: 3, log: [], fx: [], partners: false });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'trickDone') return 'auto';
    if (s.phase === 'handOver') return 0;
    return s.turn;
  },
  delay: (s) => (s.phase === 'trickDone' ? 1100 : 750),
  act(state, a) {
    const s = clone(state);
    switch (a.act) {
      case 'bid': return bid(s, 0, a.v);
      case 'chien': return takeChien(s, 0);
      case 'ecart': return ecart(s, 0, a.ids ?? []);
      case 'play': return play(s, 0, a.id);
      case 'next': return deal(s);
      case 'again': return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
      default: throw new Error('Unknown action');
    }
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'trickDone') return collect(s);
    if (s.phase === 'handOver') return deal(s);
    if (s.phase === 'bid') return bid(s, s.turn, aiBid(s, s.turn));
    if (s.phase === 'chien') return takeChien(s, s.turn);
    if (s.phase === 'ecart') return ecart(s, s.turn, aiEcart(s, s.turn));
    return play(s, s.turn, aiPlay(s, s.turn));
  },
  view(s, ui) {
    const my = s.turn === 0;
    let overlay = '', banner = '';
    if (s.phase === 'bid' && my) {
      overlay = panel('Your bid', `<p>${s.high ? `Highest: ${BIDS[s.high]} by ${who(s, s.taker)}.` : 'No bids yet.'} You hold ${s.hands[0].filter(isTrump).length} trumps and ${s.hands[0].filter(isBout).length} bout(s).</p>
        <div class="row">${btn('Pass', 'bid', 'data-v="0"')}${[1, 2, 3, 4].filter((v) => v > s.high).map((v) => btn(BIDS[v], 'bid', `data-v="${v}"`)).join('')}</div>`);
    } else if (s.phase === 'chien' && my) overlay = panel('The chien', `<div class="row" style="--card-w:48px">${s.chien.map((c) => cardHTML(c)).join('')}</div><div class="row" style="margin-top:10px">${btn('Take the chien', 'chien', '', true)}</div>`);
    else if (s.phase === 'ecart' && my) overlay = panel('Set aside six cards', `<p>No trumps, kings or the Excuse. Their points count for you. (${ui.selected.size}/6)</p><div class="row">${btn('Set aside', 'ecart', `data-with-sel ${ui.selected.size === 6 ? '' : 'disabled'}`, true)}</div>`);
    else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      overlay = panel(s.phase === 'gameOver' ? (s.scores[0] === Math.max(...s.scores) ? 'You win!' : `${s.names[s.scores.indexOf(Math.max(...s.scores))]} wins`) : `${who(s, s.taker)} ${r.made ? 'made' : 'missed'} the ${BIDS[s.high]}`,
        `<p>Taker's points: <b>${r.takerPts}</b> (needed ${r.need} with ${r.bouts} bout${r.bouts === 1 ? '' : 's'})${r.petit ? `<br>Petit au bout: ${r.petit > 0 ? '+' : ''}${r.petit}` : ''}${r.bonus ? `<br>${r.slam ? 'Slam and poignées' : 'Poignées'}: ${r.bonus} to the winners` : ''}${s.misere?.length ? `<br>Misère: ${s.misere.map((p) => who(s, p)).join(', ')}` : ''}</p>
        ${scoreTable(s.names.map((n, i) => (i === 0 ? 'You' : n)), [['This deal', ...r.delta.map((d) => (d > 0 ? `+${d}` : d))], ['Total', ...s.scores.map((v) => `<b>${v}</b>`)]])}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next deal', 'next', '', true)}</div>`);
    } else if (s.phase === 'trickDone') banner = `${who(s, s.winner)} ${s.winner === 0 ? 'take' : 'takes'} it`;
    else if (s.phase === 'play') banner = my ? (s.trick.length ? 'Follow suit, or trump if you can’t' : 'Your lead') : `${who(s, s.turn)} to play`;
    else if (s.turn !== null) banner = `${who(s, s.turn)} is thinking…`;
    const takerTaken = s.taker !== null ? s.won[s.taker].reduce((a, c) => a + pts(c), 0) : 0;
    return {
      subtitle: `Deal ${s.dealNo} · to ${s.opts.target}${s.taker !== null && s.phase !== 'bid' ? ` · ${BIDS[s.high]} by ${who(s, s.taker)}` : ''}`,
      scores: s.names.map((n, i) => ({ label: i === 0 ? 'You' : n, value: s.scores[i], us: i === 0 })),
      seats: [0, 1, 2, 3].map((i) => ({ seat: i, pos: POS4[i], name: s.names[i], mine: i === 0, turn: s.turn === i, dealer: s.dealer === i, count: i ? s.hands[i].length : 0,
        tag: s.phase === 'bid' && s.bids[i] !== null ? (s.bids[i] ? BIDS[s.bids[i]] : 'Pass') : i === s.taker ? 'Taker' : '', tagMuted: s.bids[i] === 0 && s.phase === 'bid' })),
      hand: s.phase === 'ecart' && my ? { cards: s.hands[0], legal: s.hands[0].filter((c) => canDiscard(s.hands[0], c)).map((c) => c.id), mode: 'select', maxSelect: 6 }
        : { cards: s.hands[0], legal: s.phase === 'play' && my ? legal(s, 0).map((c) => c.id) : null },
      center: trickHTML(s.trick.map((x) => ({ pos: POS4[x.seat], card: x.card })), s.phase === 'trickDone' ? POS4[s.winner] : null),
      banner, overlay,
      side: [{ title: 'Contract', html: s.taker !== null && s.phase !== 'bid' ? `<div class="big">${BIDS[s.high]} ×${MULT[s.high]}</div><div>Taker: ${who(s, s.taker)} · ${takerTaken} points in tricks</div>` : 'Bidding…' },
        ...(s.poignees?.length || s.misere?.length) && s.phase !== 'bid' ? [{ title: 'Declarations', html: [...(s.poignees ?? []).map((x) => `${who(s, x.seat)}: ${x.name} poignée (${x.n})`), ...(s.misere ?? []).map((p) => `${who(s, p)}: misère`)].join('<br>') }] : [],
        { title: 'Card points', html: '<div style="font-size:13px">Bouts &amp; kings 4½ · queens 3½ · knights 2½ · jacks 1½ · others ½</div>' }],
    };
  },
};
