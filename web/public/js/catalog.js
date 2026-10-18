// The game catalog. One entry per game; `status: 'ready'` games link to their table.
// `felt` is the lobby tile's backdrop colour while its art loads.

export const CATEGORIES = [
  { id: 'trick', title: 'Trick-taking', blurb: 'Bid it, call trump, win the tricks' },
  { id: 'meld', title: 'Melding & drawing', blurb: 'Sets, runs and pegs' },
  { id: 'casino', title: 'Casino', blurb: 'Chips on the felt' },
  { id: 'family', title: 'Family table', blurb: 'Quick games for every age' },
];

/** Pinochle's ways to play, each opening its own table (pinochle.html?v=<id>). */
export const PINOCHLE_VARIANTS = [
  ['auction', 'Partnership Auction'], ['two-handed', 'Two-Handed'], ['double-pack', 'Double-Pack'], ['partnership', 'Partnership'], ['cutthroat', 'Cutthroat'],
].map(([id, name]) => ({ id, name, href: `pinochle.html?v=${id}` }));

const g = (id, name, category, players, tagline, felt, extra = {}) => ({ id, name, category, players, tagline, felt, status: 'soon', ...extra });
/** Games playable on the generic table (play.html?g=<id>) list their module here. */
export const READY = new Set(['bridge', 'spades', 'hearts', 'euchre', 'pitch', 'skat', 'tarot', 'gin', 'canasta', 'cribbage', 'crazy8', 'poker', 'gofish', 'oldmaid', 'war', 'memory']);
const ready = (x) => (READY.has(x.id) ? { ...x, status: 'ready', module: x.id, href: `play.html?g=${x.id}` } : x);

export const GAMES = [
  // pinochle has its own page
  g('pinochle', 'Pinochle', 'trick', '2 or 4 players', 'Auction, two-handed, double-pack and more', '#1E6B52',
    { status: 'ready', href: 'pinochle.html', featured: true, variants: PINOCHLE_VARIANTS }),
  g('bridge', 'Bridge', 'trick', '4 players · partners', 'Rubber or Chicago scoring', '#24506B'),
  g('spades', 'Spades', 'trick', '4 players · partners', 'Nil, double nil and bags', '#3B3F6B'),
  g('hearts', 'Hearts', 'trick', '4 players', 'Dodge the queen or shoot the moon', '#6B2E3A'),
  g('euchre', 'Euchre', 'trick', '4 players · partners', 'Bowers, loners, stick the dealer', '#5A4A24'),
  g('pitch', 'Pitch', 'trick', '4 players · cutthroat', 'High, low, jack and game', '#4A5A2A'),
  g('skat', 'Skat', 'trick', '3 players', 'The German classic', '#3F3A5E'),
  g('tarot', 'Tarot', 'trick', '4 players', 'French trumps and the excuse', '#5E3A54'),
  g('gin', 'Gin Rummy', 'meld', '2 players', 'Gin or Oklahoma Gin', '#2D5E5A'),
  g('canasta', 'Canasta', 'meld', '4 players · partners', 'Two decks, wild twos and red threes', '#6B4A24'),
  g('cribbage', 'Cribbage', 'meld', '2 players', 'Fifteen-two, fifteen-four… to 121', '#4F3B2A'),
  g('crazy8', 'Crazy Eights', 'meld', '2–4 players', 'Eights are wild, very crazy mode', '#2A4F6B'),
  g('poker', 'Poker', 'casino', '2–6 players', 'Five-card draw', '#1F4A3A'),
  g('gofish', 'Go Fish', 'family', '4 players', 'Got any fives?', '#245A6B'),
  g('oldmaid', 'Old Maid', 'family', '4 players', "Don't get stuck with the odd card", '#5E4A6B'),
  g('war', 'War', 'family', '2 players', 'Flip, compare, declare war', '#6B3A2A'),
  g('memory', 'Memory Match', 'family', '1–2 players', 'Find every pair', '#3A5E2A'),
].map(ready);

/** The solitaire parlor, grouped by deck count (name, layout id). */
export const SOLITAIRE = [
  { title: 'One deck · A–F', games: [['Aces Up', 'acesup'], ["Baker's Dozen", 'bakers'], ['Baroness', 'baroness'], ['Beleaguered Castle', 'castle'], ['Betsy Ross', 'betsyross'], ['Bowling', 'bowling'], ['Bristol', 'bristol'], ['Calculation', 'calculation'], ['Canfield', 'canfield'], ['Clock', 'clock'], ['Cribbage Square', 'cribsquare'], ['Eagle Wing', 'eaglewing'], ['Eight Off', 'eightoff'], ['Eliminator', 'eliminator'], ['Euchre', 'euchresol'], ['Flower Garden', 'flower'], ['Fortress', 'fortress']] },
  { title: 'One deck · G–Z', games: [['Four Free', 'fourfree'], ['Four Seasons', 'fourseasons'], ['Gaps', 'gaps'], ['Golf', 'golf'], ['Klondike', 'klondike'], ['Klondike (draw 3)', 'klondike3'], ['La Belle Lucie', 'labellelucie'], ['Nestor', 'nestor'], ['Penguin', 'penguin'], ['Poker Square', 'pokersquare'], ['Pyramid', 'pyramid'], ['Scorpion', 'scorpion'], ['Seahaven Towers', 'seahaven'], ['Shamrocks', 'shamrocks'], ['Slide', 'slide'], ['Spiderette', 'spiderette'], ['Strategy', 'strategy'], ['Triplets', 'triplets'], ['Yukon', 'yukon']] },
  { title: 'Two decks', games: [['Aces and Kings', 'acesandkings'], ['Alhambra', 'alhambra'], ['Batsford', 'batsford'], ['Colorado', 'colorado'], ['Forty Thieves', 'forty'], ['Mount Olympus', 'mountolympus'], ['Red and Black', 'redandblack'], ['Spider', 'spider'], ['Sultan', 'sultan'], ['Terrace', 'terrace']] },
  { title: 'Arcade', games: [['3 Towers', 'towers'], ['Best 21', 'best21'], ['Fast 21', 'fast21'], ['Pick 2', 'pick2'], ['Sum 11', 'sum11']] },
];
