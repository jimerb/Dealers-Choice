// Cribbage (2 players) to 121: discard to the crib, peg to 31, count hands and crib.
import { deck, shuffle, sortCards, rngOf, lo, pipValue, SYM } from '../core/cards.js';
import { clone, log, fx, must } from './lib/common.js';
import { panel, btn, cardsRow } from '../core/table.js';
import { cardHTML, backHTML } from '../skin.js';
import { cribbageBoardHTML, trayHTML } from '../core/pieces.js';

const sortHand = (h) => sortCards(h, { rankFn: lo, bySuit: false, desc: false });
const label = (c) => `${c.rank}${SYM[c.suit]}`;
const WIN = 121;
const GAMES_TO_WIN = 4; // best of seven
/** The game is over (a match may still go on). */
const over = (s) => s.phase === 'gameOver' || s.phase === 'gameDone';
const manual = (s) => s.opts.counting === 'manual';

/** Score a 4-card hand plus starter. Returns { total, items: [[name, pts]] }. */
export function scoreHand(hand, starter, isCrib = false) {
  const all = [...hand, starter];
  const items = [];
  // Fifteens
  let fifteens = 0;
  for (let m = 1; m < 32; m++) {
    let t = 0;
    for (let i = 0; i < 5; i++) if (m & (1 << i)) t += pipValue(all[i]);
    if (t === 15) fifteens++;
  }
  if (fifteens) items.push([`Fifteen ×${fifteens}`, fifteens * 2]);
  // Pairs
  let pairs = 0;
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) if (all[i].rank === all[j].rank) pairs++;
  if (pairs) items.push([`Pair${pairs > 1 ? ` ×${pairs}` : ''}`, pairs * 2]);
  // Runs (with multiplicity)
  const counts = Array(14).fill(0);
  all.forEach((c) => counts[lo(c)]++);
  let runPts = 0;
  for (let start = 1; start <= 13; start++) {
    let len = 0, mult = 1;
    while (start + len <= 13 && counts[start + len]) { mult *= counts[start + len]; len++; }
    if (len >= 3 && (start === 1 || !counts[start - 1])) { runPts += len * mult; }
  }
  if (runPts) items.push(['Runs', runPts]);
  // Flush
  if (hand.every((c) => c.suit === hand[0].suit)) {
    if (starter.suit === hand[0].suit) items.push(['Flush of five', 5]);
    else if (!isCrib) items.push(['Flush of four', 4]);
  }
  // Nobs
  if (hand.some((c) => c.rank === 'J' && c.suit === starter.suit)) items.push(['His nobs', 1]);
  return { total: items.reduce((t, [, p]) => t + p, 0), items };
}

/** Points for the latest card played during pegging. */
function pegPoints(pile, count) {
  const items = [];
  if (count === 15) items.push(['Fifteen', 2]);
  if (count === 31) items.push(['Thirty-one', 2]);
  let same = 1;
  for (let i = pile.length - 2; i >= 0 && pile[i].rank === pile.at(-1).rank; i--) same++;
  if (same >= 2) items.push([{ 2: 'Pair', 3: 'Three of a kind', 4: 'Four of a kind' }[same], { 2: 2, 3: 6, 4: 12 }[same]]);
  for (let n = pile.length; n >= 3; n--) {
    const v = pile.slice(-n).map(lo).sort((a, b) => a - b);
    if (v.every((x, i) => i === 0 || x === v[i - 1] + 1)) { items.push([`Run of ${n}`, n]); break; }
  }
  return items;
}

function addPoints(s, p, pts, why) {
  if (!pts || over(s)) return s;
  s.prev = [...(s.prev ?? [0, 0])]; s.prev[p] = s.scores[p]; // the back peg (display only)
  s.scores[p] = Math.min(WIN, s.scores[p] + pts);
  log(s, `${p === 0 ? 'You peg' : `${s.names[p]} pegs`} ${pts} (${why}).`);
  fx(s, 'score');
  if (s.scores[p] >= WIN) {
    s.winner = p; s.turn = null;
    const other = s.scores[1 - p];
    s.skunk = other < 61 ? 'double skunk' : other < 91 ? 'skunk' : null;
    s.phase = 'gameOver';
    if (s.match) {
      // In a match a skunk counts as two games and a double skunk as three.
      s.match.games[p] += s.skunk === 'double skunk' ? 3 : s.skunk ? 2 : 1;
      if (s.match.games[p] < GAMES_TO_WIN) s.phase = 'gameDone';
    }
    fx(s, p === 0 ? 'win' : 'lose');
  }
  return s;
}

