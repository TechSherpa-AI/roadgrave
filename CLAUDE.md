# ROADGRAVE — repository rules for Claude Code sessions

Durable rules. Milestone specs come from Gregory per-milestone; this file is
what survives between them.

## Before you touch anything
- Read `docs/ARCHITECTURE.md` before modifying core systems. Extend existing
  systems; do not rebuild or duplicate them.
- Audit the repo first. If this spec describes something that already exists,
  extend it.

## Persistence is sacred
- Never break save compatibility. Any change to persistent state requires:
  a save-version bump, an explicit chained migration, safe defaults in
  `ensureDefaults`, preservation of the pre-migration backup behavior, and
  migration tests (including the real fixtures in `tests/legacy-saves/`).
- Mid-fight save/resume and ironman behavior must keep working.
- Committed random outcomes are persisted and idempotent: reloading never
  rerolls, duplicates, or refunds anything.

## Content is data
- Game consequences are DECLARED in structured `effects` on content entries
  and applied by the shared effects code. Never infer consequences by
  inspecting prose/wording.
- New content types get schema coverage in `tests/validate-content.mjs`.
- Player-facing currency is **scrap** — never "caps".
- Use gender-neutral language for incidental romance/attraction (person,
  spouse, partner).
- When writing or art is needed from Gregory, use the CONTENT REQUEST /
  ASSET REQUEST formats (see `docs/ASSET_REQUIREMENTS.md`).

## Systems that are settled — do not reinvent
- The weapon-facing system (F/L/R/B + Turret) and the player-facing name
  **Ring Mount** for the 360° mount. Never create a second weapon-mounting
  system.
- Seeded RNG through `core.rand()` only.
- One dialogue/effects engine, one validator, one Playwright smoke suite —
  extend them, never build competitors.

## Process
- Phone-first portrait usability: one thumb, no horizontal scroll, large
  targets.
- The public tester build is `main` + GitHub Pages. Feature work happens on
  branches; do not push feature work directly to `main`. Keep `main` green.
- Do not knowingly commit failing relevant tests. Run
  `node tests/validate-content.mjs` and `node tests/run.mjs` before each
  logical commit; run the full suite + `tests/smoke.mjs` + mobile portrait
  check before review.
- Do not begin a new slice or major system without Gregory's explicit
  approval. At the end of each approved milestone: STOP and report; do not
  merge or deploy until Gregory approves.
