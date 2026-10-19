// Pai Gow Poker rules engine: the deck, the joker as a bug, legal settings, the house way,
// the showdown with copies to the dealer, and the 5% commission.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deal, evalHigh, evalLow, checkSetting, lowOutranks, splitByLow, houseWay, showdown, settle, winAmount, playHand, FOUL, OPTIONS,
} from '../public/js/casino/engines/pai-gow-poker.js';
import { cards, card } from '../public/js/casino/kit/shoe.js';
import { HAND } from '../public/js/casino/kit/poker.js';
import { seededRng } from '../public/js/casino/kit/rng.js';

const codes = (list) => list.map((c) => (c.rank === 'JK' ? 'JK' : `${c.rank}${c.suit}`)).sort().join(' ');
const sorted = (s) => s.trim().split(/\s+/).sort().join(' ');
/** The house way's low hand for seven cards, as sorted codes. */
const hwLow = (s, opts) => codes(houseWay(cards(s), opts).low);

test('the deck: 53 cards with one joker; seven each to player and dealer', () => {
  const { player, dealer, deck } = deal(seededRng(5));
  assert.equal(deck.cards.length, 53);
  assert.equal(deck.cards.filter((c) => c.rank === 'JK').length, 1);
  assert.equal(player.length, 7);
  assert.equal(dealer.length, 7);
  assert.equal(new Set([...player, ...dealer].map((c) => c.id)).size, 14);
  assert.deepEqual(OPTIONS.map((o) => [o.key, o.default]), [['a5', true], ['verify', true], ['hint', true]]);
});

test('joker as a bug: an ace, or a straight, flush or straight flush, never anything else', () => {
  assert.equal(evalHigh(cards('JK AS KD 7C 4H')).cat, HAND.PAIR, 'pairs with an ace');
  assert.deepEqual(evalHigh(cards('JK AS KD 7C 4H')).tiebreak.slice(0, 1), [14]);
  assert.equal(evalHigh(cards('JK 9S KD 7C 4H')).tiebreak[0], 14, 'alone it is an ace high');
  assert.equal(evalHigh(cards('JK 9S 9D 7C 4H')).cat, HAND.PAIR, 'it does not pair a nine');
  assert.equal(evalHigh(cards('JK 9S 9D 9C 4H')).cat, HAND.TRIPS, 'nor make four nines');
  assert.equal(evalHigh(cards('JK 9S 10D JC QH')).cat, HAND.STRAIGHT, 'it fills a straight');
  assert.equal(evalHigh(cards('JK 9S 10D JC QH')).tiebreak[0], 13, 'as the king');
  assert.equal(evalHigh(cards('JK 9S 7S 4S 2S')).cat, HAND.FLUSH, 'it completes a flush');
  assert.equal(evalHigh(cards('JK 9S 7S 4S 2S')).tiebreak[0], 14, 'as the ace of the flush');
  assert.equal(evalHigh(cards('JK 9H 10H JH QH')).cat, HAND.STRAIGHT_FLUSH);
  assert.equal(evalHigh(cards('JK KH 10H JH QH')).cat, HAND.ROYAL);
});

test('five aces is the best hand', () => {
  const five = evalHigh(cards('JK AS AD AC AH'));
  assert.equal(five.cat, HAND.FIVE);
  assert.ok(five.score > evalHigh(cards('JK KH 10H JH QH')).score, 'beats a royal flush');
  assert.ok(five.score > evalHigh(cards('AH KH 10H JH QH')).score);
  assert.equal(five.text, 'Five aces');
});

