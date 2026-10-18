// Hearts: 4 players, no partners. Avoid hearts (1 each) and the Q♠ (13), or shoot the moon.
import { deck, shuffle, sortCards, hi, rngOf, SYM } from '../core/cards.js';
import { clone, log, fx, who, trickWinner, followSuit, seatsVM, trickPlays, must } from './lib/common.js';
import { trickHTML, panel, btn, scoreTable } from '../core/table.js';
import { trayHTML } from '../core/pieces.js';
import { cardHTML } from '../skin.js';

const PASS_DIRS = [1, 3, 2, 0]; // left, right, across, hold
const DIR_NAME = { 1: 'left', 3: 'right', 2: 'across', 0: 'none' };
const pts = (c) => (c.suit === 'H' ? 1 : c.id === 'QS' ? 13 : 0);

function deal(s) {
  const rng = rngOf(s);
  s.handNo++;
  s.dealer = (s.dealer + 1) % 4;
  const d = shuffle(deck(), rng);
  s.hands = [0, 1, 2, 3].map((i) => sortCards(d.slice(i * 13, i * 13 + 13), { desc: false }));
  s.taken = [0, 0, 0, 0];
  s.trick = []; s.trickNo = 0; s.broken = false; s.result = null;
  const dir = s.opts.passing === 'none' ? 0 : s.opts.passing === 'left' ? 1 : PASS_DIRS[(s.handNo - 1) % 4];
  s.passDir = dir;
  fx(s, 'shuffle');
  log(s, `Hand ${s.handNo}${dir ? `: pass three cards ${DIR_NAME[dir]}` : ': no passing'}.`);
  if (dir) { s.phase = 'pass'; s.turn = 0; } else startPlay(s);
  return s;
}

function startPlay(s) {
  s.phase = 'play';
  const first = s.opts.firstLead === 'left' ? (s.dealer + 1) % 4 : s.hands.findIndex((h) => h.some((c) => c.id === '2C'));
  s.turn = first; s.leader = first;
}

export function legal(s, seat) {
  const hand = s.hands[seat];
  const firstTrick = s.trickNo === 0;
  if (!s.trick.length) {
    if (firstTrick && s.opts.firstLead !== 'left') return hand.filter((c) => c.id === '2C');
    const nonHearts = hand.filter((c) => c.suit !== 'H');
    return s.broken || !nonHearts.length ? hand.slice() : nonHearts;
  }
  let f = followSuit(hand, s.trick);
  if (firstTrick && s.opts.pointsFirst !== 'yes' && f[0].suit !== s.trick[0].card.suit) {
    const clean = f.filter((c) => !pts(c));
    if (clean.length) f = clean;
  }
  return f;
}

function choosePass(hand) {
  const spades = hand.filter((c) => c.suit === 'S').length;
  const danger = (c) => {
    let d = hi(c);
    if (c.id === 'QS') d += spades >= 4 ? -20 : 40;
    if ((c.id === 'AS' || c.id === 'KS') && spades < 4) d += 30;
    if (c.suit === 'H') d += 4;
    const len = hand.filter((x) => x.suit === c.suit).length;
    if (len <= 2) d += 6;
    return d;
  };
  return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3).map((c) => c.id);
}

function doPass(s, myIds) {
  const picks = [0, 1, 2, 3].map((i) => (i === 0 ? myIds : choosePass(s.hands[i])));
  const outgoing = picks.map((ids, i) => s.hands[i].filter((c) => ids.includes(c.id)));
  s.received = [];
  for (let i = 0; i < 4; i++) {
    s.hands[i] = s.hands[i].filter((c) => !picks[i].includes(c.id));
  }
  for (let i = 0; i < 4; i++) {
    const to = (i + s.passDir) % 4;
    s.hands[to] = sortCards([...s.hands[to], ...outgoing[i]], { desc: false });
    if (to === 0) s.received = outgoing[i].map((c) => c.id);
  }
  log(s, `Cards passed ${DIR_NAME[s.passDir]}.`);
  fx(s, 'deal');
  startPlay(s);
}

function play(s, seat, id) {
  const card = s.hands[seat].find((c) => c.id === id);
  must(card, 'That card is not in your hand.');
  must(legal(s, seat).some((c) => c.id === id), s.trick.length ? 'You must follow suit.' : (!s.broken ? "Hearts haven't been broken yet." : 'Not a legal lead.'));
  s.hands[seat] = s.hands[seat].filter((c) => c.id !== id);
  s.trick.push({ seat, card });
  if (card.suit === 'H' || (card.id === 'QS' && s.opts.qsBreaks === 'yes')) s.broken = true;
  fx(s, 'card');
  if (s.trick.length === 4) { s.phase = 'trickDone'; s.turn = null; s.winner = s.trick[trickWinner(s.trick, null)].seat; }
  else s.turn = (seat + 1) % 4;
  return s;
}

