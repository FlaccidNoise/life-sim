# Evolvable Per-Creature Damping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-creature `DAMPING` gene so creatures evolve genuinely different trajectories — gentle drifters that coast on momentum versus twitchy darters that stop the instant thrust cuts.

**Architecture:** A new tail-appended scalar gene supplies each creature's velocity-retention coefficient. `integrate()` reads it (gated by a new `evolvableDamping` config flag) in place of the global `damping` constant. The gene is always drawn from RNG regardless of the flag, so the flag is a pure read-path switch with zero determinism cost. Everything downstream (the `MAX_SPEED` clamp, `sizeSpeedExp`, walls, flow) is unchanged.

**Tech Stack:** TypeScript, Vitest, pnpm. Spec: `docs/superpowers/specs/2026-06-24-evolvable-damping-design.md`.

## Global Constraints

- **Determinism is the only invariant:** same (config, seed) → byte-identical `world.stateHash()`. There is no golden-hash backward-compat requirement (retired 2026-06-23).
- **Food-channel ablation byte-identity must hold:** the RNG draws for scalar genes 0–21 must be unchanged. The new gene lives strictly *after* them at slot 22, so this is satisfied by construction — do not reorder the enum.
- **Ship ON by default:** `evolvableDamping` default `true` (feature-default-on policy).
- **Gene range:** `DAMPING ∈ [0.6, 0.98]`, founder center `0.9` (reuses `cfg.damping`), `costKey: null`.
- **Don't touch comments/types on unrelated code.** Match surrounding style (terse domain comments).
- **Run tests from this worktree** via `npx vitest run <path>` (or `pnpm test`). `make check` is unreliable in a worktree.

---

### Task 1: Add the `DAMPING` scalar gene to the genome

**Files:**
- Modify: `src/core/genome.ts` (enum at 36–80, `SCALAR_GENE_COUNT` at 80, centerKey union at 88–108, `SCALAR_GENE_SPECS` at 135–175)
- Test: `src/core/genome.test.ts`

**Interfaces:**
- Produces: `ScalarGene.DAMPING = 22`; `SCALAR_GENE_COUNT = 23`; a new entry in `SCALAR_GENE_SPECS` at index 22 with `{ centerKey: 'damping', costKey: null, min: 0.6, max: 0.98 }`.

- [ ] **Step 1: Write the failing test**

Add to `src/core/genome.test.ts` (it already imports `ScalarGene`, `SCALAR_GENE_COUNT`, `SCALAR_GENE_SPECS`, `seedScalarGenes`, and `defaultConfig`/`makeRng` — match the existing import block; if `defaultConfig` or an `Rng` helper isn't imported in this file, add `import { defaultConfig } from './config';` and reuse the file's existing RNG construction pattern):

```typescript
describe('DAMPING gene', () => {
  it('is the 23rd scalar gene at the tail', () => {
    expect(SCALAR_GENE_COUNT).toBe(23);
    expect(ScalarGene.DAMPING).toBe(22);
  });

  it('is an uncosted physics gene clamped to [0.6, 0.98]', () => {
    const spec = SCALAR_GENE_SPECS[ScalarGene.DAMPING]!;
    expect(spec.centerKey).toBe('damping');
    expect(spec.costKey).toBeNull();
    expect(spec.min).toBe(0.6);
    expect(spec.max).toBe(0.98);
  });

  it('seeds founders around the config damping center (0.9), within clamp', () => {
    const cfg = defaultConfig({ seed: 1 });
    const genes = new Float32Array(8 * SCALAR_GENE_COUNT);
    // Reuse the file's existing RNG helper. If the file constructs an Rng inline elsewhere,
    // mirror that; the call below assumes a `makeRng(seed)` style factory already used in this test file.
    const rng = makeRng(1);
    for (let s = 0; s < 8; s++) seedScalarGenes(genes, s, rng, cfg);
    for (let s = 0; s < 8; s++) {
      const d = genes[s * SCALAR_GENE_COUNT + ScalarGene.DAMPING]!;
      expect(d).toBeGreaterThanOrEqual(0.6);
      expect(d).toBeLessThanOrEqual(0.98);
    }
  });
});
```

