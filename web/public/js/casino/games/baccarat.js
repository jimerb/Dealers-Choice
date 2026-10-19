// Baccarat (punto banco): bet on Player, Banker or Tie, Deal, and the two hands play themselves by
// the third-card rules. The rules live in ../engines/baccarat.js (no DOM); this is the table.
// Wide screens get the half-moon table with betting arcs; phones get a taller table with three
// stacked betting boxes. The scorecard (bead plate) of the current shoe sits between the hands and
// the bets.
import * as engine from '../engines/baccarat.js';
import { svg, path, rect, circle, text, arcText, band, cardSlot, tableRail, polar, esc } from '../svg.js';
import { railBand, tableCrest, crest, shoe, discardTray, CREST_TOP } from '../tableart.js';
import { chipSVG } from '../chips.js';
import { money } from '../../core/bank.js';

const { SPOTS } = engine;
const TALL = '(max-width: 640px)';
const SIDE = { player: 'Player', banker: 'Banker', tie: 'Tie' };

// ------------------------------------------------------------------ geometry
// Everything that differs between the wide (1000 x 560) and tall (600 x 710) tables.
const WIDE = {
  w: 1000, h: 560, top: CREST_TOP, shoe: { x: 875, y: 80 }, tray: { x: 115, y: 80 },
  card: 64, hands: { player: { x: 280, y: 100, third: 1 }, banker: { x: 720, y: 100, third: -1 } }, labelY: 165,
  road: { x: 500, y: 198, cols: 16, cell: 14, countY: 182 },
};
const TALLG = {
  w: 600, h: 710, top: 100, shoe: { x: 520, y: 80 }, tray: { x: 80, y: 80 },
  card: 72, hands: { player: { x: 150, y: 180, below: true }, banker: { x: 450, y: 180, below: true } }, labelY: 330,
  road: { x: 300, y: 374, cols: 20, cell: 16, countY: 356 },
  boxes: { tie: [490, 552], banker: [560, 622], player: [630, 692] },
};
const geo = (tall) => (tall ? TALLG : WIDE);

/** Where card i (0-2) of a hand sits; the third card lies sideways. */
export function cardAt(tall, side, i) {
  const g = geo(tall), h = g.hands[side], w = g.card, gap = w / 2 + 2;
  if (i < 2) return { x: h.x + (i ? gap : -gap), y: h.y, w };
  if (h.below) return { x: h.x, y: h.y + w * 0.7 + 8 + w / 2, w, rot: 90 };
  return { x: h.x + h.third * (gap + w / 2 + 8 + w * 0.7), y: h.y, w, rot: 90 };
}

/** Where the chips on a bet are drawn, and the result line beside them. */
function chipAt(tall, key) {
  if (tall) { const [y0, y1] = TALLG.boxes[key]; return { x: 500, y: (y0 + y1) / 2, r: 24, tx: 430 }; }
  const r = { tie: 305, banker: 371, player: 444 }[key];
  const [x, y] = polar(500, 30, r, 47);
  const [tx, ty] = polar(500, 30, r, 36);
  return { x, y, r: 22, tx, ty };
}

const tieText = (opts) => `TIE PAYS ${Number(opts?.tie ?? 8)} TO 1`;

