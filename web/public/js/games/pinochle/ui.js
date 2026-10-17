// Pinochle table: renders engine state, paces the computer players, saves progress locally.
import * as P from './engine.js';
import * as AI from './ai.js';
import { cardHTML, backHTML, cardName, paintFelt } from '../../skin.js';
import { mountChrome, esc, playerName, playerAvatar, avatarHTML } from '../../header.js';
import { play } from '../../core/sound.js';
import { pickOpponents, castByName } from '../../core/cast.js';

mountChrome('pinochle');

const SAVE_KEY = 'dc.pinochle.v1';
const SYM = P.SUIT_SYMBOLS;
const suitSpan = (s) => `<span class="trump-sym${s === 'H' || s === 'D' ? ' red-suit' : ''}">${SYM[s]}</span>`;
const pace = () => { try { return localStorage.getItem('dc.speed') === 'fast' ? 0.45 : 1; } catch { return 1; } };

let state = load();
if (!state) { state = fresh(); save(); } // save at once so a reload keeps the same opponents
let timer = null;

/** A new game: fresh opponents from the cast, or the same ones when playing again (`keep`). */
function fresh(keep = null) {
  const others = keep ? keep.slice(1) : pickOpponents(3, { gameId: 'pinochle' }).map((c) => c.name);
  return P.newGame({ seed: Math.floor(Math.random() * 2 ** 31), names: [playerName(), ...others] });
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && Array.isArray(s.hands) ? s : null; } catch { return null; }
}
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* ignore */ } }

function set(next) { sounds(state, next); state = next; save(); render(); schedule(); }

/** Sound cues from what changed between two states. */
function sounds(a, b) {
  if (b.handNo !== a.handNo) return play('shuffle');
  if (b.phase === 'gameOver' && a.phase !== 'gameOver') return play(b.winner === 0 ? 'win' : 'lose');
  if (b.phase === 'handOver' && a.phase !== 'handOver') return play('score');
  if (b.phase === 'bidding' && b.log.length !== a.log.length) return play(b.bids.filter((x) => x === 'pass').length > a.bids.filter((x) => x === 'pass').length ? 'pass' : 'bid');
  if (b.phase === 'meld' && a.phase !== 'meld') return play('bid');
  if (b.trick.length > a.trick.length) return play('card');
  if (a.phase === 'trickDone' && b.phase !== 'trickDone') return play('trick');
}

function schedule() {
  clearTimeout(timer);
  const s = state;
  let delay = 0, act = null;
  if (s.phase === 'bidding' && s.turn !== 0) { delay = 800; act = () => P.applyBid(s, s.turn, AI.chooseBid(s, s.turn)); }
  else if (s.phase === 'trump' && s.highBidder !== 0) { delay = 1000; act = () => P.chooseTrump(s, s.highBidder, AI.chooseTrumpSuit(s, s.highBidder)); }
  else if (s.phase === 'play' && s.turn !== 0) { delay = 700; act = () => P.playCard(s, s.turn, AI.choosePlay(s, s.turn)); }
  else if (s.phase === 'trickDone') { delay = 1300; act = () => P.collectTrick(s); }
  if (act) timer = setTimeout(() => set(act()), delay * pace());
}

// ------------------------------------------------------------------ rendering

const POS = ['south', 'west', 'north', 'east'];

