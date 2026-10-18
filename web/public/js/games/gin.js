// Gin Rummy (2 players): draw, discard, knock with ≤10 deadwood (or the Oklahoma limit), gin bonus, undercuts.
import { deck, shuffle, sortCards, rngOf, lo, pipValue, SYM } from '../core/cards.js';
import { clone, log, fx, must } from './lib/common.js';
import { panel, btn, scoreTable, cardsRow } from '../core/table.js';
import { cardHTML, backHTML } from '../skin.js';

const sortHand = (h) => sortCards(h, { rankFn: lo, desc: false });
/** Match length option: one game, first to N points (game totals), or first to win N games. */
export function matchRule(v) {
  const m = /^([pg])(\d+)$/.exec(v ?? '');
  return m ? { kind: m[1] === 'p' ? 'points' : 'games', n: Number(m[2]) } : null;
}

/** All candidate melds (sets of 3–4, runs of 3+ in a suit; ace low) as arrays of indexes into cards. */
function candidateMelds(cards) {
  const out = [];
  const byRank = {};
  cards.forEach((c, i) => (byRank[c.rank] ??= []).push(i));
  for (const idx of Object.values(byRank)) {
    if (idx.length >= 3) out.push(idx.slice(0, 3));
    if (idx.length === 4) { out.push(idx); for (let k = 0; k < 4; k++) out.push(idx.filter((_, j) => j !== k)); }
  }
  for (const su of ['S', 'H', 'C', 'D']) {
    const xs = cards.map((c, i) => ({ c, i })).filter((x) => x.c.suit === su).sort((a, b) => lo(a.c) - lo(b.c));
    for (let a = 0; a < xs.length; a++) {
      for (let b = a + 2; b < xs.length; b++) {
        let ok = true;
        for (let k = a + 1; k <= b; k++) if (lo(xs[k].c) !== lo(xs[k - 1].c) + 1) { ok = false; break; }
        if (!ok) break;
        out.push(xs.slice(a, b + 1).map((x) => x.i));
      }
    }
  }
  return out;
}

/** Minimum-deadwood arrangement: { deadwood, melds: [[cards]], dead: [cards] }. */
export function arrange(cards) {
  const melds = candidateMelds(cards).map((m) => ({ m, mask: m.reduce((t, i) => t | (1 << i), 0) }));
  const memo = new Map();
  const full = (1 << cards.length) - 1;
  function best(used) {
    if (used === full) return { dw: 0, picks: [] };
    if (memo.has(used)) return memo.get(used);
    let i = 0; while (used & (1 << i)) i++;
    let r = best(used | (1 << i));
    r = { dw: r.dw + pipValue(cards[i]), picks: r.picks };
    for (const x of melds) {
      if (!(x.mask & (1 << i)) || (x.mask & used)) continue;
      const q = best(used | x.mask);
      if (q.dw < r.dw) r = { dw: q.dw, picks: [x.m, ...q.picks] };
    }
    memo.set(used, r);
    return r;
  }
  const r = best(0);
  const inMeld = new Set(r.picks.flat());
  return { deadwood: r.dw, melds: r.picks.map((m) => m.map((i) => cards[i])), dead: cards.filter((_, i) => !inMeld.has(i)) };
}

/** Best discard (lowest remaining deadwood; ties discard the higher card). */
function bestDiscard(hand) {
  let best = null;
  for (const c of hand) {
    const rest = hand.filter((x) => x.id !== c.id);
    const dw = arrange(rest).deadwood;
    if (!best || dw < best.dw || (dw === best.dw && pipValue(c) > pipValue(best.c))) best = { c, dw };
  }
  return best;
}

/** Defender lays off deadwood onto the knocker's melds (runs extend at either end, sets take a 4th). */
function layOff(knockerMelds, defender) {
  const melds = knockerMelds.map((m) => m.slice());
  const arr = arrange(defender);
  let dead = arr.dead.slice();
  const laid = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of dead) {
      for (const m of melds) {
        const isSet = m.every((x) => x.rank === m[0].rank);
        const fits = isSet ? (c.rank === m[0].rank && m.length < 4)
          : (c.suit === m[0].suit && (lo(c) === Math.min(...m.map(lo)) - 1 || lo(c) === Math.max(...m.map(lo)) + 1));
        if (fits) { m.push(c); laid.push(c); dead = dead.filter((x) => x.id !== c.id); changed = true; break; }
      }
      if (changed) break;
    }
  }
  return { melds: arr.melds, dead, laid, deadwood: dead.reduce((t, c) => t + pipValue(c), 0) };
}

