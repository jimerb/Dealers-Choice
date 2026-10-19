// Pai Gow Poker: bet, take seven cards, split them into a five-card high hand and a two-card low
// hand, and beat both of the dealer's. Tap a card to move it between the high row and the low box;
// "House way" sets the hand for you. The dealer (the house banks every hand) sets by the house way.
// Rules live in ../engines/pai-gow-poker.js (no DOM); this is the table.
import * as engine from '../engines/pai-gow-poker.js';
import { svg, path, rect, circle, text, tableRail } from '../svg.js';
import { railBand, tableCrest, crest, shoe, discardTray, CREST_TOP } from '../tableart.js';
import { chipSVG } from '../chips.js';
import { money } from '../../core/bank.js';

const TALL = '(max-width: 640px)';

// ------------------------------------------------------------------ geometry
const WIDE = {
  w: 1000, h: 560, top: CREST_TOP, shoe: { x: 875, y: 80 }, tray: { x: 115, y: 80 }, card: 62,
  dealer: { y: 100, row: (i) => 308 + i * 64, high: (i) => 290 + i * 64, low: (j) => 680 + j * 64, label: { x: 500, y: 165 } },
  low: { y: 255, x: (j) => 466 + j * 68, box: [422, 200, 156, 110], label: [500, 320] },
  high: { y: 380, x: (i, n) => 500 + (i - (n - 1) / 2) * (n > 5 ? 70 : 76), box: [240, 328, 520, 104], label: [500, 450] },
  bet: { x: 245, y: 255, r: 44 },
  pays: { x: 790, y: 232 },
};
const TALLG = {
  w: 600, h: 620, top: 100, shoe: { x: 520, y: 75 }, tray: { x: 80, y: 75 }, card: 64,
  dealer: { y: 185, row: (i) => 300 + (i - 3) * 72, high: (i) => 76 + i * 68, low: (j) => 460 + j * 68, label: { x: 300, y: 245 } },
  low: { y: 365, x: (j) => 266 + j * 68, box: [222, 313, 156, 104], label: [480, 365] },
  high: { y: 500, x: (i, n) => 300 + (i - (n - 1) / 2) * (n > 5 ? 76 : 82), box: [30, 446, 540, 108], label: [300, 576] },
  bet: { x: 100, y: 360, r: 42 },
  pays: { x: 300, y: 274 },
};
const geo = (tall) => (tall ? TALLG : WIDE);

function outline(tall) {
  if (!tall) return tableRail(1000, 560, 30);
  const { w, h } = TALLG;
  const edge = `M${w - 10} 30 V${h - 60} Q${w - 10} ${h - 10} ${w - 60} ${h - 10} H60 Q10 ${h - 10} 10 ${h - 60} V30`;
  return { d: `${edge} Z`, edge };
}

const PAYS = ['Win both hands: paid 1 to 1, less 5%', 'Win one: push · Lose both: the bet is lost', 'Copies (ties) go to the dealer'];
const PAYS_SHORT = ['Win both: 1 to 1 less 5% · Win one: push · Copies: dealer'];

/** The parts that change: hand names, the chips on the bet, the result. */
export function dynSVG({ tall = false, amount = 0, labels = {}, outcome = null } = {}) {
  const g = geo(tall);
  const t = (x, y, s, o = {}) => (s ? text(x, y, s, { size: 16, weight: 700, ...o }) : '');
  const low = tall
    ? t(g.low.label[0], g.low.label[1] - 12, labels.lowTitle ?? 'LOW HAND', { size: 13, cls: 'cz-tx dim' }) + t(g.low.label[0], g.low.label[1] + 12, labels.low, { cls: `cz-tx${labels.foul ? ' pg-foul' : ''}` })
    : t(g.low.label[0], g.low.label[1], labels.low, { size: 15, cls: `cz-tx${labels.foul ? ' pg-foul' : ''}` });
  const res = outcome ? text(g.bet.x, g.bet.y + g.bet.r + 18, outcome.text, { size: 17, weight: 800, cls: `pg-res ${outcome.tone}` }) : '';
  return `${t(g.dealer.label.x, g.dealer.label.y, labels.dealer, { cls: 'cz-tx dim', size: 15 })}${low}
    ${t(g.high.label[0], g.high.label[1], labels.high)}
    ${amount ? chipSVG(g.bet.x, g.bet.y, g.bet.r * 0.62, amount) : ''}${res}`;
}

