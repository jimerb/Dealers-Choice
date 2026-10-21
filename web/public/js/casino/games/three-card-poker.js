// Three Card Poker: playable. One seat at the half-moon table: Pair Plus, Ante and Play spots, the
// player's three cards beside them and the dealer's three along the top. Bet the Ante and/or Pair
// Plus, Deal, then Play (a bet equal to the Ante) or Fold. Rules in ../engines/three-card-poker.js.
//
// This file also holds the small single-seat helpers Let It Ride and Caribbean Stud share
// (seatTable, seatPoint, betLines, pause, showResult).
import { pokerTable } from '../pokertable.js';
import { text, esc } from '../svg.js';
import { chipSVG } from '../chips.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';
import { evaluate3, describe3 } from '../kit/poker.js';
import * as E from '../engines/three-card-poker.js';

// ------------------------------------------------------------------ shared single-seat helpers
/** The seat the player sits at: the middle of the five on the shared table, straight below the dealer. */
const SEAT = 2;
const TABLE_CY = 30; // the shared table's straight edge (the arc's centre)

/** A point on the player's seat line, r units from the dealer's edge. */
export const seatPoint = (r) => [500, TABLE_CY + r];

/**
 * The shared poker table with one seat: the other four seats' spots are left off, the player's spots
 * named by their plain key (`bettable` ones take chips: data-spot, a button for keyboards; `rename`
 * gives several spots one staging key), and an
 * empty <g class="pk-dyn"> on top for chips, hand names and results.
 */
export function seatTable(cfg, bettable = [], labels = {}, rename = {}) {
  return pokerTable({
    ...cfg,
    seat: SEAT,
    extras: (cx, cy, a, i) => (i === SEAT ? '<g class="pk-dyn"></g>' : ''),
    spotWrap: ({ key }, i, inner) => (bettable.includes(key)
      ? `<g class="pk-spot" data-spot="${rename[key] ?? key}" data-pk="${key}" role="button" tabindex="0" aria-label="${esc(labels[key] ?? key)}">${inner}</g>`
      : `<g class="pk-spot fixed" data-pk="${key}">${inner}</g>`),
  });
}

/** The result of each bet as live text, one line each, from (x, y) down. lines: [{ bet, stake, back }] */
export function betLines(lines, x, y) {
  return lines.map((l, i) => {
    const net = l.back - l.stake;
    const what = net > 0 ? `wins ${money(net)}` : net < 0 ? `loses ${money(-net)}` : l.stake ? 'pushes' : '';
    return text(x, y + i * 26, `${l.bet} ${what}`, { size: 18, anchor: 'start', weight: 700, cls: `cz-tx pk-line ${net > 0 ? 'win' : net < 0 ? 'lose' : 'push'}` });
  }).join('');
}

/** A promise that resolves after `ms` (at once under reduced motion); never resolves once the game closes. */
export const pause = (ctx, ms) => new Promise((r) => ctx.after(ctx.reduced() ? 0 : ms, r));

/** The banner, message and sound for a settled hand. */
export function showResult(ctx, r, title, detail = '') {
  const tail = r.returned ? `${money(r.returned)} back from ${money(r.wagered)} bet` : `${money(r.wagered)} bet lost`;
  const tone = r.net > 0 ? 'win' : r.net < 0 ? 'lose' : 'push';
  ctx.banner(title, { tone, detail: detail || tail });
  ctx.message(`${title}. ${detail ? `${detail}. ` : ''}${tail}.`);
  ctx.play(r.net > 0 ? 'win' : r.net < 0 ? 'lose' : 'chips');
}

/** The style sheet the three single-seat tables share. */
export const CSS = 'css/casino/three-card-poker.css';

// ------------------------------------------------------------------ Three Card Poker
const SPOTS = { pairplus: { r: 340, label: 'Pair Plus' }, ante: { r: 400, label: 'Ante' }, play: { r: 455, label: 'Play' } };
const PLAYER = { xs: [262, 333, 404], y: 382, w: 68 };
const DEALER = { xs: [446, 500, 554], y: 90, w: 44 };

const ppLines = (key) => {
  const p = E.PAIR_PLUS[key]?.pays ?? E.PAIR_PLUS[E.DEFAULT_PAIR_PLUS].pays;
  return [`Straight flush ${p[5]} to 1 · Three of a kind ${p[4]} to 1 · Straight ${p[3]} to 1`, `Flush ${p[2]} to 1 · Pair ${p[1]} to 1`];
};

export function layout(opts = {}) {
  return seatTable({
    name: 'Three Card Poker',
    label: 'Three Card Poker table: the dealer\'s three cards on top; your Pair Plus, Ante and Play spots',
    dealerCards: 3,
    dealerNote: 'Dealer plays with queen high or better',
    payLines: ['Ante bonus', 'Straight flush 5 to 1 · Three of a kind 4 to 1 · Straight 1 to 1', 'Pair Plus', ...ppLines(opts.pairPlus)],
    spots: [
      { r: SPOTS.pairplus.r, label: 'PAIR PLUS', shape: 'diamond', key: 'pairplus', size: 9 },
      { r: SPOTS.ante.r, label: 'ANTE', shape: 'circle', key: 'ante', size: 12 },
      { r: SPOTS.play.r, label: 'PLAY', shape: 'box', key: 'play', size: 13 },
    ],
  }, ['pairplus', 'ante'], { pairplus: 'Pair Plus bet', ante: 'Ante bet' });
}