/** The betting areas: arcs on the half-moon table, boxes on the tall one. */
function betAreas(tall, opts) {
  const label = { player: 'PLAYER PAYS 1 TO 1', banker: 'BANKER PAYS 1 TO 1 LESS 5%', tie: tieText(opts) };
  const g = (key, body) => `<g class="bc-spot" data-spot="${key}" role="button" tabindex="0" aria-label="${esc(`Bet on ${SIDE[key]}: ${label[key].toLowerCase()}`)}">${body}</g>`;
  if (tall) {
    return Object.entries(TALLG.boxes).map(([key, [y0, y1]]) => g(key, rect(40, y0, 520, y1 - y0, { cls: 'cz-area', r: 12 })
      + text(250, (y0 + y1) / 2, label[key], { size: key === 'banker' ? 19 : 22, weight: 700 }))).join('');
  }
  const { cx, cy } = tableRail(1000, 560, 30);
  return g('tie', band(cx, cy, 280, 330, 155, 25, { cls: 'cz-area' }) + arcText(cx, cy, 298, 155, 25, label.tie, { size: 22 }))
    + g('banker', band(cx, cy, 340, 402, 162, 18, { cls: 'cz-area' }) + arcText(cx, cy, 364, 162, 18, label.banker, { size: 24 }))
    + g('player', band(cx, cy, 412, 476, 167, 13, { cls: 'cz-area' }) + arcText(cx, cy, 436, 167, 13, label.player, { size: 26 }));
}

/** The table's outline: the half-moon, or a tall rounded table for phones. */
function outline(tall) {
  if (!tall) return tableRail(1000, 560, 30);
  const { w, h } = TALLG;
  const edge = `M${w - 10} 30 V${h - 60} Q${w - 10} ${h - 10} ${w - 60} ${h - 10} H60 Q10 ${h - 10} 10 ${h - 60} V30`;
  return { d: `${edge} Z`, edge };
}

/** The scorecard: counts for the shoe and a bead plate, six rows deep, newest column last. */
export function roadSVG(road, { x, y, cols, cell, countY }) {
  const c = engine.roadCounts(road);
  const rows = 6;
  const shown = Math.max(0, Math.ceil(road.length / rows) - cols) * rows;
  const left = x - (cols * cell) / 2;
  const grid = rect(left, y, cols * cell, rows * cell, { cls: 'bc-plate', r: 4 });
  const beads = road.slice(shown).map((r, i) => {
    const bx = left + Math.floor(i / rows) * cell + cell / 2, by = y + (i % rows) * cell + cell / 2;
    const L = r.winner[0].toUpperCase();
    return `${circle(bx, by, cell * 0.42, { cls: `bc-bead ${r.winner}` })}${text(bx, by + 0.5, L, { size: Math.round(cell * 0.56), weight: 800, cls: 'bc-bead-tx' })}`;
  }).join('');
  const counts = text(x, countY, road.length ? `Player ${c.player} · Banker ${c.banker} · Tie ${c.tie}` : 'Scorecard: a new shoe', { size: 14, cls: 'cz-tx dim' });
  return `<g class="bc-road" aria-label="Scorecard: Player ${c.player}, Banker ${c.banker}, Tie ${c.tie} this shoe">${counts}${grid}${beads}</g>`;
}

/** The parts that change during play: hand labels with totals, chips, results, the scorecard. */
export function dynSVG({ tall = false, opts = {}, amounts = {}, totals = {}, outcome = null, road = [], winner = null } = {}) {
  const g = geo(tall);
  const labels = ['player', 'banker'].map((side) => {
    const h = g.hands[side];
    const t = totals[side];
    const win = winner === side || winner === 'tie';
    const tx = t == null ? '' : `${circle(h.x + 66, g.labelY, 17, { cls: `bc-total${win ? ' win' : ''}` })}${text(h.x + 66, g.labelY + 1, String(t), { size: 20, weight: 800, cls: 'bc-total-tx' })}`;
    return `${text(h.x, g.labelY, side.toUpperCase(), { size: 18, weight: 700, cls: `cz-tx${win ? '' : ' dim'}`, attrs: 'letter-spacing="2"' })}${tx}`;
  }).join('');
  const chips = Object.keys(SPOTS).map((key) => {
    const at = chipAt(tall, key);
    const line = outcome?.[key];
    const amount = amounts[key] ?? line?.stake ?? 0;
    if (!amount) return '';
    const res = line ? text(at.tx, at.ty ?? at.y, line.outcome === 'win' ? `+${money(line.returned - line.stake)}` : line.outcome === 'push' ? 'Push' : `−${money(line.stake)}`,
      { size: 18, weight: 800, cls: `bc-res ${line.outcome}`, anchor: tall ? 'end' : 'middle' }) : '';
    return `<g class="bc-chip${line?.outcome === 'lose' ? ' lost' : ''}">${chipSVG(at.x, at.y, at.r, amount)}</g>${res}`;
  }).join('');
  const roadPart = opts.scorecard === false ? '' : roadSVG(road, g.road);
  return `${labels}${roadPart}${chips}`;
}

