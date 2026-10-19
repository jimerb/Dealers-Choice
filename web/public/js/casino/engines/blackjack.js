// Blackjack rules, with no DOM: a shoe, one player spot (split into up to four hands), the dealer's
// hand, insurance, double, split, late surrender and settlement. Plain JSON state; every step returns
// a new state plus the money it moves (see js/casino/GAMES.md).
//
//   let s = init({ opts, rng });
//   ({ state: s } = step(s, { type: 'deal', bet: 10 }, { rng }));
//   legal(s, { bank })   -> [{ type: 'hit' }, { type: 'stand' }, ...]
//   step(s, { type: 'hit' }, { rng }) ...
//
// Phases: 'bet' (nothing dealt yet) -> 'insurance' (dealer shows an ace) -> 'play' -> 'over'.
// A new round can be dealt from 'bet' or 'over'. The dealer's turn runs inside the step that ends
// the player's last hand, so a round always settles in one step (done: { wagered, won }).
//
// Money: the main bet is described as cash { kind: 'stake', why: 'bet' } on the deal (the view has
// usually taken it already with its staged chips); doubles, splits and insurance are stakes taken
// when they are made; everything is paid back in one go when the round is decided.
import { newShoe, reshuffle, draw, burn, needsShuffle, remaining } from '../kit/shoe.js';
import { shuffle } from '../kit/rng.js';

export const PRESETS = {
  strip: { label: 'Las Vegas Strip', decks: 6, h17: false, double: 'any', das: true, splits: 3, rsa: false, surrender: 'never' },
  downtown: { label: 'Downtown Vegas', decks: 2, h17: true, double: 'any', das: true, splits: 3, rsa: false, surrender: 'never' },
  ac: { label: 'Atlantic City', decks: 6, h17: false, double: 'any', das: true, splits: 3, rsa: false, surrender: 'late' },
  reno: { label: 'Reno', decks: 2, h17: true, double: '10-11', das: false, splits: 3, rsa: false, surrender: 'never' },
};
/** The option keys a preset sets. */
export const RULE_KEYS = ['decks', 'h17', 'double', 'das', 'splits', 'rsa', 'surrender'];

export const OPTIONS = [
  { key: 'preset', label: 'Rules', type: 'select', default: 'strip',
    options: [...Object.entries(PRESETS).map(([k, p]) => [k, p.label]), ['custom', 'Custom']] },
  { key: 'decks', label: 'Number of decks', type: 'select', default: 6, options: [[1, '1 deck'], [2, '2 decks'], [4, '4 decks'], [6, '6 decks']] },
  { key: 'h17', label: 'Dealer hits soft 17', type: 'check', default: false },
  { key: 'double', label: 'Double down on', type: 'select', default: 'any',
    options: [['any', 'Any two cards'], ['9-11', '9, 10 or 11'], ['10-11', '10 or 11'], ['11', '11 only'], ['hard', 'Hard hands only']] },
  { key: 'das', label: 'Double after split', type: 'check', default: true },
  { key: 'splits', label: 'Splitting', type: 'select', default: 3, options: [[0, 'Never'], [1, 'Once (2 hands)'], [3, 'Up to 3 times (4 hands)']] },
  { key: 'rsa', label: 'Resplit aces', type: 'check', default: false },
  { key: 'surrender', label: 'Surrender', type: 'select', default: 'never', options: [['never', 'Never'], ['late', 'Late surrender']] },
  { key: 'insurance', label: 'Offer insurance', type: 'check', default: true },
  { key: 'pen', label: 'Reshuffle after', type: 'select', default: 'auto',
    options: [['auto', 'Standard (75%; one deck 65%)'], ...[50, 55, 60, 65, 70, 75, 80, 85].map((p) => [p, `${p}% of the shoe`])] },
  { key: 'totals', label: 'Show hand totals', type: 'check', default: true },
  { key: 'count', label: 'Show the card count (running and true)', type: 'check', default: false },
];

export const DEFAULTS = Object.fromEntries(OPTIONS.map((o) => [o.key, o.default]));

/** The rules in force for a set of option values: a preset (other than Custom) sets the rule keys. */
export function rulesFrom(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const preset = PRESETS[o.preset];
  const r = { ...o, ...(preset ? Object.fromEntries(RULE_KEYS.map((k) => [k, preset[k]])) : {}) };
  r.decks = Number(r.decks) || 6;
  r.splits = Number(r.splits) || 0;
  r.penetration = r.pen === 'auto' || !Number(r.pen) ? (r.decks === 1 ? 0.65 : 0.75) : Number(r.pen) / 100;
  return {
    decks: r.decks, h17: Boolean(r.h17), double: r.double, das: Boolean(r.das), splits: r.splits, rsa: Boolean(r.rsa),
    surrender: r.surrender === 'late' ? 'late' : 'never', insurance: Boolean(r.insurance), penetration: r.penetration,
  };
}

