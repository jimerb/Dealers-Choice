// Caribbean Stud: the dealer's ace-king qualifier, every line of the Bet pay table, folds, ties, the
// $1 bonus, the money through a real bank, the raise-or-fold advice and the house edge (about 5.2%).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deal, resolve, advise, upCard, dealerQualifies, minBuyIn, BET_PAYS, BONUS_PAYS, OPTIONS } from '../public/js/casino/engines/caribbean-stud.js';
import { evaluate, HAND } from '../public/js/casino/kit/poker.js';
import { cards, card } from '../public/js/casino/kit/shoe.js';
import { seededRng } from '../public/js/casino/kit/rng.js';
import { createBank } from '../public/js/core/bank.js';
import { createRound } from '../public/js/casino/kit/round.js';

const rng = seededRng(3);
const play = (bets, p, d, choice = 'raise') => resolve(deal(bets, rng, { cards: [...p.split(' '), ...d.split(' ')] }), choice).result;
const line = (r, bet) => r.lines.find((l) => l.bet === bet);
// a qualifying dealer hand (ace-king) that every pay-table hand below beats
const AK = 'AD KC 6S 4D 3C';

test('the deal: five each from one deck, the dealer\'s last card face up', () => {
  const s = deal({ ante: 10 }, seededRng(2));
  assert.equal(s.player.length, 5);
  assert.equal(s.dealer.length, 5);
  assert.equal(upCard(s), s.dealer[4]);
  assert.equal(new Set([...s.player, ...s.dealer].map((c) => c.id)).size, 10);
  assert.throws(() => deal({ ante: 0 }, rng), /Ante/);
  assert.throws(() => deal({ ante: 10, bonus: 5 }, rng), /\$1/);
  assert.throws(() => resolve(s, 'call'), /Raise or fold/);
  assert.throws(() => resolve(resolve(s, 'fold'), 'raise'), /over/);
  assert.equal(minBuyIn({ min: 5, max: 1000 }), 15);
  assert.deepEqual(OPTIONS.map((o) => [o.key, o.default]), [['bonus', true], ['hint', false]]);
});

test('the dealer qualifies with ace-king or better', () => {
  const q = (c) => dealerQualifies(evaluate(cards(c)));
  assert.equal(q('AS KH 2D 3C 5S'), true);
  assert.equal(q('AS QH JD 9C 5S'), false);
  assert.equal(q('KS QH JD 9C 5S'), false);
  assert.equal(q('2S 2H 3D 4C 6S'), true);
  assert.equal(q('AS KH QD JC 10S'), true, 'a straight');
});

test('every line of the Bet pay table when the player beats a qualifying dealer', () => {
  const hands = [
    ['AS KS QS JS 10S', HAND.ROYAL, 100], ['9H 8H 7H 6H 5H', HAND.STRAIGHT_FLUSH, 50], ['7S 7H 7D 7C 2S', HAND.QUADS, 20],
    ['3S 3H 3D 9C 9S', HAND.FULL_HOUSE, 7], ['2D 7D 9D JD QD', HAND.FLUSH, 5], ['5S 6H 7D 8C 9S', HAND.STRAIGHT, 4],
    ['5S 5H 5D KS 2D', HAND.TRIPS, 3], ['4S 4H 9D 9C 2S', HAND.TWO_PAIR, 2], ['10S 10H 2D 5C 8S', HAND.PAIR, 1],
    ['AS KH QS 5C 3D', HAND.HIGH, 1],
  ];
  for (const [p, cat, m] of hands) {
    assert.equal(BET_PAYS[cat], m);
    const d = cat === HAND.HIGH ? 'AC KD JH 4S 2S' : AK;
    const r = play({ ante: 10 }, p, d);
    assert.equal(r.outcome, 'win', p);
    assert.equal(line(r, 'Ante').back, 20, p);
    assert.equal(line(r, 'Bet').back, 20 * (m + 1), p);
    assert.equal(r.wagered, 30);
    assert.equal(r.returned, 20 + 20 * (m + 1));
  }
});

test('a dealer who doesn\'t qualify: Ante 1 to 1, the Bet comes back, whatever the hands', () => {
  for (const p of ['AS AH AD 5C 5S', '2S 3H 5D 7C 9S']) {
    const r = play({ ante: 10 }, p, 'AC QD JH 4S 2C');
    assert.equal(r.qualifies, false);
    assert.equal(r.outcome, 'noqualify');
    assert.equal(r.returned, 20 + 20);
    assert.equal(r.net, 10);
  }
});

test('losing to a qualifying dealer loses both; a tie returns both', () => {
  const lose = play({ ante: 10 }, 'QS QH 2D 5C 8S', 'KS KH 3D 4C 9S');
  assert.equal(lose.outcome, 'lose');
  assert.equal(lose.returned, 0);
  assert.equal(lose.net, -30);
  const tie = play({ ante: 10 }, 'AS KH 9D 5C 3S', 'AH KD 9C 5S 3D');
  assert.equal(tie.outcome, 'push');
  assert.equal(tie.returned, 30);
  assert.equal(tie.net, 0);
});