/** The whole table as SVG (the shell's tests draw it with no arguments). */
export function layout(opts = {}, view = {}) {
  const tall = Boolean(view.tall);
  const g = geo(tall);
  const { d, edge } = outline(tall);
  const slots = ['player', 'banker'].map((side) => [0, 1, 2].map((i) => {
    const at = cardAt(tall, side, i);
    return at.rot ? rect(at.x - at.w * 0.7, at.y - at.w / 2, at.w * 1.4, at.w, { cls: 'cz-slot', r: 4 }) : cardSlot(at.x, at.y, at.w);
  }).join('')).join('');
  const dressing = tall
    ? crest(300, 22 - 220 / (900 / 413), 220, 'Baccarat')
    : tableCrest('Baccarat');
  const body = `${railBand(edge, d, g.w, g.h)}${path(d, { cls: 'cz-rail' })}${dressing}
    ${shoe(g.shoe.x, g.shoe.y)}${discardTray(g.tray.x, g.tray.y)}${slots}${betAreas(tall, opts)}
    <g class="bc-dyn">${dynSVG({ ...view, tall, opts })}</g>`;
  return svg(g.w, g.h, body, { label: 'Baccarat table: Player and Banker hands at the top, the scorecard, then the Tie, Banker and Player bets', top: g.top, cls: `bc-table ${tall ? 'tall' : 'wide'}` });
}

// ------------------------------------------------------------------ the table in play
let table = null;            // engine state (shoe, scorecard): kept while the page is open
let root = null, ctx = null, bets = null, layer = null, mq = null, tall = false;
let busy = false, token = 0;
let shown = null;            // { coup, n: cards on the table, totals, winner, outcome }

const wait = (ms) => new Promise((r) => setTimeout(r, ctx?.reduced() ? 0 : ms));
const svgEl = () => root?.querySelector('.cz-stage > svg');

function view() {
  return {
    tall, amounts: bets?.locked ? (shown?.amounts ?? {}) : (bets?.amounts() ?? {}),
    totals: shown?.totals ?? {}, outcome: shown?.outcome ?? null, winner: shown?.winner ?? null,
    // the scorecard already holds the coup being dealt: keep it back until the cards are out
    road: (busy ? table?.road.slice(0, -1) : table?.road) ?? [],
  };
}

function draw() {
  const el = svgEl()?.querySelector('.bc-dyn');
  if (el) el.innerHTML = dynSVG({ ...view(), opts: ctx.opts });
}

/** Draw the table (again) for the current width, with the cards that are out. */
function build() {
  if (!root) return;
  tall = mq?.matches ?? false;
  layer?.destroy();
  const stage = root.querySelector('.cz-stage');
  stage.innerHTML = layout(ctx.opts, view());
  const g = geo(tall);
  layer = ctx.cards(stage, svgEl(), { from: g.shoe, label: 'Player and Banker hands' });
  if (shown) placeShown();
}

/** The order cards come out of the shoe: P, B, P, B, then any third cards. */
function dealOrder(coup) {
  const out = [['player', 0], ['banker', 0], ['player', 1], ['banker', 1]];
  if (coup.player[2]) out.push(['player', 2]);
  if (coup.banker[2]) out.push(['banker', 2]);
  return out;
}

