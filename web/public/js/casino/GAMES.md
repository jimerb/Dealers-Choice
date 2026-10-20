# Building a casino game

This is the guide for whoever builds one of the casino's games. The casino page (`casino.html`)
already has the chooser, the bank, the bet bar, the chip rack, dialogs, keyboard shortcuts, the
credit meter for machines and a card layer. A game plugs into it by exporting one module. You should
never need to change a shared file; if you do, stop and tell the coordinator what you need.

## Which files are yours

For a game with id `<id>` (the ids are in `catalog.js`: `blackjack`, `craps`, `baccarat`,
`three-card-poker`, `let-it-ride`, `caribbean-stud`, `pai-gow-poker`, `video-poker`, `slots`, `keno`):

| File | What goes in it |
|---|---|
| `js/casino/games/<id>.js` | the game module: view, How to play, options (it replaces the stub) |
| `js/casino/engines/<id>.js` (and `engines/<id>-*.js`) | the rules, with no DOM |
| `css/casino/<id>.css` | the game's own styles (loaded when the game opens) |
| `web/test/<id>*.test.mjs` | the game's tests |

Everything else is shared: `ui.js`, `chips.js`, `svg.js`, `art.js`, `tableart.js`, `pokertable.js`,
`stub.js`, `catalog.js`, `games/index.js`, `kit/*`, `css/casino.css`, `casino.html`, `core/*`.
Import from them freely; don't edit them. Several games are built at the same time, and shared files
are where they would collide.

`games/index.js` loads `games/<id>.js` by its id, so a new module is picked up with no registration.

## The two halves: engine and module

**The engine** (`engines/<id>.js`) is the rules as plain functions of plain data. No DOM, no
`Math.random`, no `crypto`, no bank. It is what the tests drive. The suggested shape:

```js
// engines/<id>.js
export const OPTIONS = [{ key: 'h17', label: 'Dealer hits soft 17', type: 'check', default: false }];
export function minBuyIn(stakes, opts) { return stakes.min; }      // what a round needs at least
export function init({ opts, stakes, rng }) { return { phase: 'bet', ... }; }
export function legal(state) { return [{ type: 'hit' }, { type: 'stand' }]; }
export function step(state, action, { rng }) {
  const s = structuredClone(state);     // never change the state you were given
  ...
  return {
    state: s,
    cash: [{ kind: 'stake', amount: 10, spot: 'main' }],   // see "Money" below
    fx: ['card'],                                           // sound names to play
    log: ['Dealer shows an ace'],                           // lines for the message bar
    done: { wagered: 20, won: 40 },                         // only when the round is decided
  };
}
// Illegal actions throw new Error('message the player can read').
```

State must be JSON-serializable (a shoe from `kit/shoe.js` is). Engines must be deterministic for a
given rng: tests pass `seededRng(n)` or `riggedRng([...])`.

**The module** (`games/<id>.js`) default-exports an object:

```js
export default {
  id: '<id>', name: 'Blackjack',   // must match the catalog
  ready: true,                     // false keeps the "Being built" badge; set true when it plays
  howto,                           // How to play: an HTML string (stub.js howtoSections) or a
                                   // core/howto.js object { goal, deal, play, score, options, controls, tip }
  settings: [...],                 // optional house rules, same shape as the engine's OPTIONS
  credits: false,                  // true for a credit machine (Video Poker, Slots): see Machines
  css: 'css/casino/<id>.css',      // optional, loaded once when the game first opens
  layout(opts) { return svgString; },   // the table as SVG, no DOM (tests draw it in Node)
  minBuyIn(stakes, opts) {},       // optional: the broke check uses it (default stakes.min)
  mount(el, ctx) {},               // draw into the felt `el`, start listening
  unmount() {},                    // stop timers and listeners, empty `el`
  action() {},                     // the bet bar's main button (Deal, Spin, Roll, Draw, Play)
  // optional; without them Clear, Rebet and Undo go to your ctx.bets() helper:
  clear() {}, rebet(times) {}, undo() {},
  hideButtons: ['rebet'],          // optional: bet-bar buttons the game never uses are not shown
                                   // (machines hide Undo, Clear and Rebet by default)
  optionsChanged(opts) {},         // optional: the player saved new options (apply next round)
  optionsShown(opts) {},           // optional: the values the Options form opens with (a preset's own rules)
  optionsInput(key, form) {},      // optional: a field changed in the form; return { key: value } to set
                                   // other fields (a preset fills in its rules; a rule makes it Custom)
  bannerAt: 'middle',              // optional: where the result banner sits ('top', 'middle', 'bottom')
};
```