test('wheel straights: A-2-3-4-5 second highest with a5, lowest without; the joker makes it either way', () => {
  const wheel = evalHigh(cards('AS 2D 3C 4H 5S'));
  const broadway = evalHigh(cards('AS KD QC JH 10S'));
  const kingHigh = evalHigh(cards('9S KD QC JH 10S'));
  const sixHigh = evalHigh(cards('6S 2D 3C 4H 5S'));
  assert.ok(broadway.score > wheel.score && wheel.score > kingHigh.score && kingHigh.score > sixHigh.score);
  const off = { a5: false };
  assert.ok(evalHigh(cards('AS 2D 3C 4H 5S'), off).score < evalHigh(cards('6S 2D 3C 4H 5S'), off).score);
  // joker + 2 3 4 5: a wheel with a5 (it beats six high), six high without
  const jk = evalHigh(cards('JK 2D 3C 4H 5S'));
  assert.equal(jk.cat, HAND.STRAIGHT);
  assert.ok(jk.score === wheel.score, 'joker as the ace of the wheel');
  assert.equal(evalHigh(cards('JK 2D 3C 4H 5S'), off).tiebreak[0], 6, 'joker as the six');
  // joker as the missing low card of the wheel
  assert.equal(evalHigh(cards('JK AD 3C 4H 5S')).score, wheel.score);
  // a wheel straight flush with the joker is a straight flush
  const wsf = evalHigh(cards('JK 2S 3S 4S 5S'));
  assert.equal(wsf.cat, HAND.STRAIGHT_FLUSH);
  assert.ok(wsf.score > evalHigh(cards('9S KS QS JS 10S')).score, 'second-highest straight flush with a5');
});

test('low hands: a pair beats any two cards; the joker is an ace', () => {
  assert.equal(evalLow(cards('2S 2D')).cat, 1);
  assert.ok(evalLow(cards('2S 2D')).score > evalLow(cards('AS KD')).score);
  assert.deepEqual(evalLow(cards('JK KD')).tiebreak, [14, 13]);
  assert.equal(evalLow(cards('JK AD')).text, 'Pair of As');
  assert.equal(evalLow(cards('QS 9D')).text, 'Q-9');
});

test('setting: the five-card hand must outrank the two-card hand', () => {
  const ok = (h, l) => checkSetting(cards(h), cards(l));
  assert.equal(ok('AS 9D 7C 4H 2S', 'KD QC'), null, 'A high over K-Q');
  assert.equal(ok('KS 9D 7C 4H 2S', 'AD QC'), FOUL, 'K high under A-Q');
  assert.equal(ok('AS 9D 7C 4H 2S', 'AD QC'), FOUL, 'A-9 under A-Q');
  assert.equal(ok('AS QD 7C 4H 2S', 'AD 3C'), null, 'A-Q over A-3');
  assert.equal(ok('AS 9D 7C 4H 2S', '3D 3C'), FOUL, 'no pair under a pair');
  assert.equal(ok('5S 5D 7C 4H 2S', '6D 6C'), FOUL, 'fives under sixes');
  assert.equal(ok('7S 7D AC 4H 2S', '6D 6C'), null, 'sevens over sixes');
  assert.equal(ok('3S 3D 2C 2H 9S', 'AD AC'), null, 'two pair over any pair');
  assert.equal(ok('JK AS 7C 4H 2S', 'AD AC'), null, 'aces with kickers over aces');
  assert.equal(ok('3S 4D 5C 6H 7S', 'AD AC'), null, 'a straight over anything');
  assert.match(checkSetting(cards('3S 4D 5C 6H'), cards('AD AC 2S')), /five cards/);
  assert.equal(lowOutranks(evalHigh(cards('KS QD 7C 4H 2S')), evalLow(cards('KD QC'))), false, 'equal tops are allowed');
});

test('splitByLow sends the chosen two cards low', () => {
  const seven = cards('AS KD QC JH 9S 5D 2C');
  const { high, low } = splitByLow(seven, ['KD', '5D']);
  assert.equal(codes(low), '5D KD');
  assert.equal(high.length, 5);
});

