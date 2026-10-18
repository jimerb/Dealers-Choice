// A one-time note for games that have variants or options: shown the first time a game is opened,
// with buttons to dismiss it. Remembered per game in localStorage, so it never comes back.
// Players can turn all of these notes off in Table settings (key 'dc.tips').
const KEY = 'dc.tip.seen';
const TIPS = 'dc.tips';

function seen() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}

/** Are variant and option notes switched on? (on unless the player turned them off) */
export function tipsOn() {
  try { return localStorage.getItem(TIPS) !== '0'; } catch { return true; }
}

export function setTipsOn(on) {
  try { localStorage.setItem(TIPS, on ? '1' : '0'); } catch { /* private mode */ }
}

function markSeen(id) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...seen(), [id]: true })); } catch { /* private mode */ }
}

/** Show the variants note for `id` once, above the table. */
export function variantTip(id, text) {
  if (!tipsOn() || seen()[id]) return;
  const main = document.querySelector('main.table-page');
  if (!main) return;
  const box = document.createElement('div');
  box.className = 'variant-tip';
  box.setAttribute('role', 'note');
  box.innerHTML = `<span>${text}</span><span class="variant-tip-actions"><button type="button" class="btn sm" data-act="got">Got it</button><button type="button" class="btn sm ghost" data-act="never">Never show variant notices</button></span>`;
  box.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (!act) return;
    if (act === 'never') setTipsOn(false);
    markSeen(id);
    box.remove();
  });
  main.prepend(box);
}
