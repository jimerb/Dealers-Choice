// Clock, Bowling and Euchre solitaire.
import { rk, up, freshDeck, clone, bump, cardBtn, emptySlot, cardHTML, backHTML } from './util.js';
import { deck, shuffle, makeRng, SUIT_TITLE, SYM } from '../../core/cards.js';

// ------------------------------------------------------------------ Clock
const HOURS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'];
const clock = {
  id: 'clock', name: 'Clock', group: 'One deck', blurb: 'Send each card to its hour before the fourth king turns up.',
  how: {
    goal: `Fill all twelve hours of the clock with their four cards before the fourth king turns up.`,
    deal: `Twelve face-down piles of four sit around a clock face, and the last four cards are the stock. A card is turned up in the middle to start.`,
    play: [
      `Put the turned-up card on the pile at <b>its hour</b>: ace = 1 o'clock, 2 to 10 as numbered, jack = 11, queen = 12.`,
      `The card is tucked under that pile face up, and the pile's next face-down card comes up for you to place.`,
      `Kings go to the middle by themselves, and a new card comes from the stock.`,
      `The game ends when the fourth king appears.`,
    ],
    score: `You win when every hour shows all four of its cards.`,
    controls: `{Click} the pile at the hour of the card in the middle.`,
    tip: `Clock has no choices to make; it's a quick game of pure luck.`,
  },
  newGame(seed) {
    const d = freshDeck(seed);
    const piles = HOURS.map((_, i) => ({ down: d.slice(i * 4, i * 4 + 4), up: [] }));
    const s = { variant: 'clock', moves: 0, piles, stock: d.slice(48), kings: [], current: null, over: false };
    s.current = { ...s.stock.pop(), up: true };
    return settleKing(s);
  },
  render(s) {
    const pos = (i) => { const a = ((i + 1) / 12) * 2 * Math.PI; return `left:calc(50% + ${Math.sin(a) * 40}% - var(--card-w) / 2);top:calc(50% - ${Math.cos(a) * 40}% - var(--card-w) * .7)`; };
    const piles = s.piles.map((p, i) => `<div class="clock-pile" style="${pos(i)}"><button class="pile-btn" data-c="hour" data-i="${i}" ${s.current && !s.over ? '' : 'disabled'} aria-label="${HOURS[i]} o'clock pile">
      ${p.up.length === 4 ? cardHTML(p.up.at(-1)) : p.down.length ? backHTML() : p.up.length ? cardHTML(p.up.at(-1)) : emptySlot()}</button><span class="sol-label">${HOURS[i]} · ${p.up.length}/4</span></div>`).join('');
    const mid = `<div class="clock-mid"><div class="pile">${s.current ? cardHTML(s.current) : emptySlot()}<span>${s.over ? 'Game over' : 'Place this card'}</span></div>
      <div class="pile">${s.kings.length ? cardHTML(s.kings.at(-1)) : emptySlot('Kings')}<span>Kings ${s.kings.length}/4</span></div></div>`;
    return `<div class="sol-board"><div class="clock">${piles}${mid}</div></div>`;
  },
  click(s, d) {
    if (d.c !== 'hour' || !s.current || s.over) return null;
    const i = Number(d.i);
    if (HOURS[i] !== s.current.rank) return { error: `The ${s.current.rank} goes on the ${s.current.rank === 'A' ? '1' : s.current.rank === 'J' ? '11' : s.current.rank === 'Q' ? '12' : s.current.rank} o'clock pile.` };
    s = clone(s); bump(s);
    const p = s.piles[i];
    p.up.unshift(s.current);
    s.current = p.down.length ? { ...p.down.pop(), up: true } : s.stock.length ? { ...s.stock.pop(), up: true } : null;
    s.fx = 'card';
    return settleKing(s);
  },
  isWon: (s) => s.piles.every((p) => p.up.length === 4),
  isOver(s) { return s.over || this.isWon(s); },
  status: (s) => `Hours complete: ${s.piles.filter((p) => p.up.length === 4).length} of 12 · kings ${s.kings.length}/4`,
  count: (s) => s.piles.reduce((t, p) => t + p.up.length + p.down.length, 0) + s.stock.length + s.kings.length + (s.current ? 1 : 0),
  targets: (s) => s.piles.map((_, i) => ({ c: 'hour', i: String(i) })),
};
function settleKing(s) {
  while (s.current && s.current.rank === 'K') {
    s.kings.push(s.current);
    s.current = s.kings.length < 4 && s.stock.length ? { ...s.stock.pop(), up: true } : null;
  }
  if (!s.current && !s.piles.every((p) => p.up.length === 4)) {
    // No card to place: take one from an unfinished pile if any remain face down, otherwise the game is over.
    const p = s.piles.find((x) => x.down.length);
    if (s.kings.length < 4 && p) s.current = { ...p.down.pop(), up: true };
    else s.over = true;
  }
  if (s.kings.length === 4) s.over = true;
  return s;
}