> NOTE: if `genome.test.ts` does not already expose a `makeRng`, look at how the existing seeding tests in this file build their `Rng` (e.g. an imported `Rng`/`splitmix` constructor) and copy that exact construction. Do not invent a new RNG API.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/genome.test.ts -t "DAMPING gene"`
Expected: FAIL — `SCALAR_GENE_COUNT` is 22 (not 23) and `ScalarGene.DAMPING` is undefined.

- [ ] **Step 3: Implement the gene**

In `src/core/genome.ts`, add the enum member after `PHERO_DEPOSIT: 21,`:

```typescript
  // Movement-style gene: per-creature velocity retention (drift ↔ dart). Read by physics.integrate when
  // cfg.evolvableDamping is on, replacing the global cfg.damping. High = coasts on momentum (drifter);
  // low = velocity dies fast (darter). Always drawn (ungated) and appended at the TAIL so genes 0–21's
  // RNG draws are unchanged → the food-channel ablation byte-identity holds.
  DAMPING: 22,
```

Update the count:

```typescript
export const SCALAR_GENE_COUNT = 23;
```

Add `'damping'` to the `centerKey` union in `ScalarGeneSpec` (after `'pheroDeposit'`):

```typescript
    | 'pheroDeposit'
    | 'damping';
```

Append the spec to `SCALAR_GENE_SPECS` after the `pheroDeposit` entry (the last current element):

```typescript
  // DAMPING — per-creature velocity retention. costKey null: the tradeoff is pure physics (coasting saves
  // thrust-energy but overshoots food/walls), not an upkeep tax. Center reuses cfg.damping (0.9); range
  // gives a ~20× coast-distance spread (1/(1−d): 0.6→~2.5 ticks, 0.98→~50). Upper bound < 1 for stability.
  { centerKey: 'damping', costKey: null, min: 0.6, max: 0.98 },
```

> `scalarGeneGatedOff` needs NO change — DAMPING falls through to its `return false` (always drawn).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/genome.test.ts -t "DAMPING gene"`
Expected: PASS (all 3 assertions).

- [ ] **Step 5: Run the full genome + world determinism suites to confirm no regression**

Run: `npx vitest run src/core/genome.test.ts src/core/world.test.ts`
Expected: PASS. The `foodChannels=3 is deterministic and diverges` test and the determinism contract still pass (DAMPING is appended after the gated tail genes, so their draws are unchanged; the absolute default-config hash shifting is expected and not asserted as a golden value).

- [ ] **Step 6: Commit**

```bash
git add src/core/genome.ts src/core/genome.test.ts
git commit -m "feat(genome): DAMPING scalar gene (per-creature velocity retention)"
```

---

### Task 2: Wire `evolvableDamping` config + read the gene in `integrate()`

**Files:**
- Modify: `src/core/config.ts` (interface near `motorSquash` at ~389; defaults near `motorSquash: false` at ~691)
- Modify: `src/core/physics.ts` (`integrate` signature at 97–107; velocity update at 111–112)
- Modify: `src/core/world.ts` (the `integrate(...)` call at 311–323)
- Test: `src/core/physics.test.ts`

**Interfaces:**
- Consumes: `ScalarGene.DAMPING`, `SCALAR_GENE_COUNT` (already imported in `physics.ts`).
- Produces: `Config.evolvableDamping: boolean` (default `true`); `integrate(..., walls, evolvableDamping = false)` — new **optional last parameter**, default `false`, so existing call sites need no change.

- [ ] **Step 1: Write the failing tests**

Add to `src/core/physics.test.ts` (it already imports `integrate`, `OrganismStore`, `setMaxSpeed`, `W`, `H`; add `import { ScalarGene, SCALAR_GENE_COUNT } from './genome';` if not already present):

