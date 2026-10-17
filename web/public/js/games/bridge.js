// Rubber Bridge. You (South) partner North. When your side declares you play both hands.
// The bidding AI uses a simplified natural (Standard American style) system.
import { deck, shuffle, sortCards, hi, rngOf, SYM } from '../core/cards.js';
import { clone, log, fx, who, trickWinner, followSuit, followPlay, seatsVM, must, POS4 } from './lib/common.js';
import { trickHTML, panel, btn, scoreTable } from '../core/table.js';

const STRAINS = ['C', 'D', 'H', 'S', 'NT'];
const SNAME = { C: '♣', D: '♦', H: '♥', S: '♠', NT: 'NT' };
const team = (p) => p % 2;
const partnerOf = (p) => (p + 2) % 4;
const bidIndex = (b) => (b.level - 1) * 5 + STRAINS.indexOf(b.strain);
const callText = (c) => (c.type === 'bid' ? `${c.level}${SNAME[c.strain]}` : c.type === 'pass' ? 'Pass' : c.type === 'double' ? 'Dbl' : 'Rdbl');

// ------------------------------------------------------------------ hand evaluation
const HCP = { A: 4, K: 3, Q: 2, J: 1 };
export const hcp = (h) => h.reduce((t, c) => t + (HCP[c.rank] ?? 0), 0);
const lens = (h) => Object.fromEntries(['C', 'D', 'H', 'S'].map((s) => [s, h.filter((c) => c.suit === s).length]));
/** Balanced: no void or singleton, at most one doubleton (4-3-3-3, 4-4-3-2, 5-3-3-2). */
const balanced = (h) => { const l = Object.values(lens(h)).sort((a, b) => a - b); return l[0] >= 2 && l[1] >= 3; };
const lengthPts = (h) => Object.values(lens(h)).reduce((t, n) => t + Math.max(0, n - 4), 0);

function deal(s) {
  const rng = rngOf(s);
  s.dealNo++; s.dealer = (s.dealer + 1) % 4;
  const d = shuffle(deck(), rng);
  s.hands = [0, 1, 2, 3].map((i) => sortCards(d.slice(i * 13, i * 13 + 13)));
  s.auction = []; s.phase = 'auction'; s.turn = s.dealer;
  s.contract = null; s.declarer = null; s.dummy = null; s.trick = []; s.tricks = [0, 0]; s.trickNo = 0; s.leadMade = false; s.result = null;
  fx(s, 'shuffle');
  log(s, `Deal ${s.dealNo}: ${s.names[s.dealer]} deals.${vul(s, 0) || vul(s, 1) ? ` Vulnerable: ${[vul(s, 0) ? 'us' : null, vul(s, 1) ? 'them' : null].filter(Boolean).join(' and ')}.` : ''}`);
  return s;
}

const vul = (s, t) => s.games[t] >= 1;
const lastBid = (s) => [...s.auction].reverse().find((c) => c.type === 'bid');

export function legalCalls(s, p) {
  const out = [{ type: 'pass' }];
  const lb = lastBid(s);
  const start = lb ? bidIndex(lb) + 1 : 0;
  for (let i = start; i < 35; i++) out.push({ type: 'bid', level: Math.floor(i / 5) + 1, strain: STRAINS[i % 5] });
  const last = [...s.auction].reverse().find((c) => c.type !== 'pass');
  if (last && lb) {
    const lastSeat = s.auction.lastIndexOf(last);
    const bySeat = (s.dealer + lastSeat) % 4;
    if (last.type === 'bid' && team(bySeat) !== team(p)) out.push({ type: 'double' });
    if (last.type === 'double' && team(bySeat) !== team(p)) out.push({ type: 'redouble' });
  }
  return out;
}

function call(s, p, c) {
  must(s.phase === 'auction' && s.turn === p, 'Not your turn to call.');
  must(legalCalls(s, p).some((x) => callText(x) === callText(c)), 'That call isn’t allowed now.');
  s.auction.push(c);
  fx(s, c.type === 'pass' ? 'pass' : 'bid');
  const n = s.auction.length;
  const passes = (k) => s.auction.slice(-k).every((x) => x.type === 'pass');
  if (n === 4 && passes(4)) { log(s, 'Passed out: redeal.'); s.dealer = (s.dealer + 3) % 4; s.dealNo--; return deal(s); }
  if (n >= 4 && passes(3) && lastBid(s)) return finishAuction(s);
  s.turn = (p + 1) % 4;
  return s;
}

