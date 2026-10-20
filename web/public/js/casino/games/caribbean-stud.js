// Caribbean Stud: playable. One seat at the half-moon table: the Bet and Ante boxes, a ring for the
// $1 bonus bet, the player's five cards beside them and the dealer's five along the top (the last
// one face up). Ante (and the bonus if you like), Deal, then Raise (a Bet of twice the Ante) or
// Fold. Rules in ../engines/caribbean-stud.js.
import { text, circle } from '../svg.js';
import { chipSVG } from '../chips.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';
import { evaluate, describe } from '../kit/poker.js';
import * as E from '../engines/caribbean-stud.js';
import { seatTable, seatPoint, betLines, pause, showResult, CSS } from './three-card-poker.js';

const SPOTS = { bet: { r: 360, label: 'Bet' }, ante: { r: 440, label: 'Ante' } };
const BONUS_R = 282;
const PLAYER = { xs: [250, 296, 342, 388, 434], y: 385, w: 56 };
const DEALER = { xs: [392, 446, 500, 554, 608], y: 90, w: 44 };

const bonusLine = 'Bonus $1: Royal flush $200,000 · Straight flush $20,000 · Four of a kind $500 · Full house $100 · Flush $50';

export function layout(opts = {}) {
  const withBonus = opts.bonus ?? true;
  const s = seatTable({
    name: 'Caribbean Stud',
    label: 'Caribbean Stud table: the dealer\'s five cards on top; your Ante and Bet boxes and the bonus ring',
    dealerCards: 5,
    dealerNote: 'Dealer qualifies with ace-king or better',
    payLines: ['Bet pays', 'Royal flush 100 to 1 · Straight flush 50 to 1 · Four of a kind 20 to 1',
      'Full house 7 to 1 · Flush 5 to 1 · Straight 4 to 1', 'Three of a kind 3 to 1 · Two pair 2 to 1 · Pair or less 1 to 1',
      ...(withBonus ? [bonusLine] : [])],
    spots: [
      { r: SPOTS.bet.r, label: 'BET', shape: 'box', key: 'bet', size: 15 },
      { r: SPOTS.ante.r, label: 'ANTE', shape: 'box', key: 'ante', size: 15 },
    ],
  }, ['ante'], { ante: 'Ante bet' });
  if (!withBonus) return s;
  const [x, y] = seatPoint(BONUS_R);
  const ring = `<g class="pk-bonus" data-bonus role="button" tabindex="0" aria-pressed="false" aria-label="$1 bonus bet">
    ${circle(x, y, 22, { cls: 'pk-bonus-ring' })}${text(x, y, '$1', { size: 14, weight: 800 })}</g>`;
  return s.replace('<g class="pk-dyn">', `${ring}<g class="pk-dyn">`);
}

let root = null, ctx = null, bets = null, layer = null, visit = 0;
let phase = 'bet';   // bet | dealing | decide | reveal
let hand = null, committed = null;
let bonusOn = false; // the player's choice, kept between hands

const alive = (v) => v === visit && ctx?.live;
const bonusOffered = () => Boolean(ctx?.opts.bonus);

function draw() {
  const g = root?.querySelector('.pk-dyn');
  if (!g) return;
  const a = phase === 'bet' ? { ante: bets?.amount('ante') ?? 0 } : committed ?? {};
  let out = '';
  for (const [k, s] of Object.entries(SPOTS)) if (a[k]) out += chipSVG(...seatPoint(s.r), 21, a[k]);
  const bonus = phase === 'bet' ? bonusOn && bonusOffered() : Boolean(committed?.bonus);
  const ring = root.querySelector('.pk-bonus');
  if (ring) { ring.classList.toggle('on', bonus); ring.setAttribute('aria-pressed', String(bonus)); }
  if (bonus) out += chipSVG(...seatPoint(BONUS_R), 15, 1);
  const r = hand?.result;
  if (hand) out += text(342, 442, describe(evaluate(hand.player)), { size: 17, weight: 700, cls: 'cz-tx pk-hand' });
  if (r) {
    out += text(648, 90, `${r.dealerHand}${r.qualifies ? '' : ' · doesn\'t qualify'}`, { size: 16, anchor: 'start', weight: 700, cls: 'cz-tx pk-hand' });
    out += betLines(r.lines, 590, 350);
  }
  g.innerHTML = out;
}

function setActions() {
  const deciding = phase === 'decide';
  ctx.setActions({
    raise: { hidden: !deciding, label: hand && deciding ? `Raise ${money(2 * hand.ante)}` : 'Raise' },
    fold: { hidden: !deciding },
    hint: { hidden: !deciding || !ctx.opts.hint },
    bonus: { hidden: phase !== 'bet' || !bonusOffered(), pressed: bonusOn },
  });
}