```typescript
describe('evolvable per-creature damping', () => {
  // Give a creature one tick of zero force after an initial velocity, integrating only the damping decay.
  const coastVx = (dampingGene: number, evolvable: boolean): number => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.vx[i] = 10;
    s.vy[i] = 0;
    setMaxSpeed(s, i, 1e9); // don't let the clamp interfere
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DAMPING] = dampingGene;
    s.rebuildLive();
    // global damping arg = 0.9; evolvable flag decides whether the gene overrides it.
    integrate(s, 1, 0.9, true, W, H, 6, 0, null, evolvable);
    return s.vx[i]!;
  };

  it('a high-damping creature coasts faster than a low-damping one (gene drives retention)', () => {
    const drifter = coastVx(0.98, true);
    const darter = coastVx(0.6, true);
    expect(drifter).toBeCloseTo(9.8); // 10 * 0.98
    expect(darter).toBeCloseTo(6.0); // 10 * 0.6
    expect(drifter).toBeGreaterThan(darter);
  });

  it('evolvableDamping off → the gene is ignored and the global damping (0.9) applies', () => {
    expect(coastVx(0.6, false)).toBeCloseTo(9.0); // 10 * 0.9, gene 0.6 ignored
    expect(coastVx(0.98, false)).toBeCloseTo(9.0); // same — global wins
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/physics.test.ts -t "evolvable per-creature damping"`
Expected: FAIL — `integrate` ignores the 10th argument (gene not read), so the high-damping case returns 9.0 not 9.8.

- [ ] **Step 3: Add the config field + default**

In `src/core/config.ts`, add to the interface immediately after the `motorSquash: boolean;` declaration (~line 389):

```typescript
  /** Evolvable per-creature damping (drift ↔ dart): when on, integrate() reads each creature's DAMPING
   *  gene instead of the global `damping` constant. The gene is drawn from RNG regardless of this flag,
   *  so toggling it is a pure read-path switch — the determinism hash for a given seed is unaffected by
   *  the flag. ON by default (movement-style variance). */
  evolvableDamping: boolean;
```

In the defaults object, add immediately after `motorSquash: false,` (~line 691):

```typescript
    evolvableDamping: true,
```

- [ ] **Step 4: Read the gene in `integrate()`**

In `src/core/physics.ts`, add the optional parameter to the `integrate` signature (after `walls: Walls | null,`):

```typescript
  walls: Walls | null,
  evolvableDamping = false,
): void {
```

Replace the two velocity-update lines (currently `const i = liveIndices[k]!;` then the `nvx`/`nvy` lines at ~110–112) so a per-creature damping is chosen first:

```typescript
    const i = liveIndices[k]!;
    // Per-creature velocity retention when evolvableDamping is on (the DAMPING gene); else the global rate.
    const d = evolvableDamping
      ? scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DAMPING]!
      : damping;
    let nvx = (vx[i]! + forceX[i]! * dt) * d;
    let nvy = (vy[i]! + forceY[i]! * dt) * d;
```

> `scalarGenes`, `ScalarGene`, and `SCALAR_GENE_COUNT` are already destructured/imported in `physics.ts` (used by the `sizeSpeedExp` block).

- [ ] **Step 5: Pass the flag from `world.ts`**

In `src/core/world.ts`, add `cfg.evolvableDamping,` as the final argument of the `integrate(...)` call (after `this.walls,`):

```typescript
      cfg.sizeSpeedExp,
      this.walls,
      cfg.evolvableDamping,
    );
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npx vitest run src/core/physics.test.ts -t "evolvable per-creature damping"`
Expected: PASS (both tests).

- [ ] **Step 7: Run the full physics + world + config suites**

Run: `npx vitest run src/core/physics.test.ts src/core/world.test.ts src/core/config.test.ts`
Expected: PASS. Existing `integrate` calls in `physics.test.ts` are unaffected (new param defaults to `false`). The world determinism contract holds (same seed → same hash, now with the gene active by default).

- [ ] **Step 8: Commit**

