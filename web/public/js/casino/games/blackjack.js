// Blackjack: one betting spot against the dealer, from a shoe of one to six decks. The rules live in
// ../engines/blackjack.js (no DOM) and basic strategy in ../engines/blackjack-strategy.js; this file
// draws the table, deals the cards and runs the buttons.
//
// Money: the main bet leaves the bank on Deal (the staged chips); a double, a split or insurance when
// it is made; the whole round is paid the moment it is decided (before the dealer's cards are shown),
// with the bank pill held at its old figure until the reveal ends.
import * as engine from '../engines/blackjack.js';
import { advise, insuranceAdvice, countNote } from '../engines/blackjack-strategy.js';
import { svg, path, text, arcText, spot, cardSlot, tableRail, rect, esc } from '../svg.js';
import { railBand, tableCrest, shoe, discardTray, CREST_TOP } from '../tableart.js';
import { chipSVG } from '../chips.js';
import { money } from '../../core/bank.js';
import { howtoSections } from '../stub.js';

const W = 1000, H = 560;
const RAIL = tableRail(W, H, 30);
const CX = RAIL.cx, SPOT_Y = 470, HAND_Y = 340, DEALER_Y = 95, DEALER_X = 470;
const SHOE_AT = { x: 875, y: 80 }, TRAY_AT = { x: 115, y: 80 };
const INS_AT = { x: 372, y: 250 };
const CARD = 88; // a card's width in layout units (never under 40 px on screen)

const ruleLine = (r) => (r.h17 ? 'Dealer must hit soft 17 and stand on hard 17s' : 'Dealer must draw to 16 and stand on all 17s');

/** The table as SVG (no DOM): the arc lettering, the dealer's place, the one betting spot. */
export function layout(opts = {}) {
  const rules = engine.rulesFrom(opts);
  const { cx, cy, d, edge } = RAIL;
  return svg(W, H, `${railBand(edge, d, W, H)}${path(d, { cls: 'cz-rail' })}${tableCrest('Blackjack')}
    ${shoe(SHOE_AT.x, SHOE_AT.y)}${discardTray(TRAY_AT.x, TRAY_AT.y)}
    ${cardSlot(DEALER_X, DEALER_Y, 48)}${cardSlot(DEALER_X + 60, DEALER_Y, 48)}
    ${arcText(cx, cy, 180, 160, 20, 'BLACKJACK PAYS 3 TO 2', { size: 26 })}
    ${arcText(cx, cy, 215, 160, 20, ruleLine(rules), { size: 17, weight: 500, cls: 'cz-tx bjk-rule' })}
    ${arcText(cx, cy, 252, 150, 30, 'INSURANCE PAYS 2 TO 1', { size: 18 })}
    ${spot(cx, SPOT_Y, 38, 'BET', { key: 'main' })}
    <g class="bjk-dyn"></g>`, { label: 'Blackjack table: the dealer at the top, your betting spot at the front', top: CREST_TOP });
}

// ------------------------------------------------------------------ per-visit state
let root = null, ctx = null, bets = null, layer = null, svgEl = null;
let state = null, busy = false, hold = null, insureAmt = 0, lastOpts = null, pending = null;
let visit = 0, cleared = true;
const placed = new Map(); // card key -> where it was last put (layout units)

const wait = (ms) => new Promise((r) => { if (!ctx) r(); else ctx.after(ctx.reduced() ? 0 : ms, r); });
const between = () => !state || state.phase === 'bet' || state.phase === 'over';
const rules = () => state?.rules ?? engine.rulesFrom(ctx?.opts);

// ------------------------------------------------------------------ geometry (layout units)
/** Pixels per layout unit right now (cards never shrink under 40 px, so on a phone they take more room). */
function scale() {
  const w = svgEl?.getBoundingClientRect().width || 600;
  return w / W;
}
function geo(st) {
  const k = scale();
  const cw = Math.max(CARD, 40 / k);        // the width a card is drawn at, in units
  const dx = Math.max(30, 17 / k);          // what shows of each card under the next one
  const ddx = Math.max(58, 22 / k);
  const n = st.hands.length;
  const spacing = n > 1 ? Math.min(260, 880 / n) : 0;
  const hands = st.hands.map((h, i) => {
    const hx = CX + (i - (n - 1) / 2) * spacing;
    const x0 = hx - (n > 1 ? dx * 0.5 : 20);
    return h.cards.map((c, j) => ({ x: x0 + j * dx, y: HAND_Y - j * (k < 0.5 ? 0 : 8), w: CARD, z: 10 + j }));
  });
  const dealer = st.dealer.map((c, j) => ({ x: DEALER_X + j * ddx, y: DEALER_Y, w: CARD, z: 10 + j }));
  return { k, cw, dx, hands, dealer };
}