test('house way, known hands', () => {
  // no pair: highest card high, next two low
  assert.equal(hwLow('AS KD QC 9H 7S 5D 2C'), sorted('KD QC'));
  // one pair: pair high, next two highest low
  assert.equal(hwLow('8S 8D AC KH 7S 5D 2C'), sorted('AC KH'));
  // two pair: split, higher pair high
  assert.equal(hwLow('KS KD 9C 9H 7S 5D 2C'), sorted('9C 9H'));
  // two small pairs with an ace: together, ace low with the next card
  assert.equal(hwLow('6S 6D 3C 3H AS 9D 2C'), sorted('AS 9D'));
  // two small pairs without an ace: split
  assert.equal(hwLow('6S 6D 3C 3H KS 9D 2C'), sorted('3C 3H'));
  // three pair: highest pair low
  assert.equal(hwLow('QS QD 8C 8H 4S 4D 2C'), sorted('QD QS'));
  // trips: kept high, next two low
  assert.equal(hwLow('9S 9D 9C KH QS 5D 2C'), sorted('KH QS'));
  // trip aces: a pair of aces high, ace + next card low
  const ta = houseWay(cards('AS AD AC KH QS 5D 2C'));
  assert.equal(ta.low.filter((c) => c.rank === 'A').length, 1);
  assert.ok(ta.low.some((c) => c.rank === 'K'));
  // two trips: a pair of the higher trips low
  assert.equal(houseWay(cards('JS JD JC 4H 4S 4D 2C')).low.filter((c) => c.rank === 'J').length, 2);
  // full house: pair low
  assert.equal(hwLow('9S 9D 9C KH KS 5D 2C'), sorted('KH KS'));
  // trips and two pairs: highest pair low
  assert.equal(hwLow('5S 5D 5C KH KS 8D 8C'), sorted('KH KS'));
  // four of a kind: low quads together, top two singles low
  assert.equal(hwLow('5S 5D 5C 5H KS QD 2C'), sorted('KS QD'));
  // 7-10 split without an ace, together with one
  assert.equal(codes(houseWay(cards('9S 9D 9C 9H KS QD 2C')).low).split(' ').filter((c) => c[0] === '9').length, 2);
  assert.equal(hwLow('9S 9D 9C 9H AS QD 2C'), sorted('AS QD'));
  // J-A split
  assert.equal(codes(houseWay(cards('QS QD QC QH AS 7D 2C')).low).split(' ').filter((c) => c[0] === 'Q').length, 2);
  // four of a kind beside a pair: the pair low
  assert.equal(hwLow('5S 5D 5C 5H KS KD 2C'), sorted('KD KS'));
  // five aces: a pair of aces low; with kings, kings low
  assert.equal(houseWay(cards('JK AS AD AC AH 9D 2C')).low.every((c) => c.rank === 'A' || c.rank === 'JK'), true);
  assert.equal(hwLow('JK AS AD AC AH KD KC'), sorted('KC KD'));
  // a straight with no pair: the straight that leaves the best low
  const st = houseWay(cards('4S 5D 6C 7H 8S KD QC'));
  assert.equal(evalHigh(st.high).cat, HAND.STRAIGHT);
  assert.equal(codes(st.low), 'KD QC');
  // the joker completes a straight
  assert.equal(evalHigh(houseWay(cards('JK 5D 6C 7H 8S KD 2C')).high).cat, HAND.STRAIGHT);
  // a flush with one pair keeps the pair low when it can
  const fl = houseWay(cards('2H 6H 9H JH KH KS 3H'));
  assert.equal(evalHigh(fl.high).cat, HAND.FLUSH);
  assert.equal(evalLow(fl.low).cat, 1, 'pair of kings low');
  // trips with a straight that leaves a pair low
  const tp = houseWay(cards('5S 5D 5C 3H 4S 6D 7C'));
  assert.equal(evalHigh(tp.high).cat, HAND.STRAIGHT);
  assert.equal(evalLow(tp.low).cat, 1);
  // the joker with a lone ace makes a pair of aces
  assert.equal(evalHigh(houseWay(cards('JK AS 9C 7H 5S 3D QC')).high).cat, HAND.PAIR);
});

test('the house way is always legal and deterministic (20,000 deals; 50,000 with SLOW=1)', () => {
  const N = process.env.SLOW === '1' ? 50_000 : 20_000;
  const rng = seededRng(77);
  for (let i = 0; i < N; i++) {
    const { player } = deal(rng);
    const a = houseWay(player);
    assert.equal(checkSetting(a.high, a.low), null, `legal: ${codes(player)}`);
    assert.notEqual(a.reason, 'Best legal setting', `a house-way rule covers ${codes(player)}`);
    assert.equal(a.high.length + a.low.length, 7);
    assert.equal(codes([...a.high, ...a.low]), codes(player));
    const b = houseWay([...player].reverse());
    assert.equal(codes(a.low), codes(b.low), 'same setting whatever the order');
    if (i % 4 === 0) assert.equal(checkSetting(houseWay(player, { a5: false }).high, houseWay(player, { a5: false }).low, { a5: false }), null);
  }
});