```bash
git add src/core/config.ts src/core/physics.ts src/core/world.ts src/core/physics.test.ts
git commit -m "feat(physics): integrate reads per-creature DAMPING gene (evolvableDamping)"
```

---

### Task 3: Inspector parity — show the DAMPING gene

**Files:**
- Modify: `src/app/observability/inspector.ts` (the gene-row list at ~73–88)

**Interfaces:**
- Consumes: `ScalarGene.DAMPING` (file already imports `ScalarGene`), the local `g(k)` formatter.

- [ ] **Step 1: Add the gene row**

In `src/app/observability/inspector.ts`, add this row immediately after the `['gene·metabEff', g(ScalarGene.METAB_EFF)],` line:

```typescript
      ['gene·damping', g(ScalarGene.DAMPING)],
```

> The inspector has no unit test (consistent with the other untested gene rows). Parity is verified by typecheck — the row reads the same `store.scalarGenes` the sim writes.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS (no type errors). If the worktree's tsconfig path differs, use `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add src/app/observability/inspector.ts
git commit -m "feat(inspector): show the DAMPING gene row (sim/inspector parity)"
```

---

### Task 4: Headless damping-distribution probe

**Files:**
- Create: `src/headless/damping-probe.ts`
- Reference: `src/headless/run.ts` (CLI/`runHeadless` pattern), `src/headless/harness.ts` (`runHeadless`, `RunResult`, `geneMeans`)

**Interfaces:**
- Consumes: `runHeadless(config, ticks): RunResult` from `./harness`, `defaultConfig` from `../core/config`, `World` from `../core/world`, `ScalarGene`/`SCALAR_GENE_COUNT` from `../core/genome`.

This is an observation tool (no unit test — it's verified by running it and reading the output), matching the existing `life-history.ts`/`density-probe.ts` probes.

- [ ] **Step 1: Write the probe**

Create `src/headless/damping-probe.ts`:

```typescript
/**
 * Damping-distribution probe — evolves the world headless across several seeds and reports the EVOLVED
 * DAMPING gene distribution (mean / SD / min / max) per seed plus a cross-seed aggregate. Answers the
 * one open question from the evolvable-damping design: do drift AND dart strategies coexist, or does the
 * gene collapse to one end (a drifter-monoculture)? Pure observation — reads store.scalarGenes after the
 * run; zero core changes.
 *
 * Run: npx tsx src/headless/damping-probe.ts [ticks] [seeds]
 *   seeds: "5" (count 1..5) — default 5.   ticks default 8000.
 */
import { World } from '../core/world';
import { defaultConfig } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';

interface SeedStat {
  seed: number;
  pop: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
}

