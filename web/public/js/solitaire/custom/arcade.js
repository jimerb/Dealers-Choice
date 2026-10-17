// Arcade solitaires: timed rounds, a bonus round for a high enough score.
// 3 Towers, Best 21, Fast 21, Pick 2, Sum 11.
import { rk, up, freshDeck, clone, bump, cardBtn, emptySlot, cardHTML, backHTML } from './util.js';
import { shuffle, makeRng } from '../../core/cards.js';

/** Wrap a round-based game definition with timer, rounds, bonus round and scoring. */
function arcade(def) {
  const fmt = (n) => n.toLocaleString('en-US');
  const startRound = (s) => { s.timeLeft = def.seconds; s.roundScore = 0; s.phase = 'play'; def.deal(s, makeRng(s.seed + s.round * 7907 + (s.bonus ? 99991 : 0))); };
  function endRound(s, timeBonus) {
    if (s.phase !== 'play') return s;
    const bonus = timeBonus ? s.timeLeft * 100 : 0;
    const extra = def.roundEnd?.(s) ?? 0;
    s.lastRound = { score: s.roundScore + extra, timeBonus: bonus };
    s.score += s.roundScore + extra + bonus;
    s.fx = 'score';
    if (s.bonus) { s.phase = 'over'; s.won = s.score >= def.winAt; s.fx = s.won ? 'win' : 'lose'; return s; }
    if (s.round < def.rounds) { s.phase = 'between'; return s; }
    if (s.score >= def.bonusAt) { s.phase = 'between'; s.bonusEarned = true; return s; }
    s.phase = 'over'; s.won = false; s.fx = 'lose';
    return s;
  }
  return {
    id: def.id, name: def.name, group: 'Arcade', blurb: def.blurb, timed: true,
    how: {
      ...def.how,
      score: [
        ...def.how.score,
        `${def.rounds} rounds of ${def.seconds} seconds. <b>Take score</b> ends a round early, and every second left on the clock adds 100 points.`,
        `Finish the last round with ${fmt(def.bonusAt)} or more to earn a bonus round, then end the bonus round with ${fmt(def.winAt)} or more to win.`,
        'There is no undo in the arcade. The clock stops while How to play is open.',
      ],
      controls: `${def.how.controls} {Click} Take score to end the round early.`,
    },
    newGame(seed) { const s = { variant: def.id, moves: 0, seed, round: 1, bonus: false, score: 0 }; startRound(s); return s; },
    tick(s) {
      if (s.phase !== 'play') return s;
      s = { ...s, timeLeft: s.timeLeft - 1 };
      if (s.timeLeft <= 0) { s = clone(s); s.timeLeft = 0; return endRound(s, false); }
      return s;
    },
    render(s) {
      const head = `<div class="arcade-head"><span class="pill">${s.bonus ? 'Bonus round' : `Round ${s.round} of ${def.rounds}`}</span>
        <span class="arcade-time${s.timeLeft <= 10 ? ' low' : ''}" role="timer">${s.timeLeft}s</span>
        <span>Round <b>${fmt(s.roundScore)}</b></span><span>Total <b>${fmt(s.score)}</b></span>
        ${s.phase === 'play' ? '<button class="btn sm primary" data-c="take">Take score</button>' : ''}</div>`;
      let body = def.render(s);
      if (s.phase === 'between') {
        body += `<div class="overlay sol-win"><div class="card-panel"><h3>${s.bonusEarned && !s.bonus && s.round >= def.rounds ? 'Bonus round earned!' : `Round ${s.round} done`}</h3>
          <p>Round score ${fmt(s.lastRound.score)}${s.lastRound.timeBonus ? ` + time bonus ${fmt(s.lastRound.timeBonus)}` : ''}. Total ${fmt(s.score)}.</p>
          <div class="row"><button class="btn primary" data-c="next">${s.round >= def.rounds ? 'Start the bonus round' : 'Next round'}</button></div></div></div>`;
      }
      return `<div class="sol-board arcade">${head}<div style="position:relative">${body}</div></div>`;
    },
    click(s, d) {
      if (d.c === 'take') { if (s.phase !== 'play') return null; return endRound(clone(s), true); }
      if (d.c === 'next') {
        if (s.phase !== 'between') return null;
        s = clone(s);
        if (s.round >= def.rounds) s.bonus = true; else s.round++;
        startRound(s); s.fx = 'shuffle'; return s;
      }
      if (s.phase !== 'play') return null;
      const n = def.click(clone(s), d);
      if (!n || n.error) return n;
      bump(n);
      if (n.endNow) { const withTime = n.endWithTime ?? true; delete n.endNow; delete n.endWithTime; return endRound(n, withTime); }
      return n;
    },
    isWon: (s) => s.phase === 'over' && s.won,
    isOver: (s) => s.phase === 'over',
    status: (s) => `${s.bonus ? 'Bonus round' : `Round ${s.round}/${def.rounds}`} · ${fmt(s.score)} points`,
    count: () => 52,
    targets: (s) => (s.phase === 'between' ? [{ c: 'next' }] : s.phase === 'play' ? [...def.targets(s), { c: 'take' }] : []),
  };
}

