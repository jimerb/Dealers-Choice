// The casino's games, grouped as the chooser shows them (tile order is build order), and the
// stakes each kind of game is offered at.

/** Table limits for table games: [id, min, max] (max null = no limit). */
export const TABLE_STAKES = [
  { id: '5', min: 5, max: 1000 },
  { id: '10', min: 10, max: 2000 },
  { id: '25', min: 25, max: 3000 },
  { id: '100', min: 100, max: null },
];
/** Machine (and Keno) denominations: one credit costs `min` dollars. */
export const MACHINE_STAKES = [
  { id: '1', min: 1, max: null, denom: 1 },
  { id: '5', min: 5, max: null, denom: 5 },
  { id: '25', min: 25, max: null, denom: 25 },
];

const fmt = (n) => `$${n.toLocaleString('en-US')}`;
/** "$5–$1,000", "$5 machine"; Keno (a `room`, not a machine) is "$5 room". */
export const stakesLabel = (s, game = null) => (s.denom ? `${fmt(s.denom)} ${game?.room ? 'room' : 'machine'}` : `${fmt(s.min)}–${s.max == null ? 'no limit' : fmt(s.max)}`);
export const stakesShort = (s) => (s.denom ? fmt(s.denom) : `${fmt(s.min)}–${s.max == null ? '∞' : s.max >= 1000 ? `$${s.max / 1000}K` : fmt(s.max)}`);

/** Chip denominations on the rack. */
export const CHIPS = [1, 5, 25, 100, 500, 1000, 5000, 25000];
/** Chips that have art in assets/art/tokens/chip-<value>.webp (any other value draws a plain disc). */
export const CHIP_ART = new Set(CHIPS);

/** The chips worth offering at a table: from the largest chip not above the minimum up to the
 *  first chip at or above the maximum (every chip at a no-limit table). */
export function rackFor(stakes) {
  if (stakes.denom) return [stakes.denom];
  const low = Math.max(...CHIPS.filter((c) => c <= stakes.min));
  const high = stakes.max == null ? Infinity : (CHIPS.find((c) => c >= stakes.max) ?? Infinity);
  return CHIPS.filter((c) => c >= low && c <= high);
}

// `felt` is each game's tile colour in the chooser.
export const CASINO = [
  {
    id: 'table', title: 'Table games', blurb: 'Pick your limits and buy in',
    games: [
      { id: 'blackjack', felt: '#1E5A46', name: 'Blackjack', blurb: 'Beat the dealer to 21 without going over. Blackjack pays 3 to 2.', action: 'Deal', icon: 'cards' },
      { id: 'roulette', felt: '#6B2E2E', name: 'Roulette', blurb: 'American or European wheel. Straight up pays 35 to 1, red or black pays even.', action: 'Spin', icon: 'wheel' },
      { id: 'craps', felt: '#2E5E3A', name: 'Craps', blurb: 'Pass line, come, field and place bets on two dice.', action: 'Roll', icon: 'dice' },
      { id: 'baccarat', felt: '#4A2E5E', name: 'Baccarat', blurb: 'Bet on Player, Banker or a Tie; the cards play themselves.', action: 'Deal', icon: 'cards' },
      { id: 'three-card-poker', felt: '#24506B', name: 'Three Card Poker', blurb: 'Ante and play against the dealer, with a Pair Plus side bet.', action: 'Deal', icon: 'cards' },
      { id: 'let-it-ride', felt: '#5A4A24', name: 'Let It Ride', blurb: 'Three bets, two community cards. Pull back a bet or let it ride.', action: 'Deal', icon: 'cards' },
      { id: 'caribbean-stud', felt: '#1F5560', name: 'Caribbean Stud', blurb: 'Five-card stud against the dealer, who must qualify with ace-king.', action: 'Deal', icon: 'cards' },
      { id: 'pai-gow-poker', felt: '#6B4A24', name: 'Pai Gow Poker', blurb: 'Split seven cards into a high hand of five and a low hand of two.', action: 'Deal', icon: 'cards' },
    ],
  },
  {
    id: 'machines', title: 'Machines', blurb: 'Choose a denomination',
    games: [
      { id: 'video-poker', felt: '#2A3F6B', name: 'Video Poker', blurb: 'Jacks or Better: hold, draw, and get paid on the pay table.', action: 'Deal', icon: 'cards', machine: true },
      { id: 'slots', felt: '#5E3A54', name: 'Slots', subtitle: 'Brass Crown', blurb: 'Three reels, one pay line. Crowns are wild; three crowns pay the top award.', action: 'Spin', icon: 'reels', machine: true },
    ],
  },
  {
    id: 'lounge', title: 'Lounge', blurb: 'Take it easy',
    games: [
      { id: 'keno', felt: '#3F5A2A', name: 'Keno', blurb: 'Mark up to ten numbers of 80 and watch twenty come up.', action: 'Play', icon: 'keno', machine: true, room: true },
    ],
  },
];

export const ALL_GAMES = CASINO.flatMap((g) => g.games.map((game) => ({ ...game, group: g.id })));
export const gameById = (id) => ALL_GAMES.find((g) => g.id === id) ?? null;
export const stakesFor = (game) => (game.machine ? MACHINE_STAKES : TABLE_STAKES);
export const stakesById = (game, id) => stakesFor(game).find((s) => s.id === String(id)) ?? stakesFor(game)[0];