`mount` and `unmount` may be called many times (the player comes and goes). Keep per-visit state in
variables you reset in `mount`.

## ctx: what the shell hands to mount()

| Member | What it does |
|---|---|
| `ctx.game` | the catalog entry (`id`, `name`, `action` label, `machine`, ...) |
| `ctx.stakes` | `{ id, min, max }` (max `null` = no limit); machines also `denom` |
| `ctx.stakesText` | the stakes in words, for messages |
| `ctx.opts` | current option values (from `settings`), re-read when the player saves |
| `ctx.rng` | the fair rng (`kit/rng.js` `cryptoRng`): pass it to your engine |
| `ctx.bank` | the shared bank (read `ctx.bank.balance`; move money only through the calls below) |
| `ctx.chip()` | the chip picked on the rack |
| `ctx.play(name)` | a sound: `chips`, `card`, `deal`, `flip`, `shuffle`, `win`, `lose`, `error`, `click`, `score` ... |
| `ctx.message(text)` | the message line under the felt (read out by screen readers) |
| `ctx.banner(title, { tone, detail, at, ms })` | the result banner over the felt; tone `win`, `lose`, `push` or `info`; `at` `'top'` (over the crest), `'middle'` or `'bottom'` (over the betting area; default: the module's `bannerAt`, else middle); it fades after `ms` (default 4500; `0` keeps it). `ctx.banner(null)` hides it. Placing a chip hides it too |
| `ctx.toast(text)` | a short note at the bottom of the screen |
| `ctx.setTotal(n, { staged, debit })` | the bet total in the bet bar (the bets helper does this for you); with `staged` it also shows "Bank after bet", taking `debit` (default `n`) off the bank |
| `ctx.saveOpt(key, value)` / `ctx.saveOpt({ ... })` | save options the game changed itself (a preset filling in its rules, a machine picked beside the cabinet); `ctx.opts` follows. Never write `dc.casino.opts.*` yourself |
| `ctx.bigWin(title, detail)` | the big-win card, shown once the reveal is over (the shell already shows it for a table round that nets 50× the table minimum, and a machine round that nets 100 credits) |
| `ctx.setButtons({ action, clear, rebet, undo, label })` | enable or disable the bet bar's buttons; `label` renames the main one ("Draw") |
| `ctx.actions([...])` | your own buttons above the bet bar (see below) |
| `ctx.setActions({ id: true \| false \| {...} })` | enable/disable/hide/relabel them |
| `ctx.keys({ key: fn })` | extra keyboard shortcuts (single letters are matched lower-case) |
| `ctx.showRack(bool)` | show or hide the chip rack |
| `ctx.bets(spec)` | staged chips on your layout's spots (see below) |
| `ctx.wager / refund / pay / settle / apply / setReturnable / onTable` | the round's money (see Money) |
| `ctx.machine` | the credit meter, only when the module has `credits: true` (see Machines) |
| `ctx.cards(stage, svg, opts)` | a card layer over your SVG (see Cards) |
| `ctx.holdBank()` | keep the bank pill showing its old figure; returns `release()` |
| `ctx.checkBroke()` | after a round: offers a loan / reset / leave if the bank can't cover `minBuyIn` |
| `ctx.after(ms, fn)`, `ctx.cancel(t)` | a timeout that is cancelled for you when the game closes |
| `ctx.reduced()` | true when the player asked for reduced motion: skip or shorten animations |
| `ctx.live` | false once the game has closed (every ctx call is then a no-op) |

## Bets on spots: ctx.bets()

Give each betting area in your SVG an attribute with its key (`data-spot="ante"` is the default
attribute; roulette uses `data-bet`). Then:

```js
bets = ctx.bets({
  root: el,                        // where the spots are
  attr: 'data-spot',               // the attribute that names a spot
  spot: (key) => phase === 'bet' && SPOTS[key] ? { label: SPOTS[key], min: ctx.stakes.min, max: ctx.stakes.max } : null,
  validate: (amounts) => (amounts.play && !amounts.ante ? 'Play needs an Ante.' : null),   // optional
  onChange: (amounts) => draw(),   // redraw your chips (chipSVG from chips.js)
  autoButtons: true,               // the helper keeps Clear/Undo/Rebet/main button in step (default)
});
```

`spot(key)` returns `null` for a spot that can't take chips now. `min`/`max` default to the table's.
Clicking a spot adds the picked chip; right-click, shift-click, a long press or Remove mode take one
off. The helper checks the bank and the spot maximum at placement, keeps Undo history, and offers to
raise a spot that is under its minimum when you commit.

```js
action() {
  bets.commit((amounts, release) => {   // limits checked, total debited, layout saved for Rebet, spots locked
    state = engine.deal(amounts, ctx.rng) ...
  }, { hold: true });                   // hold: the bank pill keeps its old figure until release()
}
// when the round is over and its chips are cleared away:
bets.release();
```

Also: `bets.amounts()`, `bets.total()` (the staged chips), `bets.cost()` (what committing takes),
`bets.shown()` (the bet bar's figure), `bets.place(key, n)`, `bets.remove(key, n)`, `bets.lock()`,
`bets.sync()`.

**When a bet is not just its chips.** `cost: (amounts) => dollars` says what a staged layout takes
from the bank when it is committed, if that is not the sum of the spots. Let It Ride stages one stack
that goes out three times (`cost: (a) => 3 * (a.base ?? 0)`); Caribbean Stud's $1 bonus is not a
chip but rides with the Ante (`cost: (a) => (a.ante ?? 0) + bonus`). The bank check at placement,
Rebet, the bet bar, "On the felt" and `commit` (which takes the whole cost) all follow it.
`withTable: true` makes the bet bar and "On the felt" count the bets already up as well as the
staged chips (craps). Rebet fits as much of the last layout as the bank allows and says so with a toast;
Shift+R doubles it. Bets that are added during a round (Double, Split, Play, odds) are not staged
chips: take them with `ctx.wager()` and draw them yourself.

## Money: one rule for every game

1. **A bet leaves the bank when it is committed** (Deal, Spin, Roll, Double, Split, Play):
   `ctx.wager(n)` (false if the bank can't cover it; nothing changes). `bets.commit` does this for
   the staged chips.
2. **When the round is decided, settle at once, before any animation**:
   `ctx.settle({ returned })` records the hand and pays `returned` (stakes plus winnings, whole
   dollars, rounded down). A reload or leaving during the reveal then never loses a payout. Use
   `ctx.holdBank()` (or `commit(..., { hold: true })`) so the pill doesn't give the result away,
   and call `release()` when the reveal ends.
3. **A bet taken down** (Let It Ride pull back, craps take-down) goes back with `ctx.refund(n)`.
4. **Craps-style partial settling**: `ctx.settle({ returned, wagered, returnable })` settles only
   `wagered` dollars of what is on the table.
5. **Leaving mid-round**: bets marked `ctx.wager(n, { returnable: true })` (or covered by
   `ctx.setReturnable(n)`) come back; everything else on the table is forfeited after the player
   confirms "Leave now? You'll forfeit $35 on the table." The shell does all of this; just keep
   `returnable` honest.

An engine can describe all of this as data, and `ctx.apply(result)` runs it:
`cash: [{ kind: 'stake' | 'vig', amount, returnable? }, { kind: 'refund', amount }, { kind: 'pay', amount }]`,
`done: { wagered, won }` settles, `returnable: n` updates what leaving would hand back. Every debit
is checked first; if the bank can't cover them, `apply` returns `{ ok: false, error }` and changes
nothing (keep your old state).

`kit/round.js` (`createRound(bank, id)`) is the same thing without the shell, for engine tests
against a bank made with `createBank({ storage: memoryStorage, win: null })`.

**Bank news is the shell's.** A tier climbed ("Welcome to Gold"), the Hall of Fame moment, a loan
repaid and the big-win card all wait for `release()` (or `ctx.machine.hold()`'s release), so they
never spoil a reveal: hold the bank before you settle. When the saved bank comes from a newer version
of the casino (another tab after an update), the bank is read-only: `ctx.wager` and `bets.commit`
fail and the shell says why; nothing for a game to do.

## Your own buttons

```js
ctx.actions([
  { id: 'hit', label: 'Hit', key: 'h', primary: true, run: () => act('hit') },
  { id: 'stand', label: 'Stand', key: 's', run: () => act('stand') },
  { id: 'double', label: 'Double', key: 'd', run: () => act('double') },
  { id: 'split', label: 'Split', key: 'p', hidden: true, run: () => act('split') },
  { id: 'hint', label: 'Hint', small: true, run: showHint },
]);
ctx.setActions({ hit: true, stand: true, double: canDouble, split: { hidden: !canSplit } });
ctx.actions([]);   // none (betting phase)
```

Each button can have `primary`, `small`, `title`, `pressed` (a toggle, e.g. Hold) and `key`. Keys run
only while the button is shown and enabled; a hidden or disabled button's key goes on to the shell, so
an action may share a letter with a shell key (Caribbean Stud's Raise is R: it raises during a hand,
and R rebets between hands). The bet bar's main button keeps working too; set it with
`ctx.setButtons({ action: true, label: 'Draw' })`.

## Keyboard (handled by the shell)

`1`–`8` pick a chip; arrow keys move along the rack; `Enter`/`Space` press the main button (unless
focus is on another control); `C` Clear; `R` Rebet (`Shift+R` doubled); `Backspace` Undo. Your action
keys and `ctx.keys()` are checked first, so a machine can use `1`–`5` for Hold. Keys do nothing while
a dialog is open or the focus is in a text box. List your keys in How to play.

## Machines (credits: true)

Video Poker and Slots play on credits. The shell shows the credit meter with **Insert bills** and
**Cash out** in place of the chip rack, cashes out automatically when the player leaves (or when the
page is next opened after being closed), blocks loans while credits sit in a machine, and only one
machine can hold credits at a time. In the game:

```js
if (!ctx.machine.bet(coins)) return;   // false if the meter is short (it offers Insert bills)
const won = payTable(...) * coins;      // credits
ctx.machine.pay(won);                   // onto the meter; the round is recorded in dollars
```

Between `bet` and `pay` the bet is at risk if the player leaves (they are asked first). Also
`ctx.machine.credits`, `ctx.machine.denom`, `ctx.machine.insert()`, `ctx.machine.cashOut()`.

A machine pays at once and then shows the result (reels stopping, cards turning). So that the shell's
credit meter doesn't give the result away, hold it:

```js
if (!ctx.machine.bet(coins)) return;
const release = ctx.machine.hold();     // the meter (and Cash out) keep the figure shown now
ctx.machine.pay(won);
// ... the reveal ...
release();                              // the meter catches up; a big-win card shows now
```

`ctx.machine.onChange(fn)` calls `fn(credits)` whenever the meter changes (bills in, cash out,
another window); it stops listening when the game closes. Don't write to `#cz-credits` yourself.
Keno is not a credit machine: it takes dollars per game through `ctx.wager` / `ctx.settle`.

## Cards

Card games use the site's own faces and backs (`skin.js`), so they follow the player's card style.

```js
import { draw } from '../kit/shoe.js';
const stage = el.querySelector('.cz-stage');
const layer = ctx.cards(stage, stage.querySelector('svg'), { from: { x: 875, y: 80 } }); // the shoe
await layer.deal('p0', card, { x: 470, y: 400, w: 70 });   // layout units, centre of the card
await layer.deal('hole', null, { x: 530, y: 95, w: 70 });  // face down, no face yet
await layer.flip('hole', holeCard);
layer.mark('p0', 'win');   // classes: win, held, dim
await layer.gather();      // sweep to the discard tray and clear
```

Positions are in the SVG's own units, so cards line up with `cardSlot()` outlines. The layer covers
the drawing itself, wherever it sits in the SVG's box: when the shared height cap (or your CSS)
letterboxes the drawing, the cards still land on it, so a game needs no CSS of its own to size the
SVG for the card layer. A card is never
drawn narrower than `minWidth` (40 px), so they stay readable at 375 px (they overlap more instead).
With `clickable: true` each card is a button (Video Poker holds): listen for clicks on
`[data-card]`. Animations are skipped under reduced motion. The layer is removed when the game
closes.

## The kit (no DOM, use it in engines)

- `kit/rng.js`: `cryptoRng()`, `seededRng(seed)`, `riggedRng([ints])`, `shuffle(list, rng)`,
  `sample(list, k, rng)`, `rollDie(rng)`, `randomInt(n)`. An rng is `{ int(n), float() }`.
- `kit/shoe.js`: `newShoe({ decks, jokers, penetration, cutVariance }, rng)`, `draw`, `drawN`, `burn`,
  `needsShuffle` (between rounds only), `reshuffle`, `remaining`, `discards`, `stack(shoe, ['AS', '10H'])`
  for tests, `card('QS')`, `cards('AS KS QS')`. Cards are `{ id, rank, suit }` as in `core/cards.js`.
- `kit/poker.js`: `evaluate(cards, { wild: null | 'deuces' | 'joker' | 'bug' })`, `best5`,
  `evaluate3` (straight beats flush), `evaluate2`, `compare`, `describe`, `describe3`, `HAND`, `HAND3`,
  `score5` (fast path for enumerations), `combinations`.
- `kit/bets.js`: `createStaging(...)`, the staged-chip model behind `ctx.bets()`.
- `kit/round.js`: `createRound(bank, id)`, `createMachine(bank, id, denom)`.

## Drawing the table

Layouts are SVG strings built with `svg.js` (`svg`, `rect`, `circle`, `path`, `text`, `arcText`,
`cardSlot`, `spot`, `tableRail`, `seatAngles`, `polar`), dressed with `tableart.js` (`railBand`,
`tableCrest`, `shoe`, `discardTray`, `dieFace`, `puck`) and `pokertable.js` for the half-moon poker
tables. `pokerTable({ seats: 5, seat: 2, spotWrap(s, i, inner) })` draws only one seat's spots (a
single-seat table) and lets you wrap each spot's drawing (keys, roles, labels) instead of editing the
SVG string. Every number and word on a layout is live text drawn by code; pictures never carry text.
Chips on a spot: `chipSVG(cx, cy, r, amount)` from `chips.js`.

Pictures come from `art.js`: use `ART.<name>` paths and `svgArt(href, x, y, w, h, fallbackSVG)` /
`imgArt(src)`, which keep a code-drawn stand-in until the picture loads (and if it fails). Never
write an `assets/art/casino/...` path by hand; if you need a picture that isn't in `ART`, ask the
coordinator. A test checks that every picture the casino asks for exists.

## Fitting the screen

On a tablet or a computer the whole table, the message line and the bet bar fit on the screen, and
the table takes all the room that is left. The shell works this out and sets **`--cz-fit`** on
`#room`: the height (px) a drawing on the felt may take. An SVG straight inside `.cz-stage` is
capped to it already; size anything else that should grow with the screen from it, e.g.
`max-height: max(260px, var(--cz-fit, calc(100vh - 372px)))`. Extra things you put on the felt above
or below the drawing are allowed for: the shell measures and takes them off. Where the screen is
wide for its height, the shell puts the message, your buttons and the bet bar in a column beside
the felt (`#room.cz-side`) when that makes the biggest drawing on the felt bigger. Phones (640 px and
narrower) don't get `--cz-fit`: the page scrolls there, with the bet bar docked at the bottom.

## A tiny example game

A coin toss: bet on Heads or Tails, even money.

```js
// engines/coin.js
export function toss(rng) { return rng.int(2) ? 'heads' : 'tails'; }
export function settleToss(bets, side) { const stake = bets[side] ?? 0; return { returned: stake * 2 }; }

// games/coin.js
import { svg, spot, text } from '../svg.js';
import { chipSVG } from '../chips.js';
import { money } from '../../core/bank.js';
import { toss, settleToss } from '../engines/coin.js';

let root = null, ctx = null, bets = null;
export function layout(amounts = {}) {
  const side = (x, key, label) => spot(x, 140, 70, label, { key }) + (amounts[key] ? chipSVG(x, 140, 26, amounts[key]) : '');
  return svg(600, 280, side(170, 'heads', 'HEADS') + side(430, 'tails', 'TAILS') + text(300, 250, 'PAYS EVEN MONEY', { size: 18 }),
    { label: 'Coin toss: Heads or Tails' });
}
const draw = () => { root.querySelector('.cz-stage').innerHTML = layout(bets.amounts()); };

export default {
  id: 'coin', name: 'Coin Toss', ready: true, layout,
  howto: { goal: 'Call the coin.', deal: 'One toss per round.', play: 'Put chips on Heads or Tails, then Toss.',
    score: 'A winning bet pays even money.', options: 'None.', controls: '{Click} a side to bet. Enter tosses.' },
  mount(el, c) {
    root = el; ctx = c;
    el.innerHTML = '<div class="cz-stage"></div>';
    bets = ctx.bets({ root: el, spot: (k) => ({ label: k === 'heads' ? 'Heads' : 'Tails' }), onChange: draw });
    draw();
    ctx.message(`Place your chips: ${ctx.stakesText}.`);
  },
  unmount() { if (root) root.innerHTML = ''; root = null; bets = null; },
  action() {
    bets.commit((amounts, release) => {
      const side = toss(ctx.rng);
      const { returned } = settleToss(amounts, side);
      ctx.settle({ returned });           // paid now
      ctx.play('flip');
      ctx.after(ctx.reduced() ? 0 : 800, () => {   // the reveal
        release();
        bets.release();
        ctx.banner(side === 'heads' ? 'Heads' : 'Tails', { tone: returned ? 'win' : 'lose', detail: returned ? `You win ${money(returned / 2)}` : 'The house wins' });
        ctx.play(returned ? 'win' : 'lose');
        ctx.checkBroke();
      });
    }, { hold: true });
  },
};
```

## Testing

- Engine tests in `web/test/<id>*.test.mjs` (Node's test runner; `npm test` in `web/`). Drive the
  engine with `seededRng` / `riggedRng` and `stack()`ed shoes. Cover every bet's payout, the phase
  rules, rounding down, and the return to player where the PRD gives one. Long simulations go behind
  `process.env.SLOW === '1'`.
- Money tests: run a round against `createBank({ storage, win: null })` with `createRound` and check
  the bank and `stats` afterwards.
- `web/test/casino.test.mjs` already checks that every module has the interface, draws its layout
  without `undefined` or `NaN`, and that every picture exists.

## Checklist before you say it's done

- [ ] `npm test` is green (all of it, not just your file).
- [ ] `ready: true` in your module, and `todo` removed or emptied.
- [ ] Played a full round to settlement at 1280×800 and at 375 px wide: the pill and Stats agree.
- [ ] Left mid-round: the confirm appears when something is at risk; returnable bets come back.
- [ ] Keyboard: chips, Enter, C, R, Backspace and your own keys work; focus never gets lost.
- [ ] Reduced motion: no long animations.
- [ ] How to play explains the rules, payouts and your keys, in plain English.
- [ ] No console errors; nothing changed outside your own files.