function dampingStats(world: World, seed: number): SeedStat {
  const { liveIndices, liveCount, scalarGenes } = world.store;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  const vals: number[] = [];
  for (let k = 0; k < liveCount; k++) {
    const d = scalarGenes[liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.DAMPING]!;
    vals.push(d);
    sum += d;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const mean = liveCount > 0 ? sum / liveCount : 0;
  let varSum = 0;
  for (const d of vals) varSum += (d - mean) ** 2;
  const sd = liveCount > 0 ? Math.sqrt(varSum / liveCount) : 0;
  return { seed, pop: liveCount, mean, sd, min: liveCount ? min : 0, max: liveCount ? max : 0 };
}

const ticks = Number(process.argv[2] ?? 8000);
const seedCount = Number(process.argv[3] ?? 5);

console.log(`=== damping probe: ${ticks} ticks × ${seedCount} seeds ===`);
console.log('seed |   pop |  mean |   sd  |  min  |  max');
const stats: SeedStat[] = [];
for (let seed = 1; seed <= seedCount; seed++) {
  const world = new World(defaultConfig({ seed }));
  for (let t = 0; t < ticks; t++) world.step();
  const s = dampingStats(world, seed);
  stats.push(s);
  console.log(
    `${String(seed).padStart(4)} | ${String(s.pop).padStart(5)} | ${s.mean.toFixed(3)} | ` +
      `${s.sd.toFixed(3)} | ${s.min.toFixed(3)} | ${s.max.toFixed(3)}`,
  );
}

const alive = stats.filter((s) => s.pop > 0);
const grandMean = alive.reduce((a, s) => a + s.mean, 0) / Math.max(1, alive.length);
const meanSd = alive.reduce((a, s) => a + s.sd, 0) / Math.max(1, alive.length);
console.log('---');
console.log(
  `aggregate (${alive.length}/${seedCount} alive): cross-seed mean ${grandMean.toFixed(3)}, ` +
    `mean within-seed SD ${meanSd.toFixed(3)}`,
);
console.log(
  meanSd < 0.03
    ? 'VERDICT: low spread → gene is collapsing toward a single strategy (monoculture risk).'
    : 'VERDICT: meaningful spread → drift/dart strategies coexist.',
);
```

> Verify `World` is constructed as `new World(config)` and stepped via `world.step()` — confirm against `src/headless/harness.ts` (`runHeadless`). If `World`'s constructor or step method differs, mirror exactly what `harness.ts` does. Likewise confirm `world.store` exposes `liveIndices`/`liveCount`/`scalarGenes` (it does — `harness.ts` reads them in `geneMeans`).

- [ ] **Step 2: Run the probe**

Run: `npx tsx src/headless/damping-probe.ts 8000 5`
Expected: a per-seed table + an aggregate line + a VERDICT. The run completes without error and population is non-zero for most seeds. Record the verdict — this is the deliverable that tells us whether a follow-up cost-coupling slice is needed.

- [ ] **Step 3: Commit**

```bash
git add src/headless/damping-probe.ts
git commit -m "feat(headless): damping-distribution probe (drift/dart coexistence)"
```

---

### Task 5: Full verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Run the whole suite**

Run: `npx vitest run`
Expected: all tests green (the pre-existing count plus the new genome + physics tests).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src --max-warnings=0`
Expected: no errors. (Per project note, the `no-unnecessary-type-assertion` rule can flake on `Float32Array[i]!` — if it fires on a line you did not change, leave it; `tsc` is the source of truth. Do not blanket `--fix`.)

- [ ] **Step 3: Headless liveness gate**

Run: `npx tsx src/headless/run.ts 5000 1 --report`
Expected: exits 0 — the world sustains births and deaths without extinction or flatline, confirming the default-on gene didn't destabilize the ecology.

- [ ] **Step 4: Determinism spot-check**

Run: `npx vitest run src/core/world.test.ts -t "byte-identical"`
Expected: PASS — same (config, seed) → identical hash with `evolvableDamping` on by default.

---

## Self-Review

**Spec coverage:**
- New `DAMPING` gene, tail slot 22, count→23, `{damping, null, 0.6, 0.98}`, always-drawn → Task 1. ✓
- `integrate()` reads gene under `evolvableDamping` flag; flag is a pure read-path switch → Task 2. ✓
- Config `evolvableDamping` default `true` → Task 2. ✓
- Inspector parity → Task 3 (verified present at inspector.ts). ✓
- Kinematic unit test (coast farther) → Task 2 Step 1. ✓
- Determinism green → Task 1 Step 5, Task 5 Step 4. ✓
- Ablation check (flag off → global damping) → Task 2 Step 1 (second test). ✓
- Headless distribution probe → Task 4. ✓
- Food-channel ablation byte-identity preserved → Global Constraints + Task 1 Step 5 (the `foodChannels=3` determinism test). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases". The two NOTEs (genome.test RNG helper, World construction) are explicit "verify against existing pattern X" instructions with the fallback named, not vague placeholders — acceptable because the exact local helper name can't be known without the file open, and the correct pattern is pinpointed.

**Type consistency:** `evolvableDamping` is `boolean` everywhere (config field, integrate param default `false`, world passes `cfg.evolvableDamping`). `ScalarGene.DAMPING`/`SCALAR_GENE_COUNT` used identically in genome, physics, inspector, probe. `integrate`'s new param is last + optional, so the existing 9-arg calls in `physics.test.ts` stay valid.