// ------------------------------------------------------------------ the cards (kit/cards.js layer)
/** Every card that should be on the table, in the order a dealer would deal them. */
function wanted(st) {
  const g = geo(st);
  const hand = st.hands.flatMap((h, i) => h.cards.map((c, j) => ({ key: c.id, card: c, at: g.hands[i][j], face: true })));
  const dealer = st.dealer.map((c, j) => (j === 1
    ? { key: 'hole', card: st.holeShown ? c : null, at: g.dealer[j], face: st.holeShown }
    : { key: c.id, card: c, at: g.dealer[j], face: true }));
  if (hand.length === 2 && dealer.length === 2 && !layer.has(hand[0].key)) return [hand[0], dealer[0], hand[1], dealer[1]];
  return [...hand, ...dealer];
}

/** Bring the card layer in line with the state: move, deal and turn what changed. */
async function sync(st, { instant = false } = {}) {
  const me = visit;
  for (const w of wanted(st)) {
    if (!layer || me !== visit) return;
    const at = placed.get(w.key);
    const same = at && at.x === w.at.x && at.y === w.at.y;
    placed.set(w.key, w.at);
    if (instant) { layer.place(w.key, w.card, w.at, { face: w.face }); continue; }
    if (!layer.has(w.key)) { ctx.play('card'); await layer.deal(w.key, w.card, w.at, { face: w.face }); continue; }
    if (!same) await layer.move(w.key, w.at);
    if (me !== visit || !layer) return;
    if (w.face && layer.el(w.key)?.classList.contains('down')) { ctx.play('flip'); await layer.flip(w.key, w.card); }
  }
  if (me === visit) drawDyn();
}

/** Sweep the cards to the discard tray. */
async function gather() {
  cleared = true;
  placed.clear();
  drawDyn();
  await layer?.gather(TRAY_AT);
}

