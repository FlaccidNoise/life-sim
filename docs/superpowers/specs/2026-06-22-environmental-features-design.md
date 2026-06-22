# Environmental Features — Walls + Flow Field + Environment Sensing (Pass 1)

**Date:** 2026-06-22
**Status:** Design — approved for spec review (rev 2)
**Branch (current):** `feat/diversity-levers` (a new branch will be cut for implementation)

## 1. Goal

Add environmental structure so that **spatial complexity creates emergent behavioral niches** — hiding,
ambush, and flow-riding — instead of the current featureless toroidal plane where every creature sees
every neighbour in range and food drifts nowhere. Crucially, creatures **perceive** the new environment
(walls and current) through evolvable, learnable brain inputs, so the niches are *strategies the
population discovers*, not just passive physics.

Three capabilities ship in this pass:

1. **Indestructible walls** — permanent terrain that shapes movement, sight, and the food landscape.
2. **Vector flow field** — a persistent current that drifts the food biomass around and (optionally)
   pushes creatures.
3. **Environment sensing in the brain** — every creature gains evolvable wall-sense and flow-sense
   inputs and learns to use them (predators ambush from cover / patrol open; prey hide near walls; both
   ride or fight the current).

Deferred: ~~destructible / passable (energy-cost) walls~~ — a later phase (owner decision).

## 2. Decisions (locked with owner)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Soft/destructible walls | **Out of scope this pass.** Indestructible only. |
| D2 | Wall generation | **All three generators** (noise caves / cellular automata / rooms+corridors), one per **biome region**, composited toroidally. |
| D3 | Walls ↔ food | **Walls dam the food** — diffusion AND advection are no-flux at walls; biomass pools/eddies. |
| D4 | Walls ↔ sight | **Walls occlude vision** (line-of-sight raycast) — enables hiding/ambush. |
| D5 | Walls ↔ movement | **Walls block movement** (slide-collision in `integrate`). |
| D6 | Flow scope | Advect food (core) **+** size-scaled drift force on creatures (**off-by-default** knob). |
| D7 | Walls vs pockets | **Region-dependent** — some regions structure dead water; others erode into pocket margins. |
| D8 | Default density | **Moderate / mixed (~30–40% solid)**, live-tunable. |
| **D9** | **Wall grid resolution** | **Decoupled from the food grid and HIGH-resolution** (fine cells → more nooks/crannies). A coarse food-resolution mask is *derived* for damming. |
| **D10** | **Neural environment sensing** | **In scope this pass.** All brains gain evolvable + learnable wall-sense and flow-sense inputs. |

## 3. Engine grounding (verified against source)

- World is **fully toroidal** (wraps at three layers: integration `physics.ts:110-113`, spatial-hash
  neighborhood, food diffusion `food-field.ts:219-227`). **No edge or barrier today.** 8192×8192,
  `dt=1`, unit mass.
- **Food is a coarse scalar biomass field, not particles** (`FoodField.B`, Float64, 128×128 = 64 u/cell,
  double-buffered with `scratch`). A current advects **the scalar `B`**.
- The **force buffer is never zeroed**; `steer()` assigning `=` is the de-facto reset
  (`physics.ts:84-88`). **Any flow force on creatures must run AFTER `steer` and use `+=`.**
- **Wall collision must intercept inside `integrate`** (`physics.ts:108-115`), before the wrap-commit.
- The brain is a **small linear sensor→motor map** (`brain.ts`): inputs are the food gradient and the
  sight vector, each in the heading frame (fwd/lat), weighted into turn + thrust; weights live in the
  `Brain` enum + `BRAIN_GENES`, seeded from `FOUNDER_BRAIN` + `founderSigma`, mutated at birth. There is
  a **heritable `brain`** (instinct) and a **runtime `learnedBrain`** (Baldwin plasticity). **The input
  vector is extensible** — new sensory inputs = new enum entries + weights, sized arrays auto-extend.
- Energy is a **single per-organism Float64 scalar** (`store.ts:22`).
- **Determinism contract:** Float64 kinematics, ascending live-slot iteration, RNG ONLY at seeding +
  reproduction, `stateHash` digests per-creature kinematics + `food.hashInto`. Config-derived static
  state (the `fertility` map) is **NOT hashed**. The codebase maintains an **ablation gate**: every
  system has an off-switch whose OFF state is byte-identical to the prior engine (see config.ts knob
  comments); gated RNG draws (e.g. `FORAGE_PREF` only drawn when `foodChannels===2`) preserve the seed
  stream when a feature is off.

## 4. Architecture — two grid resolutions