function deal(s) {
  const rng = rngOf(s);
  s.handNo++; s.dealer = s.handNo === 1 ? s.dealer : 1 - s.dealer;
  const d = shuffle(deck(), rng);
  s.hands = [sortHand(d.slice(0, 6)), sortHand(d.slice(6, 12))];
  s.rest = d.slice(12);
  s.crib = []; s.starter = null; s.phase = 'discard'; s.turn = 0;
  s.count = 0; s.pile = []; s.played = [[], []]; s.go = [false, false]; s.lastPlayer = null; s.show = null; s.pegHands = null;
  fx(s, 'shuffle');
  log(s, `Hand ${s.handNo}: ${s.dealer === 0 ? 'your crib' : `${s.names[1]}'s crib`}.`);
  return s;
}

function aiDiscard(hand, isDealer) {
  let best = null;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const keep = hand.filter((_, k) => k !== i && k !== j);
    const toss = [hand[i], hand[j]];
    const seen = new Set(hand.map((c) => c.id));
    let total = 0, n = 0;
    for (const st of deck()) { if (seen.has(st.id)) continue; total += scoreHand(keep, st).total; n++; }
    let v = total / n;
    const tossVal = (pipValue(toss[0]) + pipValue(toss[1]) === 15 ? 2 : 0) + (toss[0].rank === toss[1].rank ? 2 : 0) + (toss.some((c) => c.rank === '5') ? 1 : 0);
    v += isDealer ? tossVal : -tossVal;
    if (!best || v > best.v) best = { v, ids: [toss[0].id, toss[1].id] };
  }
  return best.ids;
}

function discard(s, ids) {
  must(s.phase === 'discard' && ids?.length === 2, 'Choose two cards for the crib.');
  const ai = aiDiscard(s.hands[1], s.dealer === 1);
  for (const [p, toss] of [[0, ids], [1, ai]]) {
    s.crib.push(...s.hands[p].filter((c) => toss.includes(c.id)));
    s.hands[p] = s.hands[p].filter((c) => !toss.includes(c.id));
  }
  s.pegHands = [s.hands[0].slice(), s.hands[1].slice()];
  s.starter = s.rest[Math.floor(rngOf(s)() * s.rest.length)];
  fx(s, 'flip');
  log(s, `The starter is the ${label(s.starter)}.`);
  if (s.starter.rank === 'J') addPoints(s, s.dealer, 2, 'his heels');
  if (over(s)) return s;
  s.phase = 'peg'; s.turn = 1 - s.dealer;
  return autoGo(s);
}

const canPlay = (s, p) => s.hands[p].filter((c) => s.count + pipValue(c) <= 31);

/** Handle "go" automatically when the player to move can't play. */
function autoGo(s) {
  while (s.phase === 'peg') {
    if (!s.hands[0].length && !s.hands[1].length) {
      if (s.count > 0 && s.count < 31 && s.lastPlayer !== null) addPoints(s, s.lastPlayer, 1, 'last card');
      if (over(s)) return s;
      return startShow(s);
    }
    const p = s.turn;
    if (canPlay(s, p).length) return s;
    const o = 1 - p;
    if (canPlay(s, o).length) { if (!s.go[p] && s.hands[p].length) log(s, `${p === 0 ? 'You say' : `${s.names[p]} says`} "Go".`); s.go[p] = true; s.turn = o; return s; }
    // Neither can play: last player scores 1 for the go and the count resets.
    if (s.count < 31 && s.lastPlayer !== null) addPoints(s, s.lastPlayer, 1, 'go');
    if (over(s)) return s;
    s.count = 0; s.pile = []; s.go = [false, false];
    s.turn = s.lastPlayer === null ? p : 1 - s.lastPlayer;
    if (!s.hands[s.turn].length) s.turn = 1 - s.turn;
  }
  return s;
}

function peg(s, p, id) {
  must(s.phase === 'peg' && s.turn === p, 'Not your turn.');
  const c = s.hands[p].find((x) => x.id === id);
  must(c, 'Card not in hand.');
  must(s.count + pipValue(c) <= 31, `That would go past 31 (count is ${s.count}).`);
  s.hands[p] = s.hands[p].filter((x) => x.id !== id);
  s.played[p].push(c); s.pile.push(c); s.count += pipValue(c); s.lastPlayer = p;
  fx(s, 'card');
  for (const [why, pts] of pegPoints(s.pile, s.count)) { addPoints(s, p, pts, why); if (over(s)) return s; }
  if (s.count === 31) { s.count = 0; s.pile = []; s.go = [false, false]; }
  s.turn = s.go[1 - p] && canPlay(s, p).length ? p : 1 - p;
  if (!s.hands[s.turn].length && s.hands[1 - s.turn].length) s.turn = 1 - s.turn;
  return autoGo(s);
}

