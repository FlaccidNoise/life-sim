# M5 — Multicellularity (Bonds & Organisms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent bonds so cells form multicellular organisms — a flat SoA bond pool + per-cell adjacency + degree cap (§5.2), bond-spring + minimal adhesion forces (§4.4), incremental `organismId` with split-on-break (§4.8), intra-organism energy transfer along bonds (§4.5), and a concrete multicellular payoff (digestion clustering) — then fold the hand-wired M4 critter into a real bonded organism, replacing the interim kinematic rigid grouping (spec §8 M5 acceptance, §11 M5 control deliverable).

**Architecture:** A new pure `core/organism/` module owns the **bond network** (flat SoA pool with a free-list + gen-validated endpoints in SEPARATE arrays — NOT bit-packed, §4.2/§5.2; per-cell fixed-degree adjacency + a degree cap), the **organism table** (per-id energy/cell-count/centroid aggregates), the **split-on-break** algorithm (dual-frontier BFS bounded by the smaller side → relabel + fresh `organismId`), **energy transfer** (gradient diffusion toward needier cells), and the **digestion-clustering bonus**. Bond-spring + adhesion FORCES live in `core/physics/` (raw typed arrays, scatter form for the explicit bond edge list). `World.tick` wires them in the §4.3 order and the M4 kinematic grouping (`repositionPassengers` + the rigid table) is **deleted**: the critter's cells are now bonded, share energy via transfer, and the brain drives a physically-cohered body whose orientation is its MOVER's heading.

**Tech Stack:** TypeScript 6 strict, Vitest 4 (`--expose-gc` via `NODE_OPTIONS`), WebGL2, Vite 8, pnpm 11, Node 22. Determinism is an engineered invariant; the hot loop is allocation-free; energies/strains are Float32 (`toBeCloseTo`, never `toBe`).

**Hardened by adversarial audit (2026-06-16):** a 9-lens multi-agent audit (55 agents; each finding double-verified by skeptics that re-derived the math) confirmed 2 distinct blockers + majors, all fixed in this revision — (1) `bondStiffness=8` is numerically unstable under semi-implicit Euler (`k_eff = bondStiffness·perBondStiffness`, ceiling ~3; k=8 → ~1e162) → default lowered to 1.5, a config-test stability gate added, the golden test pinned, the slider capped; (2) the golden-bond split test asserted the wrong (relabelled) side keeps the org id → fixed to a partition/energy-conservation assertion; (3) architecture.json has no `core/neural` entry to mirror and the intra-`core` DAG isn't lint-enforced → documented as a human-reviewed convention, no false-edit. See the "Adversarial audit record" at the end for the full list.

## Global Constraints (every task implicitly includes these)