function deal(s) {
  const rng = rngOf(s);
  s.handNo++; s.dealer = 1 - s.dealer;
  const d = shuffle(deck(), rng);
  s.hands = [sortHand(d.slice(0, 10)), sortHand(d.slice(10, 20))];
  s.discard = [d[20]]; s.stock = d.slice(21);
  s.knockLimit = s.opts.type === 'oklahoma' ? Math.min(10, pipValue(d[20])) : 10;
  if (s.opts.type === 'oklahoma' && d[20].rank === 'A') s.knockLimit = 0;
  s.spadeDouble = s.opts.type === 'oklahoma' && d[20].suit === 'S';
  s.phase = 'offer'; s.turn = 1 - s.dealer; s.offerPasses = 0; s.result = null;
  fx(s, 'shuffle');
  log(s, `Hand ${s.handNo}: the upcard is the ${d[20].rank}${SYM[d[20].suit]}.${s.opts.type === 'oklahoma' ? ` Knock limit ${s.knockLimit}${s.spadeDouble ? ', spades double' : ''}.` : ''}`);
  return s;
}

const name = (s, p) => (p === 0 ? 'You' : s.names[p]);

function take(s, p) {
  must((s.phase === 'offer' || s.phase === 'draw') && s.turn === p, 'Not your turn to draw.');
  const c = s.discard.pop();
  s.hands[p] = sortHand([...s.hands[p], c]);
  s.phase = 'discard'; s.took = c.id;
  fx(s, 'deal');
  log(s, `${name(s, p)} ${p === 0 ? 'take' : 'takes'} the ${c.rank}${SYM[c.suit]}.`);
  return s;
}

function passOffer(s, p) {
  must(s.phase === 'offer' && s.turn === p, 'Not your choice.');
  s.offerPasses++;
  log(s, `${name(s, p)} ${p === 0 ? 'pass' : 'passes'} on the upcard.`);
  if (s.offerPasses === 2) { s.phase = 'draw'; s.turn = 1 - s.dealer; return drawStock(s, s.turn); }
  s.turn = 1 - p;
  return s;
}

function drawStock(s, p) {
  must((s.phase === 'draw') && s.turn === p, 'Not your turn to draw.');
  const c = s.stock.pop();
  s.hands[p] = sortHand([...s.hands[p], c]);
  s.phase = 'discard'; s.took = null;
  fx(s, 'deal');
  if (p === 0) s.drew = c.id;
  return s;
}

function discard(s, p, id, knock) {
  must(s.phase === 'discard' && s.turn === p, 'Not your turn to discard.');
  const c = s.hands[p].find((x) => x.id === id);
  must(c, 'Card not in hand.');
  const rest = s.hands[p].filter((x) => x.id !== id);
  if (knock) {
    const dw = arrange(rest).deadwood;
    must(dw <= s.knockLimit, s.knockLimit === 0 ? 'You need gin to go out this hand.' : `You need ${s.knockLimit} or less deadwood to knock (you'd have ${dw}).`);
  }
  s.hands[p] = rest; s.discard.push(c);
  fx(s, 'card');
  if (knock) return endHand(s, p);
  if (s.stock.length <= 2) {
    s.phase = 'handOver'; s.result = { dead: true }; s.turn = null;
    log(s, 'Only two cards left: the hand is a draw.');
    return s;
  }
  s.phase = 'draw'; s.turn = 1 - p; s.drew = null;
  return s;
}