function plate(seat) {
  const s = state;
  const cls = ['plate', seat === 0 ? 'me' : seat === 2 ? 'partner' : ''];
  if (s.turn === seat && ['bidding', 'play', 'trump'].includes(s.phase)) cls.push('turn');
  let bubble = '';
  if (s.phase === 'bidding' && s.bids[seat] !== null) bubble = s.bids[seat] === 'pass' ? '<span class="bubble pass">Pass</span>' : `<span class="bubble">${s.bids[seat]}</span>`;
  else if (s.highBidder === seat && s.phase !== 'bidding') bubble = `<span class="bubble">Bid ${s.highBid}</span>`;
  const label = seat === 0 ? `${esc(s.names[0])} (you)` : seat === 2 ? `${esc(s.names[2])} · partner` : esc(s.names[seat]);
  const guest = seat === 0 ? null : castByName(s.names[seat]);
  return `<span class="${cls.join(' ')}"${guest ? ` title="${esc(guest.bio)}"` : ''}>${avatarHTML(s.names[seat], seat === 0 ? playerAvatar() : guest?.portrait)}${label}
    ${s.dealer === seat ? '<span class="dealer" title="Dealer">D</span>' : ''}${bubble}</span>`;
}

function backs(seat, vertical) {
  return `<div class="backs${vertical ? ' vertical' : ''}" aria-label="${state.hands[seat].length} cards">${state.hands[seat].map(() => backHTML()).join('')}</div>`;
}

function handHTML() {
  const s = state;
  const myTurn = s.phase === 'play' && s.turn === 0;
  const legal = myTurn ? new Set(P.legalPlays(s.hands[0], s.trick, s.trump).map((c) => c.id)) : null;
  return `<div class="hand" role="group" aria-label="Your hand">${s.hands[0].map((c) => {
    const ok = legal?.has(c.id);
    const cls = ['slot', ok ? 'legal' : '', legal && !ok ? 'dim' : ''].join(' ');
    return `<button type="button" class="${cls}" data-act="play" data-id="${c.id}" ${ok ? '' : 'disabled'} aria-label="${cardName(c)}${ok ? ', playable' : ''}">${cardHTML(c)}</button>`;
  }).join('')}</div>`;
}

function trickHTML() {
  const s = state;
  const shown = s.trick;
  const wi = shown.length ? P.trickWinnerIndex(shown, s.trump) : -1;
  return `<div class="trick" aria-label="Cards on the table">${shown.map((p, i) =>
    `<div class="play s${p.seat}${s.phase === 'trickDone' && i === wi ? ' win' : ''}">${cardHTML(p.card)}</div>`).join('')}</div>`;
}

function banner() {
  const s = state;
  const n = (seat) => (seat === 0 ? 'You' : s.names[seat]);
  if (s.phase === 'bidding') return s.turn === 0 ? '' : `${n(s.turn)} is bidding…`;
  if (s.phase === 'trump') return s.highBidder === 0 ? '' : `${n(s.highBidder)} is naming trump…`;
  if (s.phase === 'trickDone') return `${n(s.pendingWinner)} ${s.pendingWinner === 0 ? 'take' : 'takes'} the trick`;
  if (s.phase !== 'play') return '';
  if (s.turn !== 0) return `${n(s.turn)} to play`;
  if (!s.trick.length) return 'Your lead: play any card';
  const led = s.trick[0].card.suit;
  const legal = P.legalPlays(s.hands[0], s.trick, s.trump);
  if (legal[0].suit === led) return `Your turn: follow ${P.SUIT_NAMES[led].toLowerCase()}`;
  if (legal[0].suit === s.trump) return `Out of ${P.SUIT_NAMES[led].toLowerCase()}: play trump`;
  return 'Your turn: play any card';
}