test('folding loses the Ante and the bonus, whatever the hand', () => {
  const r = play({ ante: 10, bonus: 1 }, '2D 7D 9D JD QD', AK, 'fold');
  assert.equal(r.outcome, 'fold');
  assert.equal(r.bet, 0);
  assert.equal(r.wagered, 11);
  assert.equal(r.returned, 0);
});

test('the $1 bonus pays fixed amounts on the player\'s hand, even when the dealer wins', () => {
  const hands = [['AS KS QS JS 10S', 200000], ['9H 8H 7H 6H 5H', 20000], ['7S 7H 7D 7C 2S', 500], ['3S 3H 3D 9C 9S', 100], ['2D 7D 9D JD QD', 50], ['5S 6H 7D 8C 9S', 0], ['5S 5H 5D KS 2D', 0]];
  for (const [p, w] of hands) {
    const r = play({ ante: 10, bonus: 1 }, p, AK);
    assert.equal(line(r, 'Bonus').back, w ? w + 1 : 0, p);
  }
  // the dealer's royal beats a flush, the flush still collects the bonus
  const r = play({ ante: 10, bonus: 1 }, '2D 7D 9D JD QD', 'AH KH QH JH 10H');
  assert.equal(r.outcome, 'lose');
  assert.equal(r.returned, 51);
  // exact bonus return from the five-card category counts (it is only lost on a fold, and paying hands never fold)
  const counts = { [HAND.ROYAL]: 4, [HAND.STRAIGHT_FLUSH]: 36, [HAND.QUADS]: 624, [HAND.FULL_HOUSE]: 3744, [HAND.FLUSH]: 5108 };
  const back = Object.entries(counts).reduce((t, [cat, n]) => t + n * (BONUS_PAYS[cat] + 1), 0) / 2598960;
  assert.ok(Math.abs(back - 0.950886) < 1e-5, `bonus returns ${(back * 100).toFixed(3)}%`);
});

test('the advice: a pair raises, under ace-king folds, ace-king by the up card', () => {
  const a = (p, up) => advise(cards(p), card(up)).raise;
  assert.equal(a('2S 2H 5D 7C 9S', 'AH'), true);
  assert.equal(a('AS QH JD 9C 5S', '2H'), false);
  assert.equal(a('AS KH 8D 6C 3S', '8C'), true, 'matches a 2-Q up card');
  assert.equal(a('AS KH 8D 6C 3S', 'KC'), false, 'a king up and no queen or jack');
  assert.equal(a('AS KH JD 6C 3S', 'AC'), true, 'an ace up, holding a jack');
  assert.equal(a('AS KH QD 9C 3S', '7C'), true, 'a queen, and the up card under the fourth card');
  assert.equal(a('AS KH QD 6C 3S', '7C'), false, 'up card over the fourth card');
  assert.equal(a('AS KH 9D 6C 3S', '2C'), false, 'no queen');
  assert.match(advise(cards('2S 2H 5D 7C 9S'), card('AH')).text, /^Raise/);
  assert.match(advise(cards('AS QH JD 9C 5S'), card('2H')).text, /^Fold/);
});

test('money through the bank: Ante and bonus at the deal, the Bet on a raise, leaving forfeits', () => {
  const store = new Map();
  const bank = createBank({ storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }, win: null });
  const round = createRound(bank, 'caribbean-stud');
  round.wager(11);
  let s = deal({ ante: 10, bonus: 1 }, rng, { cards: ['3S', '3H', '3D', '9C', '9S', ...AK.split(' ')] });
  round.wager(20);
  s = resolve(s, 'raise');
  round.settle({ returned: s.result.returned });
  assert.equal(s.result.returned, 20 + 160 + 101);
  assert.equal(bank.balance, 5000 - 31 + 281);
  assert.equal(bank.get().stats['caribbean-stud'].net, 250);
  round.wager(10);
  assert.deepEqual(round.leave(), { back: 0, lost: 10 });
});

/** Play n hands by the advice; the return per Ante dollar (bonus left out). */
function simulate(n, seed) {
  const r = seededRng(seed);
  let net = 0;
  for (let i = 0; i < n; i++) {
    const s = deal({ ante: 1 }, r);
    net += resolve(s, advise(s.player, upCard(s)).raise ? 'raise' : 'fold').result.net;
  }
  return -net / n;
}

test('a short run by the advice: the house keeps a few percent of the Ante', () => {
  const edge = simulate(10000, 1);
  assert.ok(edge > -0.02 && edge < 0.13, `house edge ${(edge * 100).toFixed(2)}%`);
});

test('SLOW: two million hands by the advice land on 5.2% of the Ante', { skip: process.env.SLOW !== '1' }, () => {
  const edge = simulate(2_000_000, 2025);
  assert.ok(Math.abs(edge - 0.0522) < 0.004, `house edge ${(edge * 100).toFixed(3)}%`);
});
