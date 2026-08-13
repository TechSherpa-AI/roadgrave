# ROADGRAVE — Asset Requirements & Manifest

All images live in `img/`. Every slot is optional — the game degrades
gracefully to text if a file is missing. JPEG, ~960px wide, dark palette
(rust / ember-orange sky / near-black ground) to match the existing set.

## Request template (use for every future art request)

```
ASSET REQUEST
Filename:        img/<exact-name>.jpg
Purpose:         <where it appears in the UI>
Aspect ratio:    16:9 (or noted)
Perspective:     <e.g. eye-level exterior / top-down / portrait>
Subject:         <what must be in frame>
Environment:     <setting, weather, lighting>
Continuity:      <characters/vehicles/signage that must match prior art>
UI-safe area:    <regions kept free of critical detail — e.g. bottom 20%
                  is overlaid by a text gradient>
Layering:        <only for layered character art — see below>
```

## Current inventory (all present, compressed, wired)

| File | Used on |
|---|---|
| `RoadGrave.StartScreen.mp4` | Title splash (looping video) |
| `title.jpg` | Title fallback poster |
| `city.jpg` | Kettle Rock map navigation (tappable hotspots) |
| `garage.jpg` | Yard screen |
| `market.jpg`, `jobs.jpg`, `bar.jpg`, `arena.jpg` | Their screens |
| `arena-win.jpg` / `arena-loss.jpg` | Bout aftermath |
| `chassis-skiff/courser/drayhulk.jpg` | Yard listings + Garage portrait |
| `chassis-*-armored.jpg` | Garage portrait when armor ≥ 8 points |
| `openroad.jpg`, `attackedonroad.jpg` | Banked for Slice 3 (travel / ambush) |

## Map hotspot continuity

The five sign locations in `city.jpg` are mapped as tappable regions
(percent coordinates in `js/data.js → mapHotspots`). If `city.jpg` is
replaced with new art, keep signs for Garage / Market / Job Board /
Slag Bar / Crucible visible, then update the five coordinate entries —
no other code changes. The map layer supports future overlays (posters,
champion markings, faction banners) as additional absolutely-positioned
elements; request that art only when the feature lands.

## Character creation layers — the 18-asset spec

**STATUS: FOUNDATION COMPLETE — NOT VISUALLY IMPLEMENTED.**
What exists today: the 6×3 appearance schema, creation UI, save
persistence, and dialogue conditions that query appearance tags.
What does NOT exist: any in-game rendering of character art. No layer
compositing code has been written and no layer assets exist; nothing in
the game currently draws the character. The spec below is the production
target for when that work is scheduled — building the compositor is its
own future task, to be planned when the first test layers arrive.

Appearance is 6 categories × 3 choices assembled from aligned transparent
layers. When we produce these, every file must share ONE canvas and
alignment so any combination composites cleanly:

- Canvas: 768×1024 PNG, transparent background.
- Character centered, waist-up, facing camera, consistent lighting from
  upper-left, rust-tone rim light.
- Layer stacking order (bottom → top): body → clothing → face → hair → accessory.
- "Build" is expressed by the body layer (3 body files × 3 presentations
  would be 9 bodies — instead: body layer = presentation choice, with
  build handled by silhouette variant baked per body file; final count
  stays 18 by making clothing fit all builds loosely).

| # | File | Layer | Content |
|---|---|---|---|
| 1–3 | `char/body-masculine.png`, `char/body-feminine.png`, `char/body-androgynous.png` | body | bare head+torso base, neutral expression |
| 4–6 | `char/build-thin.png`, `char/build-average.png`, `char/build-muscular.png` | build overlay | shoulder/arm silhouette shading |
| 7–9 | `char/hair-short.png`, `char/hair-long.png`, `char/hair-mohawk.png` | hair | must clear all face variants |
| 10–12 | `char/face-attractive.png`, `char/face-rough.png`, `char/face-damaged.png` | face | eyes/scars/wear, aligned to all bodies |
| 13–15 | `char/clothing-leathers.png`, `char/clothing-wraps.png`, `char/clothing-overalls.png` | clothing | covers torso on all builds |
| 16–18 | `char/acc-goggles.png`, `char/acc-charm.png`, `char/acc-gunbelt.png` | accessory | top layer |

Deliver 2–3 test layers first to validate alignment before producing all 18.

## Legacy depictions (future — do not produce yet)

Each major legacy archetype eventually gets one 16:9 portrait of the aged
character. These must echo creation choices (hair/build/face at minimum),
which is why appearance metadata is preserved for the whole save. Request
these one at a time when the legacy art pass begins.
