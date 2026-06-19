# Plan 005: Finish the O(live) scaling foundation — bond high-water-mark (A1b) and touched-bucket spatial hash (A2)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cc34e07..HEAD -- src/core/organism/bonds.ts src/core/spatial/spatial-hash.ts src/core/spatial/spatial-hash.test.ts src/core/sim/world.ts src/core/memory/cell-store.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (byte-identical determinism; A1 already proved the pattern)
- **Depends on**: `plans/001-fix-lint-ci-gate.md` (green gate). Independent of
  002/003/004 — but land AFTER 004 if 004 touches `world.ts` near the same
  scan sites, to avoid merge churn.
- **Category**: perf/scale (architecture foundation)
- **Planned at**: commit `cc34e07`, 2026-06-19

## Why this matters

The owner-approved direction (`docs/decisions/INDEX.md`, `DESIGN-SCALING.md`,
the `2026-06-18-scaling-foundation.md` plan) is a bigger, sparser, longer-lived
world. The documented blocker is that **per-tick cost scales with capacity +
world area, not live population**. Phase A1 (DONE, commit `db605c8`) bounded
the cell `rebuildLive` scan to `[0, highWaterMark)` instead of `[0, maxCells)`.
Two halves of the same foundation remain open:

- **A1b — bonds + organisms.** `BondNetwork.rebuildLive` scans the full
  `maxBonds` capacity (16k) every structural event + once per tick; the
  adulthood/aggregate/death scans in `world.ts` walk `maxOrganisms` (8k). At a
  bigger/sparser world these fixed costs dominate.
- **A2 — spatial hash.** `SpatialHash.build` does `counts.fill(0)` + a prefix
  sum over ALL buckets every tick = `O(world_area / cellSize²)`. At 8192² /
  cellSize 8 that's ~1M buckets cleared/tick while maybe 30k cells do real work
  — ~95% of the per-tick hash cost is wasted on empty space. This is the worst
  fixed cost in the bigger-world regime the owner is already demoing (the
  `8192² archipelago` commit).

Both are **byte-identical** (the counting-sort output is unchanged; only the
work to produce it shrinks). The determinism contract is the safety net. This
plan implements A1b and A2 exactly as the existing scaling-foundation plan
specifies them, gated by byte-identity + a benchmark.

## Current state

**A1 precedent (the pattern to copy).** `CellStore.highWaterMark`
(`src/core/memory/cell-store.ts:91-147`): tracks `highest live slot + 1`,
walked DOWN on top-slot frees, maintained in `alloc`/`free`, unit-tested.
`World.rebuildLive` (`src/core/sim/world.ts:422`) now scans `[0, hwm)`:
```ts
private rebuildLive(): void {
  const hwm = this.cells.highWaterMark;
  const live = this.liveIndices;
  for (let i = 0; i < hwm; i++) { ... }
}
```
Benchmark proof (`src/headless/scaling-bench.ts`, from the A1 commit message):
per-tick cost flat ~1.04 ms across `maxCells` 50k→2M at fixed ~10k live.

**A1b target 1 — `BondNetwork.rebuildLive`** (`src/core/organism/bonds.ts`,
~line 126):
```ts
rebuildLive(store: CellStore): void {
  let nb = 0;
  for (let s = 0; s < this.maxBonds; s++) {       // <-- scans maxBonds (16k) every call
    if (this.bondAlive[s] === 0) continue;
    if (!store.validate(this.cellA[s]!, this.genA[s]!)) continue;
    if (!store.validate(this.cellB[s]!, this.genB[s]!)) continue;
    this.liveBonds[nb++] = s;
  }
  this.liveBondCount = nb;
}
```
The bond free-list (`bondFree: Int32Array`, `bondFreeTop`) is LIFO (see the
constructor: `bondFree[i] = maxBonds - 1 - i`), so live bond slots cluster LOW
— the same property that made the cell hwm work. A `bondHighWaterMark`
maintained in bond `alloc`/`free` bounds this scan to `[0, bondHwm)`.

