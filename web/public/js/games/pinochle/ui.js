// Pinochle table: renders engine state for every variant, paces the computer players, saves progress locally.
import * as P from './engine.js';
import * as AI from './ai.js';
import { cardHTML, backHTML, cardName, paintFelt, preloadSkin } from '../../skin.js';
import { mountChrome, esc, playerName, playerAvatar, avatarHTML } from '../../header.js';
import { play } from '../../core/sound.js';
import { pickOpponents, castByName, renamePlaceholders } from '../../core/cast.js';
import { trumpPlaqueHTML } from '../../core/pieces.js';

mountChrome('pinochle');
preloadSkin();

const SAVE_KEY = 'dc.pinochle.v1';
const SYM = P.SUIT_SYMBOLS;
const suitSpan = (s) => `<span class="trump-sym${s === 'H' || s === 'D' ? ' red-suit' : ''}">${SYM[s]}</span>`;
/** One line per variant for the New game dialog. */
const BLURB = {
  auction: 'Four players in two teams. Bid for the right to name trump, then make your bid in meld and counters.',
  'two-handed': 'Just you and one opponent. Draw from the stock, meld as you win tricks, then fight out the last twelve.',
  'double-pack': 'Four players in two teams with an 80-card deck, 20 cards each. Bids start at 500; game is 3,550.',
  partnership: 'Four players in two teams, no bidding: the dealer turns up trump and the dix can be traded for it.',
  cutthroat: 'Four-handed, every player for themselves: trump is turned up, no bidding, no partners.',
};
const pace = () => { try { return localStorage.getItem('dc.speed') === 'fast' ? 0.45 : 1; } catch { return 1; } };

// The variant asked for in the address (pinochle.html?v=two-handed), if any.
const askedId = new URLSearchParams(location.search).get('v');
const asked = P.VARIANTS[askedId] ? askedId : null;

let state = load();
let pendingSwitch = null; // a variant from the address waiting for the player to give up their game
if (!state) state = fresh(null, asked ?? 'auction');
else if (asked && asked !== state.variant) {
  if (inProgress(state)) pendingSwitch = asked;
  else state = fresh(null, asked);
}
save(); // save at once so a reload keeps the same opponents (new, or renamed in an old save)
let timer = null;

/** A new game of `variant`: fresh opponents from the cast, or the same ones when playing again (`keep`). */
function fresh(keep = null, variant = state?.variant ?? 'auction') {
  const v = P.VARIANTS[variant] ?? P.VARIANTS.auction;
  const others = keep && keep.length === v.players ? keep.slice(1) : pickOpponents(v.players - 1, { gameId: 'pinochle' }).map((c) => c.name);
  return P.newGame({ seed: Math.floor(Math.random() * 2 ** 31), names: [playerName(), ...others], variant: v.id });
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!s || !Array.isArray(s.hands)) return null;
    s.variant = P.variantOf(s).id; // saves from before variants are Partnership Auction
    s.names = renamePlaceholders(s.names, { gameId: 'pinochle' }); // old saves: 'West', 'North' … get cast members
    return s;
  } catch { return null; }
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ } }
/** A game worth asking about before it is thrown away: a trick played, or past the first hand. */
function inProgress(s) { return s.phase !== 'gameOver' && (s.handNo > 1 || s.tricksWon.some(Boolean) || s.trick.length > 0); }

/** Keep the address (and the site shell's) on the variant being played. */
function syncUrl() {
  const url = `${location.pathname}?v=${state.variant}${location.hash}`;
  try { history.replaceState(null, '', url); } catch { /* ignore */ }
  try { if (window.top !== window) window.top.history.replaceState(null, '', url); } catch { /* not same-origin */ }
}

function set(next) { sounds(state, next); state = next; save(); render(); schedule(); }