Decoupling the wall grid (D9) means the environment now lives at **two resolutions**, with cheap derived
masks bridging them:

| Layer | Array | Resolution | Owner | Hashed? |
|-------|-------|-----------|-------|---------|
| fertility (existing) | `Float32` | food (128², 64u) | FoodField | no |
| biomass `B`/`B2` (existing) | `Float64` | food (128², 64u) | FoodField | **yes** |
| **wall occupancy** `solid` (new) | `Uint8` (0/1) | **wall (≈512², 16u)** | `Walls` | no (static) |
| **food-blocked mask** (new, derived) | `Uint8` | food (128², 64u) | `Walls` | no (static) |
| **wall-proximity** `prox` (new, derived) | `Float32` | wall (≈512², 16u) | `Walls` | no (static) |
| **flow** `flowX`,`flowY` (new) | `Float64` | food (128², 64u) | `FlowField` | no (static) |

- **Fine wall grid** (`solid`, default 512² = 16 u/cell ≈ creature-scale) drives **collision** and
  **vision occlusion** — creature-scale nooks and crannies.
- **Derived coarse `foodBlocked` mask** (food resolution): a food cell is blocked if > ~50% of the
  16 fine cells it covers are solid. Drives **food damming** at food resolution (a direct lookup, as in
  rev 1 — the decoupling is invisible to the damming code).
- **Derived `prox` field** (clamped distance-to-nearest-solid, chamfer transform once at generation):
  gives a smooth gradient for the **neural wall sense** even a few cells away from a wall.
- **Flow stays at food resolution** — it advects the food field and is sampled by creature flow-sense;
  large-scale eddies don't need fine resolution.

All resolutions are powers-of-two multiples so a fine cell maps cleanly to its food cell.

## 5. Feature A — Indestructible walls

### 5.1 Module
New `core/walls.ts` exporting `Walls`:

```
class Walls {
  readonly cols, rows, cellW, cellH          // FINE grid (≈512²)
  private solid: Uint8Array                   // 0 open, 1 solid (fine)
  private foodBlocked: Uint8Array             // derived, food resolution (for damming)
  private prox: Float32Array                  // derived, fine, clamped dist-to-wall (for sensing)
  isSolidAt(x, y): boolean                    // fine lookup (collision)
  losBlocked(x0, y0, x1, y1): boolean         // toroidal DDA over fine grid (occlusion)
  isFoodCellBlocked(foodCol, foodRow): boolean// damming
  proxGradAt(x, y, step): {gx, gy}            // central diff of prox (wall sense)
  fillTexture(out: Uint8Array): void          // render (fine)
}
```

Owned by `World` (parallel to `this.food`), built once in `setup()`. **Static → not in `stateHash`.**

### 5.2 Generation pipeline (deterministic, RNG-stream-independent)
Uses a **standalone `config.seed`-derived hash**, NOT `world.rng` — zero draws from the organism RNG
stream, so the organism seed sequence is byte-identical whether walls are on or off; `reset()`
reproduces terrain exactly.

```
generate(config, fertility):
  if config.wallRegionCount == 0: leave all-open; foodBlocked=0; prox=cap; return  // OFF = byte-identical

  1. REGIONS — scatter wallRegionCount seed cells (hashed); assign each FINE cell to its nearest seed by
     TOROIDAL distance → Voronoi biome blobs that wrap.
  2. GENERATOR + EROSION PER REGION — assign each region one of {NOISE, CA, ROOMS} (cycled/hashed) and a
     pocketErosion flag (D7): "ocean" regions structure dead water only; "cave" regions erode pocket
     margins.
  3. COMPOSITE — compute each generator's FULL-GRID toroidal pattern independently, select per fine cell
     by region: solid[cell] = pattern[genType[region[cell]]][cell]. Each parameterised toward
     config.wallDensity.
       - NOISE: periodic value-noise thresholded.
       - CA: hashed random fill → N toroidal-neighbour smoothing passes → caverns.
       - ROOMS: BSP rectangles + connecting corridors (toroidal).
  4. POCKETS OPEN (D7) — for each food-pocket cell (fertility > threshold): ocean-region area forced
     fully open; cave-region area keeps only a small open CORE (wallPocketCoreRadius) so walls intrude
     into pocket margins.
  5. CONNECTIVITY GUARANTEE — toroidal flood-fill open fine cells; for every food pocket centroid NOT in
     the largest open component, carve a straight corridor back into it. **No pocket can be sealed off →
     the world cannot generate itself into a corpse.**
  6. DERIVE masks: foodBlocked[foodCell] = (solid fraction of covered fine cells > 0.5); prox = clamped
     chamfer distance-to-nearest-solid over the fine grid.
```

