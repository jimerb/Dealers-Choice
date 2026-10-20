// Let It Ride: playable. One seat at the half-moon table with the 1, 2 and $ circles, the player's
// three cards beside them and the two community cards along the top. Chips placed on any circle go
// on all three (the bets are always equal); Deal; pull back bet 1 or let it ride; the first
// community card turns; the same for bet 2; the second card turns and every bet still up is paid.
// Rules in ../engines/let-it-ride.js.
import { text } from '../svg.js';
import { chipSVG } from '../chips.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';
import * as E from '../engines/let-it-ride.js';
import { seatTable, seatPoint, betLines, pause, showResult, CSS } from './three-card-poker.js';

const CIRCLES = [{ key: 'bet1', r: 335, label: '1' }, { key: 'bet2', r: 395, label: '2' }, { key: 'bet3', r: 455, label: '$' }];
const PLAYER = { xs: [262, 333, 404], y: 382, w: 68 };
const COMMUNITY = { xs: [473, 527], y: 90, w: 44 };

export function layout() {
  return seatTable({
    name: 'Let It Ride',
    label: 'Let It Ride table: two community cards on top; your bets 1, 2 and $',
    dealerCards: 2,
    dealerNote: 'Community cards',
    payLines: ['Pays on every bet still riding', 'Royal flush 1000 to 1 · Straight flush 200 to 1 · Four of a kind 50 to 1',
      'Full house 11 to 1 · Flush 8 to 1 · Straight 5 to 1', 'Three of a kind 3 to 1 · Two pair 2 to 1 · Tens or better 1 to 1'],
    spots: CIRCLES.map((c) => ({ r: c.r, label: c.label, key: c.key, radius: 25, size: 20 })),
  }, ['bet1', 'bet2', 'bet3'], { bet1: 'Bet 1', bet2: 'Bet 2', bet3: 'Bet $' }, { bet1: 'base', bet2: 'base', bet3: 'base' });
}

let root = null, ctx = null, bets = null, layer = null, visit = 0;
let phase = 'bet';   // bet | dealing | first | second | reveal
let hand = null;

const alive = (v) => v === visit && ctx?.live;

function draw() {
  const g = root?.querySelector('.pk-dyn');
  if (!g) return;
  let out = '';
  const base = phase === 'bet' ? bets?.amount('base') ?? 0 : hand?.base ?? 0;
  CIRCLES.forEach((c, i) => {
    const up = phase === 'bet' || !hand || hand.riding[i];
    if (base && up) out += chipSVG(...seatPoint(c.r), 20, base);
  });
  const r = hand?.result;
  if (r) {
    out += text(333, 448, r.hand, { size: 18, weight: 700, cls: 'cz-tx pk-hand' });
    out += betLines(r.lines, 590, 350);
    if (r.pulled) out += text(590, 350 + r.lines.length * 26, `${money(r.pulled)} pulled back`, { size: 16, anchor: 'start', weight: 600, cls: 'cz-tx pk-line push' });
  }
  g.innerHTML = out;
}

function setActions() {
  const deciding = phase === 'first' || phase === 'second';
  ctx.setActions({
    ride: { hidden: !deciding },
    pull: { hidden: !deciding, label: `Pull back bet ${phase === 'second' ? 2 : 1}` },
    hint: { hidden: !deciding || !ctx.opts.hint },
  });
}

function onChange(a) {
  draw();
  const base = a.base ?? 0;
  if (phase === 'bet' && base) ctx.message(`Three bets of ${money(base)}: ${money(3 * base)} on the felt.`);
}

function action() {
  if (phase !== 'bet') return;
  bets.commit((amounts, release) => {
    const base = amounts.base; // the staged chips are one bet; commit took all three (spec.cost)
    ctx.setReturnable(2 * base); // bets 1 and 2 may still come down
    hand = E.deal(base, ctx.rng);
    phase = 'dealing';
    bets.sync();
    release();
    dealCards(visit);
  });
}

async function dealCards(v) {
  ctx.banner(null);
  await layer.gather();
  if (!alive(v)) return;
  draw();
  ctx.play('deal');
  for (let i = 0; i < 3; i++) {
    await layer.deal(`p${i}`, hand.player[i], { x: PLAYER.xs[i], y: PLAYER.y, w: PLAYER.w });
    if (!alive(v)) return;
  }
  for (let i = 0; i < 2; i++) {
    await layer.deal(`c${i}`, null, { x: COMMUNITY.xs[i], y: COMMUNITY.y, w: COMMUNITY.w });
    if (!alive(v)) return;
  }
  phase = 'first';
  setActions();
  ctx.message(`Let all three bets ride, or pull back bet 1 (${money(hand.base)})?`);
}

function decide(choice) {
  if (phase !== 'first' && phase !== 'second') return;
  const v = visit;
  const i = phase === 'first' ? 0 : 1;
  hand = E.decide(hand, choice);
  if (choice === 'pull') { ctx.refund(hand.base); ctx.play('chips'); }
  if (i === 0) {
    ctx.setReturnable(hand.riding[1] ? hand.base : 0);
    phase = 'reveal';
    setActions();
    bets.sync();
    draw();
    turnFirst(v);
    return;
  }
  // the hand is decided: settle now, then turn the last card
  const release = ctx.holdBank();
  ctx.settle({ returned: hand.result.returned });
  phase = 'reveal';
  setActions();
  bets.sync();
  draw();
  reveal(v, release);
}