function placeShown() {
  const { coup, n } = shown;
  dealOrder(coup).slice(0, n).forEach(([side, i]) => layer.place(`${side}${i}`, coup[side][i], cardAt(tall, side, i)));
  markWinner();
}
function markWinner() {
  if (!shown?.winner) return;
  for (const side of ['player', 'banker']) shown.coup[side].forEach((_, i) => layer.mark(`${side}${i}`, 'win', shown.winner === side));
}

const partTotal = (cardsOut) => engine.handTotal(cardsOut);

async function reveal(r, release, amounts) {
  const my = token;
  const live = () => my === token && root;
  const g = geo(tall);
  if (layer && layer.ids().length) await layer.gather(g.tray);
  if (!live()) return;
  shown = { coup: r.coup, n: 0, totals: {}, winner: null, outcome: null, amounts };
  draw();
  if (r.shuffled) {
    ctx.play('shuffle');
    ctx.message('Shuffling a fresh shoe…');
    await wait(700);
    if (!live()) return;
  }
  ctx.message('No more bets…');
  const order = dealOrder(r.coup);
  for (let k = 0; k < order.length; k++) {
    const [side, i] = order[k];
    if (k >= 4) {
      await wait(450);
      if (!live()) return;
      ctx.message(`${SIDE[side]} draws a third card.`);
    }
    ctx.play('card');
    shown.n = k + 1;
    await layer.deal(`${side}${i}`, r.coup[side][i], cardAt(tall, side, i));
    if (!live()) return;
    if (k >= 3) {
      const out = (s) => order.slice(0, k + 1).filter(([x]) => x === s).map(([x, j]) => r.coup[x][j]);
      shown.totals = { player: partTotal(out('player')), banker: partTotal(out('banker')) };
      draw();
    }
    await wait(120);
    if (!live()) return;
  }
  await wait(300);
  if (!live()) return;
  finish(r, release);
}

function finish(r, release) {
  const { coup, result } = r;
  shown.winner = coup.winner;
  shown.outcome = Object.fromEntries(result.lines.map((l) => [l.key, l]));
  markWinner();
  release();
  bets.release();
  busy = false;
  draw();
  const head = coup.winner === 'tie' ? `Tie, ${coup.pTotal} all` : `${SIDE[coup.winner]} wins, ${Math.max(coup.pTotal, coup.bTotal)} to ${Math.min(coup.pTotal, coup.bTotal)}`;
  const nat = coup.natural ? ' (a natural)' : '';
  if (result.net > 0) {
    ctx.play('win');
    ctx.banner(`${head} · You win ${money(result.net)}`, { tone: 'win', detail: `${money(result.returned)} back from ${money(result.wagered)} bet` });
  } else if (result.net === 0) {
    ctx.play('chips');
    ctx.banner(`${head} · Push`, { tone: 'push', detail: `Your ${money(result.wagered)} comes back` });
  } else {
    ctx.play('lose');
    ctx.banner(head, { tone: 'lose', detail: result.returned ? `${money(result.returned)} back from ${money(result.wagered)} bet` : `The house takes ${money(result.wagered)}` });
  }
  ctx.message(`${head}${nat}. Bet ${money(result.wagered)} · Paid ${money(result.returned)} · Net ${result.net > 0 ? '+' : ''}${money(result.net)}. ${engine.shoeDue(table) ? 'The cut card is out: a new shoe next round. ' : ''}Place your bets for the next coup.`);
  ctx.checkBroke();
}

function action() {
  if (busy || !bets) return;
  bets.commit((amounts, release) => {
    busy = true;
    // settled at once (bank paid, hand recorded); the deal on screen only reveals it
    const r = engine.playRound(table, amounts, ctx.rng, ctx.opts);
    table = r.state;
    ctx.settle({ returned: r.result.returned });
    reveal(r, release, amounts);
  }, { hold: true });
}

const onResize = () => { if (!busy) build(); else ctx.after(50, onResize); };

