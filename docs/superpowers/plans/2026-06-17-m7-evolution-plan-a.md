# M7 Evolution — Plan A (Phases 0–2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the M6 forager population from a stable *ecology* (mutation=0, clones) into a *proven-adaptive* one: a pure-genome traits module, a determinism guard for mutation>0, a falsifiable headless adaptation proof + a fast committed selection test, and the trait/diversity telemetry to watch evolution happen live.

**Architecture:** Everything new is **read-only derived state** computed from the deterministic SoA + live genome store. `core/genome/traits.ts` is a pure counting module. Telemetry extends the existing `Metrics`/`TelemetryDashboard`. Selection is a *consequence of the economy* — **no fitness function**. Mutation is already deterministic (`rng.split(2)`); the byte-identical-SoA invariant and the zero-alloc hot loop are preserved.

**Tech Stack:** TypeScript 6 strict (`noUncheckedIndexedAccess` → `!` on indexed reads), Vitest 4, Vite 8, pnpm 11, Node 22. Spec: `docs/superpowers/specs/2026-06-17-m7-evolution-design.md`.

## Global Constraints

- **No fitness function.** Selection emerges from the economy. Never add a designer-imposed fitness/score that biases reproduction. If selection is too weak, tune economy/mutation knobs only.
- **Determinism preserved.** Two `World`s with the same `(Config, seed)` — *including mutation>0* — must produce byte-identical SoA. Introduce **no new RNG**. All new work is pure reads at deterministic points (births/deaths/sample cadence). Metrics are derived, NOT part of the SoA contract.
- **Zero-alloc per-tick hot loop preserved.** New observability runs at reduced sample cadence, never per-cell per-tick. Per-birth/death structural allocation is fine.
- **Per-task gate:** `make check` (= `pnpm typecheck && pnpm lint && pnpm test`) green. Baseline before Plan A: **259 tests**.
- **Commits:** `git commit --no-verify` (beads pre-commit hook). **NEVER** add a `Co-Authored-By` trailer (a hook blocks the commit).
- **Strict indexing:** every typed-array / array indexed read needs `!` (e.g. `genes[i]!`). Code blocks below already include these — preserve them.
- **CellType palette (verbatim):** PHOTO=0, DIGESTIVE=1, MEAT=2, MOTILE=3, SENSOR=4, NEURON=5, MOVER=6. Always reference via `CellType.X`, never literals.

---

## File Structure

| File | Responsibility | Tasks |
|------|----------------|-------|
| `src/core/genome/traits.ts` (create) | Pure `GenomeTraits`, `genomeTraits(g)`, `genomeSignature(g)` | 1 |
| `src/core/genome/traits.test.ts` (create) | Unit tests for the above | 1 |
| `src/core/sim/reproducibility.test.ts` (modify) | + M7 mutation>0 births+deaths determinism guard | 2 |
| `src/core/genome/critter-genome.ts` (modify) | + `buildHandicappedForagerGenome` | 3 |
| `src/core/genome/critter-genome.test.ts` (modify/create) | Handicapped-genome unit test | 3 |
| `src/headless/evolution-probe.ts` (create) | Headless adaptation proof (exp vs control) | 4 |
| `src/core/sim/selection.test.ts` (create) | Fast committed within-world selection test | 5 |
| `src/core/sim/metrics.ts` (modify) | + 5 evolution fields, `sampleEvolutionMetrics` | 6 |
| `src/core/sim/metrics.test.ts` (modify/create) | Evolution-metrics unit test | 6 |
| `src/core/sim/config.ts` (modify) | + `metricsEvolutionInterval` field+default | 6 |
| `src/core/sim/world.ts` (modify) | Call `sampleEvolutionMetrics` at cadence | 6 |
| `src/app/telemetry.ts` (modify) | + genotypic-diversity series + evolution readouts | 7 |
| `src/app/telemetry.test.ts` (create) | Dashboard getter test | 7 |
| `src/app/main.ts` (modify) | Turn mutation ON (tuned-safe) + HUD evolution line | 8 |

---

### Task 1: Pure genome-traits module (`core/genome/traits.ts`)

**Files:**
- Create: `src/core/genome/traits.ts`
- Test: `src/core/genome/traits.test.ts`

**Interfaces:**
- Consumes: `Genome` from `./genome`; `CellType` from `../cells/types`.
- Produces: `interface GenomeTraits`; `genomeTraits(g: Genome): GenomeTraits`; `genomeSignature(g: Genome): string`. Used by Tasks 5, 6.