/** The whole table as SVG (the shell's tests draw it with no arguments). */
export function layout(opts = {}, view = {}) {
  const tall = Boolean(view.tall);
  const g = geo(tall);
  const { d, edge } = outline(tall);
  const box = ([x, y, w, h], label, lx, ly) => rect(x, y, w, h, { cls: 'pg-box', r: 10 }) + text(lx, ly, label, { size: 13, weight: 800, cls: 'cz-tx dim', attrs: 'letter-spacing="2"' });
  const dealerSlots = Array.from({ length: 7 }, (_, i) => rect(g.dealer.row(i) - g.card / 2, g.dealer.y - g.card * 0.7, g.card, g.card * 1.4, { cls: 'cz-slot', r: 4 })).join('');
  const pays = (tall ? PAYS_SHORT : PAYS).map((s, i) => text(g.pays.x, g.pays.y + i * 21, s, { size: i ? 13 : 14, weight: i ? 500 : 700, cls: i ? 'cz-tx dim' : 'cz-tx' })).join('');
  const dressing = tall ? crest(300, 22 - 220 / (900 / 413), 220, 'Pai Gow Poker') : tableCrest('Pai Gow Poker');
  const [lx, ly, lw] = g.low.box, [hx, hy, hw] = g.high.box;
  const body = `${railBand(edge, d, g.w, g.h)}${path(d, { cls: 'cz-rail' })}${dressing}
    ${shoe(g.shoe.x, g.shoe.y)}${discardTray(g.tray.x, g.tray.y)}${dealerSlots}
    ${tall ? '' : text(500, 140, 'Dealer sets the house way', { size: 14, cls: 'cz-tx dim' })}${pays}
    ${box(g.low.box, 'LOW', lx + lw / 2, ly - 10)}${box(g.high.box, 'HIGH', tall ? hx + hw - 34 : hx + hw / 2, hy - 10)}
    <g class="pg-spot" data-spot="bet" role="button" tabindex="0" aria-label="Your bet">${circle(g.bet.x, g.bet.y, g.bet.r, { cls: 'cz-area' })}${text(g.bet.x, g.bet.y - g.bet.r - 12, 'BET', { size: 14, weight: 800, attrs: 'letter-spacing="2"' })}</g>
    <g class="pg-dyn">${dynSVG({ ...view, tall })}</g>`;
  return svg(g.w, g.h, body, { label: 'Pai Gow Poker table: the dealer\'s seven cards on top, your low hand box and your high hand row below', top: g.top, cls: `pg-table ${tall ? 'tall' : 'wide'}` });
}

// ------------------------------------------------------------------ the table in play
let root = null, ctx = null, bets = null, mq = null, tall = false;
let dLayer = null, pLayer = null, token = 0;
let phase = 'bet';     // bet -> deal -> set -> reveal -> bet
let hand = null;       // { player (sorted), dealer, stake, lowIds, dealerSet, show, outcome }
let release = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ctx?.reduced() ? 0 : ms));
const svgEl = () => root?.querySelector('.cz-stage > svg');
const opts = () => ({ ...engine.DEFAULTS, ...(ctx?.opts ?? {}) });
const sortHand = (cards) => [...cards].sort((a, b) => engine.val(b) - engine.val(a) || Number(engine.isJoker(b)) - Number(engine.isJoker(a)) || a.suit.localeCompare(b.suit));