let root = null, ctx = null, bets = null, layer = null, visit = 0;
let phase = 'bet';   // bet | dealing | decide | reveal
let hand = null;     // the engine state of the hand on the table
let committed = null;

const alive = (v) => v === visit && ctx?.live;

function draw() {
  const g = root?.querySelector('.pk-dyn');
  if (!g) return;
  const a = phase === 'bet' ? { ante: bets?.amount('ante') ?? 0, pairplus: bets?.amount('pairplus') ?? 0 } : committed ?? {};
  let out = '';
  for (const [k, s] of Object.entries(SPOTS)) if (a[k]) out += chipSVG(...seatPoint(s.r), 21, a[k]);
  const r = hand?.result;
  if (hand) out += text(333, 448, describe3(evaluate3(hand.player)), { size: 18, weight: 700, cls: 'cz-tx pk-hand' });
  // the dealer's hand goes under the dealer's cards, in place of the house rule written there
  const dealt = Boolean(r && r.outcome !== 'none');
  root.querySelector('.cz-stage > svg')?.classList.toggle('pk-dealt', dealt);
  if (dealt) out += text(500, 142, `${r.dealerHand}${r.qualifies ? '' : ' · doesn\'t qualify'}`, { size: 18, weight: 700, cls: 'cz-tx pk-hand' });
  if (r) out += betLines(r.lines, 590, 350);
  g.innerHTML = out;
}

function setActions() {
  const deciding = phase === 'decide';
  ctx.setActions({
    play: { hidden: !deciding },
    fold: { hidden: !deciding },
    hint: { hidden: !deciding || !ctx.opts.hint },
  });
}

function action() {
  if (phase !== 'bet') return;
  bets.commit((amounts, release) => {
    const v = visit;
    const bet = { ante: amounts.ante ?? 0, pairPlus: amounts.pairplus ?? 0 };
    committed = { ante: bet.ante, pairplus: bet.pairPlus };
    hand = E.deal(bet, ctx.rng, { opts: ctx.opts });
    phase = 'dealing';
    // Pair Plus alone is settled at once: the deal is the whole round
    if (hand.result) ctx.settle({ returned: hand.result.returned });
    dealCards(v, release);
  }, { hold: true });
}

async function dealCards(v, release) {
  ctx.banner(null);
  await layer.gather();
  if (!alive(v)) return;
  draw();
  ctx.play('deal');
  for (let i = 0; i < 3; i++) {
    await layer.deal(`p${i}`, hand.player[i], { x: PLAYER.xs[i], y: PLAYER.y, w: PLAYER.w });
    if (!alive(v)) return;
    await layer.deal(`d${i}`, null, { x: DEALER.xs[i], y: DEALER.y, w: DEALER.w });
    if (!alive(v)) return;
  }
  if (hand.result) { await reveal(v, release); return; }
  release();
  phase = 'decide';
  draw();
  setActions();
  ctx.message(`You hold ${describe3(evaluate3(hand.player)).toLowerCase()}. Play (another ${money(hand.ante)}) or fold?`);
}

function decide(choice) {
  if (phase !== 'decide') return;
  const v = visit;
  if (choice === 'play') {
    if (!ctx.wager(hand.ante)) { ctx.play('error'); ctx.message(`The bank can't cover the ${money(hand.ante)} Play bet. Fold, or leave the table.`); return; }
    committed = { ...committed, play: hand.ante };
    bets.sync();
  }
  hand = E.resolve(hand, choice, ctx.opts);
  const release = ctx.holdBank();
  ctx.settle({ returned: hand.result.returned });
  phase = 'reveal';
  setActions();
  ctx.play(choice === 'play' ? 'chips' : 'click');
  reveal(v, release);
}

async function reveal(v, release) {
  for (let i = 0; i < 3; i++) {
    ctx.play('flip');
    await layer.flip(`d${i}`, hand.dealer[i]);
    if (!alive(v)) return;
  }
  await pause(ctx, 250);
  if (!alive(v)) return;
  const r = hand.result;
  release();
  const win = r.lines.filter((l) => l.back > l.stake);
  for (let i = 0; i < 3; i++) layer.mark(`p${i}`, 'win', win.length > 0 && r.net > 0);
  draw();
  // the headline follows the money: a hand the dealer won can still leave you up on Pair Plus
  const handWord = { lose: 'Dealer wins the hand', push: 'The hand pushes', fold: 'You folded' }[r.outcome];
  const titles = {
    win: `You win ${money(r.net)}`, lose: 'Dealer wins', push: 'Push', fold: 'Folded',
    noqualify: 'Dealer doesn\'t qualify', none: r.net > 0 ? `Pair Plus wins ${money(r.net)}` : 'Pair Plus loses',
  };
  let title = titles[r.outcome];
  let detail = r.outcome === 'noqualify' ? `Ante pays 1 to 1, Play pushes${r.net > 0 ? `: you win ${money(r.net)}` : ''}` : '';
  if (handWord && r.net > 0) { title = `You win ${money(r.net)}`; detail = `${handWord}, Pair Plus pays`; }
  else if (r.outcome === 'win' && r.net < 0) { title = 'You win the hand'; detail = `Pair Plus loses: down ${money(-r.net)} in all`; }
  showResult(ctx, r, title, detail);
  committed = null;
  phase = 'bet';
  bets.release();
  setActions();
  ctx.checkBroke();
}