// ------------------------------------------------------------------ 3 Towers (tri-peaks)
const ROWS = [3, 6, 9, 10];
const rowOf = (i) => (i < 3 ? 0 : i < 9 ? 1 : i < 18 ? 2 : 3);
const START = [0, 3, 9, 18];
function coveredBy(i) {
  const r = rowOf(i), k = i - START[r];
  if (r === 0) return [START[1] + 2 * k, START[1] + 2 * k + 1];
  if (r === 1) { const a = k + Math.floor(k / 2); return [START[2] + a, START[2] + a + 1]; }
  if (r === 2) return [START[3] + k, START[3] + k + 1];
  return [];
}
const exposed = (s, i) => !s.cards[i].gone && coveredBy(i).every((j) => s.cards[j].gone);
function xOf(i) {
  const r = rowOf(i), k = i - START[r];
  if (r === 3) return k;
  if (r === 2) return k + 0.5;
  const [a, b] = coveredBy(i);
  return (xOf(a) + xOf(b)) / 2;
}
const towers = arcade({
  id: 'towers', name: '3 Towers', blurb: 'Clear three towers by playing cards one up or down from the pile.', rounds: 2, seconds: 60, bonusAt: 50000, winAt: 75000,
  how: {
    goal: `Score as many points as you can by clearing three towers of cards before the clock runs out.`,
    deal: `Twenty-eight cards form three overlapping towers; only the uncovered ones are face up. One card starts the pile, and the rest are the stock.`,
    play: [
      `Move any uncovered card that is <b>one rank higher or lower</b> than the pile's top card onto the pile, in any suit. King and ace connect.`,
      `Keep going to build a run: 5, 6, 7, 6, 5…`,
      `When you're stuck, turn a new pile card from the stock.`,
    ],
    score: [
      `Each card in a run is worth more than the last: 100 for the first, 200 for the second, 300 for the third, and so on.`,
      `A new card from the stock costs 100 and starts the run over.`,
      `Clearing a tower scores 5,000, then 10,000, then 15,000 for the third. Clearing every card ends the round.`,
    ],
    controls: `{Click} an uncovered card to play it onto the pile. {Click} the stock for a new pile card.`,
  },
  deal(s, rng) {
    const d = up(shuffle(freshDeck(1), rng));
    s.cards = d.slice(0, 28).map((c) => ({ ...c, gone: false }));
    s.stock = d.slice(29); s.pile = [d[28]]; s.run = 0; s.towersCleared = 0;
  },
  render(s) {
    const cards = s.cards.map((c, i) => {
      if (c.gone) return '';
      const ex = exposed(s, i);
      return `<div class="tp-card" style="left:calc(${xOf(i)} * var(--card-w) * 1.08);top:calc(${rowOf(i)} * var(--card-w) * .62)">${ex ? cardBtn(c, { c: 'card', i }) : backHTML()}</div>`;
    }).join('');
    return `<div class="tri-peaks">${cards}</div><div class="sol-top" style="justify-content:center">
      <div class="sol-pile">${s.stock.length ? `<button class="sol-flat" data-c="stock" aria-label="New pile card">${backHTML()}</button>` : emptySlot('Empty')}<span class="sol-label">${s.stock.length}</span></div>
      <div class="sol-pile">${cardHTML(s.pile.at(-1))}<span class="sol-label">Run ${s.run}</span></div></div>`;
  },
  click(s, d) {
    if (d.c === 'stock') { if (!s.stock.length) return null; s.pile.push(s.stock.pop()); s.run = 0; s.roundScore -= 100; s.fx = 'flip'; return s; }
    const i = Number(d.i);
    if (!exposed(s, i)) return null;
    const diff = Math.abs(rk(s.cards[i]) - rk(s.pile.at(-1)));
    if (diff !== 1 && diff !== 12) return { error: 'Play a card one higher or lower than the pile.' };
    s.pile.push(s.cards[i]); s.cards[i] = { ...s.cards[i], gone: true };
    s.run++; s.roundScore += 100 * s.run; s.fx = 'card';
    if (i < 3) { s.towersCleared++; s.roundScore += 5000 * s.towersCleared; s.fx = 'win'; }
    if (s.cards.every((c) => c.gone)) s.endNow = true;
    return s;
  },
  targets: (s) => [...s.cards.map((c, i) => (exposed(s, i) ? { c: 'card', i: String(i) } : null)).filter(Boolean), { c: 'stock' }],
});