function startShow(s) {
  const non = 1 - s.dealer;
  const a = scoreHand(s.pegHands[non], s.starter);
  const b = scoreHand(s.pegHands[s.dealer], s.starter);
  const c = scoreHand(s.crib, s.starter, true);
  s.show = [{ who: non, kind: 'hand', cards: s.pegHands[non], ...a }, { who: s.dealer, kind: 'hand', cards: s.pegHands[s.dealer], ...b }, { who: s.dealer, kind: 'crib', cards: s.crib, ...c }];
  s.showIdx = 0;
  return countOn(s);
}

/** Count in order: non-dealer, dealer, crib. The game can end mid-count. With manual counting
 *  you count your own hand and crib; the opponent always counts correctly. */
function countOn(s) {
  for (; s.showIdx < s.show.length; s.showIdx++) {
    const x = s.show[s.showIdx];
    if (manual(s) && x.who === 0) { s.phase = 'count'; s.turn = 0; return s; }
    addPoints(s, x.who, x.total, x.kind === 'crib' ? 'crib' : 'hand');
    if (over(s)) return s;
  }
  s.phase = 'show'; s.turn = null;
  return s;
}

/** You claim n points for the hand or crib being counted. Points you miss go to your opponent ("Muggins"). */
function claim(s, n) {
  must(s.phase === 'count', 'Nothing to count now.');
  const x = s.show[s.showIdx];
  must(Number.isInteger(n) && n >= 0, 'Choose how many points to claim.');
  must(n <= x.total, 'That is more than this hand is worth. Count again.');
  x.claimed = n;
  addPoints(s, 0, n, x.kind === 'crib' ? 'crib' : 'hand');
  if (over(s)) return s;
  if (n < x.total) {
    x.muggins = x.total - n;
    addPoints(s, 1, x.muggins, 'muggins');
    log(s, `${s.names[1]} calls "Muggins!"`);
    if (over(s)) return s;
  }
  s.showIdx++;
  return countOn(s);
}

/** The next game of a match: the loser of the last game deals first. */
function nextGame(s) {
  must(s.phase === 'gameDone', 'The game is not over.');
  s.match.gameNo++;
  Object.assign(s, { scores: [0, 0], prev: [0, 0], handNo: 0, dealer: 1 - s.winner, winner: null, skunk: null });
  return deal(s);
}

function aiPeg(s, p) {
  const opts = canPlay(s, p);
  let best = null;
  for (const c of opts) {
    const pile = [...s.pile, c]; const count = s.count + pipValue(c);
    let v = pegPoints(pile, count).reduce((t, [, x]) => t + x, 0) * 10;
    if (count === 5 || count === 21) v -= 4;
    if (count < 15 && count + 10 >= 15) v -= 1;
    v -= pipValue(c) * 0.1;
    if (!best || v > best.v) best = { v, c };
  }
  return best.c.id;
}

const HOWTO = {
  goal: 'Be the first to peg 121 points around the board.',
  deal: 'Two players, six cards each. Each of you lays two cards face down in the dealer’s <b>crib</b>, an extra hand that scores for the dealer. Then a <b>starter</b> card is turned up; if it’s a jack, the dealer pegs 2 for <b>his heels</b>. The deal alternates.',
  play: [
    '<b>Pegging</b>: starting with the non-dealer, take turns playing a card face up and adding its value to the running <b>count</b>, which can’t go past 31. Face cards count 10 and aces 1.',
    'You peg as you play: 2 for bringing the count to 15, 2 for exactly 31, 2 for a pair with the last card, 6 for three of a kind, 12 for four, and 1 a card for a run of three or more among the last cards played (in any order).',
    'If you can’t play without going over 31, you say <b>Go</b> (the game says it for you) and the other player keeps playing while they can. The last card played scores 1 (or 2 for 31), and the count starts again from zero.',
    '<b>The show</b>: when all the cards are played, the non-dealer’s hand is counted, then the dealer’s, then the crib, each together with the starter.',
  ],
  fig: { cards: '5H 10S · 7C 8D', caption: 'Two fifteens: 5 + 10 and 7 + 8, worth 2 each.' },
  score: [
    'In the show: 2 for each combination of cards adding up to 15, 2 for each pair, 1 a card for each run of three or more, 4 for a <b>flush</b> of four in your hand (5 if the starter matches too; the crib only counts a five-card flush), and 1 for holding the jack of the starter’s suit (<b>his nobs</b>).',
    'The game ends the moment someone reaches 121, even in the middle of pegging or the show.',
    'Winning by more than 30 points (your opponent hasn’t reached 91) is a <b>skunk</b>; by more than 60 (under 61) is a <b>double skunk</b>.',
  ],
  options: {
    first: 'who deals the first hand: you, your opponent, or chosen at random.',
    counting: 'Counted for you scores every hand automatically. Count your own (Muggins) asks you how many points your hand and crib are worth: any you miss go to your opponent, who always counts correctly.',
    match: 'one game, or a best-of-seven match (first to four game wins) in which a skunk counts as two games and a double skunk as three.',
  },
  controls: 'To lay away, {click} two cards to select them, then {click} Send to crib. While pegging, {click} a highlighted card to play it. If you count your own hands, {click} the number of points your hand is worth. {Click} Next hand after the show.',
  tip: 'Fives and pairs are gifts in a crib. Keep them for your own crib, and lay away cards that don’t go together when it’s your opponent’s.',
};