- **`make check` is the per-task gate** = `pnpm typecheck && pnpm lint && pnpm test` (typecheck → lint → test, in that order). Do NOT rely on `vitest` alone — an M3 and an M4 lint error each slipped through a vitest-only check. The full-suite floor is **145 tests** (M0–M4); M5 only adds.
- **Commit per task with `git commit --no-verify`** (a beads pre-commit hook force-adds `.beads/issues.jsonl` — `--no-verify` keeps code commits clean; manage beads separately with `bd`). **NEVER add a `Co-Authored-By` trailer** (a hook blocks it).
- **Branch `m5-multicellularity`** off `main` @ `7dec3a1`. Merge `--ff-only` via `git push . m5-multicellularity:main` then `git checkout main` (no dev-server worktree flicker). NO git remote (don't push).
- **Layering (§5.1 DAG):** `core/physics` takes RAW typed arrays, never `Config`, never `CellArrays`. `core/organism` may import `math`/`memory`/`spatial`/`cells` (and the `CellStore` *type* for gen-validation, the way `NeuralNetwork` does), never `sim`/`render`/`app`/`workers`. `core/neural` stays as-is and must NOT import `core/organism` (`orient.ts` takes raw arrays only). `World.tick` unpacks `cfg.*` at the call site. **NOTE (audit):** only `core ↛ render/app/workers` is ESLint-enforced; the *intra-`core`* DAG (e.g. `neural ↛ organism`, `physics ↛ cells`) is a **human-reviewed convention** — `make lint` does NOT catch an intra-`core` violation. Keep these imports clean by hand and check them in review.
- **Zero-alloc hot loop:** a `--expose-gc` test ticks 50k cells × 500 (30s timeout). Pre-allocate ALL scratch in constructors (bond pool, adjacency, organism aggregates, the split-check BFS queues + visit-stamp arrays, the digest-bonus array). No per-tick literals/closures/`.map`/`.filter`. `typedArray.fill(0)` is allocation-free and allowed.
- **Determinism:** byte-identical SoA + bond + organism state for `(Config, seed)`. Canonical ascending iteration (live-bond list, live-cell list, BFS neighbour order, organism-id free-list all ascending). **M5 draws NO new RNG** (bonds/transfer/split/aggregate are deterministic; light still uses `rng.split(1)`). If any future stochastic adhesion/formation is added it must use `rng.split(3)` (light=1, M3 reflex=none, M4 THINK=none).
- **Float32 fields** (`energy`, `heading`, bond `restLen`/`stiffness`, organism `energy`) → assert with `toBeCloseTo` (energies near 100 at digit 4; transfer/force results at digit 4–5), never `toBe(literal)`. Use `Math.fround` oracles for multi-step accumulations.
- **Safe references (§4.2):** bond endpoints store `(slotIndex, generation)` in SEPARATE parallel arrays — NEVER bit-packed (mirror the M4 synapse pool). Endpoint validity is established by `rebuildLive` (a structural-event snapshot); the per-cell adjacency is maintained incrementally on `addBond`/`removeBond` (O(degree)).
- **Do NOT renumber `CellType`.** PHOTO=0, DIGESTIVE=1, MEAT=2, MOTILE=3, SENSOR=4, NEURON=5, MOVER=6 are stable.

## Decisions locked with Josh (2026-06-16)

1. **Multicellular payoff = digestion clustering.** `digestionGain` scales with bonded DIGESTIVE neighbours (`gain ·= 1 + digestClusterBonus · bondedDigestiveNeighbours`), so a clustered digestive organism out-harvests lone cells. Clearest emergent gradient, least machinery (reuses the verified PHOTO/MEAT trophic web — no new predators), trivially deterministic, pairs with energy transfer. The other two payoffs (predation refuge, faster collective locomotion) are deferred.
2. **Bond formation = hand-built bonds + a minimal adhesion FORCE.** Bonds are scripted at build time (mirroring how M4 hand-wired the brain). Adhesion is a short-range type-compatible attraction force (validated minimally, **default OFF** so the verified M2/M3 ecosystem is unperturbed). **Genome-gated adhesion-on-contact bond FORMATION is M6** — M5 has NO per-tick bond formation.
3. **Fold the M4 critter into a bonded organism = YES.** Delete `repositionPassengers` + the rigid table; the critter's cells are bonded (spokes + bracing for near-rigid shape), share energy, and the brain drives the MOVER. Organism orientation = its MOVER's heading (propagated to SENSOR cells for body-frame gradient projection).
4. **Energy transfer = gradient diffusion toward needier cells.** Per bond per tick: energy flows from the higher-energy endpoint to the lower at `transferRate × gap`, arriving scaled by `transferEfficiency (<1)`. Local, O(bonds), allocation-free.

## Scope boundary (what M5 does NOT do — deferred, documented)

- **No organism-level reproduction / maternal provisioning** (M6). M5 organisms are hand-built and do not reproduce.
- **No death-driven bond reaping / organism death cascade** (M6, with organism lifecycle). In M5 **all organism cells (`organismId !== 0`) are lifecycle-exempt from death AND division** (generalising the M4 neural exemption), so no bonded cell dies mid-run → no dangling bonds → bond removal is **strain-break only**. The split-on-break MECHANISM is fully built and tested (via strain/manual break); wiring death into it is M6.
- **No cross-organism synapse pruning on split** (M6's per-organism brain model). M4's global neural net is retained; the split-on-break deterministic test uses NON-neural cells, so this never bites in M5. Documented in READS-WRITES.md.
- **No incremental organism-aggregate maintenance** (an M7/M8 perf optimisation). M5 recomputes `orgEnergy/cellCount/centroid` each tick in one O(live) pass (exact, simple, allocation-free, fine at the M5 10–50k regime). The split RELABELS `organismId` incrementally (O(smaller side) BFS — the load-bearing part); the aggregate numbers are then recomputed by that pass. Toroidal-seam-correct centroid is deferred (M5 uses a plain mean; hand-built organisms are small + placed away from the seam).
- **Per-cell adjacency = fixed-max-degree slots** (a `maxCells × degreeCap` `Int32Array`), NOT CSR. The spec (§5.2) permits either; fixed-degree is simpler and O(degree) for add/remove/reap. Degree cap is an explicit Config knob; overflow refuses the bond (returns −1).

## Invariants to preserve (do NOT regress)

- **The 145 M0–M4 tests stay green.** The M2/M3 ecosystem (free PHOTO/DIGESTIVE/MOTILE, `organismId === 0`) must behave identically: `adhesionStrength` defaults to 0; `digestClusterBonus` only affects bonded digestives (none exist in `seedLife`); the lifecycle exemption only adds `organismId !== 0` (free cells unaffected); bond forces/transfer iterate an empty live-bond list when no bonds exist.
- **`World.tick` stays allocation-free.** Bond pool, adjacency, organism aggregates, BFS queues/stamps, and the digest-bonus array are all pre-allocated in constructors. The live-bond list is rebuilt into a pre-allocated array.
- **Determinism incl. bonds/organisms:** ascending live-bond order (force/transfer/digest), ascending live-cell order (aggregate), ascending neighbour order in the split BFS, ascending organism-id free-list (first `alloc()` returns 1, matching the M4 critter's id). Extend `reproducibility.test.ts`.
- **Bond forces use SCATTER** (write both endpoints, Newton's 3rd law preserved) — correct for the explicit bond edge list. The gather form (§4.4) is required only for the neighbour-repulsion broad phase (lock-free Worker parallelism, M8); adhesion uses gather (it's a broad-phase neighbour force). M8 partitions bonds by organism graph.
- **`net.rebuildLive` stays snapshot-only** (structural events: critter build). M5 splits do not free cells, so synapses never dangle from a split; the split test uses non-neural cells. (Death-driven `rebuildLive` + severed-activation zeroing is M6.)
- **Positions Float64; render downcasts.** Bonded cells now integrate dynamically (no kinematic snap) — the renderer's `prevGen`/NaN-prev de-streak still applies; verify in the Task 21 capture.

## Tick READS/WRITES additions (apply to `src/core/sim/READS-WRITES.md` in Task 14)

New/changed steps (spec §4.3; the M4 `repositionPassengers` step 6b is **removed**):

| # | Step | Reads | Writes |
|---|---|---|---|
| 1b | **bonds.rebuildLive** | bond pool + `generation[]` | `liveBonds`, `liveBondCount` |
| 2c | **orientSensors** (before THINK) | sensor bindings; `organismId`; `organisms.mover`; `heading`[mover] | `heading`[sensor cells] |
| 5c | **computeBondForces** | `liveBonds` (cellA/cellB/restLen/stiffness); posX/posY | forceX/forceY (**scatter**, both endpoints; after repulsion + thrust) |
| 5d | **computeAdhesion** (default off) | hash; posX/posY/radius/cellType/organismId | forceX/forceY (gather; same-type, different-organism, in `(contact, range]`) |
| 6c | **breakStrainedBonds** (after integrate) | `liveBonds`; posX/posY; restLen | bond pool (remove over-strained); `organismId` (split relabel via `SplitChecker`); `organisms.mover` |
| 6d | **computeDigestBonus** (before METABOLIZE) | `liveBonds`; cellType | `digestBonus` (per-cell bonded-DIGESTIVE-neighbour count) |
| 7 | **METABOLIZE** (extended) | + `digestBonus`, `digestClusterBonus` | DIGESTIVE/MOTILE gain ·= `1 + digestClusterBonus·digestBonus[i]` |
| 7b | **transferEnergy** (after METABOLIZE) | `liveBonds`; energy | energy (gradient diffusion toward the needier endpoint, ×efficiency) |
| 11c | **aggregateOrganisms** (after the 2nd cells.rebuildLive) | post-lifecycle live set; organismId; energy; posX/posY | `organisms.energy`/`cellCount`/`centroidX`/`centroidY` |

Coupling notes (add to the file):
- **Forces phase (§4.3 step 5):** repulsion (gather) → thrust → **bond springs (scatter)** → **adhesion (gather)**, all accumulating into the force buffer before integrate. Bond forces and repulsion both read PRE-integrate positions.
- **Bond breakage reads POST-integrate positions** (step 6c, after integrate moved the cells), so strain reflects the just-updated geometry. A break removes the bond from the pool + both endpoints' adjacency (O(degree)) and runs a `SplitChecker` dual-frontier BFS; if the organism disconnected, the smaller side is relabelled with a fresh `organismId`. A per-tick guard (`maxSplitChecksPerTick`) bounds the work; strained bonds beyond the cap persist (still over-strained → re-detected next tick). If any bond broke, the live-bond list is rebuilt before `computeDigestBonus`/`transferEnergy`.
- **Aggregates are recomputed each tick (not incremental).** The split RELABELS `organismId` (incremental, O(smaller side)); the per-tick O(live) `aggregateOrganisms` pass is the authority for `energy`/`cellCount`/`centroid`. The deterministic split unit test calls `aggregateOrganisms` after the break to read partitioned aggregates.
- **Sensor orientation lag (one tick):** `orientSensors` (step 2c) copies the MOVER's `heading` to SENSOR cells; the MOVER heading was set by the PREVIOUS tick's `driveMovers` (ACT runs after THINK). So a sensor projects the gradient using the organism orientation as of last tick — the same one-tick frame lag M4 documented for the kinematic sensor heading; imperceptible for chemotaxis.
- **Organism cells are lifecycle-exempt** (`isNeural(type) || organismId !== 0`): no bonded cell dies or divides in M5. Bond removal is strain-break only; no dangling bonds.

## File structure

**Create:**
- `src/core/organism/bonds.ts` — `BondNetwork`: bond SoA pool (`cellA/genA/cellB/genB/restLen/stiffness` + free-list + `bondAlive`), per-cell fixed-degree adjacency (`adj`, `degree`) + degree cap, `liveBonds` list, `addBond`/`removeBond`/`isAlive`/`rebuildLive`.
- `src/core/organism/bonds.test.ts`
- `src/core/organism/organisms.ts` — `OrganismTable` (`energy`/`cellCount`/`centroidX`/`centroidY`/`mover` per id + id free-list, `alloc`/`free`) and `aggregateOrganisms(...)` (per-tick O(live) recompute).
- `src/core/organism/organisms.test.ts`
- `src/core/organism/split.ts` — `SplitChecker`: dual-frontier BFS (pre-allocated queues + visit-stamp), `check(...)` relabels the smaller side with a fresh `organismId`.
- `src/core/organism/split.test.ts` — THE deterministic split-on-break test (chain → break middle → two organisms, partitioned energy/count) + cycle-no-split.
- `src/core/organism/breakage.ts` — `breakStrainedBonds(...)` (strain → remove + `SplitChecker.check`, per-tick guarded).
- `src/core/organism/breakage.test.ts`
- `src/core/organism/transfer.ts` — `transferEnergy(...)` (gradient diffusion along bonds).
- `src/core/organism/transfer.test.ts`
- `src/core/organism/digest-bonus.ts` — `computeDigestBonus(...)` (per-cell bonded-DIGESTIVE-neighbour count).
- `src/core/organism/digest-bonus.test.ts`
- `src/core/physics/bond-force.ts` — `computeBondForces(...)` (Hookean spring, scatter, toroidal).
- `src/core/physics/bond-force.test.ts`
- `src/core/physics/adhesion.ts` — `computeAdhesion(...)` (minimal short-range attraction, gather, default off).
- `src/core/physics/adhesion.test.ts`
- `src/core/neural/orient.ts` — `orientSensors(...)` (copy organism MOVER heading to SENSOR cells).
- `src/core/neural/orient.test.ts`
- `src/core/sim/golden-bond.test.ts` — golden tick: a bond spring relaxes to `restLen` through `World.tick`; a chain stretched in-world breaks and splits (§8 acceptance, through the tick).
- `src/render/bond-overlay.ts` — bond-network + energy-flow overlay (§11 M5).

**Modify:**
- `src/core/sim/config.ts` — M5 knobs (`maxBonds`, `maxOrganisms`, `bondDegreeCap`, `bondStiffness`, `bondMaxStrain`, `transferRate`, `transferEfficiency`, `adhesionStrength`, `adhesionRange`, `digestClusterBonus`, `maxSplitChecksPerTick`).
- `src/core/sim/config.test.ts` — new-knob defaults + round-trip.
- `src/core/cells/metabolism.ts` — DIGESTIVE/MOTILE gain ·= `1 + digestClusterBonus·digestBonus[i]`. (+ update call sites.)
- `src/core/cells/metabolism.test.ts` — clustering-bonus case; append the two new args to legacy calls.
- `src/core/cells/lifecycle.ts` — exempt `organismId !== 0` from death + division (generalise the neural exemption).
- `src/core/cells/lifecycle.test.ts` — bonded-cell exemption case.
- `src/core/sim/world.ts` — own `BondNetwork`/`OrganismTable`/`SplitChecker`/`digestBonus`; wire orient/bond-force/adhesion/break/digest/transfer/aggregate into `tick()`; **delete** the rigid table + `addPassenger` + `repositionPassengers` + `nextOrganismId`.
- `src/core/sim/critter.ts` — `spawnSwimmer` builds BONDS (spokes + bracing) + `organisms.alloc()` + `organisms.mover`, not the rigid table.
- `src/core/sim/critter.test.ts` — assert bonds + organism, not the rigid table.
- `src/core/sim/golden-think.test.ts` — the "passengers stay attached" case becomes "bonded cells stay within strain bounds".
- `src/core/sim/reproducibility.test.ts` — byte-identical bond positions + `organismId` + `organisms.energy`.
- `src/core/sim/zero-alloc.test.ts` — bonded organisms in the hot loop; assert bond/transfer/split paths run.
- `src/core/sim/READS-WRITES.md` — the table + notes above.
- `src/render/webgl-renderer.ts` — (no new cell types; verify the de-streak still looks right — Task 21 capture only).
- `src/app/main.ts` — bond overlay toggle (`O`); demo digestive cluster; follow-cam by organism centroid.
- `src/app/controls.ts` — M5 live knobs.
- `src/app/inspect.ts` — organism readout (id, cell count, total energy).
- `index.html` — (bond overlay draws on the existing WebGL/2D layers; no new element needed unless the overlay uses its own canvas — see Task 17).
- `src/headless/run.ts` — spawn a bonded cluster; report organism + bond counts; a digestion-clustering probe.
- `architecture.json` — **no edit** (it has no intra-`core` sub-module schema and nothing in `make check` reads it; the `core/organism` layering is a human-reviewed convention — see Task 1 Step 4).

**Delete:**
- `src/core/physics/rigid-group.ts` and `src/core/physics/rigid-group.test.ts` (the M4 kinematic stand-in M5 replaces).

---

## Task 1: M5 Config knobs + `core/organism` architecture entry

**Files:**
- Modify: `src/core/sim/config.ts`
- Test: `src/core/sim/config.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/core/sim/config.test.ts`:

```ts
describe('M5 config', () => {
  it('exposes bond/organism/transfer/adhesion knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.maxBonds).toBeGreaterThan(0);
    expect(c.maxOrganisms).toBeGreaterThan(0);
    expect(c.bondDegreeCap).toBeGreaterThanOrEqual(4);
    expect(c.bondStiffness).toBeGreaterThan(0);
    // Symplectic-Euler stability (audit blocker): the bond spring's effective k = bondStiffness·perBondStiffness
    // (the kernel's /d cancels the ddx=±d projection). The two-free-mass ceiling for dt=1/damping=0.5/mass=1
    // is ~3; a multi-spoke hub is tighter; k=8 diverges to ~1e162. Gate the default well under the ceiling so a
    // future re-tune to an unstable value fails HERE (Task 1) instead of as Inf/NaN 13 tasks later (Task 14).
    expect(c.bondStiffness * c.dt * c.dt).toBeLessThanOrEqual(2.5);
    expect(c.bondMaxStrain).toBeGreaterThan(0);
    expect(c.transferRate).toBeGreaterThan(0);
    expect(c.transferRate).toBeLessThanOrEqual(0.5); // stability bound
    expect(c.transferEfficiency).toBeGreaterThan(0);
    expect(c.transferEfficiency).toBeLessThanOrEqual(1);
    expect(c.adhesionStrength).toBe(0); // OFF by default — no perturbation to M2/M3
    expect(c.adhesionRange).toBeGreaterThan(0);
    expect(c.digestClusterBonus).toBeGreaterThanOrEqual(0);
    expect(c.maxSplitChecksPerTick).toBeGreaterThan(0);
  });

  it('round-trips the new fields through serialize/deserialize', () => {
    const c = defaultConfig({ maxBonds: 1234, transferRate: 0.077, digestClusterBonus: 0.33 });
    const back = JSON.parse(serializeConfig(c)) as typeof c;
    expect(back.maxBonds).toBe(1234);
    expect(back.transferRate).toBe(0.077);
    expect(back.digestClusterBonus).toBe(0.33);
  });
});
```

(If `serializeConfig` is not imported at the top of the existing file, add it to the import.)

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/sim/config.test.ts`

- [ ] **Step 3: Implement** — in `src/core/sim/config.ts`, add to `interface Config` (after the `thrustBias` field, before the closing `}`):

```ts
  // Bonds & organisms (§4.4, §4.8, §5.2). maxBonds/maxOrganisms/bondDegreeCap are
  // buffer-resize knobs (restart-required; overflow = refuse-new). The rest are live.
  /** Bond pool capacity. Not derivable from maxCells (§5.2); restart-required. */
  maxBonds: number;
  /** Organism-id capacity (id 0 = free/food). Restart-required. */
  maxOrganisms: number;
  /** Max bonds per cell — sizes the per-cell adjacency. Restart-required. */
  bondDegreeCap: number;
  /** Global bond-spring stiffness scale (× each bond's relative stiffness). */
  bondStiffness: number;
  /** A bond breaks when (dist − restLen)/restLen exceeds this. */
  bondMaxStrain: number;
  /** Per-tick fraction of a bond's energy gap moved to the needier endpoint, (0, 0.5]. */
  transferRate: number;
  /** Fraction of transferred energy that arrives (<1; the rest is lost in transit). */
  transferEfficiency: number;
  /** Short-range adhesion strength (0 = OFF; minimal in M5, genome-gated formation is M6). */
  adhesionStrength: number;
  /** Adhesion range in world units (must be ≤ ~2·hash cellSize for the 3×3 query). */
  adhesionRange: number;
  /** Digestion gain multiplier per bonded DIGESTIVE neighbour (the multicellular payoff). */
  digestClusterBonus: number;
  /** Max split-checks per tick (guards a mass-break tick; excess strained bonds defer). */
  maxSplitChecksPerTick: number;
```

Add to the `defaultConfig` return object (after the `thrustBias: 2,` line, before `...overrides`):

```ts
    maxBonds: 4096, // ample for hand-built M5 organisms; grows in M6 (developmental genome)
    maxOrganisms: 4096,
    bondDegreeCap: 8, // the braced critter peaks at 6 bonds/cell; headroom for clusters
    bondStiffness: 1.5, // SYMPLECTIC-EULER STABILITY (audit blocker): the bond force's effective spring constant is k_eff = bondStiffness·perBondStiffness (the /d in the kernel cancels the ddx=±d projection — see bond-force.ts). The two-free-mass ceiling for dt=1/damping=0.5/mass=1 is ~3, and a multi-spoke hub like the MOVER is TIGHTER, so keep ≤2.5. k=8 diverges to ~1e162 in a few ticks. Cohesion comes from bracing geometry + low strain tolerance, NOT large k. Live knob (tune via golden-bond / critter-swim within the ceiling).
    bondMaxStrain: 0.6, // break at 60% stretch — survives steering, snaps under a hard pull
    transferRate: 0.1, // gentle diffusion; well under the 0.5 oscillation bound
    transferEfficiency: 0.95, // 5% lost per hop — a small cost to sharing
    adhesionStrength: 0, // OFF by default: the verified M2/M3 ecosystem must be unperturbed
    adhesionRange: 18, // 3·cellRadius — inside the spatial-hash 3×3 neighbourhood
    digestClusterBonus: 0.5, // a fully-bonded digestive cluster out-harvests lone cells (payoff); 0 for free (organismId 0) cells
    maxSplitChecksPerTick: 64,
```

- [ ] **Step 4: `architecture.json` — read it, do NOT invent a sub-module entry** (audit fix). `architecture.json` has ONLY five top-level layer entries (`core`, `render`, `app`, `headless`, `workers`); there is **no `core/neural` entry to mirror**, no intra-`core` sub-module schema, and **nothing in `make check` reads this file** (its own `notes` say ESLint is the CI-enforced layer; it "documents intent"). `eslint.config.js` enforces only `core ↛ render/app/workers` + the DOM/Worker-globals ban — it does **NOT** enforce the intra-`core` §5.1 DAG. M4 added `core/neural/` with **zero** architecture.json change; follow that precedent: **make no architecture.json edit.** The intra-`core` layering for `core/organism` (`bond-force.ts`/`adhesion.ts` under `core/physics`; `organism` imports only `math`/`memory`/`spatial`/`cells`; `neural ↛ organism`) is a **human-reviewed convention kept clean by hand**, NOT a lint gate — keep the imports correct yourself. (If you want a real gate, that's a separate task adding `files`-scoped `no-restricted-imports` rules to `eslint.config.js` — out of scope for M5.) The only thing `pnpm lint` will catch is an accidental `core → render/app/workers` import.

- [ ] **Step 5: Run it — expect PASS.** Run: `pnpm vitest run src/core/sim/config.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/core/sim/config.ts src/core/sim/config.test.ts
git commit --no-verify -m "feat(M5): config knobs — bonds, organisms, transfer, adhesion, digest clustering"
```

---

## Task 2: `BondNetwork` — bond SoA pool + per-cell adjacency + degree cap

**Files:**
- Create: `src/core/organism/bonds.ts`
- Test: `src/core/organism/bonds.test.ts`

Mirrors `NeuralNetwork`: a flat SoA pool with a free-list and gen-validated endpoints in SEPARATE arrays (§4.2). The per-cell adjacency is fixed-max-degree (`adj[i·cap + k] = bond slot`, `degree[i]` valid entries), maintained incrementally; `removeBond` swap-removes from each endpoint (O(degree)). `liveBonds` is rebuilt on structural events (ascending), never mutated by the force/transfer kernels.

- [ ] **Step 1: Write the failing test** — `src/core/organism/bonds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BondNetwork } from './bonds';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

describe('BondNetwork', () => {
  it('pre-allocates the pool + adjacency, zero-init', () => {
    const b = new BondNetwork(8, 16, 4);
    expect(b.cellA.length).toBe(16);
    expect(b.stiffness.length).toBe(16);
    expect(b.adj.length).toBe(8 * 4);
    expect(b.degree.length).toBe(8);
    expect(b.degree[0]).toBe(0);
    expect(b.liveBondCount).toBe(0);
  });

  it('addBond stores endpoints + generation in separate arrays (not bit-packed) and links adjacency', () => {
    const b = new BondNetwork(8, 16, 4);
    const s = b.addBond(2, 5, 3, 9, 12, 1);
    expect(s).toBe(0);
    expect(b.cellA[s]).toBe(2);
    expect(b.genA[s]).toBe(5);
    expect(b.cellB[s]).toBe(3);
    expect(b.genB[s]).toBe(9);
    expect(b.restLen[s]).toBeCloseTo(12, 5);
    expect(b.stiffness[s]).toBeCloseTo(1, 6);
    expect(b.degree[2]).toBe(1);
    expect(b.degree[3]).toBe(1);
    expect(b.adj[2 * 4 + 0]).toBe(s);
    expect(b.adj[3 * 4 + 0]).toBe(s);
    expect(b.isAlive(s)).toBe(true);
  });

  it('refuses (returns -1) at the degree cap and at pool capacity', () => {
    const b = new BondNetwork(8, 16, 2); // degree cap 2
    expect(b.addBond(0, 0, 1, 0, 1, 1)).toBe(0);
    expect(b.addBond(0, 0, 2, 0, 1, 1)).toBe(1); // cell 0 now at degree 2
    expect(b.addBond(0, 0, 3, 0, 1, 1)).toBe(-1); // cell 0 over the degree cap → refuse
    const small = new BondNetwork(8, 2, 8); // pool cap 2
    expect(small.addBond(0, 0, 1, 0, 1, 1)).toBe(0);
    expect(small.addBond(2, 0, 3, 0, 1, 1)).toBe(1);
    expect(small.addBond(4, 0, 5, 0, 1, 1)).toBe(-1); // pool full → refuse
  });

  it('removeBond swap-removes from both endpoints (O(degree)) and frees the slot', () => {
    const b = new BondNetwork(8, 16, 4);
    const s0 = b.addBond(1, 0, 2, 0, 1, 1);
    const s1 = b.addBond(1, 0, 3, 0, 1, 1);
    const s2 = b.addBond(1, 0, 4, 0, 1, 1);
    expect(b.degree[1]).toBe(3);
    b.removeBond(s1); // remove the middle bond of cell 1
    expect(b.isAlive(s1)).toBe(false);
    expect(b.degree[1]).toBe(2); // 1's adjacency shrank
    expect(b.degree[3]).toBe(0); // 3's only bond gone
    // s1's slot is recycled by the next addBond (free-list).
    const s3 = b.addBond(5, 0, 6, 0, 1, 1);
    expect(s3).toBe(s1);
    // cell 1 still bonds 2 and 4 (order may swap — assert as a set).
    const off = 1 * 4;
    const neighbours = [b.adj[off]!, b.adj[off + 1]!].map((bs) => (b.cellA[bs] === 1 ? b.cellB[bs] : b.cellA[bs]));
    expect(new Set(neighbours)).toEqual(new Set([2, 4]));
    expect(s0).toBe(0);
    expect(s2).toBe(2);
  });

  it('rebuildLive collects alive + gen-valid bonds (ascending) and prunes dangling endpoints', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const a = store.alloc();
    const c = store.alloc();
    const d = store.alloc();
    f.cellType[a] = CellType.PHOTO;
    f.cellType[c] = CellType.PHOTO;
    f.cellType[d] = CellType.PHOTO;

    const b = new BondNetwork(8, 16, 4);
    const sGood = b.addBond(a, f.generation[a]!, c, f.generation[c]!, 1, 1);
    const sBad = b.addBond(c, f.generation[c]!, d, f.generation[d]!, 1, 1);
    store.free(d); // bumps generation[d] → sBad now dangles

    b.rebuildLive(store);
    expect(b.liveBondCount).toBe(1);
    expect(b.liveBonds[0]).toBe(sGood);
    expect(sBad).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (no module). Run: `pnpm vitest run src/core/organism/bonds.test.ts`

- [ ] **Step 3: Implement** `src/core/organism/bonds.ts`:

```ts
import { type CellStore } from '../memory/cell-store';

/**
 * The bond network (§4.4, §4.8, §5.2). A flat SoA pool with a free-list and
 * gen-validated endpoints (slot index + generation in SEPARATE parallel arrays —
 * never bit-packed, §4.2), plus a per-cell fixed-max-degree adjacency so step-5
 * FORCES and step-8 split-checks are O(degree) and cell-local. `liveBonds` is a
 * compact ascending list rebuilt on structural events (`rebuildLive`); the force /
 * transfer / digest kernels iterate it and never mutate the pool.
 *
 * One global pool across all organisms in single-thread (mirrors `NeuralNetwork`);
 * M8 partitions by organism graph.
 */
export class BondNetwork {
  readonly maxCells: number;
  readonly maxBonds: number;
  readonly degreeCap: number;

  // Bond SoA pool.
  readonly cellA: Uint32Array;
  readonly genA: Uint32Array;
  readonly cellB: Uint32Array;
  readonly genB: Uint32Array;
  readonly restLen: Float32Array;
  /** Relative stiffness (1 = nominal); the force kernel scales by cfg.bondStiffness. */
  readonly stiffness: Float32Array;
  private readonly bondAlive: Uint8Array;
  private readonly bondFree: Int32Array;
  private bondFreeTop: number;

  // Per-cell adjacency: adj[i·cap + k] is the k-th bond slot of cell i, k < degree[i].
  readonly adj: Int32Array;
  readonly degree: Uint8Array;

  // Compact live-bond list, rebuilt on structural events (ascending slot order).
  readonly liveBonds: Uint32Array;
  liveBondCount: number;

  constructor(maxCells: number, maxBonds: number, degreeCap: number) {
    this.maxCells = maxCells;
    this.maxBonds = maxBonds;
    this.degreeCap = degreeCap;

    this.cellA = new Uint32Array(maxBonds);
    this.genA = new Uint32Array(maxBonds);
    this.cellB = new Uint32Array(maxBonds);
    this.genB = new Uint32Array(maxBonds);
    this.restLen = new Float32Array(maxBonds);
    this.stiffness = new Float32Array(maxBonds);
    this.bondAlive = new Uint8Array(maxBonds);
    this.bondFree = new Int32Array(maxBonds);
    for (let i = 0; i < maxBonds; i++) this.bondFree[i] = maxBonds - 1 - i;
    this.bondFreeTop = maxBonds;

    this.adj = new Int32Array(maxCells * degreeCap);
    this.degree = new Uint8Array(maxCells);

    this.liveBonds = new Uint32Array(maxBonds);
    this.liveBondCount = 0;
  }

  isAlive(s: number): boolean {
    return this.bondAlive[s] === 1;
  }

  /** Allocate a bond; -1 if the pool is full OR either endpoint is at the degree cap. */
  addBond(a: number, genA: number, b: number, genB: number, restLen: number, stiffness: number): number {
    const cap = this.degreeCap;
    if (this.degree[a]! >= cap || this.degree[b]! >= cap) return -1; // degree overflow
    if (this.bondFreeTop === 0) return -1; // pool overflow (refuse-new)
    const s = this.bondFree[--this.bondFreeTop]!;
    this.cellA[s] = a;
    this.genA[s] = genA;
    this.cellB[s] = b;
    this.genB[s] = genB;
    this.restLen[s] = restLen;
    this.stiffness[s] = stiffness;
    this.bondAlive[s] = 1;
    this.adj[a * cap + this.degree[a]!] = s;
    this.degree[a] = (this.degree[a]! + 1) & 0xff;
    this.adj[b * cap + this.degree[b]!] = s;
    this.degree[b] = (this.degree[b]! + 1) & 0xff;
    return s;
  }

  /** Remove a bond, detaching it from both endpoints' adjacency (swap-remove). O(degree). */
  removeBond(s: number): void {
    if (this.bondAlive[s] === 0) return;
    this.bondAlive[s] = 0;
    this.detach(this.cellA[s]!, s);
    this.detach(this.cellB[s]!, s);
    this.bondFree[this.bondFreeTop++] = s;
  }

  private detach(c: number, s: number): void {
    const cap = this.degreeCap;
    const off = c * cap;
    const d = this.degree[c]!;
    for (let k = 0; k < d; k++) {
      if (this.adj[off + k]! === s) {
        this.adj[off + k] = this.adj[off + d - 1]!; // swap with the last entry
        this.degree[c] = (d - 1) & 0xff;
        return;
      }
    }
  }

  /**
   * Rebuild the live-bond list (ascending slot order). A bond with a dangling
   * endpoint (dead/recycled cell — generation mismatch) is pruned. Called on
   * structural events (build, after a break) and once per tick, never inside the
   * force loop.
   */
  rebuildLive(store: CellStore): void {
    let nb = 0;
    for (let s = 0; s < this.maxBonds; s++) {
      if (this.bondAlive[s] === 0) continue;
      if (!store.validate(this.cellA[s]!, this.genA[s]!)) continue;
      if (!store.validate(this.cellB[s]!, this.genB[s]!)) continue;
      this.liveBonds[nb++] = s;
    }
    this.liveBondCount = nb;
  }
}
```

- [ ] **Step 4: Run it — expect PASS.** Run: `pnpm vitest run src/core/organism/bonds.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/organism/bonds.ts src/core/organism/bonds.test.ts
git commit --no-verify -m "feat(M5): BondNetwork — SoA pool + per-cell adjacency + degree cap"
```

---

## Task 3: `computeBondForces` — Hookean bond springs (physics, scatter)

**Files:**
- Create: `src/core/physics/bond-force.ts`
- Test: `src/core/physics/bond-force.test.ts`

Physics-layer, raw arrays only. For each live bond: `F = -stiffnessScale · stiffness[s] · (dist − restLen) / dist` along the toroidal separation, applied equal-and-opposite to both endpoints (scatter — the bond edge list is explicit, so Newton's 3rd law is preserved and cheap). Accumulates into the force buffer like `computeRepulsion`.

- [ ] **Step 1: Write the failing test** — `src/core/physics/bond-force.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeBondForces } from './bond-force';

function run(posX: number[], posY: number[], restLen: number, scale = 1): { fx: number[]; fy: number[] } {
  const liveBonds = Uint32Array.from([0]);
  const cellA = Uint32Array.from([0]);
  const cellB = Uint32Array.from([1]);
  const rl = Float32Array.from([restLen]);
  const stiff = Float32Array.from([1]);
  const px = Float64Array.from(posX);
  const py = Float64Array.from(posY);
  const fx = new Float32Array(2);
  const fy = new Float32Array(2);
  computeBondForces(liveBonds, 1, cellA, cellB, rl, stiff, px, py, fx, fy, scale, 1024, 1024);
  return { fx: Array.from(fx), fy: Array.from(fy) };
}

describe('computeBondForces — Hookean spring (scatter, toroidal)', () => {
  it('zero force at rest length', () => {
    const { fx, fy } = run([100, 110], [200, 200], 10);
    expect(fx[0]).toBeCloseTo(0, 5);
    expect(fx[1]).toBeCloseTo(0, 5);
    expect(fy[0]).toBeCloseTo(0, 5);
  });

  it('a stretched bond pulls the endpoints together (equal and opposite)', () => {
    // a at 100, b at 120 → dist 20, restLen 10 → stretched by 10. f = -1·(20-10)/20 = -0.5.
    // ddx = a-b = -20 → fx[a] = ddx·f = (-20)(-0.5) = +10 → a pulled toward b (+x). fx[b] = -10.
    const { fx, fy } = run([100, 120], [200, 200], 10);
    expect(fx[0]).toBeCloseTo(10, 4); // a pulled +x toward b
    expect(fx[1]).toBeCloseTo(-10, 4); // b pulled -x toward a (Newton's 3rd)
    expect(fy[0]).toBeCloseTo(0, 5);
  });

  it('a compressed bond pushes the endpoints apart', () => {
    // a at 100, b at 105 → dist 5, restLen 10 → compressed. f = -1·(5-10)/5 = +1.
    // ddx = a-b = -5 → fx[a] = (-5)(1) = -5 → a pushed -x away from b.
    const { fx } = run([100, 105], [200, 200], 10);
    expect(fx[0]).toBeCloseTo(-5, 4);
    expect(fx[1]).toBeCloseTo(5, 4);
  });

  it('stiffnessScale multiplies the force', () => {
    const a = run([100, 120], [200, 200], 10, 1);
    const b = run([100, 120], [200, 200], 10, 3);
    expect(b.fx[0]).toBeCloseTo(a.fx[0]! * 3, 4);
  });

  it('uses the shortest toroidal separation (wraps across the seam)', () => {
    // a at 5, b at 1019 on a 1024 torus → shortest delta = 5 - 1019 wrapped = +10 (a is 10 right of b across the seam).
    const { fx } = run([5, 1019], [200, 200], 10); // dist 10 == restLen → ~0 force
    expect(fx[0]).toBeCloseTo(0, 4);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/physics/bond-force.test.ts`

- [ ] **Step 3: Implement** `src/core/physics/bond-force.ts`:

```ts
import { wrapDelta } from '../math/vec2';

/**
 * Bond-spring forces (§4.4): `F = -stiffnessScale · stiffness[s] · (dist − restLen)/dist`
 * along the shortest toroidal separation, applied equal-and-opposite to both endpoints
 * (SCATTER — the bond edge list is explicit, so we keep Newton's 3rd law; the gather
 * form is reserved for the neighbour-repulsion broad phase). Accumulates into the force
 * buffer (like computeRepulsion); reset by integrate. Allocation-free. Runs in the FORCES
 * phase (§4.3 step 5), after repulsion + thrust, before integrate.
 *
 * STABILITY: because `fx = ddx·f` and `|ddx| = dist`, the `/dist` cancels and the
 * EFFECTIVE Hookean constant is `k_eff = stiffnessScale · stiffness[s]` (independent of
 * restLen). Under the semi-implicit Euler integrator (dt=1, damping=0.5, mass=1) the
 * two-free-mass stability ceiling is `k_eff ≈ 3`; a multi-spoke hub (the MOVER) is
 * tighter. Keep `cfg.bondStiffness ≤ ~2.5` (config.test gates this) or bonded bodies
 * diverge to Inf/NaN. Do NOT raise stiffness for rigidity — that comes from bracing
 * geometry + a low `bondMaxStrain`.
 */
export function computeBondForces(
  liveBonds: Uint32Array,
  count: number,
  cellA: Uint32Array,
  cellB: Uint32Array,
  restLen: Float32Array,
  stiffness: Float32Array,
  posX: Float64Array,
  posY: Float64Array,
  forceX: Float32Array,
  forceY: Float32Array,
  stiffnessScale: number,
  width: number,
  height: number,
): void {
  for (let k = 0; k < count; k++) {
    const s = liveBonds[k]!;
    const a = cellA[s]!;
    const b = cellB[s]!;
    const ddx = wrapDelta(posX[a]! - posX[b]!, width);
    const ddy = wrapDelta(posY[a]! - posY[b]!, height);
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 < 1e-18) continue; // coincident — no defined direction
    const d = Math.sqrt(d2);
    const f = (-stiffnessScale * stiffness[s]! * (d - restLen[s]!)) / d;
    const fx = ddx * f;
    const fy = ddy * f;
    forceX[a] = forceX[a]! + fx;
    forceY[a] = forceY[a]! + fy;
    forceX[b] = forceX[b]! - fx;
    forceY[b] = forceY[b]! - fy;
  }
}
```

- [ ] **Step 4: Run it + lint — expect PASS.** Run: `pnpm vitest run src/core/physics/bond-force.test.ts && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/core/physics/bond-force.ts src/core/physics/bond-force.test.ts
git commit --no-verify -m "feat(M5): computeBondForces — Hookean bond springs (scatter, toroidal)"
```

---

## Task 4: `computeAdhesion` — minimal short-range attraction (physics, gather, default off)

**Files:**
- Create: `src/core/physics/adhesion.ts`
- Test: `src/core/physics/adhesion.test.ts`

Short-range type-compatible attraction (§4.4), gather form (like repulsion). "Compatible" in M5 = same `cellType` AND not already the same organism. Acts only in the band `(contact, range]`. **Returns immediately when `strength <= 0`** (the default), so the verified M2/M3 ecosystem is unperturbed. Genome-gated bond FORMATION on adhesive contact is M6 — adhesion here is only a force.

- [ ] **Step 1: Write the failing test** — `src/core/physics/adhesion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../spatial/spatial-hash';
import { computeAdhesion } from './adhesion';
import { CellType } from '../cells/types';

function hashOf(posX: Float64Array, posY: Float64Array, n: number): SpatialHash {
  const h = new SpatialHash(300, 300, 20, 16); // 15×15 buckets, cellSize 20
  h.build(Uint32Array.from(Array.from({ length: n }, (_, i) => i)), n, posX, posY);
  return h;
}

describe('computeAdhesion — minimal short-range attraction (gather)', () => {
  it('is a no-op when strength is 0 (default — ecosystem unperturbed)', () => {
    const px = Float64Array.from([100, 118]);
    const py = Float64Array.from([100, 100]);
    const fx = new Float32Array(2);
    const fy = new Float32Array(2);
    const ct = Uint8Array.from([CellType.PHOTO, CellType.PHOTO]);
    const org = new Uint32Array(2);
    const rad = Float32Array.from([6, 6]);
    computeAdhesion(hashOf(px, py, 2), px, py, rad, ct, org, fx, fy, 0, 18, 300, 300);
    expect(fx[0]).toBe(0);
    expect(fx[1]).toBe(0);
  });

  it('attracts two same-type cells in the (contact, range] band', () => {
    // contact = 6+6 = 12; cells 14 apart → inside (12, 18]. Attraction pulls them together.
    const px = Float64Array.from([100, 114]);
    const py = Float64Array.from([100, 100]);
    const fx = new Float32Array(2);
    const fy = new Float32Array(2);
    const ct = Uint8Array.from([CellType.PHOTO, CellType.PHOTO]);
    const org = new Uint32Array(2);
    const rad = Float32Array.from([6, 6]);
    computeAdhesion(hashOf(px, py, 2), px, py, rad, ct, org, fx, fy, 5, 18, 300, 300);
    expect(fx[0]).toBeGreaterThan(0); // cell 0 pulled +x toward cell 1
    expect(fx[1]).toBeLessThan(0); // cell 1 pulled -x toward cell 0
  });

  it('does not attract different types, overlapping pairs, or out-of-range pairs', () => {
    const px = Float64Array.from([100, 114, 100, 100]);
    const py = Float64Array.from([100, 100, 105 /*overlap*/, 140 /*far*/]);
    const fx = new Float32Array(4);
    const fy = new Float32Array(4);
    const ct = Uint8Array.from([CellType.PHOTO, CellType.DIGESTIVE, CellType.PHOTO, CellType.PHOTO]);
    const org = new Uint32Array(4);
    const rad = Float32Array.from([6, 6, 6, 6]);
    computeAdhesion(hashOf(px, py, 4), px, py, rad, ct, org, fx, fy, 5, 18, 300, 300);
    // 0↔1 different type (no), 0↔2 overlapping <contact (no), 0↔3 dist 40 > range (no).
    expect(fx[0]).toBe(0);
    expect(fy[0]).toBe(0);
  });

  it('skips pairs already in the same organism (bonds handle their cohesion)', () => {
    const px = Float64Array.from([100, 114]);
    const py = Float64Array.from([100, 100]);
    const fx = new Float32Array(2);
    const fy = new Float32Array(2);
    const ct = Uint8Array.from([CellType.PHOTO, CellType.PHOTO]);
    const org = Uint32Array.from([7, 7]); // same organism
    const rad = Float32Array.from([6, 6]);
    computeAdhesion(hashOf(px, py, 2), px, py, rad, ct, org, fx, fy, 5, 18, 300, 300);
    expect(fx[0]).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/physics/adhesion.test.ts`

- [ ] **Step 3: Implement** `src/core/physics/adhesion.ts`:

```ts
import { type SpatialHash } from '../spatial/spatial-hash';
import { wrapDelta } from '../math/vec2';

/**
 * Minimal short-range adhesion (§4.4) — gather form, mirrors computeRepulsion. Each
 * cell sums an attractive pull toward same-type cells of a DIFFERENT organism within
 * the band (ri+rj, range]. A no-op when `strength <= 0` (the default), so the verified
 * M2/M3 ecosystem is unperturbed. M5 has no bond FORMATION; this only nudges compatible
 * cells together (genome-gated formation-on-contact is M6). `range` must be ≤ ~2·hash
 * cellSize so the toroidal 3×3 query can see the partner. Allocation-free.
 */
export function computeAdhesion(
  hash: SpatialHash,
  posX: Float64Array,
  posY: Float64Array,
  radius: Float32Array,
  cellType: Uint8Array,
  organismId: Uint32Array,
  forceX: Float32Array,
  forceY: Float32Array,
  strength: number,
  range: number,
  width: number,
  height: number,
): void {
  if (strength <= 0) return;
  const { cols, rows, sorted, bucketStart } = hash;
  const liveCount = hash.liveCount;
  const range2 = range * range;

  for (let k = 0; k < liveCount; k++) {
    const i = sorted[k]!;
    const ti = cellType[i]!;
    const oi = organismId[i]!;
    const xi = posX[i]!;
    const yi = posY[i]!;
    const ri = radius[i]!;
    const cx = hash.colOf(xi);
    const cy = hash.rowOf(yi);
    let fx = forceX[i]!;
    let fy = forceY[i]!;

    for (let dy = -1; dy <= 1; dy++) {
      const by = (cy + dy + rows) % rows;
      for (let dx = -1; dx <= 1; dx++) {
        const bx = (cx + dx + cols) % cols;
        const b = by * cols + bx;
        const end = bucketStart[b + 1]!;
        for (let idx = bucketStart[b]!; idx < end; idx++) {
          const j = sorted[idx]!;
          if (j === i) continue;
          if (cellType[j]! !== ti) continue; // minimal compatibility = same type
          const oj = organismId[j]!;
          if (oi !== 0 && oi === oj) continue; // already one organism → bonds cohere them
          const ddx = wrapDelta(xi - posX[j]!, width);
          const ddy = wrapDelta(yi - posY[j]!, height);
          const d2 = ddx * ddx + ddy * ddy;
          const rsum = ri + radius[j]!;
          if (d2 > rsum * rsum && d2 < range2) {
            const d = Math.sqrt(d2);
            const f = -strength / d; // attractive: pull i toward j
            fx += ddx * f;
            fy += ddy * f;
          }
        }
      }
    }

    forceX[i] = fx;
    forceY[i] = fy;
  }
}
```

- [ ] **Step 4: Run it + lint — expect PASS.** Run: `pnpm vitest run src/core/physics/adhesion.test.ts && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/core/physics/adhesion.ts src/core/physics/adhesion.test.ts
git commit --no-verify -m "feat(M5): computeAdhesion — minimal short-range attraction (gather, default off)"
```

---

## Task 5: `transferEnergy` — gradient diffusion along bonds

**Files:**
- Create: `src/core/organism/transfer.ts`
- Test: `src/core/organism/transfer.test.ts`

Per live bond, energy flows from the higher-energy endpoint to the lower at `transferRate × gap`, arriving scaled by `transferEfficiency (<1)`. Deterministic in ascending live-bond order; allocation-free. Runs right after METABOLIZE so it redistributes the tick's gains toward needier siblings (§4.5, load-bearing).

- [ ] **Step 1: Write the failing test** — `src/core/organism/transfer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { transferEnergy } from './transfer';

describe('transferEnergy — gradient diffusion along bonds', () => {
  it('moves energy from the richer to the needier endpoint, scaled by efficiency', () => {
    const energy = Float32Array.from([100, 0]);
    const liveBonds = Uint32Array.from([0]);
    const cellA = Uint32Array.from([0]);
    const cellB = Uint32Array.from([1]);
    transferEnergy(liveBonds, 1, cellA, cellB, energy, 0.25, 0.9);
    // gap 100, rate 0.25 → move 25 from a; b receives 25·0.9 = 22.5.
    expect(energy[0]).toBeCloseTo(75, 4);
    expect(energy[1]).toBeCloseTo(22.5, 4);
  });

  it('is symmetric in direction (needier endpoint can be either side)', () => {
    const energy = Float32Array.from([0, 80]);
    transferEnergy(Uint32Array.from([0]), 1, Uint32Array.from([0]), Uint32Array.from([1]), energy, 0.5, 1.0);
    // b richer by 80, rate 0.5 → move 40 from b; a receives 40.
    expect(energy[1]).toBeCloseTo(40, 4);
    expect(energy[0]).toBeCloseTo(40, 4);
  });

  it('does nothing for equal-energy endpoints', () => {
    const energy = Float32Array.from([50, 50]);
    transferEnergy(Uint32Array.from([0]), 1, Uint32Array.from([0]), Uint32Array.from([1]), energy, 0.25, 0.9);
    expect(energy[0]).toBe(50);
    expect(energy[1]).toBe(50);
  });

  it('processes bonds in ascending order (deterministic chained transfer)', () => {
    // chain 0-1-2: bonds (0,1) then (1,2). energy [90, 0, 0], rate 0.5, eff 1.
    const energy = Float32Array.from([90, 0, 0]);
    const liveBonds = Uint32Array.from([0, 1]);
    const cellA = Uint32Array.from([0, 1]);
    const cellB = Uint32Array.from([1, 2]);
    transferEnergy(liveBonds, 2, cellA, cellB, energy, 0.5, 1.0);
    // bond0: 0↔1 gap 90 → move 45: [45,45,0]. bond1: 1↔2 gap 45 → move 22.5: [45,22.5,22.5].
    const oracle1 = Math.fround(45);
    expect(energy[0]).toBeCloseTo(oracle1, 4);
    expect(energy[1]).toBeCloseTo(22.5, 4);
    expect(energy[2]).toBeCloseTo(22.5, 4);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/organism/transfer.test.ts`

- [ ] **Step 3: Implement** `src/core/organism/transfer.ts`:

```ts
/**
 * Intra-organism energy transfer (§4.5, load-bearing). For each live bond, energy
 * diffuses from the higher-energy endpoint to the lower at `rate · gap`, arriving
 * scaled by `efficiency` (<1; the rest is lost in transit). Without this only
 * autotrophs are viable — it lets photo cells feed structural/neuron/mover siblings.
 * Deterministic (ascending live-bond order); allocation-free. `rate` should be in
 * (0, 0.5] to avoid overshoot/oscillation. Runs at METABOLIZE (§4.3 step 7), just
 * after the per-cell gains/costs so it redistributes the tick's harvest.
 */
export function transferEnergy(
  liveBonds: Uint32Array,
  count: number,
  cellA: Uint32Array,
  cellB: Uint32Array,
  energy: Float32Array,
  rate: number,
  efficiency: number,
): void {
  for (let k = 0; k < count; k++) {
    const s = liveBonds[k]!;
    const a = cellA[s]!;
    const b = cellB[s]!;
    const ea = energy[a]!;
    const eb = energy[b]!;
    if (ea > eb) {
      const m = rate * (ea - eb);
      energy[a] = ea - m;
      energy[b] = eb + m * efficiency;
    } else if (eb > ea) {
      const m = rate * (eb - ea);
      energy[b] = eb - m;
      energy[a] = ea + m * efficiency;
    }
  }
}
```

- [ ] **Step 4: Run it + lint — expect PASS.** Run: `pnpm vitest run src/core/organism/transfer.test.ts && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/core/organism/transfer.ts src/core/organism/transfer.test.ts
git commit --no-verify -m "feat(M5): transferEnergy — gradient diffusion along bonds"
```

---

## Task 6: `OrganismTable` + `aggregateOrganisms` — per-organism aggregates

**Files:**
- Create: `src/core/organism/organisms.ts`
- Test: `src/core/organism/organisms.test.ts`

`OrganismTable` allocates organism ids from a free-list (id 0 reserved = free/food; first `alloc()` returns 1, matching the M4 critter's id) and holds per-id `energy`/`cellCount`/`centroidX`/`centroidY`/`mover`. `aggregateOrganisms` recomputes them each tick in one O(live) pass (exact, allocation-free; the §4.8 incremental partition is an M7/M8 perf optimisation — see the scope boundary). Centroid is a plain mean (toroidal-seam-correct centroid deferred; hand-built organisms are small + placed away from the seam).

- [ ] **Step 1: Write the failing test** — `src/core/organism/organisms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { OrganismTable, aggregateOrganisms } from './organisms';

describe('OrganismTable', () => {
  it('allocates ascending ids from 1 (0 reserved), recycles on free', () => {
    const t = new OrganismTable(8);
    expect(t.alloc()).toBe(1);
    expect(t.alloc()).toBe(2);
    const c = t.alloc();
    expect(c).toBe(3);
    t.free(c);
    expect(t.alloc()).toBe(3); // recycled
    expect(t.mover[1]).toBe(-1); // mover defaults to -1
  });

  it('returns -1 when the id pool is exhausted (refuse-new)', () => {
    const t = new OrganismTable(3); // ids 1, 2 only
    expect(t.alloc()).toBe(1);
    expect(t.alloc()).toBe(2);
    expect(t.alloc()).toBe(-1);
  });
});

describe('aggregateOrganisms — per-tick recompute', () => {
  it('sums energy/count and means the centroid per organism, skipping free cells (org 0)', () => {
    const t = new OrganismTable(8);
    const o1 = t.alloc(); // 1
    const o2 = t.alloc(); // 2
    // 5 cells: three in o1, one in o2, one free (org 0 — must be ignored).
    const organismId = Uint32Array.from([o1, o1, o1, o2, 0]);
    const energy = Float32Array.from([10, 20, 30, 100, 999]);
    const posX = Float64Array.from([0, 10, 20, 500, 0]);
    const posY = Float64Array.from([0, 0, 0, 500, 0]);
    const live = Uint32Array.from([0, 1, 2, 3, 4]);
    aggregateOrganisms(live, 5, organismId, energy, posX, posY, t);
    expect(t.energy[o1]).toBeCloseTo(60, 4);
    expect(t.cellCount[o1]).toBe(3);
    expect(t.centroidX[o1]).toBeCloseTo(10, 4); // mean of 0,10,20
    expect(t.energy[o2]).toBeCloseTo(100, 4);
    expect(t.cellCount[o2]).toBe(1);
    expect(t.centroidX[o2]).toBeCloseTo(500, 4);
  });

  it('zeroes organisms with no live cells (recompute, not accumulate)', () => {
    const t = new OrganismTable(8);
    const o1 = t.alloc();
    aggregateOrganisms(Uint32Array.from([0]), 1, Uint32Array.from([o1]), Float32Array.from([42]), Float64Array.from([0]), Float64Array.from([0]), t);
    expect(t.energy[o1]).toBeCloseTo(42, 4);
    // next tick: that cell is gone (no live cells in o1) → aggregate must reset to 0.
    aggregateOrganisms(new Uint32Array(0), 0, new Uint32Array(0), new Float32Array(0), new Float64Array(0), new Float64Array(0), t);
    expect(t.energy[o1]).toBe(0);
    expect(t.cellCount[o1]).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/organism/organisms.test.ts`

- [ ] **Step 3: Implement** `src/core/organism/organisms.ts`:

```ts
/**
 * Per-organism aggregates (§4.8). Ids are allocated from a free-list; id 0 is
 * reserved for free/food cells (`organismId === 0`). The first `alloc()` returns 1,
 * so a freshly-constructed World's first critter gets organism id 1 (determinism;
 * matches the M4 critter). `mover` records each organism's MOVER slot for sensor
 * orientation (−1 = none).
 */
export class OrganismTable {
  readonly maxOrganisms: number;
  readonly energy: Float32Array;
  readonly cellCount: Uint32Array;
  readonly centroidX: Float32Array;
  readonly centroidY: Float32Array;
  /** The organism's MOVER cell slot for orientation (−1 = none). */
  readonly mover: Int32Array;

  private readonly orgAlive: Uint8Array;
  private readonly orgFree: Int32Array;
  private orgFreeTop: number;

  constructor(maxOrganisms: number) {
    this.maxOrganisms = maxOrganisms;
    this.energy = new Float32Array(maxOrganisms);
    this.cellCount = new Uint32Array(maxOrganisms);
    this.centroidX = new Float32Array(maxOrganisms);
    this.centroidY = new Float32Array(maxOrganisms);
    this.mover = new Int32Array(maxOrganisms).fill(-1);
    this.orgAlive = new Uint8Array(maxOrganisms);
    // Free-list of ids 1..maxOrganisms-1 (0 reserved). Pop returns 1, 2, 3, … ascending.
    const n = maxOrganisms - 1;
    this.orgFree = new Int32Array(n);
    for (let i = 0; i < n; i++) this.orgFree[i] = n - i; // [n, n-1, …, 1]; pop from top → 1 first
    this.orgFreeTop = n;
  }

  /** Allocate a fresh organism id (≥1), or -1 if exhausted (refuse-new). */
  alloc(): number {
    if (this.orgFreeTop === 0) return -1;
    const id = this.orgFree[--this.orgFreeTop]!;
    this.orgAlive[id] = 1;
    this.mover[id] = -1;
    this.energy[id] = 0;
    this.cellCount[id] = 0;
    return id;
  }

  /** Free an organism id (M5: on a merge — currently unused; M6 uses it on extinction). */
  free(id: number): void {
    if (this.orgAlive[id] === 0) return;
    this.orgAlive[id] = 0;
    this.mover[id] = -1;
    this.orgFree[this.orgFreeTop++] = id;
  }

  isAlive(id: number): boolean {
    return this.orgAlive[id] === 1;
  }
}

/**
 * Recompute per-organism aggregates from the current live set in one O(live) pass
 * (§4.8). Exact and allocation-free; centroid is a plain mean (toroidal-seam handling
 * deferred — hand-built organisms are small and placed away from the seam). The split
 * relabels `organismId` incrementally; this pass is the authority for the numbers.
 */
export function aggregateOrganisms(
  live: Uint32Array,
  n: number,
  organismId: Uint32Array,
  energy: Float32Array,
  posX: Float64Array,
  posY: Float64Array,
  organisms: OrganismTable,
): void {
  const oe = organisms.energy;
  const oc = organisms.cellCount;
  const ox = organisms.centroidX;
  const oy = organisms.centroidY;
  oe.fill(0);
  oc.fill(0);
  ox.fill(0);
  oy.fill(0);

  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const org = organismId[i]!;
    if (org === 0) continue;
    oe[org] = oe[org]! + energy[i]!;
    oc[org] = oc[org]! + 1;
    ox[org] = ox[org]! + posX[i]!;
    oy[org] = oy[org]! + posY[i]!;
  }

  const m = organisms.maxOrganisms;
  for (let org = 1; org < m; org++) {
    const c = oc[org]!;
    if (c > 0) {
      ox[org] = ox[org]! / c;
      oy[org] = oy[org]! / c;
    }
  }
}
```

- [ ] **Step 4: Run it + lint — expect PASS.** Run: `pnpm vitest run src/core/organism/organisms.test.ts && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/core/organism/organisms.ts src/core/organism/organisms.test.ts
git commit --no-verify -m "feat(M5): OrganismTable + aggregateOrganisms — per-organism aggregates"
```

---

## Task 7: `SplitChecker` — split-on-break (the deterministic acceptance)

**Files:**
- Create: `src/core/organism/split.ts`
- Test: `src/core/organism/split.test.ts`

The §4.8 algorithm: after a bond `(a, b)` of one organism is removed, a **dual-frontier BFS** expands from `a` and `b` alternately over the current bond adjacency. If the frontiers meet → still connected (return −1). If one frontier closes (its queue empties) without meeting → that side is a separate, smaller-or-equal component → relabel its cells with a fresh `organismId` (and migrate `organisms.mover` if it moved). O(smaller side); allocation-free (pre-allocated queues + a visit-stamp epoch so no per-call clearing). This is the spec §8 M5 acceptance test (chain → break middle → two organisms with partitioned energy/count).

- [ ] **Step 1: Write the failing test** — `src/core/organism/split.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BondNetwork } from './bonds';
import { OrganismTable, aggregateOrganisms } from './organisms';
import { SplitChecker } from './split';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

/** Build a bonded chain c0-c1-…-c(k-1) in one organism with the given energies. */
function chain(store: CellStore, bonds: BondNetwork, organisms: OrganismTable, energies: number[]): { org: number; cells: number[] } {
  const f = store.fields;
  const org = organisms.alloc();
  const cells: number[] = [];
  for (let i = 0; i < energies.length; i++) {
    const c = store.alloc();
    f.cellType[c] = CellType.PHOTO; // non-neural — splits don't touch the global net
    f.organismId[c] = org;
    f.energy[c] = energies[i]!;
    f.posX[c] = 100 + i * 10;
    f.posY[c] = 100;
    cells.push(c);
  }
  for (let i = 0; i + 1 < cells.length; i++) {
    bonds.addBond(cells[i]!, f.generation[cells[i]!]!, cells[i + 1]!, f.generation[cells[i + 1]!]!, 10, 1);
  }
  bonds.rebuildLive(store);
  return { org, cells };
}

describe('SplitChecker — split-on-break (§4.8)', () => {
  it('chain → break the middle → two organisms with correctly partitioned energy/count', () => {
    const store = new CellStore(16, false);
    const bonds = new BondNetwork(16, 32, 4);
    const organisms = new OrganismTable(16);
    const splitter = new SplitChecker(16);
    const { org, cells } = chain(store, bonds, organisms, [10, 20, 30, 40]); // c0-c1-c2-c3
    const f = store.fields;

    // The middle bond is c1-c2 (bond slot 1). Remove it, then check connectivity from its endpoints.
    bonds.removeBond(1);
    const newOrg = splitter.check(bonds, f.organismId, organisms, cells[1]!, cells[2]!);
    expect(newOrg).toBeGreaterThan(0);
    expect(newOrg).not.toBe(org);

    // Two organisms: {c0,c1} on one id, {c2,c3} on the other (which id is which is deterministic
    // but assert by membership, not a fixed id).
    expect(f.organismId[cells[0]!]).toBe(f.organismId[cells[1]!]);
    expect(f.organismId[cells[2]!]).toBe(f.organismId[cells[3]!]);
    expect(f.organismId[cells[0]!]).not.toBe(f.organismId[cells[2]!]);

    // Aggregates partition exactly.
    aggregateOrganisms(Uint32Array.from(cells), cells.length, f.organismId, f.energy, f.posX, f.posY, organisms);
    const left = f.organismId[cells[0]!]!;
    const right = f.organismId[cells[2]!]!;
    expect(organisms.cellCount[left]).toBe(2);
    expect(organisms.cellCount[right]).toBe(2);
    expect(organisms.energy[left]).toBeCloseTo(30, 4); // 10 + 20
    expect(organisms.energy[right]).toBeCloseTo(70, 4); // 30 + 40
  });

  it('returns -1 (no split) when a cycle keeps the organism connected', () => {
    const store = new CellStore(16, false);
    const bonds = new BondNetwork(16, 32, 4);
    const organisms = new OrganismTable(16);
    const splitter = new SplitChecker(16);
    const { cells } = chain(store, bonds, organisms, [10, 20, 30]); // c0-c1-c2 (bonds 0,1)
    const f = store.fields;
    // Add a closing bond c0-c2 → triangle.
    bonds.addBond(cells[0]!, f.generation[cells[0]!]!, cells[2]!, f.generation[cells[2]!]!, 10, 1);
    bonds.rebuildLive(store);

    bonds.removeBond(1); // break c1-c2; c2 still reaches c1 via c0.
    const newOrg = splitter.check(bonds, f.organismId, organisms, cells[1]!, cells[2]!);
    expect(newOrg).toBe(-1);
    expect(f.organismId[cells[0]!]).toBe(f.organismId[cells[2]!]); // unchanged
  });

  it('relabels a lone severed cell as its own organism', () => {
    const store = new CellStore(16, false);
    const bonds = new BondNetwork(16, 32, 4);
    const organisms = new OrganismTable(16);
    const splitter = new SplitChecker(16);
    const { cells } = chain(store, bonds, organisms, [10, 20]); // c0-c1 (one bond)
    const f = store.fields;
    bonds.removeBond(0);
    const newOrg = splitter.check(bonds, f.organismId, organisms, cells[0]!, cells[1]!);
    expect(newOrg).toBeGreaterThan(0);
    expect(f.organismId[cells[0]!]).not.toBe(f.organismId[cells[1]!]);
  });

  it('migrates organisms.mover to the new id when the mover lands on the severed side', () => {
    const store = new CellStore(16, false);
    const bonds = new BondNetwork(16, 32, 4);
    const organisms = new OrganismTable(16);
    const splitter = new SplitChecker(16);
    const { org, cells } = chain(store, bonds, organisms, [10, 20, 30, 40]);
    const f = store.fields;
    organisms.mover[org] = cells[0]!; // the MOVER is on the c0 end

    bonds.removeBond(1);
    const newOrg = splitter.check(bonds, f.organismId, organisms, cells[1]!, cells[2]!);
    const moverOrg = f.organismId[cells[0]!]!;
    // mover must belong to whichever org now owns c0.
    expect(organisms.mover[moverOrg]).toBe(cells[0]!);
    const otherOrg = moverOrg === org ? newOrg : org;
    expect(organisms.mover[otherOrg]).toBe(-1);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/organism/split.test.ts`

- [ ] **Step 3: Implement** `src/core/organism/split.ts`:

```ts
import { type BondNetwork } from './bonds';
import { type OrganismTable } from './organisms';

/**
 * Split-on-break (§4.8). After a bond `(a, b)` of one organism is removed, run a
 * dual-frontier BFS from `a` and `b` over the current bond adjacency, expanding one
 * cell per side per round. If the frontiers meet → still connected (return −1). If one
 * frontier closes (queue empties) before meeting → that side is a separate, smaller-or-
 * equal component → relabel its cells with a fresh organism id and migrate the MOVER if
 * it moved. Bounded by the smaller side; allocation-free (pre-allocated queues + a visit
 * epoch so no per-call clearing). Neighbour expansion is ascending-adjacency order
 * (deterministic). Returns the new organism id, or −1 if no split.
 *
 * The `epoch` is a monotonic counter compared against Int32Array entries; correct for the
 * < 2^31 check() calls any realistic M5 run makes (organism cells are lifecycle-exempt, so
 * splits are rare strain-break events). Determinism is unaffected. A future milestone with
 * frequent splits should mask the increment + stamp.fill(0) on wrap.
 */
export class SplitChecker {
  private readonly maxCells: number;
  private readonly queueA: Int32Array;
  private readonly queueB: Int32Array;
  private readonly stamp: Int32Array;
  private readonly side: Uint8Array; // 1 = A, 2 = B
  private epoch: number;

  constructor(maxCells: number) {
    this.maxCells = maxCells;
    this.queueA = new Int32Array(maxCells);
    this.queueB = new Int32Array(maxCells);
    this.stamp = new Int32Array(maxCells);
    this.side = new Uint8Array(maxCells);
    this.epoch = 0;
  }

  check(bonds: BondNetwork, organismId: Uint32Array, organisms: OrganismTable, a: number, b: number): number {
    const cap = bonds.degreeCap;
    const adj = bonds.adj;
    const degree = bonds.degree;
    const cellA = bonds.cellA;
    const cellB = bonds.cellB;
    const stamp = this.stamp;
    const side = this.side;
    const qA = this.queueA;
    const qB = this.queueB;
    const e = ++this.epoch;
    const org0 = organismId[a]!; // a and b shared this org before the break

    let headA = 0;
    let tailA = 0;
    let headB = 0;
    let tailB = 0;
    stamp[a] = e;
    side[a] = 1;
    qA[tailA++] = a;
    stamp[b] = e;
    side[b] = 2;
    qB[tailB++] = b;

    while (headA < tailA && headB < tailB) {
      // Expand one cell from side A.
      {
        const c = qA[headA++]!;
        const off = c * cap;
        const d = degree[c]!;
        for (let k = 0; k < d; k++) {
          const s = adj[off + k]!;
          const nb = cellA[s]! === c ? cellB[s]! : cellA[s]!;
          if (stamp[nb] === e) {
            if (side[nb] === 2) return -1; // frontiers met → still connected
            continue;
          }
          stamp[nb] = e;
          side[nb] = 1;
          qA[tailA++] = nb;
        }
      }
      // Expand one cell from side B.
      {
        const c = qB[headB++]!;
        const off = c * cap;
        const d = degree[c]!;
        for (let k = 0; k < d; k++) {
          const s = adj[off + k]!;
          const nb = cellA[s]! === c ? cellB[s]! : cellA[s]!;
          if (stamp[nb] === e) {
            if (side[nb] === 1) return -1; // met
            continue;
          }
          stamp[nb] = e;
          side[nb] = 2;
          qB[tailB++] = nb;
        }
      }
    }

    // One frontier closed without meeting → split. The closed side (whichever queue
    // emptied) is the smaller component — relabel it.
    const newOrg = organisms.alloc();
    if (newOrg < 0) return -1; // organism pool exhausted → leave merged (safe, degraded)

    let q: Int32Array;
    let count: number;
    if (headA >= tailA) {
      q = qA;
      count = tailA;
    } else {
      q = qB;
      count = tailB;
    }
    for (let i = 0; i < count; i++) organismId[q[i]!] = newOrg;

    // Migrate the MOVER if it moved to the relabelled side.
    const m = organisms.mover[org0]!;
    if (m >= 0 && organismId[m] === newOrg) {
      organisms.mover[newOrg] = m;
      organisms.mover[org0] = -1;
    }
    return newOrg;
  }
}
```

- [ ] **Step 4: Run it + lint — expect PASS.** Run: `pnpm vitest run src/core/organism/split.test.ts && pnpm lint`
This is the spec §8 M5 deterministic acceptance — it MUST pass exactly.

- [ ] **Step 5: Commit**

```bash
git add src/core/organism/split.ts src/core/organism/split.test.ts
git commit --no-verify -m "feat(M5): SplitChecker — split-on-break (dual-frontier BFS, deterministic)"
```

---

## Task 8: `breakStrainedBonds` — strain breakage + split-check (guarded)

**Files:**
- Create: `src/core/organism/breakage.ts`
- Test: `src/core/organism/breakage.test.ts`

Iterates the live-bond snapshot; a bond whose strain `(dist − restLen)/restLen` exceeds `maxStrain` is removed and a `SplitChecker.check` runs from its endpoints. A per-tick guard (`maxChecks`) bounds the work; strained bonds beyond the cap persist (still over-strained → re-detected next tick). Returns the number of bonds broken so the caller can rebuild the live-bond list. Reads POST-integrate positions.

- [ ] **Step 1: Write the failing test** — `src/core/organism/breakage.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BondNetwork } from './bonds';
import { OrganismTable } from './organisms';
import { SplitChecker } from './split';
import { breakStrainedBonds } from './breakage';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

function setup(): { store: CellStore; bonds: BondNetwork; organisms: OrganismTable; splitter: SplitChecker } {
  return {
    store: new CellStore(16, false),
    bonds: new BondNetwork(16, 32, 4),
    organisms: new OrganismTable(16),
    splitter: new SplitChecker(16),
  };
}

describe('breakStrainedBonds', () => {
  it('breaks an over-stretched bond and splits the organism', () => {
    const { store, bonds, organisms, splitter } = setup();
    const f = store.fields;
    const org = organisms.alloc();
    const a = store.alloc();
    const b = store.alloc();
    f.cellType[a] = CellType.PHOTO;
    f.cellType[b] = CellType.PHOTO;
    f.organismId[a] = org;
    f.organismId[b] = org;
    f.posX[a] = 100;
    f.posY[a] = 100;
    f.posX[b] = 120; // dist 20, restLen 10 → strain 1.0 > 0.6
    f.posY[b] = 100;
    bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 10, 1);
    bonds.rebuildLive(store);

    const broke = breakStrainedBonds(bonds, f.organismId, organisms, splitter, f.posX, f.posY, 0.6, 64, 1024, 1024);
    expect(broke).toBe(1);
    expect(bonds.isAlive(0)).toBe(false);
    expect(f.organismId[a]).not.toBe(f.organismId[b]); // split into two organisms
  });

  it('does NOT break a bond within strain tolerance', () => {
    const { store, bonds, organisms, splitter } = setup();
    const f = store.fields;
    const org = organisms.alloc();
    const a = store.alloc();
    const b = store.alloc();
    f.organismId[a] = org;
    f.organismId[b] = org;
    f.posX[a] = 100;
    f.posX[b] = 114; // dist 14, restLen 10 → strain 0.4 < 0.6
    f.posY[a] = 100;
    f.posY[b] = 100;
    bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 10, 1);
    bonds.rebuildLive(store);
    const broke = breakStrainedBonds(bonds, f.organismId, organisms, splitter, f.posX, f.posY, 0.6, 64, 1024, 1024);
    expect(broke).toBe(0);
    expect(bonds.isAlive(0)).toBe(true);
  });

  it('honours the per-tick split-check cap', () => {
    const { store, bonds, organisms, splitter } = setup();
    const f = store.fields;
    // Three independent over-stretched 2-cell organisms.
    for (let p = 0; p < 3; p++) {
      const org = organisms.alloc();
      const a = store.alloc();
      const b = store.alloc();
      f.organismId[a] = org;
      f.organismId[b] = org;
      f.posX[a] = 100 + p * 200;
      f.posX[b] = 130 + p * 200; // dist 30, restLen 10 → strain 2.0
      f.posY[a] = 100;
      f.posY[b] = 100;
      bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 10, 1);
    }
    bonds.rebuildLive(store);
    const broke = breakStrainedBonds(bonds, f.organismId, organisms, splitter, f.posX, f.posY, 0.6, 2, 1024, 1024);
    expect(broke).toBe(2); // capped at 2 this tick; the third persists for next tick
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/organism/breakage.test.ts`

- [ ] **Step 3: Implement** `src/core/organism/breakage.ts`:

```ts
import { type BondNetwork } from './bonds';
import { type OrganismTable } from './organisms';
import { type SplitChecker } from './split';
import { wrapDelta } from '../math/vec2';

/**
 * Break over-stretched bonds and split organisms (§4.8). Iterates the live-bond
 * snapshot; a bond whose strain (dist − restLen)/restLen exceeds `maxStrain` is removed
 * and a `SplitChecker.check` runs from its endpoints. The per-tick guard `maxChecks`
 * bounds the split-checks: once reached we stop scanning this tick; remaining strained
 * bonds are still over-stretched (large restoring force) and re-detected next tick.
 * Reads POST-integrate positions. Returns the number of bonds broken so the caller can
 * rebuild the live-bond list + aggregates. Allocation-free.
 */
export function breakStrainedBonds(
  bonds: BondNetwork,
  organismId: Uint32Array,
  organisms: OrganismTable,
  splitter: SplitChecker,
  posX: Float64Array,
  posY: Float64Array,
  maxStrain: number,
  maxChecks: number,
  width: number,
  height: number,
): number {
  const live = bonds.liveBonds;
  const count = bonds.liveBondCount;
  const cellA = bonds.cellA;
  const cellB = bonds.cellB;
  const restLen = bonds.restLen;
  let broke = 0;
  for (let k = 0; k < count; k++) {
    if (broke >= maxChecks) break;
    const s = live[k]!;
    if (bonds.isAlive(s) === false) continue;
    const a = cellA[s]!;
    const b = cellB[s]!;
    const ddx = wrapDelta(posX[a]! - posX[b]!, width);
    const ddy = wrapDelta(posY[a]! - posY[b]!, height);
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    const rl = restLen[s]!;
    if (rl > 0 && (d - rl) / rl > maxStrain) {
      bonds.removeBond(s);
      splitter.check(bonds, organismId, organisms, a, b);
      broke++;
    }
  }
  return broke;
}
```

- [ ] **Step 4: Run it + lint — expect PASS.** Run: `pnpm vitest run src/core/organism/breakage.test.ts && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/core/organism/breakage.ts src/core/organism/breakage.test.ts
git commit --no-verify -m "feat(M5): breakStrainedBonds — strain breakage + split-check (guarded)"
```

---

## Task 9: `computeDigestBonus` — bonded-DIGESTIVE-neighbour count (the payoff input)

**Files:**
- Create: `src/core/organism/digest-bonus.ts`
- Test: `src/core/organism/digest-bonus.test.ts`

For each cell, count its bonded neighbours that are also DIGESTIVE; store in a per-cell `Uint8Array`. METABOLIZE (Task 12) reads it to scale digestion gain. Recomputed each tick from the live-bond list (`fill(0)` then accumulate). Bonded neighbours are by construction the same organism, so no organism check is needed.

- [ ] **Step 1: Write the failing test** — `src/core/organism/digest-bonus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BondNetwork } from './bonds';
import { computeDigestBonus } from './digest-bonus';
import { CellStore } from '../memory/cell-store';
import { CellType } from '../cells/types';

describe('computeDigestBonus', () => {
  it('counts bonded DIGESTIVE neighbours per cell; ignores non-digestive bonds', () => {
    const store = new CellStore(16, false);
    const f = store.fields;
    const bonds = new BondNetwork(16, 32, 8);
    // Cluster: d0-d1-d2 all DIGESTIVE (chain) + d0-p (a PHOTO) bond.
    const d0 = store.alloc();
    const d1 = store.alloc();
    const d2 = store.alloc();
    const p = store.alloc();
    f.cellType[d0] = CellType.DIGESTIVE;
    f.cellType[d1] = CellType.DIGESTIVE;
    f.cellType[d2] = CellType.DIGESTIVE;
    f.cellType[p] = CellType.PHOTO;
    bonds.addBond(d0, f.generation[d0]!, d1, f.generation[d1]!, 10, 1);
    bonds.addBond(d1, f.generation[d1]!, d2, f.generation[d2]!, 10, 1);
    bonds.addBond(d0, f.generation[d0]!, p, f.generation[p]!, 10, 1);
    bonds.rebuildLive(store);

    const digestBonus = new Uint8Array(16);
    computeDigestBonus(bonds, f.cellType, digestBonus);
    expect(digestBonus[d0]).toBe(1); // bonded to d1 (DIGESTIVE); the p bond doesn't count
    expect(digestBonus[d1]).toBe(2); // bonded to d0 and d2
    expect(digestBonus[d2]).toBe(1);
    expect(digestBonus[p]).toBe(0); // PHOTO endpoint gets no digestive credit
  });

  it('resets to zero each call (recompute, not accumulate)', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const bonds = new BondNetwork(8, 16, 8);
    const a = store.alloc();
    const b = store.alloc();
    f.cellType[a] = CellType.DIGESTIVE;
    f.cellType[b] = CellType.DIGESTIVE;
    const s = bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 10, 1);
    bonds.rebuildLive(store);
    const digestBonus = new Uint8Array(8);
    computeDigestBonus(bonds, f.cellType, digestBonus);
    expect(digestBonus[a]).toBe(1);
    bonds.removeBond(s);
    bonds.rebuildLive(store);
    computeDigestBonus(bonds, f.cellType, digestBonus);
    expect(digestBonus[a]).toBe(0); // bond gone → reset
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/organism/digest-bonus.test.ts`

- [ ] **Step 3: Implement** `src/core/organism/digest-bonus.ts`:

```ts
import { type BondNetwork } from './bonds';
import { CellType } from '../cells/types';

/**
 * The multicellular payoff input (§4.5): for each cell, count its bonded neighbours
 * that are also DIGESTIVE. METABOLIZE scales a digestive cell's gain by
 * `1 + digestClusterBonus · digestBonus[i]`, so a clustered digestive organism
 * out-harvests lone cells. Recomputed each tick from the live-bond list (reset, then
 * accumulate); bonded neighbours are the same organism by construction. Allocation-free.
 */
export function computeDigestBonus(bonds: BondNetwork, cellType: Uint8Array, digestBonus: Uint8Array): void {
  digestBonus.fill(0);
  const live = bonds.liveBonds;
  const count = bonds.liveBondCount;
  const cellA = bonds.cellA;
  const cellB = bonds.cellB;
  for (let k = 0; k < count; k++) {
    const s = live[k]!;
    const a = cellA[s]!;
    const b = cellB[s]!;
    if (cellType[a]! === CellType.DIGESTIVE && cellType[b]! === CellType.DIGESTIVE) {
      digestBonus[a] = (digestBonus[a]! + 1) & 0xff;
      digestBonus[b] = (digestBonus[b]! + 1) & 0xff;
    }
  }
}
```

- [ ] **Step 4: Run it + lint — expect PASS.** Run: `pnpm vitest run src/core/organism/digest-bonus.test.ts && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/core/organism/digest-bonus.ts src/core/organism/digest-bonus.test.ts
git commit --no-verify -m "feat(M5): computeDigestBonus — bonded-digestive-neighbour count"
```

---

## Task 10: `orientSensors` — copy organism MOVER heading to SENSOR cells

**Files:**
- Create: `src/core/neural/orient.ts`
- Test: `src/core/neural/orient.test.ts`

The critter fold removes the kinematic snap, so SENSOR cells no longer inherit the body heading via `repositionPassengers`. `orientSensors` copies each organism's MOVER `heading` to its SENSOR cells before THINK, so the body-frame gradient projection (§4.6) stays aligned with thrust. Lives in `core/neural` (takes the net + raw arrays; no `OrganismTable` import → no layering violation). Reads `organismMover` = `OrganismTable.mover`.

- [ ] **Step 1: Write the failing test** — `src/core/neural/orient.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { NeuralNetwork, SensorChannel } from './network';
import { orientSensors } from './orient';

describe('orientSensors', () => {
  it('copies the organism MOVER heading to its SENSOR cells', () => {
    const net = new NeuralNetwork(8, 8, 8);
    // sensors at slots 2, 3; mover at slot 1; all organism 5.
    net.addSensor(2, SensorChannel.FWD_GRAD);
    net.addSensor(3, SensorChannel.LAT_GRAD);
    const organismId = Uint32Array.from([0, 5, 5, 5]);
    const organismMover = Int32Array.from([-1, -1, -1, -1, -1, 1]); // mover[5] = slot 1
    const heading = Float32Array.from([0, 1.2, 0, 0]); // mover heading 1.2
    orientSensors(net, organismId, organismMover, heading);
    expect(heading[2]).toBeCloseTo(1.2, 5);
    expect(heading[3]).toBeCloseTo(1.2, 5);
  });

  it('leaves a sensor untouched when its organism has no mover (-1) or is free (0)', () => {
    const net = new NeuralNetwork(8, 8, 8);
    net.addSensor(2, SensorChannel.FWD_GRAD);
    net.addSensor(3, SensorChannel.FWD_GRAD);
    const organismId = Uint32Array.from([0, 0, 0 /*free*/, 9 /*no mover*/]);
    const organismMover = Int32Array.from([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1]); // mover[9] = -1
    const heading = Float32Array.from([0, 0, 0.7, 0.8]);
    orientSensors(net, organismId, organismMover, heading);
    expect(heading[2]).toBeCloseTo(0.7, 5); // org 0 → skip
    expect(heading[3]).toBeCloseTo(0.8, 5); // mover -1 → skip
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** Run: `pnpm vitest run src/core/neural/orient.test.ts`

- [ ] **Step 3: Implement** `src/core/neural/orient.ts`:

```ts
import { type NeuralNetwork } from './network';

/**
 * Copy each organism's MOVER heading to its SENSOR cells (§4.6 body-frame projection).
 * After the M4 critter is folded into bonds, SENSOR cells no longer inherit the body
 * heading via the (deleted) kinematic snap, so they would project the food gradient in
 * a stale frame. Run before THINK; reads the MOVER heading set by the PREVIOUS tick's
 * driveMovers (the same one-tick orientation lag M4 documented — imperceptible for
 * chemotaxis). `organismMover` is `OrganismTable.mover` (−1 = no mover). Allocation-free;
 * no organism-module import (keeps the §5.1 layering: neural ↛ organism).
 */
export function orientSensors(
  net: NeuralNetwork,
  organismId: Uint32Array,
  organismMover: Int32Array,
  heading: Float32Array,
): void {
  const sc = net.sensorCell;
  const sn = net.sensorCount;
  for (let k = 0; k < sn; k++) {
    const i = sc[k]!;
    const org = organismId[i]!;
    if (org === 0) continue;
    const m = organismMover[org]!;
    if (m >= 0) heading[i] = heading[m]!;
  }
}
```

- [ ] **Step 4: Run it + lint — expect PASS.** Run: `pnpm vitest run src/core/neural/orient.test.ts && pnpm lint`

- [ ] **Step 5: Commit**

```bash
git add src/core/neural/orient.ts src/core/neural/orient.test.ts
git commit --no-verify -m "feat(M5): orientSensors — organism MOVER heading → SENSOR cells"
```

---

## Task 11: World M5 data members (additive — keeps everything green)

**Files:**
- Modify: `src/core/sim/world.ts`

> **Ordering (mirrors the M4 plan's "Task 9 Step 0"):** add the World DATA members the later tasks write into (`bonds`, `organisms`, `splitter`, `digestBonus`) WITHOUT touching `tick()` or the rigid grouping. This is purely additive → compiles, behaviour unchanged, all 145 tests stay green. Task 12 (metabolism) then references `this.digestBonus`; Task 14 wires the kernels into `tick()` and deletes the rigid grouping.

- [ ] **Step 1: Add the imports** — in `src/core/sim/world.ts`, add (do NOT remove the `repositionPassengers` import yet — Task 14 removes it):

```ts
import { BondNetwork } from '../organism/bonds';
import { OrganismTable } from '../organism/organisms';
import { SplitChecker } from '../organism/split';
```

- [ ] **Step 2: Add the members** — after `readonly net: NeuralNetwork;` (and the existing rigid-group members, which stay for now), add:

```ts
  readonly bonds: BondNetwork;
  readonly organisms: OrganismTable;
  readonly splitter: SplitChecker;
  /** Per-cell bonded-DIGESTIVE-neighbour count (the digestion-clustering payoff input). */
  readonly digestBonus: Uint8Array;
```

- [ ] **Step 3: Construct them** — in the constructor, after `this.net = new NeuralNetwork(...)`:

```ts
    this.bonds = new BondNetwork(config.maxCells, config.maxBonds, config.bondDegreeCap);
    this.organisms = new OrganismTable(config.maxOrganisms);
    this.splitter = new SplitChecker(config.maxCells);
    this.digestBonus = new Uint8Array(config.maxCells);
```

- [ ] **Step 4: Typecheck + run the sim suite — expect PASS, unchanged behaviour.** Run: `pnpm typecheck && pnpm vitest run src/core/sim`
Expected: clean; all existing tests green (members added, nothing wired).

- [ ] **Step 5: Commit**

```bash
git add src/core/sim/world.ts
git commit --no-verify -m "feat(M5): World owns BondNetwork/OrganismTable/SplitChecker/digestBonus (additive)"
```

---

## Task 12: METABOLIZE — digestion-clustering bonus

**Files:**
- Modify: `src/core/cells/metabolism.ts`, `src/core/sim/world.ts`
- Test: `src/core/cells/metabolism.test.ts`

A DIGESTIVE/MOTILE cell's digestion gain is scaled by `1 + digestClusterBonus · digestBonus[i]`. With no bonds (the M2/M3 ecosystem) `digestBonus` is all zero → multiplier 1 → identical behaviour. `world.digestBonus` exists from Task 11.

- [ ] **Step 1: Write the failing test** — append to `src/core/cells/metabolism.test.ts` (reuse the file's existing `buildHash` helper + imports):

```ts
describe('metabolism — M5 digestion-clustering bonus', () => {
  it('scales a bonded digestive cluster cell gain by 1 + digestClusterBonus·neighbours', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eater = store.alloc();
    const prey = store.alloc();
    f.posX[eater] = 500;
    f.posY[eater] = 500;
    f.posX[prey] = 503; // within contact (ri+rj = 12)
    f.posY[prey] = 500;
    f.radius[eater] = 6;
    f.radius[prey] = 6;
    f.mass[eater] = 1;
    f.mass[prey] = 1;
    f.energy[eater] = 100;
    f.energy[prey] = 100;
    f.cellType[eater] = CellType.DIGESTIVE;
    f.cellType[prey] = CellType.PHOTO; // edible
    const live = Uint32Array.from([eater, prey]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0);
    const hash = buildHash(store, live, 2, 1024, 1024, 12);

    const digestBonus = new Uint8Array(8);
    digestBonus[eater] = 2; // pretend it has 2 bonded digestive neighbours
    // digestRate 7, eff 0.7, basal 0, meatDecay 0.5, moveCost 0, neuralCost 0, clusterBonus 0.5
    metabolize(live, 2, f, hash, lf, 0, 0, 7, 0.7, 0, 0.5, 0, 0, digestBonus, 0.5);
    // extracted 7, base gain 7·0.7 = 4.9; multiplier 1 + 0.5·2 = 2 → 9.8 gained. start 100.
    expect(f.energy[eater]).toBeCloseTo(100 + 4.9 * 2, 4);
  });

  it('is identical to the unbonded case when digestBonus[i] is 0 (M2/M3 regression)', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eater = store.alloc();
    const prey = store.alloc();
    f.posX[eater] = 500;
    f.posY[eater] = 500;
    f.posX[prey] = 503;
    f.posY[prey] = 500;
    f.radius[eater] = 6;
    f.radius[prey] = 6;
    f.mass[eater] = 1;
    f.energy[eater] = 100;
    f.energy[prey] = 100;
    f.cellType[eater] = CellType.DIGESTIVE;
    f.cellType[prey] = CellType.PHOTO;
    const live = Uint32Array.from([eater, prey]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0);
    const hash = buildHash(store, live, 2, 1024, 1024, 12);
    const digestBonus = new Uint8Array(8); // all zero
    metabolize(live, 2, f, hash, lf, 0, 0, 7, 0.7, 0, 0.5, 0, 0, digestBonus, 0.5);
    expect(f.energy[eater]).toBeCloseTo(100 + 4.9, 4); // unchanged from the no-bonus path
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (no `digestBonus`/`digestClusterBonus` params). Run: `pnpm vitest run src/core/cells/metabolism.test.ts`

- [ ] **Step 3: Implement** — edit `src/core/cells/metabolism.ts`. Add the two params after `neuralCost`:

```ts
  moveCost: number,
  neuralCost: number,
  digestBonus: Uint8Array,
  digestClusterBonus: number,
): void {
```

In the digestion branch, replace the gain line:

```ts
              if (extracted > 0) {
                f.energy[j] = avail - extracted;
                const mult = 1 + digestClusterBonus * digestBonus[i]!;
                f.energy[i] = f.energy[i]! + extracted * digestEfficiency * mult;
                eaten = true;
                break;
              }
```

Update the JSDoc to note the clustering multiplier (the multicellular payoff, §4.5).

- [ ] **Step 4: Update the call sites.**

(a) **`src/core/sim/world.ts`** — append the two args to the `metabolize(...)` call (after `cfg.neuralCost,`):

```ts
      cfg.neuralCost,
      this.digestBonus,
      cfg.digestClusterBonus,
    );
```

(b) **Update ALL legacy `metabolize(...)` calls in `src/core/cells/metabolism.test.ts`** (audit: there are **10** — about 5 SINGLE-line and 5 MULTI-line; do not miss the multi-line ones). `metabolize` now needs 15 args, so every call must append the two new ones after `neuralCost`. Use a shared `const noBonus = new Uint8Array(64);` (oversized so it covers every store's slot indices — never OOB) near the top of the file, and `digestClusterBonus = 0`:
  - **single-line** calls that end `…, moveCostArg, neuralCostArg);` → `…, moveCostArg, neuralCostArg, noBonus, 0);`
  - **multi-line** calls whose last two arg lines are e.g. `      0, // moveCost` / `      0, // neuralCost` then `    );` → insert two new lines before the `);`:
    ```ts
          0, // moveCost
          0, // neuralCost
          noBonus,
          0, // digestClusterBonus
        );
    ```
Grep `metabolize(` in the file to confirm you've hit all 10. (`world.ts` is the only other caller and is handled in 4(a).)

- [ ] **Step 5: Run the cells suite + typecheck — expect PASS.** Run: `pnpm vitest run src/core/cells && pnpm typecheck`
Expected: clean; the clustering test green; all M2/M3/M4 metabolism tests still green (digestBonus 0 → multiplier 1).

- [ ] **Step 6: Commit**

```bash
git add src/core/cells/metabolism.ts src/core/cells/metabolism.test.ts src/core/sim/world.ts
git commit --no-verify -m "feat(M5): METABOLIZE — digestion-clustering bonus (the multicellular payoff)"
```

---

## Task 13: Lifecycle — exempt all organism cells from death + division

**Files:**
- Modify: `src/core/cells/lifecycle.ts`
- Test: `src/core/cells/lifecycle.test.ts`

Generalise the M4 neural exemption: any cell with `organismId !== 0` (bonded organism cells, including the neural critter) is exempt from death (pass 1) and division (pass 3). M5 organisms are hand-built and don't reproduce or die at the cell level (M6 owns organism lifecycle); this guarantees no bonded cell dies mid-run → no dangling bonds. Free cells (`organismId === 0` — the M2/M3 ecosystem) are unaffected.

- [ ] **Step 1: Write the failing test** — append to `src/core/cells/lifecycle.test.ts` (reuse the file's existing imports/helpers):

```ts
describe('lifecycle — organism cells are exempt from death + division (M5)', () => {
  it('does NOT convert a depleted bonded (organismId!=0) DIGESTIVE to MEAT', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const a = store.alloc();
    f.cellType[a] = CellType.DIGESTIVE;
    f.organismId[a] = 7; // in an organism
    f.energy[a] = -5; // would normally die
    f.mass[a] = 1;
    const out = { births: 0, deaths: 0 };
    lifecycle(Uint32Array.from([a]), 1, store, 1, 1024, 1024, 30, 150, 10, 6, 0, out);
    expect(out.deaths).toBe(0);
    expect(f.cellType[a]).toBe(CellType.DIGESTIVE); // still alive, not MEAT
  });

  it('does NOT divide a bonded DIGESTIVE above threshold', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const a = store.alloc();
    f.cellType[a] = CellType.DIGESTIVE;
    f.organismId[a] = 7;
    f.energy[a] = 5000;
    f.mass[a] = 1;
    f.radius[a] = 6;
    const before = store.aliveCount;
    const out = { births: 0, deaths: 0 };
    lifecycle(Uint32Array.from([a]), 1, store, 1, 1024, 1024, 30, 150, 10, 6, 0, out);
    expect(out.births).toBe(0);
    expect(store.aliveCount).toBe(before);
  });

  it('STILL kills/divides a FREE (organismId 0) cell — ecosystem unaffected', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const dead = store.alloc();
    f.cellType[dead] = CellType.DIGESTIVE;
    f.organismId[dead] = 0;
    f.energy[dead] = -1;
    f.mass[dead] = 1;
    const big = store.alloc();
    f.cellType[big] = CellType.PHOTO;
    f.organismId[big] = 0;
    f.energy[big] = 300;
    f.mass[big] = 1;
    f.radius[big] = 6;
    const out = { births: 0, deaths: 0 };
    lifecycle(Uint32Array.from([dead, big]), 2, store, 1, 1024, 1024, 30, 150, 10, 6, 0, out);
    expect(out.deaths).toBe(1);
    expect(f.cellType[dead]).toBe(CellType.MEAT);
    expect(out.births).toBe(1);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (bonded cells currently die/divide). Run: `pnpm vitest run src/core/cells/lifecycle.test.ts`

- [ ] **Step 3: Implement** — edit `src/core/cells/lifecycle.ts`. In **Pass 1** change the guard:

```ts
      if (isNeural(type) || f.organismId[i]! !== 0) continue; // M5: organism cells managed by organism lifecycle (M6)
```

In **Pass 3** change the guard:

```ts
    if (isNeural(type) || f.organismId[i]! !== 0) continue; // M5: organism cells don't divide (M6 reproduces organisms)
```

Update the function JSDoc: neural cells AND any `organismId !== 0` cell are exempt from passes 1 and 3.

- [ ] **Step 4: Run the cells suite — expect PASS.** Run: `pnpm vitest run src/core/cells`
Expected: new exemption tests green; all existing tests green (M2/M3 cells use `organismId 0`; M4 neural cells were already exempt via `isNeural`).

- [ ] **Step 5: Commit**

```bash
git add src/core/cells/lifecycle.ts src/core/cells/lifecycle.test.ts
git commit --no-verify -m "feat(M5): lifecycle exempts all organism cells (organismId != 0) from death + division"
```

---

## Task 14: Fold the critter into bonds + wire bond physics into `World.tick` (atomic cohesion swap)

**Files:**
- Modify: `src/core/sim/critter.ts`, `src/core/sim/world.ts`, `src/core/sim/critter.test.ts`, `src/core/sim/golden-think.test.ts`, `src/core/sim/READS-WRITES.md`
- Create: `src/core/sim/golden-bond.test.ts`
- Delete: `src/core/physics/rigid-group.ts`, `src/core/physics/rigid-group.test.ts`

> **Why one task:** cohesion is atomic — you cannot half-swap it. Removing `repositionPassengers` while bonds aren't wired (or vice-versa) leaves the critter incoherent and `critter-swim` red. This task swaps the whole mechanism in one reviewable unit (the largest in M5). **This is the highest-risk task** — the bonded critter is a soft-but-braced body, where the M4 critter was rigid. Mitigations: stiff spokes + cross-bracing (near-rigid shape) and `orientSensors` (logical orientation = MOVER heading drives BOTH thrust and gradient projection, so the chemotaxis loop closes regardless of physical wobble). The `critter-swim` acceptance is the gate. **Verify in this order: (1) NUMERICAL STABILITY first** — after wiring, tick a critter ~50 steps and assert positions stay finite (no Inf/NaN). The bond spring's effective `k_eff = bondStiffness·perBondStiffness` and the symplectic-Euler two-free-mass ceiling for the default dt/damping/mass is ~3 (a 6-spoke MOVER hub is tighter), so `cfg.bondStiffness` MUST stay ≤ ~2.5 (default 1.5; the Task 1 config.test gates this). If you see Inf/NaN you are over the ceiling — LOWER stiffness, don't raise it. **(2) Then chemotaxis** — if the critter is too floppy to close ≥150 units, raise `bondStiffness` toward 2.5 (the ceiling) and/or stiffen the bracing; if it explodes, you went past the ceiling. Retune `bondStiffness`/`damping`/`bondMaxStrain` (live knobs) or the builder rest-lengths within the stable window — **do NOT weaken the assertion.** If a STABLE bonded body fundamentally cannot chemotax, that is a finding to surface to Josh, not paper over.

- [ ] **Step 1: Rewrite `spawnSwimmer`** in `src/core/sim/critter.ts` to build bonds + an organism instead of the rigid table. Replace the whole file with:

```ts
import { type World } from './world';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';
import { wrapDelta } from '../math/vec2';

export interface Critter {
  organismId: number;
  mover: number;
  sensorFwd: number;
  sensorLat: number;
  clockA: number;
  clockB: number;
  turn: number;
  thrust: number;
}

/**
 * §10 R3 hand-wired sensorimotor critter, now a REAL bonded organism (M5; replaces the
 * M4 kinematic rigid grouping). A MOVER body with two front SENSOR cells (forward/lateral
 * food-gradient channels), a 2-neuron recurrent clock (search oscillator), and two output
 * NEURONs (turn, thrust) the MOVER reads. Cohesion is bond springs: spokes from the MOVER
 * to every cell + cross-bracing between rim cells triangulate the body so it holds its
 * shape near-rigidly under thrust. Energy is shared by intra-organism transfer. Organism
 * orientation = the MOVER's heading (propagated to the SENSORs by orientSensors). Cells
 * are provisioned with a large reserve and are lifecycle-exempt (organismId != 0), so the
 * topology is stable for the whole run. Deterministic (organism id from the per-World
 * OrganismTable free-list → first build gets id 1).
 */
export function spawnSwimmer(world: World, x: number, y: number, heading: number): Critter {
  const f = world.cells.fields;
  const r = world.config.cellRadius;
  const org = world.organisms.alloc();
  if (org < 0) throw new Error('spawnSwimmer: out of organism ids');
  const RESERVE = 5000;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);

  const make = (type: number, ox: number, oy: number): number => {
    const i = world.cells.alloc();
    if (i < 0) throw new Error('spawnSwimmer: out of cell slots');
    f.posX[i] = x + (ox * cos - oy * sin);
    f.posY[i] = y + (ox * sin + oy * cos);
    f.velX[i] = 0;
    f.velY[i] = 0;
    f.forceX[i] = 0;
    f.forceY[i] = 0;
    f.radius[i] = r;
    f.mass[i] = 1;
    f.energy[i] = RESERVE;
    f.cellType[i] = type;
    f.organismId[i] = org;
    f.genomeRef[i] = 0;
    f.brainRef[i] = 0;
    f.age[i] = 0;
    f.heading[i] = heading;
    f.senseX[i] = 0;
    f.senseY[i] = 0;
    f.thrust[i] = 0;
    return i;
  };

  // Body at the centre; passengers placed beyond the 2r contact range (no self-repulsion).
  const off = 4 * r;
  const lat = off * 0.6;
  const aft = off * 1.8;
  const mover = make(CellType.MOVER, 0, 0);
  const sensorFwd = make(CellType.SENSOR, off, -lat);
  const sensorLat = make(CellType.SENSOR, off, lat);
  const clockA = make(CellType.NEURON, -off, -lat);
  const clockB = make(CellType.NEURON, -off, lat);
  const turn = make(CellType.NEURON, -aft, 0);
  const thrust = make(CellType.NEURON, aft, 0);

  const net = world.net;
  const g = (i: number): number => f.generation[i]!;

  // Sensor channels.
  net.addSensor(sensorFwd, SensorChannel.FWD_GRAD);
  net.addSensor(sensorLat, SensorChannel.LAT_GRAD);

  // Steering loop: lateral gradient → turn; forward gradient → thrust (+ cruise bias).
  net.addSynapse(sensorLat, g(sensorLat), turn, g(turn), 1.5);
  net.addSynapse(sensorFwd, g(sensorFwd), thrust, g(thrust), 1.5);
  net.bias[thrust] = 0.5;
  // Recurrent clock → a slow search sweep on the turn neuron.
  net.addSynapse(clockB, g(clockB), clockA, g(clockA), 0.9);
  net.addSynapse(clockA, g(clockA), clockB, g(clockB), -0.9);
  net.bias[clockA] = 0.2;
  net.addSynapse(clockA, g(clockA), turn, g(turn), 0.3);
  net.addMotor(mover, turn, thrust);

  // M5 cohesion: bond springs (rest length = the spawn distance). Spokes from the MOVER
  // to every cell + bracing between rim cells → a triangulated, near-rigid body.
  world.organisms.mover[org] = mover;
  const k = 1; // per-bond relative stiffness; the global scale is cfg.bondStiffness
  const bond = (i: number, j: number): void => {
    const dx = wrapDelta(f.posX[i]! - f.posX[j]!, world.config.worldWidth);
    const dy = wrapDelta(f.posY[i]! - f.posY[j]!, world.config.worldHeight);
    const rl = Math.sqrt(dx * dx + dy * dy);
    const s = world.bonds.addBond(i, g(i), j, g(j), rl, k);
    if (s < 0) throw new Error('spawnSwimmer: out of bond slots or over the degree cap');
  };
  // Spokes (MOVER → all 6).
  bond(mover, sensorFwd);
  bond(mover, sensorLat);
  bond(mover, clockA);
  bond(mover, clockB);
  bond(mover, turn);
  bond(mover, thrust);
  // Bracing (rim triangulation; each rim cell stays ≤ degreeCap=8).
  bond(sensorFwd, sensorLat);
  bond(sensorFwd, thrust);
  bond(sensorLat, thrust);
  bond(clockA, clockB);
  bond(clockA, turn);
  bond(clockB, turn);

  net.rebuildLive(world.cells);
  world.bonds.rebuildLive(world.cells);

  return { organismId: org, mover, sensorFwd, sensorLat, clockA, clockB, turn, thrust };
}
```

- [ ] **Step 2: Wire `World.tick` + remove the rigid grouping** — edit `src/core/sim/world.ts`.

(a) Add the kernel imports and REMOVE the `repositionPassengers` import:

```ts
import { computeBondForces } from '../physics/bond-force';
import { computeAdhesion } from '../physics/adhesion';
import { breakStrainedBonds } from '../organism/breakage';
import { transferEnergy } from '../organism/transfer';
import { computeDigestBonus } from '../organism/digest-bonus';
import { aggregateOrganisms } from '../organism/organisms';
import { orientSensors } from '../neural/orient';
```

(Adjust the existing `import { OrganismTable } from '../organism/organisms';` from Task 11 to also import `aggregateOrganisms`: `import { OrganismTable, aggregateOrganisms } from '../organism/organisms';`. Remove `import { repositionPassengers } from '../physics/rigid-group';`.)

(b) DELETE the rigid-group members + `addPassenger` + `nextOrganismId`:

Remove these member declarations:
```ts
  /** Per-World deterministic organism-id allocator (M4 kinematic groups; M5 organisms). */
  nextOrganismId: number;
  // Kinematic rigid-group table (M4 critter cohesion; M5 replaces with bonds).
  readonly rigidPassenger: Uint32Array;
  readonly rigidBody: Uint32Array;
  readonly rigidOffX: Float32Array;
  readonly rigidOffY: Float32Array;
  rigidCount: number;
```
Remove their constructor init (`this.nextOrganismId = 1;` and the five `this.rigid* = …` lines). Remove the entire `addPassenger(...)` method.

(c) In `tick()`, after `const n = this.liveCount;` add the per-tick live-bond rebuild:

```ts
    this.bonds.rebuildLive(this.cells);
```

(d) Insert `orientSensors` BEFORE `think(...)` (after `sense(...)`):

```ts
    sense(live, n, f, this.food);

    // M5: orient SENSOR cells to their organism's MOVER heading before THINK projects
    // the gradient into the body frame (one-tick orientation lag, documented).
    orientSensors(this.net, f.organismId, this.organisms.mover, f.heading);

    think(this.net, f.cellType, f.senseX, f.senseY, f.heading);
    this.net.swap();
```

(e) In the FORCES phase, after `applyThrust(...)` and before `integrate(...)`, add bond + adhesion forces:

```ts
    applyThrust(live, n, f.heading, f.thrust, f.forceX, f.forceY);

    // M5 bond springs (scatter) + minimal adhesion (gather), accumulating into the force
    // buffer alongside repulsion + thrust before integrate (§4.3 step 5 FORCES).
    computeBondForces(
      this.bonds.liveBonds,
      this.bonds.liveBondCount,
      this.bonds.cellA,
      this.bonds.cellB,
      this.bonds.restLen,
      this.bonds.stiffness,
      f.posX,
      f.posY,
      f.forceX,
      f.forceY,
      cfg.bondStiffness,
      cfg.worldWidth,
      cfg.worldHeight,
    );
    computeAdhesion(
      this.hash,
      f.posX,
      f.posY,
      f.radius,
      f.cellType,
      f.organismId,
      f.forceX,
      f.forceY,
      cfg.adhesionStrength,
      cfg.adhesionRange,
      cfg.worldWidth,
      cfg.worldHeight,
    );

    integrate(/* …unchanged… */);
```

(f) DELETE the entire `repositionPassengers(...)` block that ran after `integrate(...)`. Replace it with bond breakage + a conditional live-bond rebuild:

```ts
    // M5: break over-stretched bonds (post-integrate strain) → split organisms.
    const broke = breakStrainedBonds(
      this.bonds,
      f.organismId,
      this.organisms,
      this.splitter,
      f.posX,
      f.posY,
      cfg.bondMaxStrain,
      cfg.maxSplitChecksPerTick,
      cfg.worldWidth,
      cfg.worldHeight,
    );
    if (broke > 0) this.bonds.rebuildLive(this.cells);

    // The digestion-clustering payoff input, read by METABOLIZE.
    computeDigestBonus(this.bonds, f.cellType, this.digestBonus);
```

(g) The `metabolize(...)` call already ends with `this.digestBonus, cfg.digestClusterBonus,` from Task 12. Immediately AFTER `metabolize(...)`, add the energy transfer:

```ts
    // M5: intra-organism energy transfer toward needier cells (§4.5).
    transferEnergy(
      this.bonds.liveBonds,
      this.bonds.liveBondCount,
      this.bonds.cellA,
      this.bonds.cellB,
      f.energy,
      cfg.transferRate,
      cfg.transferEfficiency,
    );
```

(h) After the SECOND `this.rebuildLive();` (the post-lifecycle re-derive) and the food-field update, before `sampleMetrics(...)`, add the aggregate recompute:

```ts
    // M5: recompute per-organism aggregates over the post-lifecycle live set.
    aggregateOrganisms(this.liveIndices, this.liveCount, f.organismId, f.energy, f.posX, f.posY, this.organisms);
```

(i) Update the class + `tick()` JSDoc to describe the M5 pipeline (orient → bond/adhesion forces → break/split → digest-bonus → transfer → aggregate; the kinematic grouping is gone).

- [ ] **Step 3: Delete the dead kinematic files.**

```bash
git rm src/core/physics/rigid-group.ts src/core/physics/rigid-group.test.ts
```

- [ ] **Step 4: Update `src/core/sim/critter.test.ts`** — replace the rigid-table assertions with bond/organism ones. The topology/determinism/clearance structure stays; change the network-and-cohesion block:

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';
import { spawnSwimmer } from './critter';

describe('spawnSwimmer — hand-wired bonded critter (M5)', () => {
  it('builds 1 MOVER + 2 SENSOR + 4 NEURON cells in one organism, wired + bonded + provisioned', () => {
    const w = new World(defaultConfig({ maxCells: 64 }), false);
    const c = spawnSwimmer(w, 500, 500, 0);
    const f = w.cells.fields;

    expect(f.cellType[c.mover]).toBe(CellType.MOVER);
    expect(f.cellType[c.sensorFwd]).toBe(CellType.SENSOR);
    expect(f.cellType[c.sensorLat]).toBe(CellType.SENSOR);
    // all 7 cells share the organism id, and it owns the MOVER for orientation
    expect(f.organismId[c.mover]).toBe(1); // first organism in a fresh World
    expect(f.organismId[c.sensorFwd]).toBe(f.organismId[c.mover]);
    expect(w.organisms.mover[c.organismId]).toBe(c.mover);
    // provisioned reserve
    expect(f.energy[c.mover]).toBeGreaterThan(500);

    // network: 2 sensors, 1 motor binding, ≥4 synapses
    expect(w.net.sensorCount).toBe(2);
    expect(w.net.motorCount).toBe(1);
    expect(w.net.liveSynapseCount).toBeGreaterThanOrEqual(4);
    // bonds: 6 spokes + 6 bracing = 12 live bonds; the MOVER has 6 (spokes only)
    expect(w.bonds.liveBondCount).toBe(12);
    expect(w.bonds.degree[c.mover]).toBe(6);
  });

  it('is deterministic — two builds give identical topology + bond rest lengths', () => {
    const a = new World(defaultConfig({ maxCells: 64 }), false);
    const b = new World(defaultConfig({ maxCells: 64 }), false);
    const ca = spawnSwimmer(a, 500, 500, 0);
    const cb = spawnSwimmer(b, 500, 500, 0);
    expect(ca).toEqual(cb);
    expect(Array.from(a.bonds.restLen.slice(0, 12))).toEqual(Array.from(b.bonds.restLen.slice(0, 12)));
    expect(Array.from(a.net.weight.slice(0, a.net.maxSynapses))).toEqual(
      Array.from(b.net.weight.slice(0, b.net.maxSynapses)),
    );
  });

  it('lays cells out beyond the contact range so the body never self-repels', () => {
    const w = new World(defaultConfig({ maxCells: 64 }), false);
    const c = spawnSwimmer(w, 500, 500, 0);
    const f = w.cells.fields;
    const slots = [c.mover, c.sensorFwd, c.sensorLat, c.clockA, c.clockB, c.turn, c.thrust];
    const contact = 2 * w.config.cellRadius;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const d = Math.hypot(f.posX[slots[i]!]! - f.posX[slots[j]!]!, f.posY[slots[i]!]! - f.posY[slots[j]!]!);
        expect(d).toBeGreaterThan(contact);
      }
    }
  });
});
```

- [ ] **Step 5: Update `src/core/sim/golden-think.test.ts`** — the "passengers stay rigidly attached" case becomes a bonded-cohesion case (springs hold cells NEAR rest length, not exactly). Replace that single `it(...)` block with:

```ts
  it('bonded cells stay cohered (within strain bounds) as the body moves', () => {
    const w = new World(defaultConfig({ maxCells: 64, initialMotileFraction: 0 }), false);
    const critter = spawnSwimmer(w, 500, 500, 0);
    const f = w.cells.fields;
    const off = 4 * w.config.cellRadius;
    const restFwd = Math.hypot(off, off * 0.6); // MOVER↔sensorFwd spoke rest length
    for (let t = 0; t < 30; t++) w.tick();
    const d = Math.hypot(f.posX[critter.sensorFwd]! - f.posX[critter.mover]!, f.posY[critter.sensorFwd]! - f.posY[critter.mover]!);
    // The spoke stays within the break threshold (and well above zero) — the body held together.
    expect(d).toBeGreaterThan(restFwd * 0.5);
    expect(d).toBeLessThan(restFwd * (1 + w.config.bondMaxStrain));
  });
```

(The CLOSED-FORM tanh case, the brain-drives-MOVER case, and the oscillator case in this file are UNCHANGED — re-run them to confirm THINK is unaffected.)

- [ ] **Step 6: Create the bond golden-tick** `src/core/sim/golden-bond.test.ts` (§6 "bond spring relaxes to restLen" + split-on-break through the tick):

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

/** Freeze everything except bond springs + integrate so the relaxation is clean. */
function bondCfg(over = {}) {
  return defaultConfig({
    maxCells: 64,
    worldWidth: 800,
    worldHeight: 800,
    repulsion: 0,
    photoGain: 0,
    basalCost: 0,
    neuralCost: 0,
    moveCost: 0,
    divideThreshold: 1e9,
    damping: 0.5,
    dt: 1,
    cellRadius: 6,
    initialMotileFraction: 0,
    foodDeposit: 0,
    foodDiffuse: 0,
    foodDecay: 0,
    transferRate: 0, // isolate mechanics from energy flow
    adhesionStrength: 0,
    bondStiffness: 1.5, // PINNED: a mechanics golden test must freeze its inputs, not float on the live default (audit)
    ...over,
  });
}

/** Build a bonded organism of `count` cells in a line; returns the slots. */
function buildOrganism(w: World, count: number, x: number, y: number, spacing: number): number[] {
  const f = w.cells.fields;
  const org = w.organisms.alloc();
  const cells: number[] = [];
  for (let i = 0; i < count; i++) {
    const c = w.cells.alloc();
    f.posX[c] = x + i * spacing;
    f.posY[c] = y;
    f.radius[c] = w.config.cellRadius;
    f.mass[c] = 1;
    f.energy[c] = 100 * (i + 1); // distinct energies for the split partition assertion
    f.cellType[c] = CellType.PHOTO;
    f.organismId[c] = org;
    cells.push(c);
  }
  for (let i = 0; i + 1 < count; i++) {
    w.bonds.addBond(cells[i]!, f.generation[cells[i]!]!, cells[i + 1]!, f.generation[cells[i + 1]!]!, spacing, 1);
  }
  w.bonds.rebuildLive(w.cells);
  return cells;
}

describe('golden bond — spring relaxation + split-on-break through World.tick', () => {
  it('a stretched bond relaxes toward restLen', () => {
    const w = new World(bondCfg(), false);
    const f = w.cells.fields;
    const org = w.organisms.alloc();
    const a = w.cells.alloc();
    const b = w.cells.alloc();
    f.posX[a] = 400;
    f.posY[a] = 400;
    f.posX[b] = 430; // 30 apart, restLen 20 → stretched
    f.posY[b] = 400;
    f.radius[a] = 6;
    f.radius[b] = 6;
    f.mass[a] = 1;
    f.mass[b] = 1;
    f.energy[a] = 1e6;
    f.energy[b] = 1e6;
    f.cellType[a] = CellType.PHOTO;
    f.cellType[b] = CellType.PHOTO;
    f.organismId[a] = org;
    f.organismId[b] = org;
    w.bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 20, 1);
    w.bonds.rebuildLive(w.cells);

    const d0 = Math.abs(f.posX[b]! - f.posX[a]!);
    for (let t = 0; t < 200; t++) w.tick();
    const d1 = Math.abs(f.posX[b]! - f.posX[a]!);
    expect(d0).toBeCloseTo(30, 4);
    expect(d1).toBeCloseTo(20, 0); // relaxed to within ~1 unit of restLen 20
  });

  it('a chain pulled past maxStrain breaks in-world and splits into two organisms', () => {
    // High strain config: a 4-cell chain whose rest length is far below its spacing → the
    // springs are over-stretched at t0, so the weakest bond exceeds maxStrain and breaks.
    const w = new World(bondCfg({ bondMaxStrain: 0.2, bondStiffness: 1 }), false);
    const f = w.cells.fields;
    const cells = buildOrganism(w, 4, 300, 400, 40); // spacing 40
    // Re-set every bond's restLen to 20 so spacing 40 → strain 1.0 > 0.2 → all break.
    for (let s = 0; s < w.bonds.liveBondCount; s++) w.bonds.restLen[w.bonds.liveBonds[s]!] = 20;
    const energyBefore = cells.reduce((sum, c) => sum + f.energy[c]!, 0); // buildOrganism sets 100*(i+1)

    w.tick(); // integrate barely moves them (stiff-free); breakage runs on the strained bonds

    // At least one bond broke → more than one organism now spans the chain.
    const ids = new Set(cells.map((c) => f.organismId[c]!));
    expect(ids.size).toBeGreaterThan(1);
    // Energy is conserved across the split (the split path only relabels organismId; transferRate=0).
    // NOTE (audit): do NOT assert which id c0 keeps — the SMALLER/first-closed side gets the FRESH id, and
    // bond0 = c0-c1 breaks first so c0 (degree 0) closes immediately and is RELABELLED, not kept. Assert the
    // partition PROPERTY (membership + energy), as split.test.ts does; never a fixed id here.
    const energyAfter = cells.reduce((sum, c) => sum + f.energy[c]!, 0);
    expect(energyAfter).toBeCloseTo(energyBefore, 4);
  });
});
```

(Assert only `ids.size > 1` + energy conservation — do NOT over-constrain which bonds break or which side keeps the original id; both are sensitive to break order + integrate motion. The precise partitioned-energy/count assertion lives in the deterministic `split.test.ts`, Task 7.)

- [ ] **Step 7: Update `src/core/sim/READS-WRITES.md`** — apply the "Tick READS/WRITES additions" table + coupling notes from the top of this plan. **Remove** the M4 `repositionPassengers` (step 6b) row + its kinematic-override note. Add the M5 rows (1b bonds.rebuildLive, 2c orientSensors, 5c bond forces, 5d adhesion, 6c breakage/split, 6d digest-bonus, 7b transfer, 11c aggregate) and these consciously-accepted notes:
  - **Sensor orientation lag (one tick)** — `orientSensors` reads the MOVER heading set by last tick's `driveMovers`. Imperceptible; recorded so a future reader doesn't treat it as a bug.
  - **Split does not prune cross-organism synapses** — M4's global neural net is retained; a split (which never frees a cell) leaves synapses valid. Per-organism brain partitioning + severed-activation zeroing is M6. The split-on-break test uses non-neural cells, so this never bites in M5.
  - **Aggregates recomputed each tick** — the split relabels `organismId` incrementally; `aggregateOrganisms` is the authority for the numbers.

- [ ] **Step 8: Run the FULL sim suite + the M4 acceptance — expect PASS.** Run: `pnpm vitest run src/core/sim src/core/physics src/core/neural`
Expected: `golden-bond` green; `critter` green; `golden-think` green; **`critter-swim` (the M4 acceptance) still green** — the bonded brain-driven critter still closes ≥150 units to food. If `critter-swim` fails, see the risk note at the top of this task: retune `bondStiffness`/`damping`/`bondMaxStrain` or the builder rest lengths; do NOT weaken the assertion. **Also confirm the PRE-EXISTING `reproducibility.test.ts` "neuron activations" block stays green** (it spawns a swimmer + ticks 150× + asserts `actCur[sensorFwd] !== 0 || actCur[sensorLat] !== 0`): the dynamic bonded critter must still pick up a non-zero gradient at a sensor. If that `!== 0` assertion flips, the bonded body drifted off the gradient — that's a real chemotaxis-cohesion signal (same class as a `critter-swim` failure), surface it; do NOT weaken it.

- [ ] **Step 9: `make check`** (full gate). Run: `make check`
Expected: typecheck + lint + ALL tests green (the deleted `rigid-group` files leave no dangling import; ESLint only checks `core ↛ render/app/workers`, which `core/organism`/`core/physics` respect — the intra-`core` layering is convention, not a lint gate).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit --no-verify -m "feat(M5): fold critter into bonds; wire bond physics into tick; delete kinematic grouping"
```

---

## Task 15: Reproducibility — byte-identical bonds + organism state

**Files:**
- Modify: `src/core/sim/reproducibility.test.ts`

- [ ] **Step 1: Write the failing/locking test** — append to `src/core/sim/reproducibility.test.ts`:

```ts
import { spawnSwimmer } from './critter';

describe('reproducibility — bonds + organism state', () => {
  function runBonded(seed: number): World {
    const w = new World(defaultConfig({ seed, maxCells: 2000 }), false);
    w.seedLife(500);
    // A bonded digestive cluster near a PHOTO patch + a swimmer → exercises bond springs,
    // transfer, the digestion-clustering bonus, and the neural chain together.
    const f = w.cells.fields;
    const org = w.organisms.alloc();
    const cluster: number[] = [];
    for (let kk = 0; kk < 4; kk++) {
      const i = w.cells.alloc();
      f.posX[i] = 1000 + (kk % 2) * 14;
      f.posY[i] = 1000 + ((kk / 2) | 0) * 14;
      f.radius[i] = w.config.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 200;
      f.cellType[i] = CellType.DIGESTIVE;
      f.organismId[i] = org;
      cluster.push(i);
    }
    for (let kk = 0; kk + 1 < cluster.length; kk++) {
      w.bonds.addBond(cluster[kk]!, f.generation[cluster[kk]!]!, cluster[kk + 1]!, f.generation[cluster[kk + 1]!]!, 14, 1);
    }
    w.bonds.rebuildLive(w.cells);
    spawnSwimmer(w, 1040, 1000, 0.5);
    for (let i = 0; i < 150; i++) w.tick();
    return w;
  }

  it('produces byte-identical bond positions, organismId, and organism energy for the same (Config, seed)', () => {
    const a = runBonded(424242);
    const b = runBonded(424242);
    const fa = a.cells.fields;
    const fb = b.cells.fields;
    for (let i = 0; i < a.cells.capacity; i++) {
      expect(fa.posX[i]!).toBe(fb.posX[i]!);
      expect(fa.posY[i]!).toBe(fb.posY[i]!);
      expect(fa.energy[i]!).toBe(fb.energy[i]!);
      expect(fa.organismId[i]!).toBe(fb.organismId[i]!);
    }
    for (let org = 0; org < a.organisms.maxOrganisms; org++) {
      expect(a.organisms.energy[org]!).toBe(b.organisms.energy[org]!);
      expect(a.organisms.cellCount[org]!).toBe(b.organisms.cellCount[org]!);
    }
  });
});
```

- [ ] **Step 2: Run it — expect PASS immediately** (the engine is deterministic; this LOCKS it). Run: `pnpm vitest run src/core/sim/reproducibility.test.ts`
Expected: PASS. If it FAILS, there is non-determinism in the bond/organism path (a `Math.random`, a non-canonical iteration, an unordered free-list, or a NaN) — fix the engine, not the test.

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/reproducibility.test.ts
git commit --no-verify -m "test(M5): lock byte-identical bonds + organism state under (Config, seed)"
```

---

## Task 16: Zero-allocation — bonded organisms in the hot loop

**Files:**
- Modify: `src/core/sim/zero-alloc.test.ts`

> The hot loop now also runs bond forces, adhesion (off → early return), breakage, digest-bonus (`fill` + scan), transfer, and the aggregate recompute. All scratch is pre-allocated; assert no per-tick growth AND that the bond/organism paths actually execute.

- [ ] **Step 1: Edit `src/core/sim/zero-alloc.test.ts`** — add a population of bonded organisms and liveness assertions.

Add the import:

```ts
import { spawnSwimmer } from './critter';
```

The M4 test already spawns 20 swimmers + 50_000 PHOTO + 2_000 MOTILE in a 52_500-cap world. Add a bonded digestive cluster population so transfer/digest-bonus/aggregate run over many bonds (keep within the cap — reduce the PHOTO count slightly if needed; e.g. 49_000 PHOTO leaves room). Spawn the clusters FIRST (alloc ordering can't starve them). After the existing swimmer spawns add:

```ts
    // M5: many small bonded clusters → exercise bond forces / transfer / digest-bonus / aggregate.
    const f = w.cells.fields;
    for (let cl = 0; cl < 200; cl++) {
      const org = w.organisms.alloc();
      const prev = { i: -1, gen: 0 };
      for (let kk = 0; kk < 4; kk++) {
        const i = w.cells.alloc();
        expect(i).toBeGreaterThanOrEqual(0);
        f.posX[i] = 50 + cl * 9 + kk * 3;
        f.posY[i] = 1500;
        f.radius[i] = w.config.cellRadius;
        f.mass[i] = 1;
        f.energy[i] = 150;
        f.cellType[i] = CellType.DIGESTIVE;
        f.organismId[i] = org;
        if (prev.i >= 0) w.bonds.addBond(prev.i, prev.gen, i, f.generation[i]!, 3, 1);
        prev.i = i;
        prev.gen = f.generation[i]!;
      }
    }
    w.bonds.rebuildLive(w.cells);
```

Reduce the PHOTO spawn count so the total stays under `maxCells` (e.g. change `expect(w.spawn(50_000)).toBe(50_000)` → `expect(w.spawn(48_000)).toBe(48_000)`), keeping the asserted-spawn pattern. **Also update the now-stale population comment at the top of the test** (it currently reads "50_000 PHOTO + 2_000 MOTILE + 20×7 critter cells") to the new mix: `48_000 PHOTO + 2_000 MOTILE + 20×7 critter cells + 200×4 bonded digestive cluster cells = 50_940 < 52_500 cap`. After the existing heap assertion, add:

```ts
    // The bond/organism paths must actually run in the measured window.
    expect(w.bonds.liveBondCount).toBeGreaterThan(0);
    let anyOrg = false;
    for (let org = 1; org < w.organisms.maxOrganisms && !anyOrg; org++) {
      if (w.organisms.cellCount[org]! > 0) anyOrg = true;
    }
    expect(anyOrg).toBe(true);
```

- [ ] **Step 2: Run it — expect PASS** (heap growth still < the existing floor). Run: `pnpm vitest run src/core/sim/zero-alloc.test.ts`
Expected: PASS. If heap grows, find the per-tick allocation (a closure / `.map` / literal / array spread) in the bond forces / breakage / transfer / digest-bonus / aggregate path and remove it. (`spawnSwimmer`'s `rebuildLive` is a SETUP cost, outside the measured window.)

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/zero-alloc.test.ts
git commit --no-verify -m "test(M5): zero-alloc covers the bond/organism hot path"
```

---

## Task 17: Bond-network overlay + energy-flow viz (§11 M5 deliverable)

**Files:**
- Create: `src/render/bond-overlay.ts`
- Modify: `src/app/main.ts`, `index.html`

The §11 M5 deliverable: draw the bond network as line segments between endpoints, coloured to visualise **energy flow** — toward the lower-energy endpoint, with intensity ∝ the energy gap (so you can SEE energy diffusing along bonds). A 2D-canvas overlay over the WebGL viewport (mirrors the existing `food-overlay.ts`/`light-overlay.ts` pattern). Read-only over core. **Read `src/render/food-overlay.ts` first** and match its canvas + camera-projection style (the snippet below assumes the same camera API; adapt to the actual signatures).

- [ ] **Step 1: Add an overlay canvas to `index.html`** (mirror the food/light overlay element; if those overlays draw onto a shared 2D canvas, reuse it instead of adding a new one):

```html
<canvas id="bonds" style="position:absolute; left:0; top:0; pointer-events:none; display:none;"></canvas>
```

- [ ] **Step 2: Implement** `src/render/bond-overlay.ts` (adapt the camera projection to match `food-overlay.ts`):

```ts
import { type World } from '../core/sim/world';
import { type Camera } from '../app/camera'; // use the actual camera import path from food-overlay.ts

/**
 * §11 M5 — bond-network + energy-flow overlay. Each live bond is a segment between its
 * endpoints; colour encodes energy flow: green→ from the richer toward the needier
 * endpoint, brightness ∝ the energy gap (transferEnergy moves energy down this gradient).
 * Read-only over core; resized to the viewport like the food/light overlays.
 */
export class BondOverlay {
  private readonly ctx: CanvasRenderingContext2D;
  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('bond overlay needs a 2D context');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  render(world: World, camera: Camera): void {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const bonds = world.bonds;
    const f = world.cells.fields;
    ctx.lineWidth = 1.5;
    for (let k = 0; k < bonds.liveBondCount; k++) {
      const s = bonds.liveBonds[k]!;
      const a = bonds.cellA[s]!;
      const b = bonds.cellB[s]!;
      // Project world → screen the same way food-overlay.ts does (replace with the real API).
      const ax = camera.worldToScreenX(f.posX[a]!);
      const ay = camera.worldToScreenY(f.posY[a]!);
      const bx = camera.worldToScreenX(f.posX[b]!);
      const by = camera.worldToScreenY(f.posY[b]!);
      const gap = f.energy[a]! - f.energy[b]!;
      const mag = Math.min(1, Math.abs(gap) / 100);
      const g = Math.round(120 + 120 * mag);
      ctx.strokeStyle = `rgba(80,${g},140,0.8)`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // A small dot at the needier (receiving) endpoint shows flow direction.
      if (mag > 0.02) {
        const rx = gap > 0 ? bx : ax;
        const ry = gap > 0 ? by : ay;
        ctx.fillStyle = `rgba(120,${g},200,0.9)`;
        ctx.beginPath();
        ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
```

- [ ] **Step 3: Wire it into `src/app/main.ts`** — mirror the existing food-overlay toggle (`F`) for a bonds toggle (`O` for **O**rganism/bonds; confirm `O` is free — taken keys are space/`.`/`[`/`]`/`L`/`F`/`C`/`B`/`H`). Add:

```ts
import { BondOverlay } from '../render/bond-overlay';
// …after the food overlay is created…
const bondsCanvas = document.getElementById('bonds') as HTMLCanvasElement;
const bondOverlay = new BondOverlay(bondsCanvas);
let showBonds = false;
```

In the resize handler, also `bondOverlay.resize(width, height)`. In `keydown`, add the toggle:

```ts
  if (e.key === 'o' || e.key === 'O') {
    showBonds = !showBonds;
    bondsCanvas.style.display = showBonds ? 'block' : 'none';
  }
```

In the render loop (where overlays draw), add `if (showBonds) bondOverlay.render(world, camera);`. Add `O bonds` to the on-screen legend (`H`) + HUD help string.

- [ ] **Step 4: Build — expect success.** Run: `pnpm build`
Expected: clean. Visual confirmation in Task 21.

- [ ] **Step 5: Commit**

```bash
git add src/render/bond-overlay.ts src/app/main.ts index.html
git commit --no-verify -m "feat(M5): bond-network + energy-flow overlay (toggle O)"
```

---

## Task 18: Organism inspector + follow-cam by organism

**Files:**
- Modify: `src/app/inspect.ts`, `src/app/main.ts`

Clicking a cell already shows its type/energy/age/pos/activation (M4). Add an organism readout for bonded cells (id, cell count, total energy from `OrganismTable`), and make the follow-cam track the organism's centroid when an organism cell is followed. **Read `src/app/inspect.ts` + the follow-cam block in `src/app/main.ts` first** and match their style.

- [ ] **Step 1: Extend the inspect panel** in `src/app/inspect.ts` — after the existing cell readout, append an organism line when `organismId !== 0`:

```ts
  const org = f.organismId[best]!;
  const orgInfo =
    org !== 0
      ? ` | org #${org} cells ${world.organisms.cellCount[org]} E ${world.organisms.energy[org]!.toFixed(0)}`
      : '';
  // append `${orgInfo}` to the existing panel.textContent template.
```

(Splice `${orgInfo}` onto the end of the existing `panel.textContent = …` template string — do not duplicate the assignment.)

- [ ] **Step 2: Follow-cam by organism** in `src/app/main.ts` — where the follow-cam currently pins to a single cell's position each frame, if that followed cell is in an organism (`organismId !== 0`), centre on the organism centroid instead:

```ts
  // inside the follow-cam update, when a followed cell is valid:
  const org = f.organismId[followed]!;
  if (org !== 0 && world.organisms.cellCount[org]! > 0) {
    camera.centerOn(world.organisms.centroidX[org]!, world.organisms.centroidY[org]!);
  } else {
    camera.centerOn(f.posX[followed]!, f.posY[followed]!); // existing single-cell path
  }
```

(Use the actual camera-centre API + the existing `followed`/`followGen` variables; the centroid is recomputed each tick by `aggregateOrganisms`.)

- [ ] **Step 3: Typecheck + build — expect clean.** Run: `pnpm typecheck && pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/app/inspect.ts src/app/main.ts
git commit --no-verify -m "feat(M5): organism inspector readout + follow-cam by organism centroid"
```

---

## Task 19: Controls — M5 live knobs

**Files:**
- Modify: `src/app/controls.ts`

Add the M5 live knobs to the control panel, following the EXACT slider/binding pattern the file already uses (look at how `bondStiffness`-adjacent numeric knobs like `moveCost`/`neuralCost` are bound and replicate it — do not invent a new mechanism). Group them in a new "bonds / organisms" section.

- [ ] **Step 1: Add the live knobs** (adapt to the file's actual `addSlider`/section helper signature):

```ts
// Bonds & organisms section.
addSlider('bondStiffness', 0, 2.5, 0.05); // cap at the symplectic-Euler stability ceiling (k>~3 diverges to Inf/NaN); rigidity comes from bracing + low strain, not large k
addSlider('bondMaxStrain', 0.1, 2, 0.05);
addSlider('transferRate', 0, 0.5, 0.01);
addSlider('transferEfficiency', 0, 1, 0.01);
addSlider('adhesionStrength', 0, 5, 0.05);
addSlider('adhesionRange', 6, 36, 1);
addSlider('digestClusterBonus', 0, 2, 0.05);
```

(The buffer-resize knobs `maxBonds`/`maxOrganisms`/`bondDegreeCap` are restart-required — do NOT add them as live sliders; note in a comment they require a restart, matching how `maxCells`/`maxSynapses` are handled.)

- [ ] **Step 2: Typecheck + build — expect clean.** Run: `pnpm typecheck && pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/app/controls.ts
git commit --no-verify -m "feat(M5): live knobs for bonds, transfer, adhesion, digestion clustering"
```

---

## Task 20: Headless runner + digestion-clustering probe + full `make check`

**Files:**
- Modify: `src/headless/run.ts`
- Create: `src/headless/cluster-probe.ts`
- Test: `src/core/sim/cluster-payoff.test.ts`

Demonstrate the payoff deterministically (a bonded digestive cluster out-harvests the same number of lone digestives over a window) and report organism/bond counts headless.

- [ ] **Step 1: Write the deterministic payoff test** `src/core/sim/cluster-payoff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

/** Place `n` DIGESTIVE cells (bonded into a chain if `bonded`) amid a fixed PHOTO field. */
function harvest(bonded: boolean): number {
  const cfg = defaultConfig({
    maxCells: 256,
    worldWidth: 400,
    worldHeight: 400,
    foodGridCols: 8,
    foodGridRows: 8,
    repulsion: 0,
    basalCost: 0,
    moveCost: 0,
    divideThreshold: 1e9,
    initialMotileFraction: 0,
    transferRate: 0, // isolate the digestion bonus from sharing
    digestClusterBonus: 0.5,
  });
  const w = new World(cfg, false);
  const f = w.cells.fields;
  // A dense PHOTO lawn the digestives sit in (constant prey supply; divide disabled).
  for (let gx = 0; gx < 20; gx++) {
    for (let gy = 0; gy < 20; gy++) {
      const i = w.cells.alloc();
      f.posX[i] = 40 + gx * 16;
      f.posY[i] = 40 + gy * 16;
      f.radius[i] = cfg.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 1e6; // effectively infinite prey so both runs see the same supply
      f.cellType[i] = CellType.PHOTO;
    }
  }
  // 4 digestives clustered at the centre.
  const org = bonded ? w.organisms.alloc() : 0;
  const ds: number[] = [];
  for (let kk = 0; kk < 4; kk++) {
    const i = w.cells.alloc();
    f.posX[i] = 180 + (kk % 2) * 14;
    f.posY[i] = 180 + ((kk / 2) | 0) * 14;
    f.radius[i] = cfg.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.DIGESTIVE;
    f.organismId[i] = org;
    ds.push(i);
  }
  if (bonded) {
    for (let kk = 0; kk + 1 < ds.length; kk++) {
      w.bonds.addBond(ds[kk]!, f.generation[ds[kk]!]!, ds[kk + 1]!, f.generation[ds[kk + 1]!]!, 14, 1);
    }
    // also brace 0-2 and 1-3 so each has ≥1 digestive neighbour
    w.bonds.addBond(ds[0]!, f.generation[ds[0]!]!, ds[2]!, f.generation[ds[2]!]!, 14, 1);
    w.bonds.addBond(ds[1]!, f.generation[ds[1]!]!, ds[3]!, f.generation[ds[3]!]!, 14, 1);
    w.bonds.rebuildLive(w.cells);
  }
  for (let t = 0; t < 200; t++) w.tick();
  let total = 0;
  for (const i of ds) total += f.energy[i]!;
  return total;
}

describe('M5 payoff — bonded digestive clusters out-harvest lone cells', () => {
  it('a bonded cluster accumulates strictly more energy than the same lone digestives', () => {
    const bonded = harvest(true);
    const lone = harvest(false);
    expect(bonded).toBeGreaterThan(lone); // the digestion-clustering bonus is the selection gradient
  });
});
```

(If both runs feed at the digestRate cap every tick, the bonus multiplies the cap — `bonded > lone` holds. If the geometry starves them, move the digestives onto the lawn or raise the lawn density; the gradient is the assertion, not a magnitude.)

- [ ] **Step 2: Run it — expect PASS.** Run: `pnpm vitest run src/core/sim/cluster-payoff.test.ts`

- [ ] **Step 3: Add the headless probe** `src/headless/cluster-probe.ts` — a small CLI mirroring `trophic-probe.ts` that runs `harvest`-style bonded vs lone worlds across a couple of seeds and prints the energy ratio (so Josh can sweep `digestClusterBonus`/`transferRate` headless, per the interactive-tuning value). Mirror the existing probe's structure (read `src/headless/trophic-probe.ts` first).

- [ ] **Step 4: Update `src/headless/run.ts`** — spawn a bonded cluster + a swimmer, and add organism/bond counts to the periodic report:

```ts
import { spawnSwimmer } from '../core/sim/critter';
// after seedLife:
spawnSwimmer(world, world.config.worldWidth * 0.5, world.config.worldHeight * 0.5, 0);
// in the report line:
`organisms=${countLiveOrganisms(world)} bonds=${world.bonds.liveBondCount}`
```

(Define a tiny local `countLiveOrganisms` that scans `world.organisms.cellCount` for `> 0`, or report `world.bonds.liveBondCount` alone if simpler. Match the existing report format.)

- [ ] **Step 5: Smoke headless.** Run: `make headless`
Expected: runs without error; the report shows non-zero organism + bond counts.

- [ ] **Step 6: Run the FULL gate — `make check`.** Run: `make check`
Expected: typecheck + lint + ALL tests green (145 M0–M4 + the M5 additions). Fix anything red before committing.

- [ ] **Step 7: Commit**

```bash
git add src/core/sim/cluster-payoff.test.ts src/headless/cluster-probe.ts src/headless/run.ts
git commit --no-verify -m "feat(M5): digestion-clustering payoff test + headless probe + organism/bond reporting"
```

---

## Task 21: Live prototype capture + final acceptance

**Files:** none (verification + capture)

- [ ] **Step 1: `make dev`** and open the dev-server URL (note: the port may NOT be 5173 if taken — read the Vite banner; favicon 404 is benign).

- [ ] **Step 2: Capture (Playwright MCP)** — navigate the URL and verify/capture:
  - A demo critter (now a bonded organism) holds together and locomotes (its brain drives the MOVER; the body stays cohered, no exploded passengers).
  - Press `O` — the bond-network overlay shows the critter's 12 bonds + the digestive cluster's bonds, with energy-flow colour/dots indicating transfer toward needier cells.
  - Press `B` — the brain inspector still shows live activations on the bonded critter.
  - Click the critter → the inspect panel shows `org #… cells … E …`; the follow-cam (`C`) tracks the organism centroid.
  - (Optional) raise `bondMaxStrain` down / drag a cell via a hand-of-god tool if available, or watch a cluster get stretched, to see split-on-break live (two organisms appear). If no in-app stretch tool exists, this is covered deterministically by `golden-bond` + `split` tests — note that.
  - Save a screenshot/GIF (e.g. `m5-bonded-critter.gif`).

- [ ] **Step 3: Final acceptance checklist (before merging `m5-multicellularity` → `main`)**

  - [ ] `make check` green (typecheck + lint + all tests: bond/organism unit tests, `split` deterministic acceptance, `golden-bond`, `cluster-payoff`, reproducibility incl. bonds, zero-alloc incl. the bond/organism path, and the still-green M4 `critter-swim`).
  - [ ] **Spec §8 M5 acceptance proven:** hand-built organisms **hold together** (bond springs; `golden-think` cohesion + the live capture), **share energy** (`transferEnergy` + the energy-flow overlay), **locomote** (the bonded brain-driven critter still closes distance — `critter-swim`), and the **split-on-break test passes** (`split.test.ts`: chain → break middle → two organisms with partitioned energy/count; plus `golden-bond` through the tick).
  - [ ] **Multicellular payoff pinned + demonstrated:** digestion clustering — `cluster-payoff.test.ts` shows a bonded cluster out-harvests lone cells (the §10 R1 selection gradient M7 will climb).
  - [ ] **§4.8 split** = dual-frontier BFS bounded by the smaller side, relabel + fresh `organismId`, aggregates partitioned (via the per-tick recompute); per-tick guard present.
  - [ ] **§5.2 edge pool** = flat SoA bond pool + free-list + per-cell fixed-degree adjacency + degree cap + refuse-new overflow; gen-validated endpoints in SEPARATE arrays (not bit-packed).
  - [ ] **§4.5 transfer** = gradient diffusion toward needier cells, rate/efficiency tunable, load-bearing (feeds the critter's neuron/mover from… provisioning in M5; real photo-fed organisms in M6).
  - [ ] M4 kinematic rigid grouping **deleted** (`repositionPassengers` + the rigid table + `nextOrganismId` gone; `rigid-group.ts`/`.test.ts` removed); the critter is a real bonded organism.
  - [ ] READS/WRITES contract updated (M5 rows + notes; M4 step-6b removed) and asserted by `golden-bond`/`golden-think`.
  - [ ] Determinism preserved (reproducibility includes bonds + organismId + organism energy); zero-alloc preserved with the bond/organism path live; M2/M3 ecosystem behaviour unchanged (adhesion off, `digestClusterBonus` only affects bonded cells, lifecycle exemption only adds `organismId !== 0`).
  - [ ] **Run the implementation-review workflow on the full diff** (multi-lens, each finding adversarially verified — as for M2/M4) before merge.
  - [ ] **Stop here for Josh's review** before the `--ff-only` merge (`git push . m5-multicellularity:main` then `git checkout main`).

---

## Deferred to later milestones (do NOT build in M5)

- **Organism-level reproduction + maternal provisioning** (§4.5, §4.7) — M6, with the developmental genome that grows the M4/M5 critter.
- **Death-driven bond reaping + organism death cascade** (§4.5 "death→meat may split an organism") — M6, when organism lifecycle lands. M5 exempts organism cells from death; bond removal is strain-break only.
- **Genome-gated adhesion-on-contact bond FORMATION** (§4.4, §4.7) — M6. M5 adhesion is a force only (default off).
- **Per-organism brain partitioning + cross-organism synapse pruning + severed-activation zeroing on split** (§4.6) — M6's per-organism brain model. M5 keeps the M4 global net; splits use non-neural cells.
- **Incremental organism-aggregate partition (O(smaller side))** + toroidal-seam-correct centroid — M7/M8 perf. M5 recomputes aggregates each tick (O(live), exact, fine at the regime).
- **CSR adjacency / dynamic degree-cap growth** — M5 uses fixed-max-degree slots; revisit if profiling at scale (M7/M8) demands it.
- **Organism-graph neural + bond partitioning across Workers** — M8.

---

## Adversarial audit record (2026-06-16)

This plan was hardened by a multi-agent adversarial-audit workflow before building (9 lenses × find → 2 skeptics × verify; 55 agents). 23 raw findings → 15 survived verification → **all confirmed blockers/majors fixed inline in this revision:**

- **BLOCKER (×3 findings, one root cause) — bond-spring numerical instability.** `bondStiffness: 8` is far past the symplectic-Euler stability ceiling: the kernel's `/dist` cancels the `ddx=±dist` projection, so `k_eff = bondStiffness·perBondStiffness`, and the two-free-mass ceiling for dt=1/damping=0.5/mass=1 is ~3 (a multi-spoke hub is tighter). k=8 diverges to ~1e162, failing golden-bond, critter-swim, and golden-think. **Fixed:** default → `1.5`; a `bondStiffness·dt² ≤ 2.5` stability assertion added to the Task 1 config.test; the golden-bond `bondCfg()` pins a stable value; the control slider capped at 2.5; the kernel JSDoc + Task 14 risk note now lead with "verify no Inf/NaN first, stiffness is capped, rigidity comes from bracing not large k".
- **BLOCKER — golden-bond split test asserted the wrong side.** `expect(organismId[c0]).toBe(org0)` is false: the smaller/first-closed side gets the FRESH id, and bond0=(c0,c1) breaks first so c0 (degree 0) closes immediately and is relabelled. **Fixed:** assertion removed; replaced with the energy-conservation check the comment already promised + `ids.size > 1`; the precise partition assertion stays in the deterministic `split.test.ts`.
- **MAJOR — architecture.json "mirror core/neural" points at nothing + intra-`core` DAG isn't tool-enforced.** No `core/neural` entry exists; nothing in `make check` reads the file; ESLint only enforces `core ↛ render/app/workers`. The plan falsely implied `pnpm lint` gates the intra-`core` layering. **Fixed:** Task 1 makes NO architecture.json edit (matching M4's precedent); the §5.1 intra-`core` DAG is documented as a human-reviewed convention; the false "guard runs in make lint" claim removed everywhere.
- **MINORS fixed:** golden-bond energy-conservation assertion now actually written; Task 12 metabolize call-site update spells out BOTH multi-line and single-line forms (all 10 calls); Task 16 stale population comment updated; SplitChecker epoch 2^31 ceiling documented; a note to re-verify the pre-existing `reproducibility.test.ts` neuron-activation behavioural assertion after the critter fold.
- **Refuted / not-real:** maxOrganisms exhaustion (free-list + rare M5 splits); various scope re-litigations of the locked M6 deferrals.

An **implementation-review workflow** must still run on the diff before merge (Task 21 checklist), as for M2/M4.