async function turnFirst(v) {
  ctx.play('flip');
  await layer.flip('c0', hand.community[0]);
  if (!alive(v)) return;
  phase = 'second';
  setActions();
  ctx.message(`${hand.riding[0] ? 'Bet 1 rides.' : 'Bet 1 is back in your bank.'} Let bet 2 ride, or pull it back?`);
}

async function reveal(v, release) {
  ctx.play('flip');
  await layer.flip('c1', hand.community[1]);
  if (!alive(v)) return;
  await pause(ctx, 250);
  if (!alive(v)) return;
  const r = hand.result;
  release();
  if (r.mult) for (const id of ['p0', 'p1', 'p2', 'c0', 'c1']) layer.mark(id, 'win');
  const shown = hand;
  phase = 'bet';
  bets.release();
  hand = shown; // keep the finished hand on the felt until the next deal
  draw();
  const riding = r.lines.length;
  const title = r.mult ? `${r.hand} · You win ${money(r.net)}` : `${r.hand} doesn't pay`;
  showResult(ctx, r, title, r.mult ? `${E.PAY_TABLE.find((x) => x[0] === r.key)[2]} to 1 on ${riding === 1 ? 'one bet' : `${riding} bets`}`
    : `It takes a pair of tens or better · the house takes ${money(r.wagered - r.returned)}`);
  setActions();
  ctx.checkBroke();
}

function hint() {
  if (phase !== 'first' && phase !== 'second') return;
  const known = phase === 'first' ? hand.player : [...hand.player, hand.community[0]];
  ctx.message(`Hint: ${E.advise(known).text}`);
}

export default {
  id: 'let-it-ride',
  name: 'Let It Ride',
  ready: true,
  bannerAt: 'top',      // over the crest, so the dealer's cards and yours stay in view
  layout,
  settings: E.OPTIONS,
  css: CSS,
  minBuyIn: (stakes) => E.minBuyIn(stakes),
  howto: howtoSections([
    ['The aim', 'Make a pair of tens or better with your three cards and the two community cards. There is no dealer hand to beat: the pay table is all that matters. One deck is shuffled for every hand.'],
    ['Betting', 'You make three equal bets, on the circles <b>1</b>, <b>2</b> and <b>$</b>. Put chips on any circle and the same amount goes on all three, so you need three times the bet in the bank. Each bet must be within the table limits.'],
    ['Taking bets back', '<ul><li>After you see your three cards, pull back bet 1 or let it ride.</li><li>The first community card turns over. Pull back bet 2 or let it ride (whatever you did with bet 1).</li><li>The second card turns and every bet still up is paid. The $ bet always stays.</li></ul>A bet you pull back returns to your bank at once.'],
    ['Pays', 'On each bet still riding: royal flush 1000 to 1, straight flush 200 to 1, four of a kind 50 to 1, full house 11 to 1, flush 8 to 1, straight 5 to 1, three of a kind 3 to 1, two pair 2 to 1, a pair of tens or better 1 to 1. Anything less loses.'],
    ['Strategy', '<ul><li>Three cards: let it ride with a paying pair or three of a kind, three to a royal flush, or three suited cards close together for a straight flush (not A-2-3 or 2-3-4); otherwise pull it back.</li><li>Four cards: let it ride with a paying hand, four to a flush, four to an open-ended straight, or four to an inside straight made of high cards; otherwise pull it back.</li></ul>Turn on the Hint button in Options to be told for each hand.'],
    ['Keys', 'Number keys 1 to 8 pick a chip, Enter deals, L lets it ride, P pulls the bet back, H shows the hint (when it is on), C clears, R rebets (Shift+R doubled) and Backspace undoes.'],
  ]),

  mount(el, c) {
    root = el; ctx = c; visit++;
    phase = 'bet'; hand = null;
    el.innerHTML = `<div class="cz-stage pk-table">${layout()}</div>`;
    const stage = el.querySelector('.cz-stage');
    layer = ctx.cards(stage, stage.querySelector('svg'), { from: { x: 875, y: 80 }, label: 'Cards on the Let It Ride table' });
    ctx.actions([
      { id: 'ride', label: 'Let it ride', key: 'l', primary: true, hidden: true, run: () => decide('ride') },
      { id: 'pull', label: 'Pull back bet 1', key: 'p', hidden: true, run: () => decide('pull') },
      { id: 'hint', label: 'Hint', key: 'h', small: true, hidden: true, run: hint },
    ]);
    bets = ctx.bets({
      root: el,
      spot: (key) => (phase === 'bet' && key === 'base' ? { label: 'Each bet' } : null),
      cost: (a) => 3 * (a.base ?? 0), // one stack of chips is all three bets
      onChange,
    });
    draw();
    ctx.message(`Place chips on 1, 2 or $ (the same goes on all three): ${ctx.stakesText}. Then Deal.`);
  },
  unmount() {
    visit++;
    if (root) root.innerHTML = '';
    root = null; bets = null; layer = null; hand = null;
  },
  optionsChanged() { if (root) setActions(); },
  action,
};