function split() {
  const lows = hand.lowIds.map((id) => hand.player.find((c) => c.id === id));
  return { high: hand.player.filter((c) => !hand.lowIds.includes(c.id)), low: lows };
}

function labels() {
  if (!hand) return { high: '', low: '' };
  const o = opts();
  const { high, low } = split();
  const out = {};
  if (hand.dealerSet && hand.show) {
    out.dealer = `Dealer: ${engine.evalHigh(hand.dealerSet.high, o).text} · ${engine.evalLow(hand.dealerSet.low).text}`;
  } else out.dealer = 'Dealer';
  out.high = high.length === 5 ? `High hand: ${engine.evalHigh(high, o).text}` : phase === 'set' ? `Tap ${2 - low.length === 2 ? 'two cards' : 'one more card'} for your low hand` : '';
  if (low.length === 2) {
    const foul = high.length === 5 && engine.checkSetting(high, low, o);
    out.low = foul ? 'Foul: low beats high' : `Low: ${engine.evalLow(low).text}`;
    out.foul = Boolean(foul);
  } else out.low = '';
  return out;
}

function view() {
  return { tall, amount: hand ? hand.stake : (bets?.amounts().bet ?? 0), labels: labels(), outcome: hand?.outcome ?? null };
}
function draw() {
  const el = svgEl()?.querySelector('.pg-dyn');
  if (el) el.innerHTML = dynSVG(view());
}

/** Where each of the player's cards goes: the low box, or the high row. */
function playerPos(id) {
  const g = geo(tall);
  const j = hand.lowIds.indexOf(id);
  if (j >= 0) return { x: g.low.x(j), y: g.low.y, w: g.card };
  const highs = hand.player.filter((c) => !hand.lowIds.includes(c.id));
  const i = highs.findIndex((c) => c.id === id);
  return { x: g.high.x(i, highs.length), y: g.high.y, w: g.card };
}
function dealerPos(i) {
  const g = geo(tall);
  if (!hand.show) return { x: g.dealer.row(i), y: g.dealer.y, w: g.card };
  const c = hand.dealer[i];
  const hi = hand.dealerSet.high.indexOf(c);
  return hi >= 0 ? { x: g.dealer.high(hi), y: g.dealer.y, w: g.card } : { x: g.dealer.low(hand.dealerSet.low.indexOf(c)), y: g.dealer.y, w: g.card };
}

function build() {
  if (!root) return;
  tall = mq?.matches ?? false;
  dLayer?.destroy(); pLayer?.destroy();
  const stage = root.querySelector('.cz-stage');
  stage.innerHTML = layout(ctx.opts, view());
  const g = geo(tall);
  dLayer = ctx.cards(stage, svgEl(), { from: g.shoe, label: 'The dealer\'s cards' });
  pLayer = ctx.cards(stage, svgEl(), { from: g.shoe, clickable: true, label: 'Your cards: tap one to move it between your high and low hands' });
  if (hand && phase !== 'deal') placeAll();
}

function placeAll() {
  hand.dealer.forEach((c, i) => dLayer.place(`d${i}`, hand.show ? c : null, dealerPos(i), { face: hand.show }));
  hand.player.forEach((c) => pLayer.place(c.id, c, playerPos(c.id)));
  markResult();
}
const moveAll = () => Promise.all(hand.player.map((c) => pLayer.move(c.id, playerPos(c.id))));

function markResult() {
  const s = hand?.result;
  if (!s) return;
  const { high, low } = split();
  for (const c of high) pLayer.mark(c.id, 'win', s.high === 'player');
  for (const c of low) pLayer.mark(c.id, 'win', s.low === 'player');
  hand.dealer.forEach((c, i) => dLayer.mark(`d${i}`, 'win', hand.dealerSet.high.includes(c) ? s.high === 'dealer' : s.low === 'dealer'));
}