/** Sound cues from what changed between two states. */
function sounds(a, b) {
  if (b.handNo !== a.handNo || b.variant !== a.variant) return play('shuffle');
  if (b.phase === 'gameOver' && a.phase !== 'gameOver') return play(b.winner === 0 ? 'win' : 'lose');
  if (b.phase === 'handOver' && a.phase !== 'handOver') return play('score');
  if (b.phase === 'bidding' && b.log.length !== a.log.length) return play(b.bids.filter((x) => x === 'pass').length > a.bids.filter((x) => x === 'pass').length ? 'pass' : 'bid');
  if (b.phase === 'meld' && a.phase !== 'meld') return play('bid');
  if (b.phase === 'declare' && a.phase === 'declare' && b.log.length !== a.log.length) return play('bid');
  if (a.phase === 'declare' && b.phase === 'play') return play('deal');
  if (b.trick.length > a.trick.length) return play('card');
  if (a.phase === 'trickDone' && b.phase !== 'trickDone') return play('trick');
}

function schedule() {
  clearTimeout(timer);
  const s = state;
  const who = P.actor(s);
  let delay = 0;
  if (who === 'table') delay = 1300;
  else if (s.phase === 'meld' || who === null) return; // the meld panel waits for you
  else if (who !== 0) delay = { bidding: 800, trump: 1000, dix: 1000, declare: 900, play: 700 }[s.phase] ?? 800;
  else if (s.phase === 'declare' && !P.meldOptions(s, 0).length) delay = 500; // nothing to meld: draw
  else return;
  timer = setTimeout(() => set(who === 0 ? P.endDeclare(s, 0) : AI.act(s)), delay * pace());
}

// ------------------------------------------------------------------ rendering

const V = () => P.variantOf(state);
const sideOf = (seat) => P.sideOf(state, seat);
const POS4 = ['south', 'west', 'north', 'east'];
const posOf = (seat) => (V().players === 2 ? ['south', 'north'][seat] : POS4[seat]);
const isPartner = (seat) => V().partners && seat === 2;
const nameOf = (seat) => (seat === 0 ? 'You' : state.names[seat]);
/** Column labels for the score tables and chips. */
const sideLabel = (side) => (V().partners ? ['Us', 'Them'][side] : side === 0 ? 'You' : state.names[side]);

function plate(seat) {
  const s = state;
  const cls = ['plate', seat === 0 ? 'me' : isPartner(seat) ? 'partner' : ''];
  if (s.turn === seat && ['bidding', 'play', 'trump', 'dix', 'declare'].includes(s.phase)) cls.push('turn');
  let bubble = '';
  if (s.phase === 'bidding' && s.bids[seat] !== null) bubble = s.bids[seat] === 'pass' ? '<span class="bubble pass">Pass</span>' : `<span class="bubble">${s.bids[seat]}</span>`;
  else if (V().bidding && s.highBidder === seat && s.phase !== 'bidding') bubble = `<span class="bubble">Bid ${s.highBid}</span>`;
  else if (s.dixTrade?.seat === seat && ['meld', 'dix'].includes(s.phase)) bubble = '<span class="bubble">Dix</span>';
  const label = seat === 0 ? `${esc(s.names[0])} (you)` : isPartner(seat) ? `${esc(s.names[2])} · partner` : esc(s.names[seat]);
  const guest = seat === 0 ? null : castByName(s.names[seat]);
  return `<span class="${cls.join(' ')}"${guest ? ` title="${esc(guest.bio)}"` : ''}>${avatarHTML(s.names[seat], seat === 0 ? playerAvatar() : guest?.portrait)}${label}
    ${s.dealer === seat ? '<span class="dealer" title="Dealer">D</span>' : ''}${bubble}</span>`;
}

/** A computer player's cards: backs, plus (two-handed) their melded cards lying face up. */
function backs(seat, vertical) {
  const s = state;
  const shown = s.table?.[seat] ?? [];
  const hidden = s.hands[seat].length - shown.length;
  const faceUp = shown.length ? `<div class="meld-row tabled" aria-label="Melded cards">${s.hands[seat].filter((c) => shown.includes(c.id)).map((c) => cardHTML(c)).join('')}</div>` : '';
  return `<div class="backs${vertical ? ' vertical' : ''}" aria-label="${s.hands[seat].length} cards">${Array.from({ length: hidden }, () => backHTML()).join('')}</div>${faceUp}`;
}