function collect(s) {
  const w = s.winner;
  const p = s.trick.reduce((t, x) => t + pts(x.card), 0);
  s.taken[w] += p;
  log(s, `${who(s, w)} ${w === 0 ? 'take' : 'takes'} the trick${p ? ` (${p} point${p > 1 ? 's' : ''})` : ''}.`);
  s.trick = []; s.trickNo++;
  fx(s, 'trick');
  if (s.trickNo === 13) return endHand(s);
  s.phase = 'play'; s.turn = w; s.leader = w;
  return s;
}

function endHand(s) {
  const moon = s.taken.findIndex((t) => t === 26);
  const delta = moon >= 0 ? s.taken.map((_, i) => (i === moon ? 0 : 26)) : s.taken.slice();
  s.scores = s.scores.map((v, i) => v + delta[i]);
  s.result = { delta, moon, taken: s.taken.slice() };
  if (moon >= 0) log(s, `${who(s, moon)} shot the moon!`);
  if (Math.max(...s.scores) >= s.opts.target) {
    s.phase = 'gameOver';
    const low = Math.min(...s.scores);
    s.winners = s.scores.map((v, i) => (v === low ? i : -1)).filter((i) => i >= 0);
    fx(s, s.winners.includes(0) ? 'win' : 'lose');
  } else { s.phase = 'handOver'; fx(s, 'score'); }
  s.turn = null;
  return s;
}

function aiPlay(s, seat) {
  const L = legal(s, seat);
  if (L.length === 1) return L[0].id;
  const t = s.trick;
  if (!t.length) {
    const safe = L.filter((c) => c.id !== 'QS' && !(c.suit === 'S' && hi(c) > 12 && !s.hands[seat].some((x) => x.id === 'QS')));
    const pool = safe.length ? safe : L;
    const nonH = pool.filter((c) => c.suit !== 'H');
    return (nonH.length ? nonH : pool).slice().sort((a, b) => hi(a) - hi(b))[0].id;
  }
  const led = t[0].card.suit;
  if (L[0].suit !== led) {
    // Void: dump the queen, then high hearts, then the highest card.
    const qs = L.find((c) => c.id === 'QS');
    if (qs) return qs.id;
    const hearts = L.filter((c) => c.suit === 'H');
    return (hearts.length ? hearts : L).slice().sort((a, b) => hi(b) - hi(a))[0].id;
  }
  const top = Math.max(...t.filter((x) => x.card.suit === led).map((x) => hi(x.card)));
  const under = L.filter((c) => hi(c) < top);
  if (under.length) return under.sort((a, b) => hi(b) - hi(a))[0].id;
  const trickPts = t.reduce((a, x) => a + pts(x.card), 0);
  const sorted = L.slice().sort((a, b) => hi(a) - hi(b));
  if (t.length === 3 && !trickPts) return sorted.filter((c) => c.id !== 'QS').at(-1)?.id ?? sorted[0].id;
  return sorted[0].id;
}

const HOWTO = {
  goal: 'Take as few points as you can. When someone reaches the end score (100 by default), the lowest score wins.',
  deal: 'Four players, each for themselves, with 13 cards each.',
  play: [
    'Before each hand, choose three cards to <b>pass</b>: to the left, then the right, then across, and every fourth hand there’s no pass.',
    'Whoever holds the 2♣ leads it to the first trick. Follow suit if you can; otherwise play anything. There are no trumps: the highest card of the suit led wins the trick and leads next.',
    'You can’t lead a heart until hearts are <b>broken</b> (a heart has been played), unless you hold nothing else. Playing the Q♠ breaks hearts too (an option can change this).',
    'On the first trick you can’t play a heart or the Q♠ if you have any other card you could play (an option can allow it).',
  ],
  fig: { cards: 'QS · 2H 7H KH', caption: 'The Q♠ is 13 points, and every heart is 1.' },
  score: [
    'Each heart you take is 1 point and the <b>Q♠</b> is 13.',
    'Take all 13 hearts and the Q♠ and you <b>shoot the moon</b>: you score nothing and everyone else gets 26.',
    'When someone reaches the end score, the lowest total wins.',
  ],
  options: {
    passing: 'left, right, across and hold in turn; always to the left; or no passing.',
    firstLead: 'the holder of the 2♣ leads it, or the player left of the dealer leads any card (but not a heart until hearts are broken).',
    qsBreaks: 'whether playing the Q♠ counts as breaking hearts.',
    pointsFirst: 'whether hearts and the Q♠ may be played on the first trick.',
    target: 'the game ends when someone reaches 50 or 100 points.',
  },
  controls: 'To pass, {click} three cards to select them, then {click} Pass cards. To play, {click} a highlighted card; dimmed cards can’t be played right now.',
  tip: 'Pass the A♠ and K♠ unless you have several low spades to protect them; otherwise they can catch the Q♠.',
};

