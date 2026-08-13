# ROADGRAVE — Architecture

Milestone 3 restructuring. Read this before touching game code.

## 1. Current architecture (pre-Milestone 3)

Everything lived in a single `index.html` (~1,400 lines): CSS, a `DATA`
constant of static tables, a central mutable `G` state object, a versioned
save system (v1–v3) in `localStorage` with export/import strings, a seeded
RNG (mulberry32, replayable via call count), a screen state machine
(`SCREENS` map + `ACTIONS` click dispatcher), the workshop/economy logic,
the Crucible combat engine, an SVG rig schematic, and hard-coded per-foe
dialogue (`barks`) selected inline by combat code.

What already worked and is preserved through this milestone:
driver creation, workshop budgets (weight/power/heat/space), ablative
armor + component damage, three Crucible tiers with purses, mid-fight
save/resume, ironman wipe, autosave, export/import, optional backdrop art
slots, the rig schematic.

## 2. Proposed (now current) architecture

No build step. Plain ES modules served statically; GitHub Pages deploys
on push after the test job passes. `index.html` is a shell: CSS + `#app`
+ `<script type="module" src="js/main.js">`.

```
index.html            shell: CSS, app root, module entry
js/
  core.js             /core: state container (live-bound G), save/load,
                      versioned migrations, export/import, seeded RNG,
                      tiny event bus
  data.js             /data: static tables — cities, chassis, plants,
                      weapons, gear, shifts, arena tiers, NPC registry,
                      appearance categories (6×3)
  data-dialogue.js    /data: ALL reactive dialogue + crowd + town-event
                      lines (content file — edit without touching logic)
  data-legacy.js      /data: legacy archetype table
  world.js            /world+/player: career counters, structured history
                      flags, multidimensional + faction reputation, NPC
                      memory, journal, town ambient events, economy
                      earn/spend tracking, day-advancing jobs
  dialogue.js         /narrative: condition-matching line selector with
                      weights + anti-repeat cooldown
  vehicles.js         /vehicles: vehicle math, vehicle history, garage &
                      market operations (buy/sell/install/repair), SVG
                      schematic
  combat.js           /combat: Crucible engine (DOM-free)
  legacy.js           /narrative: performance score + archetype selection
  golden.js           dev fixtures: builders for the golden test saves
  debug.js            dev-only debug panel actions (hidden unless ?dev=1
                      or localStorage roadgrave.dev="1")
  ui.js               all screens + ACTIONS wiring (only module besides
                      main/debug that touches the DOM)
  main.js             boot
tests/
  run.mjs             regression suite (node tests/run.mjs) — imports the
                      real modules, no DOM required
  golden/*.json       golden saves (generated from js/golden.js)
docs/
  ARCHITECTURE.md     this file
  ASSET_REQUIREMENTS.md art manifest + request template
```

Dependency direction (no cycles):

```
data*.js  ←  core.js  ←  world.js ← vehicles.js ← combat.js ← ui.js ← main.js
                          ↑ dialogue.js ↑ legacy.js   golden.js ← debug.js
```

- `core.js` owns `G` (exported live binding) and knows nothing of game rules.
- `world.js` owns career/reputation/NPC-memory/journal WRITES. Other
  modules call its helpers instead of poking counters directly.
- `combat.js` never imports `ui.js`; it requests screen changes via the
  event bus (`bus.emit("screen", ...)`), which `ui.js` subscribes to.
  This keeps combat importable in node tests.
- `data-dialogue.js` is the content surface: thousands of lines can be
  added there (or appended via future batches) without logic changes.

## 3. Save format

`localStorage` key `roadgrave.save`, JSON of `G`. Export string =
`"RG1." + base64(JSON)`. Before any migration runs, the pre-migration
save is copied to `roadgrave.save.backup`.

Schema v4 (authoritative shape in `core.newGame()`):

```
saveVersion: 4
meta:      { build, ironman, seed, rngCalls }
screen
player:    { created, name, skills{driving,gunnery,mechanics,scrounge},
             xp, injuries[], appearance{body,build,hair,face,clothing,accessory} }
scrap
inventory: []               // loose components / named equipment (future)
vehicles:  [ { id, name, chassis, plant, armor{F,L,R,B,T},
               weapons[{id,facing,ammo,dmgd}], gear[], cargo[],
               dmg{hull,tires,plant},
               history{ originalChassis, acquiredDay, previousOwners[],
                        mileage, wins, losses, kills, majorRepairs,
                        installs, removals, championships } } ]
activeVehicle
crew: []
world:     { location, day, fuel, water, food, ammoReserve }
rep:       { fame, respect, fear, popularity,
             factions{militia,merchants,mechanics,scavengers,crucible,
                      civilians,gangs,raiders} }
career:    { wins, losses, streak, bestStreak, crucibleWins,
             crucibleLosses, championships, contractsDone,
             contractsFailed, scrapEarned, scrapSpent, salvageRecovered,
             distance, rescued, abandoned, killed, betrayals,
             promisesKept, promisesBroken, locationsDiscovered[],
             settlementsVisited[], discoveries[] }
history:   {}               // structured flags: defeatedBruna: 2, ...
npcs:      {}               // id → { encounterCount, lossesToPlayer,
                            //   winsVsPlayer, relationship, disposition,
                            //   alive, memoryFlags{} }
journal:   [ {day, type, data{}, text} ]   // data is authoritative,
                                           // text is rendered prose
narrative: { recent[] }     // dialogue anti-repeat ring (ids)
campaign:  { beatsDone[], flags{} }
combat:    null | full mid-fight state (resume-safe)
log:       []
```

