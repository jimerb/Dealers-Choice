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
export const stakesLabel = (s) => (s.denom ? `${fmt(s.denom)} machine` : `${fmt(s.min)}–${s.max == null ? 'no limit' : fmt(s.max)}`);
export const stakesShort = (s) => (s.denom ? fmt(s.denom) : `${fmt(s.min)}–${s.max == null ? '∞' : s.max >= 1000 ? `$${s.max / 1000}K` : fmt(s.max)}`);

/** Chip denominations on the rack. */
export const CHIPS = [1, 5, 25, 100, 500, 1000, 5000, 25000];
/** Chips that have art in assets/art/tokens/chip-<value>.webp (the rest draw a placeholder disc). */
export const CHIP_ART = new Set([1, 5, 25, 100, 500, 1000]);

/** The chips worth offering at a table: from the largest chip not above the minimum, up to the maximum. */
export function rackFor(stakes) {
  if (stakes.denom) return [stakes.denom];
  const low = Math.max(...CHIPS.filter((c) => c <= stakes.min));
  return CHIPS.filter((c) => c >= low && (stakes.max == null || c <= stakes.max));
}

export const CASINO = [
  {
    id: 'table', title: 'Table games', blurb: 'Pick your limits and buy in',
    games: [
      { id: 'blackjack', name: 'Blackjack', blurb: 'Beat the dealer to 21 without going over. Blackjack pays 3 to 2.', action: 'Deal', icon: 'cards' },
      { id: 'roulette', name: 'Roulette', blurb: 'Double-zero wheel. Straight up pays 35 to 1, red or black pays even.', action: 'Spin', icon: 'wheel' },
      { id: 'craps', name: 'Craps', blurb: 'Pass line, come, field and place bets on two dice.', action: 'Roll', icon: 'dice' },
      { id: 'baccarat', name: 'Baccarat', blurb: 'Bet on Player, Banker or a Tie; the cards play themselves.', action: 'Deal', icon: 'cards' },
      { id: 'three-card-poker', name: 'Three Card Poker', blurb: 'Ante and play against the dealer, with a Pair Plus side bet.', action: 'Deal', icon: 'cards' },
      { id: 'let-it-ride', name: 'Let It Ride', blurb: 'Three bets, two community cards. Pull back a bet or let it ride.', action: 'Deal', icon: 'cards' },
      { id: 'caribbean-stud', name: 'Caribbean Stud', blurb: 'Five-card stud against the dealer, who must qualify with ace-king.', action: 'Deal', icon: 'cards' },
      { id: 'pai-gow-poker', name: 'Pai Gow Poker', blurb: 'Split seven cards into a high hand of five and a low hand of two.', action: 'Deal', icon: 'cards' },
    ],
  },
  {
    id: 'machines', title: 'Machines', blurb: 'Choose a denomination',
    games: [
      { id: 'video-poker', name: 'Video Poker', blurb: 'Jacks or Better: hold, draw, and get paid on the pay table.', action: 'Deal', icon: 'cards', machine: true },
      { id: 'slots', name: 'Slots', blurb: 'Three reels, one pay line. Line up the symbols.', action: 'Spin', icon: 'reels', machine: true },
    ],
  },
  {
    id: 'lounge', title: 'Lounge', blurb: 'Take it easy',
    games: [
      { id: 'keno', name: 'Keno', blurb: 'Mark up to ten numbers of 80 and watch twenty come up.', action: 'Play', icon: 'keno', machine: true },
    ],
  },
];

export const ALL_GAMES = CASINO.flatMap((g) => g.games.map((game) => ({ ...game, group: g.id })));
export const gameById = (id) => ALL_GAMES.find((g) => g.id === id) ?? null;
export const stakesFor = (game) => (game.machine ? MACHINE_STAKES : TABLE_STAKES);
export const stakesById = (game, id) => stakesFor(game).find((s) => s.id === String(id)) ?? stakesFor(game)[0];