export default {
  id: 'baccarat',
  name: 'Baccarat',
  ready: true,
  css: 'css/casino/baccarat.css',
  layout,
  settings: engine.OPTIONS,
  minBuyIn: engine.minBuyIn,
  howto: {
    goal: 'Bet on which hand will finish closer to 9: the <b>Player</b> or the <b>Banker</b>. Or bet that they <b>tie</b>. You make no other choices; the cards play themselves.',
    deal: [
      'The cards come from a shoe of eight decks (six as an option). The cut card sits 14 cards from the end; when it comes out, that round finishes and a fresh shoe is shuffled.',
      'Two cards each go to the Player and the Banker: Player, Banker, Player, Banker.',
    ],
    play: [
      'Aces count 1, tens and face cards 0, every other card its number. Only the last digit of the total counts: 7 + 8 = 15 counts as 5.',
      'If either hand has 8 or 9 on its first two cards (a <b>natural</b>), nobody draws.',
      'Otherwise the Player draws a third card on 0 to 5 and stands on 6 or 7.',
      'If the Player stood, the Banker draws on 0 to 5 and stands on 6 or 7. If the Player drew, the Banker draws by this table: on 0, 1 or 2 always; on 3 unless the Player\'s third card was an 8; on 4 when it was 2 to 7; on 5 when it was 4 to 7; on 6 when it was 6 or 7; on 7 never.',
      'No hand ever has more than three cards.',
    ],
    fig: { cards: '9S 4H · KD 7C', caption: 'Player 3 (9 + 4 = 13) draws a third card. Banker 7 stands.' },
    score: [
      '<b>Player</b> pays 1 to 1.',
      '<b>Banker</b> pays 1 to 1 less a 5% commission, rounded down to whole dollars: a $5 Banker win pays $4, $20 pays $19.',
      '<b>Tie</b> pays 8 to 1 (9 to 1 as an option). On a tie, Player and Banker bets push: they come back to you.',
      'You may bet on more than one box. Each bet must be at least the table minimum and at most the table maximum.',
      'The house edge: Banker about 1.06%, Player 1.24%, Tie about 14.4% (8 to 1).',
    ],
    options: {
      decks: 'eight or six decks in the shoe; a change starts a new shoe at the next round.',
      tie: 'what a winning Tie bet pays: 8 to 1 or 9 to 1.',
      scorecard: 'shows the bead plate of results for the current shoe (red B for Banker, blue P for Player, green T for a tie) with the counts. It\'s just for fun: cards have no memory.',
    },
    controls: 'Pick a chip on the rack, then {click} Player, Banker or Tie to put it there; {click} again to add more. Right-click, shift-click or a long press takes a chip off. Enter or Space deals; number keys 1 to 8 pick a chip, Backspace undoes, C clears, R rebets and Shift+R rebets double.',
    tip: 'Banker is the best bet on the table, even after the commission. The scorecard is for fun: the cards have no memory.',
  },

  mount(el, c) {
    root = el; ctx = c;
    token++;
    busy = false;
    shown = null;
    if (!table) table = engine.init({ opts: ctx.opts, rng: ctx.rng });
    el.innerHTML = '<div class="cz-stage bc-stage"></div>';
    mq = matchMedia(TALL);
    mq.addEventListener('change', onResize);
    bets = ctx.bets({
      root: el,
      spot: (key) => (engine.isSpot(key) && !busy ? { label: SPOTS[key] } : null),
      validate: (amounts) => engine.checkBets(amounts, ctx.stakes),
      onChange: () => { if (!busy && shown?.outcome) { shown.outcome = null; shown.amounts = null; } draw(); },
    });
    build();
    ctx.message(`Bet on Player, Banker or Tie: ${ctx.stakesText}. Then Deal.`);
  },
  unmount() {
    // a round in progress was settled when it was dealt: just drop the reveal
    token++;
    busy = false;
    mq?.removeEventListener('change', onResize);
    layer?.destroy();
    if (root) root.innerHTML = '';
    root = null; bets = null; layer = null; shown = null;
  },
  action,
  optionsChanged() { if (!busy) build(); },
};