// ------------------------------------------------------------------ Bowling
const PIN_ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];
/** A card may go on empty pin k if it is ≥ every filled lower pin and ≤ every filled higher pin. */
function pinLegal(pins, k, v) {
  if (pins[k]) return false;
  let lower = 0, upper = 14;
  pins.forEach((p, j) => { if (!p) return; if (j < k) lower = Math.max(lower, rk(p)); if (j > k) upper = Math.min(upper, rk(p)); });
  return v >= lower && v <= upper;
}
export function bowlingScore(rolls) {
  let total = 0, i = 0;
  const frames = [];
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    const a = rolls[i], b = rolls[i + 1], c = rolls[i + 2];
    if (a === 10) { if (c === undefined) break; total += 10 + b + c; i += 1; }
    else if (b !== undefined && a + b === 10) { if (c === undefined) break; total += 10 + c; i += 2; }
    else { if (b === undefined) break; total += a + b; i += 2; }
    frames.push(total);
  }
  return { total, frames };
}
function newRack(s) {
  s.rack++;
  s.deck = up(shuffle(deck(), makeRng(s.seed + s.rack * 7919)));
  s.pins = Array(10).fill(null);
  s.waste = [[], []];
  s.ball = 0; s.pinsAtBall = 0;
  s.current = s.deck.pop();
}
function rollDone(s, knocked) {
  s.rolls.push(knocked);
  const f = s.frameRolls; f.push(knocked);
  let frameOver;
  if (s.frame < 10) frameOver = knocked === 10 && f.length === 1 ? true : f.length === 2;
  else frameOver = f.length === 3 || (f.length === 2 && f[0] + f[1] < 10);
  if (frameOver) {
    if (s.frame === 10) { s.over = true; s.current = null; return; }
    s.frame++; s.frameRolls = []; newRack(s); return;
  }
  if (s.pins.every(Boolean)) newRack(s); // 10th-frame bonus ball after a strike or spare
  else { s.ball = 1; s.pinsAtBall = s.pins.filter(Boolean).length; s.current = s.deck.pop(); }
}
const bowling = {
  id: 'bowling', name: 'Bowling', group: 'One deck', blurb: 'Fill the ten pins in rank order before your balls run out.',
  how: {
    goal: `Bowl ten frames and score 230 or more.`,
    deal: `Ten empty pins in a triangle, numbered from 1 at the bottom point up to 7–10 along the top. Each frame uses a freshly shuffled deck, turned one card at a time.`,
    play: [
      `Place each card on an empty pin so ranks never go down as the pin numbers go up: a card must be at least as high as every filled lower-numbered pin, and no higher than any filled higher-numbered pin. Aces are low; equal ranks are fine.`,
      `A card that fits on a pin must be placed. One that fits nowhere goes to the waste for that ball.`,
      `Three wasted cards end a ball, and each frame has two balls.`,
      `Fill all ten pins with the first ball for a <b>strike</b>, or by the end of the second ball for a <b>spare</b>.`,
    ],
    score: `Frames score like real bowling: a point for each pin filled, plus the usual strike and spare bonuses, with bonus balls in the tenth frame. Reach <b>230</b> to win.`,
    controls: `{Click} an empty pin to place the card; pins where it fits are highlighted. If it fits nowhere, {click} Waste this card.`,
    tip: `Put middling cards on the middle pins and save the end pins for very low and very high cards.`,
  },
  newGame(seed) { const s = { variant: 'bowling', moves: 0, seed, rack: 0, frame: 1, rolls: [], frameRolls: [], over: false }; newRack(s); return s; },
  render(s) {
    const v = s.current ? rk(s.current) : null;
    const pin = (n) => { const k = n - 1, card = s.pins[k]; return card ? `<span class="pin">${cardHTML(card)}</span>` : `<button class="pin empty-slot slot-btn${v !== null && pinLegal(s.pins, k, v) ? ' ok' : ''}" data-c="pin" data-i="${k}" ${s.current ? '' : 'disabled'}>${n}</button>`; };
    const rack = PIN_ROWS.map((row) => `<div class="pin-row">${row.map(pin).join('')}</div>`).join('');
    const sc = bowlingScore(s.rolls);
    const card = `<table class="score bowl-card"><tr>${Array.from({ length: 10 }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>Total</th></tr><tr>${Array.from({ length: 10 }, (_, i) => `<td>${sc.frames[i] ?? ''}</td>`).join('')}<td><b>${sc.total}</b></td></tr></table>`;
    return `<div class="sol-board"><div class="row" style="gap:28px;align-items:flex-start;justify-content:center;flex-wrap:wrap">
      <div class="pins">${rack}</div>
      <div style="display:flex;flex-direction:column;gap:12px;--card-w:70px">
        <div class="pile">${s.current ? cardHTML(s.current) : emptySlot()}<span>${s.over ? 'Game over' : `Frame ${s.frame} · ball ${s.frameRolls.length + 1}`}</span></div>
        <button class="btn sm" data-c="waste" ${s.current ? '' : 'disabled'}>Waste this card (${s.waste[s.ball].length}/3)</button>
        <div style="--card-w:34px">${s.waste.map((w, i) => `<div class="row"><span class="sub">Waste ${i + 1}:</span>${w.map((c) => cardHTML(c)).join('') || '—'}</div>`).join('')}</div>
      </div></div>${card}</div>`;
  },
  click(s, d) {
    if (!s.current || s.over) return null;
    const v = rk(s.current);
    const anyLegal = s.pins.some((_, k) => pinLegal(s.pins, k, v));
    s = clone(s); bump(s);
    if (d.c === 'pin') {
      const k = Number(d.i);
      if (!pinLegal(s.pins, k, v)) return { error: 'That card is out of order for this pin.' };
      s.pins[k] = s.current; s.fx = 'card';
      if (s.pins.every(Boolean)) { s.fx = 'win'; rollDone(s, 10 - s.pinsAtBall); return s; }
    } else if (d.c === 'waste') {
      if (anyLegal) return { error: 'This card fits on a pin, so it must be placed.' };
      s.waste[s.ball].push(s.current); s.fx = 'pass';
      if (s.waste[s.ball].length === 3) { rollDone(s, s.pins.filter(Boolean).length - s.pinsAtBall); return s; }
    } else return null;
    s.current = s.deck.pop();
    return s;
  },
  isWon: (s) => s.over && bowlingScore(s.rolls).total >= 230,
  isOver: (s) => s.over,
  status: (s) => `Frame ${Math.min(s.frame, 10)} · score ${bowlingScore(s.rolls).total} · need 230`,
  count: () => 52,
  targets: (s) => [...Array.from({ length: 10 }, (_, i) => ({ c: 'pin', i: String(i) })), { c: 'waste' }],
};