export default {
  id: 'hearts', title: 'Hearts', version: 1, seats: 4, howto: HOWTO,
  settings: [
    { key: 'passing', label: 'Passing', options: [['rotate', 'Left, right, across, hold'], ['left', 'Always left'], ['none', 'No passing']], default: 'rotate' },
    { key: 'firstLead', label: 'First lead', options: [['2c', 'Two of clubs'], ['left', 'Left of dealer']], default: '2c' },
    { key: 'qsBreaks', label: 'Queen of spades breaks hearts', options: [['yes', 'Yes'], ['no', 'No']], default: 'yes' },
    { key: 'pointsFirst', label: 'Points allowed on the first trick', options: [['no', 'No'], ['yes', 'Yes']], default: 'no' },
    { key: 'target', label: 'Game ends at', options: [[50, '50 points'], [100, '100 points']], default: 100 },
  ],
  newGame({ names, seed, opts }) {
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, scores: [0, 0, 0, 0], handNo: 0, dealer: 3, log: [], fx: [], partners: false });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'trickDone') return 'auto';
    if (s.phase === 'pass' || s.phase === 'handOver') return 0;
    return s.turn;
  },
  delay: (s) => (s.phase === 'trickDone' ? 1100 : 650),
  act(state, a) {
    const s = clone(state);
    if (a.act === 'pass') { must(s.phase === 'pass', 'Not passing now.'); must(a.ids?.length === 3, 'Pick exactly three cards to pass.'); doPass(s, a.ids); return s; }
    if (a.act === 'play') { must(s.phase === 'play' && s.turn === 0, 'Wait for your turn.'); return play(s, 0, a.id); }
    if (a.act === 'next') { must(s.phase === 'handOver', 'Hand not over.'); return deal(s); }
    if (a.act === 'again') return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'trickDone') return collect(s);
    if (s.phase === 'pass') { doPass(s, choosePass(s.hands[0])); return s; }
    if (s.phase === 'handOver') return deal(s);
    return play(s, s.turn, aiPlay(s, s.turn));
  },
  view(s, ui) {
    const myTurn = s.phase === 'play' && s.turn === 0;
    let overlay = '', banner = '';
    if (s.phase === 'pass') {
      const n = ui.selected.size;
      // The chosen cards wait in the tray (in hand order); empty slots for the rest.
      const chosen = s.hands[0].filter((c) => ui.selected.has(c.id));
      const tray = trayHTML(chosen.map((c) => cardHTML(c)).join('') + '<span class="empty-slot"></span>'.repeat(3 - chosen.length), { label: `Pass to ${s.names[s.passDir]}`, width: 230 });
      overlay = panel(`Pass three cards ${DIR_NAME[s.passDir]}`, `<p>Pick three cards from your hand. (${n}/3 chosen)</p>${tray}
        <div class="row">${btn('Pass cards', 'pass', `data-with-sel ${n === 3 ? '' : 'disabled'}`, true)}</div>`);
    } else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      const title = s.phase === 'gameOver' ? (s.winners.includes(0) ? 'You win!' : `${s.winners.map((i) => s.names[i]).join(' & ')} ${s.winners.length > 1 ? 'win' : 'wins'}`) : `Hand ${s.handNo} scores`;
      overlay = panel(title, `${r.moon >= 0 ? `<div class="verdict good">${who(s, r.moon)} shot the moon!</div>` : ''}
        ${scoreTable(s.names.map((n, i) => (i === 0 ? 'You' : n)), [['Taken', ...r.taken], ['This hand', ...r.delta.map((d) => `+${d}`)], ['Total', ...s.scores.map((v) => `<b>${v}</b>`)]])}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next hand', 'next', '', true)}</div>`);
    } else if (s.phase === 'trickDone') banner = `${who(s, s.winner)} ${s.winner === 0 ? 'take' : 'takes'} it`;
    else if (myTurn) banner = s.trick.length ? 'Your turn: follow suit if you can' : (s.trickNo === 0 && s.opts.firstLead !== 'left' ? 'Lead the 2♣' : 'Your lead');
    else banner = `${who(s, s.turn)} to play`;
    const winPos = s.phase === 'trickDone' ? ['south', 'west', 'north', 'east'][s.winner] : null;
    return {
      subtitle: `Hand ${s.handNo} · to ${s.opts.target}`,
      scores: s.names.map((n, i) => ({ label: i === 0 ? 'You' : n, value: s.scores[i], us: i === 0 })),
      seats: seatsVM(s, 4, (i) => ({ tag: s.taken[i] ? `${s.taken[i]} pts` : '', partner: false })),
      hand: s.phase === 'pass'
        ? { cards: s.hands[0], legal: s.hands[0].map((c) => c.id), mode: 'select', maxSelect: 3 }
        : { cards: s.hands[0], legal: myTurn ? legal(s, 0).map((c) => c.id) : null },
      center: trickHTML(trickPlays(s, 4), winPos),
      banner, overlay,
      side: [{ title: 'This hand', html: scoreTable(['Pts'], s.names.map((n, i) => [i === 0 ? 'You' : n, s.taken[i]])) },
        ...(s.received?.length && s.trickNo < 2 ? [{ title: 'You received', html: s.received.map((id) => id.replace(/([SHCD])$/, (m) => SYM[m])).join(' · ') }] : [])],
    };
  },
};
