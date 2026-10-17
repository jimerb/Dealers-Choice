// Skat (3 players): bid with game values, take the skat or play hand, suit / grand / null games.
import { deck, shuffle, rngOf, SYM, SUIT_TITLE } from '../core/cards.js';
import { clone, log, fx, who, must, trickWinner, POS3, suitSpan } from './lib/common.js';
import { trickHTML, panel, btn, scoreTable } from '../core/table.js';

const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const BASE = { C: 12, S: 11, H: 10, D: 9, G: 24 };
const NULLV = { null: 23, nullHand: 35, ouvert: 46, ouvertHand: 59 };
export const BIDS = [18, 20, 22, 23, 24, 27, 30, 33, 35, 36, 40, 44, 45, 46, 48, 50, 54, 55, 59, 60, 63, 66, 70, 72, 77, 80, 81, 84, 88, 90, 96, 99, 100, 108, 110, 117, 120, 121, 126, 130, 132, 135, 140, 143, 144, 150, 153, 154, 156, 160, 162, 165, 168, 170, 176, 180, 187, 192, 198, 204, 216, 240, 264];
const PTS = { A: 11, 10: 10, K: 4, Q: 3, J: 2 };
export const points = (c) => PTS[c.rank] ?? 0;
const JORDER = ['C', 'S', 'H', 'D'];
const GNAME = { C: 'Clubs', S: 'Spades', H: 'Hearts', D: 'Diamonds', G: 'Grand', null: 'Null', ouvert: 'Null Ouvert' };

/** Effective suit (jacks are trump in suit/grand games) and power for trick comparison. */
export function eff(c, game) {
  if (game === 'null' || game === 'ouvert') return c.suit;
  if (c.rank === 'J' || c.suit === game) return 'T';
  return c.suit;
}
export function power(c, game) {
  if (game === 'null' || game === 'ouvert') return ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'].indexOf(c.rank);
  if (c.rank === 'J') return 104 - JORDER.indexOf(c.suit);
  const order = ['7', '8', '9', 'Q', 'K', '10', 'A'].indexOf(c.rank);
  return (c.suit === game ? 90 : 0) + order;
}
const sortHand = (h, game = 'C') => h.slice().sort((a, b) => {
  const ea = eff(a, game), eb = eff(b, game);
  if (ea !== eb) return (ea === 'T' ? -1 : eb === 'T' ? 1 : JORDER.indexOf(ea) - JORDER.indexOf(eb));
  return power(b, game) - power(a, game);
});

/** Matadors ("with/against" n): consecutive top trumps held (or missing) from the top. */
export function matadors(cards, game) {
  const tops = [...JORDER.map((s) => `J${s}`), ...(game === 'G' ? [] : ['A', '10', 'K', 'Q', '9', '8', '7'].map((r) => `${r}${game}`))];
  const have = new Set(cards.map((c) => `${c.rank}${c.suit}`));
  const first = have.has(tops[0]);
  let n = 0;
  for (const t of tops) { if (have.has(t) === first) n++; else break; }
  return { n, with: first };
}

function deal(s) {
  const rng = rngOf(s);
  s.dealNo++; s.dealer = (s.dealer + 1) % 3;
  const d = shuffle(deck({ ranks: RANKS }), rng);
  s.hands = [0, 1, 2].map((i) => sortHand(d.slice(i * 10, i * 10 + 10)));
  s.skat = d.slice(30);
  const F = (s.dealer + 1) % 3, M = (s.dealer + 2) % 3, R = s.dealer;
  s.F = F; s.M = M; s.R = R;
  s.bid = { stage: 1, caller: M, listener: F, value: 0, step: 'call' };
  s.declarer = null; s.game = null; s.hand = false; s.taken = [[], [], []]; s.tricks = [0, 0, 0];
  s.trick = []; s.trickNo = 0; s.phase = 'bid'; s.turn = M; s.result = null; s.discarded = null;
  fx(s, 'shuffle');
  log(s, `Deal ${s.dealNo}: ${s.names[s.dealer]} deals. ${who(s, M)} bids to ${who(s, F)}.`);
  return s;
}

const nextBid = (v) => BIDS.find((b) => b > v);