function handHTML() {
  const s = state;
  const myTurn = s.phase === 'play' && s.turn === 0;
  const legal = myTurn ? new Set(P.legalFor(s, 0).map((c) => c.id)) : null;
  const tabled = new Set(s.table?.[0] ?? []);
  return `<div class="hand" role="group" aria-label="Your hand">${s.hands[0].map((c) => {
    const ok = legal?.has(c.id);
    const cls = ['slot', ok ? 'legal' : '', legal && !ok ? 'dim' : '', tabled.has(c.id) ? 'meld' : ''].join(' ');
    return `<button type="button" class="${cls}" data-act="play" data-id="${c.id}" ${ok ? '' : 'disabled'} aria-label="${cardName(c)}${tabled.has(c.id) ? ', melded' : ''}${ok ? ', playable' : ''}">${cardHTML(c)}</button>`;
  }).join('')}</div>`;
}

function trickHTML() {
  const s = state;
  const shown = s.trick;
  const wi = shown.length ? P.trickWinnerIndex(shown, s.trump) : -1;
  return `<div class="trick${V().players === 2 ? ' two' : ''}" aria-label="Cards on the table">${shown.map((p, i) =>
    `<div class="play pos-${posOf(p.seat)}${s.phase === 'trickDone' && i === wi ? ' win' : ''}">${cardHTML(p.card)}</div>`).join('')}</div>`;
}

/** Two-handed: the face-down stock lying across the turned trump card. */
function stockHTML() {
  const s = state;
  if (!P.drawing(s)) return '<div class="stock-pile empty"><span class="stock-count">Stock gone</span></div>';
  return `<div class="stock-pile" role="img" aria-label="Stock: ${s.stock.length} cards over the turned ${cardName(s.turnUp)}">
    <div class="stock-cards">${cardHTML(s.turnUp, 'turned')}${s.stock.length ? backHTML('stock-top') : ''}</div>
    <span class="stock-count">Stock ${s.stock.length}</span></div>`;
}

function banner() {
  const s = state;
  const n = nameOf;
  if (s.phase === 'bidding') return s.turn === 0 ? '' : `${n(s.turn)} is bidding…`;
  if (s.phase === 'trump') return s.highBidder === 0 ? '' : `${n(s.highBidder)} is naming trump…`;
  if (s.phase === 'dix') return s.turn === 0 ? '' : `${n(s.turn)} has the dix…`;
  if (s.phase === 'declare') return s.turn === 0 ? '' : `${n(s.turn)} may meld, then draws`;
  if (s.phase === 'trickDone') return `${n(s.pendingWinner)} ${s.pendingWinner === 0 ? 'take' : 'takes'} the trick`;
  if (s.phase !== 'play') return '';
  if (s.turn !== 0) return `${n(s.turn)} to play`;
  if (V().stock && P.drawing(s)) return s.trick.length ? 'Your turn: play any card (no need to follow)' : 'Your lead: play any card';
  if (!s.trick.length) return 'Your lead: play any card';
  const led = s.trick[0].card.suit;
  const legal = P.legalFor(s, 0);
  if (legal[0].suit === led) return `Your turn: follow ${P.SUIT_NAMES[led].toLowerCase()}`;
  if (legal[0].suit === s.trump) return `Out of ${P.SUIT_NAMES[led].toLowerCase()}: play trump`;
  return 'Your turn: play any card';
}

function meldBox(seat) {
  const m = state.melds[seat];
  return `<div class="meld-box ${sideOf(seat) === 0 ? 'us' : ''}"><b><span>${seat === 0 ? 'You' : esc(state.names[seat])}</span><span>${m.points}</span></b>
    <ul>${m.items.length ? m.items.map((i) => `<li>${i.name}: ${i.points}</li>`).join('') : '<li>No meld</li>'}</ul></div>`;
}

