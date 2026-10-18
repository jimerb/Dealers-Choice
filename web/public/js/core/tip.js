// A one-time note for games that have variants or options: shown the first time a game is opened,
// with a button to dismiss it. Remembered per game in localStorage, so it never comes back.
const KEY = 'dc.tip.seen';

function seen() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}

/** Show the variants note for `id` once, above the table. */
export function variantTip(id, text) {
  if (seen()[id]) return;
  const main = document.querySelector('main.table-page');
  if (!main) return;
  const box = document.createElement('div');
  box.className = 'variant-tip';
  box.setAttribute('role', 'note');
  box.innerHTML = `<span>${text}</span><button type="button" class="btn sm">Got it</button>`;
  box.querySelector('button').addEventListener('click', () => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...seen(), [id]: true })); } catch { /* private mode */ }
    box.remove();
  });
  main.prepend(box);
}