Toroidal tileability: periodic noise, modulo CA, wrapping rooms/corridors, `wrapDelta` Voronoi.

### 5.3 Collision
Thread the fine wall grid into `integrate`. Between candidate `(px,py)` and the wrap-commit: if the
destination fine cell is solid, **slide** — try x-only and y-only sub-moves, keep whichever stays open,
zero the blocked velocity component. O(live). With no walls, never solid → unchanged + byte-identical.

### 5.4 Vision occlusion
In `senseCreatures`, skip a seen target if `walls.losBlocked(viewer, target)` (toroidal DDA over the
fine grid). **Gated on `wallRegionCount>0`** (zero cost + byte-identical when off). Ablation knob
`wallOccludesVision` (default true) isolates the term.

### 5.5 Food damming (in `FoodField.stepChannel`, gated on walls-present)
Using the derived `foodBlocked` mask (food resolution):
- **Regrow:** blocked cells hold no biomass — force `B=0`.
- **Diffuse:** no-flux — a blocked neighbour is treated as the cell's own value (zero contribution to
  `(avg4 − self)`), so biomass pools against rock and cannot diffuse through it.
- When walls absent, byte-identical to today.

### 5.6 Rendering
A fine wall texture layer (`R8` quad like the food heatmap) drawn between food and dots;
`Walls.fillTexture` mirrors `FoodField.fillTexture`.

## 6. Feature C — Vector flow field

### 6.1 Module + field
New `core/flow-field.ts` (`FlowField`, food resolution): `flowX`, `flowY` per cell. Generated as a
**divergence-free streamfunction flow**: `ψ = periodic noise`, `flowX = ∂ψ/∂y`, `flowY = −∂ψ/∂x`
(toroidal central differences). Curl of a scalar ⇒ **divergence-free** ⇒ donor-cell advection conserves
biomass. Magnitude scaled to `flowStrength`, **CFL-clamped** (`|v|·dt/cellW ≤ 1`). From a standalone
`config.seed`-derived hash (RNG-stream-independent). Static, **not hashed**.

### 6.2 Food advection (new pass in `food.step`, order: regrow → diffuse → advect)
**Donor-cell (first-order upwind) flux advection**, conservative + no-flux at walls, reusing the
existing `scratch` double-buffer + toroidal indexing:

```
for each non-blocked cell c, each of 4 faces to neighbour n:
  if foodBlocked[n]: skip (no-flux wall)
  flux = (flow component across face) · (upwind cell biomass) · dt / cellW
  move flux from donor to receiver
```

Per channel (handle `B2` when `channels===2`). `flowStrength===0` ⇒ skipped ⇒ byte-identical. Uses
wrapped neighbour indices throughout (reconciling the existing clamp-vs-wrap inconsistency).

### 6.3 Creature push (off by default)
A force pass **after `steer`, before `computeRepulsion`** (`+=` onto the reset buffer):
`force += flow(x,y) · susceptibility`, `susceptibility = (cellRadius/size)^flowPushSizeExp` — big bodies
resist, small/slow ones get carried. Fighting it costs energy via `moveCost·speed²`. `flowPushStrength=0`
⇒ skipped ⇒ byte-identical (**the default**).

### 6.4 Rendering
Flow arrows as a `drawLines` overlay (coarse sub-grid), toggled by a key.

## 6b. Feature D — Neural environment sensing (walls + flow) [D10]

Creatures must *perceive* walls and current to exploit them. Two new sensory inputs, each in the heading
frame (fwd/lat), wired into the brain exactly like the existing food-gradient and sight inputs — with
**evolvable weights and within-life learning**, so the sign and strength of the response is discovered
per lineage and per individual (a prey lineage evolves wall-attraction to hide; a predator evolves
wall-loiter to ambush or open-water patrol to chase; either can evolve to ride, cross, or fight the
current).

### 6b.1 Sense computation (new `senseEnv` pass, gated)
- **Wall sense:** `walls.proxGradAt(x, y, wallSenseRange)` → `wallX/wallY` (world frame; the gradient of
  the proximity field, pointing **away** from walls). New transient store arrays `wallSenseX/Y`. Gated on
  `wallRegionCount>0`.
- **Flow sense:** sample `flow(x,y)` → `flowSenseX/Y` (world frame). New transient arrays. Gated on
  `flowStrength>0 || flowPushStrength>0`.

Both are O(live), allocation-free, and ascending-order (determinism-safe). Skipped entirely (and the
transients stay 0) when their feature is off.