function finishAuction(s) {
  const lb = lastBid(s);
  const idx = s.auction.lastIndexOf(lb);
  const bidder = (s.dealer + idx) % 4;
  const after = s.auction.slice(idx + 1);
  const doubled = after.some((c) => c.type === 'redouble') ? 2 : after.some((c) => c.type === 'double') ? 1 : 0;
  // Declarer: first player of the bidding side to name this strain.
  const declarer = s.auction.map((c, i) => ({ c, p: (s.dealer + i) % 4 })).find((x) => x.c.type === 'bid' && x.c.strain === lb.strain && team(x.p) === team(bidder)).p;
  s.contract = { level: lb.level, strain: lb.strain, doubled };
  s.declarer = declarer; s.dummy = partnerOf(declarer);
  s.trump = lb.strain === 'NT' ? null : lb.strain;
  s.hands = s.hands.map((h) => sortCards(h, { trump: s.trump }));
  s.phase = 'play'; s.turn = (declarer + 1) % 4;
  log(s, `Contract: ${lb.level}${SNAME[lb.strain]}${doubled === 2 ? ' redoubled' : doubled ? ' doubled' : ''} by ${who(s, declarer)}.`);
  return s;
}

/** Who controls seat p's cards: the human controls South, and North too whenever our side declares. */
export const controller = (s, p) => (p === 0 || (p === 2 && team(s.declarer) === 0 && s.phase !== 'auction') ? 0 : p);
const legal = (s, p) => followSuit(s.hands[p], s.trick);

function play(s, p, id) {
  must(s.phase === 'play' && s.turn === p, 'Not that hand’s turn.');
  const card = s.hands[p].find((c) => c.id === id);
  must(card, 'Card not in that hand.');
  must(legal(s, p).some((c) => c.id === id), 'You must follow suit.');
  s.hands[p] = s.hands[p].filter((c) => c.id !== id);
  s.trick.push({ seat: p, card });
  s.leadMade = true;
  fx(s, 'card');
  if (s.trick.length === 4) { s.phase = 'trickDone'; s.winner = s.trick[trickWinner(s.trick, s.trump)].seat; s.turn = null; }
  else s.turn = (p + 1) % 4;
  return s;
}

function collect(s) {
  const w = s.winner;
  s.tricks[team(w)]++; s.trickNo++; s.trick = [];
  fx(s, 'trick');
  if (s.trickNo === 13) return score(s);
  s.phase = 'play'; s.turn = w;
  return s;
}