**A1b target 2 — the `maxOrganisms` scans.** `world.ts:986-989`:
```ts
// 11f M6: adulthood tracking + live-organism count (one O(maxOrganisms) scan).
for (let org = 1; org < this.organisms.maxOrganisms; org++) {
```
`OrganismTable` (`src/core/organism/organisms.ts`) has a free-list / id scheme;
inspect it for the same LIFO-clustering property before applying a hwm. If the
organism id space does NOT cluster low (e.g. ids are handed out monotonically
and recycled non-LIFO), a hwm won't help — use a compact live-organism list
rebuilt from the live cells' `organismId` (already computed by
`aggregateOrganisms`), OR skip A1b-organisms and report why (see STOP
conditions).

**A2 target — `SpatialHash.build`** (`src/core/spatial/spatial-hash.ts:66`):
```ts
build(liveIndices, liveCount, posX, posY): void {
  const n = this.counts.length;
  this.counts.fill(0);                          // <-- O(buckets) every tick
  for (let k = 0; k < liveCount; k++) { ... counts[b]++; }
  let acc = 0;
  for (let b = 0; b < n; b++) {                 // <-- prefix sum O(buckets)
    this.bucketStart[b] = acc; this.cursor[b] = acc; acc += this.counts[b];
  }
  this.bucketStart[n] = acc;
  for (let k = 0; k < liveCount; k++) { ... sorted[cursor[b]++] = i; }
  this.liveCount = liveCount;
}
```
`counts`/`cursor`/`bucketStart` are length `cols*rows + 1`. The counting-sort
OUTPUT (`bucketStart`, `sorted`, `liveCount`) must be byte-identical. The
wasted work is the `counts.fill(0)` + the prefix sum over empty buckets.

**The A2 fix (from the scaling plan):** track the set of buckets TOUCHED in
the previous build and clear only those (a `touchedBuckets: Uint32Array` +
`touchedCount` recorded during the scatter, cleared+rewritten each build); OR a
per-bucket generation stamp (a `Uint32Array generation` + a `Uint32 epoch` — a
bucket is "empty" if `generation[b] !== epoch`). The generation-stamp approach
avoids a second pass and is simpler to keep byte-identical. Either is
acceptable; the scaling plan names both. **Prefer the generation-stamp
approach** (one int per bucket, no touched-list to maintain, trivially
byte-identical: a stale-stamp bucket reads as count 0, exactly as a cleared
one does).

**Repo conventions to honor:**
- The canonical ASCENDING live-slot order is LOAD-BEARING for determinism
  (lifecycle/metabolize/hash/repro all rely on it). The hwm bounds do NOT
  reorder anything — they only skip a dead tail that the mark's invariant
  proves is dead. Preserve ascending order exactly.
- The determinism contract (`reproducibility.test.ts`, including plan 002's
  new case) is the gate. Byte-identical before and after.
- Match the A1 commit's structure: a hwm field + maintenance in alloc/free +
  a unit test + a benchmark line in `scaling-bench.ts` showing flat cost.
- `src/core/**` stays off `src/sim/**` (the DAG). `BondNetwork` and
  `SpatialHash` are in `core/`; their hwm/stamp fields live there.

## Commands you will need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                     | exit 0              |
| Tests     | `pnpm test`                          | all pass            |
| Lint      | `pnpm lint`                          | exit 0              |
| Determinism | `pnpm test -- reproducibility`     | byte-identical, all pass |
| Bench     | `pnpm tsx src/headless/scaling-bench.ts` | runs, prints per-tick ms (see step 6) |
| Full gate | `make check`                         | green               |

## Scope

**In scope** (the only files you should modify):
- `src/core/organism/bonds.ts` — add `bondHighWaterMark`, maintain in
  `alloc`/`free`, bound `rebuildLive`.