### 6b.2 Brain extension
Add to the `Brain` enum + bump `BRAIN_GENES`: `WALL_FWD_TURN, WALL_LAT_TURN, WALL_FWD_THRUST,
WALL_LAT_THRUST, FLOW_FWD_TURN, FLOW_LAT_TURN, FLOW_FWD_THRUST, FLOW_LAT_THRUST` (8 weights, mirroring
the sight block). In `steer()`, rotate `wallSenseX/Y` and `flowSenseX/Y` into the heading frame and add
their weighted contributions to `turnRaw`/`thrustRaw`. `FOUNDER_BRAIN` seeds these at 0 (founders start
neutral; selection + learning discover the response). `learnedBrain`/`elig` auto-extend, so Baldwin
plasticity refines wall/flow use within a life.

### 6b.3 Determinism — gated gene draws (preserves the ablation gate)
New brain weights are **drawn from RNG only when their feature is present at seed time** — wall weights
iff `wallRegionCount>0`, flow weights iff `flowStrength>0 || flowPushStrength>0` (the `FORAGE_PREF`
pattern). These gating flags are **captured at construction** (seed-time), so live-tuning
`flowStrength`/`wallDensity` never changes the genome draw count mid-run. When both features are off, no
new weights are drawn → the organism RNG stream and `stateHash` are **byte-identical to the
pre-environment engine**. With a feature on, the genome grows and the run legitimately diverges
(intended).

## 7. Tick-order insertions (verified `World.step`)

```
1.  rebuildLive
2.  hash.build
3.  senseFood
3b  >>> [D] senseEnv  — wall-prox gradient + flow sample → transients (NEW, gated)
4.  senseCreatures    >>> [A] vision occlusion (gated)
5.  steer             — resets force (=); >>> [D] adds wall/flow weighted inputs to turn/thrust
5b  >>> [C] FLOW PUSH — force += flow·susceptibility (NEW, +=, gated, off-by-default)
6.  computeRepulsion  — += force
7.  integrate         >>> [A] WALL COLLISION before wrap-commit (NEW, gated)
8.  hash.build
9.  hunt
10. metabolize        (later phase: destructible-wall energy debit lands here)
11. learn             — also consolidates the new wall/flow weights (Baldwin)
12. cullDead
13. reproduce         — only RNG use; mutates the new weights (gated draws)
14. rebuildLive
15. food.step         — regrow → diffuse(no-flux) → >>> [C] ADVECT(no-flux) (NEW)
16. tick++
```

## 8. Determinism & ablation contract

Off-switches whose OFF state is **byte-identical to the pre-environment engine**:

| Knob OFF value | Effect |
|----------------|--------|
| `wallRegionCount = 0` | no terrain; collision/occlusion/damming no-ops; no wall-sense genes drawn; zero RNG-stream impact |
| `flowStrength = 0` (+ `flowPushStrength = 0`) | advection + push skipped; no flow-sense genes drawn |
| `flowPushStrength = 0` | creature push skipped (**default**) |

- Wall + flow **generation** use a standalone `config.seed`-derived hash, independent of `world.rng`.
- Wall/flow **brain-gene draws** are gated on seed-time feature flags (§6b.3) → off = identical stream.
- Static walls + static flow add **no new fields** to `stateHash`. They affect the digest only through
  gameplay (kinematics, occluded steering, advected `B`) and the gated genome growth — so the digest
  diverges from baseline exactly when a feature is enabled (intended). The byte-identical guarantee is
  the **all-off** state.
- New reproducibility test: pins a walls+flow+sensing-on run byte-identical across two runs, plus
  non-vacuity (collisions fire, biomass advects, a target is occluded, a creature's wall/flow weight is
  non-zero and influences steering).

## 9. Config knobs (added to `Config` + `defaultConfig`)

```
// ── Walls ───────────────────────────────────────────────────────────────────
wallCols, wallRows: number    // FINE wall grid (default 512×512 = 16u). DECOUPLED from food grid (D9)
wallRegionCount: number       // Voronoi biome regions; 0 = OFF (byte-identical). Default ~5
wallDensity: number           // target solid fraction [0,1]. Default 0.35 (D8)
wallPocketCoreRadius: number  // fine cells kept open at a pocket centre in eroding regions (D7)
wallOccludesVision: boolean   // ablation: walls block line-of-sight. Default true (D4)
wallSenseRange: number        // central-diff half-step for the wall-prox gradient (world units, ~24)

// ── Flow field ──────────────────────────────────────────────────────────────
flowStrength: number          // advection magnitude (CFL-clamped). 0 = OFF (byte-identical)
flowScale: number             // streamfunction wavelength in food cells (eddy size)
flowPushStrength: number      // force on creatures. 0 = OFF (DEFAULT — D6)
flowPushSizeExp: number       // susceptibility = (cellRadius/size)^this. Default 1
```