function setControls() {
  if (phase !== 'set') { ctx.actions([]); return; }
  const o = opts();
  const { high, low } = split();
  const ready = low.length === 2;
  ctx.actions([
    { id: 'house', label: 'House way', key: 'w', title: 'Set my hand the way the house sets its own (W)', hidden: !o.hint, run: houseWayClick },
    { id: 'reset', label: 'Reset', key: 'x', small: true, title: 'Put both low cards back (X)', disabled: !low.length, run: resetLow },
  ]);
  const legal = ready && !engine.checkSetting(high, low, o);
  ctx.setButtons({ action: ready, label: 'Set hand', clear: false, undo: false, rebet: false });
  if (ready && !legal) ctx.message(o.verify ? `${engine.FOUL} Move a different card to your low hand.` : 'That setting isn\'t allowed.');
}

function toggle(id) {
  if (phase !== 'set' || !hand.player.some((c) => c.id === id)) return;
  if (hand.lowIds.includes(id)) hand.lowIds = hand.lowIds.filter((x) => x !== id);
  else if (hand.lowIds.length < 2) hand.lowIds = [...hand.lowIds, id];
  else hand.lowIds = [hand.lowIds[1], id]; // the low box is full: the older card goes back up
  ctx.play('card');
  moveAll();
  draw();
  const { low } = split();
  if (low.length < 2) ctx.message(`Tap ${low.length ? 'one more card' : 'two cards'} for your low hand${opts().hint ? ', or House way' : ''}.`);
  else ctx.message(`${labels().high}; low ${engine.evalLow(low).text}. Set hand when you're happy.`);
  setControls();
}

function houseWayClick() {
  if (phase !== 'set') return;
  const s = engine.houseWay(hand.player, opts());
  hand.lowIds = s.low.map((c) => c.id);
  ctx.play('card');
  moveAll();
  draw();
  ctx.message(`House way: ${s.reason.charAt(0).toLowerCase()}${s.reason.slice(1)}. Set hand to play it, or change it.`);
  setControls();
}
function resetLow() {
  if (phase !== 'set') return;
  hand.lowIds = [];
  moveAll();
  draw();
  ctx.message('Tap two cards for your low hand.');
  setControls();
}

const onCardClick = (e) => {
  const b = e.target.closest('button[data-card]');
  if (!b || !root?.contains(b)) return;
  toggle(b.dataset.card);
};

async function dealHand(amounts, rel) {
  const my = token;
  const live = () => my === token && root;
  release = rel;
  phase = 'deal';
  const old = [...dLayer.ids(), ...pLayer.ids()].length;
  if (old) { await Promise.all([dLayer.gather(geo(tall).tray), pLayer.gather(geo(tall).tray)]); if (!live()) return; }
  const d = engine.deal(ctx.rng);
  hand = { player: sortHand(d.player), dealer: d.dealer, stake: amounts.bet, lowIds: [], dealerSet: null, show: false, outcome: null, result: null };
  draw();
  ctx.play('shuffle');
  ctx.message('Dealing seven cards each…');
  showTable();
  const jobs = [];
  for (let i = 0; i < 7; i++) {
    jobs.push(pLayer.deal(hand.player[i].id, hand.player[i], playerPos(hand.player[i].id), { delay: i * 110 }));
    jobs.push(dLayer.deal(`d${i}`, null, dealerPos(i), { delay: i * 110 + 55 }));
  }
  ctx.play('deal');
  await Promise.all(jobs);
  if (!live()) return;
  phase = 'set';
  draw();
  ctx.message(`Tap two cards to make your low hand${opts().hint ? ', or press House way' : ''}. Your high hand must beat it.`);
  setControls();
  showTable();
}