function hint() {
  if (phase !== 'decide') return;
  ctx.message(`Hint: ${E.advise(hand.player).text}`);
}

export default {
  id: 'three-card-poker',
  name: 'Three Card Poker',
  ready: true,
  bannerAt: 'top',      // over the crest, so the dealer's cards and yours stay in view
  layout,
  settings: E.OPTIONS,
  css: CSS,
  minBuyIn: (stakes) => E.minBuyIn(stakes),
  howto: howtoSections([
    ['The aim', 'Beat the dealer\'s three-card hand, or make a pair or better for the Pair Plus side bet. You play alone against the dealer with one deck, shuffled for every hand.'],
    ['Betting', 'Put chips on <b>Ante</b>, on <b>Pair Plus</b>, or on both, then Deal. Each bet must be between the table minimum and maximum. Keep enough in the bank to match your Ante: the Play bet is the same size.'],
    ['Play or fold', 'You see your three cards; the dealer\'s stay face down. <b>Play</b> puts a bet equal to the Ante on Play. <b>Fold</b> gives up the Ante and the Pair Plus. With only a Pair Plus bet there is nothing to decide: the hand is paid as soon as it is dealt.'],
    ['Hand ranks', 'From the top: straight flush, three of a kind, straight, flush, pair, high card. With three cards a straight beats a flush. An ace is high (A-K-Q) or low (3-2-A).'],
    ['The dealer qualifies', '<ul><li>The dealer needs queen high or better. If not, the Ante pays 1 to 1 and the Play bet comes back.</li><li>If the dealer qualifies and you win, Ante and Play each pay 1 to 1. If the dealer wins you lose both; a tie returns both.</li></ul>'],
    ['Ante bonus', 'When you play, your Ante also earns a bonus for a strong hand, even if the dealer beats you: straight flush 5 to 1, three of a kind 4 to 1, straight 1 to 1.'],
    ['Pair Plus', 'Paid on your own hand whatever the dealer holds (lost if you fold): straight flush 40 to 1, three of a kind 30 to 1, straight 6 to 1, flush 4 to 1 (3 to 1 with the other table in Options), pair 1 to 1.'],
    ['Strategy', 'Play any hand of queen, six, four or better; fold anything lower. The Hint button tells you which side of that line your hand is on.'],
    ['Keys', 'Number keys 1 to 8 pick a chip, Enter deals, P plays, F folds, H shows the hint, C clears, R rebets (Shift+R doubled) and Backspace undoes.'],
  ]),

  mount(el, c) {
    root = el; ctx = c; visit++;
    phase = 'bet'; hand = null; committed = null;
    el.innerHTML = `<div class="cz-stage pk-table">${layout(ctx.opts)}</div>`;
    const stage = el.querySelector('.cz-stage');
    layer = ctx.cards(stage, stage.querySelector('svg'), { from: { x: 875, y: 80 }, label: 'Cards on the Three Card Poker table' });
    ctx.actions([
      { id: 'play', label: 'Play', key: 'p', primary: true, hidden: true, run: () => decide('play') },
      { id: 'fold', label: 'Fold', key: 'f', hidden: true, run: () => decide('fold') },
      { id: 'hint', label: 'Hint', key: 'h', small: true, hidden: true, run: hint },
    ]);
    bets = ctx.bets({
      root: el,
      spot: (key) => (phase === 'bet' && (key === 'ante' || key === 'pairplus') ? { label: SPOTS[key].label } : null),
      validate: (a) => {
        const ante = a.ante ?? 0, pp = a.pairplus ?? 0;
        if (ante && 2 * ante + pp > ctx.bank.balance) return `Keep ${money(ante)} in the bank for the Play bet: lower the Ante or the Pair Plus.`;
        return null;
      },
      onChange: draw,
    });
    draw();
    ctx.message(`Bet the Ante, Pair Plus or both: ${ctx.stakesText}. Then Deal.`);
  },
  unmount() {
    visit++;
    if (root) root.innerHTML = '';
    root = null; bets = null; layer = null; hand = null; committed = null;
  },
  optionsChanged(opts) {
    if (!root) return;
    // the pay table on the felt follows the option (between hands; the last hand's cards go)
    if (phase === 'bet') {
      layer.destroy();
      const stage = root.querySelector('.cz-stage');
      stage.innerHTML = layout(opts);
      layer = ctx.cards(stage, stage.querySelector('svg'), { from: { x: 875, y: 80 }, label: 'Cards on the Three Card Poker table' });
      hand = null;
      draw();
    }
    setActions();
  },
  action,
};