// ------------------------------------------------------------------ scoring
function score(s) {
  const { level, strain, doubled } = s.contract;
  const dt = team(s.declarer);
  const v = vul(s, dt);
  const took = s.tricks[dt];
  const need = level + 6;
  const mult = doubled === 2 ? 4 : doubled ? 2 : 1;
  const per = (n) => (strain === 'C' || strain === 'D' ? 20 : 30) * n + (strain === 'NT' ? 10 : 0);
  const res = { dt, took, need, below: 0, above: [0, 0], notes: [] };
  if (took >= need) {
    const trickPts = per(level) * mult;
    res.below = trickPts;
    res.notes.push(`Contract made: ${trickPts} below the line`);
    const over = took - need;
    if (over) {
      const overPts = doubled ? over * (v ? 200 : 100) * (doubled === 2 ? 2 : 1) : over * (strain === 'C' || strain === 'D' ? 20 : 30);
      res.above[dt] += overPts; res.notes.push(`${over} overtrick${over > 1 ? 's' : ''}: ${overPts}`);
    }
    if (doubled) { res.above[dt] += doubled === 2 ? 100 : 50; res.notes.push(`For the insult: ${doubled === 2 ? 100 : 50}`); }
    if (level === 6) { const b = v ? 750 : 500; res.above[dt] += b; res.notes.push(`Small slam: ${b}`); }
    if (level === 7) { const b = v ? 1500 : 1000; res.above[dt] += b; res.notes.push(`Grand slam: ${b}`); }
    s.below[dt] += trickPts;
  } else {
    const down = need - took;
    let pen = 0;
    for (let i = 1; i <= down; i++) {
      if (!doubled) pen += v ? 100 : 50;
      else pen += (v ? (i === 1 ? 200 : 300) : (i === 1 ? 100 : i <= 3 ? 200 : 300)) * (doubled === 2 ? 2 : 1);
    }
    res.above[1 - dt] += pen; res.notes.push(`Down ${down}: ${pen} to the defenders`);
  }
  s.above = s.above.map((x, t) => x + res.above[t]);
  // Game?
  if (s.below[dt] >= 100) {
    s.games[dt]++; s.belowHistory.push([...s.below]); s.below = [0, 0];
    res.notes.push(`${dt === 0 ? 'We' : 'They'} win a game`);
  }
  s.result = res;
  s.turn = null;
  if (s.games[dt] === 2) {
    const bonus = s.games[1 - dt] === 0 ? 700 : 500;
    s.above[dt] += bonus;
    res.notes.push(`Rubber bonus: ${bonus}`);
    const total = (t) => s.above[t] + s.belowHistory.reduce((a, b) => a + b[t], 0) + s.below[t];
    s.rubberTotals = [total(0), total(1)];
    s.phase = 'gameOver';
    fx(s, s.rubberTotals[0] > s.rubberTotals[1] ? 'win' : 'lose');
  } else { s.phase = 'handOver'; fx(s, team(s.declarer) === 0 === (took >= need) ? 'score' : 'lose'); }
  log(s, res.notes[0]);
  return s;
}

// ------------------------------------------------------------------ bidding AI
function shown(s, p) {
  // What partner p has shown: { min points, suit lengths }.
  const info = { min: 0, len: { C: 0, D: 0, H: 0, S: 0 }, nt: false, bid: false };
  s.auction.forEach((c, i) => {
    const seat = (s.dealer + i) % 4;
    if (seat !== p || c.type !== 'bid') return;
    const firstOfSide = !s.auction.slice(0, i).some((x, j) => x.type === 'bid' && team((s.dealer + j) % 4) === team(p));
    info.bid = true;
    if (c.strain === 'NT') { info.nt = true; info.min = Math.max(info.min, c.level === 1 ? (firstOfSide ? 15 : 6) : c.level === 2 ? (firstOfSide ? 20 : 11) : 13); for (const k in info.len) info.len[k] = Math.max(info.len[k], 2); }
    else {
      info.len[c.strain] = Math.max(info.len[c.strain] + (info.len[c.strain] ? 1 : 0), (c.strain === 'H' || c.strain === 'S') && firstOfSide ? 5 : 4);
      info.min = Math.max(info.min, firstOfSide ? 12 : c.level === 1 ? 6 : 10);
    }
  });
  return info;
}

function cheapest(s, strain, maxLevel) {
  const lb = lastBid(s);
  const start = lb ? bidIndex(lb) + 1 : 0;
  for (let i = start; i < 35; i++) if (STRAINS[i % 5] === strain) { const level = Math.floor(i / 5) + 1; return level <= maxLevel ? { type: 'bid', level, strain } : null; }
  return null;
}