// ------------------------------------------------------------------ blackjack helpers
const bjValue = (c) => (c.rank === 'A' ? 1 : Math.min(10, rk(c)));
export function bjTotal(cards) {
  let t = cards.reduce((a, c) => a + bjValue(c), 0);
  if (cards.some((c) => c.rank === 'A') && t + 10 <= 21) t += 10;
  return t;
}
const handHTML = (cards, i, label, sel) => `<button class="bj-hand${sel ? ' sel' : ''}" data-c="hand" data-i="${i}" aria-label="Hand ${i + 1}, ${label}">
  <span class="bj-cards">${cards.map((c) => cardHTML(c)).join('') || '<span class="empty-slot"></span>'}</span><b>${label}</b></button>`;

const best21 = arcade({
  id: 'best21', name: 'Best 21', blurb: 'Build five blackjack hands as close to 21 as you can.', rounds: 3, seconds: 45, bonusAt: 120000, winAt: 160000,
  how: {
    goal: `Score as many points as you can by building five blackjack hands before the clock runs out.`,
    deal: `Five empty hands, an empty reserve, and a shuffled deck turned one card at a time.`,
    play: [
      `Put each card on one of the <b>five hands</b>, aiming for 21 or close to it.`,
      `Aces count 1 or 11; jacks, queens and kings count 10.`,
      `Once per round you may park a card in the <b>reserve</b> and play it on a hand later.`,
      `Going over 21 on any hand ends the round at once, and that round scores nothing.`,
    ],
    score: [
      `At the end of a round: 100 × the total of every hand, plus 10,000 for each hand of exactly 21.`,
    ],
    controls: `{Click} a hand to add the next card. {Click} the reserve to park a card; {click} it again, then a hand, to play it.`,
  },
  deal(s, rng) { s.stock = up(shuffle(freshDeck(2), rng)); s.hands = [[], [], [], [], []]; s.reserve = null; s.reserveUsed = false; s.useReserve = false; },
  roundEnd(s) {
    if (s.busted) { s.busted = false; return 0; }
    return s.hands.reduce((t, h) => { const v = bjTotal(h); return t + (v <= 21 ? v * 100 : 0) + (v === 21 ? 10000 : 0); }, 0);
  },
  render(s) {
    const cur = s.useReserve ? s.reserve : s.stock[0];
    return `<div class="row" style="gap:20px;justify-content:center;--card-w:68px;margin-bottom:10px">
      <div class="pile">${cur ? cardHTML(cur) : emptySlot('Empty')}<span>${s.useReserve ? 'Playing the reserve card' : 'Next card'}</span></div>
      <div class="pile"><button class="pile-btn" data-c="reserve" aria-label="Reserve">${s.reserve ? cardHTML(s.reserve) : emptySlot(s.reserveUsed ? 'Used' : 'Reserve')}</button><span>${s.reserve ? (s.useReserve ? 'Click a hand' : 'Click to use') : 'Park a card'}</span></div></div>
      <div class="bj-hands" style="--card-w:46px">${s.hands.map((h, i) => handHTML(h, i, String(bjTotal(h)), false)).join('')}</div>`;
  },
  click(s, d) {
    if (d.c === 'reserve') {
      if (s.reserve) { s.useReserve = !s.useReserve; return s; }
      if (s.reserveUsed || !s.stock.length) return { error: 'The reserve holds one card per round.' };
      s.reserve = s.stock.shift(); s.reserveUsed = true; s.fx = 'flip'; return s;
    }
    if (d.c !== 'hand') return null;
    const card = s.useReserve ? s.reserve : s.stock.shift();
    if (!card) return null;
    if (s.useReserve) { s.reserve = null; s.useReserve = false; }
    const h = s.hands[Number(d.i)];
    h.push(card); s.fx = 'card';
    if (bjTotal(h) > 21) { s.busted = true; s.fx = 'lose'; s.endNow = true; s.endWithTime = false; }
    else if (!s.stock.length && !s.reserve) s.endNow = true;
    return s;
  },
  targets: (s) => [...s.hands.map((_, i) => ({ c: 'hand', i: String(i) })), { c: 'reserve' }],
});