function overlay() {
  const s = state;
  const v = V();
  if (s.phase === 'bidding' && s.turn === 0) {
    const next = P.minNextBid(s);
    const opts = [...new Set([next, next + 10, next + 20, next + 50])];
    const hints = P.SUITS.map((x) => `${SYM[x]} ${P.computeMeld(s.hands[0], x, v.id).points}`).join(' · ');
    const high = s.highBidder === null ? `No bids yet. The minimum is ${v.minBid}.` : `High bid: ${s.highBid} by ${s.highBidder === 2 ? 'your partner' : esc(s.names[s.highBidder])}.`;
    return `<div class="card-panel"><h3>Your bid</h3><p>${high}<br>Your meld by trump suit: ${hints}</p>
      <div class="row"><button class="btn" data-act="bid" data-v="pass">Pass</button>
      ${opts.map((x) => `<button class="btn ${x === next ? 'primary' : ''}" data-act="bid" data-v="${x}">${x}</button>`).join('')}</div></div>`;
  }
  if (s.phase === 'trump' && s.highBidder === 0) {
    return `<div class="card-panel"><h3>Name trump</h3><p>You won the bid at ${s.highBid}${s.dumped ? ' (it was dumped on you)' : ''}. Your meld with each suit as trump:</p>
      <div class="row">${P.SUITS.map((x) => `<button class="btn suit-btn" data-act="trump" data-suit="${x}">${suitSpan(x)}<span>${P.SUIT_NAMES[x]}</span><small>meld ${P.computeMeld(s.hands[0], x, v.id).points}</small></button>`).join('')}</div></div>`;
  }
  if (s.phase === 'dix' && s.turn === 0) {
    return `<div class="card-panel"><h3>Trade the dix?</h3>
      <div class="row turn-up-row">${cardHTML(s.turnUp)}<p>${esc(s.names[s.dealer])} turned up the ${cardName(s.turnUp)}. You hold the 9 of trump (the dix): trade it for the turned card and score 10?</p></div>
      <div class="row"><button class="btn primary" data-act="dix" data-v="yes">Trade for the ${P.cardLabel(s.turnUp)}</button><button class="btn" data-act="dix" data-v="no">Keep my 9</button></div></div>`;
  }
  if (s.phase === 'declare' && s.turn === 0) {
    const opts = P.meldOptions(s, 0);
    const last = s.stock.length === 1;
    return `<div class="card-panel declare"><h3>You won the trick</h3>
      <p>${opts.length ? 'You may lay down one meld (and trade or meld the dix) before you draw. Melded cards stay face up and can still be played.' : s.declared.meld || s.declared.dix ? 'Melded. Drawing…' : 'Nothing to meld this time.'}${last ? ' This is the last draw: then melding ends.' : ''}</p>
      ${opts.length ? `<div class="meld-opts">${opts.map((o) => `<button class="btn" data-act="declare" data-key="${o.key}"><span>${esc(o.name)}</span><b>+${o.points}</b></button>`).join('')}</div>` : ''}
      <div class="row" style="justify-content:flex-end"><button class="btn primary" data-act="draw">${last ? 'Draw the last card' : 'Draw'}</button></div></div>`;
  }
  if (s.phase === 'meld') {
    const trumpLine = v.bidding ? `Trump is ${P.SUIT_NAMES[s.trump]} ${suitSpan(s.trump)}.` : `${s.dealer === 0 ? 'You' : esc(s.names[s.dealer])} turned up the ${cardName(s.turnUp)}: ${P.SUIT_NAMES[s.trump]} ${suitSpan(s.trump)} are trump.`;
    let goal;
    if (v.bidding) {
      const bt = sideOf(s.highBidder);
      const need = Math.max(0, s.highBid - P.teamMeld(s, bt));
      goal = `${bt === 0 ? 'Your team' : 'They'} bid ${s.highBid} and need ${need} more in counters (meld counts only if the team wins a trick).`;
    } else goal = v.partners ? 'Meld counts only if the team wins a trick. No bidding: each team keeps what it makes.' : 'Every player for themselves. Meld counts only if that player wins a trick.';
    const order = v.partners ? [0, 2, 1, 3] : [0, 1, 2, 3];
    const foot = v.partners ? `<span>Us <b>${P.teamMeld(s, 0)}</b> · Them <b>${P.teamMeld(s, 1)}</b></span>` : '<span></span>';
    return `<div class="card-panel" style="max-width:560px"><h3>Meld</h3><p>${trumpLine} ${goal}</p>
      <div class="melds">${order.map(meldBox).join('')}</div>
      <div class="row" style="justify-content:space-between">${foot}
      <button class="btn primary" data-act="start-play">Play the hand</button></div></div>`;
  }
  if (s.phase === 'handOver' || s.phase === 'gameOver') return resultsPanel();
  return '';
}

