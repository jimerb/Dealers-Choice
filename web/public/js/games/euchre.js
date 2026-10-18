// Euchre: partners, 24-card deck (9–A), bowers, order up / name trump, going alone.
import { deck, shuffle, rngOf, SUIT_TITLE } from '../core/cards.js';
import { clone, log, fx, who, trickWinner, seatsVM, must, POS4, suitSpan } from './lib/common.js';
import { trickHTML, panel, btn, scoreTable } from '../core/table.js';
import { sortCards } from '../core/cards.js';

const SAME_COLOR = { S: 'C', C: 'S', H: 'D', D: 'H' };
const BASE = { 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 };
const team = (seat) => seat % 2;

export const effSuit = (c, trump) => (trump && c.rank === 'J' && c.suit === SAME_COLOR[trump] ? trump : c.suit);
export function power(c, trump) {
  if (trump && c.rank === 'J' && c.suit === trump) return 100;
  if (trump && c.rank === 'J' && c.suit === SAME_COLOR[trump]) return 99;
  return BASE[c.rank] + (effSuit(c, trump) === trump ? 50 : 0);
}
const sortHand = (h, trump) => sortCards(h, { rankFn: (c) => power(c, trump), trump }).map((c) => c).sort((a, b) =>
  (effSuit(a, trump) === trump ? -1 : 0) - (effSuit(b, trump) === trump ? -1 : 0) || (effSuit(a, trump) < effSuit(b, trump) ? -1 : effSuit(a, trump) > effSuit(b, trump) ? 1 : 0) || power(b, trump) - power(a, trump));

function deal(s) {
  const rng = rngOf(s);
  s.handNo++; s.dealer = (s.dealer + 1) % 4;
  const d = shuffle(deck({ ranks: ['9', '10', 'J', 'Q', 'K', 'A'] }), rng);
  s.hands = [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 5, i * 5 + 5), null));
  s.up = d[20]; s.kitty = d.slice(21);
  s.trump = null; s.maker = null; s.alone = false; s.sitOut = null;
  s.round = 1; s.phase = 'bid'; s.turn = (s.dealer + 1) % 4; s.passes = 0;
  s.trick = []; s.tricks = [0, 0, 0, 0]; s.trickNo = 0; s.result = null;
  fx(s, 'shuffle');
  log(s, `Hand ${s.handNo}: ${s.names[s.dealer]} deals and turns up the ${s.up.rank}${'♠♥♣♦'['SHCD'.indexOf(s.up.suit)]}.`);
  return s;
}

const next = (s, seat) => { let n = (seat + 1) % 4; if (n === s.sitOut) n = (n + 1) % 4; return n; };

function setTrump(s, seat, suit, alone) {
  s.trump = suit; s.maker = seat; s.alone = alone;
  s.sitOut = alone ? (seat + 2) % 4 : null;
  s.hands = s.hands.map((h) => sortHand(h, suit));
  fx(s, 'bid');
  log(s, `${who(s, seat)} ${s.round === 1 ? (seat === 0 ? 'order' : 'orders') + ' it up' : (seat === 0 ? 'name' : 'names') + ' ' + SUIT_TITLE[suit]}${alone ? ' and ' + (seat === 0 ? 'go' : 'goes') + ' alone' : ''}.`);
}

function startPlay(s) {
  s.phase = 'play';
  // The player left of the dealer leads (skipping a partner who sits out), or by option left of a lone player.
  s.turn = next(s, s.alone && s.opts.aloneLead === 'loner' ? s.maker : s.dealer);
  if (s.turn === s.sitOut) s.turn = next(s, s.turn);
}

function order(s, seat, alone) {
  must(s.phase === 'bid' && s.round === 1 && s.turn === seat, 'Not your call.');
  setTrump(s, seat, s.up.suit, alone);
  // Dealer picks up the upcard and discards (a dealer whose partner went alone just plays).
  if (s.sitOut === s.dealer) { startPlay(s); return s; }
  s.hands[s.dealer] = sortHand([...s.hands[s.dealer], s.up], s.trump);
  s.phase = 'discard'; s.turn = s.dealer;
  return s;
}

function name(s, seat, suit, alone) {
  must(s.phase === 'bid' && s.round === 2 && s.turn === seat, 'Not your call.');
  must(suit !== s.up.suit, `${SUIT_TITLE[suit]} was turned down.`);
  setTrump(s, seat, suit, alone);
  startPlay(s);
  return s;
}