// ------------------------------------------------------------------ Euchre against the deck
const SAME = { S: 'C', C: 'S', H: 'D', D: 'H' };
const effSuit = (c, t) => (c.rank === 'J' && c.suit === SAME[t] ? t : c.suit);
const power = (c, t) => (c.rank === 'J' && c.suit === t ? 100 : c.rank === 'J' && c.suit === SAME[t] ? 99 : { 9: 9, 10: 10, J: 11, Q: 12, K: 13, A: 14 }[c.rank] + (effSuit(c, t) === t ? 50 : 0));
function euDeal(s) {
  s.handNo++;
  const d = up(shuffle(deck({ ranks: ['9', '10', 'J', 'Q', 'K', 'A'] }), makeRng(s.seed + s.handNo * 131)));
  s.hand = d.slice(0, 5); s.stock = d.slice(5); s.up = s.stock.pop();
  s.trump = null; s.double = false; s.phase = 'order'; s.tricks = [0, 0]; s.trick = []; s.leader = 'you'; s.result = null; s.discards = 0;
}
function deckPlays(s, ledCard) {
  // The deck turns cards until one follows the led (effective) suit or is trump.
  const led = effSuit(ledCard, s.trump);
  while (s.stock.length) { const c = s.stock.pop(); if (effSuit(c, s.trump) === led || effSuit(c, s.trump) === s.trump) return c; s.discards++; }
  return null;
}
function resolve(s) {
  const [a, b] = s.trick; // [{who, card}]
  const t = s.trump;
  const ledSuit = effSuit(a.card, t);
  const beats = (x, y) => (effSuit(x, t) === t && effSuit(y, t) !== t) || (effSuit(x, t) === effSuit(y, t) && power(x, t) > power(y, t));
  void ledSuit;
  const w = beats(b.card, a.card) ? b.who : a.who;
  s.tricks[w === 'you' ? 0 : 1]++; s.leader = w; s.lastTrick = s.trick; s.trick = [];
  if (s.tricks[0] + s.tricks[1] === 5) return endHand(s);
  if (w === 'deck') {
    const c = s.stock.pop();
    if (!c) { s.tricks[0] += 5 - (s.tricks[0] + s.tricks[1]); return endHand(s); }
    s.trick = [{ who: 'deck', card: c }];
  }
  return s;
}
function endHand(s) {
  const mine = s.tricks[0];
  let you = 0, deckPts = 0;
  if (s.double) { if (mine === 5) you = 4; else deckPts = 2; }
  else if (mine === 5) you = 2; else if (mine >= 3) you = 1; else deckPts = 2;
  s.score = [s.score[0] + you, s.score[1] + deckPts];
  s.result = { mine, you, deckPts };
  s.phase = s.score[0] >= 10 || s.score[1] >= 10 ? 'over' : 'handOver';
  s.fx = you ? 'score' : 'lose';
  return s;
}
const euchresol = {
  id: 'euchresol', name: 'Euchre', group: 'One deck', blurb: 'Play Euchre hands against the deck; first to 10 points.',
  how: {
    goal: `Be the first to 10 points, playing Euchre hands against the deck.`,
    deal: `A 24-card deck (9 through ace). You get five cards, and one card is turned up.`,
    play: [
      `Choose trump: <b>order up</b> the turned card's suit (the deck then plays that card on the first trick), or name another suit. Tick <b>Double stakes</b> if you expect to take all five tricks.`,
      `You lead the first trick. The deck answers by turning cards until it finds one that follows suit or is trump.`,
      `Whoever wins a trick leads the next. When the deck leads, you must follow suit if you can.`,
      `The jack of trump is highest, then the other jack of the same color (which counts as trump), then A K Q 10 9.`,
    ],
    score: `Take 3 or 4 tricks for 1 point, or all five for 2 (4 with double stakes). Take fewer than three, or miss a double, and the deck scores 2. If the deck runs out of cards, you win the remaining tricks.`,
    controls: `{Click} Order it up or a Name button to set trump, then {click} a card in your hand to play it. Cards you can't play are dimmed.`,
    tip: `Holding both jacks of the turned card's color makes ordering up a safe bet.`,
  },
  newGame(seed) { const s = { variant: 'euchresol', moves: 0, seed, handNo: 0, score: [0, 0] }; euDeal(s); return s; },
  render(s) {
    const handBtns = s.hand.map((c) => cardBtn(c, { c: 'play', id: c.id }, { disabled: s.phase !== 'play' || !legal(s).some((x) => x.id === c.id) })).join('');
    let panel = '';
    if (s.phase === 'order') panel = `<p>Up card: ${s.up.rank}${SYM[s.up.suit]}.</p><div class="row"><button class="btn primary" data-c="order">Order it up</button>${['S', 'H', 'C', 'D'].filter((x) => x !== s.up.suit).map((x) => `<button class="btn" data-c="name" data-suit="${x}">Name ${SUIT_TITLE[x]}</button>`).join('')}</div>
      <label class="choice"><input type="checkbox" data-c="double" ${s.double ? 'checked' : ''}> Double stakes</label>`;
    else if (s.phase === 'handOver' || s.phase === 'over') panel = `<p>You took ${s.result.mine} trick${s.result.mine === 1 ? '' : 's'}: ${s.result.you ? `+${s.result.you} for you` : `+${s.result.deckPts} for the deck`}.</p>${s.phase === 'handOver' ? '<button class="btn primary" data-c="next">Next hand</button>' : ''}`;
    else panel = `<p>Trump: <b>${SUIT_TITLE[s.trump]}</b>${s.double ? ' · double stakes' : ''}. Tricks: you ${s.tricks[0]}, deck ${s.tricks[1]}.</p><p class="sub">${s.trick.length ? 'Your turn: follow suit if you can.' : 'Your lead.'}</p>`;
    const table = `<div class="row" style="gap:20px;--card-w:80px;min-height:120px;justify-content:center">${s.phase === 'order' ? `<div class="pile">${cardHTML(s.up)}<span>Up card</span></div>` : ''}
      ${s.trick.map((p) => `<div class="pile">${cardHTML(p.card)}<span>${p.who === 'you' ? 'You' : 'Deck'}</span></div>`).join('')}
      ${!s.trick.length && s.lastTrick ? s.lastTrick.map((p) => `<div class="pile" style="opacity:.6">${cardHTML(p.card)}<span>${p.who === 'you' ? 'You' : 'Deck'} (last)</span></div>`).join('') : ''}
      <div class="pile">${s.stock.length ? backHTML() : emptySlot()}<span>Deck · ${s.stock.length}</span></div></div>`;
    return `<div class="sol-board"><div class="card-panel" style="align-self:center;max-width:560px">${panel}</div>${table}<div class="hand" style="--card-w:84px">${handBtns}</div></div>`;
  },
  click(s, d) {
    s = clone(s);
    if (d.c === 'double' && s.phase === 'order') { s.double = !s.double; return s; }
    if (d.c === 'order' && s.phase === 'order') { s.trump = s.up.suit; s.deckFirst = s.up; s.phase = 'play'; bump(s); s.fx = 'bid'; return s; }
    if (d.c === 'name' && s.phase === 'order') { s.trump = d.suit; s.stock.unshift(s.up); s.deckFirst = null; s.phase = 'play'; bump(s); s.fx = 'bid'; return s; }
    if (d.c === 'next' && s.phase === 'handOver') { euDeal(s); s.fx = 'shuffle'; return s; }
    if (d.c === 'play' && s.phase === 'play') {
      const c = s.hand.find((x) => x.id === d.id);
      if (!c || !legal(s).some((x) => x.id === c.id)) return { error: 'You must follow suit.' };
      s.hand = s.hand.filter((x) => x.id !== c.id);
      bump(s); s.fx = 'card';
      if (s.trick.length) { s.trick.push({ who: 'you', card: c }); return resolve(s); }
      s.trick = [{ who: 'you', card: c }];
      let reply = s.deckFirst ?? deckPlays(s, c);
      s.deckFirst = null;
      if (!reply) { s.tricks[0] += 5 - (s.tricks[0] + s.tricks[1]); return endHand(s); }
      s.trick.push({ who: 'deck', card: reply });
      return resolve(s);
    }
    return null;
  },
  isWon: (s) => s.phase === 'over' && s.score[0] >= 10,
  isOver: (s) => s.phase === 'over',
  status: (s) => `You ${s.score[0]} · Deck ${s.score[1]} · first to 10`,
  count: () => 24,
  targets: (s) => (s.phase === 'order' ? [{ c: 'order' }, { c: 'name', suit: ['S', 'H', 'C', 'D'].find((x) => x !== s.up.suit) }] : s.phase === 'handOver' ? [{ c: 'next' }] : s.hand.map((c) => ({ c: 'play', id: c.id }))),
};
function legal(s) {
  if (!s.trick.length) return s.hand;
  const led = effSuit(s.trick[0].card, s.trump);
  const f = s.hand.filter((c) => effSuit(c, s.trump) === led);
  return f.length ? f : s.hand;
}

export default [clock, bowling, euchresol];
