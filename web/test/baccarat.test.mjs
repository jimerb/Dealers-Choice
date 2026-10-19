// Baccarat rules engine: points, the full third-card tableau, every payout, commission rounding,
// the shoe and scorecard, and the exact odds and house edges of each bet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  points, handTotal, playerDraws, bankerDraws, playCoup, dealCoup, settleBets, bankerWin, checkBets,
  newBaccaratShoe, init, playRound, roadCounts, betStyle, exactOdds, houseEdges, CUT_FROM_END, OPTIONS, minBuyIn,
} from '../public/js/casino/engines/baccarat.js';
import { stack, card, cards, remaining, needsShuffle, reshuffle } from '../public/js/casino/kit/shoe.js';
import { seededRng } from '../public/js/casino/kit/rng.js';
import { createBank, KEY } from '../public/js/core/bank.js';
import { createRound } from '../public/js/casino/kit/round.js';

/** A coup from card codes, in deal order (P, B, P, B, then third cards). */
const coupOf = (codes) => { const list = cards(codes); let i = 0; return playCoup(() => { if (i >= list.length) throw new Error('ran out'); return list[i++]; }); };
/** A card worth `v` points. */
const ofPoints = (v) => card(v === 0 ? 'KS' : v === 1 ? 'AS' : `${v}S`);

test('points: ace 1, two to nine face value, tens and faces 0; totals keep the last digit', () => {
  assert.equal(points(card('AH')), 1);
  for (let v = 2; v <= 9; v++) assert.equal(points(card(`${v}D`)), v);
  for (const r of ['10', 'J', 'Q', 'K']) assert.equal(points(card(`${r}C`)), 0);
  assert.equal(handTotal(cards('9S 4H')), 3);
  assert.equal(handTotal(cards('10S KH')), 0);
  assert.equal(handTotal(cards('7S 8H 9C')), 4);
});

test('Player draws on 0 to 5 and stands on 6 and 7', () => {
  for (let t = 0; t <= 5; t++) assert.equal(playerDraws(t), true, `draws on ${t}`);
  for (const t of [6, 7]) assert.equal(playerDraws(t), false, `stands on ${t}`);
});

test('Banker tableau, every cell: totals 0-7 against the Player\'s third card (none, 0-9)', () => {
  // DRAW[total] = the Player third-card values on which the Banker draws
  const DRAW = { 0: 'all', 1: 'all', 2: 'all', 3: [0, 1, 2, 3, 4, 5, 6, 7, 9], 4: [2, 3, 4, 5, 6, 7], 5: [4, 5, 6, 7], 6: [6, 7], 7: [] };
  for (let t = 0; t <= 7; t++) {
    assert.equal(bankerDraws(t, null), t <= 5, `Player stood, Banker ${t}`);
    for (let p = 0; p <= 9; p++) {
      const want = DRAW[t] === 'all' || DRAW[t].includes(p);
      assert.equal(bankerDraws(t, p), want, `Banker ${t}, Player's third card ${p}`);
    }
  }
});

test('the tableau is followed in a dealt coup, cell by cell', () => {
  // Player total 0-5 so the Player draws card p; the Banker holds t; the Banker's third card is a 9
  for (let t = 0; t <= 7; t++) {
    for (let p = 0; p <= 9; p++) {
      const deal = [ofPoints(0), ofPoints(t), ofPoints(0), ofPoints(0), ofPoints(p), card('9H')];
      let i = 0;
      const r = playCoup(() => deal[i++]);
      assert.equal(r.player.length, 3);
      assert.equal(r.banker.length, bankerDraws(t, p) ? 3 : 2, `Banker ${t} v Player third ${p}`);
    }
  }
  // the Player stands on 6 or 7; the Banker then draws on 0-5 only
  for (const pt of [6, 7]) {
    for (let t = 0; t <= 7; t++) {
      const deal = [ofPoints(pt), ofPoints(t), ofPoints(0), ofPoints(0), card('2H')];
      let i = 0;
      const r = playCoup(() => deal[i++]);
      assert.equal(r.player.length, 2);
      assert.equal(r.banker.length, t <= 5 ? 3 : 2, `Player stood on ${pt}, Banker ${t}`);
    }
  }
});

test('naturals end the coup: no third cards for either hand', () => {
  for (const [codes, winner] of [['8S KH KD 3C', 'player'], ['KS 9H KD KC', 'banker'], ['4S 5H 4D 3C', 'tie'], ['9S 8H KD 3C', 'player']]) {
    const r = coupOf(codes);
    assert.equal(r.natural, true, codes);
    assert.equal(r.player.length + r.banker.length, 4);
    assert.equal(r.winner, winner, codes);
  }
  // a natural on one side stops the other from drawing even on 0
  const r = coupOf('KS 4H KD 4C');
  assert.equal(r.natural, true);
  assert.equal(r.pTotal, 0);
  assert.equal(r.winner, 'banker');
});