function pass(s, seat) {
  must(s.phase === 'bid' && s.turn === seat, 'Not your call.');
  if (s.round === 2 && seat === s.dealer && s.opts.stick === 'yes') throw new Error('Stick the dealer: you must name a suit.');
  log(s, `${who(s, seat)} ${seat === 0 ? 'pass' : 'passes'}.`);
  fx(s, 'pass');
  s.passes++;
  if (s.passes === 4) {
    if (s.round === 1) { s.round = 2; s.passes = 0; log(s, 'The upcard is turned down.'); }
    else { log(s, 'Everyone passed: redeal.'); return deal(s); }
  }
  s.turn = (seat + 1) % 4;
  return s;
}

function discard(s, seat, id) {
  must(s.phase === 'discard' && s.turn === seat, 'Not your discard.');
  must(s.hands[seat].some((c) => c.id === id), 'Card not in hand.');
  s.hands[seat] = s.hands[seat].filter((c) => c.id !== id);
  startPlay(s);
  return s;
}

export function legal(s, seat) {
  const hand = s.hands[seat];
  if (!s.trick.length) return hand.slice();
  const led = effSuit(s.trick[0].card, s.trump);
  const f = hand.filter((c) => effSuit(c, s.trump) === led);
  return f.length ? f : hand.slice();
}

const winnerIdx = (trick, trump) => trickWinner(trick.map((p) => ({ ...p, card: { ...p.card, suit: effSuit(p.card, trump) } })), trump, (c) => power(c, trump));

function play(s, seat, id) {
  const card = s.hands[seat].find((c) => c.id === id);
  must(card, 'Card not in hand.');
  must(legal(s, seat).some((c) => c.id === id), 'You must follow suit (the left bower counts as trump).');
  s.hands[seat] = s.hands[seat].filter((c) => c.id !== id);
  s.trick.push({ seat, card });
  fx(s, 'card');
  if (s.trick.length === (s.alone ? 3 : 4)) { s.phase = 'trickDone'; s.turn = null; s.winner = s.trick[winnerIdx(s.trick, s.trump)].seat; }
  else s.turn = next(s, seat);
  return s;
}

function collect(s) {
  const w = s.winner;
  s.tricks[w]++; s.trickNo++; s.trick = [];
  fx(s, 'trick');
  log(s, `${who(s, w)} ${w === 0 ? 'take' : 'takes'} the trick.`);
  if (s.trickNo === 5) return score(s);
  s.phase = 'play'; s.turn = w;
  return s;
}

function score(s) {
  const mt = team(s.maker);
  const took = s.tricks[mt] + s.tricks[mt + 2];
  let gain = [0, 0], note;
  if (took >= 3) {
    const pts = took === 5 ? (s.alone ? 4 : 2) : 1;
    gain[mt] = pts; note = took === 5 ? (s.alone ? 'Alone march! +4' : 'March! +2') : `Made it (${took} tricks) +1`;
  } else { gain[1 - mt] = 2; note = `Euchred! (${took} tricks) +2 to the defenders`; }
  s.scores = s.scores.map((v, t) => v + gain[t]);
  s.result = { gain, note, makerTeam: mt };
  log(s, note);
  if (Math.max(...s.scores) >= s.opts.target) { s.phase = 'gameOver'; fx(s, s.scores[0] >= s.opts.target ? 'win' : 'lose'); }
  else { s.phase = 'handOver'; fx(s, 'score'); }
  s.turn = null;
  return s;
}

function strength(hand, trump) {
  let v = 0;
  for (const c of hand) {
    const p = power(c, trump);
    if (p === 100) v += 3; else if (p === 99) v += 2.5;
    else if (effSuit(c, trump) === trump) v += { A: 2, K: 1.6, Q: 1.4, 10: 1.2, 9: 1.1 }[c.rank] ?? 1;
    else if (c.rank === 'A') v += 1;
  }
  for (const su of ['S', 'H', 'C', 'D']) if (su !== trump && !hand.some((c) => effSuit(c, trump) === su)) v += 0.5;
  return v;
}

function aiBid(s, seat) {
  if (s.round === 1) {
    let hand = s.hands[seat];
    const isDealer = seat === s.dealer;
    if (isDealer) { hand = [...hand, s.up]; }
    let v = strength(hand, s.up.suit) - (isDealer ? 0.8 : 0);
    if (team(seat) === team(s.dealer) && !isDealer) v += 0.6; // partner gets the card
    if (team(seat) !== team(s.dealer)) v -= 0.6;
    if (v >= 7) return { act: 'order', alone: v >= 10.5 };
    return { act: 'pass' };
  }
  let best = null;
  for (const su of ['S', 'H', 'C', 'D']) if (su !== s.up.suit) { const v = strength(s.hands[seat], su); if (!best || v > best.v) best = { su, v }; }
  if (best.v >= 6.5 || (seat === s.dealer && s.opts.stick === 'yes')) return { act: 'name', suit: best.su, alone: best.v >= 10.5 };
  return { act: 'pass' };
}

