// Keno rules: 80 numbers, 20 drawn each game without replacement, a straight ticket of 1 to 10
// spots. No DOM. Pays are "for 1": the total handed back per $1 of ticket price, stake included.
import { sample } from '../kit/rng.js';

export const NUMBERS = 80;
export const DRAWN = 20;
export const MAX_SPOTS = 10;
export const MAX_GAMES = 20;

/** Pay tables by spots marked: catch -> pays for 1. */
export const PAYS = {
  1: { 1: 3 },
  2: { 2: 12 },
  3: { 2: 1, 3: 44 },
  4: { 2: 1, 3: 4, 4: 120 },
  5: { 3: 1, 4: 12, 5: 810 },
  6: { 3: 1, 4: 4, 5: 95, 6: 1800 },
  7: { 4: 2, 5: 20, 6: 400, 7: 7000 },
  8: { 5: 10, 6: 90, 7: 1600, 8: 25000 },
  9: { 5: 5, 6: 45, 7: 330, 8: 4000, 9: 50000 },
  10: { 5: 2, 6: 22, 7: 140, 8: 1000, 9: 5000, 10: 100000 },
};

/** Ticket prices offered at a denomination: the first five of these at or above it. */
const PRICE_STEPS = [1, 2, 5, 10, 25, 50, 100, 250];
export const pricesFor = (denom = 1) => PRICE_STEPS.filter((p) => p >= denom).slice(0, 5);

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** P(catch exactly k with n spots marked): C(n,k)·C(80−n,20−k)/C(80,20). */
export const pCatch = (n, k) => (choose(n, k) * choose(NUMBERS - n, DRAWN - k)) / choose(NUMBERS, DRAWN);

/** The expected return per $1 for an n-spot ticket. */
export const expectedReturn = (n, pays = PAYS[n]) => Object.entries(pays).reduce((t, [k, p]) => t + pCatch(n, Number(k)) * p, 0);

/** Pays for 1 when `catches` of `spots` come up. */
export const paysFor = (spots, catches) => PAYS[spots]?.[catches] ?? 0;

/** Throws a readable error unless `picks` is a straight ticket: 1-10 distinct numbers 1-80. */
export function checkTicket(picks) {
  if (!Array.isArray(picks) || picks.length < 1) throw new Error('Mark at least one number.');
  if (picks.length > MAX_SPOTS) throw new Error(`Mark at most ${MAX_SPOTS} numbers.`);
  if (new Set(picks).size !== picks.length) throw new Error('A number can be marked only once.');
  for (const n of picks) if (!Number.isInteger(n) || n < 1 || n > NUMBERS) throw new Error(`${n} is not a number from 1 to ${NUMBERS}.`);
}

const ALL = Array.from({ length: NUMBERS }, (_, i) => i + 1);

/** Twenty distinct balls, in the order they come out. */
export const draw = (rng) => sample(ALL, DRAWN, rng);

/** `n` distinct numbers for a quick pick, sorted. */
export function quickPick(n, rng) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_SPOTS) throw new Error(`Quick pick one to ${MAX_SPOTS} numbers.`);
  return sample(ALL, n, rng).sort((a, b) => a - b);
}

/** Score a ticket against a draw: catches (in draw order), pays for 1 and the dollars returned. */
export function score(picks, balls, price) {
  checkTicket(picks);
  const mine = new Set(picks);
  const caught = balls.filter((b) => mine.has(b));
  const perOne = paysFor(picks.length, caught.length);
  return { spots: picks.length, caught, catches: caught.length, perOne, wagered: price, returned: Math.floor(perOne * price) };
}

/** One game: draw and score. */
export function play(picks, price, rng) {
  checkTicket(picks);
  if (!Number.isSafeInteger(price) || price < 1) throw new Error('Pick a ticket price.');
  const balls = draw(rng);
  return { balls, ...score(picks, balls, price) };
}