function overlay() {
  const s = state;
  if (s.phase === 'bidding' && s.turn === 0) {
    const next = P.minNextBid(s);
    const opts = [...new Set([next, next + 10, next + 20, next + 50])];
    const hints = P.SUITS.map((x) => `${SYM[x]} ${P.computeMeld(s.hands[0], x).points}`).join(' · ');
    const high = s.highBidder === null ? 'No bids yet. The minimum is 100.' : `High bid: ${s.highBid} by ${s.highBidder === 2 ? 'your partner' : esc(s.names[s.highBidder])}.`;
    return `<div class="card-panel"><h3>Your bid</h3><p>${high}<br>Your meld by trump suit: ${hints}</p>
      <div class="row"><button class="btn" data-act="bid" data-v="pass">Pass</button>
      ${opts.map((v) => `<button class="btn ${v === next ? 'primary' : ''}" data-act="bid" data-v="${v}">${v}</button>`).join('')}</div></div>`;
  }
  if (s.phase === 'trump' && s.highBidder === 0) {
    return `<div class="card-panel"><h3>Name trump</h3><p>You won the bid at ${s.highBid}${s.dumped ? ' (it was dumped on you)' : ''}. Your meld with each suit as trump:</p>
      <div class="row">${P.SUITS.map((x) => `<button class="btn suit-btn" data-act="trump" data-suit="${x}">${suitSpan(x)}<span>${P.SUIT_NAMES[x]}</span><small>meld ${P.computeMeld(s.hands[0], x).points}</small></button>`).join('')}</div></div>`;
  }
  if (s.phase === 'meld') {
    const box = (seat) => {
      const m = s.melds[seat];
      return `<div class="meld-box ${P.team(seat) === 0 ? 'us' : ''}"><b><span>${seat === 0 ? 'You' : esc(s.names[seat])}</span><span>${m.points}</span></b>
        <ul>${m.items.length ? m.items.map((i) => `<li>${i.name}: ${i.points}</li>`).join('') : '<li>No meld</li>'}</ul></div>`;
    };
    const bt = P.team(s.highBidder);
    const need = Math.max(0, s.highBid - P.teamMeld(s, bt));
    return `<div class="card-panel" style="max-width:560px"><h3>Meld</h3>
      <p>Trump is ${P.SUIT_NAMES[s.trump]} ${suitSpan(s.trump)}. ${bt === 0 ? 'Your team' : 'They'} bid ${s.highBid} and need ${need} more in counters (meld counts only if the team wins a trick).</p>
      <div class="melds">${[0, 2, 1, 3].map(box).join('')}</div>
      <div class="row" style="justify-content:space-between"><span>Us <b>${P.teamMeld(s, 0)}</b> · Them <b>${P.teamMeld(s, 1)}</b></span>
      <button class="btn primary" data-act="start-play">Play the hand</button></div></div>`;
  }
  if (s.phase === 'handOver' || s.phase === 'gameOver') {
    const r = s.result;
    const bidders = r.bidTeam === 0 ? 'Your team' : `${esc(s.names[1])} & ${esc(s.names[3])}`;
    const verdict = r.made ? `${bidders} made the bid of ${r.bid}.` : `${bidders} went set on ${r.bid}.`;
    const good = (r.bidTeam === 0) === r.made;
    const row = (label, f) => `<tr><td>${label}</td><td>${f(0)}</td><td>${f(1)}</td></tr>`;
    let foot = `<button class="btn primary" data-act="next-hand">Deal next hand</button>`;
    let title = `Hand ${s.handNo} results`;
    if (s.phase === 'gameOver') {
      title = s.winner === 0 ? `You and ${esc(s.names[2])} win the game!` : `${esc(s.names[1])} and ${esc(s.names[3])} win the game`;
      foot = `<button class="btn primary" data-act="new-game">Play again</button>`;
    }
    return `<div class="card-panel" style="min-width:min(440px,100%)"><h3>${title}</h3>
      <div class="verdict ${good ? 'good' : 'bad'}">${verdict}</div>
      <table class="score"><thead><tr><th></th><th>Us</th><th>Them</th></tr></thead><tbody>
      ${row('Meld', (t) => r.per[t].tookTrick ? r.per[t].meld : `<s>${r.per[t].meld}</s> (no trick)`)}
      ${row('Counters', (t) => r.per[t].counters)}
      ${row('This hand', (t) => (r.delta[t] >= 0 ? '+' : '') + r.delta[t])}
      ${row('Score', (t) => `<b>${r.scores[t]}</b>`)}
      </tbody></table><div class="row" style="justify-content:flex-end">${foot}</div></div>`;
  }
  return '';
}