function onChange() { draw(); }
/** The $1 bonus rides with the Ante when it is on: not a staged chip, but part of what Deal takes. */
const bonusFor = (a) => (a.ante && bonusOn && bonusOffered() ? E.BONUS_BET : 0);

function toggleBonus() {
  if (phase !== 'bet' || !bonusOffered()) return;
  bonusOn = !bonusOn;
  ctx.play('chips');
  ctx.banner(null);
  ctx.message(bonusOn ? 'The $1 bonus bet is on for the next hand.' : 'No bonus bet.');
  setActions();
  bets.sync();
}

function action() {
  if (phase !== 'bet') return;
  bets.commit((amounts) => {
    const ante = amounts.ante;
    const bonus = bonusFor(amounts); // taken with the Ante (spec.cost)
    committed = { ante, bonus };
    hand = E.deal({ ante, bonus }, ctx.rng);
    phase = 'dealing';
    bets.sync();
    dealCards(visit);
  });
}

async function dealCards(v) {
  ctx.banner(null);
  setActions();
  await layer.gather();
  if (!alive(v)) return;
  draw();
  ctx.play('deal');
  for (let i = 0; i < 5; i++) {
    await layer.deal(`p${i}`, hand.player[i], { x: PLAYER.xs[i], y: PLAYER.y, w: PLAYER.w });
    if (!alive(v)) return;
    await layer.deal(`d${i}`, i === 4 ? hand.dealer[4] : null, { x: DEALER.xs[i], y: DEALER.y, w: DEALER.w });
    if (!alive(v)) return;
  }
  phase = 'decide';
  draw();
  setActions();
  ctx.message(`The dealer shows ${cardWord(hand.dealer[4])}. Raise (a Bet of ${money(2 * hand.ante)}) or fold?`);
}

const RANK = { A: 'an ace', K: 'a king', Q: 'a queen', J: 'a jack', 8: 'an eight' };
const cardWord = (c) => RANK[c.rank] ?? `a ${c.rank}`;

function decide(choice) {
  if (phase !== 'decide') return;
  const v = visit;
  if (choice === 'raise') {
    if (!ctx.wager(2 * hand.ante)) { ctx.play('error'); ctx.message(`The bank can't cover the ${money(2 * hand.ante)} Bet. Fold, or leave the table.`); return; }
    committed = { ...committed, bet: 2 * hand.ante };
    bets.sync();
  }
  hand = E.resolve(hand, choice);
  const release = ctx.holdBank();
  ctx.settle({ returned: hand.result.returned });
  phase = 'reveal';
  setActions();
  ctx.play(choice === 'raise' ? 'chips' : 'click');
  draw();
  reveal(v, release);
}

async function reveal(v, release) {
  for (let i = 0; i < 4; i++) {
    ctx.play('flip');
    await layer.flip(`d${i}`, hand.dealer[i]);
    if (!alive(v)) return;
  }
  await pause(ctx, 250);
  if (!alive(v)) return;
  const r = hand.result;
  release();
  if (r.net > 0) for (let i = 0; i < 5; i++) layer.mark(`p${i}`, 'win');
  committed = null;
  phase = 'bet';
  bets.release();
  draw();
  const bonusWin = r.lines.find((l) => l.bet === 'Bonus' && l.back);
  const titles = { win: `You win ${money(r.net)}`, lose: 'Dealer wins', push: 'Push', fold: 'Folded', noqualify: 'Dealer doesn\'t qualify' };
  const detail = [
    r.outcome === 'noqualify' ? `Ante pays 1 to 1, the Bet comes back${r.net > 0 ? `: you win ${money(r.net)}` : ''}` : '',
    r.outcome === 'win' ? `${r.playerHand} beats ${r.dealerHand.toLowerCase()}` : r.outcome === 'lose' ? `${r.dealerHand} beats ${r.playerHand.toLowerCase()}` : '',
    bonusWin ? `Bonus pays ${money(bonusWin.back - 1)}` : '',
  ].filter(Boolean).join(' · ');
  // the bonus can leave you up on a hand the dealer won: the headline follows the money
  const title = r.net > 0 && (r.outcome === 'lose' || r.outcome === 'fold') ? `You win ${money(r.net)}` : titles[r.outcome];
  showResult(ctx, r, title, title === titles[r.outcome] ? detail : [r.outcome === 'fold' ? 'You folded' : 'Dealer wins the hand', detail].join(' · '));
  setActions();
  ctx.checkBroke();
}

function hint() {
  if (phase !== 'decide') return;
  ctx.message(`Hint: ${E.advise(hand.player, E.upCard(hand)).text}`);
}

