# UI Visual-Polish Pass — Design Spec

**Date:** 2026-06-22
**Branch:** `feat/diversity-levers`
**Status:** Approved (brainstorm), ready for implementation plan.

## Goal

Polish the sim's UI without redesigning what already works (distributions layout,
population graph, brain net, inspector/morphotype). Three concrete outcomes:

1. **Remap the dot encoding** so trophic role reads as a stable SHAPE and color becomes a
   meaningful, mode-switchable channel (lineage by default).
2. **Fix the color system** — one source of truth, vivid diet ramp, per-histogram hues.
3. **Relocate + upgrade the legend** (floating, closeable, dynamic) and make the
   distributions panel **gene-selectable**.

Render is one-way and never feeds the sim (`renderer.ts:8`); **every change here is
render/UI only — the determinism contract and cardinal rule are untouched.** A
`make check` + state-hash spot check gates "done".

## 1. Dot encoding model (the core change)

| Channel | Was | Now |
|---|---|---|
| **Shape** | (circle only) | **Trophic role**: ○ herbivore · ◇ omnivore · △ predator — from `DIET` gene, bucketed. Life-constant. |
| **Hue** | diet (green→red) | **Color-by mode** (uniform `u_colorMode`, cycled by `c`): `0` lineage (default) · `1` diet · `2` energy |
| Saturation | vision | vision (unchanged) — applies in lineage & diet modes |
| Brightness/value | speed | speed (unchanged) — applies in lineage & diet modes |
| Size (radius) | size gene | size gene (unchanged) |

**Trophic buckets** (from `ScalarGene.DIET` ∈ [0,1]): herbivore `[0, 0.4)`, omnivore
`[0.4, 0.6)`, predator `[0.6, 1]`. Bucketing is a pure function `dietShape(diet): 0|1|2`
(unit-tested).

**Color modes:**
- **lineage** (`0`, default): hue = `hue` gene over the full color wheel; sat = vision,
  val = speed. Makes genetic diversity/speciation visible (monoculture = one color). This is
  the active `feat/diversity-levers` diagnostic.
- **diet** (`1`): hue = `dietHue(diet)`; sat = vision, val = speed. The familiar green→red read.
- **energy** (`2`): a perceptual heat ramp keyed to the creature's own energy bands
  (`energyColor(efrac)`), full sat/val (the ramp carries the signal). `efrac` is energy
  relative to this creature's satiated bar, computed in JS like `inspector.ts:61-65`.

## 2. `src/render/palette.ts` (new — one source of truth)

Kills the three inconsistent diet ramps (`renderer.ts:38`, `distributions.ts:133`,
`index.html:185`). Exports:

- `DIET_STOPS` — control points for the vivid green→amber→red ramp, defined ONCE.
- `dietHue(t: number): number` — eased hue sweep green `0.33` → gold/amber `~0.11` → red `0.0`.
- `dietColor(t: number): [r,g,b]` — full-saturation vivid RGB for 2D panels/legend (the muddy
  middle is fixed by keeping saturation high, not by the blue-pinned RGB lerp).
- `lineageColor(hue: number): [r,g,b]`.
- `energyColor(efrac: number): [r,g,b]` — heat ramp (starving → reproductive → satiated).
- `HISTO_PALETTE: Record<fieldKey, [r,g,b]>` (or an ordered list) — distinct hue per
  distribution field.

**GLSL coupling:** the dot shader needs the same `dietHue` / lineage / energy math in GLSL.
The ramp control points live in `palette.ts` as the canonical values; the GLSL re-implements
the identical eased lerp. A test asserts the JS ramp endpoints/midpoint match the documented
stops so drift is caught.

## 3. Renderer / shader changes (`renderer.ts`)

- New attribute `a_shape` (0/1/2) → `flat` varying → fragment-shader SDF discard tests:
  circle `dot(d,d)>0.25`; diamond `abs(d.x)+abs(d.y)>0.5`; up-triangle edge test. Scratch
  buffer + buffer wiring mirrors the existing `dietScratch`/`visScratch` pattern
  (allocation-free per frame).
- New attribute `a_efrac` (energy band fraction) for energy mode.
- New uniform `u_colorMode` (0/1/2), set from `main.ts`.
- Vertex shader computes base color by mode (see §1). `draw()` gains a `colorMode` param.

## 4. Color-by toggle (`main.ts`)

- State `colorMode: 0|1|2`, cycled on `c` keydown (`c/f/o/l` already used — `c` is free).
- Pass to `renderer.draw(...)`. Update the legend's color row + a brief HUD echo.

## 5. Legend rework (`index.html` + new `src/app/observability/legend.ts`)

- Remove `#legend` from `#right`. Add a floating frosted panel `#legend-panel`, fixed
  bottom-left over the canvas (beside the dots it explains). Frees the top of `#right` so
  population/distributions/brain/inspector rise up.
- **Closeable:** a `✕` button hides it; when hidden, a small `legend` pill bottom-left
  reopens it. No new keybinding (avoids `c/f/o/l` collisions).
- **Dynamic:** a small `Legend` class renders:
  - shape glyphs: `○ herbivore  ◇ omnivore  △ predator`
  - color row reflecting the current mode: lineage → rainbow swatch "kin/lineage";
    diet → green→amber→red swatch; energy → heat swatch.
  - `saturation = vision`, `brightness = speed`, `size = body`.
  - hint: `c = color mode`.

## 6. Distributions: hues + gene picker (`distributions.ts`, `index.html`, `main.ts`)

- Each histogram bar set uses its field's `HISTO_PALETTE` hue (diet keeps its green→red ramp).
- `FIELDS` → a **registry** of all available fields: the 18 `ScalarGene`s (label + min/max
  pulled from `SCALAR_GENE_SPECS`, `genome.ts:123`) plus `energy` and `age` (auto-max).
- `Distributions` gains a settable `fields` list (default = `[diet, energy, age, visionRange,
  maxSpeed]` — today's set). 
- Picker UI: a `<details>` "fields ▾" checklist above the dist canvas; toggling a field
  mutates `Distributions.fields`. 
- Canvas height grows with field count (~40px/field, min current 220) so rows stay readable;
  the right panel scrolls.

## Units & isolation

1. `palette.ts` (+ test) — pure, no deps.
2. renderer/shaders — depends on (1).
3. color-by toggle — depends on (2).
4. legend — depends on (1), (3) for the dynamic color row.
5. distributions hues + picker (+ registry test) — depends on (1).

Files touched: `renderer.ts`, `main.ts`, `index.html`, `distributions.ts`, new
`palette.ts`, new `legend.ts`, plus tests. `index.html` and `main.ts` are touched by
multiple units → implement sequentially (no parallel edits to shared files).

## Testing & verification

- New unit tests: `palette` ramp endpoints/monotonicity; `dietShape` bucketing; distributions
  field registry (min/max sourced correctly).
- Existing `distributions/brain-view/overlay` tests stay green.
- `make check` (typecheck + lint + tests) green.
- Live verification: run the app, screenshot each color mode + the picker + the floating
  legend; confirm shapes render and the state hash is unchanged vs. pre-change at equal
  tick/seed (render-only proof).

## Non-goals / accepted trade-offs

- 4 channels on one dot still cross-muddy (lineage hue dimmed by low speed / desaturated by
  low vision). Accepted — it's the existing model.
- Macro-zoom trophic read moves to shape (illegible at ~2px) + the distributions headcount;
  mitigated by the `c` toggle back to diet. Accepted (≈99% herbivore pops today).
- Lineage-colored *schools* only appear with `cohesionHueBlind:false`; lineage color shows
  diversity regardless (commit `12423d7`).