function sidePanel() {
  const s = state;
  const contract = s.highBidder === null || s.phase === 'bidding'
    ? `<div class="big">Bidding</div><div style="color:var(--ink-3);font-size:14px">${esc(s.names[s.dealer])} dealt · hand ${s.handNo}</div>`
    : `<div class="big">${s.highBidder === 0 ? 'You' : esc(s.names[s.highBidder])} · ${s.highBid}</div>
       ${s.trump ? `<div style="display:flex;align-items:center;gap:8px">Trump ${suitSpan(s.trump)} ${P.SUIT_NAMES[s.trump]}</div>` : '<div>Naming trump…</div>'}`;
  const counters = (t) => [...s.taken[t], ...s.taken[t + 2]].filter(P.isCounter).length * 10;
  const tricks = (t) => s.tricksWon[t] + s.tricksWon[t + 2];
  const live = s.melds ? `<section class="panel"><h2>This hand</h2>
      <table class="score" style="margin:0"><thead><tr><th></th><th>Us</th><th>Them</th></tr></thead><tbody>
      <tr><td>Meld</td><td>${P.teamMeld(s, 0)}</td><td>${P.teamMeld(s, 1)}</td></tr>
      <tr><td>Tricks</td><td>${tricks(0)}</td><td>${tricks(1)}</td></tr>
      <tr><td>Counters</td><td>${counters(0)}</td><td>${counters(1)}</td></tr></tbody></table></section>` : '';
  const last = s.lastTrick ? `<section class="panel"><h2>Last trick · ${s.lastTrickWinner === 0 ? 'you' : esc(s.names[s.lastTrickWinner])}</h2>
      <div class="row" style="--card-w:44px">${s.lastTrick.map((p) => cardHTML(p.card)).join('')}</div></section>` : '';
  return `<section class="panel"><h2>Contract</h2>${contract}</section>${live}${last}
    <section class="panel"><h2>Table talk</h2><div class="log" aria-live="polite">${s.log.slice(-14).reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div></section>`;
}

function render() {
  const s = state;
  document.getElementById('score-us').textContent = s.scores[0];
  document.getElementById('score-them').textContent = s.scores[1];
  document.getElementById('sub').textContent = `Partnership Auction · hand ${s.handNo}`;
  const felt = document.getElementById('felt');
  paintFelt(felt);
  const b = banner();
  const ov = overlay();
  felt.innerHTML = `
    <div class="seat north">${plate(2)}${backs(2, false)}</div>
    <div class="seat west">${plate(1)}${backs(1, true)}</div>
    <div class="seat east">${plate(3)}${backs(3, true)}</div>
    <div class="center">${trickHTML()}${b ? `<div class="banner" role="status">${b}</div>` : ''}${ov ? `<div class="overlay">${ov}</div>` : ''}</div>
    <div class="seat south">${handHTML()}${plate(0)}</div>`;
  document.getElementById('side').innerHTML = sidePanel();
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
      case 'start-play': set(P.startPlay(s)); break;
      case 'play': set(P.playCard(s, 0, el.dataset.id)); break;
      case 'next-hand': set(P.nextHand(s)); break;
      case 'new-game': set(fresh(s.names)); break; // "Play again": same table
    }
  } catch (err) {
    console.warn(err); // stale click (e.g. double-click during an AI turn): ignore
  }
});

document.getElementById('btn-new').addEventListener('click', () => {
  if (state.phase === 'gameOver' || confirm('Start a new game? The current score will be lost.')) set(fresh());
});
document.getElementById('btn-rules').addEventListener('click', () => document.getElementById('rules').showModal());
window.addEventListener('dc:settings', () => {
  state = { ...state, names: [playerName(), ...state.names.slice(1)] };
  save(); render();
});

render();
schedule();