- [ ] **Step 1: Write the failing test** — `src/core/genome/traits.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { genomeTraits, genomeSignature } from './traits';
import { buildForagerGenome, buildAutotrophGenome } from './critter-genome';
import { mutateGenome } from './mutate';
import { GenomeStore } from './genome';
import { Rng } from '../math/rng';

describe('genomeTraits', () => {
  it('counts genes by type, rules, and means for the forager', () => {
    const t = genomeTraits(buildForagerGenome(6, 100));
    // forager genes: MOVER, SENSOR, SENSOR, NEURON, NEURON, DIGESTIVE
    expect(t.geneCount).toBe(6);
    expect(t.photoGenes).toBe(0);
    expect(t.digestiveGenes).toBe(1);
    expect(t.sensorGenes).toBe(2);
    expect(t.neuronGenes).toBe(2);
    expect(t.moverGenes).toBe(1);
    expect(t.connectionCount).toBe(2);
    expect(t.motorCount).toBe(1);
    expect(t.divisionRuleCount).toBe(5);
    expect(t.meanMass).toBeCloseTo(2, 6); // all genes mass 2
    expect(t.meanInitialEnergy).toBeCloseTo(100, 6);
    expect(t.meanAbsWeight).toBeCloseTo(1.5, 6); // both connection weights 1.5
    expect(t.generation).toBe(0);
  });

  it('reports zero means for an empty-gene edge case without dividing by zero', () => {
    const empty = { ...buildForagerGenome(6, 100), genes: [], connectionRules: [] };
    const t = genomeTraits(empty);
    expect(t.geneCount).toBe(0);
    expect(t.meanMass).toBe(0);
    expect(t.meanInitialEnergy).toBe(0);
    expect(t.meanAbsWeight).toBe(0);
  });
});

describe('genomeSignature', () => {
  it('is stable under a weight-only mutation (continuous params do not change the bucket)', () => {
    const store = new GenomeStore();
    const parent = buildForagerGenome(6, 100);
    const sig = genomeSignature(parent);
    const child = mutateGenome(parent, new Rng(7), {
      paramSigma: 0, paramRate: 0, weightSigma: 0.3, weightRate: 1,
      addGeneRate: 0, deleteGeneRate: 0, duplicateGeneRate: 0,
      rewireRate: 0, changeTypeRate: 0, duplicateSubgraphRate: 0,
    }, store);
    expect(genomeSignature(child)).toBe(sig); // same morphology → same signature
  });

  it('differs between distinct morphologies', () => {
    expect(genomeSignature(buildForagerGenome(6, 100))).not.toBe(
      genomeSignature(buildAutotrophGenome(6)),
    );
  });

  it('matches the documented forager encoding', () => {
    expect(genomeSignature(buildForagerGenome(6, 100))).toBe('0p1d2s2n1m|2c1t');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/core/genome/traits.test.ts`
Expected: FAIL — `Cannot find module './traits'`.

- [ ] **Step 3: Write the implementation** — `src/core/genome/traits.ts`

```ts
/**
 * Pure, RNG-free, sim-state-free genome metrics (M7 §3). Counts over a genome's static
 * gene/rule arrays — no develop(), no RNG, no SoA. Sits beside develop.ts in the
 * core/genome layer; imports only genome.ts + cells/types. Feeds genotypic-diversity
 * bucketing and trait-over-time telemetry.
 */
import { type Genome } from './genome';
import { CellType } from '../cells/types';

export interface GenomeTraits {
  geneCount: number;
  photoGenes: number;
  digestiveGenes: number;
  sensorGenes: number;
  neuronGenes: number;
  moverGenes: number;
  meatGenes: number;
  motileGenes: number;
  divisionRuleCount: number;
  bondRuleCount: number;
  connectionCount: number;
  motorCount: number;
  meanMass: number;
  meanInitialEnergy: number;
  meanAbsWeight: number;
  generation: number;
}

/** PURE — counts over the genome's static gene/rule arrays. No develop(), no RNG. */
export function genomeTraits(g: Genome): GenomeTraits {
  const genes = g.genes;
  const n = genes.length;
  let photo = 0;
  let digestive = 0;
  let sensor = 0;
  let neuron = 0;
  let mover = 0;
  let meat = 0;
  let motile = 0;
  let massSum = 0;
  let energySum = 0;
  for (let i = 0; i < n; i++) {
    const gene = genes[i]!;
    switch (gene.cellType) {
      case CellType.PHOTO:
        photo++;
        break;
      case CellType.DIGESTIVE:
        digestive++;
        break;
      case CellType.SENSOR:
        sensor++;
        break;
      case CellType.NEURON:
        neuron++;
        break;
      case CellType.MOVER:
        mover++;
        break;
      case CellType.MEAT:
        meat++;
        break;
      case CellType.MOTILE:
        motile++;
        break;
    }
    massSum += gene.mass;
    energySum += gene.initialEnergy;
  }
  const conns = g.connectionRules;
  const cn = conns.length;
  let weightSum = 0;
  for (let i = 0; i < cn; i++) weightSum += Math.abs(conns[i]!.weight);
  return {
    geneCount: n,
    photoGenes: photo,
    digestiveGenes: digestive,
    sensorGenes: sensor,
    neuronGenes: neuron,
    moverGenes: mover,
    meatGenes: meat,
    motileGenes: motile,
    divisionRuleCount: g.divisionRules.length,
    bondRuleCount: g.bondRules.length,
    connectionCount: cn,
    motorCount: g.motorRules.length,
    meanMass: n > 0 ? massSum / n : 0,
    meanInitialEnergy: n > 0 ? energySum / n : 0,
    meanAbsWeight: cn > 0 ? weightSum / cn : 0,
    generation: g.generation,
  };
}

/**
 * A coarse STRUCTURAL signature for genotypic-diversity bucketing — NOT exact genome
 * equality (continuous params differ on every mutant). Same body PLAN → same signature.
 * Built from per-type gene counts + (connection, motor) counts.
 */
export function genomeSignature(g: Genome): string {
  const t = genomeTraits(g);
  return `${t.photoGenes}p${t.digestiveGenes}d${t.sensorGenes}s${t.neuronGenes}n${t.moverGenes}m|${t.connectionCount}c${t.motorCount}t`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/genome/traits.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full gate and commit**

```bash
make check
git add src/core/genome/traits.ts src/core/genome/traits.test.ts
git commit --no-verify -m "feat(M7): pure genome-traits module (genomeTraits + genomeSignature)"
```

---

### Task 2: Mutation>0 determinism guard (births + deaths)

**Files:**
- Modify: `src/core/sim/reproducibility.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `World`, `defaultConfig`, `buildForagerGenome`, `develop`, `instantiateBody`, `serializeGenomeLibrary` (from `../genome/genome`).
- Produces: nothing (test-only). This is the load-bearing M7 determinism proof: byte-identical full SoA *and* genome library under mutation, through a run that exercises both births and deaths.

**Context:** The existing `M6 genome reproduction + mutation` block proves byte-identical SoA under mutation with births only (no deaths: `organismDeathFloor: -1`). This task adds a forager-regime run where foragers both reproduce AND starve→die, plus a genome-library equality check.