- `src/core/organism/bonds.test.ts` — unit test for the bond hwm (mirroring
  the cell hwm test in `cell-store.test.ts`).
- `src/core/organism/organisms.ts` — IF (and only if) the organism id space
  clusters low LIFO: add an organism hwm or compact live list and bound the
  `world.ts:989` scan. If it does NOT cluster, skip and report (STOP
  condition).
- `src/core/spatial/spatial-hash.ts` — generation-stamp (or touched-bucket)
  scheme to clear only occupied buckets in `build`.
- `src/core/spatial/spatial-hash.test.ts` — a test asserting `build`'s output
  (`bucketStart`, `sorted`, `liveCount`) is byte-identical to a full-clear
  reference build, across several occupancy patterns.
- `src/core/sim/world.ts` — update the adulthood/aggregate/death scan bounds
  if A1b-organisms applies; otherwise no change.
- `src/headless/scaling-bench.ts` — add a bench line demonstrating A1b+A2
  flat cost vs capacity/area (mirror the A1 bench addition).

**Out of scope** (do NOT touch):
- `CellStore.highWaterMark` — it's done; don't touch it.
- The actual force/economy kernels — they read the live lists, not the hwm.
- `config.ts` defaults.
- Any reordering of the live-slot iteration. Ascending order is sacred.
- M8 / SharedArrayBuffer / worker parallelism — separate milestone.

## Git workflow

- Branch: `advisor/005-scaling-foundation-a1b-a2` (off `main`).
- Commit per sub-phase (A1b-bonds, A1b-organisms if applicable, A2-hash, bench).
  Message style (conventional, match `git log`):
  `perf(sim): high-water-mark bounds the bond live-scan to O(live) [scaling A1b]`
  `perf(spatial-hash): clear only occupied buckets via generation stamps [scaling A2]`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: A1b — bond high-water-mark

In `src/core/organism/bonds.ts`:
1. Add `bondHighWaterMark: number` (= highest live bond slot + 1, or 0 when
   empty), initialized 0 in the constructor.
2. In the bond `alloc` path (where a free slot is popped and `bondAlive[s]=1`
   is set): `if (s >= this.bondHighWaterMark) this.bondHighWaterMark = s + 1;`
3. In the bond `free` path (where `bondAlive[s]=0` and the slot is pushed back
   on the free list): if `s === this.bondHighWaterMark - 1`, walk the mark down
   past now-dead trailing slots:
   ```ts
   let h = this.bondHighWaterMark;
   while (h > 0 && this.bondAlive[h - 1] === 0) h--;
   this.bondHighWaterMark = h;
   ```
   (Mirror `cell-store.ts:144-147` exactly.)
4. In `rebuildLive`: change `for (let s = 0; s < this.maxBonds; s++)` →
   `for (let s = 0; s < this.bondHighWaterMark; s++)`. The skipped tail
   `[bondHwm, maxBonds)` is dead by the mark's invariant.

**Verify**:
- `pnpm typecheck` → exit 0.
- `pnpm test` → all pass (byte-identical behavior; the skipped tail is dead).
- Add a unit test to `bonds.test.ts`: alloc several bonds, free the top one,
  assert `bondHighWaterMark` walks down; free a non-top one, assert it stays;
  alloc past the previous mark, assert it grows. Mirror `cell-store.test.ts`'s
  hwm test structure.

### Step 2: A1b — organism scan bound (CONDITIONAL)

Inspect `src/core/organism/organisms.ts` `OrganismTable`'s alloc/free + id
scheme. Decide:

- **If organism ids are LIFO-clustered low** (free-list pops low ids): add an
  `organismHighWaterMark` exactly as in step 1, bound the
  `world.ts:989` adulthood scan and any other `for (org = 1; org <
  maxOrganisms; org++)` scan to `[1, organismHwm)`. (Start at 1 if id 0 is the
  "no organism" sentinel — confirm via the existing code.)