/** On a phone the table is taller than the room left above the bet bar: scroll it into view. */
function showTable() {
  const el = svgEl();
  if (!el || !tall) return;
  const win = root.ownerDocument.defaultView;
  const dock = root.ownerDocument.querySelector('.cz-dock');
  const room = win.innerHeight - (dock ? dock.getBoundingClientRect().height : 0);
  const r = el.getBoundingClientRect();
  if (r.bottom > room) win.scrollBy({ top: Math.min(r.top, r.bottom - room + 8), behavior: ctx.reduced() ? 'auto' : 'smooth' });
}

function setHand() {
  if (phase !== 'set') return;
  const o = opts();
  const p = split();
  if (p.low.length !== 2) { ctx.play('error'); ctx.message('Pick two cards for your low hand first.'); return; }
  const why = engine.checkSetting(p.high, p.low, o);
  if (why) { ctx.play('error'); ctx.message(o.verify ? `${why} Move a different card down.` : 'That setting isn\'t allowed.'); return; }
  hand.dealerSet = engine.houseWay(hand.dealer, o);
  const s = engine.showdown(p, hand.dealerSet, o);
  const returned = engine.settle(hand.stake, s.result);
  ctx.settle({ returned });   // paid now; the reveal only shows it
  hand.result = s;
  phase = 'reveal';
  ctx.actions([]);
  ctx.setButtons({ action: false, label: ctx.game.action });
  reveal(s, returned);
}

async function reveal(s, returned) {
  const my = token;
  const live = () => my === token && root;
  ctx.message('The dealer sets the house way…');
  ctx.play('flip');
  hand.show = true;
  await Promise.all(hand.dealer.map((c, i) => dLayer.move(`d${i}`, dealerPos(i))));
  if (!live()) return;
  await Promise.all(hand.dealer.map((c, i) => dLayer.flip(`d${i}`, c)));
  if (!live()) return;
  await wait(250);
  if (!live()) return;
  finish(s, returned);
}

function finish(s, returned) {
  const net = returned - hand.stake;
  const word = (who, copy) => (who === 'player' ? 'you' : copy ? 'the dealer (a copy)' : 'the dealer');
  const detail = `High: ${word(s.high, s.highCopy)} · Low: ${word(s.low, s.lowCopy)}`;
  hand.outcome = s.result === 'win' ? { text: `+${money(net)}`, tone: 'win' } : s.result === 'push' ? { text: 'Push', tone: 'push' } : { text: `−${money(hand.stake)}`, tone: 'lose' };
  markResult();
  release?.(); release = null;
  bets.release();
  phase = 'bet';
  draw();
  if (s.result === 'win') { ctx.play('win'); ctx.banner(`You win both · +${money(net)}`, { tone: 'win', detail: `${money(returned)} back after the 5% commission` }); }
  else if (s.result === 'push') { ctx.play('chips'); ctx.banner('One each · Push', { tone: 'push', detail }); }
  else { ctx.play('lose'); ctx.banner('Dealer wins both', { tone: 'lose', detail }); }
  ctx.message(`${labels().dealer}. ${detail}. Bet ${money(hand.stake)} · Paid ${money(returned)} · Net ${net > 0 ? '+' : ''}${money(net)}.`);
  ctx.setButtons({ label: ctx.game.action });
  bets.sync();
  ctx.checkBroke();
}

function action() {
  if (!bets) return;
  if (phase === 'set') { setHand(); return; }
  if (phase !== 'bet') return;
  bets.commit((amounts, rel) => { dealHand(amounts, rel); }, { hold: true });
}

const onResize = () => { if (phase === 'bet' || phase === 'set') build(); else ctx.after(80, onResize); };

