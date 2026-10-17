// Every screen runs inside the site shell (index.html), which owns the background music so it
// plays straight through page changes. Opened on its own (a bookmark, a refresh, a typed URL),
// a screen hands itself to the shell, which loads it back in its frame. Load this first, as a
// classic (non-module) script in <head>, so it runs before anything else on the page.
if (window.top === window) {
  location.replace('/?p=' + encodeURIComponent(location.pathname + location.search + location.hash));
}