// ------------------------------------------------------------------ cards and totals
export const cardValue = (c) => (c.rank === 'A' ? 11 : ['K', 'Q', 'J'].includes(c.rank) ? 10 : Number(c.rank));
/** Hi-Lo tag: 2-6 +1, 7-9 0, tens and aces -1. */
export const hiLo = (c) => { const v = cardValue(c); return v <= 6 ? 1 : v >= 10 ? -1 : 0; };

/** { total, soft }: the best total, soft when an ace still counts 11. */
export function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { const v = cardValue(c); total += v; if (v === 11) aces++; }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}
export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

/** A hand's total in words: "Soft 17", "20", "Bust (24)", "Blackjack". */
export function describe(cards, { natural = true } = {}) {
  if (!cards.length) return '';
  const { total, soft } = handValue(cards);
  if (natural && isBlackjack(cards)) return 'Blackjack';
  if (total > 21) return `Bust (${total})`;
  return soft && total < 21 ? `Soft ${total}` : String(total);
}

// ------------------------------------------------------------------ state
const newHand = (bet, cards = [], extra = {}) => ({ cards, bet, doubled: false, split: false, aces: false, done: false, result: null, returned: 0, ...extra });

export function init({ opts = {}, rng } = {}) {
  const rules = rulesFrom(opts);
  const shoe = newShoe({ decks: rules.decks, penetration: rules.penetration }, rng);
  burn(shoe, 1);
  return {
    phase: 'bet', rules, shoe,
    hands: [], active: 0, dealer: [], holeShown: false,
    insurance: 0, insuranceOffered: false, peeked: false,
    count: 0, // Hi-Lo running count of the cards the player has seen since the shuffle
    round: 0, shuffled: true, result: null,
  };
}

/** A copy safe to change (shoe cards are never changed in place, so they are shared). */
function clone(s) {
  return {
    ...s, rules: { ...s.rules }, shoe: { ...s.shoe }, dealer: [...s.dealer],
    hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })), result: s.result && { ...s.result },
  };
}

/** Decks left in the shoe (for the true count). */
export const decksLeft = (s) => remaining(s.shoe) / 52;
/** The true count: running count per deck left, to one decimal. */
export const trueCount = (s) => Math.round((s.count / Math.max(0.5, decksLeft(s))) * 10) / 10;

// ------------------------------------------------------------------ what the player may do
const sameValue = (a, b) => cardValue(a) === cardValue(b);

function canDoubleHand(s, h) {
  if (h.cards.length !== 2 || h.aces || h.doubled) return false;
  if (h.split && !s.rules.das) return false;
  const { total, soft } = handValue(h.cards);
  switch (s.rules.double) {
    case '9-11': return !soft && total >= 9 && total <= 11;
    case '10-11': return !soft && total >= 10 && total <= 11;
    case '11': return !soft && total === 11;
    case 'hard': return !soft;
    default: return true;
  }
}
function canSplitHand(s, h) {
  if (h.cards.length !== 2 || !sameValue(h.cards[0], h.cards[1])) return false;
  if (s.hands.length >= s.rules.splits + 1) return false;
  if (h.aces && !s.rules.rsa) return false;
  return true;
}
const canSurrender = (s, h) => s.rules.surrender === 'late' && s.hands.length === 1 && !h.split && h.cards.length === 2;

/**
 * The actions open now. ctx.bank (dollars) disables Double and Split when the bank can't cover
 * another bet; those come back with { type, disabled: true, why }.
 */
export function legal(s, { bank = Infinity } = {}) {
  if (s.phase === 'bet' || s.phase === 'over') return [{ type: 'deal' }];
  if (s.phase === 'insurance') {
    const max = Math.min(Math.floor(s.hands[0].bet / 2), bank);
    return [...(max > 0 ? [{ type: 'insurance', max }] : []), { type: 'decline' }];
  }
  const h = s.hands[s.active];
  const out = [];
  if (!h.aces) out.push({ type: 'hit' });
  out.push({ type: 'stand' });
  const broke = bank < h.bet ? { disabled: true, why: 'Not enough in the bank' } : {};
  if (canDoubleHand(s, h)) out.push({ type: 'double', ...broke });
  if (canSplitHand(s, h)) out.push({ type: 'split', ...broke });
  if (canSurrender(s, h)) out.push({ type: 'surrender' });
  return out;
}
export const can = (s, type, ctx) => legal(s, ctx).some((a) => a.type === type && !a.disabled);

