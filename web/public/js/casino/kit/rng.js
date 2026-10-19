// Fair randomness for every casino game. Engines never call Math.random or crypto themselves: the
// game hands them an rng, so tests can pass a seeded (or rigged) one and replay a round exactly.
//
// An rng is any object with
//   int(n)   -> a whole number from 0 to n - 1, every value equally likely
//   float()  -> a number in [0, 1)
//
//   cryptoRng()        the real thing: crypto.getRandomValues with rejection sampling (no modulo bias)
//   seededRng(seed)    the same interface from a seed (tests, replays)
//   riggedRng(values)  hands out the given int() results in order (tests that need exact cards or dice)
//   shuffle(list, rng) Fisher-Yates: a new, uniformly shuffled array
import { makeRng } from '../../core/cards.js';

const TWO32 = 0x1_0000_0000;

function checkN(n) {
  if (!Number.isInteger(n) || n < 1 || n > TWO32) throw new RangeError(`randomInt: ${n} is not a count from 1 to 2^32`);
}

/** A fair whole number in [0, n) from 32-bit draws: values at or above the largest multiple of n
 *  below 2^32 are thrown away and drawn again, so every result is equally likely.
 *  `fill` stands in for crypto.getRandomValues (tests). */
export function randomInt(n, fill = (a) => globalThis.crypto.getRandomValues(a)) {
  checkN(n);
  const limit = Math.floor(TWO32 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    fill(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/** An int()/float() rng over any source of unsigned 32-bit numbers. */
function fromWords(next) {
  return {
    int(n) {
      checkN(n);
      const limit = Math.floor(TWO32 / n) * n;
      for (;;) {
        const w = next();
        if (w < limit) return w % n;
      }
    },
    float: () => next() / TWO32,
  };
}

/** The production rng: crypto.getRandomValues, 256 words fetched at a time. */
export function cryptoRng(fill = (a) => globalThis.crypto.getRandomValues(a)) {
  const buf = new Uint32Array(256);
  let i = buf.length;
  return fromWords(() => {
    if (i >= buf.length) { fill(buf); i = 0; }
    return buf[i++];
  });
}

/** A repeatable rng from a seed (the site's mulberry32 generator from core/cards.js). */
export function seededRng(seed = 1) {
  const f = makeRng(seed);
  return fromWords(() => Math.floor(f() * TWO32) >>> 0);
}

/**
 * For tests: int(n) returns the listed values in order (each must be below n), then falls back to
 * a seeded rng. float() takes the next value too, divided by 2^32 when it is a whole number.
 */
export function riggedRng(values, after = seededRng(7)) {
  const queue = [...values];
  return {
    int(n) {
      if (!queue.length) return after.int(n);
      const v = queue.shift();
      if (!Number.isInteger(v) || v < 0 || v >= n) throw new RangeError(`riggedRng: ${v} is not a draw from 0 to ${n - 1}`);
      return v;
    },
    float() {
      if (!queue.length) return after.float();
      const v = queue.shift();
      return Number.isInteger(v) ? v / TWO32 : v;
    },
    get left() { return queue.length; },
  };
}

/** Fisher-Yates: a uniformly shuffled copy of `list`. */
export function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `k` distinct items from `list`, in draw order (a partial shuffle: keno's 20 balls of 80). */
export function sample(list, k, rng) {
  const a = list.slice();
  if (k > a.length) throw new RangeError(`sample: ${k} from ${a.length}`);
  for (let i = 0; i < k; i++) {
    const j = i + rng.int(a.length - i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, k);
}

/** One die: 1 to 6. */
export const rollDie = (rng) => rng.int(6) + 1;