function endHand(s, k) {
  const d = 1 - k;
  const ka = arrange(s.hands[k]);
  const gin = ka.deadwood === 0;
  const da = gin ? { ...arrange(s.hands[d]), laid: [] } : layOff(ka.melds, s.hands[d]);
  let winner, pts, kind;
  if (gin) { winner = k; pts = 25 + da.deadwood; kind = 'Gin'; }
  else if (da.deadwood <= ka.deadwood) { winner = d; pts = 25 + (ka.deadwood - da.deadwood); kind = 'Undercut'; }
  else { winner = k; pts = da.deadwood - ka.deadwood; kind = 'Knock'; }
  if (s.spadeDouble) pts *= 2;
  s.scores[winner] += pts; s.handsWon[winner]++;
  s.result = { knocker: k, gin, kind, winner, pts, k: ka, d: da };
  log(s, `${name(s, k)} ${gin ? (k === 0 ? 'go gin' : 'goes gin') : (k === 0 ? 'knock' : 'knocks')} with ${ka.deadwood}. ${kind}: ${name(s, winner)} ${winner === 0 ? 'score' : 'scores'} ${pts}.`);
  s.turn = null;
  if (s.scores[winner] >= 100) {
    const loser = 1 - winner;
    const shutout = s.handsWon[loser] === 0;
    let total = (s.scores[winner] + 100) * (shutout ? 2 : 1) + 25 * s.handsWon[winner] - (s.scores[loser] + 25 * s.handsWon[loser]);
    s.final = { winner, total, shutout };
    const m = matchRule(s.opts.match);
    if (m && s.match) {
      s.match.points[winner] += total; s.match.games[winner]++;
      const done = m.kind === 'points' ? s.match.points[winner] >= m.n : s.match.games[winner] >= m.n;
      s.phase = done ? 'gameOver' : 'gameDone';
      log(s, `${name(s, winner)} ${winner === 0 ? 'win' : 'wins'} game ${s.match.gameNo} by ${total}.`);
    } else s.phase = 'gameOver';
    fx(s, winner === 0 ? 'win' : 'lose');
  } else { s.phase = 'handOver'; fx(s, winner === 0 ? 'score' : 'lose'); }
  return s;
}

/** The next game of a match: fresh scores, same players. */
function nextGame(s) {
  must(s.phase === 'gameDone', 'The game is not over.');
  s.match.gameNo++; s.scores = [0, 0]; s.handsWon = [0, 0]; s.final = null;
  return deal(s);
}

function matchLabel(s) {
  const m = s.match && matchRule(s.opts.match);
  if (!m) return '';
  return m.kind === 'points' ? ` · match to ${m.n}: ${s.match.points[0]}–${s.match.points[1]}` : ` · games ${s.match.games[0]}–${s.match.games[1]} (to ${m.n})`;
}

function aiTurn(s, p) {
  const hand = s.hands[p];
  if (s.phase === 'offer' || s.phase === 'draw') {
    const up = s.discard.at(-1);
    const withUp = bestDiscard([...hand, up]);
    // Take the upcard only if it clearly improves the hand (and we wouldn't just throw it back).
    if (withUp.c.id !== up.id && withUp.dw < arrange(hand).deadwood - 2) return take(s, p);
    return s.phase === 'offer' ? passOffer(s, p) : drawStock(s, p);
  }
  const b = bestDiscard(hand);
  const canKnock = b.dw <= s.knockLimit;
  const waitForGin = s.opts.skill === 'expert' && b.dw > 0 && b.dw <= 3 && s.stock.length > 20;
  return discard(s, p, b.c.id, canKnock && !waitForGin);
}

const RULES = `<p>Two players, ten cards each. Form <b>melds</b>: sets (3–4 of a rank) or runs (3+ in sequence in one suit; aces are low). Unmatched cards are <b>deadwood</b> (face cards 10, aces 1).</p>
<h3>Your turn</h3><p>Draw from the stock or take the top discard, then discard one card. At the start of a hand the non-dealer may take the upcard first, then the dealer.</p>
<h3>Knocking</h3><p>If your deadwood after discarding is 10 or less you may <b>knock</b>. Your opponent can lay off cards on your melds. Lower deadwood wins the difference. If the opponent ties or beats you it's an <b>undercut</b> (+25 to them). <b>Gin</b> (no deadwood) earns 25 plus the opponent's deadwood.</p>
<h3>Oklahoma Gin</h3><p>The knock limit is the first upcard's value (an ace means gin only), and if it's a spade, the hand counts double.</p>
<p>First to 100 wins, with a 100-point game bonus and 25 per hand won. A shutout doubles it.</p>
<p>A longer match (an option) is won by the first to a points total over several games, or to a number of games won.</p>`;