function aiDiscard(s, seat) {
  const h = s.hands[seat];
  const non = h.filter((c) => effSuit(c, s.trump) !== s.trump && c.rank !== 'A');
  return (non.length ? non : h).slice().sort((a, b) => power(a, s.trump) - power(b, s.trump))[0].id;
}

function aiPlay(s, seat) {
  const L = legal(s, seat);
  if (L.length === 1) return L[0].id;
  const tr = s.trump, P = (c) => power(c, tr);
  const t = s.trick;
  if (!t.length) {
    const trumps = L.filter((c) => effSuit(c, tr) === tr);
    if (team(seat) === team(s.maker) && trumps.length >= 2) return trumps.sort((a, b) => P(b) - P(a))[0].id;
    const aces = L.filter((c) => c.rank === 'A' && effSuit(c, tr) !== tr);
    if (aces.length) return aces[0].id;
    return L.slice().sort((a, b) => P(a) - P(b))[0].id;
  }
  const wi = winnerIdx(t, tr);
  const partnerWinning = !s.alone && team(t[wi].seat) === team(seat);
  const wins = (c) => winnerIdx([...t, { seat, card: c }], tr) === t.length;
  if (partnerWinning) return L.slice().sort((a, b) => P(a) - P(b))[0].id;
  const w = L.filter(wins);
  if (w.length) return w.sort((a, b) => P(a) - P(b))[0].id;
  return L.slice().sort((a, b) => P(a) - P(b))[0].id;
}

const RULES = `<p>Partners sit across. The deck is 9 through ace (24 cards); everyone gets five.</p>
<h3>Making trump</h3><p>A card is turned up. In turn, each player may <b>order it up</b> (that suit becomes trump and the dealer takes the card, discarding one) or pass. If all pass, players may <b>name</b> another suit. The maker may <b>go alone</b>; their partner sits out. The player left of the dealer leads first (or, by option, the player left of a lone player).</p>
<h3>Trump ranking</h3><p>Jack of trump (right bower), then the other jack of the same color (left bower, which counts as trump), then A K Q 10 9.</p>
<h3>Scoring</h3><p>Makers taking 3–4 tricks: 1 point; all 5: 2 points (4 if alone). If the makers fail they are <b>euchred</b>: 2 points to the defenders.</p>`;

