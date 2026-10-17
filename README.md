# Dealer's Choice

A warm, old-fashioned card room in your browser. Pull up a chair, pick a table and play the classic
card games against friendly computer opponents, or settle into the solitaire parlor for a quiet hand
on your own.

Dealer's Choice has its own look and sound throughout: the **Parlor** card deck and table felts, a
relaxed lounge-jazz soundtrack and original sound effects, all created for this game.

## The tables

**Trick-taking:** Pinochle, Bridge, Spades, Hearts, Euchre, Pitch, Skat, Tarot

**Melding and drawing:** Gin Rummy, Canasta, Cribbage, Crazy Eights

**Casino:** Poker (five-card draw)

**Family table:** Go Fish, Old Maid, War, Memory Match

**Solitaire parlor:** 51 layouts, from Klondike, Spider and Yukon to Pyramid, Golf, Canfield and
timed arcade rounds.

## What makes it feel like a card room

- **A cast of twelve computer partners and opponents**, each with a portrait and a personality, who
  bid, meld and play by each game's real rules.
- **The Parlor deck**: a mid-century card design in cream, ink, brass and deep green, with six card
  backs. A simpler drawn deck is available too, under **Table settings**.
- **Music that follows you**: six original lounge-jazz tracks play in a shuffled order that carries on
  seamlessly as you move between the lobby and the tables, with no song repeated back to back.
- **Sound effects** for dealing, shuffling, tricks, chips and wins, with separate volume controls for
  music and game sounds.
- **Remembers you**: your name, portrait, card style, card back and volumes are saved in your browser.

## Play it locally

Requires Node.js 20 or newer; there is nothing else to install.

```bash
cd web && npm start
```

Then open http://localhost:4449. Run the test suite with:

```bash
cd web && npm test
```

## How it's built

A small, dependency-free web app: plain HTML, CSS and JavaScript modules served by a tiny Node server.

```
web/server.mjs                 static server (byte ranges for audio)
web/public/index.html          site shell: hosts the music player and shows every screen in a frame
web/public/lobby.html          the lobby
web/public/play.html           the shared table that runs most card games
web/public/pinochle.html       the Pinochle table
web/public/solitaire.html      the solitaire parlor
web/public/js/games/           one rules engine and computer player per game
web/public/js/solitaire/       the solitaire engine and layouts
web/public/js/core/            cards, table, table pieces (chips, board, tray, plaque), sound and music
web/public/js/skin.js          card styles (Parlor and the drawn deck)
web/public/assets/             card art, table felts, sounds and music
web/test/                      rules and engine tests
art/parlor/                    source art, print-quality card masters and proof sheets
tools/art/                     scripts that build the card deck and the sound effects
```

Rebuild the Parlor deck or the sound effects after changing their sources (run from the repo root):

```bash
python3 -I tools/art/build_parlor.py
```

```bash
python3 -I tools/art/build_sounds.py
```