// ------------------------------------------------------------------ labels, chips and the info line
function label(x, y, s, { cls = '', size }) {
  const w = Math.max(size * 2.4, s.length * size * 0.56 + size * 1.1), h = size * 1.6;
  return `<g class="bjk-lbl ${cls}">${rect(x - w / 2, y - h / 2, w, h, { cls: 'bjk-lbl-bg', r: h / 2 })}${text(x, y, s, { size, weight: 700, cls: 'bjk-lbl-tx' })}</g>`;
}
const RESULT = { blackjack: 'Blackjack', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust', surrender: 'Surrendered' };

function drawDyn() {
  const g = root?.querySelector('.bjk-dyn');
  if (!g || !state) return;
  const st = state;
  const geom = geo(st);
  const size = Math.max(18, 12 / geom.k);
  const showTotals = ctx.opts.totals !== false;
  let out = '';
  // chips on the spot: the staged bet, or what is riding on the hands
  const staged = bets?.total() ?? 0;
  const riding = st.phase === 'play' || st.phase === 'insurance' ? st.hands.reduce((t, h) => t + h.bet, 0) : 0;
  const onSpot = bets?.locked ? riding : staged;
  if (onSpot) out += chipSVG(CX, SPOT_Y, 28, onSpot);
  if (st.insurance && st.phase !== 'bet' && !(st.phase === 'over' && staged)) out += chipSVG(INS_AT.x, INS_AT.y, 20, st.insurance);
  if (st.hands.length && !cleared) {
    // the dealer's total: what shows until the hole card turns
    if (showTotals && st.dealer.length) {
      const shown = st.holeShown ? st.dealer : [st.dealer[0]];
      const t = st.holeShown ? engine.describe(shown) : `Shows ${engine.handValue(shown).total === 11 ? 'an ace' : engine.handValue(shown).total}`;
      out += label(DEALER_X - geom.cw / 2 - 12 - size * 2.2, DEALER_Y, t, { size });
    }
    const n = st.hands.length;
    st.hands.forEach((h, i) => {
      const pos = geom.hands[i];
      if (!pos.length) return;
      const xMid = (pos[0].x + pos[pos.length - 1].x) / 2;
      const ch = geom.cw * 1.4;
      let y = HAND_Y + ch / 2 + size;
      if (y + size > SPOT_Y - 30) y = pos[pos.length - 1].y - ch / 2 - size; // phones: above the cards
      const parts = [];
      if (showTotals || h.result) parts.push(h.result === 'blackjack' ? 'Blackjack' : h.result === 'bust' ? `Bust` : engine.describe(h.cards, { natural: !h.split }));
      if (!showTotals && parts[0] && !h.result) parts.length = 0;
      if (h.result && h.result !== 'blackjack' && h.result !== 'bust') parts.push(RESULT[h.result]);
      if ((n > 1 || h.doubled) && geom.k > 0.45) parts.push(money(h.bet));
      if (!parts.length) return;
      const active = st.phase === 'play' && i === st.active && n > 1;
      const tone = { win: 'win', blackjack: 'win', push: 'push', lose: 'lose', bust: 'lose', surrender: 'lose' }[h.result] ?? '';
      out += label(xMid, y, parts.join(' · '), { size, cls: `${active ? 'active' : ''} ${tone}` });
    });
  }
  g.innerHTML = out;
  drawInfo();
}

function drawInfo() {
  const box = root?.querySelector('.bjk-info');
  if (!box || !state) return;
  const r = rules();
  const bits = [`${r.decks} ${r.decks === 1 ? 'deck' : 'decks'}`, r.h17 ? 'Dealer hits soft 17' : 'Dealer stands on soft 17', 'Blackjack pays 3 to 2'];
  if (r.surrender === 'late') bits.push('Late surrender');
  let count = '';
  if (ctx.opts.count) {
    const tc = engine.trueCount(state);
    const sign = (v) => (v > 0 ? `+${v}` : String(v));
    count = `<span class="bjk-count">Running count <b>${sign(state.count)}</b> · True count <b>${sign(tc)}</b> · ${engine.decksLeft(state).toFixed(1)} decks left</span>`;
  }
  box.innerHTML = `<span>${esc(bits.join(' · '))}</span>${count}`;
}

// ------------------------------------------------------------------ the buttons
let shownSet = '';
function setControls(defs) {
  const ids = defs.map((d) => d.id).join(',');
  if (ids === shownSet) {
    ctx.setActions(Object.fromEntries(defs.map((d) => [d.id, { disabled: Boolean(d.disabled), hidden: Boolean(d.hidden), label: d.label, title: d.title ?? '' }])));
    return;
  }
  shownSet = ids;
  ctx.actions(defs);
}

function controls() {
  if (!ctx) return;
  if (between()) {
    shownSet = '';
    ctx.actions([]); // betting: no game buttons, so R is Rebet again
    bets?.sync();
    return;
  }
  const hint = { id: 'hint', label: 'Hint', key: '?', small: true, title: 'What would basic strategy do?', run: showHint };
  if (state.phase === 'insurance') {
    const max = engine.legal(state, { bank: ctx.bank.balance }).find((a) => a.type === 'insurance')?.max ?? 0;
    insureAmt = Math.max(0, Math.min(insureAmt || max, max));
    setControls([
      { id: 'insure', label: max ? `Insure ${money(insureAmt)}` : 'Insure', key: 'i', disabled: !max, title: max ? 'Insurance pays 2 to 1 if the dealer has blackjack' : 'Not enough in the bank', run: () => act('insurance', { amount: insureAmt }) },
      { id: 'less', label: '−', small: true, title: 'Insure less', disabled: insureAmt <= 1, run: () => { insureAmt = Math.max(1, insureAmt - step()); controls(); } },
      { id: 'more', label: '+', small: true, title: 'Insure more', disabled: insureAmt >= max, run: () => { insureAmt = Math.min(max, insureAmt + step()); controls(); } },
      { id: 'decline', label: 'No insurance', key: 'n', primary: true, run: () => act('decline') },
      hint,
    ]);
    ctx.message(`The dealer shows an ace. Insurance? Up to ${money(Math.floor(state.hands[0].bet / 2))}, pays 2 to 1 if the dealer has blackjack.`);
    return;
  }
  const open = engine.legal(state, { bank: ctx.bank.balance });
  const get = (t) => open.find((a) => a.type === t);
  const btn = (id, label, key, extra = {}) => {
    const a = get(id);
    return { id, label, key, hidden: !a, disabled: !a || Boolean(a.disabled), title: a?.why, run: () => act(id), ...extra };
  };
  setControls([
    btn('hit', 'Hit', 'h', { primary: true }),
    btn('stand', 'Stand', 's'),
    btn('double', 'Double', 'd'),
    btn('split', 'Split', 'p'),
    btn('surrender', 'Surrender', 'r'),
    hint,
  ]);
  const h = state.hands[state.active];
  const which = state.hands.length > 1 ? `Hand ${state.active + 1} of ${state.hands.length}: ` : '';
  ctx.message(`${which}${engine.describe(h.cards, { natural: !h.split })} against the dealer's ${cardWord(state.dealer[0])}. Hit or stand?`);
}
const step = () => Math.max(1, Math.min(ctx.stakes.min, 5));
const cardWord = (c) => ({ A: 'ace', K: 'king', Q: 'queen', J: 'jack' }[c.rank] ?? c.rank);

function showHint() {
  if (!state || between()) return;
  let title, why;
  if (state.phase === 'insurance') {
    const a = insuranceAdvice(ctx.opts.count ? engine.trueCount(state) : null);
    title = a.take ? 'Hint: take insurance' : 'Hint: no insurance';
    why = a.why;
  } else {
    const h = state.hands[state.active];
    const bank = { bank: ctx.bank.balance };
    const a = advise({ cards: h.cards, up: state.dealer[0], rules: state.rules,
      can: { double: engine.can(state, 'double', bank), split: engine.can(state, 'split', bank), surrender: engine.can(state, 'surrender', bank) } });
    title = `Hint: ${a.action[0].toUpperCase()}${a.action.slice(1)}`;
    why = a.why;
  }
  if (ctx.opts.count) why += ` ${countNote(state.count, engine.trueCount(state))}`;
  ctx.banner(title, { tone: 'info', detail: why });
  ctx.message(`${title}. ${why}`);
}

// ------------------------------------------------------------------ playing a round
async function run(r) {
  const me = visit;
  busy = true;
  cleared = false;
  if ((r.fx ?? []).includes('chips')) ctx.play('chips');
  await sync(state);
  if (me !== visit || !ctx) return;
  busy = false;
  if (state.phase === 'over') finish();
  else controls();
}

/** A player action: hit, stand, double, split, surrender, insurance, decline. */
function act(type, extra = {}) {
  if (busy || !state || between()) return;
  let r;
  try { r = engine.step(state, { type, ...extra }, { rng: ctx.rng }); } catch (e) { ctx.play('error'); ctx.message(e.message); return; }
  if (r.done) hold = ctx.holdBank();
  const paid = ctx.apply(r);
  if (!paid.ok) { hold?.(); hold = null; ctx.play('error'); ctx.message(paid.error); controls(); return; }
  ctx.banner(null);
  state = r.state;
  bets.sync(); // the bet bar shows what is on the table now (a double or a split)
  run(r);
}

/** Deal: the staged chips are the bet. */
function action() {
  if (busy || !between() || !bets) return;
  bets.commit((amounts) => {
    if (pending) { state = engine.step(state, { type: 'rules', opts: pending }, { rng: ctx.rng }).state; pending = null; }
    const r = engine.step(state, { type: 'deal', bet: amounts.main }, { rng: ctx.rng });
    if (r.done) hold = ctx.holdBank();
    ctx.apply({ ...r, cash: r.cash.filter((e) => e.why !== 'bet') }); // the bet itself went with the chips
    state = r.state;
    insureAmt = 0;
    busy = true;
    shownSet = '';
    ctx.actions([]);
    cleared = true;
    drawDyn(); // the bet stays on the spot while the cards come out
    const me = visit;
    (async () => {
      await gather();
      if (me !== visit) return;
      if (r.shuffled && state.round > 1) {
        ctx.play('shuffle');
        ctx.banner('Shuffling…', { tone: 'info', detail: 'A fresh shoe' });
        await wait(700);
        if (me !== visit) return;
        ctx.banner(null);
      }
      await run(r);
    })();
  });
}

/** The round is over (and already paid): show how it went. */
function finish() {
  const res = state.result;
  const hands = state.hands;
  hold?.(); hold = null;
  for (const h of hands) {
    const good = h.result === 'win' || h.result === 'blackjack';
    const bad = h.result === 'lose' || h.result === 'bust' || h.result === 'surrender';
    for (const c of h.cards) { layer.mark(c.id, 'win', good); layer.mark(c.id, 'dim', bad); }
  }
  bets.release();
  const dealer = res.dealerBJ ? 'Dealer has blackjack' : res.dealer > 21 ? `Dealer busts with ${res.dealer}` : `Dealer has ${res.dealer}`;
  const one = hands.length === 1 ? hands[0] : null;
  const net = res.net;
  let title, tone;
  if (one?.result === 'blackjack') { title = `Blackjack! You win ${money(net)}`; tone = 'win'; }
  else if (net > 0) { title = `You win ${money(net)}`; tone = 'win'; }
  else if (net === 0 && res.insurance === 'win') { title = 'Insurance saves your bet'; tone = 'push'; }
  else if (net === 0) { title = 'Push'; tone = 'push'; }
  else if (one?.result === 'surrender') { title = 'Surrendered'; tone = 'lose'; }
  else if (one?.result === 'bust') { title = 'Bust'; tone = 'lose'; }
  else { title = res.dealerBJ ? 'Dealer blackjack' : 'Dealer wins'; tone = 'lose'; }
  const per = hands.length > 1 ? hands.map((h, i) => `hand ${i + 1} ${RESULT[h.result].toLowerCase()}`).join(', ') : '';
  const ins = res.insurance === 'win' ? `Insurance pays ${money(res.insuranceBack)}.` : res.insurance === 'lose' ? 'Insurance lost.' : '';
  const detail = [one?.result === 'surrender' ? 'Half your bet comes back' : dealer, per, ins].filter(Boolean).join(' · ');
  ctx.banner(title, { tone, detail });
  ctx.play(net > 0 ? 'win' : net < 0 ? 'lose' : 'chips');
  const signed = net > 0 ? `+${money(net)}` : money(net);
  ctx.message(`Bet ${money(res.wagered)} · Paid ${money(res.won)} · Net ${signed}. Place a bet for the next hand.`);
  drawDyn();
  controls();
  ctx.checkBroke();
}

// ------------------------------------------------------------------ options
const OPTS_KEY = 'dc.casino.opts.blackjack';
/** Picking a preset fills in its rules; changing a single rule switches the preset to Custom. */
function syncPreset(next) {
  const prev = lastOpts ?? next;
  const o = { ...next };
  if (o.preset !== 'custom') {
    const p = engine.PRESETS[o.preset];
    if (o.preset !== prev.preset) for (const k of engine.RULE_KEYS) o[k] = p[k];
    else if (engine.RULE_KEYS.some((k) => o[k] !== prev[k])) o.preset = 'custom';
  }
  const changed = Object.keys(o).some((k) => o[k] !== next[k]);
  if (changed) {
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(o)); } catch { /* the options just won't be remembered */ }
    if (o.preset === 'custom' && next.preset !== 'custom') ctx.toast('Rules set to Custom.');
  }
  lastOpts = o;
  return o;
}

