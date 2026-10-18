// Old Maid (4 players). One queen is removed, so one queen can never pair: whoever is left
// holding it is the Old Maid. Draw a card from the player on your right; pairs are discarded.
import { deck, shuffle, sortCards, rngOf, lo } from '../core/cards.js';
import { clone, log, fx, who, must, seatsVM } from './lib/common.js';
import { panel, btn } from '../core/table.js';
import { backHTML, cardHTML } from '../skin.js';

const sortHand = (h) => sortCards(h, { rankFn: lo, bySuit: false, desc: false });

function discardPairs(s, seat) {
  const byRank = {};
  for (const c of s.hands[seat]) (byRank[c.rank] ??= []).push(c);
  let made = 0;
  for (const cards of Object.values(byRank)) {
    while (cards.length >= 2) {
      const pair = cards.splice(0, 2);
      s.hands[seat] = s.hands[seat].filter((c) => c !== pair[0] && c !== pair[1]);
      s.pairs[seat].push(pair);
      made++;
    }
  }
  if (made && seat === 0) s.hands[0] = sortHand(s.hands[0]);
  return made;
}

function newGame({ names, seed, opts }) {
  const s = { v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, log: [], fx: [], partners: false };
  const d = shuffle(deck().filter((c) => c.id !== 'QC'), rngOf(s));
  s.hands = [0, 1, 2, 3].map((i) => d.filter((_, k) => k % 4 === i));
  s.hands[0] = sortHand(s.hands[0]);
  s.pairs = [[], [], [], []];
  for (let i = 0; i < 4; i++) discardPairs(s, i);
  s.out = [];
  s.turn = 0; s.phase = 'draw';
  fx(s, 'shuffle');
  log(s, 'Pairs are discarded. Draw a card from the player on your right.');
  return advance(s, 3);
}

const alive = (s) => [0, 1, 2, 3].filter((i) => s.hands[i].length);
/** The player you draw from: nearest player to your right (counter-clockwise) who still has cards. */
function source(s, seat) {
  for (let k = 1; k < 4; k++) { const t = (seat + 4 - k) % 4; if (s.hands[t].length) return t; }
  return null;
}

function advance(s, from) {
  for (let i = 0; i < 4; i++) if (!s.hands[i].length && !s.out.includes(i)) { s.out.push(i); log(s, `${who(s, i)} ${i === 0 ? 'are' : 'is'} out of cards, safe!`); }
  const left = alive(s);
  if (left.length <= 1) {
    s.phase = 'gameOver'; s.loser = left[0] ?? null; s.turn = null;
    log(s, s.loser === null ? 'No Old Maid this time.' : `${who(s, s.loser)} ${s.loser === 0 ? 'are' : 'is'} stuck with the Old Maid!`);
    fx(s, s.loser === 0 ? 'lose' : 'win');
    return s;
  }
  let t = from;
  for (let k = 0; k < 4; k++) { t = (t + 1) % 4; if (s.hands[t].length) break; }
  s.turn = t;
  return s;
}

function draw(s, seat, idx) {
  must(s.phase === 'draw' && s.turn === seat, 'Not your turn.');
  const from = source(s, seat);
  must(from !== null && idx >= 0 && idx < s.hands[from].length, 'Pick a card to draw.');
  const [card] = s.hands[from].splice(idx, 1);
  s.hands[seat].push(card);
  if (seat !== 0) s.hands[seat] = shuffle(s.hands[seat], rngOf(s)); else s.hands[0] = sortHand(s.hands[0]);
  if (from !== 0) s.hands[from] = shuffle(s.hands[from], rngOf(s));
  fx(s, 'flip');
  const paired = discardPairs(s, seat);
  log(s, `${who(s, seat)} ${seat === 0 ? 'draw' : 'draws'} from ${from === 0 ? 'you' : s.names[from]}${paired ? ' and makes a pair' : ''}.`);
  if (seat === 0) s.lastDrawn = { ...card };
  if (paired) fx(s, 'match');
  return advance(s, seat);
}

const HOWTO = {
  goal: 'Don’t be the one left holding the <b>Old Maid</b>.',
  deal: 'One queen is taken out of the deck, so one of the other queens can never be paired: that card is the Old Maid. The rest of the deck is dealt out to four players, and any pairs (two cards of the same rank) are set aside automatically.',
  play: [
    'On your turn, draw a face-down card from the player on your right (the next player who still has cards).',
    'If it pairs with a card in your hand, the pair is set aside for you.',
    'Then the next player draws from you, and so on around the table.',
    'Players whose hands run out are safe and drop out.',
  ],
  score: 'When everyone else is out, the last player still holding a card has the Old Maid and loses. Everyone else wins.',
  options: 'Old Maid has no extra options: New game deals a fresh game.',
  controls: 'On your turn, {click} one of the face-down cards in the highlighted player’s hand to draw it.',
  tip: 'It’s all luck, so just enjoy it. The card you drew last is shown on the table, so you can see what you got.',
};

export default {
  id: 'oldmaid', title: 'Old Maid', version: 1, seats: 4, howto: HOWTO,
  newGame,
  actor: (s) => (s.phase === 'gameOver' ? null : s.turn),
  delay: () => 1000,
  act(state, a) {
    const s = clone(state);
    if (a.act === 'draw') return draw(s, 0, Number(a.idx));
    if (a.act === 'again') return newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    const from = source(s, s.turn);
    return draw(s, s.turn, Math.floor(rngOf(s)() * s.hands[from].length));
  },
  view(s) {
    const myTurn = s.phase === 'draw' && s.turn === 0;
    const from = myTurn ? source(s, 0) : null;
    let overlay = '', banner = '';
    if (s.phase === 'gameOver') {
      overlay = panel(s.loser === 0 ? 'You got the Old Maid!' : 'You escaped!', `<p>${s.loser === null ? '' : `${who(s, s.loser)} ${s.loser === 0 ? 'were' : 'was'} left holding the queen.`}</p>
        ${s.loser !== null ? `<div class="row" style="--card-w:70px">${cardHTML(s.hands[s.loser][0])}</div>` : ''}<div class="row" style="justify-content:flex-end;margin-top:12px">${btn('Play again', 'again', '', true)}</div>`);
    } else banner = myTurn ? `Draw a card from ${s.names[from]}` : `${who(s, s.turn)} is drawing…`;
    const drawRow = (i) => (myTurn && i === from
      ? `<div class="faceup" style="--card-w:44px" aria-label="Pick a card from ${s.names[i]}">${s.hands[i].map((_, k) => `<button class="pile-btn" data-act="draw" data-idx="${k}" aria-label="Card ${k + 1}">${backHTML()}</button>`).join('')}</div>` : '');
    return {
      subtitle: `${alive(s).length} players still holding cards`,
      scores: [],
      seats: seatsVM(s, 4, (i) => ({ partner: false, tag: s.hands[i].length ? `${s.pairs[i].length} pairs` : 'Out', tagMuted: !s.hands[i].length, count: myTurn && i === from ? 0 : i ? s.hands[i].length : 0, extra: i ? drawRow(i) : '' })),
      hand: { cards: s.hands[0], legal: null },
      center: `<div class="pile" style="--card-w:64px">${s.lastDrawn ? `<span>You last drew:</span>${cardHTML(s.lastDrawn)}` : '<span>Pairs are set aside automatically.</span>'}</div>`,
      banner, overlay,
      side: [{ title: 'Pairs made', html: s.names.map((n, i) => `<div>${i === 0 ? 'You' : n}: ${s.pairs[i].length}</div>`).join('') }],
    };
  },
};
