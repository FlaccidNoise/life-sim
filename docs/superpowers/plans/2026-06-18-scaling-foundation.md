# Scaling Foundation — Bigger, Sparser, Longer-Lasting World (ecology continuation)

**Status:** plan (2026-06-18). Owner-approved direction (decisions below). Builds directly on the
merged M7.5 ecology + environmental layer. Headless-first, determinism-gated, tiny increments — same
methodology as the ecology milestone. Companion analysis: `DESIGN-SCALING.md`, `AUDIT_REPORT.md`.

## Owner decisions (2026-06-18)
1. **Density model:** "globally sparse, locally dense pockets" — clustered food, foragers navigate
   between clusters, the contact-ecology runs *within* each cluster.
2. **Cost model:** foundation first — make per-tick cost O(live), not O(capacity)+O(area), *before*
   pushing world size up.
3. **Sequencing:** fold into the ecology arc (one coherent track), not a separate milestone.

## Why this order (evidence)
- Sensing is NOT the blocker: measured chemotaxis range is ~29 patches ≈ 92% of the half-world at any
  size with the current fixed grid (`src/headless/sensing-range-probe.ts`). Foragers *can* navigate between sparse
  pockets.
- The real blockers are (A) contact-ecology needs local density — bigger+sparser at fixed population
  collapses the food web (`feel-probe.ts:174`, `config.ts` M2 note); and (B) per-tick fixed cost scales
  with capacity+area, so a big sparse world wastes ~90% of each tick on empty space (ARCH-003).
- Clustered pockets dissolve (A); the cost-model rework dissolves (B). Do (B) first so the bigger-world
  experiments in (A) aren't drowning in overhead.

## Hard invariants (every increment)
- **Determinism contract:** byte-identical given (Config, seed). `reproducibility.test.ts` is the gate.
  **The canonical ASCENDING live-slot order is load-bearing** (lifecycle/metabolize/hash/repro all rely
  on it) — any live-set change MUST preserve ascending order.
- **Cardinal rule:** no fitness/score/ranking in `src/core/**`; selection stays purely economic.
- `make check` green at every increment.

---

## Phase A — Per-tick cost becomes O(live), not O(capacity)+O(area)

The free-list pops ascending and is LIFO (`cell-store.ts:94-115`), so live slots cluster in
`[0, highWaterMark]`. This is the key: we get O(live) **without** abandoning ascending order.

- **A1 — High-water-mark-bounded cell scan. ✅ DONE (2026-06-18).** `CellStore.highWaterMark` (= highest
  live slot + 1, walked down on top-slot frees; maintained in alloc/free, unit-tested) bounds
  `World.rebuildLive` to `[0, hwm)` instead of `[0, capacity)`. Byte-identical (442 tests green; the
  skipped tail is dead by the mark's invariant). Benchmark (`src/headless/scaling-bench.ts`): per-tick cost is flat
  ~1.04 ms across maxCells 50k→2M at a fixed ~10k live population (was an O(maxCells) scan ×2/tick).
- **A1b — Extend the high-water-mark bound to bonds + the O(maxOrganisms) scans.** `bonds.rebuildLive`
  scans `maxBonds`; the aggregate/death/adulthood loops scan `maxOrganisms`. Apply the same bound (a
  bond hwm; a live-organism hwm or compact id-ordered list). Same determinism guarantee.
- **A2 — Touched-bucket spatial-hash clear.** `SpatialHash.build` does `counts.fill(0)` + a prefix sum
  over ALL buckets every tick = O(world_area/cellSize²). Track the set of buckets touched last build and
  clear only those (or keep a generation stamp per bucket and treat stale stamps as empty). Preserves the
  counting-sort output exactly → determinism byte-identical. **Gate:** byte-identical hash output (add a
  test that the bucket contents match a full-clear build); benchmark shows O(occupied) not O(area).
- **A3 — (only if A1/A2 insufficient at target scale)** a sparse/compact live-organism list maintained
  in ascending id order in alloc/free, replacing the remaining O(maxOrganisms) scans. More invasive;
  defer until benchmarks justify it.

**Phase A exit:** at a fixed (sparse) population, per-tick wall-clock is flat as `maxCells`/`worldWidth`
grow (verified by a headless scaling benchmark), determinism intact, `make check` green.

## Phase B — Clustered-pocket food model + scale-up

- **B1 — Clustered substrate.** The light field already seeds Gaussian patches
  (`scalar-field.ts` `seedPatches`). Expose "globally sparse, locally dense" as a tuning regime: fewer
  patches (`lightPatchCount` ↓), tighter radius (`lightPatchRadius` ↓), higher `lightMax` so within a
  pocket the producer density stays high. No engine change — config + a headless sweep. Add a
  `headless/pocket-probe.ts` reporting inter-pocket distance vs chemotaxis range and intra-pocket
  density vs the contact-ecology threshold.
- **B2 — Validate ecology within pockets + navigation between.** Confirm (headless, multi-seed) that
  foragers find pockets (sensing range covers inter-pocket gaps), the 3-trophic system sustains inside
  pockets, and predators get the local density they need. Tune pocket spacing to the measured sensing
  range. **Gate:** all three levels coexist multi-seed at the sparse-pocket regime, 12k+ ticks.
- **B3 — Scale-up.** With Phase A's O(live) cost, raise `worldWidth`/`worldHeight` (and `maxCells`) while
  holding pocket density. Decide the grid-resolution policy (DESIGN-SCALING.md: fixed-count grid keeps
  map-spanning gradient range that auto-scales; world-derived grid sharpens local gradients but shortens
  range — pick per the navigation needs and DOCUMENT the invariant; CONF-003). **Gate:** the 3-trophic
  system holds across seeds at the bigger scale; per-tick cost stays flat per live cell.

## Secondary (fold in opportunistically)
- **CONF-002** area-normalize the economy so a `cellRadius` rescale is self-similar (the ecology rescale
  hand-tuned ~6 knobs; normalize to stop re-deriving them).
- **CORR-004** make the organism centroid a toroidal (circular-mean) average — wrong for seam-straddling
  bodies, which get more likely as the world grows.
- **CONF-003** lock the grid-resolution invariant chosen in B3 with a config test.

## Out of scope (later)
- M8 parallelism (Workers + SAB). Note ARCH-001: only `CellStore` is SAB-backed today; bonds/organisms/
  net/fields are plain buffers, so a worker port is more than mechanical. Revisit once single-thread
  O(live) scaling is exhausted.

## Risks
- **Ascending-order regressions** are determinism breaks — every Phase A change must show byte-identical
  reproducibility BEFORE merge. Treat a red repro test as a hard stop.
- **3-trophic systems are extinction-prone** — multi-seed long-run probe is the gate; single-seed success
  is necessary-not-sufficient (same discipline that carried the ecology milestone).