export default {
  id: 'pai-gow-poker',
  name: 'Pai Gow Poker',
  ready: true,
  css: 'css/casino/pai-gow-poker.css',
  layout,
  settings: engine.OPTIONS,
  minBuyIn: engine.minBuyIn,
  howto: {
    goal: 'Split seven cards into a five-card <b>high hand</b> and a two-card <b>low hand</b>, and beat both of the dealer\'s hands.',
    deal: [
      'One deck of 52 cards plus a joker, shuffled for every hand. You and the dealer get seven cards each; the dealer\'s stay face down until you have set yours.',
      'The house banks every hand.',
    ],
    play: [
      'Tap two of your cards to move them to the low box; tap a low card to send it back. The other five are your high hand.',
      'Your high hand must outrank your low hand: if your low hand is a pair, your high hand needs a higher pair or better. A setting that breaks this rule is not allowed.',
      'Press <b>House way</b> to have your hand set the way the dealer sets its own, then change it if you like. Press <b>Set hand</b> (Enter) to play.',
      'The two-card hand counts only pairs and high cards: a pair of twos beats ace-king.',
      'The joker is a <b>bug</b>: it counts as an ace, or as any card that completes a straight, flush or straight flush. Five aces (four aces and the joker) is the best hand. A-2-3-4-5 is the second-highest straight.',
      'The dealer sets by the house way: no pair, highest card high and the next two low; one pair high and the next two cards low; two pair split, unless both are sixes or lower with an ace to play low; three pair, the highest pair low; a straight or flush when it leaves a good low hand; full house, the pair low; four of a kind kept or split by rank.',
    ],
    fig: { cards: 'KS KD 9C 9H 4S · AD QC', caption: 'Two pair high (kings and nines), A-Q low. The house way would split the pairs: kings and A-Q-4 high, nines low.' },
    score: [
      'Each of your hands is compared with the dealer\'s hand of the same size. A tie on a hand (a <b>copy</b>) goes to the dealer.',
      '<b>Win both</b>: you are paid 1 to 1, less a 5% commission, rounded down to whole dollars ($10 wins $9, $5 wins $4).',
      '<b>Win one, lose one</b>: a push; your bet comes back.',
      '<b>Lose both</b>: the dealer takes your bet.',
      'Leaving the table after the deal and before you set your hand forfeits the bet.',
    ],
    options: {
      a5: 'A-2-3-4-5 ranks just below A-K-Q-J-10. Turned off, it is the lowest straight.',
      verify: 'when your low hand would beat your high hand, the table explains why it can\'t be played. Illegal settings are never allowed either way.',
      hint: 'shows the House way button while you set your hand.',
    },
    controls: 'Pick a chip and {click} the bet circle, then Deal (Enter). {Click} a card to move it between your high and low hands; W sets it the house way, X puts the low cards back, Enter sets your hand. Right-click or a long press takes a chip off the bet; Backspace undoes, C clears, R rebets.',
    tip: 'Most hands push. When in doubt, the House way button gives a sound setting.',
  },

  mount(el, c) {
    root = el; ctx = c;
    token++;
    phase = 'bet'; hand = null; release = null;
    el.innerHTML = '<div class="cz-stage pg-stage"></div>';
    mq = matchMedia(TALL);
    mq.addEventListener('change', onResize);
    el.addEventListener('click', onCardClick);
    bets = ctx.bets({
      root: el,
      spot: (key) => (key === 'bet' && phase === 'bet' ? { label: 'Bet' } : null),
      onChange: () => {
        if (phase === 'bet' && hand && bets.total()) { hand = null; dLayer?.clear(); pLayer?.clear(); }
        draw();
      },
    });
    ctx.keys({ w: () => { if (phase === 'set' && opts().hint) houseWayClick(); } });
    build();
    ctx.message(`Bet ${ctx.stakesText}, then Deal.`);
  },
  unmount() {
    token++;
    phase = 'bet';
    mq?.removeEventListener('change', onResize);
    root?.removeEventListener('click', onCardClick);
    dLayer?.destroy(); pLayer?.destroy();
    release?.(); release = null;
    if (root) root.innerHTML = '';
    root = null; bets = null; dLayer = null; pLayer = null; hand = null;
  },
  action,
  optionsChanged() { if (phase === 'bet') build(); else if (phase === 'set') { draw(); setControls(); } },
};