function bidAction(s, p, a) {
  must(s.phase === 'bid' && s.turn === p, 'Not your turn to bid.');
  const b = s.bid;
  if (b.step === 'call') {
    if (a === 'pass') {
      log(s, `${who(s, p)} ${p === 0 ? 'pass' : 'passes'}.`); fx(s, 'pass');
      return stageWinner(s, b.listener);
    }
    b.value = nextBid(b.value); b.step = 'answer'; s.turn = b.listener;
    log(s, `${who(s, p)}: ${b.value}?`); fx(s, 'bid');
    return s;
  }
  // Listener answers.
  if (a === 'pass') { log(s, `${who(s, p)} ${p === 0 ? 'pass' : 'passes'}.`); fx(s, 'pass'); return stageWinner(s, b.caller); }
  log(s, `${who(s, p)}: yes.`); fx(s, 'click');
  b.step = 'call'; s.turn = b.caller;
  return s;
}

function stageWinner(s, w) {
  const b = s.bid;
  if (b.stage === 1) { b.stage = 2; b.caller = s.R; b.listener = w; b.step = 'call'; s.turn = s.R; return s; }
  if (b.value === 0) {
    // Nobody has bid: Forehand may still play at 18.
    if (b.stage === 2) { b.stage = 3; s.turn = w; b.step = 'last'; b.caller = w; return s; }
  }
  return wonBid(s, w);
}

function lastChance(s, p, a) {
  must(s.phase === 'bid' && s.bid.step === 'last' && s.turn === p, 'Not your call.');
  if (a === 'pass') { log(s, 'Everyone passed: redeal.'); s.dealer = (s.dealer + 2) % 3; s.dealNo--; return deal(s); }
  s.bid.value = 18;
  return wonBid(s, p);
}

function wonBid(s, w) {
  s.declarer = w; s.phase = 'skat'; s.turn = w;
  log(s, `${who(s, w)} ${w === 0 ? 'win' : 'wins'} the bid at ${s.bid.value}.`);
  return s;
}

function takeSkat(s, p) {
  must(s.phase === 'skat' && s.turn === p, 'Not your choice.');
  s.hands[p] = sortHand([...s.hands[p], ...s.skat]); s.skat = []; s.phase = 'discard';
  fx(s, 'deal');
  return s;
}
function playHand(s, p) { must(s.phase === 'skat' && s.turn === p, 'Not your choice.'); s.hand = true; s.phase = 'declare'; return s; }
function discard(s, p, ids) {
  must(s.phase === 'discard' && s.turn === p && ids.length === 2, 'Choose two cards to put in the skat.');
  s.skat = s.hands[p].filter((c) => ids.includes(c.id)); s.hands[p] = s.hands[p].filter((c) => !ids.includes(c.id));
  s.phase = 'declare';
  return s;
}

function declare(s, p, game) {
  must(s.phase === 'declare' && s.turn === p, 'Not your choice.');
  if (game === 'ouvert' || game === 'null') s.game = game; else { must(BASE[game], 'Unknown game.'); s.game = game; }
  s.hands = s.hands.map((h) => sortHand(h, s.game));
  s.phase = 'play'; s.turn = s.F;
  log(s, `${who(s, p)} ${p === 0 ? 'play' : 'plays'} ${GNAME[game]}${s.hand ? ' (hand)' : ''}.`);
  fx(s, 'bid');
  return s;
}

export function legal(s, p) {
  const h = s.hands[p];
  if (!s.trick.length) return h.slice();
  const led = eff(s.trick[0].card, s.game);
  const f = h.filter((c) => eff(c, s.game) === led);
  return f.length ? f : h.slice();
}
const winnerIdx = (trick, game) => trickWinner(trick.map((x) => ({ ...x, card: { ...x.card, suit: eff(x.card, game) } })), game === 'null' || game === 'ouvert' ? null : 'T', (c) => power(c, game));

function play(s, p, id) {
  must(s.phase === 'play' && s.turn === p, 'Not your turn.');
  const card = s.hands[p].find((c) => c.id === id);
  must(card, 'Card not in hand.');
  must(legal(s, p).some((c) => c.id === id), 'You must follow suit (jacks count as trump).');
  s.hands[p] = s.hands[p].filter((c) => c.id !== id);
  s.trick.push({ seat: p, card });
  fx(s, 'card');
  if (s.trick.length === 3) { s.phase = 'trickDone'; s.winner = s.trick[winnerIdx(s.trick, s.game)].seat; s.turn = null; }
  else s.turn = (p + 1) % 3;
  return s;
}