export default {
  id: 'euchre', title: 'Euchre', version: 1, seats: 4, rulesHTML: RULES,
  settings: [
    { key: 'target', label: 'Points to win', options: [[5, '5'], [7, '7'], [10, '10']], default: 10 },
    { key: 'stick', label: 'Stick the dealer', options: [['no', 'No: redeal if all pass'], ['yes', 'Yes: dealer must name trump']], default: 'no' },
    { key: 'aloneLead', label: 'When someone goes alone, the first lead is', options: [['dealer', 'Left of the dealer'], ['loner', 'Left of the lone player']], default: 'dealer' },
  ],
  newGame({ names, seed, opts }) {
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, scores: [0, 0], handNo: 0, dealer: 3, log: [], fx: [] });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'trickDone') return 'auto';
    if (s.phase === 'handOver') return 0;
    return s.turn;
  },
  delay: (s) => (s.phase === 'trickDone' ? 1100 : s.phase === 'bid' ? 950 : 650),
  act(state, a) {
    const s = clone(state);
    const alone = a.alone === '1';
    switch (a.act) {
      case 'order': return order(s, 0, alone);
      case 'name': return name(s, 0, a.suit, alone);
      case 'pass': return pass(s, 0);
      case 'discard': must(a.ids?.length === 1, 'Pick one card to discard.'); return discard(s, 0, a.ids[0]);
      case 'play': must(s.phase === 'play' && s.turn === 0, 'Wait for your turn.'); return play(s, 0, a.id);
      case 'next': must(s.phase === 'handOver', 'Hand not over.'); return deal(s);
      case 'again': return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
      default: throw new Error('Unknown action');
    }
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'trickDone') return collect(s);
    if (s.phase === 'handOver') return deal(s);
    if (s.phase === 'discard') return discard(s, s.turn, aiDiscard(s, s.turn));
    if (s.phase === 'bid') {
      const d = aiBid(s, s.turn);
      if (d.act === 'order') return order(s, s.turn, d.alone);
      if (d.act === 'name') return name(s, s.turn, d.suit, d.alone);
      return pass(s, s.turn);
    }
    return play(s, s.turn, aiPlay(s, s.turn));
  },
  view(s, ui) {
    let overlay = '', banner = '', center = '';
    if (s.phase === 'bid' && s.turn === 0) {
      if (s.round === 1) {
        overlay = panel(`${suitSpan(s.up.suit)} ${SUIT_TITLE[s.up.suit]} turned up`, `<p>${s.dealer === 0 ? 'You are the dealer: pick it up, or turn it down.' : `Order it up to make ${SUIT_TITLE[s.up.suit]} trump (${s.dealer === 2 ? 'your partner' : s.names[s.dealer]} takes the card).`}</p>
          <div class="row">${btn('Pass', 'pass')}${btn(s.dealer === 0 ? 'Pick it up' : 'Order it up', 'order', '', true)}${btn('…and go alone', 'order', 'data-alone="1"')}</div>`);
      } else {
        const stuck = s.dealer === 0 && s.opts.stick === 'yes';
        overlay = panel('Name trump', `<p>${stuck ? 'Stick the dealer: you must choose.' : `Choose a suit other than ${SUIT_TITLE[s.up.suit]}, or pass.`}</p>
          <div class="row">${['S', 'H', 'C', 'D'].filter((x) => x !== s.up.suit).map((x) => btn(`${suitSpan(x)} ${SUIT_TITLE[x]}`, 'name', `data-suit="${x}"`)).join('')}${stuck ? '' : btn('Pass', 'pass')}</div>
          <p style="margin-top:10px"><label class="choice"><input type="checkbox" id="eu-alone" onchange="document.querySelectorAll('[data-act=name]').forEach(b=>b.dataset.alone=this.checked?'1':'0')"> Go alone</label></p>`);
      }
    } else if (s.phase === 'discard' && s.turn === 0) {
      overlay = panel('Discard one card', `<p>You picked up the ${s.up.rank}${'♠♥♣♦'['SHCD'.indexOf(s.up.suit)]}. Choose a card to bury.</p><div class="row">${btn('Discard', 'discard', `data-with-sel ${ui.selected.size === 1 ? '' : 'disabled'}`, true)}</div>`);
    } else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      overlay = panel(s.phase === 'gameOver' ? (s.scores[0] >= s.opts.target ? `You and ${s.names[2]} win!` : `${s.names[1]} and ${s.names[3]} win`) : `Hand ${s.handNo}`,
        `<div class="verdict ${(r.gain[0] > 0) ? 'good' : 'bad'}">${r.note}</div>${scoreTable(['Us', 'Them'], [['This hand', r.gain[0], r.gain[1]], ['Score', `<b>${s.scores[0]}</b>`, `<b>${s.scores[1]}</b>`]])}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next hand', 'next', '', true)}</div>`);
    } else if (s.phase === 'trickDone') banner = `${who(s, s.winner)} ${s.winner === 0 ? 'take' : 'takes'} it`;
    else if (s.phase === 'bid' || s.phase === 'discard') banner = `${who(s, s.turn)} is deciding…`;
    else banner = s.turn === 0 ? (s.trick.length ? 'Your turn: follow suit' : 'Your lead') : `${who(s, s.turn)} to play`;
    if (s.phase === 'bid' && s.round === 1) center = `<div class="pile">${trickHTML([{ pos: 'north', card: s.up }])}</div>`;
    else center = trickHTML(s.trick.map((p) => ({ pos: POS4[p.seat], card: p.card })), s.phase === 'trickDone' ? POS4[s.winner] : null);
    const myTurn = s.phase === 'play' && s.turn === 0;
    return {
      subtitle: `Hand ${s.handNo} · to ${s.opts.target}`,
      scores: [{ label: 'Us', value: s.scores[0], us: true }, { label: 'Them', value: s.scores[1] }],
      seats: seatsVM(s, 4, (i) => ({ tag: i === s.sitOut ? 'Sitting out' : i === s.maker ? `Maker${s.alone ? ' · alone' : ''}` : (s.phase === 'play' || s.phase === 'trickDone') && s.tricks[i] ? `${s.tricks[i]} tr` : '', tagMuted: i === s.sitOut })),
      hand: s.phase === 'discard' && s.turn === 0
        ? { cards: s.hands[0], legal: s.hands[0].map((c) => c.id), mode: 'select', maxSelect: 1 }
        : { cards: s.hands[0], legal: myTurn ? legal(s, 0).map((c) => c.id) : null },
      center, banner, overlay,
      trump: s.trump ? { suit: s.trump } : null,
      side: [s.trump ? { title: 'Maker', html: `<div>${who(s, s.maker)}${s.alone ? ' (alone)' : ''}</div>` } : { title: 'Trump', html: `<div>Up card: ${s.up.rank}${'♠♥♣♦'['SHCD'.indexOf(s.up.suit)]}</div>` },
        { title: 'Tricks', html: scoreTable(['Us', 'Them'], [['Taken', s.tricks[0] + s.tricks[2], s.tricks[1] + s.tricks[3]]]) }],
    };
  },
};