function optionsChanged(next) {
  if (!ctx) return;
  const o = syncPreset(next);
  ctx.opts = o;
  if (between() && !busy) {
    state = engine.step(state, { type: 'rules', opts: o }, { rng: ctx.rng }).state;
    pending = null;
    const tp = root.querySelector('.bjk-rule textPath');
    if (tp) tp.textContent = ruleLine(state.rules);
  } else pending = o;
  drawDyn();
}

// ------------------------------------------------------------------ How to play
const howto = howtoSections([
  ['The aim', 'Beat the dealer by finishing closer to 21 without going over. Cards 2 to 10 count their number, jacks, queens and kings count 10, and an ace counts 11 or 1, whichever helps. A hand with an ace counted as 11 is <b>soft</b> ("soft 17"): it can take a card without busting.'],
  ['A round', '<ul><li>Choose a chip and click the betting circle, then press <b>Deal</b>. You get two cards face up; the dealer gets one up and one face down (the hole card).</li><li>If the dealer shows an ace or a ten-card, the dealer checks the hole card. A dealer blackjack ends the round at once: you lose your bet unless you have blackjack too, which is a push.</li><li>Then it is your turn: <b>Hit</b> to take a card, <b>Stand</b> to keep what you have. Go over 21 and you bust and lose, whatever the dealer does.</li><li>When you stand, the dealer turns the hole card and draws until reaching 17 or more (see the table for soft 17). If the dealer busts, you win. Otherwise the higher total wins; the same total is a push and your bet comes back.</li></ul>'],
  ['Special plays', '<ul><li><b>Double</b>: on your first two cards, add a second bet equal to the first and take exactly one more card.</li><li><b>Split</b>: with two cards of the same value (two 8s, or a king and a 10), add an equal bet and play them as two hands. You can split again up to four hands. Split aces get one card each. A 21 made after a split is not a blackjack and pays even money.</li><li><b>Insurance</b>: when the dealer shows an ace you may bet up to half your bet that the hole card is a ten. It pays 2 to 1. If you have blackjack, taking it is the same as accepting even money.</li><li><b>Surrender</b> (when the rules allow it): give up your first two cards and get half your bet back, after the dealer has checked for blackjack.</li></ul>'],
  ['Payouts', '<ul><li>A win pays even money (1 to 1).</li><li>Blackjack, an ace and a ten-card as your first two cards, pays 3 to 2. Payouts are rounded down to whole dollars, so bet even amounts for an exact 3 to 2.</li><li>Insurance pays 2 to 1. Surrender returns half the bet.</li></ul>'],
  ['House rules', 'Options lets you pick a rule set (Las Vegas Strip, Downtown Vegas, Atlantic City, Reno) or Custom: the number of decks, whether the dealer hits soft 17, which hands may double, double after split, how many splits, resplitting aces, surrender, insurance and where the cut card goes. New rules start with the next hand; a change of decks brings a fresh shoe. You can also turn the hand totals off, or show the card count.'],
  ['Hint and the count', 'Press <b>Hint</b> for the basic strategy play and why. Played perfectly, basic strategy leaves the house an edge of only about half a percent under the standard rules. With the count shown, the running count adds 1 for every 2 to 6 you have seen and takes 1 for every ten-card and ace; the true count divides that by the decks left. A high count means more tens and aces are left, which favors you.'],
  ['Keys', 'Number keys 1 to 8 pick a chip, Enter or Space deals, Backspace undoes a chip, C clears, R rebets (Shift+R doubles it). During a hand: H hit, S stand, D double, P split, R surrender, ? hint. When insurance is offered: I insure, N no insurance.'],
]);