function collect(s) {
  const w = s.winner;
  s.taken[w].push(...s.trick.map((x) => x.card)); s.tricks[w]++; s.trickNo++; s.trick = [];
  fx(s, 'trick');
  const isNull = s.game === 'null' || s.game === 'ouvert';
  if (isNull && w === s.declarer) return score(s);
  if (s.trickNo === 10) return score(s);
  s.phase = 'play'; s.turn = w;
  return s;
}

function gameValue(s, declPts, declTricks, won) {
  if (s.game === 'null') return s.hand ? NULLV.nullHand : NULLV.null;
  if (s.game === 'ouvert') return s.hand ? NULLV.ouvertHand : NULLV.ouvert;
  const m = matadors(s.declCards, s.game); // declarer's 10 cards + skat at declaration
  let mult = m.n + 1;
  if (s.hand) mult++;
  if (declPts >= 90 || declPts <= 30) mult++;
  if (declTricks === 10 || declTricks === 0) mult++;
  return { value: BASE[s.game] * mult, m, mult, won };
}

function score(s) {
  const d = s.declarer;
  const isNull = s.game === 'null' || s.game === 'ouvert';
  let won, declPts = 0, value, detail = '';
  if (isNull) {
    won = s.tricks[d] === 0;
    value = gameValue(s);
    detail = won ? 'Took no tricks' : 'Took a trick';
  } else {
    declPts = [...s.taken[d], ...s.skat].reduce((t, c) => t + points(c), 0);
    won = declPts >= 61;
    const gv = gameValue(s, declPts, s.tricks[d], won);
    value = gv.value;
    detail = `${gv.m.with ? 'With' : 'Without'} ${gv.m.n}, game ${gv.mult}${s.hand ? ' (incl. hand)' : ''} × ${BASE[s.game]} = ${gv.value}`;
    if (declPts >= 90) detail += ' · schneider';
    if (s.tricks[d] === 10) detail += ' · schwarz';
  }
  let overbid = false;
  if (value < s.bid.value) {
    overbid = true; won = false;
    const base = isNull ? value : BASE[s.game];
    value = isNull ? value : Math.ceil(s.bid.value / base) * base;
  }
  const delta = won ? value : -2 * value;
  s.scores[d] += delta;
  s.result = { won, value, delta, declPts, detail, overbid };
  log(s, `${who(s, d)} ${won ? (d === 0 ? 'win' : 'wins') : (d === 0 ? 'lose' : 'loses')} ${GNAME[s.game]}${isNull ? '' : ` with ${declPts} points`}: ${delta > 0 ? '+' : ''}${delta}.`);
  s.turn = null;
  if (s.dealNo >= Number(s.opts.deals)) { s.phase = 'gameOver'; fx(s, s.scores[0] === Math.max(...s.scores) ? 'win' : 'lose'); }
  else { s.phase = 'handOver'; fx(s, (d === 0) === won ? 'score' : 'lose'); }
  return s;
}

// ------------------------------------------------------------------ AI
function strength(h, game) {
  if (game === 'null') { const hi = h.filter((c) => ['A', 'K', 'Q', 'J', '10'].includes(c.rank)).length; return 11 - hi * 2.2; }
  let v = 0;
  for (const c of h) {
    if (c.rank === 'J') v += c.suit === 'C' ? 2.5 : 2;
    else if (game !== 'G' && c.suit === game) v += c.rank === 'A' ? 1.5 : c.rank === '10' ? 1.1 : 0.8;
    else if (c.rank === 'A') v += 1.3;
    else if (c.rank === '10' && h.some((x) => x.suit === c.suit && x.rank === 'A')) v += 0.9;
  }
  for (const su of JORDER) if (su !== game && !h.some((c) => c.suit === su && c.rank !== 'J')) v += 0.5;
  if (game === 'G') v = v * 0.9 + (h.filter((c) => c.rank === 'J').length >= 3 ? 1.5 : -3);
  return v;
}

function bestGame(h, skatBonus = 0) {
  let best = null;
  for (const g of ['C', 'S', 'H', 'D', 'G']) {
    const st = strength(h, g) + skatBonus;
    const m = matadors(h, g);
    const val = BASE[g] * (m.n + 1 + 1);
    if (!best || st > best.st || (st === best.st && val > best.val)) best = { g, st, val };
  }
  return best;
}

function aiBidAction(s, p) {
  const b = s.bid;
  const best = bestGame(s.hands[p], 1);
  const limit = best.st >= 8.5 ? best.val : 0;
  if (b.step === 'last') return limit >= 18 ? 'yes' : 'pass';
  if (b.step === 'call') return nextBid(b.value) <= limit ? 'bid' : 'pass';
  return b.value <= limit ? 'yes' : 'pass';
}