const fast21 = arcade({
  id: 'fast21', name: 'Fast 21', blurb: 'Rapid-fire blackjack: make 21s and five-card Charlies.', rounds: 3, seconds: 90, bonusAt: 30000, winAt: 40000,
  how: {
    goal: `Score as many points as you can by making 21s and five-card hands before the clock runs out.`,
    deal: `Four empty hands, a reserve, and a shuffled deck turned one card at a time.`,
    play: [
      `Put each card on one of the <b>four hands</b>.`,
      `A hand that reaches exactly <b>21</b>, or holds <b>five cards</b> without going over, is cleared so you can build it again.`,
      `A card that would take a hand over 21 bounces back for you to place somewhere else.`,
      `You may park up to three cards per round in the <b>reserve</b>. Once all three are parked, or the stock is empty, you can play the top reserve card onto a hand.`,
    ],
    score: [
      `Every card played to a hand scores 100. A 21 scores 1,000 and a five-card hand 750, in place of that hand's card points.`,
      `A card that bounces costs 100.`,
      `At the end of the round the totals of the hands still on the table are added, plus 10,000 if you played all 52 cards to hands.`,
    ],
    controls: `{Click} a hand to add the next card. {Click} the reserve to park a card, or, once its cards can be played, to pick up the top one; then {click} a hand.`,
  },
  deal(s, rng) { s.stock = up(shuffle(freshDeck(3), rng)); s.hands = [[], [], [], []]; s.reserve = []; s.reserveUsed = 0; s.useReserve = false; s.played = 0; },
  roundEnd(s) { return s.hands.reduce((t, h) => t + bjTotal(h), 0) + (s.played === 52 ? 10000 : 0); },
  render(s) {
    const cur = s.useReserve ? s.reserve.at(-1) : s.stock[0];
    return `<div class="row" style="gap:20px;justify-content:center;--card-w:68px;margin-bottom:10px">
      <div class="pile">${cur ? cardHTML(cur) : emptySlot('Empty')}<span>${s.useReserve ? 'Playing from the reserve' : 'Next card'}</span></div>
      <div class="pile"><button class="pile-btn" data-c="reserve" aria-label="Reserve">${s.reserve.length ? cardHTML(s.reserve.at(-1)) : emptySlot(`${3 - s.reserveUsed} left`)}</button><span>Reserve ${s.reserve.length ? (s.useReserve ? '· click a hand' : '· click to use') : ''}</span></div></div>
      <div class="bj-hands" style="--card-w:46px">${s.hands.map((h, i) => handHTML(h, i, String(bjTotal(h)), false)).join('')}</div>`;
  },
  click(s, d) {
    if (d.c === 'reserve') {
      if (s.reserve.length && (s.useReserve || s.reserveUsed >= 3 || !s.stock.length)) { s.useReserve = !s.useReserve; return s; }
      if (s.reserveUsed >= 3 || !s.stock.length) return { error: 'The reserve takes three cards per round.' };
      s.reserve.push(s.stock.shift()); s.reserveUsed++; s.fx = 'flip'; return s;
    }
    if (d.c !== 'hand') return null;
    const fromRes = s.useReserve && s.reserve.length;
    const card = fromRes ? s.reserve.pop() : s.stock.shift();
    if (!card) return null;
    s.useReserve = false;
    const h = s.hands[Number(d.i)];
    if (bjTotal([...h, card]) > 21) {
      if (fromRes) s.reserve.push(card); else s.stock.unshift(card);
      s.roundScore -= 100; s.fx = 'error'; return s;
    }
    h.push(card); s.played++; s.roundScore += 100; s.fx = 'card';
    const v = bjTotal(h);
    if (v === 21 || h.length === 5) {
      s.roundScore += (v === 21 ? 1000 : 750) - 100 * h.length;
      s.hands[Number(d.i)] = []; s.fx = 'win';
    }
    if (!s.stock.length && !s.reserve.length) s.endNow = true;
    return s;
  },
  targets: (s) => [...s.hands.map((_, i) => ({ c: 'hand', i: String(i) })), { c: 'reserve' }],
});