export function aiCall(s, p) {
  const h = s.hands[p];
  const pts = hcp(h) + lengthPts(h);
  const L = lens(h);
  const P = shown(s, partnerOf(p));
  const lb = lastBid(s);
  const ourBid = lb && team((s.dealer + s.auction.lastIndexOf(lb)) % 4) === team(p);
  const anyBid = Boolean(lb);
  const longest = ['S', 'H', 'D', 'C'].sort((a, b) => L[b] - L[a] || ['S', 'H', 'D', 'C'].indexOf(a) - ['S', 'H', 'D', 'C'].indexOf(b))[0];
  const myBid = s.auction.some((c, i) => (s.dealer + i) % 4 === p && c.type === 'bid');
  const pass = { type: 'pass' };

  if (!P.bid && !myBid) {
    if (!anyBid) {
      // Opening.
      if (hcp(h) >= 20 && hcp(h) <= 21 && balanced(h)) return { type: 'bid', level: 2, strain: 'NT' };
      if (hcp(h) >= 15 && hcp(h) <= 17 && balanced(h)) return { type: 'bid', level: 1, strain: 'NT' };
      if (pts >= 13 || hcp(h) >= 12) {
        const major = L.S >= 5 || L.H >= 5 ? (L.S >= L.H ? 'S' : 'H') : null;
        const minor = L.D > L.C || (L.D === L.C && L.D >= 4) ? 'D' : 'C';
        return { type: 'bid', level: 1, strain: major ?? minor };
      }
      if (L[longest] >= 6 && hcp(h) >= 6 && hcp(h) <= 10 && longest !== 'C') return { type: 'bid', level: 2, strain: longest }; // weak two
      return pass;
    }
    // Overcall.
    if (L[longest] >= 5 && hcp(h) >= 9) { const b = cheapest(s, longest, hcp(h) >= 12 ? 2 : 1); if (b) return b; }
    if (hcp(h) >= 15 && hcp(h) <= 18 && balanced(h)) { const b = cheapest(s, 'NT', 1); if (b) return b; }
    return pass;
  }

  // Partnership bidding: estimate combined strength and a fit.
  const combined = pts + P.min + (P.min ? 1 : 0);
  const fits = ['S', 'H', 'D', 'C'].filter((x) => L[x] + P.len[x] >= 8);
  let strain;
  if (fits.includes('S') || fits.includes('H')) strain = fits.includes('S') && L.S + P.len.S >= L.H + P.len.H ? 'S' : 'H';
  else if (balanced(h) || P.nt) strain = 'NT';
  else if (fits.length) strain = fits[0];
  else strain = L[longest] >= 6 ? longest : 'NT';
  const target = combined >= 33 ? 6 : combined >= 25 ? (strain === 'NT' ? 3 : strain === 'H' || strain === 'S' ? 4 : 5) : combined >= 23 && strain === 'NT' ? 2 : P.bid ? (myBid ? 0 : 2) : 0;
  if (!P.bid && myBid) {
    // We opened and partner passed: compete only with a long suit.
    if (lb && !ourBid && L[longest] >= 6 && pts >= 15) return cheapest(s, longest, 3) ?? pass;
    return pass;
  }
  // Responding to partner for the first time with a decent hand: show a new 4+ suit at the 1 level.
  if (!myBid && P.bid && pts >= 6 && !fits.length && !P.nt) {
    for (const x of ['C', 'D', 'H', 'S']) if (L[x] >= 4) { const b = cheapest(s, x, 1); if (b) return b; }
    if (pts <= 10) { const b = cheapest(s, 'NT', 1); if (b) return b; }
  }
  if (target === 0) return pass;
  if (ourBid && lb.level >= target && (lb.strain === strain || lb.level >= target + 1 || strain === 'NT')) return pass;
  const b = cheapest(s, strain, target);
  if (b) return b;
  // Opponents outbid us: double if we have the balance of power.
  if (lb && !ourBid && combined >= 24 && lb.level >= 3 && legalCalls(s, p).some((c) => c.type === 'double')) return { type: 'double' };
  return pass;
}

// ------------------------------------------------------------------ play AI
function aiPlay(s, p) {
  const L = legal(s, p);
  if (L.length === 1) return L[0].id;
  if (!s.trick.length) {
    const hand = s.hands[p];
    const nonTrump = ['S', 'H', 'D', 'C'].filter((x) => x !== s.trump && hand.some((c) => c.suit === x));
    // Cash an A-K, otherwise lead from the longest side suit (top of a sequence, else low).
    for (const x of nonTrump) { const cs = hand.filter((c) => c.suit === x).sort((a, b) => hi(b) - hi(a)); if (cs.length >= 2 && hi(cs[0]) === 14 && hi(cs[1]) === 13) return cs[0].id; }
    const suit = (nonTrump.length ? nonTrump : ['S', 'H', 'D', 'C'].filter((x) => hand.some((c) => c.suit === x)))
      .sort((a, b) => hand.filter((c) => c.suit === b).length - hand.filter((c) => c.suit === a).length)[0];
    const cs = hand.filter((c) => c.suit === suit).sort((a, b) => hi(b) - hi(a));
    if (cs.length >= 2 && hi(cs[0]) - hi(cs[1]) === 1 && hi(cs[0]) >= 12) return cs[0].id;
    return cs[Math.min(cs.length - 1, 3)].id;
  }
  return followPlay(L, s.trick, p, s.trump, { partnerOf: partnerOf(p) }).id;
}