function aiAfterWin(s, p) {
  if (s.phase === 'skat') return bestGame(s.hands[p]).st >= 11 ? playHand(s, p) : takeSkat(s, p);
  if (s.phase === 'discard') {
    const g = bestGame(s.hands[p]).g;
    const nonTrump = s.hands[p].filter((c) => eff(c, g) !== 'T' && c.rank !== 'A');
    const pool = (nonTrump.length >= 2 ? nonTrump : s.hands[p].filter((c) => eff(c, g) !== 'T'));
    const sortKey = (c) => s.hands[p].filter((x) => x.suit === c.suit && eff(x, g) !== 'T').length * 10 - points(c);
    const pick = (pool.length >= 2 ? pool : s.hands[p]).slice().sort((a, b) => sortKey(a) - sortKey(b)).slice(0, 2);
    return discard(s, p, pick.map((c) => c.id));
  }
  // Declare the best suit game that covers the bid (fall back to best anyway).
  const cards = [...s.hands[p], ...s.skat];
  let choice = null;
  for (const g of ['C', 'S', 'H', 'D', 'G']) {
    const m = matadors(cards, g);
    const val = BASE[g] * (m.n + 1 + (s.hand ? 1 : 0));
    const st = strength(s.hands[p], g);
    if (val >= s.bid.value && (!choice || st > choice.st)) choice = { g, st };
  }
  return declare(s, p, (choice ?? bestGame(s.hands[p])).g);
}

function aiPlay(s, p) {
  const L = legal(s, p);
  if (L.length === 1) return L[0].id;
  const isNull = s.game === 'null' || s.game === 'ouvert';
  const P = (c) => power(c, s.game);
  if (isNull) {
    if (p === s.declarer) {
      if (!s.trick.length) return L.sort((a, b) => P(a) - P(b))[0].id;
      const losing = L.filter((c) => winnerIdx([...s.trick, { seat: p, card: c }], s.game) !== s.trick.length);
      return (losing.length ? losing.sort((a, b) => P(b) - P(a)) : L.sort((a, b) => P(a) - P(b)))[0].id;
    }
    return L.sort((a, b) => P(a) - P(b))[0].id;
  }
  const t = s.trick;
  const isDecl = p === s.declarer;
  if (!t.length) {
    const trumps = L.filter((c) => eff(c, s.game) === 'T');
    if (isDecl && trumps.length >= 3) return trumps.sort((a, b) => P(b) - P(a))[0].id;
    const aces = L.filter((c) => c.rank === 'A' && eff(c, s.game) !== 'T');
    if (aces.length) return aces[0].id;
    return L.slice().sort((a, b) => points(a) - points(b) || P(a) - P(b))[0].id;
  }
  const wi = winnerIdx(t, s.game);
  const partnerWinning = !isDecl && t[wi].seat !== s.declarer;
  const wins = (c) => winnerIdx([...t, { seat: p, card: c }], s.game) === t.length;
  const last = t.length === 2;
  if (partnerWinning && (last || t[wi].seat !== s.declarer)) {
    // Schmier: give partner points when the trick looks safe.
    if (last || P(t[wi].card) >= 100) return L.slice().sort((a, b) => points(b) - points(a) || P(a) - P(b))[0].id;
    return L.slice().sort((a, b) => points(a) - points(b) || P(a) - P(b))[0].id;
  }
  const w = L.filter(wins);
  const trickPts = t.reduce((a, x) => a + points(x.card), 0);
  if (w.length && (trickPts >= 4 || last || isDecl)) return w.sort((a, b) => P(a) - P(b))[0].id;
  return L.slice().sort((a, b) => points(a) - points(b) || P(a) - P(b))[0].id;
}

const RULES = `<p>Three players; 32 cards (7–A). Each gets ten, and two go face down as the <b>skat</b>. The highest bidder becomes the <b>declarer</b> and plays alone against the other two.</p>
<h3>Bidding</h3><p>Middlehand bids to Forehand (18, 20, 22, 23…); Forehand says "yes" or passes. Then Rearhand bids to the survivor. Bid no more than the game you can play is worth.</p>
<h3>Games</h3><ul><li><b>Suit</b> (♣ 12, ♠ 11, ♥ 10, ♦ 9) and <b>Grand</b> (24): all four jacks are top trumps (♣♠♥♦), then the trump suit A 10 K Q 9 8 7.</li><li>Value = base × (matadors "with/without" + 1, +1 hand, +1 schneider, +1 schwarz).</li><li><b>Null</b> (23; hand 35, ouvert 46, ouvert hand 59): no trumps, and the declarer must take no tricks.</li></ul>
<h3>Winning</h3><p>Card points: A 11, 10 10, K 4, Q 3, J 2 (120 total). The declarer needs 61 including the skat. A win scores the game value; a loss costs double. If the game is worth less than the bid, the declarer loses.</p>`;