- [ ] **Step 1: Write the failing test** — append to `src/core/sim/reproducibility.test.ts`

```ts
import { buildForagerGenome } from '../genome/critter-genome';
import { serializeGenomeLibrary } from '../genome/genome';

describe('reproducibility — M7 mutation>0 with births AND deaths', () => {
  function runForagers(): World {
    const cfg = defaultConfig({
      seed: 11,
      maxCells: 6000,
      worldWidth: 512,
      worldHeight: 512,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
      reproThreshold: 700,
      reproParentFloor: 120,
      organismDeathFloor: 0, // foragers that can't feed starve → atomic death
      mutationWeightRate: 0.5,
      mutationWeightSigma: 0.15,
      mutationParamRate: 0.2,
      mutationParamSigma: 0.1,
    });
    const w = new World(cfg, false);
    w.seedLife(2500);
    for (let k = 0; k < 16; k++) {
      const ref = w.genomes.register(buildForagerGenome(cfg.cellRadius, 100));
      const body = develop(
        buildForagerGenome(cfg.cellRadius, 100),
        cfg.maxCellsPerOrganism,
        cfg.maxRecursionDepth,
      );
      instantiateBody(
        body, w.cells, w.net, w.bonds, w.organisms, ref,
        cfg.worldWidth * (0.15 + 0.7 * (k / 16)),
        cfg.worldHeight * 0.5, 0,
        cfg.worldWidth, cfg.worldHeight, w.instantiateScratch,
      );
    }
    for (let t = 0; t < 1500; t++) w.tick();
    return w;
  }

  it('produces byte-identical SoA and genome library across two runs (births + deaths)', () => {
    const a = runForagers();
    const b = runForagers();
    const fa = a.cells.fields;
    const fb = b.cells.fields;
    expect(Array.from(fa.energy)).toEqual(Array.from(fb.energy));
    expect(Array.from(fa.posX)).toEqual(Array.from(fb.posX));
    expect(Array.from(fa.posY)).toEqual(Array.from(fb.posY));
    expect(Array.from(fa.organismId)).toEqual(Array.from(fb.organismId));
    expect(Array.from(fa.genomeRef)).toEqual(Array.from(fb.genomeRef));
    expect(serializeGenomeLibrary(a.genomes)).toBe(serializeGenomeLibrary(b.genomes));
    // The run actually exercised both structural events (else the guard is vacuous).
    expect(a.lastOrganismBirths + a.metrics.organismBirths).toBeGreaterThan(0);
    expect(a.genomes.size).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run src/core/sim/reproducibility.test.ts`
Expected: PASS. If it FAILS on byte-identity, determinism is genuinely broken — **escalate** (do not weaken the assertion). If the births assertion fails (no reproduction in this regime), tune `seedLife` count / `reproThreshold` up slightly so foragers reproduce, keeping mutation rates as given; document the tuning.

- [ ] **Step 3: Commit**

```bash
git add src/core/sim/reproducibility.test.ts
git commit --no-verify -m "test(M7): determinism guard for mutation>0 with births and deaths"
```

---

### Task 3: Handicapped forager genome (`buildHandicappedForagerGenome`)