Wall/flow seeds derive from `config.seed`. Live-tunable via the `Knobs` surface; `wallCols/wallRows/
wallRegionCount/wallDensity/flowScale` are reset-knobs (regenerate terrain), the rest live. **Genome
structure (whether wall/flow weights exist) is fixed at construction** (§6b.3).

## 10. File map

**New:** `core/walls.ts` (+ `core/wall-gen/{noise,ca,rooms}.ts`), `core/flow-field.ts`, `senseEnv` (in
`sense.ts`), tests for each.
**Touched:** `core/genome.ts` (Brain enum + BRAIN_GENES + FOUNDER_BRAIN + gated seed/mutate draws),
`core/brain.ts` (steer reads wall/flow inputs), `world.ts` (own + seed + thread walls/flow; senseEnv
call), `physics.ts` (wall collision + flow-push pass), `food-field.ts` (no-flux diffuse + advect),
`sense.ts` (occlusion + senseEnv), `store.ts` (wallSenseX/Y, flowSenseX/Y transients), `config.ts`
(knobs), `renderer.ts` (wall layer + flow arrows), `main.ts` (toggles/knobs), reproducibility test.

## 11. Increments (each independently reviewable)

1. `Walls` fine grid + noise generator + **connectivity guarantee** (flood-fill + corridor carve, §5.2.5
   — needed the moment walls can seal a pocket) + collision + spawn rejection + render layer. **Visible:**
   creatures bump walls.
2. Vision occlusion. **Visible:** ambush from behind cover.
3. Derived `foodBlocked` mask + wall-aware food damming. **Visible:** food pools against walls.
4. `FlowField` + food advection + arrow overlay. **Visible:** currents drift food.
5. Size-scaled creature push (off-by-default). **Visible:** flow-riding (passive).
6. **Neural sensing (D10):** `prox` field + `senseEnv` + Brain enum extension + gated draws + steer
   wiring + learning. **Visible:** lineages evolve toward/away from walls and along/against current;
   predators vs prey diverge in wall/flow use.
7. Region partitioning (Voronoi biomes) + CA + rooms generators (composited; connectivity from inc. 1
   already guarantees traversability). **Visible:** distinct biomes. ← built with a **parallel workflow**
   (one agent per generator + a region-composite/integration agent), per the owner's "dynamic workflows
   to generate pockets utilizing each method" direction.

## 12. Risks & open modeling choices

- **Alive-guardrail (top risk):** walls + damming can starve/strand the population. Mitigations: the
  connectivity flood-fill + corridor carve (§5.2.5), moderate default density, pockets staying open, and
  a **headless probe** (`src/headless/`) running the walls+flow+sensing demo config multi-seed,
  asserting the world stays alive (births AND deaths, trophic levels persist) before merge. Density and
  region mix are tuned against this probe.
- **Genome growth & golden churn:** adding brain genes grows the genome and changes the digest whenever
  a feature is on. Accepted (gated so all-off stays byte-identical); the reproducibility test is
  regenerated for the feature-on config.
- **Wall-sense smoothness:** a raw binary mask has no usable gradient; the derived `prox` distance field
  fixes this. `wallSenseRange` is tuned so the gradient is informative without over-smoothing fine
  walls.
- **Defaults chosen:** advect order = regrow → diffuse → advect; flow is **static** this pass (slow
  time-variation is a trivial later knob); wall grid default 512² (16u), tunable.
- **Region-boundary abruptness:** the composite picks one generator per cell → sharp biome borders,
  which reads as "distinct biomes"; connectivity keeps them traversable.

## 13. Acceptance

- All increments land with `make check` green (types, lint, tests).
- Off-switches verified byte-identical (reproducibility test, all-off state).
- New reproducibility test pins walls+flow+sensing-on determinism + non-vacuity.
- Headless alive-guardrail probe passes multi-seed at the demo config with default walls + flow +
  sensing on (creature-push off).
- Live demo visibly shows: collision, occlusion-driven ambush, food pooling against walls, drifting
  currents, **lineages evolving differentiated wall/flow behavior**, and distinct biome regions.

## 14. Out of scope (future phases)

- Destructible / passable (toll/HP) walls + their energy economy (D1).
- Dynamic (time-varying) flow; wall-aware repulsion.
- Higher-order AI heuristics beyond what evolves from the physics + the new senses.