export default {
  id: 'skat', title: 'Skat', version: 1, seats: 3, rulesHTML: RULES,
  settings: [{ key: 'deals', label: 'Game length', options: [[12, '12 deals'], [24, '24 deals'], [36, '36 deals']], default: 12 }],
  newGame({ names, seed, opts }) {
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 3), opts, scores: [0, 0, 0], dealNo: 0, dealer: 2, log: [], fx: [], partners: false });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'trickDone') return 'auto';
    if (s.phase === 'handOver') return 0;
    return s.turn;
  },
  delay: (s) => (s.phase === 'trickDone' ? 1100 : 850),
  act(state, a) {
    const s = clone(state);
    switch (a.act) {
      case 'bid': return bidAction(s, 0, a.v === 'pass' ? 'pass' : 'bid');
      case 'last': return lastChance(s, 0, a.v);
      case 'skat': return takeSkat(s, 0);
      case 'hand': return playHand(s, 0);
      case 'discard': return discard(s, 0, a.ids ?? []);
      case 'declare': s.declCards = [...s.hands[0], ...s.skat]; return declare(s, 0, a.g);
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
    if (s.phase === 'bid') {
      if (s.bid.step === 'last') return lastChance(s, s.turn, aiBidAction(s, s.turn) === 'yes' ? 'yes' : 'pass');
      const d = aiBidAction(s, s.turn);
      return bidAction(s, s.turn, d === 'pass' ? 'pass' : 'bid');
    }
    if (s.phase === 'skat' || s.phase === 'discard' || s.phase === 'declare') {
      if (s.phase === 'declare') s.declCards = [...s.hands[s.turn], ...s.skat];
      return aiAfterWin(s, s.turn);
    }
    return play(s, s.turn, aiPlay(s, s.turn));
  },
  view(s, ui) {
    const my = s.turn === 0;
    let overlay = '', banner = '';
    const b = s.bid;
    if (s.phase === 'bid' && my) {
      if (b.step === 'last') overlay = panel('Play at 18?', `<p>Both other players passed. You may play at 18 or pass (everyone passes: redeal).</p><div class="row">${btn('Pass', 'last', 'data-v="pass"')}${btn('Play', 'last', 'data-v="yes"', true)}</div>`);
      else if (b.step === 'call') overlay = panel('Your bid', `<p>${b.value ? `${who(s, b.listener)} holds ${b.value}.` : `Bid to ${who(s, b.listener)}.`}</p><div class="row">${btn('Pass', 'bid', 'data-v="pass"')}${btn(`Bid ${nextBid(b.value)}`, 'bid', 'data-v="bid"', true)}</div>`);
      else overlay = panel(`${who(s, b.caller)} bids ${b.value}`, `<p>Do you hold it?</p><div class="row">${btn('Pass', 'bid', 'data-v="pass"')}${btn('Yes', 'bid', 'data-v="yes"', true)}</div>`);
    } else if (s.phase === 'skat' && my) {
      overlay = panel(`You won the bid at ${s.bid.value}`, '<p>Pick up the skat (then bury two cards), or play a hand game for an extra multiplier.</p>' + `<div class="row">${btn('Play hand', 'hand')}${btn('Pick up the skat', 'skat', '', true)}</div>`);
    } else if (s.phase === 'discard' && my) {
      overlay = panel('Bury two cards', `<p>Their points count for you. (${ui.selected.size}/2)</p><div class="row">${btn('Put in skat', 'discard', `data-with-sel ${ui.selected.size === 2 ? '' : 'disabled'}`, true)}</div>`);
    } else if (s.phase === 'declare' && my) {
      const cards = [...s.hands[0], ...s.skat];
      const opt = (g) => { const m = matadors(cards, g); const v = BASE[g] * (m.n + 1 + (s.hand ? 1 : 0)); return btn(`${g === 'G' ? 'Grand' : `${suitSpan(g)} ${SUIT_TITLE[g]}`}<small style="display:block;font-weight:500">${m.with ? 'with' : 'without'} ${m.n} · ${v}${v < s.bid.value ? ' (too low)' : ''}</small>`, 'declare', `data-g="${g}"`); };
      overlay = panel('Declare your game', `<p>Bid: ${s.bid.value}. Base values shown with your current matadors${s.hand ? ' and hand' : ''}; schneider and schwarz add more.</p>
        <div class="row">${['C', 'S', 'H', 'D', 'G'].map(opt).join('')}</div>
        <div class="row" style="margin-top:8px">${btn(`Null (${s.hand ? 35 : 23})`, 'declare', 'data-g="null"')}${btn(`Null ouvert (${s.hand ? 59 : 46})`, 'declare', 'data-g="ouvert"')}</div>`, 'max-width:620px');
    } else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      const tally = scoreTable(s.names.map((n, i) => (i === 0 ? 'You' : n)), [['Score', ...s.scores.map((v) => `<b>${v}</b>`)]]);
      overlay = panel(s.phase === 'gameOver' ? (s.scores[0] === Math.max(...s.scores) ? 'You win!' : `${s.names[s.scores.indexOf(Math.max(...s.scores))]} wins`) : `${who(s, s.declarer)}: ${GNAME[s.game]}`,
        `<div class="verdict ${(s.declarer === 0) === r.won ? 'good' : 'bad'}">${r.won ? 'Won' : 'Lost'} ${r.delta > 0 ? '+' : ''}${r.delta}${r.overbid ? ' (overbid)' : ''}</div>
        <p>${r.detail}${s.game === 'null' || s.game === 'ouvert' ? '' : `<br>Declarer's card points: ${r.declPts} (incl. skat)`}</p>${tally}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next deal', 'next', '', true)}</div>`);
    } else if (s.phase === 'trickDone') banner = `${who(s, s.winner)} ${s.winner === 0 ? 'take' : 'takes'} it`;
    else if (s.phase === 'play') banner = my ? (s.trick.length ? 'Follow suit (jacks are trump)' : 'Your lead') : `${who(s, s.turn)} to play`;
    else if (s.turn !== null) banner = `${who(s, s.turn)} is thinking…`;
    const ouvertShow = s.game === 'ouvert' && s.trickNo >= 1 && s.declarer !== 0;
    const role = (i) => (s.declarer === i ? `Declarer${s.game ? ` · ${GNAME[s.game]}` : ''}` : i === s.F ? 'Forehand' : i === s.M ? 'Middlehand' : 'Rearhand');
    const declPts = s.declarer !== null ? s.taken[s.declarer].reduce((t, c) => t + points(c), 0) : 0;
    return {
      subtitle: `Deal ${s.dealNo} of ${s.opts.deals}${s.bid.value ? ` · bid ${s.bid.value}` : ''}`,
      scores: s.names.map((n, i) => ({ label: i === 0 ? 'You' : n, value: s.scores[i], us: i === 0 })),
      seats: [0, 1, 2].map((i) => ({ seat: i, pos: POS3[i], name: s.names[i], mine: i === 0, turn: s.turn === i, dealer: s.dealer === i, count: i && !(ouvertShow && i === s.declarer) ? s.hands[i].length : 0, faceUp: ouvertShow && i === s.declarer ? s.hands[i] : null, tag: role(i) })),
      hand: s.phase === 'discard' && my ? { cards: s.hands[0], legal: s.hands[0].map((c) => c.id), mode: 'select', maxSelect: 2 }
        : { cards: s.hands[0], legal: s.phase === 'play' && my ? legal(s, 0).map((c) => c.id) : null },
      center: trickHTML(s.trick.map((x) => ({ pos: POS3[x.seat], card: x.card })), s.phase === 'trickDone' ? POS3[s.winner] : null),
      banner, overlay,
      // Suit games show their suit (the jacks rank above it); in a grand only the jacks are trump; null has none.
      trump: 'CSHD'.includes(s.game ?? 'x') ? { suit: s.game } : s.game === 'G' ? { suit: 'J', caption: 'Grand: jacks only' } : null,
      side: [{ title: 'Game', html: s.game ? `<div class="big">${GNAME[s.game]}${s.hand ? ' · hand' : ''}</div><div>Declarer: ${who(s, s.declarer)} · bid ${s.bid.value}</div>${s.game !== 'null' && s.game !== 'ouvert' ? `<div>Declarer has ${declPts} card points</div>` : ''}` : `<div>Bidding: ${s.bid.value || 'none yet'}</div>` }],
    };
  },
};