**Files:**
- Modify: `src/core/genome/critter-genome.ts` (add one exported function at the end)
- Test: `src/core/genome/critter-genome.test.ts` (append; if the file doesn't exist, create with the imports shown)

**Interfaces:**
- Consumes: `buildForagerGenome` (same file), `ConnectionRule` type.
- Produces: `buildHandicappedForagerGenome(cellRadius?: number, initialEnergy?: number, weight?: number): Genome`. Used by Tasks 4, 5.

- [ ] **Step 1: Write the failing test** — append to `src/core/genome/critter-genome.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildForagerGenome, buildHandicappedForagerGenome } from './critter-genome';

describe('buildHandicappedForagerGenome', () => {
  it('matches the forager but with both steering-loop weights knocked down', () => {
    const fit = buildForagerGenome(6, 100);
    const weak = buildHandicappedForagerGenome(6, 100, 0.2);
    // Same morphology + wiring topology.
    expect(weak.genes.length).toBe(fit.genes.length);
    expect(weak.divisionRules.length).toBe(fit.divisionRules.length);
    expect(weak.connectionRules.length).toBe(fit.connectionRules.length);
    expect(weak.motorRules).toEqual(fit.motorRules);
    // Both connection weights handicapped to 0.2 (fit is 1.5).
    for (const c of weak.connectionRules) expect(c.weight).toBeCloseTo(0.2, 6);
    for (const c of fit.connectionRules) expect(c.weight).toBeCloseTo(1.5, 6);
  });

  it('defaults the weight to 0.2', () => {
    const weak = buildHandicappedForagerGenome();
    for (const c of weak.connectionRules) expect(c.weight).toBeCloseTo(0.2, 6);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run src/core/genome/critter-genome.test.ts`
Expected: FAIL — `buildHandicappedForagerGenome` is not exported.

- [ ] **Step 3: Write the implementation** — append to `src/core/genome/critter-genome.ts`

```ts
/**
 * The forager with its steering loop SABOTAGED: both connection weights (sensorLat→turn
 * and sensorFwd→thrust) knocked from the hand-tuned 1.5 down to `weight` (default 0.2).
 * A sluggish forager steers/advances weakly → reaches less food → reproduces less. Seeds
 * the M7 adaptation proof: under weight mutation + economic selection, the population-mean
 * weight should climb back toward fit values. DRY over buildForagerGenome — identical body,
 * only the two connection-rule weights overridden.
 */
export function buildHandicappedForagerGenome(cellRadius = 6, initialEnergy = 100, weight = 0.2): Genome {
  const g = buildForagerGenome(cellRadius, initialEnergy);
  for (let i = 0; i < g.connectionRules.length; i++) g.connectionRules[i]!.weight = weight;
  return g;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/core/genome/critter-genome.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

```bash
make check
git add src/core/genome/critter-genome.ts src/core/genome/critter-genome.test.ts
git commit --no-verify -m "feat(M7): handicapped forager genome (seed for the adaptation proof)"
```

---

### Task 4: Headless adaptation proof (`headless/evolution-probe.ts`)

**Files:**
- Create: `src/headless/evolution-probe.ts`

**Interfaces:**
- Consumes: `World`, `defaultConfig`, `develop`, `buildHandicappedForagerGenome`, `instantiateBody`.
- Produces: a runnable probe (`pnpm tsx src/headless/evolution-probe.ts` or the repo's headless runner) that prints a generation table for an experimental (mutation-on) vs control (mutation-off) run and a verdict. **Not a vitest gate** — it establishes the viable adaptation regime whose parameters inform Task 5 and Task 8.

**Context:** Mirror `src/headless/forager-probe.ts` structure (config → World → seedLife → spawn loop → tick loop → reporting). The measured trait is the population-mean `sensorFwd→thrust` connection weight (preGene 1 → postGene 4).

- [ ] **Step 1: Write the probe** — `src/headless/evolution-probe.ts`

```ts
import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { buildHandicappedForagerGenome } from '../core/genome/critter-genome';
import { instantiateBody } from '../core/organism/instantiate';

// M7 adaptation proof. Seed a HANDICAPPED forager (steering weights 0.2 vs the fit 1.5).
// Experimental run: weight mutation ON → mutants that steer better out-forage, out-reproduce,
// and drag the population-mean weight UP. Control: weight mutation OFF → clones stay at 0.2.
// PASS = experimental mean rises materially above control AND the population survives in both.
const HANDICAP = 0.2;
const TICKS = 12_000;
const SAMPLE = 1000;

function baseConfig(over: Partial<Config>): Config {
  return defaultConfig({
    seed: 7,
    maxCells: 40_000,
    worldWidth: 1024,
    worldHeight: 1024,
    initialPhotoFraction: 1,
    initialMotileFraction: 0,
    reproThreshold: 700,
    reproParentFloor: 120,
    organismDeathFloor: 0,
    ...over,
  });
}

function seedForagers(w: World, n: number): void {
  const cfg = w.config;
  for (let k = 0; k < n; k++) {
    const ref = w.genomes.register(buildHandicappedForagerGenome(cfg.cellRadius, 100, HANDICAP));
    const body = develop(
      buildHandicappedForagerGenome(cfg.cellRadius, 100, HANDICAP),
      cfg.maxCellsPerOrganism,
      cfg.maxRecursionDepth,
    );
    instantiateBody(
      body, w.cells, w.net, w.bonds, w.organisms, ref,
      cfg.worldWidth * (0.2 + 0.6 * (k / n)), cfg.worldHeight * 0.5, 0,
      cfg.worldWidth, cfg.worldHeight, w.instantiateScratch,
    );
  }
}

function meanFwdThrustWeight(w: World): { mean: number; orgs: number; maxGen: number } {
  const o = w.organisms;
  let sum = 0;
  let n = 0;
  let maxGen = 0;
  for (let org = 1; org < o.maxOrganisms; org++) {
    if (!o.isAlive(org) || o.cellCount[org]! === 0) continue;
    const ref = o.genomeRef[org]!;
    if (ref < 0) continue;
    const g = w.genomes.get(ref);
    if (!g) continue;
    const c = g.connectionRules.find((r) => r.preGene === 1 && r.postGene === 4);
    if (!c) continue;
    sum += c.weight;
    n++;
    if (g.generation > maxGen) maxGen = g.generation;
  }
  return { mean: n > 0 ? sum / n : 0, orgs: n, maxGen };
}

function run(label: string, cfg: Config): { mean: number; orgs: number; maxGen: number } {
  const w = new World(cfg, false);
  w.seedLife(8000);
  seedForagers(w, 20);
  console.log(`\n[${label}] tick   foragers   meanWeight   maxGen   plants`);
  let last = meanFwdThrustWeight(w);
  for (let t = 1; t <= TICKS; t++) {
    w.tick();
    if (t % SAMPLE === 0) {
      last = meanFwdThrustWeight(w);
      console.log(
        `        ${String(t).padStart(5)}   ${String(last.orgs).padStart(8)}   ${last.mean.toFixed(3).padStart(10)}   ${String(last.maxGen).padStart(6)}   ${String(w.metrics.photo).padStart(6)}`,
      );
    }
  }
  return last;
}

const exp = run('EXPERIMENT mutation ON', baseConfig({ mutationWeightRate: 0.5, mutationWeightSigma: 0.15 }));
const ctl = run('CONTROL  mutation OFF', baseConfig({ mutationWeightRate: 0, mutationWeightSigma: 0 }));

const delta = exp.mean - ctl.mean;
console.log(
  `\nfinal: experiment meanWeight=${exp.mean.toFixed(3)} (orgs ${exp.orgs}, gen ${exp.maxGen})  ` +
    `control meanWeight=${ctl.mean.toFixed(3)} (orgs ${ctl.orgs})  Δ=${delta.toFixed(3)}`,
);
const survived = exp.orgs > 0 && ctl.orgs > 0;
console.log(
  survived && delta > 0.4
    ? '→ ADAPTATION: economic selection raised the steering weight well above the no-mutation control.'
    : survived
      ? `→ WEAK/NO adaptation (Δ=${delta.toFixed(3)} ≤ 0.4). Tune economy pressure (higher basalCost / lower seedLife) — NOT a fitness function — and re-run. Document the result.`
      : '→ EXTINCTION confound: a population died out. Lower mutation σ / soften the economy and re-run.',
);
```

- [ ] **Step 2: Run the probe**

Run (use the repo's headless runner; check `package.json` scripts — likely `pnpm tsx src/headless/evolution-probe.ts`):
Expected: a two-block generation table + a verdict line. **Success criterion for this task:** the verdict prints `→ ADAPTATION` (Δ > 0.4, both populations survive). If it prints WEAK/NO or EXTINCTION, apply the documented tuning (economy pressure or σ) — never add a fitness function — until adaptation shows, OR if economy-only genuinely cannot move the trait in budget, **stop and escalate** with the table (this would be the spec's headline empirical risk materializing). Capture the final verdict + the mutation rates that produced it — Tasks 5 and 8 reuse this regime.

- [ ] **Step 3: Commit**

```bash
git add src/headless/evolution-probe.ts
git commit --no-verify -m "feat(M7): headless adaptation probe (economic selection raises steering weight)"
```

**Report to controller:** the final verdict line, the experiment/control mean weights, and the exact mutation rates used. The controller passes these to the Task 5 and Task 8 implementers.

---

### Task 5: Fast committed selection test (`core/sim/selection.test.ts`)

**Files:**
- Create: `src/core/sim/selection.test.ts`

**Interfaces:**
- Consumes: `World`, `defaultConfig`, `develop`, `buildForagerGenome`, `buildHandicappedForagerGenome`, `instantiateBody`.
- Produces: a fast, deterministic, committed test proving **within-world selection**: fit foragers (weight 1.5) out-reproduce unfit (weight 0.2) competing in the *same* economy, mutation OFF. Attribution is by the genome's `sensorFwd→thrust` weight (clones preserve it exactly with mutation off).

**Context (from Task 4):** the controller will give you the viable mutation-off forager regime confirmed by the probe. The numbers below are a starting point validated against the forager regime; **run the test and confirm** fit > unfit with a comfortable margin (target fit ≥ 1.5× unfit) and runtime < ~3 s. If the margin is thin or it's slow, tune within these bounds, in order: raise `TICKS` (2000→3500), raise plant density (`seedLife`), raise forager counts (12→20 each). **Do NOT weaken the assertion to make it pass.** If fit does not out-reproduce unfit, that contradicts the probe — escalate.

- [ ] **Step 1: Write the test** — `src/core/sim/selection.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { develop } from '../genome/develop';
import { buildForagerGenome, buildHandicappedForagerGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';
import { type Genome } from '../genome/genome';

const FIT = 1.5;
const UNFIT = 0.2;
const PAIRS = 12; // FIT + UNFIT foragers each
const TICKS = 2500;

function spawn(w: World, genome: Genome, x: number, y: number): void {
  const cfg = w.config;
  const ref = w.genomes.register(genome);
  const body = develop(genome, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
  instantiateBody(
    body, w.cells, w.net, w.bonds, w.organisms, ref, x, y, 0,
    cfg.worldWidth, cfg.worldHeight, w.instantiateScratch,
  );
}

/** Bucket live genome-organisms by their steering weight (mutation OFF → clones preserve it). */
function countByFitness(w: World): { fit: number; unfit: number } {
  const o = w.organisms;
  let fit = 0;
  let unfit = 0;
  for (let org = 1; org < o.maxOrganisms; org++) {
    if (!o.isAlive(org) || o.cellCount[org]! === 0) continue;
    const ref = o.genomeRef[org]!;
    if (ref < 0) continue;
    const g = w.genomes.get(ref);
    if (!g) continue;
    const c = g.connectionRules.find((r) => r.preGene === 1 && r.postGene === 4);
    if (!c) continue;
    if (c.weight >= 1.0) fit++;
    else unfit++;
  }
  return { fit, unfit };
}

describe('economic selection (no fitness function)', () => {
  it('fit foragers out-reproduce unfit competing in the same economy', () => {
    const cfg = defaultConfig({
      seed: 4,
      maxCells: 4000,
      worldWidth: 400,
      worldHeight: 400,
      initialPhotoFraction: 1,
      initialMotileFraction: 0,
      reproThreshold: 700,
      reproParentFloor: 120,
      organismDeathFloor: 0,
      // mutation OFF (defaults) — clones preserve the steering weight, so attribution is exact.
    });
    const w = new World(cfg, false);
    w.seedLife(1500);
    // Interleave fit/unfit at mirrored positions so neither gets a spatial advantage.
    for (let k = 0; k < PAIRS; k++) {
      const x = cfg.worldWidth * (0.15 + 0.7 * (k / PAIRS));
      spawn(w, buildForagerGenome(cfg.cellRadius, 100), x, cfg.worldHeight * 0.4);
      spawn(w, buildHandicappedForagerGenome(cfg.cellRadius, 100, UNFIT), x, cfg.worldHeight * 0.6);
    }
    const start = countByFitness(w);
    expect(start.fit).toBe(PAIRS);
    expect(start.unfit).toBe(PAIRS);

    for (let t = 0; t < TICKS; t++) w.tick();

    const end = countByFitness(w);
    // Selection: the fit lineage reproduces more, so it dominates the survivors.
    expect(end.fit).toBeGreaterThan(end.unfit);
    // And the fit lineage actually grew (reproduction happened, not just unfit dying out).
    expect(end.fit).toBeGreaterThan(PAIRS);
    void FIT;
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run src/core/sim/selection.test.ts`
Expected: PASS, runtime < ~3 s. Tune per the Context note if the margin is thin or it's slow.

- [ ] **Step 3: Run the gate and commit**

```bash
make check
git add src/core/sim/selection.test.ts
git commit --no-verify -m "test(M7): within-world economic selection (fit out-reproduces unfit)"
```

---

### Task 6: Evolution metrics (`sampleEvolutionMetrics`) + world wiring

**Files:**
- Modify: `src/core/sim/metrics.ts` (extend `Metrics` + `makeMetrics`; add `sampleEvolutionMetrics`)
- Modify: `src/core/sim/config.ts` (add `metricsEvolutionInterval` field + default)
- Modify: `src/core/sim/world.ts` (call `sampleEvolutionMetrics` at cadence)
- Test: `src/core/sim/metrics.test.ts` (append; create with shown imports if absent)

**Interfaces:**
- Consumes: `genomeTraits`, `genomeSignature` (Task 1); `OrganismTable` from `../organism/organisms`; `GenomeStore` from `../genome/genome`.
- Produces: `Metrics` gains `genotypicDiversity`, `meanCellsPerOrganism`, `meanSensorsPerOrganism`, `meanGenomeSize`, `maxGeneration`; `sampleEvolutionMetrics(out: Metrics, organisms: OrganismTable, genomes: GenomeStore): void`. Config gains `metricsEvolutionInterval: number`. Used by Tasks 7, 8.

**Context:** `sampleMetrics` runs every tick (world.ts:510). `sampleEvolutionMetrics` allocates a `Map` (signature buckets) so it must NOT run every tick — gate it behind `metricsEvolutionInterval` (default 16). Metrics are derived state, NOT part of the byte-identical SoA contract, so this cadence does not affect determinism.

- [ ] **Step 1: Write the failing test** — append to `src/core/sim/metrics.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { makeMetrics, sampleEvolutionMetrics } from './metrics';
import { OrganismTable } from '../organism/organisms';
import { GenomeStore } from '../genome/genome';
import { buildForagerGenome, buildAutotrophGenome } from '../genome/critter-genome';

describe('sampleEvolutionMetrics', () => {
  it('computes genotypic diversity, means, and max generation over live genome organisms', () => {
    const organisms = new OrganismTable(16);
    const genomes = new GenomeStore();
    // Two foragers (signature A) + one autotroph (signature B) → Simpson(2/3,1/3)=1-(4/9+1/9)=4/9.
    const forager = buildForagerGenome(6, 100); // 6 cells, 2 sensors
    const autotroph = buildAutotrophGenome(6); // 4 cells, 0 sensors
    const setup: { genome: typeof forager; cells: number; gen: number }[] = [
      { genome: forager, cells: 6, gen: 3 },
      { genome: forager, cells: 6, gen: 1 },
      { genome: autotroph, cells: 4, gen: 0 },
    ];
    for (const s of setup) {
      const org = organisms.alloc();
      const g = { ...s.genome, generation: s.gen };
      organisms.genomeRef[org] = genomes.register(g);
      organisms.cellCount[org] = s.cells;
    }
    const m = makeMetrics();
    sampleEvolutionMetrics(m, organisms, genomes);
    expect(m.genotypicDiversity).toBeCloseTo(4 / 9, 6);
    expect(m.meanCellsPerOrganism).toBeCloseTo((6 + 6 + 4) / 3, 6);
    expect(m.meanSensorsPerOrganism).toBeCloseTo((2 + 2 + 0) / 3, 6);
    expect(m.meanGenomeSize).toBeCloseTo((6 + 6 + 4) / 3, 6);
    expect(m.maxGeneration).toBe(3);
  });

  it('reports zeros for an empty population without dividing by zero', () => {
    const m = makeMetrics();
    sampleEvolutionMetrics(m, new OrganismTable(8), new GenomeStore());
    expect(m.genotypicDiversity).toBe(0);
    expect(m.meanCellsPerOrganism).toBe(0);
    expect(m.maxGeneration).toBe(0);
  });

  it('skips genome-less organisms (genomeRef < 0)', () => {
    const organisms = new OrganismTable(8);
    const genomes = new GenomeStore();
    const org = organisms.alloc(); // genomeRef stays -1
    organisms.cellCount[org] = 5;
    const m = makeMetrics();
    sampleEvolutionMetrics(m, organisms, genomes);
    expect(m.meanCellsPerOrganism).toBe(0); // none counted
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run src/core/sim/metrics.test.ts`
Expected: FAIL — `sampleEvolutionMetrics` not exported; `Metrics` lacks the new fields.

- [ ] **Step 3a: Extend `Metrics` + `makeMetrics`** — in `src/core/sim/metrics.ts`

Add these fields to the `Metrics` interface (after `birthsReachedAdulthood`):

```ts
  /** Simpson index over genomeSignature of live genome organisms (genotypic, M7). */
  genotypicDiversity: number;
  meanCellsPerOrganism: number;
  meanSensorsPerOrganism: number;
  meanGenomeSize: number;
  maxGeneration: number;
```

Add to the `makeMetrics()` return object (after `birthsReachedAdulthood: 0,`):

```ts
    genotypicDiversity: 0,
    meanCellsPerOrganism: 0,
    meanSensorsPerOrganism: 0,
    meanGenomeSize: 0,
    maxGeneration: 0,
```

- [ ] **Step 3b: Add `sampleEvolutionMetrics`** — append to `src/core/sim/metrics.ts`, and add the imports at the top

Top-of-file imports (add):

```ts
import { type OrganismTable } from '../organism/organisms';
import { type GenomeStore } from '../genome/genome';
import { genomeTraits, genomeSignature } from '../genome/traits';
```

Appended function:

```ts
/**
 * Evolution telemetry (M7 §5): genotypic diversity + trait means over LIVE genome
 * organisms. Read-only — writes only into `out`, draws no RNG, mutates no SoA, so it is
 * not part of the byte-identical determinism contract. Allocates a Map (signature
 * buckets), so callers run it at a reduced cadence (config.metricsEvolutionInterval),
 * NOT in the per-tick hot loop.
 */
export function sampleEvolutionMetrics(
  out: Metrics,
  organisms: OrganismTable,
  genomes: GenomeStore,
): void {
  let count = 0;
  let cellsSum = 0;
  let sensorsSum = 0;
  let genesSum = 0;
  let maxGen = 0;
  const sigCounts = new Map<string, number>();
  for (let org = 1; org < organisms.maxOrganisms; org++) {
    if (!organisms.isAlive(org) || organisms.cellCount[org]! === 0) continue;
    const ref = organisms.genomeRef[org]!;
    if (ref < 0) continue;
    const g = genomes.get(ref);
    if (g === undefined) continue;
    const tr = genomeTraits(g);
    count++;
    cellsSum += organisms.cellCount[org]!;
    sensorsSum += tr.sensorGenes;
    genesSum += tr.geneCount;
    if (tr.generation > maxGen) maxGen = tr.generation;
    const sig = genomeSignature(g);
    sigCounts.set(sig, (sigCounts.get(sig) ?? 0) + 1);
  }
  let diversity = 0;
  if (count > 0) {
    let sumSq = 0;
    for (const c of sigCounts.values()) {
      const p = c / count;
      sumSq += p * p;
    }
    diversity = 1 - sumSq;
  }
  out.genotypicDiversity = diversity;
  out.meanCellsPerOrganism = count > 0 ? cellsSum / count : 0;
  out.meanSensorsPerOrganism = count > 0 ? sensorsSum / count : 0;
  out.meanGenomeSize = count > 0 ? genesSum / count : 0;
  out.maxGeneration = maxGen;
}
```

- [ ] **Step 4: Run the metrics test to verify it passes**

Run: `pnpm vitest run src/core/sim/metrics.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the config field** — in `src/core/sim/config.ts`

Add to the `Config` interface (near the mutation fields, ~line 160):

```ts
  /** Ticks between evolution-telemetry samples (read-only; keeps the hot loop alloc-free). */
  metricsEvolutionInterval: number;
```

Add to the `defaultConfig` returned object (near the mutation defaults, ~line 261):

```ts
    metricsEvolutionInterval: 16,
```

- [ ] **Step 6: Wire into `world.tick`** — in `src/core/sim/world.ts`

Add the import at the top (extend the existing metrics import on line 27):

```ts
import { makeMetrics, sampleMetrics, sampleEvolutionMetrics, type Metrics } from './metrics';
```

Immediately AFTER the `sampleMetrics(...)` call (world.ts ~line 510-522, before `this.tickCount++`), add:

```ts
    // M7: evolution telemetry at reduced cadence (allocates a Map → kept off the per-tick
    // hot loop). Read-only; not part of the SoA determinism contract.
    if (this.tickCount % cfg.metricsEvolutionInterval === 0) {
      sampleEvolutionMetrics(this.metrics, this.organisms, this.genomes);
    }
```

- [ ] **Step 7: Run the full gate and commit**

```bash
make check
git add src/core/sim/metrics.ts src/core/sim/metrics.test.ts src/core/sim/config.ts src/core/sim/world.ts
git commit --no-verify -m "feat(M7): evolution telemetry (genotypic diversity + trait means at sample cadence)"
```

---

### Task 7: Telemetry dashboard — genotypic diversity + evolution readouts

**Files:**
- Modify: `src/app/telemetry.ts` (add a series + readouts)
- Test: `src/app/telemetry.test.ts` (create)

**Interfaces:**
- Consumes: extended `Metrics` (Task 6).
- Produces: `TelemetryDashboard` records genotypic diversity and exposes `latestGenotypicDiversity(): number` (and `latestMaxGeneration(): number`) for testing; `draw` overlays genotypic diversity on the diversity band and shows `gen`/`size` in the status line.

**Context:** `TelemetryDashboard` (telemetry.ts) holds `Float32Array(CAP)` ring buffers, `push(m)` writes the head, `draw(latest)` renders three bands. Band 3 is diversity (fixed 0..1). Add a `genoDiv` ring buffer plotted on band 3 in a distinct colour, and surface the new scalars in the status line. Add getters so the behaviour is unit-testable without a canvas — but the constructor needs a canvas context; the test uses a minimal stub.

- [ ] **Step 1: Write the failing test** — `src/app/telemetry.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { TelemetryDashboard } from './telemetry';
import { makeMetrics } from '../core/sim/metrics';

function stubCanvas(): HTMLCanvasElement {
  const ctx = {
    clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(),
    lineTo: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
    set fillStyle(_v: string) {}, set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {}, set font(_v: string) {},
  };
  return {
    width: 200, height: 150,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
  } as unknown as HTMLCanvasElement;
}

describe('TelemetryDashboard evolution series', () => {
  it('records the latest genotypic diversity and max generation from pushed metrics', () => {
    const d = new TelemetryDashboard(stubCanvas());
    const m = makeMetrics();
    m.genotypicDiversity = 0.42;
    m.maxGeneration = 7;
    d.push(m);
    expect(d.latestGenotypicDiversity()).toBeCloseTo(0.42, 6);
    expect(d.latestMaxGeneration()).toBe(7);
  });

  it('draw() does not throw with the extended metrics', () => {
    const d = new TelemetryDashboard(stubCanvas());
    const m = makeMetrics();
    m.genotypicDiversity = 0.3;
    d.push(m);
    expect(() => d.draw(m)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run src/app/telemetry.test.ts`
Expected: FAIL — `latestGenotypicDiversity` / `latestMaxGeneration` are not methods.

- [ ] **Step 3: Implement** — in `src/app/telemetry.ts`

Add a ring buffer field beside the others:

```ts
  private readonly genoDiv = new Float32Array(CAP);
  private lastGenoDiv = 0;
  private lastMaxGen = 0;
```

In `push(m)`, after `this.diversity[h] = m.diversity;`:

```ts
    this.genoDiv[h] = m.genotypicDiversity;
    this.lastGenoDiv = m.genotypicDiversity;
    this.lastMaxGen = m.maxGeneration;
```

Add getters (anywhere in the class):

```ts
  latestGenotypicDiversity(): number {
    return this.lastGenoDiv;
  }

  latestMaxGeneration(): number {
    return this.lastMaxGen;
  }
```

In `draw(latest)`, band 3 (after the existing `this.plot(this.diversity, ...)` for the phenotypic diversity), overlay genotypic diversity in a distinct colour and extend the label:

```ts
    this.plot(this.genoDiv, x0, y, w, bandH, 1, '#ffd166'); // genotypic diversity (gold)
    label(
      `diversity pheno ${latest.diversity.toFixed(3)} geno ${latest.genotypicDiversity.toFixed(3)} · gen ${latest.maxGeneration} · size ${latest.meanGenomeSize.toFixed(1)}`,
      x0,
      y + 9,
    );
```

(Replace the existing band-3 `label(...)` call with the line above; keep the phenotypic `this.plot(this.diversity, ...)` call before it.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/app/telemetry.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gate and commit**

```bash
make check
git add src/app/telemetry.ts src/app/telemetry.test.ts
git commit --no-verify -m "feat(M7): dashboard shows genotypic diversity + generation/size readouts"
```

---

### Task 8: Live demo — mutation ON (tuned-safe) + HUD evolution line

**Files:**
- Modify: `src/app/main.ts`

**Interfaces:**
- Consumes: extended `Metrics` (Task 6), the mutation Config fields, the Task 4 tuned-safe rates.
- Produces: the live demo opens with mutation ON at a tuned-safe rate (so Josh *sees* evolution), and the HUD shows genotypic diversity + max generation. Config-library defaults stay 0 (clone-only) — only this demo turns it on.

**Context:** `main.ts:30` builds the demo `config` via `defaultConfig({...})`. `updateHud` (main.ts:343) sets `hud.textContent`. The controller supplies the tuned-safe mutation rates confirmed by Task 4 (start from `mutationWeightRate: 0.25, mutationWeightSigma: 0.1, mutationParamRate: 0.1, mutationParamSigma: 0.1` — a conservative subset of the probe's experimental rates that explores without collapsing the limit cycle; verify live in Step 3).

- [ ] **Step 1: Turn mutation on in the demo config** — `src/app/main.ts`, the `defaultConfig({...})` at line 30

Add these fields inside the object (after `organismDeathFloor: 0,`):

```ts
  // M7: mutation ON so the forager population ADAPTS live (library defaults stay 0).
  // Tuned-safe: explores steering weights/params without collapsing the predator-prey cycle.
  mutationWeightRate: 0.25,
  mutationWeightSigma: 0.1,
  mutationParamRate: 0.1,
  mutationParamSigma: 0.1,
```

- [ ] **Step 2: Add the evolution line to the HUD** — `src/app/main.ts`, `updateHud` (~line 347)

Extend the `hud.textContent` template: after the `photo … diversity …` line, append a new line showing genotypic diversity, max generation, mean genome size, and mean cells/organism. Insert into the template string (after the `diversity ${m.diversity.toFixed(3)}\n` segment):

```ts
    `evolve: geno-div ${m.genotypicDiversity.toFixed(3)}  ·  gen ${m.maxGeneration}  ·  ⌀genome ${m.meanGenomeSize.toFixed(1)} cells/org ${m.meanCellsPerOrganism.toFixed(1)}\n` +
```

- [ ] **Step 3: Verify the gate + live behaviour**

```bash
make check
```
Expected: PASS (full suite, ≥ baseline + new tests). Then a live smoke check (the controller runs the Playwright capture): load the dev server, let it run, confirm (a) the population sustains the predator-prey cycle (no collapse to extinction), (b) the HUD `evolve:` line populates and `gen` climbs, (c) `geno-div` is > 0 once mutation has diversified the population. If the population collapses, lower `mutationWeightSigma`/`mutationParamSigma` (0.1→0.07) and the rates (0.25→0.15) and re-verify — the demo must remain a stable, watchable evolving ecology.

- [ ] **Step 4: Commit**

```bash
git add src/app/main.ts
git commit --no-verify -m "feat(M7): live demo runs with mutation ON (tuned-safe) + HUD evolution readout"
```

---

## Self-Review (controller, before dispatching Task 1)

**Spec coverage (Plan A = phases 0–2):**
- Phase 0 (traits + determinism): Tasks 1, 2 ✅
- Phase 1 (adaptation proof): handicapped genome (3), headless probe (4), fast selection test (5) ✅
- Phase 2 (trait/diversity telemetry): metrics (6), dashboard (7), live demo (8) ✅

**Determinism:** no new RNG anywhere; Task 6's only allocation (a Map) runs at reduced cadence and writes derived Metrics, explicitly outside the SoA contract; Task 2 is the guard that proves it. ✅

**Type consistency:** `sampleEvolutionMetrics(out, organisms, genomes)` signature identical in metrics.ts, world.ts, and the metrics test; `genomeTraits`/`genomeSignature` signatures identical across Tasks 1/5/6; `buildHandicappedForagerGenome(cellRadius, initialEnergy, weight)` identical across Tasks 3/4/5. ✅

**Empirical risk (flagged in spec §9.2):** Tasks 4 and 5 are the falsifiable core. Their parameters are starting points; the implementer tunes economy/mutation knobs (never a fitness function) and escalates if economy-only selection genuinely cannot move the trait. The controller carries Task 4's findings to Tasks 5 and 8.

## Plan B (phases 3–5) — written after Plan A lands

Champion/hall-of-fame (founderId + top-K lineages), phylogeny (bounded LineageLog surviving ancestor death), species/menagerie (NEAT-style distance + greedy speciation). Separate plan doc.