- **If ids are monotonic / non-LIFO** (a hwm would NOT track the live set): do
  NOT force it. Instead, build a compact live-organism id list from
  `aggregateOrganisms`'s output (it already computes per-organism cell counts;
  a live organism is one with `cellCount > 0`) and iterate that. This is more
  invasive — if it grows beyond ~30 lines, STOP and report, and limit this
  plan to A1b-bonds + A2 (the organism scan is the smallest of the three
  fixed costs).

**Verify**: `pnpm typecheck` + `pnpm test` → all pass byte-identical.

### Step 3: A2 — generation-stamp spatial hash

In `src/core/spatial/spatial-hash.ts`:
1. Add `private readonly generation: Uint32Array` (length `cols*rows`) and
   `private epoch: number` (starts 0), in the constructor.
2. In `build`, replace `this.counts.fill(0)` with a stamp bump:
   ```ts
   this.epoch++;
   // (if epoch wraps 2^32, fall back to a full counts.fill(0) + reset epoch=1 —
   //  add this guard; 2^32 ticks is unreachable but the guard is cheap and
   //  keeps the invariant provable.)
   ```
   Treat a bucket as count-0 when `generation[b] !== epoch`. Wherever the code
   reads `counts[b]`, read `generation[b] === epoch ? counts[b] : 0` instead —
   BUT note the build itself WRITES `counts[b]` during the scatter, so the
   write path must set `generation[b] = epoch` on first touch of bucket `b`
   this build (and reset `counts[b]` to 0 at that moment). Concretely:
   - First pass (count): for each live cell's bucket `b`: if
     `generation[b] !== epoch` { `generation[b] = epoch`; `counts[b] = 0`; }
     then `counts[b]++`.
   - The prefix sum still runs over ALL `n` buckets, BUT for a
     `generation[b] !== epoch` bucket `counts[b]` is stale garbage — so read
     it as 0 in the prefix sum: `acc += (generation[b] === epoch ? counts[b] : 0)`.
   - Second pass (scatter): same first-touch guard before `cursor[b]++`.
3. `bucketStart` and `sorted` are written exactly as before (the prefix sum
   produces the same offsets because every non-touched bucket contributes 0,
   same as a cleared bucket would). `liveCount` unchanged.

**Byte-identity argument** (put this in a comment in the code): a full-clear
build produces `counts[b]=0` for every untouched bucket; the stamp scheme
produces `counts[b]=<stale>` BUT every read path treats
`generation[b]!==epoch` as 0, so the prefix-sum contributions and the
`sorted` layout are identical to the full-clear build. The `bucketStart` /
`sorted` / `liveCount` outputs — the only things callers read — are
byte-identical.

**Verify**:
- `pnpm typecheck` → exit 0.
- `pnpm test` → all pass (byte-identical).
- Add a test to `spatial-hash.test.ts`: build the hash for (a) a dense
  all-buckets-touched occupancy, (b) a sparse few-buckets-touched occupancy,
  and (c) a second build after moving cells to NEW buckets (exercises the
  stale-stamp path). For each, compare `bucketStart`, `sorted` (first
  `liveCount` entries), and `liveCount` against a reference computed by a
  naive full-clear counting sort. Assert byte-equality. This is the
  correctness gate for A2.

### Step 4: Determinism gate

**Verify**: `pnpm test -- reproducibility` → ALL cases pass byte-identically,
including plan 002's graze/chain-plant/satiation ON case (which exercises the
hash + bond rebuild on the hot path). This is the non-negotiable proof.

### Step 5: Full gate

**Verify**: `make check` → green (typecheck, lint, all tests).

### Step 6: Benchmark

Add a line to `src/headless/scaling-bench.ts` (mirror the A1 addition) that
sweeps world size at fixed live population and reports per-tick ms. A1b+A2
should show per-tick cost roughly flat (or growing only with live count) as
world area grows — NOT growing with `cols*rows`. Run it:
`pnpm tsx src/headless/scaling-bench.ts`.