const RULES = `<p>You sit South with your partner across the table at North, against the players at West and East.</p>
<h3>The auction</h3><p>Starting with the dealer, players bid a number of tricks over six (1 to 7) and a trump suit or no-trump (♣ < ♦ < ♥ < ♠ < NT), or pass, double, or redouble. Three passes after a bid end the auction. The last bid is the contract.</p>
<h3>Play</h3><p>The player left of the declarer leads, then the declarer's partner (dummy) lays their cards face up. When your side declares, you play both your hand and your partner's. Follow suit if you can.</p>
<h3>Scoring (rubber)</h3><p>Tricks bid and made score below the line (♣♦ 20, ♥♠ 30, NT 40 then 30). 100 below the line wins a game, and two games win the rubber (bonus 700, or 500 if the rubber went three games). Overtricks, slams, doubled contracts and penalties score above the line. Vulnerable sides (with a game) score bigger bonuses and penalties.</p>
<p>The computer bids with a simplified natural system (Standard American style).</p>`;

export default {
  id: 'bridge', title: 'Bridge', version: 1, seats: 4, rulesHTML: RULES,
  newGame({ names, seed, opts }) {
    return deal({ v: 1, seed, rngN: 0, names: names.slice(0, 4), opts, dealNo: 0, dealer: 3, games: [0, 0], below: [0, 0], above: [0, 0], belowHistory: [], log: [], fx: [] });
  },
  actor(s) {
    if (s.phase === 'gameOver') return null;
    if (s.phase === 'trickDone') return 'auto';
    if (s.phase === 'handOver') return 0;
    if (s.phase === 'auction') return s.turn;
    return controller(s, s.turn);
  },
  delay: (s) => (s.phase === 'trickDone' ? 1100 : s.phase === 'auction' ? 900 : 650),
  act(state, a) {
    const s = clone(state);
    if (a.act === 'call') {
      const c = a.type === 'bid' ? { type: 'bid', level: Number(a.level), strain: a.strain } : { type: a.type };
      return call(s, 0, c);
    }
    if (a.act === 'play') {
      must(s.phase === 'play' && controller(s, s.turn) === 0, 'Wait for your turn.');
      const from = a.from !== undefined ? Number(a.from) : 0;
      must(from === s.turn, from === 2 ? `It’s not ${s.names[2]}’s turn.` : 'It’s not your hand’s turn.');
      return play(s, from, a.id);
    }
    if (a.act === 'next') return deal(s);
    if (a.act === 'again') return this.newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) {
    const s = clone(state);
    if (s.phase === 'trickDone') return collect(s);
    if (s.phase === 'handOver') return deal(s);
    if (s.phase === 'auction') return call(s, s.turn, aiCall(s, s.turn));
    return play(s, s.turn, aiPlay(s, s.turn));
  },
  view(s) {
    let overlay = '', banner = '';
    const ourDecl = s.declarer !== null && team(s.declarer) === 0;
    if (s.phase === 'auction' && s.turn === 0) {
      const legalSet = new Set(legalCalls(s, 0).map(callText));
      const grid = [1, 2, 3, 4, 5, 6, 7].map((lv) => `<div class="bid-row">${STRAINS.map((st) => {
        const c = { type: 'bid', level: lv, strain: st };
        const ok = legalSet.has(callText(c));
        return `<button class="btn sm bid-btn${st === 'H' || st === 'D' ? ' red' : ''}" data-act="call" data-type="bid" data-level="${lv}" data-strain="${st}" ${ok ? '' : 'disabled'}>${lv}${SNAME[st]}</button>`;
      }).join('')}</div>`).join('');
      overlay = panel('Your call', `<p>${hcp(s.hands[0])} high-card points.</p><div class="bid-grid">${grid}</div>
        <div class="row" style="margin-top:10px">${btn('Pass', 'call', 'data-type="pass"', true)}${legalSet.has('Dbl') ? btn('Double', 'call', 'data-type="double"') : ''}${legalSet.has('Rdbl') ? btn('Redouble', 'call', 'data-type="redouble"') : ''}</div>`, 'max-width:440px');
    } else if (s.phase === 'handOver' || s.phase === 'gameOver') {
      const r = s.result;
      const made = r.took >= r.need;
      const title = s.phase === 'gameOver' ? (s.rubberTotals[0] > s.rubberTotals[1] ? 'You win the rubber!' : 'They win the rubber') : `${s.contract.level}${SNAME[s.contract.strain]} by ${who(s, s.declarer)}: ${made ? 'made' : 'set'}`;
      overlay = panel(title, `<div class="verdict ${(r.dt === 0) === made ? 'good' : 'bad'}">${r.took} tricks (needed ${r.need})</div><p>${r.notes.join('<br>')}</p>
        ${scoreTable(['We', 'They'], [['Above the line', s.above[0], s.above[1]], ['Below (this game)', s.below[0], s.below[1]], ['Games', s.games[0], s.games[1]], ...(s.rubberTotals ? [['Rubber total', `<b>${s.rubberTotals[0]}</b>`, `<b>${s.rubberTotals[1]}</b>`]] : [])])}
        <div class="row" style="justify-content:flex-end">${s.phase === 'gameOver' ? btn('New rubber', 'again', '', true) : btn('Next deal', 'next', '', true)}</div>`);
    } else if (s.phase === 'trickDone') banner = `${who(s, s.winner)} ${s.winner === 0 ? 'win' : 'wins'} the trick`;
    else if (s.phase === 'auction') banner = `${who(s, s.turn)} is bidding…`;
    else if (controller(s, s.turn) === 0) banner = s.turn === 2 ? `Play from ${s.names[2]}’s hand (dummy)` : 'Your turn';
    else banner = `${who(s, s.turn)} to play`;
    const showDummy = s.phase !== 'auction' && s.leadMade && s.dummy !== null;
    const humanTurnOn = (p) => (s.phase === 'play' && s.turn === p && controller(s, p) === 0);
    const seats = seatsVM(s, 4, (i) => {
      const faceUp = (i === s.dummy && showDummy) || (i === 2 && ourDecl && s.phase !== 'auction') ? s.hands[i] : null;
      return { faceUp, faceUpWidth: 40, faceUpLabel: i === s.dummy ? 'Dummy' : 'Declarer', playable: faceUp && humanTurnOn(i) ? legal(s, i).map((c) => c.id) : null,
        count: faceUp ? 0 : i ? s.hands[i].length : 0, tag: i === s.declarer ? 'Declarer' : i === s.dummy ? 'Dummy' : '' };
    });
    const header = [s.names[1], s.names[2], s.names[3], 'You'];
    const rows = [];
    let row = Array(4).fill('');
    const colOf = (seat) => [1, 2, 3, 0].indexOf(seat);
    s.auction.forEach((c, i) => { const seat = (s.dealer + i) % 4; const k = colOf(seat); if (i === 0) for (let j = 0; j < k; j++) row[j] = ''; row[k] = callText(c); if (k === 3) { rows.push(row); row = Array(4).fill(''); } });
    if (row.some(Boolean)) rows.push(row);
    const auctionHTML = `<table class="score auction"><thead><tr>${header.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return {
      subtitle: `Deal ${s.dealNo} · rubber bridge${s.contract ? ` · ${s.contract.level}${SNAME[s.contract.strain]}${s.contract.doubled ? (s.contract.doubled === 2 ? 'XX' : 'X') : ''} by ${who(s, s.declarer)}` : ''}`,
      scores: [{ label: 'We', value: `${s.games[0]} games · ${s.above[0] + s.below[0]}`, us: true }, { label: 'They', value: `${s.games[1]} games · ${s.above[1] + s.below[1]}` }],
      seats,
      hand: { cards: s.hands[0], legal: humanTurnOn(0) ? legal(s, 0).map((c) => c.id) : null },
      center: trickHTML(s.trick.map((p) => ({ pos: POS4[p.seat], card: p.card })), s.phase === 'trickDone' ? POS4[s.winner] : null),
      banner, overlay,
      side: [{ title: 'Auction', html: auctionHTML },
        { title: 'Tricks', html: s.contract ? scoreTable(['We', 'They'], [['Taken', s.tricks[0], s.tricks[1]]]) : '—' }],
    };
  },
};
