# Audit Report — life-sim

**Date:** 2026-06-17
**Scope:** `src/` (131 `.ts` files, ~7.8k LOC engine + ~7.2k LOC tests), branch `ecology-predation`
**Method:** 8 dimension specialists (correctness/determinism, architecture, dead-code, performance/scale,
test-coverage, config-surface, doc-drift, simplification) in parallel; **every** CRITICAL/HIGH/MEDIUM
finding adversarially verified by an independent skeptic. 27 agents, ~1.3M tokens.
**Baseline:** `make check` GREEN — typecheck ✓, lint ✓, **320 tests pass** (65 files, 11.5s).

## ⟳ Post-Merge Status (2026-06-18)

The original audit ran on the pre-merge `ecology-predation` branch. Since then **all parallel worktrees
merged to main** (full M7.5 ecology + a 3-wave environmental layer: day/night, rocks, temperature,
toxin, glow, currents; 131 → 160 files, ~6000 new lines). This worktree was re-synced to main and
re-audited. Current state of every finding:

**Fixed by the merge:** CORR-002/TEST-001/TEST-002 (latch + tether now have tests; a predation+fleeing
ON-path reproducibility test exists), DOC-003 (READS-WRITES.md updated with the ecology steps).

**Fixed in the simplify pass (this session, `make check` green, byte-identical):**
- SIMP-001 / DUP-1 / DUP-2 — 5 near-duplicate scalar-field classes → one `ScalarField` base (~206 LOC removed).
- ENV-01 — per-tick `EnvEffects` allocation in `metabolize` → reused scratch (hot-loop alloc removed).
- DEAD-001 — orphan `constants.ts` + unused `EPSILON` deleted.
- DOC-001 — README status corrected (M1 → M7.5).
- ENV-03 — `current-force` doc corrected to match the code.

**Re-validated on the new layer:** the environmental code is correct — determinism sound (RNG
substreams 1=light/2=mutation/3=rocks/4=temp/5=current, no collisions), energy economy correct,
toroidal handling correct, an env-ON reproducibility test exists.