function resultsPanel() {
  const s = state, v = V(), r = s.result;
  const sides = r.per.map((_, i) => i);
  let verdict, good;
  if (v.bidding) {
    const bidders = r.bidTeam === 0 ? 'Your team' : `${esc(s.names[1])} & ${esc(s.names[3])}`;
    verdict = r.made ? `${bidders} made the bid of ${r.bid}.` : `${bidders} went set on ${r.bid}.`;
    good = (r.bidTeam === 0) === r.made;
  } else {
    const top = Math.max(...r.delta);
    const best = sides.filter((i) => r.delta[i] === top);
    good = best.includes(0);
    const who = best.map((i) => (v.partners ? (i === 0 ? 'Your team' : 'They') : i === 0 ? 'You' : esc(s.names[i]))).join(' and ');
    verdict = best.length > 1 ? `${who} tied for the most this hand: ${top}.` : `${who} scored the most this hand: ${top}.`;
  }
  const row = (label, f) => `<tr><td>${label}</td>${sides.map((t) => `<td>${f(t)}</td>`).join('')}</tr>`;
  let foot = `<button class="btn primary" data-act="next-hand">Deal next hand</button>`;
  let title = `Hand ${s.handNo} results`;
  if (s.phase === 'gameOver') {
    const w = s.winner;
    if (v.partners) title = w === 0 ? `You and ${esc(s.names[2])} win the game!` : `${esc(s.names[1])} and ${esc(s.names[3])} win the game`;
    else title = w === 0 ? 'You win the game!' : `${esc(s.names[w])} wins the game`;
    good = w === 0;
    foot = `<button class="btn primary" data-act="new-game">Play again</button>`;
  }
  return `<div class="card-panel" style="min-width:min(440px,100%)"><h3>${title}</h3>
    <div class="verdict ${good ? 'good' : 'bad'}">${verdict}</div>
    <table class="score${sides.length > 2 ? ' wide' : ''}"><thead><tr><th></th>${sides.map((t) => `<th>${esc(sideLabel(t))}</th>`).join('')}</tr></thead><tbody>
    ${row('Meld', (t) => r.per[t].tookTrick || v.stock ? r.per[t].meld : `<s>${r.per[t].meld}</s> <small>no trick</small>`)}
    ${row(v.stock ? 'Cards' : 'Counters', (t) => r.per[t].counters)}
    ${row('This hand', (t) => (r.delta[t] >= 0 ? '+' : '') + r.delta[t])}
    ${row('Score', (t) => `<b>${r.scores[t]}</b>`)}
    </tbody></table><div class="row" style="justify-content:flex-end">${foot}</div></div>`;
}