/** Redraw the felt (the bonus option adds or removes the ring and its pay line); between hands only. */
function rebuild() {
  if (layer) layer.destroy();
  const stage = root.querySelector('.cz-stage');
  stage.innerHTML = layout(ctx.opts);
  layer = ctx.cards(stage, stage.querySelector('svg'), { from: { x: 875, y: 80 }, label: 'Cards on the Caribbean Stud table' });
  draw();
}

function onClick(e) {
  if (e.target.closest?.('[data-bonus]')) toggleBonus();
}
function onKey(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-bonus]')) { e.preventDefault(); toggleBonus(); }
}

export default {
  id: 'caribbean-stud',
  name: 'Caribbean Stud',
  ready: true,
  bannerAt: 'top',      // over the crest, so the dealer's cards and yours stay in view
  layout,
  settings: E.OPTIONS,
  css: CSS,
  minBuyIn: (stakes) => E.minBuyIn(stakes),
  howto: howtoSections([
    ['The aim', 'Beat the dealer\'s five-card poker hand. You play alone against the dealer with one deck, shuffled for every hand.'],
    ['Betting', 'Put chips on <b>Ante</b> (within the table limits), then Deal. Keep twice the Ante in the bank for the Bet. Click the small <b>$1</b> ring (or press B) to add the bonus bet; it stays on until you turn it off.'],
    ['Raise or fold', 'You get five cards and see the dealer\'s last card. <b>Raise</b> puts a Bet of twice the Ante in the Bet box. <b>Fold</b> gives up the Ante (and the bonus bet). Then the dealer\'s cards are shown.'],
    ['The dealer qualifies', '<ul><li>The dealer needs ace-king or better. If not, the Ante pays 1 to 1 and the Bet comes back, however good your hand.</li><li>If the dealer qualifies and you win, the Ante pays 1 to 1 and the Bet pays by the table. If the dealer wins you lose both; a tie returns both.</li></ul>'],
    ['Bet pays', 'Royal flush 100 to 1, straight flush 50 to 1, four of a kind 20 to 1, full house 7 to 1, flush 5 to 1, straight 4 to 1, three of a kind 3 to 1, two pair 2 to 1, a pair or less 1 to 1. Hands rank as in poker; an ace is high, or low in 5-4-3-2-A.'],
    ['Bonus bet', 'One dollar, paid on your own hand whatever the dealer holds: royal flush $200,000, straight flush $20,000, four of a kind $500, full house $100, flush $50 (your dollar comes back too). It is lost if you fold. Options can take the bonus ring off the table.'],
    ['Strategy', 'Raise with any pair or better; fold with less than ace-king. With exactly ace-king, raise when one of your cards matches the dealer\'s card (2 to queen), when the dealer shows an ace or king and you hold a queen or jack, or when you hold a queen and the dealer\'s card is lower than your fourth-best card. Turn on the Hint button in Options to be told for each hand.'],
    ['Keys', 'Number keys 1 to 8 pick a chip, Enter deals, R raises (during a hand), F folds, B turns the bonus bet on or off, H shows the hint (when it is on), C clears, R rebets between hands (Shift+R doubled) and Backspace undoes.'],
  ]),

  mount(el, c) {
    root = el; ctx = c; visit++;
    phase = 'bet'; hand = null; committed = null;
    el.innerHTML = '<div class="cz-stage pk-table"></div>';
    rebuild();
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    ctx.actions([
      { id: 'raise', label: 'Raise', key: 'r', primary: true, hidden: true, run: () => decide('raise') },
      { id: 'fold', label: 'Fold', key: 'f', hidden: true, run: () => decide('fold') },
      { id: 'hint', label: 'Hint', key: 'h', small: true, hidden: true, run: hint },
      { id: 'bonus', label: '$1 bonus', key: 'b', small: true, hidden: true, pressed: bonusOn, run: toggleBonus },
    ]);
    bets = ctx.bets({
      root: el,
      spot: (key) => (phase === 'bet' && key === 'ante' ? { label: 'Ante' } : null),
      cost: (a) => (a.ante ?? 0) + bonusFor(a),
      validate: (a) => {
        const ante = a.ante ?? 0;
        const need = 3 * ante + (bonusOn && bonusOffered() ? 1 : 0);
        return ante && need > ctx.bank.balance ? `Keep ${money(2 * ante)} in the bank for the Bet: lower the Ante.` : null;
      },
      onChange,
    });
    setActions();
    draw();
    ctx.message(`Bet the Ante: ${ctx.stakesText}. Then Deal.`);
  },
  unmount() {
    visit++;
    root?.removeEventListener('click', onClick);
    root?.removeEventListener('keydown', onKey);
    if (root) root.innerHTML = '';
    root = null; bets = null; layer = null; hand = null; committed = null;
  },
  optionsChanged() {
    if (!root) return;
    if (phase === 'bet') { hand = null; rebuild(); }
    setActions();
  },
  action,
};