export default {
  id: 'gin', title: 'Gin Rummy', version: 1, seats: 2, rulesHTML: RULES,
  settings: [
    { key: 'type', label: 'Game type', options: [['gin', 'Gin Rummy'], ['oklahoma', 'Oklahoma Gin']], default: 'gin' },
    { key: 'match', label: 'Match', options: [['game', 'One game to 100'], ['p300', 'First to 300 points'], ['p500', 'First to 500 points'], ['p1000', 'First to 1,000 points'], ['g3', 'First to win 3 games'], ['g5', 'First to win 5 games'], ['g7', 'First to win 7 games']], default: 'game' },
    { key: 'skill', label: 'Opponent plays', options: [['intermediate', 'Intermediate (knocks early)'], ['expert', 'Expert (holds for gin)']], default: 'intermediate' },
  ],
  newGame({ names, seed, opts }) {
    const match = matchRule(opts.match) ? { points: [0, 0], games: [0, 0], gameNo: 1 } : null;
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 2), opts, scores: [0, 0], handsWon: [0, 0], match, handNo: 0, dealer: 1, log: [], fx: [], partners: false });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'handOver' || s.phase === 'gameDone') return 0;
    return s.turn;
  },
  delay: () => 900,
  act(state, a) {
    const s = clone(state);
    switch (a.act) {
      case 'take': return take(s, 0);
      case 'pass': return passOffer(s, 0);
      case 'stock': return drawStock(s, 0);
      case 'discard': case 'knock':
        must(a.ids?.length === 1, 'Select the card to discard.');
        return discard(s, 0, a.ids[0], a.act === 'knock');
      case 'next': return deal(s);
      case 'nextgame': return nextGame(s);
      case 'again': return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
      default: throw new Error('Unknown action');
    }
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'handOver') return deal(s);
    if (s.phase === 'gameDone') return nextGame(s);
    return aiTurn(s, s.turn);
  },
  view(s, ui) {
    const my = s.turn === 0;
    const sel = ui.selected.size === 1 ? [...ui.selected][0] : null;
    const myDw = s.hands[0].length > 10 ? (sel ? arrange(s.hands[0].filter((c) => c.id !== sel)).deadwood : bestDiscard(s.hands[0]).dw) : arrange(s.hands[0]).deadwood;
    let overlay = '', banner = '', actions = '';
    if (s.phase === 'offer' && my) overlay = panel('The upcard', `<p>Take the ${s.discard.at(-1).rank}${SYM[s.discard.at(-1).suit]} or pass${s.offerPasses ? '' : ' (your opponent gets the next chance)'}.</p><div class="row">${btn('Pass', 'pass')}${btn('Take it', 'take', '', true)}</div>`);
    if (s.phase === 'discard' && my) {
      const canKnock = sel && myDw <= s.knockLimit;
      banner = sel ? `Deadwood after discarding: ${myDw}` : 'Select a card to discard';
      actions = `${btn('Discard', 'discard', `data-with-sel ${sel ? '' : 'disabled'}`, true)}${btn(myDw === 0 && sel ? 'Gin!' : 'Knock', 'knock', `data-with-sel ${canKnock ? '' : 'disabled'}`)}`;
    }
    if (s.phase === 'handOver' || s.phase === 'gameDone' || s.phase === 'gameOver') {
      const r = s.result;
      const m = s.match && matchRule(s.opts.match);
      const ended = s.phase !== 'handOver';
      const body = r.dead ? '<p>The stock ran down to two cards: no score.</p>' : `<div class="verdict ${r.winner === 0 ? 'good' : 'bad'}">${r.kind}: ${name(s, r.winner)} ${r.winner === 0 ? 'score' : 'scores'} ${r.pts}</div>
        <p style="margin-bottom:4px">${name(s, r.knocker)} (${r.k.deadwood} deadwood):</p>${r.k.melds.map((m) => cardsRow(m, 40)).join('')}${r.k.dead.length ? `<p style="margin:4px 0">Deadwood:</p>${cardsRow(r.k.dead, 40)}` : ''}
        <p style="margin:8px 0 4px">${name(s, 1 - r.knocker)} (${r.d.deadwood} deadwood${r.d.laid.length ? `, laid off ${r.d.laid.length}` : ''}):</p>${r.d.melds.map((m) => cardsRow(m, 40)).join('')}${r.d.dead.length ? cardsRow(r.d.dead, 40) : ''}`;
      const fin = ended ? `<div class="verdict ${s.final.winner === 0 ? 'good' : 'bad'}">${s.final.winner === 0 ? 'You win the game' : `${s.names[1]} wins the game`} by ${s.final.total}${s.final.shutout ? ' (shutout!)' : ''}</div>` : '';
      const matchRow = m ? [m.kind === 'points' ? ['Match points', s.match.points[0], s.match.points[1]] : ['Games won', s.match.games[0], s.match.games[1]]] : [];
      const champ = m && s.phase === 'gameOver' ? `<div class="verdict ${s.final.winner === 0 ? 'good' : 'bad'}">${s.final.winner === 0 ? 'You win the match!' : `${s.names[1]} wins the match`}</div>` : '';
      const next = s.phase === 'gameOver' ? btn(m ? 'New match' : 'Play again', 'again', '', true) : s.phase === 'gameDone' ? btn('Next game', 'nextgame', '', true) : btn('Next hand', 'next', '', true);
      overlay = panel(s.phase === 'gameOver' ? (m ? 'Match over' : 'Game over') : s.phase === 'gameDone' ? `Game ${s.match.gameNo} over` : `Hand ${s.handNo}`, `<div style="max-height:52vh;overflow:auto">${body}</div>${fin}${champ}
        ${scoreTable(['You', s.names[1]], [['Score', s.scores[0], s.scores[1]], ['Hands won', s.handsWon[0], s.handsWon[1]], ...matchRow])}
        <div class="row" style="justify-content:flex-end">${next}</div>`, 'max-width:640px');
    }
    if (!banner) banner = s.phase === 'draw' && my ? 'Draw from the stock or take the discard' : s.phase === 'offer' && my ? '' : my ? '' : s.phase.startsWith('hand') || s.phase.startsWith('game') ? '' : `${s.names[1]} is thinking…`;
    const canDraw = s.phase === 'draw' && my;
    const center = `<div class="row" style="gap:28px;--card-w:84px">
      <div class="pile"><button class="pile-btn" data-act="stock" ${canDraw ? '' : 'disabled'} aria-label="Draw from the stock">${backHTML()}</button><span>Stock · ${s.stock.length}</span></div>
      <div class="pile"><button class="pile-btn" data-act="take" ${canDraw ? '' : 'disabled'} aria-label="Take the discard">${s.discard.length ? cardHTML(s.discard.at(-1)) : '<span class="empty-slot"></span>'}</button><span>Discard</span></div></div>
      ${actions ? `<div class="hand-actions">${actions}</div>` : ''}`;
    return {
      subtitle: `${s.opts.type === 'oklahoma' ? `Oklahoma · knock ≤ ${s.knockLimit}` : 'Knock with 10 or less'} · game to 100${matchLabel(s)}`,
      scores: [{ label: 'You', value: s.scores[0], us: true }, { label: s.names[1], value: s.scores[1] }],
      seats: [{ seat: 0, pos: 'south', name: s.names[0], mine: true, turn: my, dealer: s.dealer === 0 }, { seat: 1, pos: 'north', name: s.names[1], count: s.hands[1].length, turn: s.turn === 1, dealer: s.dealer === 1 }],
      hand: s.phase === 'discard' && my ? { cards: s.hands[0], legal: s.hands[0].map((c) => c.id), mode: 'select', maxSelect: 1 } : { cards: s.hands[0], legal: null },
      center, banner, overlay,
      side: [{ title: 'Your hand', html: `<div class="big">${myDw} deadwood</div><div style="font-size:13px;color:var(--ink-3)">${s.hands[0].length > 10 ? (sel ? 'If you discard the selected card' : 'After your best discard') : 'Best arrangement of your cards'}</div>` }],
    };
  },
};