test('a full coup: Player draws, Banker draws by the tableau, totals and winner', () => {
  const r = coupOf('2S 3H 2D KC 5H 4C'); // P 4 -> draws 5 = 9; B 3 v p 5 -> draws 4 = 7
  assert.deepEqual([r.pTotal, r.bTotal, r.winner], [9, 7, 'player']);
  const s = coupOf('AS 6H 4D QC 8H'); // P 5 draws 8 -> 3; B 6 v 8 -> stands
  assert.deepEqual([s.pTotal, s.bTotal, s.winner, s.banker.length], [3, 6, 'banker', 2]);
});

test('payouts: Player 1 to 1, Banker 1 to 1 less 5%, Tie 8 to 1; a tie pushes Player and Banker', () => {
  const bets = { player: 100, banker: 100, tie: 10 };
  assert.deepEqual(settleBets(bets, 'player').lines.map((l) => [l.key, l.returned, l.outcome]), [['player', 200, 'win'], ['banker', 0, 'lose'], ['tie', 0, 'lose']]);
  assert.deepEqual(settleBets(bets, 'banker').lines.map((l) => [l.key, l.returned, l.outcome]), [['player', 0, 'lose'], ['banker', 195, 'win'], ['tie', 0, 'lose']]);
  assert.deepEqual(settleBets(bets, 'tie').lines.map((l) => [l.key, l.returned, l.outcome]), [['player', 100, 'push'], ['banker', 100, 'push'], ['tie', 90, 'win']]);
  assert.deepEqual(settleBets({ tie: 10 }, 'tie', { tie: 9 }), { wagered: 10, returned: 100, net: 90, lines: [{ key: 'tie', stake: 10, returned: 100, outcome: 'win' }] });
  assert.deepEqual(settleBets({ player: 25 }, 'player'), { wagered: 25, returned: 50, net: 25, lines: [{ key: 'player', stake: 25, returned: 50, outcome: 'win' }] });
  assert.equal(settleBets({ banker: 20 }, 'banker').net, 19);
  assert.equal(settleBets({ banker: 20 }, 'player').net, -20);
  assert.equal(settleBets({ player: 5, tie: 5 }, 'tie').net, 40);
});

test('the Banker\'s 5% commission is rounded down to whole dollars', () => {
  assert.equal(bankerWin(5), 4);    // 4.75
  assert.equal(bankerWin(10), 9);   // 9.50
  assert.equal(bankerWin(15), 14);  // 14.25
  assert.equal(bankerWin(20), 19);
  assert.equal(bankerWin(25), 23);  // 23.75
  assert.equal(bankerWin(100), 95);
  assert.equal(bankerWin(1000), 950);
  assert.equal(bankerWin(1), 0);
  for (let s = 1; s <= 5000; s++) {
    const w = bankerWin(s);
    assert.ok(Number.isInteger(w) && w <= s * 0.95 + 1e-9 && w > s * 0.95 - 1, `stake ${s}`);
  }
});

test('table limits per bet', () => {
  const L = { min: 5, max: 1000 };
  assert.equal(checkBets({}, L), 'Place a bet first.');
  assert.equal(checkBets({ player: 5 }, L), null);
  assert.match(checkBets({ player: 4 }, L), /minimum/);
  assert.match(checkBets({ banker: 1005 }, L), /most on one bet/);
  assert.equal(checkBets({ banker: 1e6 }, { min: 100, max: null }), null);
  assert.equal(minBuyIn({ min: 25 }), 25);
});

test('the shoe: eight decks, the cut card 14 from the end, no burn', () => {
  const shoe = newBaccaratShoe({ decks: 8 }, seededRng(3));
  assert.equal(shoe.cards.length, 416);
  assert.equal(shoe.cut, 416 - CUT_FROM_END);
  const six = newBaccaratShoe({ decks: 6 }, seededRng(3));
  assert.equal(six.cards.length, 312);
  stack(shoe, ['8S', 'KH', 'KD', '3C']);
  const r = dealCoup(shoe);
  assert.equal(r.player[0].rank, '8', 'the first card off the shoe goes to the Player (nothing burned)');
  assert.equal(remaining(shoe), 412);
  assert.deepEqual(OPTIONS.map((o) => [o.key, o.default]), [['decks', 8], ['tie', 8], ['scorecard', true]]);
});