test('showdown: win both, one each, copies go to the dealer', () => {
  const set = (h, l) => ({ high: cards(h), low: cards(l) });
  const strong = set('AS AD 9C 7H 5S', 'KD QC');
  const weak = set('KS KD 8C 6H 4S', 'JD 9C');
  assert.equal(showdown(strong, weak).result, 'win');
  assert.equal(showdown(weak, strong).result, 'lose');
  const split = set('2S 2D 8C 6H 4S', 'AH KC');
  assert.equal(showdown(split, weak).result, 'push');
  // copies: a tie on a hand goes to the dealer
  const copyHigh = showdown(set('AS AD 9C 7H 5S', 'KD QC'), set('AH AC 9D 7S 5D', 'JH 10C'));
  assert.equal(copyHigh.high, 'dealer');
  assert.equal(copyHigh.highCopy, true);
  assert.equal(copyHigh.result, 'push');
  const copyBoth = showdown(set('AS AD 9C 7H 5S', 'KD QC'), set('AH AC 9D 7S 5D', 'KH QS'));
  assert.equal(copyBoth.result, 'lose', 'two copies lose');
  const copyLow = showdown(set('AS AD 9C 7H 5S', 'KD QC'), set('KH KC 9D 7S 5D', 'KS QS'));
  assert.equal(copyLow.result, 'push', 'win high, copy low');
});

test('payouts: a win pays 1 to 1 less 5%, rounded down; push returns the stake; a loss nothing', () => {
  assert.equal(settle(100, 'win'), 195);
  assert.equal(settle(5, 'win'), 9, '$5 wins $4 (4.75 rounded down)');
  assert.equal(settle(10, 'win'), 19);
  assert.equal(settle(25, 'win'), 48);
  assert.equal(settle(25, 'push'), 25);
  assert.equal(settle(25, 'lose'), 0);
  for (let s = 1; s <= 3000; s++) assert.ok(winAmount(s) === Math.floor(s * 0.95 + 1e-9), `stake ${s}`);
});

test('a whole hand: a foul setting is refused, a legal one plays against the house way', () => {
  const player = cards('AS AD KC QH 7S 5D 2C');
  const dealer = cards('3S 4D 8C 9H JS 10D 7C');
  assert.throws(() => playHand(10, player, dealer, ['AS', 'AD']), new RegExp(FOUL.replace(/'/g, '.')));
  const r = playHand(10, player, dealer, ['KC', 'QH']);
  assert.equal(evalHigh(r.dealerSet.high).cat, HAND.STRAIGHT, 'the dealer plays the straight');
  assert.ok(['win', 'push', 'lose'].includes(r.result));
  assert.equal(r.returned, settle(10, r.result));
  assert.ok(card('JK'));
});

test('house way against house way: the money adds up (SLOW=1: 200,000 hands)', () => {
  const N = process.env.SLOW === '1' ? 200_000 : 5_000;
  const rng = seededRng(9);
  let wagered = 0, returned = 0;
  const count = { win: 0, push: 0, lose: 0 };
  for (let i = 0; i < N; i++) {
    const { player, dealer } = deal(rng);
    const p = houseWay(player);
    const s = showdown(p, houseWay(dealer));
    count[s.result]++;
    wagered += 100; returned += settle(100, s.result);
  }
  const edge = 1 - returned / wagered;
  // published figures for the player using the house way against the banking house: ~2.5% edge,
  // pushes around 40%
  assert.ok(count.push / N > 0.33 && count.push / N < 0.48, `pushes ${count.push / N}`);
  assert.ok(edge > -0.01 && edge < 0.07, `edge ${edge}`);
});