export default {
  id: 'blackjack',
  name: 'Blackjack',
  ready: true,
  layout,
  howto,
  settings: engine.OPTIONS,
  css: 'css/casino/blackjack.css',
  minBuyIn: (stakes) => engine.minBuyIn(stakes),

  mount(el, c) {
    root = el; ctx = c;
    visit++; cleared = true; placed.clear();
    busy = false; hold = null; insureAmt = 0; pending = null; shownSet = '';
    lastOpts = { ...ctx.opts };
    state = engine.init({ opts: ctx.opts, rng: ctx.rng });
    el.innerHTML = `<div class="bjk"><div class="cz-stage bjk-stage">${layout(ctx.opts)}</div><p class="bjk-info"></p></div>`;
    const stage = el.querySelector('.bjk-stage');
    svgEl = stage.querySelector('svg');
    layer = ctx.cards(stage, svgEl, { from: SHOE_AT, label: 'Cards on the blackjack table' });
    bets = ctx.bets({
      root: el,
      spot: (key) => (key === 'main' && between() && !busy ? { label: 'Your bet' } : null),
      onChange: () => { if (state?.phase === 'over' && bets && !bets.locked && bets.total()) clearTable(); drawDyn(); },
    });
    addEventListener('resize', onResize);
    controls();
    drawDyn();
    ctx.message(`Place your bet on the circle (${ctx.stakesText}), then Deal. Even amounts pay exactly 3 to 2 on a blackjack.`);
  },

  unmount() {
    // a hand in progress was either settled already or is forfeited by the shell
    removeEventListener('resize', onResize);
    hold?.(); hold = null;
    if (root) root.innerHTML = '';
    visit++;
    placed.clear();
    root = null; ctx = null; bets = null; layer = null; svgEl = null; state = null; busy = false;
  },

  action,
  optionsChanged,
};

/** New chips after a finished hand: sweep the old cards away. */
function clearTable() {
  if (busy || cleared) return;
  gather();
}

let resizeT = 0;
function onResize() {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { if (layer && state && !busy) { sync(state, { instant: true }); } }, 120);
}