function sidePanel() {
  const s = state, v = V();
  let top;
  if (v.bidding) {
    const contract = s.highBidder === null || s.phase === 'bidding'
      ? `<div class="big">Bidding</div><div class="muted">${esc(s.names[s.dealer])} dealt · hand ${s.handNo}</div>`
      : `<div class="big">${s.highBidder === 0 ? 'You' : esc(s.names[s.highBidder])} · ${s.highBid}</div>${s.trump ? '' : '<div>Naming trump…</div>'}`;
    top = `<section class="panel"><h2>Contract</h2>${contract}</section>`;
  } else if (v.stock) {
    const note = P.drawing(s) ? `Stock: ${s.stock.length} cards. Play anything; the trick winner may meld, then both draw.` : 'Stock gone: follow suit, beat a trump lead, trump when void.';
    top = `<section class="panel"><h2>Trump · hand ${s.handNo}</h2><div class="big">${P.SUIT_NAMES[s.trump]} ${suitSpan(s.trump)}</div><div class="muted">${note}</div></section>`;
  } else {
    const card = s.dixTrade ? s.dixTrade.got : s.turnUp;
    const note = s.dixTrade ? `${s.dixTrade.seat === 0 ? 'You' : esc(s.names[s.dixTrade.seat])} traded the dix for it.` : `Turned up by ${s.dealer === 0 ? 'you' : esc(s.names[s.dealer])} · hand ${s.handNo}`;
    top = `<section class="panel"><h2>Trump</h2><div class="turn-up-row">${cardHTML(card)}<div><div class="big">${P.SUIT_NAMES[s.trump]} ${suitSpan(s.trump)}</div><div class="muted">${note}</div></div></div></section>`;
  }
  const sides = s.scores.map((_, i) => i);
  const seats = (t) => P.seatsOf(s, t);
  const pts = (t) => seats(t).flatMap((x) => s.taken[x]).reduce((a, c) => a + P.cardPoints(s, c), 0);
  const tricks = (t) => seats(t).reduce((a, x) => a + s.tricksWon[x], 0);
  const meld = (t) => (v.stock ? seats(t).reduce((a, x) => a + P.declaredPoints(s, x), 0) : s.melds ? P.teamMeld(s, t) : null);
  const head = `<thead><tr><th></th>${sides.map((t) => `<th>${esc(sideLabel(t))}</th>`).join('')}</tr></thead>`;
  const line = (label, f) => `<tr><td>${label}</td>${sides.map((t) => `<td>${f(t)}</td>`).join('')}</tr>`;
  const live = s.melds || v.stock ? `<section class="panel"><h2>This hand</h2>
      <table class="score${sides.length > 2 ? ' wide' : ''}" style="margin:0">${head}<tbody>
      ${line('Meld', meld)}${line('Tricks', tricks)}${line(v.stock ? 'Cards' : 'Counters', pts)}</tbody></table></section>` : '';
  const melded = v.stock && s.declaredMelds.some((m) => m.length) ? `<section class="panel"><h2>Melds this hand</h2>${[0, 1].map((x) =>
      `<div class="muted"><b>${x === 0 ? 'You' : esc(s.names[x])}:</b> ${s.declaredMelds[x].length ? s.declaredMelds[x].map((m) => `${esc(m.name)} ${m.points}`).join(' · ') : 'none yet'}</div>`).join('')}</section>` : '';
  const last = s.lastTrick ? `<section class="panel"><h2>Last trick · ${s.lastTrickWinner === 0 ? 'you' : esc(s.names[s.lastTrickWinner])}</h2>
      <div class="row" style="--card-w:44px">${s.lastTrick.map((p) => cardHTML(p.card)).join('')}</div></section>` : '';
  return `${top}${live}${melded}${last}
    <section class="panel"><h2>Table talk</h2><div class="log" aria-live="polite">${s.log.slice(-14).reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div></section>`;
}