export default {
  id: 'cribbage', title: 'Cribbage', version: 1, seats: 2, howto: HOWTO,
  settings: [
    { key: 'first', label: 'First dealer', options: [['me', 'Me'], ['north', 'Opponent'], ['random', 'Random']], default: 'random' },
    { key: 'counting', label: 'Counting hands', options: [['auto', 'Counted for you'], ['manual', 'Count your own (Muggins)']], default: 'auto' },
    { key: 'match', label: 'Match', options: [['single', 'One game'], ['seven', 'Best of seven (skunks count extra)']], default: 'single' },
  ],
  newGame({ names, seed, opts }) {
    const s = { v: 1, seed, rngN: 0, names: names.slice(0, 2), opts, scores: [0, 0], prev: [0, 0], handNo: 0, log: [], fx: [], partners: false };
    s.match = opts.match === 'seven' ? { games: [0, 0], gameNo: 1 } : null;
    s.dealer = opts.first === 'me' ? 0 : opts.first === 'north' ? 1 : (rngOf(s)() < 0.5 ? 0 : 1);
    return deal(s);
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'discard' || s.phase === 'show' || s.phase === 'count' || s.phase === 'gameDone') return 0;
    return s.turn;
  },
  delay: () => 900,
  act(state, a) {
    const s = clone(state);
    if (a.act === 'crib') return discard(s, a.ids);
    if (a.act === 'play') return peg(s, 0, a.id);
    if (a.act === 'next') { must(s.phase === 'show', 'Not done counting.'); return deal(s); }
    if (a.act === 'claim') return claim(s, Number(a.n));
    if (a.act === 'nextgame') return nextGame(s);
    if (a.act === 'again') return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'discard') return discard(s, aiDiscard(s.hands[0], s.dealer === 0));
    if (s.phase === 'show') return deal(s);
    if (s.phase === 'count') return claim(s, s.show[s.showIdx].total);
    if (s.phase === 'gameDone') return nextGame(s);
    return peg(s, s.turn, aiPeg(s, s.turn));
  },
  view(s, ui) {
    let overlay = '', banner = '';
    const opp = s.names[1];
    const whose = (p) => (p === 0 ? 'Your' : `${opp}'s`);
    const cardsOf = (x) => (x.kind === 'crib'
      ? `<div class="row" style="gap:10px">${trayHTML(x.cards.map((c) => cardHTML(c)).join(''), { width: 210 })}<div style="--card-w:40px">${cardHTML(s.starter)}</div></div>` : cardsRow([...x.cards, s.starter], 40));
    const claimed = (x) => (x.claimed === undefined ? '' : `<div style="font-size:13px">You claimed ${x.claimed}${x.muggins ? ` · <b>Muggins!</b> ${opp} took the ${x.muggins} you missed` : ''}</div>`);
    const counts = (x) => `<div style="margin-bottom:10px"><b>${whose(x.who)} ${x.kind}</b> · ${x.total} pts${cardsOf(x)}<div style="font-size:13px;color:var(--ink-2)">${x.items.map(([n, p]) => `${n} ${p}`).join(' · ') || 'Nineteen (nothing)'}</div>${claimed(x)}</div>`;
    const matchLine = s.match ? `<p>Match (first to ${GAMES_TO_WIN} games): you ${s.match.games[0]}, ${opp} ${s.match.games[1]}</p>` : '';
    const ended = `<p>${s.scores[0]} – ${s.scores[1]}${s.skunk ? ` · a ${s.skunk}!` : ''}</p>${matchLine}${s.show ? s.show.map(counts).join('') : ''}`;
    if (s.phase === 'discard') overlay = panel(`${whose(s.dealer)} crib`, `<p>Choose two cards to lay away (${ui.selected.size}/2).</p><div class="row">${btn('Send to crib', 'crib', `data-with-sel ${ui.selected.size === 2 ? '' : 'disabled'}`, true)}</div>`);
    else if (s.phase === 'show') overlay = panel(`Hand ${s.handNo}: the count`, `<div style="max-height:50vh;overflow:auto">${s.show.map(counts).join('')}</div><div class="row" style="justify-content:flex-end">${btn('Next hand', 'next', '', true)}</div>`, 'max-width:520px');
    else if (s.phase === 'count') {
      const x = s.show[s.showIdx];
      const picks = Array.from({ length: 30 }, (_, n) => n).filter((n) => ![19, 25, 26, 27].includes(n)); // scores no hand can make
      overlay = panel(`Count your ${x.kind}`, `${s.show.slice(0, s.showIdx).map(counts).join('')}<div style="margin-bottom:8px"><b>Your ${x.kind}</b>${cardsOf(x)}</div>
        <p>How many points? Any you miss go to ${opp}.</p><div class="row" style="max-width:440px;gap:4px">${picks.map((n) => btn(String(n), 'claim', `data-n="${n}"`)).join('')}</div>`, 'max-width:520px');
    } else if (s.phase === 'gameDone') overlay = panel(s.winner === 0 ? `You win game ${s.match.gameNo}!` : `${opp} wins game ${s.match.gameNo}`, `<div style="max-height:50vh;overflow:auto">${ended}</div><div class="row" style="justify-content:flex-end">${btn('Next game', 'nextgame', '', true)}</div>`, 'max-width:520px');
    else if (s.phase === 'gameOver') overlay = panel(s.match ? (s.winner === 0 ? 'You win the match!' : `${opp} wins the match`) : s.winner === 0 ? 'You win!' : `${opp} wins`, `<div style="max-height:50vh;overflow:auto">${ended}</div><div class="row" style="justify-content:flex-end">${btn(s.match ? 'New match' : 'Play again', 'again', '', true)}</div>`);
    else banner = s.turn === 0 ? `Count is ${s.count}: play a card` : `${opp} is playing…`;
    const board = cribbageBoardHTML([{ name: 'You', score: s.scores[0], prev: s.prev?.[0] ?? 0, peg: 'brass' }, { name: opp, score: s.scores[1], prev: s.prev?.[1] ?? 0, peg: 'red' }]);
    const crib = trayHTML(s.crib.length ? s.crib.map(() => backHTML()).join('') : '', { label: `${whose(s.dealer)} crib`, width: 170 });
    const center = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px">
      <div class="row" style="--card-w:48px;gap:4px;min-height:68px">${s.played[1].map((c) => cardHTML(c)).join('')}</div>
      <div class="row" style="gap:18px;--card-w:54px;justify-content:center;align-items:flex-end"><div class="pile">${s.starter ? cardHTML(s.starter) : backHTML()}<span>Starter</span></div>
        <div class="pile"><span class="count-badge" style="width:54px;font-size:24px">${s.count}</span><span>Count</span></div>
        <div class="pile">${crib}</div></div>
      <div class="row" style="--card-w:48px;gap:4px;min-height:68px">${s.played[0].map((c) => cardHTML(c)).join('')}</div></div>`;
    return {
      subtitle: `Hand ${s.handNo} · to 121${s.match ? ` · game ${s.match.gameNo} · games ${s.match.games[0]}–${s.match.games[1]}` : ''}`,
      scores: [{ label: 'You', value: s.scores[0], us: true }, { label: opp, value: s.scores[1] }],
      seats: [{ seat: 0, pos: 'south', name: s.names[0], mine: true, turn: s.turn === 0, dealer: s.dealer === 0 }, { seat: 1, pos: 'north', name: opp, count: s.hands[1].length, turn: s.turn === 1, dealer: s.dealer === 1 }],
      hand: s.phase === 'discard' ? { cards: s.hands[0], legal: s.hands[0].map((c) => c.id), mode: 'select', maxSelect: 2 }
        : { cards: s.hands[0], legal: s.phase === 'peg' && s.turn === 0 ? canPlay(s, 0).map((c) => c.id) : null },
      center: overlay ? '' : center, banner, overlay, board, // a panel takes the center's place below the board
    };
  },
};