// ------------------------------------------------------------------ Pick 2 / Sum 11 (pick from a grid plus the upcard)
function gridGame({ id, name, blurb, rounds, seconds, bonusAt, winAt, how, makeDeck, rowPoints, judge, stockPenalty }) {
  const cellKey = (i) => `t${i}`;
  return arcade({
    id, name, blurb, rounds, seconds, bonusAt, winAt, how,
    deal(s, rng) { const d = up(shuffle(makeDeck(), rng)); s.grid = d.slice(0, 16); s.stock = d.slice(17); s.upcard = d[16]; s.sel = []; },
    render(s) {
      const cells = s.grid.map((c, i) => (c ? cardBtn(c, { c: 'pick', k: cellKey(i) }, { selected: s.sel.includes(cellKey(i)) }) : emptySlot())).join('');
      return `<div class="row" style="gap:28px;justify-content:center;align-items:flex-start;flex-wrap:wrap">
        <div class="arcade-grid" style="--card-w:62px">${cells}</div>
        <div style="display:flex;flex-direction:column;gap:12px;align-items:center;--card-w:72px">
          <div class="pile">${s.upcard ? cardBtn(s.upcard, { c: 'pick', k: 'u' }, { selected: s.sel.includes('u') }) : emptySlot('Upcard')}<span>Upcard</span></div>
          <div class="pile">${s.stock.length ? `<button class="sol-flat" data-c="stock" aria-label="New upcard">${backHTML()}</button>` : emptySlot('Empty')}<span>Stock · ${s.stock.length}${stockPenalty ? ` · −${stockPenalty}` : ''}</span></div>
          ${rowPoints ? '<span class="sub" style="max-width:150px">Top row 400 per card, then 300, 200, 100</span>' : ''}</div></div>`;
    },
    click(s, d) {
      if (d.c === 'stock') {
        if (!s.stock.length) return null;
        if (s.upcard) { const empty = s.grid.findIndex((c) => !c); if (empty >= 0) s.grid[empty] = s.upcard; else s.stock.push(s.upcard); }
        s.upcard = s.stock.shift(); s.sel = []; s.roundScore -= stockPenalty; s.fx = 'flip';
        return s;
      }
      const key = d.k;
      const cardOf = (k) => (k === 'u' ? s.upcard : s.grid[Number(k.slice(1))]);
      if (!cardOf(key)) return null;
      s.sel = s.sel.includes(key) ? s.sel.filter((k) => k !== key) : [...s.sel, key];
      const cards = s.sel.map(cardOf);
      const v = judge(cards);
      if (v.ok) {
        s.roundScore += v.points + (rowPoints ? s.sel.filter((k) => k !== 'u').reduce((t, k) => t + (400 - 100 * Math.floor(Number(k.slice(1)) / 4)), 0) : 0);
        for (const k of s.sel) { if (k === 'u') s.upcard = null; else s.grid[Number(k.slice(1))] = null; }
        s.sel = []; s.fx = 'match';
        if (s.grid.every((c) => !c)) { s.roundScore += 10000; s.endNow = true; }
      } else if (v.bad) { s.sel = [key]; }
      return s;
    },
    targets: (s) => [...s.grid.map((c, i) => (c ? { c: 'pick', k: cellKey(i) } : null)).filter(Boolean), ...(s.upcard ? [{ c: 'pick', k: 'u' }] : []), { c: 'stock' }],
  });
}