function render() {
  const s = state, v = V();
  document.getElementById('scores').innerHTML = s.scores.map((x, i) =>
    `<span class="score-chip${i === 0 ? ' us' : ''}"><b>${esc(sideLabel(i))}</b><span>${x}</span></span>`).join('');
  document.getElementById('target').textContent = `to ${v.target.toLocaleString('en-US')}`;
  document.getElementById('sub').textContent = `${v.name} · hand ${s.handNo}`;
  const felt = document.getElementById('felt');
  felt.classList.toggle('two-handed', v.players === 2);
  paintFelt(felt);
  const b = banner();
  const ov = overlay();
  const seats = v.players === 2
    ? `<div class="seat north">${plate(1)}${backs(1, false)}</div><div class="seat west stock-seat">${stockHTML()}</div>`
    : `<div class="seat north">${plate(2)}${backs(2, false)}</div>
    <div class="seat west">${plate(1)}${backs(1, true)}</div>
    <div class="seat east">${plate(3)}${backs(3, true)}</div>`;
  felt.innerHTML = `${s.trump ? trumpPlaqueHTML(s.trump) : ''}${seats}
    <div class="center">${trickHTML()}${b ? `<div class="banner" role="status">${b}</div>` : ''}${ov ? `<div class="overlay">${ov}</div>` : ''}</div>
    <div class="seat south">${handHTML()}${plate(0)}</div>`;
  document.getElementById('side').innerHTML = sidePanel();
  document.getElementById('rules').querySelectorAll('details[data-v]').forEach((d) => { if (!d.dataset.touched) d.open = d.dataset.v === v.id; });
}

// ------------------------------------------------------------------ input

document.getElementById('felt').addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const s = state;
  try {
    switch (el.dataset.act) {
      case 'bid': set(P.applyBid(s, 0, el.dataset.v === 'pass' ? 'pass' : Number(el.dataset.v))); break;
      case 'trump': set(P.chooseTrump(s, 0, el.dataset.suit)); break;
      case 'dix': set(P.tradeDix(s, 0, el.dataset.v === 'yes')); break;
      case 'declare': set(P.declareMeld(s, 0, el.dataset.key)); break;
      case 'draw': set(P.endDeclare(s, 0)); break;
      case 'start-play': set(P.startPlay(s)); break;
      case 'play': set(P.playCard(s, 0, el.dataset.id)); break;
      case 'next-hand': set(P.nextHand(s)); break;
      case 'new-game': set(fresh(s.names)); break; // "Play again": same table
    }
  } catch (err) {
    console.warn(err); // stale click (e.g. double-click during an AI turn): ignore
  }
});

// New game: pick the variant; starting one ends the game in progress (the dialog says so first).
const dlg = document.getElementById('newgame');
document.getElementById('variant-list').innerHTML = P.VARIANT_IDS.map((id) => {
  const v = P.VARIANTS[id];
  return `<label class="choice variant-opt"><input type="radio" name="variant" value="${id}"><span><b>${v.name}</b><small>${esc(BLURB[id])}</small></span></label>`;
}).join('');
function openNewGame(variant = state.variant, { fromLink = false } = {}) {
  dlg.querySelector(`input[value="${variant}"]`).checked = true;
  const warn = document.getElementById('newgame-warn');
  const live = state.phase !== 'gameOver';
  warn.hidden = !live;
  warn.textContent = fromLink
    ? `You have a ${P.variantOf(state).name} game in progress (hand ${state.handNo}). Starting a new game ends it.`
    : 'Starting a new game ends the one in progress, and its score is lost.';
  document.getElementById('newgame-keep').textContent = fromLink ? `Keep playing ${P.variantOf(state).name}` : 'Cancel';
  dlg.showModal();
}
// Act on the button itself (the dialog's own close event can arrive late in a background tab).
dlg.querySelector('form').addEventListener('submit', (e) => {
  pendingSwitch = null;
  if (e.submitter?.value === 'deal') set(fresh(null, dlg.querySelector('input[name="variant"]:checked')?.value ?? state.variant));
  syncUrl();
});
dlg.addEventListener('cancel', () => { pendingSwitch = null; syncUrl(); });

document.getElementById('btn-new').addEventListener('click', () => openNewGame());
document.getElementById('btn-rules').addEventListener('click', () => document.getElementById('rules').showModal());
document.getElementById('rules').querySelectorAll('details[data-v]').forEach((d) => d.querySelector('summary').addEventListener('click', () => { d.dataset.touched = '1'; }));
window.addEventListener('dc:settings', () => {
  state = { ...state, names: [playerName(), ...state.names.slice(1)] };
  save(); render();
});

render();
schedule();
if (pendingSwitch) openNewGame(pendingSwitch, { fromLink: true });
else syncUrl();
