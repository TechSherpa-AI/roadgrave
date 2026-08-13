# ROADGRAVE

A lightweight car-combat RPG for iPhone Safari, in the systems-first spirit of
mid-1980s RPGs: text and numbers lead, graphics are minimal. Original setting,
factions, and story.

**Play here: https://techsherpa-ai.github.io/roadgrave/** (auto-deployed from
`main` after the regression suite passes).

1. Open the link in Safari on the iPhone.
2. Tap **Share → Add to Home Screen**. Launch from the home-screen icon for
   full-screen portrait play.

Autosave is always on. Use **Settings & Saves → Export** to back up your game
as a text string; paste it back to restore on any device. Saves migrate
forward automatically across versions.

## Code layout

No build step — plain ES modules under `js/`, static tables split from
logic, dialogue in its own content file. Read `docs/ARCHITECTURE.md` first.
Art slots and request templates: `docs/ASSET_REQUIREMENTS.md`.

- Tests: `node tests/run.mjs` (also gates every deploy in CI)
- Golden save fixtures: `tests/golden/` — regenerate with `node tests/make-golden.mjs`
- Debug panel: open the game with `?dev=1`, then Settings → Developer

## Milestones

| # | Content | Status |
|---|---|---|
| 0 | Scaffold: UI shell, state machine, saves, export/import | ✅ |
| 1 | Driver creation, workshop, garage/economy | ✅ |
| 2 | Arena tactical combat + narrative pass + rig schematic | ✅ |
| M3 | Architecture: modules, save v4, world state, reputation, NPC memory, data-driven dialogue, crowd tiers, appearance, journal, vehicle history, legacy, map navigation, tests | ✅ |
| 3 | Overland map, travel, encounters, scavenging | — |
| 4 | Crew and convoy | — |
| 5 | Campaign spine and progression | — |
| 6 | Balance and polish | — |