// ------------------------------------------------------------------ the round
function deal(s, rng) {
  if (!remaining(s.shoe)) {
    // a rare long round on a short shoe: shuffle the used cards (not those on the table) and go on
    const onTable = new Set([...s.dealer, ...s.hands.flatMap((h) => h.cards)].map((c) => c.id));
    s.shoe.cards = shuffle(s.shoe.cards.filter((c) => !onTable.has(c.id)), rng);
    s.shoe.pos = 0;
    s.shoe.cut = 0; // a full shuffle before the next round
    s.count = 0;
  }
  const c = draw(s.shoe);
  s.count += hiLo(c);
  return c;
}
/** The hole card: counted only when it is turned over. */
function revealHole(s) {
  if (s.holeShown || s.dealer.length < 2) return;
  s.holeShown = true;
  s.count += hiLo(s.dealer[1]);
}

/**
 * Apply an action. Throws Error (a sentence for the player) when the action isn't open now.
 * Returns { state, cash, fx, log, done? }.
 */
export function step(state, action, { rng } = {}) {
  const s = clone(state);
  const out = { state: s, cash: [], fx: [], log: [] };
  const type = action?.type;
  if (type === 'rules') return setRules(s, action.opts, rng, out);
  if (type === 'deal') return startRound(s, action, rng, out);
  const open = legal(s);
  if (!open.some((a) => a.type === type)) throw new Error(type === 'deal' ? 'Finish this hand first.' : `You can't ${type} now.`);
  if (type === 'insurance' || type === 'decline') return insure(s, type === 'insurance' ? action.amount : 0, out);
  const h = s.hands[s.active];
  switch (type) {
    case 'hit':
      h.cards.push(deal(s, rng));
      out.fx.push('card');
      if (handValue(h.cards).total >= 21) h.done = true;
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      out.cash.push({ kind: 'stake', amount: h.bet, why: 'double' });
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(deal(s, rng));
      h.done = true;
      out.fx.push('chips', 'card');
      out.log.push(`Doubled to ${h.bet}.`);
      break;
    case 'split': {
      out.cash.push({ kind: 'stake', amount: h.bet, why: 'split' });
      const aces = h.cards[0].rank === 'A';
      const other = newHand(h.bet, [h.cards.pop()], { split: true, aces });
      h.split = true;
      h.aces = aces;
      s.hands.splice(s.active + 1, 0, other);
      h.cards.push(deal(s, rng));
      out.fx.push('chips', 'card');
      if (aces) {
        // split aces: one card each (both dealt now); a new ace may be split again if allowed
        other.cards.push(deal(s, rng));
        for (const x of [h, other]) if (!canSplitHand(s, x)) x.done = true;
      } else if (handValue(h.cards).total === 21) h.done = true;
      break;
    }
    case 'surrender':
      h.result = 'surrender';
      h.done = true;
      break;
    default: throw new Error(`Unknown action ${type}.`);
  }
  return advance(s, rng, out);
}

/** Change the house rules between rounds (a new shoe when the decks or the cut card change). */
function setRules(s, opts, rng, out) {
  if (s.phase !== 'bet' && s.phase !== 'over') throw new Error('The new rules start with the next round.');
  const rules = rulesFrom(opts);
  const newShoeNeeded = rules.decks !== s.rules.decks || rules.penetration !== s.rules.penetration;
  s.rules = rules;
  if (newShoeNeeded) {
    s.shoe = newShoe({ decks: rules.decks, penetration: rules.penetration }, rng);
    burn(s.shoe, 1);
    s.count = 0;
    s.shuffled = true;
  }
  return out;
}

function startRound(s, { bet }, rng, out) {
  if (s.phase !== 'bet' && s.phase !== 'over') throw new Error('Finish this hand first.');
  if (!Number.isSafeInteger(bet) || bet <= 0) throw new Error('Place a bet first.');
  let fresh = s.shuffled; // a new shoe since the last round (first round, new rules)
  if (needsShuffle(s.shoe)) {
    reshuffle(s.shoe, rng);
    burn(s.shoe, 1);
    s.count = 0;
    fresh = true;
  }
  s.shuffled = false;
  if (fresh) { out.shuffled = true; out.fx.push('shuffle'); out.log.push('Shuffling a fresh shoe.'); }
  s.round++;
  s.result = null;
  s.insurance = 0;
  s.insuranceOffered = false;
  s.peeked = false;
  s.holeShown = false;
  s.active = 0;
  out.cash.push({ kind: 'stake', amount: bet, why: 'bet' });
  const hand = newHand(bet);
  s.hands = [hand];
  s.dealer = [];
  hand.cards.push(deal(s, rng));
  s.dealer.push(deal(s, rng));
  hand.cards.push(deal(s, rng));
  s.dealer.push(draw(s.shoe)); // the hole card, face down (not counted until it is turned)
  out.fx.push('deal');
  const up = s.dealer[0];
  if (up.rank === 'A' && s.rules.insurance) {
    s.phase = 'insurance';
    s.insuranceOffered = true;
    return out;
  }
  return afterPeek(s, rng, out);
}