const pick2 = gridGame({
  id: 'pick2', name: 'Pick 2', blurb: 'Remove pairs and two-card sequences before time runs out.', rounds: 2, seconds: 60, bonusAt: 80000, winAt: 120000, stockPenalty: 0,
  how: {
    goal: `Score as many points as you can by removing pairs and sequences before the clock runs out.`,
    deal: `Sixteen face-up cards in a 4 × 4 grid, one upcard beside them, and the stock.`,
    play: [
      `Remove two cards that make a <b>pair</b> (two 7s) or a <b>sequence</b> (neighboring ranks such as 9-10; A-2 and K-A count too). Use table cards, the upcard, or both.`,
      `When you can't find any more, turn a new upcard. The old one moves to an empty spot on the table, or under the stock if the table is full.`,
    ],
    fig: { cards: '7S 7H · 9D 10C · KS AH', caption: 'A pair, a sequence, and K-A' },
    score: [
      `A pair scores 3,000 and a sequence 500.`,
      `Clearing the whole table scores 10,000 and ends the round.`,
    ],
    controls: `{Click} two cards to remove them. {Click} a selected card again to let go of it. {Click} the stock for a new upcard.`,
  },
  makeDeck: () => freshDeck(5),
  judge(cards) {
    if (cards.length < 2) return {};
    if (cards.length > 2) return { bad: true };
    const [a, b] = cards.map(rk);
    if (a === b) return { ok: true, points: 3000 };
    const d = Math.abs(a - b);
    if (d === 1 || d === 12) return { ok: true, points: 500 };
    return { bad: true };
  },
});

const sum11 = gridGame({
  id: 'sum11', name: 'Sum 11', blurb: 'Remove any combination of cards that adds up to eleven.', rounds: 2, seconds: 90, bonusAt: 80000, winAt: 120000, stockPenalty: 200, rowPoints: true,
  how: {
    goal: `Score as many points as you can by removing cards that add up to 11 before the clock runs out.`,
    deal: `A special deck: 2 through 10 of every suit plus sixteen aces, and no face cards. Sixteen cards lie face up in a 4 × 4 grid, with one upcard beside them.`,
    play: [
      `Remove any group of two or more cards that adds up to <b>exactly 11</b>, from the table, the upcard, or both. Aces are always worth 1.`,
      `When you're stuck, turn a new upcard. The old one moves to an empty spot on the table, or under the stock if the table is full.`,
    ],
    fig: { cards: '6S + 4H + AD · 8C + 3D', caption: 'Two ways to make 11' },
    score: [
      `Each group scores 1,500, plus 400 for every card from the top row, 300 from the second, 200 from the third and 100 from the bottom.`,
      `A new upcard costs 200.`,
      `Clearing the whole table scores 10,000 and ends the round.`,
    ],
    controls: `{Click} cards to select them; they disappear as soon as they add up to 11. {Click} a selected card again to let go of it. {Click} the stock for a new upcard.`,
  },
  makeDeck: () => {
    const cards = [];
    for (const su of ['S', 'H', 'C', 'D']) for (let r = 2; r <= 10; r++) cards.push({ id: `${r}${su}`, rank: String(r), suit: su });
    for (let k = 0; k < 16; k++) { const su = ['S', 'H', 'C', 'D'][k % 4]; cards.push({ id: `A${su}.${k}`, rank: 'A', suit: su }); }
    return cards;
  },
  judge(cards) {
    const t = cards.reduce((a, c) => a + rk(c), 0);
    if (t === 11 && cards.length >= 2) return { ok: true, points: 1500 };
    if (t > 11) return { bad: true };
    return {};
  },
});

export default [towers, best21, fast21, pick2, sum11];