test('rounds: the scorecard fills, the shoe is reshuffled once the cut card is out', () => {
  const rng = seededRng(11);
  let s = init({ opts: {}, rng });
  const before = JSON.stringify(s);
  const r1 = playRound(s, { banker: 10 }, rng);
  assert.equal(JSON.stringify(s), before, 'never changes the state it is given');
  assert.equal(r1.state.road.length, 1);
  assert.equal(r1.state.road[0].style, 'single');
  s = r1.state;
  let shuffles = 0, rounds = 0;
  while (shuffles < 2 && rounds < 400) {
    const due = needsShuffle(s.shoe);
    const r = playRound(s, { player: 5, tie: 5 }, rng);
    if (r.shuffled) { shuffles++; assert.ok(due); assert.equal(r.state.road.length, 1, 'the scorecard starts over with the shoe'); }
    assert.equal(r.state.road.at(-1).style, 'sat');
    s = r.state;
    rounds++;
  }
  assert.equal(shuffles, 2);
  assert.ok(rounds > 60 && rounds < 220);
  const c = roadCounts(s.road);
  assert.equal(c.player + c.banker + c.tie, s.road.length);
  assert.equal(betStyle({ player: 5 }), 'single');
  assert.equal(betStyle({ player: 5, banker: 5 }), 'sat');
  // changing the deck count starts a new shoe at the next round
  const six = playRound(s, { player: 5 }, rng, { decks: 6 });
  assert.equal(six.shuffled, true);
  assert.equal(six.state.shoe.cards.length, 312);
});

test('a round against the bank: wager, settle, stats', () => {
  const m = new Map();
  const bank = createBank({ storage: { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }, win: null });
  const round = createRound(bank, 'baccarat');
  const rng = seededRng(2);
  const s = init({ rng });
  stack(s.shoe, ['KS', '9H', '8D', '9C']); // K+8 = 8 and 9+9 = 8: a natural tie
  const bets = { banker: 25, tie: 5 }; // the tie pushes the Banker bet and pays the Tie 8 to 1
  assert.equal(round.wager(30), true);
  const r = playRound(s, bets, rng);
  round.settle({ returned: r.result.returned });
  assert.equal(r.coup.winner, 'tie');
  assert.equal(r.result.returned, 25 + 45);
  assert.equal(bank.balance, 5000 + 40);
  assert.deepEqual(bank.get().stats.baccarat.hands, 1);
  assert.equal(bank.get().stats.baccarat.net, r.result.net);
  assert.ok(KEY);
});

test('exact odds off an eight-deck shoe: Banker 45.86%, Player 44.62%, Tie 9.52%', () => {
  const o = exactOdds(8);
  assert.ok(Math.abs(o.player + o.banker + o.tie - 1) < 1e-9);
  assert.ok(Math.abs(o.banker - 0.458597) < 5e-6, `banker ${o.banker}`);
  assert.ok(Math.abs(o.player - 0.446247) < 5e-6, `player ${o.player}`);
  assert.ok(Math.abs(o.tie - 0.095156) < 5e-6, `tie ${o.tie}`);
  const e = houseEdges(o);
  assert.ok(Math.abs(e.banker - 0.010579) < 5e-6, `banker edge ${e.banker}`);
  assert.ok(Math.abs(e.player - 0.012351) < 5e-6, `player edge ${e.player}`);
  assert.ok(Math.abs(e.tie - 0.143596) < 5e-6, `tie edge ${e.tie}`);
  const nine = houseEdges(o, { tie: 9 });
  assert.ok(Math.abs(nine.tie - 0.048440) < 5e-5, `tie 9 to 1 edge ${nine.tie}`);
});

test('dealt coups match the exact odds and edges (200,000 coups; 1,000,000 with SLOW=1)', () => {
  const N = process.env.SLOW === '1' ? 1_000_000 : 200_000;
  const rng = seededRng(2024);
  const shoe = newBaccaratShoe({ decks: 8 }, rng);
  const won = { player: 0, banker: 0, tie: 0 };
  let net = { player: 0, banker: 0, tie: 0 };
  for (let i = 0; i < N; i++) {
    if (needsShuffle(shoe)) reshuffle(shoe, rng);
    const coup = dealCoup(shoe);
    const r = settleBets({ player: 100, banker: 100, tie: 100 }, coup.winner);
    won[coup.winner]++;
    for (const l of r.lines) net[l.key] += l.returned - l.stake;
  }
  const tol = process.env.SLOW === '1' ? 0.0015 : 0.0035;
  assert.ok(Math.abs(won.banker / N - 0.4586) < tol, `banker ${won.banker / N}`);
  assert.ok(Math.abs(won.player / N - 0.4462) < tol, `player ${won.player / N}`);
  assert.ok(Math.abs(won.tie / N - 0.0952) < tol, `tie ${won.tie / N}`);
  net = Object.fromEntries(Object.entries(net).map(([k, v]) => [k, -v / (100 * N)]));
  assert.ok(Math.abs(net.banker - 0.0106) < 0.006, `banker edge ${net.banker}`);
  assert.ok(Math.abs(net.player - 0.0124) < 0.006, `player edge ${net.player}`);
  assert.ok(Math.abs(net.tie - 0.1436) < 0.03, `tie edge ${net.tie}`);
});
