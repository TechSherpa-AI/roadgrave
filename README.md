# ROADGRAVE

A lightweight car-combat RPG for iPhone Safari, in the systems-first spirit of
mid-1980s RPGs: text and numbers lead, graphics are minimal. Original setting,
factions, and story.

**The entire game is one file: [`index.html`](index.html).** No build step, no
dependencies, no network calls. All state persists in `localStorage`, with
export/import save strings as a backup.

## Play it on an iPhone

**Play here: https://techsherpa-ai.github.io/roadgrave/** (auto-deployed from
`main` on every push).

1. Open the link in Safari on the iPhone.
2. Tap **Share → Add to Home Screen**. Launch from the home-screen icon for
   full-screen portrait play.

Autosave is always on. Use **Settings & Saves → Export** to back up your game
as a text string; paste it back to restore on any device.

## Development

Built in vertical slices, each independently playable. The changelog and known
gaps live in the `NOTES` comment block at the top of `index.html`.

| Slice | Content | Status |
|---|---|---|
| 0 | Scaffold: UI shell, state machine, saves, export/import | ✅ |
| 1 | Driver creation, workshop, garage/economy | — |
| 2 | Arena tactical combat | — |
| 3 | Overland map, one city, scavenging | — |
| 4 | Crew and convoy | — |
| 5 | Campaign spine and progression | — |
| 6 | Balance and polish | — |
