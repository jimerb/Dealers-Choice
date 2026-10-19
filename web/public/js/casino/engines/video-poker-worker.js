// Video Poker hint worker: works out the exact value of all 32 holds off the page's main thread.
//   postMessage({ warm: 'jacks' })                          build that machine's tables ahead of time
//   postMessage({ id, machine, cards, coins })  ->  { id, values: [32], mask, value, text }
import { subsetTables, holdValues, bestHold } from './video-poker.js';

self.onmessage = (e) => {
  const d = e.data ?? {};
  try {
    if (d.warm) { subsetTables(d.warm); return; }
    const values = holdValues(d.machine, d.cards, d.coins);
    const best = bestHold(d.machine, d.cards, d.coins, values);
    self.postMessage({ id: d.id, values: Array.from(values), mask: best.mask, value: best.value, text: best.text });
  } catch (err) {
    self.postMessage({ id: d.id, error: String(err?.message ?? err) });
  }
};