**Verify**: the bench runs and the printed numbers show per-tick cost
independent of world area at fixed live count (the whole point of A2). If the
bench shows area-dependent growth, A2 didn't take — re-check the stamp guard
covers BOTH the count pass and the scatter pass.

## Test plan

New tests:
1. `bonds.test.ts` — bond `bondHighWaterMark` walks down on top-free, stays on
   non-top-free, grows on alloc past it (mirror `cell-store.test.ts` hwm test).
2. `spatial-hash.test.ts` — `build` output byte-identical to a naive full-clear
   reference across dense, sparse, and move-to-new-bucket occupancies.
3. (If step 2 applied) `organisms.test.ts` — organism hwm / live-list test
   mirroring the bond one.

Pattern to model after: `src/core/memory/cell-store.test.ts` (the A1 hwm test)
and the existing `spatial-hash.test.ts` build-correctness tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 (all existing + new tests)
- [ ] `pnpm test -- reproducibility` byte-identical (no equality assert weakened)
- [ ] `BondNetwork.rebuildLive` scans `[0, bondHighWaterMark)`, not
      `[0, maxBonds)` (`grep -n "bondHighWaterMark" src/core/organism/bonds.ts`)
- [ ] `SpatialHash.build` does NOT call `counts.fill(0)` on the hot path
      (`grep -n "counts.fill(0)" src/core/spatial/spatial-hash.ts` returns
      nothing, OR only inside the 2^32-epoch-wrap fallback)
- [ ] A `generation`/`epoch` field exists on `SpatialHash`
- [ ] New `bonds.test.ts` hwm test + `spatial-hash.test.ts` byte-identity test
      pass
- [ ] `scaling-bench.ts` shows per-tick cost ~flat vs world area at fixed live
      count (paste the bench output into your NOTES)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated (if you maintain the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The reproducibility test is NOT byte-identical after A1b or A2. The most
  likely cause for A2: a read path that reads `counts[b]` without the
  generation guard (so a stale count leaks into the prefix sum). Find it; do
  not weaken the equality assert.
- `OrganismTable`'s id scheme is non-LIFO and a compact live-organism list
  would exceed ~30 lines (step 2). Report; limit the plan to A1b-bonds + A2
  and mark A1b-organisms as a follow-up.
- The bond free-list is NOT LIFO (so live bond slots don't cluster low and a
  hwm wouldn't track the live set). This contradicts the constructor evidence
  (`bondFree[i] = maxBonds - 1 - i`) — if you confirm otherwise, STOP and
  report; the A1 pattern doesn't apply and a different approach is needed.
- `scaling-bench.ts` doesn't exist or its A1 harness isn't present to extend
  (repo drift). Report; the bench is evidence, not a done-criterion blocker,
  but the reviewer wants it.
- A hwm bound or stamp guard changes the ORDER of any output (the ascending
  live-slot order, the `sorted` order within a bucket, the `liveBonds` order).
  Order changes break determinism even if the set is the same — STOP.

## Maintenance notes

- After this lands, the per-tick fixed cost is `O(live)` for cells, bonds, and
  (if step 2 applied) organisms, and `O(occupied buckets)` for the hash. The
  remaining area-scaling cost is the field diffusion (`PERF-005` in the audit)
  — that's a separate, larger piece of work (field-specific), NOT in this plan.
- A reviewer should verify: (a) the bond hwm walks down correctly on
  top-frees (the while loop); (b) the generation guard covers BOTH the count
  pass and the scatter pass in `build`; (c) the 2^32 epoch-wrap fallback is
  present (even if unreachable); (d) the bench numbers actually show
  area-independence.
- If a future change makes the bond or organism free-list non-LIFO, the hwm
  invariants break silently — add a comment at the free-list code pointing at
  the hwm dependency (like the cell-store comment does).
- The generation-stamp `Uint32Array` is `cols*rows` ints = the same order as
  `counts`; memory overhead is one bucket-array. Acceptable and noted in the
  scaling plan.
