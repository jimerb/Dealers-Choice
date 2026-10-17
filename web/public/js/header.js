// Shared site header + footer, "Table settings" dialog (name, card style, card back)
// and the sound popover (game sounds / music volumes, mute).
import { SKINS, currentSkin, currentBack, savePref } from './skin.js';
import { initAudio, volumes, setVolume, setMuted, play } from './core/sound.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function playerName() {
  try { return localStorage.getItem('dc.name') || 'Guest'; } catch { return 'Guest'; }
}
export function hasName() {
  try { return Boolean(localStorage.getItem('dc.name')); } catch { return false; }
}

const LOGO_SRC = '/assets/art/brand/logo-mark';
const LOGO = `<img class="brand-mark" src="${LOGO_SRC}-64.png" srcset="${LOGO_SRC}-64.png 64w, ${LOGO_SRC}-180.png 180w" sizes="40px" width="40" height="40" alt="">`;
const SPEAKER = (muted) => `<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 9h4l5-4v14l-5-4H4z"/>${muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'}</svg>`;

export function mountChrome(active) {
  initAudio();
  const nav = [['lobby', '/lobby.html', 'Lobby'], ['games', '/lobby.html#games', 'Card games'], ['solitaire', '/solitaire.html', 'Solitaire'], ['pinochle', '/pinochle.html', 'Pinochle']];
  const header = document.getElementById('site-header');
  header.className = 'site-header';
  header.innerHTML = `<div class="bar">
    <a class="brand" href="/lobby.html">${LOGO}<span class="brand-word">Dealers Choice</span></a>
    <nav class="site-nav" aria-label="Main">${nav.map(([id, href, label]) =>
      `<a href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <div class="who">
      <div class="sound-ctl">
        <button class="icon-btn" type="button" id="sound-toggle" aria-expanded="false" aria-controls="sound-pop" aria-label="Sound settings">${SPEAKER(volumes.muted)}</button>
        <div class="sound-pop" id="sound-pop" hidden>
          <label for="vol-sfx">Game sounds</label>
          <input id="vol-sfx" type="range" min="0" max="1" step="0.05" value="${volumes.sfx}">
          <label for="vol-music">Music</label>
          <input id="vol-music" type="range" min="0" max="1" step="0.05" value="${volumes.music}">
          <label class="choice"><input id="vol-mute" type="checkbox" ${volumes.muted ? 'checked' : ''}> Mute everything</label>
          <a href="/sounds.html" class="sound-board-link">Sound board</a>
        </div>
      </div>
      <span class="avatar" aria-hidden="true" id="who-avatar"></span>
      <span id="who-name"></span>
      <button class="btn ghost-brass sm" type="button" id="open-settings">Table settings</button>
    </div></div>`;
  paintName();

  // ---- sound popover
  const toggle = header.querySelector('#sound-toggle');
  const pop = header.querySelector('#sound-pop');
  toggle.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
    toggle.setAttribute('aria-expanded', String(!pop.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !e.target.closest('.sound-ctl')) { pop.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  });
  pop.querySelector('#vol-sfx').addEventListener('input', (e) => setVolume('sfx', e.target.value));
  pop.querySelector('#vol-sfx').addEventListener('change', () => play('card'));
  pop.querySelector('#vol-music').addEventListener('input', (e) => setVolume('music', e.target.value));
  pop.querySelector('#vol-mute').addEventListener('change', (e) => {
    setMuted(e.target.checked);
    toggle.innerHTML = SPEAKER(e.target.checked);
  });

  const footer = document.getElementById('site-footer');
  if (footer) {
    footer.className = 'site-footer';
    footer.innerHTML = `<div class="bar"><span class="brand-word" style="font-family:var(--font-display);color:var(--ink)">Dealers Choice</span>
      <span>Cards, art and sounds by Dealers Choice.</span></div>`;
  }

  // ---- settings dialog
  const dlg = document.createElement('dialog');
  dlg.id = 'settings';
  dlg.setAttribute('aria-labelledby', 'settings-title');
  document.body.append(dlg);
  let before = null;
  const render = () => {
    const skin = currentSkin();
    const nameNow = dlg.querySelector('#set-name')?.value ?? (hasName() ? playerName() : '');
    dlg.innerHTML = `<form id="settings-form">
      <h2 id="settings-title">Table settings</h2>
      <div class="field"><label for="set-name">Your name</label><input id="set-name" type="text" maxlength="20" autocomplete="nickname" placeholder="Guest" value="${esc(nameNow)}"></div>
      <fieldset class="field"><legend>Card style</legend>
        ${Object.entries(SKINS).map(([id, s]) => `<label class="choice"><input type="radio" name="skin" value="${id}" ${id === skin ? 'checked' : ''}> ${s.label}</label>`).join('')}
      </fieldset>
      <div class="field"><label for="set-back">Card back</label><select id="set-back">
        ${SKINS[skin].backs.map((b) => `<option value="${b}" ${b === currentBack() ? 'selected' : ''}>${b.replace('-', ' ')}</option>`).join('')}
      </select></div>
      <div class="dialog-actions"><button class="btn" type="button" id="cancel-settings">Cancel</button><button class="btn primary" type="submit">Save</button></div>
    </form>`;
    dlg.querySelectorAll('input[name=skin]').forEach((r) => r.addEventListener('change', () => { savePref('dc.skin', r.value); render(); }));
    dlg.querySelector('#cancel-settings').addEventListener('click', () => {
      if (before) savePref('dc.skin', before.skin); // undo the live preview
      dlg.close();
    });
    // Enter in the name box and the Save button both land here.
    dlg.querySelector('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = dlg.querySelector('#set-name').value.trim().slice(0, 20);
      if (name) savePref('dc.name', name); else try { localStorage.removeItem('dc.name'); } catch { /* ignore */ }
      savePref(`dc.back.${currentSkin()}`, dlg.querySelector('#set-back').value);
      before = null;
      dlg.close();
    });
  };
  document.getElementById('open-settings').addEventListener('click', () => {
    before = { skin: currentSkin() };
    dlg.innerHTML = '';
    render();
    dlg.showModal();
  });
  dlg.addEventListener('cancel', () => { if (before) savePref('dc.skin', before.skin); }); // Esc key
  dlg.addEventListener('close', () => {
    paintName();
    window.dispatchEvent(new CustomEvent('dc:settings'));
  });
}

function paintName() {
  const n = playerName();
  document.getElementById('who-avatar').textContent = n.slice(0, 1).toUpperCase();
  document.getElementById('who-name').textContent = n;
}
