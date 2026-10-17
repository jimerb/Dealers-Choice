// The computer opponents who sit in at the tables, plus the portraits a human player can choose.
// Pure data and helpers: no DOM, so the picker can be unit-tested.

const ART = '/assets/art/cast';
// Each portrait comes in two sizes: a 96px thumbnail for nameplates and the header, 256px for the picker.
const thumb = (id) => `${ART}/${id}-96.webp`;
const large = (id) => `${ART}/${id}.webp`;

/** The twelve regulars of the card room. `games` lists the tables each one is especially fond of. */
export const CAST = [
  { id: 'mabel', name: 'Mabel', bio: 'Retired schoolteacher. Careful, kind, and quietly counting every card.', games: ['hearts', 'bridge'] },
  { id: 'dex', name: 'Dex', bio: 'Street magician with quick hands and a quicker grin. Loves a good bluff.', games: ['poker', 'crazy8'] },
  { id: 'colonel', name: 'Colonel', bio: 'Old soldier with a magnificent mustache. Bids boldly and never retreats.', games: ['bridge', 'pinochle', 'spades'] },
  { id: 'rosa', name: 'Rosa', bio: 'Runs the diner on the corner. Steady play, warm coffee, endless stories.', games: ['canasta', 'gin'] },
  { id: 'hank', name: 'Hank', bio: 'Long-haul trucker. Plays fast, takes chances, laughs off the losses.', games: ['pitch', 'euchre', 'war'] },
  { id: 'pip', name: 'Pip', bio: 'The youngest at the table and sharper than anyone expects.', games: ['gofish', 'memory', 'oldmaid'] },
  { id: 'odette', name: 'Odette', bio: 'Parisian chanteuse who learned Tarot and Skat between encores.', games: ['tarot', 'skat'] },
  { id: 'gus', name: 'Gus', bio: 'A big friendly bear in a cardigan. Gentle, patient and a little cautious.', games: ['oldmaid', 'gofish'] },
  { id: 'nova', name: 'Nova', bio: 'A cheerful robot who plays strictly by the book, and enjoys every page.', games: ['memory', 'gin'] },
  { id: 'captain', name: 'Captain', bio: 'Keeps the lighthouse and the cribbage board. Never in a hurry.', games: ['cribbage'] },
  { id: 'lou', name: 'Lou', bio: 'Jazz pianist with moods like a minor key. You never know what comes next.', games: ['spades', 'poker'] },
  { id: 'ivy', name: 'Ivy', bio: 'Gardener who plays for the fun of it and cheers everyone\'s good hands.', games: ['crazy8', 'hearts'] },
].map((c) => ({ ...c, portrait: thumb(c.id), portraitLarge: large(c.id) }));

/** Portraits a human player can pick in Table settings ('player-01' … 'player-08'). */
export const PLAYER_PORTRAITS = Array.from({ length: 8 }, (_, i) => {
  const id = `player-${String(i + 1).padStart(2, '0')}`;
  return { id, label: `Portrait ${i + 1}`, src: thumb(id), large: large(id) };
});

/** Thumbnail path of a player portrait id, or '' for none / unknown ids. */
export const playerPortrait = (id) => PLAYER_PORTRAITS.find((p) => p.id === id)?.src ?? '';

// A regular is this many times as likely as anyone else to be picked: a nudge, not a booking.
const REGULAR_WEIGHT = 2.5;

/**
 * Choose `count` distinct opponents (0 … CAST.length), in seat order. Each pick is weighted, so a
 * game's regulars turn up more often without always appearing. Deterministic for a given rng.
 */
export function pickOpponents(count, { gameId = null, rng = Math.random } = {}) {
  const n = Math.max(0, Math.min(CAST.length, Math.floor(Number(count) || 0)));
  const pool = CAST.map((c) => ({ c, w: gameId && c.games.includes(gameId) ? REGULAR_WEIGHT : 1 }));
  const out = [];
  while (out.length < n) {
    let r = rng() * pool.reduce((t, p) => t + p.w, 0);
    let i = 0;
    while (i < pool.length - 1 && (r -= pool[i].w) >= 0) i++;
    out.push(pool.splice(i, 1)[0].c);
  }
  return out;
}

/** The cast member sitting under a seat name (case-insensitive), or null (e.g. 'West' in old saves). */
export function castByName(name) {
  const k = String(name ?? '').trim().toLowerCase();
  return CAST.find((c) => c.name.toLowerCase() === k) ?? null;
}

/** Portrait path for a seat name, or '' so the caller falls back to the initial. */
export const portraitFor = (name) => castByName(name)?.portrait ?? '';