function insure(s, amount, out) {
  if (amount) {
    const max = Math.floor(s.hands[0].bet / 2);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > max) throw new Error(`Insurance can be up to half your bet (${max}).`);
    s.insurance = amount;
    out.cash.push({ kind: 'stake', amount, why: 'insurance' });
    out.fx.push('chips');
  }
  return afterPeek(s, null, out);
}

/** The dealer looks at the hole card under an ace or a ten; a blackjack there ends the round. */
function afterPeek(s, rng, out) {
  const up = s.dealer[0];
  s.phase = 'play';
  if (cardValue(up) >= 10) {
    s.peeked = true;
    if (isBlackjack(s.dealer)) {
      out.log.push('The dealer has blackjack.');
      for (const h of s.hands) h.done = true;
      return finish(s, out);
    }
    if (s.insurance) out.log.push('No dealer blackjack: the insurance loses.');
  }
  if (isBlackjack(s.hands[0].cards)) {
    s.hands[0].done = true;
    return finish(s, out);
  }
  return out;
}

/** Move to the next hand that still needs playing; when there is none, the dealer plays. */
function advance(s, rng, out) {
  while (s.active < s.hands.length && s.hands[s.active].done) {
    s.active++;
    const h = s.hands[s.active];
    if (h && h.cards.length === 1) {
      // the second card of a split hand comes when its turn starts
      h.cards.push(deal(s, rng));
      out.fx.push('card');
      if (handValue(h.cards).total === 21) h.done = true;
    }
  }
  if (s.active < s.hands.length) return out;
  s.active = s.hands.length - 1;
  return dealerPlays(s, rng, out);
}

function dealerPlays(s, rng, out) {
  revealHole(s);
  out.fx.push('flip');
  const live = s.hands.some((h) => h.result !== 'surrender' && handValue(h.cards).total <= 21);
  if (live) {
    for (;;) {
      const { total, soft } = handValue(s.dealer);
      if (total < 17 || (total === 17 && soft && s.rules.h17)) { s.dealer.push(deal(s, rng)); out.fx.push('card'); } else break;
    }
  }
  return finish(s, out);
}

/** Settle every hand and the insurance; the round is over. */
function finish(s, out) {
  revealHole(s);
  s.phase = 'over';
  const dealerBJ = isBlackjack(s.dealer);
  const d = handValue(s.dealer).total;
  let won = 0, wagered = s.insurance;
  for (const h of s.hands) {
    wagered += h.bet;
    const p = handValue(h.cards).total;
    const natural = !h.split && isBlackjack(h.cards);
    if (h.result === 'surrender') h.returned = Math.floor(h.bet / 2);
    else if (natural && dealerBJ) { h.result = 'push'; h.returned = h.bet; }
    else if (natural) { h.result = 'blackjack'; h.returned = h.bet + Math.floor((h.bet * 3) / 2); }
    else if (dealerBJ) { h.result = 'lose'; h.returned = 0; }
    else if (p > 21) { h.result = 'bust'; h.returned = 0; }
    else if (d > 21 || p > d) { h.result = 'win'; h.returned = h.bet * 2; }
    else if (p === d) { h.result = 'push'; h.returned = h.bet; }
    else { h.result = 'lose'; h.returned = 0; }
    won += h.returned;
  }
  const insuranceBack = s.insurance && dealerBJ ? s.insurance * 3 : 0;
  won += insuranceBack;
  s.result = { wagered, won, net: won - wagered, insurance: s.insurance ? (dealerBJ ? 'win' : 'lose') : null, insuranceBack, dealerBJ, dealer: d };
  if (won) out.cash.push({ kind: 'pay', amount: won });
  out.done = { wagered, won };
  out.fx.push(won > wagered ? 'win' : won === wagered ? 'chips' : 'lose');
  return out;
}

/** The table minimum is all a round needs. */
export const minBuyIn = (stakes) => stakes.min;