**Still open (recommended follow-ups, not yet applied):**
- ~~ARCH-003~~ — **DONE (2026-06-19, plans 001-005 merged to main).** Phase A1 (cell hwm) was already done; plans 005 added A1b (bond + organism high-water-marks bounding `rebuildLive` + the adulthood scan) and A2 (SpatialHash generation stamps replacing `counts.fill(0)`). Byte-identical; 593 tests green. Residual: the prefix-sum loop still scans all buckets (~1.3× growth over 16× area, not O(area)) — see `plans/005` follow-up.
- ~~SIMP-002~~ — **DONE (plan 004).** `metabolize` reduced from 31 → 10 positional args via 4 named structs (`EconomyParams`/`PredationParams`/`GrazeParams`/`LatchArrays`) on reused-scratch World fields (zero hot-loop allocation). Byte-identical.
- ~~CORR-002/TEST-001/TEST-002 (graze half)~~ — **DONE (plan 002).** A `reproducibility — graze-latch + sessile chain-plants + satiation ON` block pins the graze/chain/satiation hot path byte-identical with non-vacuity asserts. (The predation half was already covered by the prior cycle's block.)
- ~~CONF-004~~ — **DONE (plan 003).** `predLatchStiffness`/`grazeLatchStiffness` now gated under `k·dt² ≤ 2.5` in `config.test.ts` (mirroring the bond gate) + a `latch-tether.test.ts` divergence test proves the guard is non-vacuous.
- CONF-002 — economy hand-coupled to `cellRadius` (area-normalize); CONF-003 — grid resolution not world-derived (a tradeoff to lock); CORR-004 — organism centroid is a non-toroidal mean (seam bug as worlds grow). **Still open.**
- ENV-02 [LOW] — glow field freezes (stops decaying) when all emitters die mid-run, feeding stale lure to surviving GLOW sensors. **Behavior-changing bugfix** — gate `glow.step` on the glow-enabled config, not the runtime effector count (`world.ts`). Left for a reviewed fix since it alters glow-ON output. **Still open.**
- Minor: DC-1 (test-only `dayFraction`/`seasonFraction` exports), MAG-1 (rock `maxAttempts=50` magic number), ENV-04 (rock-collision grid-size constraint un-asserted), DUP-3 (grid-index idiom across 6 grid classes), DUP-4 (overlay shader scaffold).

Plans for the above live in `plans/` (001-005, all DONE/merged). See `plans/README.md` for the index and the rejected-findings list.

## Overall Risk: LOW

This is a healthy, exceptionally well-documented codebase. The M2–M7 core (economy, neural, bonds,
genome, evolution) is solid: no `Math.random`/`Date.now` in core, energy is conserved across the
kernels, toroidal wrapping is correct, the bond-spring stability ceiling is respected, and the SoA
free-list/generational-id handling is sound. The determinism contract holds and is well-tested.

**The risk is concentrated in ONE place: the new, OFF-by-default ecology/predation code** (the active
milestone). The predation **latch + tether** (`latch-tether.ts`, the HOLD branch of `metabolize`)
ships with **zero test coverage** and is **not on the determinism contract**. Everything else is
polish: doc drift, a config surface that's hand-coupled to `cellRadius`, long positional argument
lists, and field-class duplication.

The adversarial pass **rejected 6 of 19 verified findings as false positives** (32%), including two I
initially believed myself (a predation "ABA" id-recycle bug — refuted because organism `cellCount` is
re-derived every tick, never a dangling ref; and a "chemotaxis range is physically infeasible" claim —
refuted by direct simulation and re-confirmed by my own measurement, see DESIGN-SCALING.md).

| Severity | Confirmed (verified real) |
|---|---|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 7 |
| LOW | 5 (verified) + 16 (cited, unverified) |
| INFORMATIONAL | 1 (verified) + 9 (cited) |

**Top priorities:**
1. **[MEDIUM] Ecology latch/tether is untested + off the determinism contract** (CORR-002, TEST-001, TEST-002, CONF-004) — the hottest new code, no regression guard, a force kernel with an uncapped spring.
2. **[MEDIUM] `metabolize()` takes 22 positional args** (SIMP-002) — real arg-order-bug risk; mechanical fix.
3. **[MEDIUM] O(maxCells)/O(maxOrganisms) full-capacity scans every tick** (ARCH-003) — the documented scale cliff for the bigger/sparser-world goal (not a problem at current scale).

---

## Confirmed Findings (adversarially verified)

### Ecology / predation — the real risk cluster

#### [MEDIUM] CORR-002 / TEST-001 / TEST-002 — Predation latch + tether is entirely untested and off the determinism contract
**Files:** `src/core/physics/latch-tether.ts:15-43`, `src/core/cells/metabolism.ts:112-179`, `src/core/cells/metabolism.test.ts:25-26`, `src/core/sim/reproducibility.test.ts:255-266`
- `applyLatchTether` (a force-pass kernel that scatters Newton's-3rd forces onto a handle via toroidal `wrapDelta`) has **no test file** — every sibling kernel (adhesion, bond-force, forces, integrator, thrust) has one.
- Every `metabolize()` test passes `predLatchRange=0`, so the entire HOLD branch (`metabolism.ts:146-179`: `newLatch` assignment, `latchCell` write, hold-vs-strike preference, release path) has **zero coverage**.
- No reproducibility test runs with `preyDeposit>0` / `predLatchStiffness>0`, so **no predation path is on the byte-identical determinism contract**, and `latchPrey`/`latchCell` are hashed nowhere.
**Impact:** The hottest new code on the active milestone — two force/economy kernels writing the force buffer and energy with recycle-prone handles — has no regression guard, and the suite is the project's correctness oracle.
**Fix:** Add `latch-tether.test.ts` (equal-and-opposite force on a valid flesh handle; no-op for handle 0 / non-flesh; toroidal seam). Add a `metabolize` test with `predLatchRange>0` (hold-preference, sustained drain, release on prey death). Add a predation-ON case to `reproducibility.test.ts` mirroring the `crowdDivideCap` ON-path block (`:278-316`).

#### [MEDIUM] CONF-004 — `predLatchStiffness` is a live spring with a stated stability ceiling but NO cap, NO test, NO guard
**File:** `src/core/sim/config.ts:113-116`, `src/core/physics/latch-tether.ts:36-41`
The tether is a raw scatter spring (`fx = stiffness*dx` mutual, no rest length, no `/d` normalization) applied in the same symplectic-Euler force stage as bonds. `bondStiffness` has a `config.test.ts` assertion bounding it under the documented divergence ceiling; `predLatchStiffness` has none — a future slider could drive it past the ceiling and diverge SoA state to ±∞.
**Fix:** Mirror the `bondStiffness` safeguards — a `config.test.ts` bound + a `latch-tether` divergence test + cap any future slider at the ceiling.

### Maintainability

#### [MEDIUM] SIMP-002 / ARCH-002 — `metabolize()` takes 22 positional arguments
**File:** `src/core/cells/metabolism.ts:33-56` (signature), `src/core/sim/world.ts:455-478` (call)
22 positional params, including three adjacent `number`s (`predDigestRate, predDigestEfficiency, predReach`) and three adjacent `Uint32Array`s (`latchPrey, latchCell, organismCellCount`) — swap any same-typed pair and it compiles clean. `integrate` (13), `computeBondForces` (13), `computeAdhesion` (12) are milder cases.
**Fix:** Group the scalar economy knobs into an `EconomyParams` struct (reused per-tick like the existing `reproParams` at `world.ts:169-179` to stay allocation-free) and pass the typed-array refs as a small named object. Pure mechanical, determinism-safe, keeps the `cells/`-off-`sim/` DAG intact.

#### [MEDIUM] ARCH-003 — Full-capacity scans every tick (the documented sparse-world scale cliff)
**Files:** `world.ts:242-250` (`rebuildLive`, called ×2/tick at `:326`,`:526`), `bonds.ts:126-135` (`rebuildLive` over `maxBonds`), `world.ts:617-627` (O(maxOrganisms) adulthood scan)
`rebuildLive` scans the full `maxCells` capacity (100k) twice per tick regardless of live population; bonds scan `maxBonds` (16k); the adulthood/aggregate/death scans are O(maxOrganisms) (8k). **Not a problem at current scale** (forces dominate), but it's the documented cliff: in a bigger/sparser world these fixed costs invert and dominate. Verifiers correctly rejected the *perf-dimension* framing (it's not a current bottleneck) while confirming the *architecture* fact.
**Fix:** Maintain `liveIndices` incrementally (push on alloc, swap-remove on free) so `rebuildLive` becomes O(live) or disappears; same for a live-organism list. **The single highest-leverage change for the bigger/sparser-world goal.** See DESIGN-SCALING.md.

### Config surface (design-relevant for the rescale)

#### [MEDIUM] CONF-002 — Economy knobs are hand-coupled to `cellRadius`, not normalized
**File:** `src/core/sim/config.ts:34-35, 71-74, 238-248, 313-316`
The comment itself says photo/digest/basal all scale with `area = radius²`, so `cellRadius` is "a hidden economy lever — re-derive balance if it changes," and ~6 knobs (`photoGain, digestRate, basalCost, divideThreshold, reproThreshold, reproParentFloor`) are absolute values silently tied to `cellRadius=6`. `crowdGridSize`'s "cells-per-bucket" semantics are tied to `cellRadius=6` too. The ecology rescale (r6→r4) already had to hand-rescale all of these.
**Fix:** Decide: express the economy in **area-normalized units** (gain/cost per unit area) so a `cellRadius` change is self-similar, OR add a derived-constants helper that recomputes the coupled knobs from `cellRadius`. At minimum make `crowdGridSize` a multiple of `cellRadius`.

#### [LOW←MEDIUM] CONF-003 / ARCH-004 — Light/food grid resolutions are hardcoded counts, not world-derived
**File:** `config.ts:230-231, 259-260`; `food-field.ts:32`; `sense.ts:37`
`lightGridCols:32`/`foodGridCols:64` are fixed counts anchored in-comment to the 2048 world, while the density grid IS world-derived (`world.ts:154`). At 4096+ the fixed grid doubles `patchW` → coarser gradients. **This is a genuine tradeoff, not a bug** (see DESIGN-SCALING.md): fixed counts give map-spanning gradient *range* that auto-scales with the world; world-derived grids give sharper *local* gradients but a shrinking range fraction. Decide explicitly and document the invariant.

### Cleanups

#### [LOW←MEDIUM] SIMP-001 — `FoodField` and `LightField` are near-duplicate classes
**Files:** `src/core/environment/food-field.ts`, `light-field.ts`
`patchIndex`, `sampleAt`, the constructor geometry, the a/b double-buffer, and the 5-point toroidal Laplacian `step()` are line-for-line identical; they differ only in the per-cell tail (decay vs regen-to-cap) and `depositAt`/`depleteAt`.
**Fix:** Extract a shared `ScalarField` base (or a free `diffuse5pt(src,dst,...,applyTail)` helper); subclasses pass only their tail. Behavior-preserving, no RNG, determinism-safe.

#### [INFO←MEDIUM] DEAD-001 — `constants.ts` is an orphan; `TWO_PI` redefined 3×, `EPSILON` unused
**File:** `src/core/math/constants.ts:1-2`
`grep -rn "math/constants" src` → zero hits. `EPSILON` is referenced nowhere; `TWO_PI` is privately redefined in `develop.ts:30`, `critter-genome.ts:12`, and as `TAU` in `act.ts:4`.
**Fix:** Delete `EPSILON`; either delete `constants.ts` and keep the local copies, or import `TWO_PI` from it and drop the redefinitions. One source of truth.

#### [LOW] DOC-001 / DOC-002 / DOC-003 — Documentation drift
- **DOC-001** `README.md:9-11` advertises "M1 — Particle Core complete … Next: M2" but the code is at M7.5 (genome + evolution + ecology all present).
- **DOC-003** `src/core/sim/READS-WRITES.md` declares itself the authoritative per-step tick contract ("change this table first") but has **zero** rows for the ecology steps actually wired into `tick()` (latch-tether force step, predation strike/latch in METABOLIZE, prey-field deposit/step, SENSE's preyField/carnivore reads).
- **DOC-002** `world.ts:42-43` tick docstring omits the latch-tether step.

---

## Notable verified false positives (rejected — do NOT act on these)
- **CORR-001** "Latch holds prey by recycled organism-id (ABA)" — REFUTED: `organismCellCount` is re-derived from scratch every tick by `aggregateOrganisms` (`world.ts:556`), so it is never a dangling reference; the stale-positive window and the cell-exists window provably never overlap.
- **PERF-001** "Chemotaxis range physically infeasible for a big sparse world" — REFUTED by direct simulation **and re-confirmed by independent measurement** (`src/headless/sensing-range-probe.ts`): the gradient is sensible out to ~29 patches (~92% of the half-world). See DESIGN-SCALING.md.
- **ARCH-001** "SharedArrayBuffer story incomplete" — the FACT is true (only `CellStore` is SAB-backed; bonds/organisms/net/fields use plain buffers) but it is **deferred-M8 work, not a bug**; nothing reads `.shared` back. Kept as a design note for the parallelism path.
- **PERF-002/003** (rebuildLive/bonds scans as a *perf* problem) — folded into ARCH-003 as a *future* scale cliff, not a current bottleneck.
- **CONF-001** `deserializeConfig` no validation — internal-only boundary, not untrusted input.

## Cited LOW/INFORMATIONAL (not adversarially verified — worth a glance)
ARCH-005 (stale "unused" comment on `OrganismTable.free`), CORR-004 (organism centroid is a plain
non-toroidal mean — wrong for seam-straddling bodies in a bigger world), CORR-005 (split fragment
loses carnivore/genome identity), DEAD-002/003/004 (unused type aliases `CellTypeValue`,
`SensorChannelValue`; `lenSq` test-only), DEAD-006 (genome serialize round-trip test-only),
DOC-004 (`AGENTS.md` mandates `git push` to a non-existent remote), SIMP-003/004/005/006 (duplicated
toroidal 3×3 iteration / clamped grid-index idiom / fillDensity wrap block / unused `torusDist`),
CONF-006 (hardcoded spawn `energy=100`, `mass=1` — a survival lever in the sparse regime),
PERF-005 (field diffusion + hash bucket clear scale with world AREA).

Per-dimension raw findings + adversarial verdicts were retained in the audit workflow transcript.
