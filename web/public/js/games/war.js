// War (2 players). Flip; the higher card takes both. Ties mean war: three down, one up.
import { deck, shuffle, hi, rngOf } from '../core/cards.js';
import { clone, log, fx, must } from './lib/common.js';
import { panel, btn, cw } from '../core/table.js';
import { cardHTML, backHTML } from '../skin.js';

function newGame({ names, seed, opts }) {
  const s = { v: 1, seed, rngN: 0, names: names.slice(0, 2), opts, log: [], fx: [], partners: false };
  const d = shuffle(deck(), rngOf(s));
  s.piles = [d.filter((_, i) => i % 2 === 0), d.filter((_, i) => i % 2 === 1)];
  s.table = [[], []]; s.wars = [0, 0]; s.rounds = 0; s.phase = 'flip'; s.lastWinner = null; s.inWar = false;
  fx(s, 'shuffle');
  log(s, 'The deck is split. Flip to begin!');
  return s;
}

function flip(s) {
  must(s.phase === 'flip', 'Game over.');
  s.rounds++;
  if (!s.inWar) s.table = [[], []];
  for (const p of [0, 1]) {
    if (s.inWar) {
      const down = Math.min(3, Math.max(0, s.piles[p].length - 1));
      s.table[p].push(...s.piles[p].splice(0, down).map((c) => ({ ...c, down: true })));
    }
    if (s.piles[p].length) s.table[p].push(s.piles[p].shift());
  }
  fx(s, s.inWar ? 'deal' : 'flip');
  const a = s.table[0].at(-1), b = s.table[1].at(-1);
  if (!a || !b) return finish(s);
  if (hi(a) === hi(b)) {
    if (!s.piles[0].length || !s.piles[1].length) return finish(s, s.piles[0].length ? 0 : 1);
    s.inWar = true;
    log(s, `Both played a ${a.rank}: WAR!`);
    fx(s, 'bid');
    return s;
  }
  const w = hi(a) > hi(b) ? 0 : 1;
  const pot = [...s.table[0], ...s.table[1]].map(({ down, ...c }) => c);
  s.piles[w].push(...shuffle(pot, rngOf(s)));
  if (s.inWar) { s.wars[w]++; log(s, `${w === 0 ? 'You win' : `${s.names[1]} wins`} the war and ${pot.length} cards!`); fx(s, w === 0 ? 'chips' : 'trick'); }
  s.inWar = false; s.lastWinner = w;
  const target = s.opts.ends;
  if (!s.piles[0].length || !s.piles[1].length) return finish(s, s.piles[0].length ? 0 : 1);
  if (target > 0 && Math.max(...s.wars) >= target) return finish(s, s.wars[0] >= target ? 0 : 1);
  if (s.rounds > 3000) return finish(s, s.piles[0].length >= s.piles[1].length ? 0 : 1);
  return s;
}

function finish(s, w) {
  s.phase = 'gameOver';
  s.gameWinner = w ?? (s.piles[0].length >= s.piles[1].length ? 0 : 1);
  fx(s, s.gameWinner === 0 ? 'win' : 'lose');
  log(s, s.gameWinner === 0 ? 'You win the game!' : `${s.names[1]} wins the game.`);
  return s;
}

const HOWTO = {
  goal: 'Win the wars (three by default), or win every card in the deck.',
  deal: 'The deck is split evenly between you and your opponent: 26 cards each, face down.',
  play: [
    'Both players turn over their top card. The higher card wins both (aces are high and suits don’t matter), and they go to the bottom of the winner’s pile.',
    'A tie means <b>war</b>: each player lays up to three cards face down, then turns one more face up. The higher card takes everything on the table; another tie means another war.',
    'A player who runs out of cards loses, even in the middle of a war.',
  ],
  fig: { cards: '7S · 7H', caption: 'A tie: time for war!' },
  score: 'The first player to win the number of wars you chose wins the game, or, if you play for every card, whoever ends up with the whole deck.',
  options: {
    ends: 'the game ends when a player has won 3, 6 or 9 wars, or when one player holds every card.',
  },
  controls: '{Click} Flip to turn over the next cards, or Flip 10 to play ten turns at once.',
  tip: 'War is pure luck, so sit back and enjoy the battles. Flip 10 speeds through a long game.',
};

export default {
  id: 'war', title: 'War', version: 1, seats: 2, howto: HOWTO,
  settings: [{ key: 'ends', label: 'Game ends', options: [[3, 'After 3 wars won'], [6, 'After 6 wars won'], [9, 'After 9 wars won'], [0, 'When one player has every card']], default: 3 }],
  newGame,
  actor: (s) => (s.phase === 'gameOver' ? null : 0),
  act(state, a) {
    const s = clone(state);
    if (a.act === 'flip') return flip(s);
    if (a.act === 'auto') { for (let i = 0; i < 10 && s.phase === 'flip'; i++) flip(s); s.fx = s.fx.slice(-2); return s; }
    if (a.act === 'again') return newGame({ names: s.names, seed: s.seed + 1, opts: s.opts });
    throw new Error('Unknown action');
  },
  aiAct(state) { return flip(clone(state)); },
  view(s) {
    const opp = s.names[1];
    const row = (p) => `<div class="row" style="--card-w:${cw(74)};gap:6px;justify-content:center;min-height:${cw(110)}">${s.table[p].map((c) => (c.down ? backHTML() : cardHTML(c))).join('')}</div>`;
    let overlay = '';
    if (s.phase === 'gameOver') overlay = panel(s.gameWinner === 0 ? 'You win!' : `${opp} wins`, `<p>Wars won: you ${s.wars[0]}, ${opp} ${s.wars[1]}. Cards: you ${s.piles[0].length}, ${opp} ${s.piles[1].length}.</p><div class="row" style="justify-content:flex-end">${btn('Play again', 'again', '', true)}</div>`);
    const center = `<div style="display:flex;flex-direction:column;gap:14px;align-items:center">${row(1)}
      <div class="row">${s.phase === 'flip' ? `${btn(s.inWar ? 'Flip for the war!' : 'Flip', 'flip', '', true)}${btn('Flip 10', 'auto')}` : ''}</div>${row(0)}</div>`;
    const target = s.opts.ends;
    return {
      subtitle: target ? `First to win ${target} wars` : 'Win every card',
      scores: [{ label: 'You', value: `${s.piles[0].length} cards · ${s.wars[0]} wars`, us: true }, { label: opp, value: `${s.piles[1].length} cards · ${s.wars[1]} wars` }],
      seats: [{ seat: 0, pos: 'south', name: s.names[0], mine: true, tag: `${s.piles[0].length} cards` },
        { seat: 1, pos: 'north', name: opp, count: Math.min(s.piles[1].length, 12), tag: `${s.piles[1].length} cards` }],
      hand: null,
      center, banner: s.inWar ? 'WAR!' : s.lastWinner === null ? 'Flip to start' : `${s.lastWinner === 0 ? 'You take' : `${opp} takes`} the cards`, overlay,
      side: [{ title: 'Wars won', html: `<div>You: ${s.wars[0]}</div><div>${opp}: ${s.wars[1]}</div>` }],
    };
  },
};
