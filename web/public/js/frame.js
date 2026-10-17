// Every screen runs inside the site shell (index.html), which owns the background music so it
// plays straight through page changes. Opened on its own (a bookmark, a refresh, a typed URL),
// a screen hands itself to the shell, which loads it back in its frame. Load this first, as a
// classic (non-module) script in <head>, so it runs before anything else on the page.
// Paths are relative to the site's folder, so the site works at / or under a subfolder.
if (window.top === window) {
  const base = location.pathname.replace(/[^/]*$/, '');
  const page = location.pathname.slice(base.length) + location.search + location.hash;
  location.replace(base + '?p=' + encodeURIComponent(page));
}