### Migration strategy

Explicit chained functions in `core.js`: `v1→v2`, `v2→v3`, `v3→v4`.
Each maps old fields to new homes; v3→v4 notably:

- `driver` → `player` (+ default appearance)
- `world.factionRep{combine,gangs,zealots,militias}` →
  `rep.factions` (combine→merchants, militias→militia, gangs→gangs;
  zealots kept as an extra key — faction dict is extensible)
- `campaign.flags.arena{q,p,t}` → NPC memory (`lossesToPlayer` for
  odo/kess/bruna), `career.crucibleWins/championships`, starting fame
- `world.supplies` → `world.food`; `water`/`ammoReserve` default 0
- vehicles gain `history` with best-effort defaults

Rules: unknown fields are preserved; missing optional fields get
defaults at load (`ensureDefaults()` — one function, not scattered
`if undefined` checks); a malformed optional entry (dialogue line,
journal row, npc record) is skipped with a console warning, never fatal.
A save that fails to parse leaves the backup untouched and boots to
title with a console error.

## 4. Major systems & data ownership

| System | Module | Owns (writes) |
|---|---|---|
| State container, RNG, bus | core.js | G identity, saveVersion, seed/rngCalls |
| Static content | data*.js | nothing at runtime (read-only) |
| Career/history/journal/rep/NPC memory | world.js | career, history, journal, rep, npcs, world.day/resources, scrap (via earn/spend) |
| Vehicle & shop | vehicles.js | vehicles[*], scrap (via world helpers) |
| Combat | combat.js | G.combat; results reported through world.js hooks |
| Dialogue selection | dialogue.js | narrative.recent |
| Legacy | legacy.js | nothing — pure evaluation of G |
| Screens | ui.js | G.screen, G.log (display log) |

Reputation is four independent scalars (fame, respect, fear,
popularity) + per-faction scalars. Nothing derives one from another;
combat/world hooks adjust each for its own reasons. Crowd behavior
queries fame tier (unknown/emerging/established/famous/legend =
0-1 / 2-4 / 5-8 / 9-13 / 14+ fame).

NPC memory: registry (static identity, personality/motivation tags) in
`data.js`; per-save memory in `G.npcs`. Crucible rivals are the first
consumers: their dialogue escalates on `lossesToPlayer` thresholds
(1 = irritated, 2 = personal, 3+ = personality-dependent).

Dialogue engine: `say(context, {speaker, extra})` filters
`data-dialogue.js` entries by context + conditions (speaker, personality
tags, fame tier bounds, player win-streak, rival loss count, appearance
tags, required/excluded history flags), weights the survivors, avoids
the last ~24 used ids, and returns rendered text. Bad entries are
skipped, never thrown. Consequences are DECLARED on entries via an
`effects` field (rep deltas, faction deltas, set/inc history flags,
npc relationship) and applied by the engine when a line fires — game
code never infers effects from line wording. `tests/validate-content.mjs`
schema-checks every entry (and archetypes, cross-references, fixtures)
in CI.

Character appearance status: the 6×3 schema, creation UI, persistence,
and dialogue hooks are complete; **no visual compositing is implemented**
— layer art and the compositor are future work (see ASSET_REQUIREMENTS).

Journal: `world.addJournal(type, data)` stores structured data AND
rendered prose (template per type). Future prose improvements re-render
from data without corrupting history.

Legacy: `legacy.evaluate(G)` → `{ performance: 1-100, archetype }`.
Performance measures effectiveness only; archetypes classify the
career's shape from career/rep/history and are deliberately allowed to
be constructive, monstrous, or ridiculous. Triggered by Retire (settings)
or ironman death.

## 5. Slice-3 readiness (architecture only, not implemented)

- `world.world` already carries fuel / water / food / ammoReserve.
- `inventory[]` accepts loose components and named-equipment records
  (`{kind:"component", id, name, origin, history, ...}`) — weapons and
  gear are already per-instance objects, so unique/named instances need
  no schema change.
- `career.settlementsVisited` / `locationsDiscovered` are lists, not
  booleans. `vehicles[*].history.mileage` and `career.distance` await
  travel.
- NPC registry/memory and the dialogue engine are settlement-agnostic;
  companions are NPCs with extra fields, already legal in `G.npcs`.

## 6. Testing

`node tests/run.mjs` — no DOM, no build. Covers save/migration/backup,
economy math, vehicle state + history, full simulated Crucible bouts at
all tiers (seeded), NPC memory escalation, dialogue conditions +
anti-repeat, crowd tiers, journal, appearance persistence, legacy
synthetic careers, ironman, golden-save loading. The Pages workflow runs
the suite in a `test` job; `deploy` needs it green.

Golden saves in `tests/golden/` are generated from `js/golden.js`
builders (same builders power the debug panel's instant-state buttons).
Regenerate with `node tests/make-golden.mjs` after schema changes.

Determinism: all gameplay randomness flows through `core.rand()`
(seed + call-count replay). Tests that assert on random outcomes fix
`G.meta.seed` first.
