// Canasta (4 players, partners). Two decks + 4 jokers. Wilds: jokers and 2s. Red 3s are bonus cards.
import { deck, shuffle, rngOf, SYM } from '../core/cards.js';
import { clone, log, fx, who, must, seatsVM } from './lib/common.js';
import { panel, btn, scoreTable } from '../core/table.js';
import { cardHTML, backHTML } from '../skin.js';

const team = (p) => p % 2;
const isWild = (c) => c.rank === 'JK' || c.rank === '2';
const isRed3 = (c) => c.rank === '3' && (c.suit === 'H' || c.suit === 'D');
const isBlack3 = (c) => c.rank === '3' && (c.suit === 'S' || c.suit === 'C');
export const value = (c) => (c.rank === 'JK' ? 50 : c.rank === 'A' || c.rank === '2' ? 20 : ['8', '9', '10', 'J', 'Q', 'K'].includes(c.rank) ? 10 : 5);
const ORDER = ['JK', '2', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3'];
const sortHand = (h) => h.slice().sort((a, b) => ORDER.indexOf(a.rank) - ORDER.indexOf(b.rank) || a.suit.localeCompare(b.suit));
const RANK_NAME = { A: 'Aces', K: 'Kings', Q: 'Queens', J: 'Jacks', 3: 'Black 3s' };
const rankName = (r) => RANK_NAME[r] ?? `${r}s`;

export function requirement(score) { return score < 0 ? 15 : score < 1500 ? 50 : score < 3000 ? 90 : 120; }
const meldValue = (cards) => cards.reduce((t, c) => t + value(c), 0);
const isCanasta = (m) => m.length >= 7;
const natural = (m) => m.every((c) => !isWild(c));

function deal(s) {
  const rng = rngOf(s);
  s.handNo++; s.dealer = (s.dealer + 1) % 4;
  const d = shuffle(deck({ copies: 2, jokers: 4 }), rng);
  s.hands = [0, 1, 2, 3].map((i) => d.slice(i * 11, i * 11 + 11));
  s.stock = d.slice(44);
  s.melds = [{}, {}]; s.red3 = [[], []]; s.pile = []; s.frozen = false;
  for (let p = 0; p < 4; p++) placeRed3s(s, p);
  // Turn the first upcard; wilds and red 3s freeze the pile and another card is turned.
  for (;;) {
    const c = s.stock.pop(); s.pile.push(c);
    if (isWild(c) || isRed3(c)) { s.frozen = true; continue; }
    break;
  }
  s.turn = (s.dealer + 1) % 4; s.phase = 'draw'; s.result = null; s.snapshot = null; s.openedAtTurnStart = null;
  s.hands = s.hands.map(sortHand);
  fx(s, 'shuffle');
  log(s, `Hand ${s.handNo}: ${s.names[s.dealer]} deals.`);
  return s;
}

function placeRed3s(s, p) {
  for (;;) {
    const r = s.hands[p].filter(isRed3);
    if (!r.length) return;
    s.hands[p] = s.hands[p].filter((c) => !isRed3(c));
    s.red3[team(p)].push(...r);
    for (const _ of r) if (s.stock.length) s.hands[p].push(s.stock.pop());
  }
}

const opened = (s, t) => Object.keys(s.melds[t]).length > 0;
const hasCanasta = (s, t) => Object.values(s.melds[t]).some(isCanasta);

/** Validate a group of cards as a meld for `rank` (new or added to existing). */
function checkMeld(existing, add, allowBlack3) {
  const all = [...existing, ...add];
  const naturals = all.filter((c) => !isWild(c));
  const ranks = [...new Set(naturals.map((c) => c.rank))];
  if (ranks.length !== 1) throw new Error('A meld must be one rank (plus wild cards).');
  const rank = ranks[0];
  if (rank === '3') {
    if (!allowBlack3 || naturals.some(isRed3)) throw new Error('Black 3s can only be melded when going out.');
    if (all.some(isWild)) throw new Error('Black 3s can’t be melded with wild cards.');
  }
  if (naturals.length < 2) throw new Error('A meld needs at least two natural cards.');
  if (all.length < 3) throw new Error('A meld needs at least three cards.');
  if (all.filter(isWild).length > 3) throw new Error('A meld can’t contain more than three wild cards.');
  return rank;
}

function beginTurnSnapshot(s, p) {
  s.snapshot = { hand: s.hands[p].slice(), melds: clone(s.melds[team(p)]), meldedPoints: 0 };
}

function draw(s, p) {
  must(s.phase === 'draw' && s.turn === p, 'Not your turn to draw.');
  if (!s.stock.length) return endHand(s, null);
  const c = s.stock.pop();
  s.hands[p].push(c);
  if (isRed3(c)) { log(s, `${who(s, p)} ${p === 0 ? 'draw' : 'draws'} a red 3.`); placeRed3s(s, p); fx(s, 'score'); }
  s.hands[p] = sortHand(s.hands[p]);
  s.phase = 'meld';
  beginTurnSnapshot(s, p);
  fx(s, 'deal');
  return s;
}

/** Can player p take the pile using `ids` from hand (plus the upcard)? Returns the meld cards or throws. */
function pileMeld(s, p, ids) {
  const up = s.pile.at(-1);
  must(up && !isWild(up) && !isBlack3(up), 'You can’t take the pile when the top card is wild or a black 3.');
  const t = team(p);
  const frozen = s.frozen || !opened(s, t);
  const sel = s.hands[p].filter((c) => ids.includes(c.id));
  const existing = s.melds[t][up.rank];
  if (!sel.length && existing && !frozen) return { rank: up.rank, cards: [up], add: true };
  const naturals = sel.filter((c) => c.rank === up.rank);
  if (frozen) must(naturals.length >= 2, `The pile is ${s.frozen ? 'frozen' : 'frozen until your team melds'}: select two natural ${rankName(up.rank)} to take it.`);
  const rank = checkMeld(existing ?? [], [up, ...sel], false);
  must(rank === up.rank, 'Your cards must match the top card.');
  return { rank, cards: [up, ...sel], add: Boolean(existing) };
}

function takePile(s, p, ids) {
  must(s.phase === 'draw' && s.turn === p, 'Not your turn.');
  const m = pileMeld(s, p, ids);
  const t = team(p);
  if (!opened(s, t)) must(meldValue(m.cards) >= requirement(s.scores[t]), `Your first meld must be worth ${requirement(s.scores[t])} (this one is ${meldValue(m.cards)}).`);
  const up = s.pile.pop();
  s.hands[p] = s.hands[p].filter((c) => !ids.includes(c.id));
  s.melds[t][m.rank] = [...(s.melds[t][m.rank] ?? []), up, ...m.cards.slice(1)];
  s.hands[p] = sortHand([...s.hands[p], ...s.pile]);
  log(s, `${who(s, p)} ${p === 0 ? 'take' : 'takes'} the pile (${s.pile.length + 1} cards).`);
  s.pile = []; s.frozen = false;
  fx(s, 'chips');
  s.phase = 'meld';
  beginTurnSnapshot(s, p);
  s.snapshot.locked = true; // the pickup meld can't be undone
  return s;
}

function meld(s, p, ids, rank = null) {
  must(s.phase === 'meld' && s.turn === p, 'Draw first.');
  const t = team(p);
  const sel = s.hands[p].filter((c) => ids.includes(c.id));
  must(sel.length, 'Select cards to meld.');
  const remaining = s.hands[p].length - sel.length;
  const target = rank ?? sel.find((c) => !isWild(c))?.rank;
  must(target, 'Wild cards must be added to an existing meld: select them, then click the meld.');
  const existing = s.melds[t][target] ?? [];
  const goingOut = remaining <= 1;
  checkMeld(existing, sel, goingOut && hasCanastaAfter(s, t, target, sel));
  s.melds[t][target] = [...existing, ...sel];
  s.hands[p] = s.hands[p].filter((c) => !ids.includes(c.id));
  s.snapshot.meldedPoints += meldValue(sel);
  fx(s, 'card');
  log(s, `${who(s, p)} ${p === 0 ? 'meld' : 'melds'} ${rankName(target).toLowerCase()} (${s.melds[t][target].length}).`);
  if (!s.hands[p].length) return goOut(s, p);
  return s;
}

const hasCanastaAfter = (s, t, rank, add) => hasCanasta(s, t) || ((s.melds[t][rank]?.length ?? 0) + add.length >= 7);

function undo(s, p) {
  must(s.phase === 'meld' && s.turn === p && s.snapshot && !s.snapshot.locked, 'Nothing to undo.');
  s.hands[p] = sortHand(s.snapshot.hand.slice()); s.melds[team(p)] = clone(s.snapshot.melds); s.snapshot.meldedPoints = 0;
  return s;
}

function discard(s, p, id) {
  must(s.phase === 'meld' && s.turn === p, 'Not your turn to discard.');
  const t = team(p);
  const c = s.hands[p].find((x) => x.id === id);
  must(c, 'Select one card to discard.');
  const wasOpen = s.snapshot && Object.keys(s.snapshot.melds).length > 0;
  if (!wasOpen && opened(s, t) && !s.snapshot.locked) must(s.snapshot.meldedPoints >= requirement(s.scores[t]), `Your team's first melds must total ${requirement(s.scores[t])}: you have ${s.snapshot.meldedPoints}. Add more or undo.`);
  if (s.hands[p].length === 1) must(hasCanasta(s, t), 'You need a canasta before you can go out.');
  s.hands[p] = s.hands[p].filter((x) => x.id !== id);
  s.pile.push(c);
  if (isWild(c)) s.frozen = true;
  fx(s, 'card');
  if (!s.hands[p].length) return goOut(s, p);
  s.turn = (p + 1) % 4; s.phase = 'draw'; s.snapshot = null;
  if (!s.stock.length && !canTakePile(s, s.turn)) return endHand(s, null);
  return s;
}

function canTakePile(s, p) {
  try { pileMeld(s, p, s.hands[p].filter((c) => c.rank === s.pile.at(-1)?.rank).slice(0, 2).map((c) => c.id)); return true; } catch { return false; }
}

function goOut(s, p) {
  const t = team(p);
  must(hasCanasta(s, t), 'You need a canasta to go out.');
  const concealed = s.snapshot && Object.keys(s.snapshot.melds).length === 0 && !s.snapshot.locked;
  log(s, `${who(s, p)} ${p === 0 ? 'go' : 'goes'} out${concealed ? ' concealed' : ''}!`);
  return endHand(s, p, concealed);
}

function endHand(s, outSeat, concealed = false) {
  const per = [0, 1].map((t) => {
    const melded = Object.values(s.melds[t]);
    const cards = melded.reduce((a, m) => a + meldValue(m), 0);
    const canastas = melded.filter(isCanasta).reduce((a, m) => a + (natural(m) ? 500 : 300), 0);
    const r3n = s.red3[t].length;
    let red3 = r3n === 4 ? 800 : r3n * 100;
    if (!melded.length) red3 = -red3;
    const out = outSeat !== null && team(outSeat) === t ? (concealed ? 200 : 100) : 0;
    const inHand = -(s.hands[t].reduce((a, c) => a + value(c), 0) + s.hands[t + 2].reduce((a, c) => a + value(c), 0));
    return { cards, canastas, red3, out, inHand, total: cards + canastas + red3 + out + inHand };
  });
  s.scores = s.scores.map((v, t) => v + per[t].total);
  s.result = { per, outSeat };
  s.turn = null;
  if (Math.max(...s.scores) >= 5000) { s.phase = 'gameOver'; fx(s, s.scores[0] >= s.scores[1] ? 'win' : 'lose'); }
  else { s.phase = 'handOver'; fx(s, 'score'); }
  if (outSeat === null) log(s, 'The stock is exhausted: the hand ends.');
  return s;
}

// ------------------------------------------------------------------ AI
function groups(hand) {
  const g = {};
  for (const c of hand) if (!isWild(c) && !isBlack3(c)) (g[c.rank] ??= []).push(c);
  return g;
}

function aiTurn(s, p) {
  const t = team(p);
  if (s.phase === 'draw') {
    const up = s.pile.at(-1);
    if (up && !isWild(up) && !isBlack3(up) && s.pile.length >= 2) {
      const nat = s.hands[p].filter((c) => c.rank === up.rank);
      const wild = s.hands[p].filter(isWild);
      const frozen = s.frozen || !opened(s, t);
      let ids = null;
      if (nat.length >= 2) ids = nat.slice(0, Math.max(2, nat.length)).map((c) => c.id);
      else if (!frozen && s.melds[t][up.rank]) ids = [];
      else if (!frozen && nat.length === 1 && wild.length) ids = [nat[0].id, wild[0].id];
      if (ids) { try { return takePile(clone(s), p, ids); } catch { /* fall through */ } }
    }
    return draw(s, p);
  }
  // Melding.
  const hand = () => s.hands[p];
  const wildsIn = () => hand().filter(isWild);
  if (!opened(s, t)) {
    const g = Object.values(groups(hand())).filter((x) => x.length >= 3);
    const pts = g.reduce((a, x) => a + meldValue(x), 0);
    if (pts >= requirement(s.scores[t])) for (const x of g) { try { s = meld(s, p, x.map((c) => c.id)); } catch { /* skip */ } }
  }
  if (opened(s, t) && s.phase === 'meld') {
    for (const [r, x] of Object.entries(groups(hand()))) {
      if (s.phase !== 'meld' || hand().length <= 1) break;
      if (s.melds[t][r] || x.length >= 3) { try { s = meld(s, p, x.map((c) => c.id), r); } catch { /* skip */ } }
    }
    // Use wilds to complete near-canastas.
    for (const [r, m] of Object.entries(s.melds[t])) {
      if (s.phase !== 'meld') break;
      const w = wildsIn();
      if (m.length >= 5 && m.length < 7 && w.length && hand().length > 2 && m.filter(isWild).length < 3) { try { s = meld(s, p, [w[0].id], r); } catch { /* skip */ } }
    }
  }
  if (s.phase !== 'meld') return s;
  // Discard.
  const h = hand();
  const opp = s.melds[1 - t];
  const score = (c) => (isBlack3(c) ? -100 : isWild(c) ? 200 : (s.melds[t][c.rank] ? 80 : 0) + (opp[c.rank] ? 60 : 0) + (h.filter((x) => x.rank === c.rank).length - 1) * 30 + value(c));
  const choice = h.slice().sort((a, b) => score(a) - score(b))[0];
  try { return discard(s, p, choice.id); }
  catch {
    // Unmet opening requirement or not allowed to go out: undo melds and discard anyway.
    if (s.snapshot && !s.snapshot.locked) { undo(s, p); }
    const h2 = hand();
    if (h2.length === 1 && !hasCanasta(s, t)) { // can't go out: draw-stuck edge case
      return endHand(s, null);
    }
    return discard(s, p, h2.slice().sort((a, b) => score(a) - score(b))[0].id);
  }
}

const HOWTO = {
  goal: 'With your partner, meld cards, build canastas and go out. The first team to 5,000 points wins.',
  deal: 'Two full decks and four jokers. Four players in two partnerships (you and the player across from you); each gets 11 cards. The next card starts the discard pile. If it’s a wild card or a red 3, the pile is <b>frozen</b> and another card is turned on top.',
  play: [
    '<b>Jokers and 2s are wild.</b> <b>Red 3s</b> are bonus cards: they’re laid out for your team automatically and replaced from the stock.',
    'On your turn, draw the top card of the stock <b>or</b> take the whole discard pile, then meld if you like, then discard one card.',
    'To take the pile you must meld its top card right away. When the pile is frozen, or your team hasn’t melded yet, that takes two natural cards of the same rank from your hand. Otherwise one natural and a wild card will do, or you can add the top card to a meld your team already has. You can’t take the pile when the top card is wild or a black 3.',
    'A <b>meld</b> is three or more cards of one rank, with at least two natural cards and no more than three wilds. Black 3s can be melded only when you go out, and never with wild cards.',
    'A meld of seven or more cards is a <b>canasta</b>.',
    'Your team’s first melds of a hand must add up to a minimum: 50 points, or 15 while your score is below zero, 90 from 1,500 and 120 from 3,000.',
    'Discarding a wild card freezes the pile.',
    'Once your team has a canasta you can <b>go out</b> by melding all your cards (you may discard the last one), which ends the hand. If the stock runs out, the hand ends too.',
  ],
  score: [
    'Card values: joker 50, ace and 2 20, 8 to king 10, 4 to 7 and black 3 5.',
    'Each team scores the value of its melded cards, plus 500 for each natural canasta and 300 for each mixed one (with wild cards), plus 100 for each red 3 (800 for all four), plus 100 for going out, or 200 for going out <b>concealed</b> (in a single turn, before your team had melded anything and without taking the pile).',
    'Cards left in both partners’ hands count against the team, and red 3s count against a team that hasn’t melded anything.',
    'The first team to 5,000 wins.',
  ],
  options: 'Canasta has no extra options: New game deals a fresh game.',
  controls: 'Cards in your hand are selected rather than played: {click} cards to select them, and {click} again to put one back. {Click} Draw to draw from the stock, or select matching cards and {click} Take the pile. Select three or more cards and {click} Meld selected to start a meld, or {click} one of your team’s melds to add the selected cards to it. Select one card and {click} Discard to end your turn; Undo melds takes back the melds you made this turn.',
  tip: 'Don’t discard a rank your opponents have melded: the next player can scoop up the whole pile with it. When the pile grows big, a wild card discard freezes it.',
};

export default {
  id: 'canasta', title: 'Canasta', version: 1, seats: 4, howto: HOWTO,
  newGame({ names, seed, opts }) {
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, scores: [0, 0], handNo: 0, dealer: 3, log: [], fx: [] });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'handOver') return 0;
    return s.turn;
  },
  delay: () => 1000,
  act(state, a) {
    const s = clone(state);
    const ids = a.ids ?? [];
    switch (a.act) {
      case 'draw': return draw(s, 0);
      case 'pile': return takePile(s, 0, ids);
      case 'meld': return meld(s, 0, ids);
      case 'add': return meld(s, 0, ids, a.rank);
      case 'discard': must(ids.length === 1, 'Select exactly one card to discard.'); return discard(s, 0, ids[0]);
      case 'undo': return undo(s, 0);
      case 'next': return deal(s);
      case 'again': return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
      default: throw new Error('Unknown action');
    }
  },
  aiAct(state) {
    let s = clone(state);
    if (s.phase === 'handOver') return deal(s);
    return aiTurn(s, s.turn);
  },
  view(s, ui) {
    const my = s.turn === 0;
    const n = ui.selected.size;
    const meldRow = (t) => {
      const ms = Object.entries(s.melds[t]).sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]));
      if (!ms.length) return `<div class="meld-row empty">${t === 0 ? 'Your team has no melds yet' : 'No melds yet'}</div>`;
      return `<div class="meld-row">${ms.map(([r, m]) => {
        const face = m.find((c) => !isWild(c));
        const tag = isCanasta(m) ? (natural(m) ? 'Natural canasta' : 'Canasta') : `${m.length} cards`;
        const inner = `${cardHTML(face)}<span class="meld-count${isCanasta(m) ? ' canasta' : ''}">${m.length}${m.some(isWild) ? `<small>+${m.filter(isWild).length}w</small>` : ''}</span>`;
        return t === 0 && my && s.phase === 'meld'
          ? `<button class="meld-pile pile-btn" data-act="add" data-rank="${r}" data-with-sel ${n ? '' : 'disabled'} aria-label="Add selected cards to ${rankName(r)} (${tag})" title="${tag}">${inner}</button>`
          : `<span class="meld-pile" title="${tag}" aria-label="${rankName(r)}: ${tag}">${inner}</span>`;
      }).join('')}</div>`;
    };
    let overlay = '', banner = '', actions = '';
    const t0req = requirement(s.scores[0]);
    if (my && s.phase === 'draw') {
      banner = 'Draw from the stock, or select matching cards and take the pile';
      actions = `${btn('Draw', 'draw', '', true)}${btn('Take the pile', 'pile', 'data-with-sel')}`;
    } else if (my && s.phase === 'meld') {
      banner = opened(s, 0) ? 'Meld, then discard one card' : `Your team's first meld must total ${t0req}`;
      actions = `${btn('Meld selected', 'meld', `data-with-sel ${n >= 3 ? '' : 'disabled'}`)}${btn('Discard', 'discard', `data-with-sel ${n === 1 ? '' : 'disabled'}`, true)}${s.snapshot && !s.snapshot.locked && s.snapshot.meldedPoints ? btn('Undo melds', 'undo') : ''}`;
    } else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      const row = (label, k) => [label, r.per[0][k], r.per[1][k]];
      overlay = panel(s.phase === 'gameOver' ? (s.scores[0] >= s.scores[1] ? `You and ${s.names[2]} win!` : `${s.names[1]} and ${s.names[3]} win`) : `Hand ${s.handNo}`,
        `${r.outSeat !== null ? `<div class="verdict">${who(s, r.outSeat)} went out</div>` : '<div class="verdict">The stock ran out</div>'}
        ${scoreTable(['Us', 'Them'], [row('Melded cards', 'cards'), row('Canastas', 'canastas'), row('Red 3s', 'red3'), row('Going out', 'out'), row('Cards in hand', 'inHand'), row('This hand', 'total'), ['Score', `<b>${s.scores[0]}</b>`, `<b>${s.scores[1]}</b>`]])}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('Play again', 'again', '', true) : btn('Next hand', 'next', '', true)}</div>`);
    } else if (s.turn !== null) banner = `${who(s, s.turn)} is playing…`;
    const up = s.pile.at(-1);
    const center = `<div class="canasta-table">
      ${meldRow(1)}
      <div class="row" style="gap:24px;--card-w:70px;justify-content:center">
        <div class="pile">${s.stock.length ? backHTML() : '<span class="empty-slot">Empty</span>'}<span>Stock · ${s.stock.length}</span></div>
        <div class="pile">${up ? cardHTML(up) : '<span class="empty-slot">Pile</span>'}<span>Pile · ${s.pile.length}${s.frozen ? ' · <b>frozen</b>' : ''}</span></div>
      </div>
      ${actions ? `<div class="hand-actions">${actions}</div>` : ''}
      ${meldRow(0)}</div>`;
    return {
      subtitle: `Hand ${s.handNo} · to 5,000 · your first meld needs ${t0req}`,
      scores: [{ label: 'Us', value: s.scores[0], us: true }, { label: 'Them', value: s.scores[1] }],
      seats: seatsVM(s, 4, (i) => ({ tag: s.red3[team(i)].length && (i < 2) ? `${s.red3[team(i)].length} red 3${s.red3[team(i)].length > 1 ? 's' : ''}` : '' })),
      hand: { cards: s.hands[0], legal: my ? s.hands[0].map((c) => c.id) : null, mode: my ? 'select' : 'play', maxSelect: 20 },
      center, banner, overlay,
      side: [{ title: 'Red 3s', html: `<div>Us: ${s.red3[0].length} · Them: ${s.red3[1].length}</div>` },
        { title: 'Card values', html: '<div style="font-size:13px">Joker 50 · A, 2: 20 · 8–K: 10 · 4–7, black 3: 5</div>' }],
    };
  },
};
