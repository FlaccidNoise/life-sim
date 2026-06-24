# Sexual Reproduction + Emergent Speciation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace asexual clone-and-mutate with sexual reproduction (offspring = crossover of two parents + mutation), gate breeding on a genetic-compatibility check so divergent populations can't interbreed (emergent species), and add display/preference genes (sexual selection).

**Architecture:** A satiated creature enters a time-boxed SEEKING state, wanders (existing behaviour) with a sight pull toward similar-looking creatures, and mates on contact with a genetically-compatible partner — turning the rare 2-body coincidence into a search-over-time (the feasibility probe showed instantaneous local mating crashes births ~25× at 8192²). Crossover/compatibility/seeking live in `genome.ts` + `economy.ts`; the seek steer in `sense.ts`. The brain is inherited from the mother behind a modular `crossoverBrain()` seam (a separate session is changing the NN topology), and the mate-seek signal is behind a seam for the separate kin-scent field.

**Tech Stack:** TypeScript (strict), data-oriented SoA core, Vitest. Run tests with `NODE_OPTIONS=--expose-gc npx vitest run`. Typecheck `npx tsc --noEmit`, lint `npx eslint .`. `make` fails in a worktree — run npx directly.

## Global Constraints

- **Determinism is the ONLY invariant:** same `(config, seed)` → byte-identical run-to-run (`world.test.ts`). RNG consumed ONLY at reproduction, in ascending live-slot order. Seeking entry/exit, mate scan, compatibility, and mate choice are RNG-free.
- **On-by-default policy** (`feature-default-on-policy.md`): ship `sexualReproduction: true`. Do NOT write byte-identical-when-off tests or draw-skip gating for the new genes. Keep the toggle for ablation only.
- **Don't add comments/types to code you didn't change.** Match surrounding style.
- **Commit message hook BLOCKS `Co-Authored-By`** — omit that trailer.
- Bead: `life-sim-xa90` (already `in_progress`). Tests baseline before this plan: **313 passed**.
- Spec: `docs/superpowers/specs/2026-06-23-sexual-reproduction-speciation-design.md`.

---

### Task 1: New genes DISPLAY + PREFERENCE (genome layout → 26)

**Files:**
- Modify: `src/core/genome.ts` (ScalarGene enum ~36-79, SCALAR_GENE_COUNT line 80, SCALAR_GENE_SPECS ~135-175, ScalarGeneSpec centerKey union ~88-108)
- Modify: `src/core/config.ts` (Config interface — add `display`/`preference`; defaultConfig return — add values)
- Modify: `src/core/world.test.ts:24` (re-pin the golden hash)
- Test: `src/core/genome.test.ts`

**Interfaces:**
- Produces: `ScalarGene.DISPLAY = 24`, `ScalarGene.PREFERENCE = 25`, `SCALAR_GENE_COUNT = 26`. Config gains `display: number`, `preference: number` (founder centers, 0.5).

- [ ] **Step 1: Write the failing test**

In `src/core/genome.test.ts`, inside `describe('genome', …)`, add:

```ts
it('DISPLAY and PREFERENCE are seeded in range and counted', () => {
  expect(SCALAR_GENE_COUNT).toBe(26);
  expect(ScalarGene.DISPLAY).toBe(24);
  expect(ScalarGene.PREFERENCE).toBe(25);
  const cfg = defaultConfig({ seed: 1 });
  const genes = new Float32Array(8 * SCALAR_GENE_COUNT);
  const rng = new Rng(1);
  for (let s = 0; s < 8; s++) seedScalarGenes(genes, s, rng, cfg);
  for (let s = 0; s < 8; s++) {
    const d = genes[s * SCALAR_GENE_COUNT + ScalarGene.DISPLAY]!;
    const p = genes[s * SCALAR_GENE_COUNT + ScalarGene.PREFERENCE]!;
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  }
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/genome.test.ts -t "DISPLAY and PREFERENCE"`
Expected: FAIL (`SCALAR_GENE_COUNT` is 24, `ScalarGene.DISPLAY` is undefined).

- [ ] **Step 3: Add the genes in `genome.ts`**

In the `ScalarGene` object, after `PHERO_DEPOSIT: 21,` and the existing age genes `MATURITY_AGE: 22,` / `SENESCENCE_AGE: 23,`, append:

```ts
  // Sexual-selection genes (life-sim-xa90): a pure mate signal + the preference for it. Heritable, 0..1.
  // DISPLAY drives a render cue and is what mates are chosen on; PREFERENCE is the display value this
  // creature finds attractive. Neither is an ecological/species axis, so geneticDistance weights them 0.
  DISPLAY: 24,
  PREFERENCE: 25,
```

Change `export const SCALAR_GENE_COUNT = 24;` → `26`.

In the `ScalarGeneSpec.centerKey` union type, add `| 'display' | 'preference'`.

In `SCALAR_GENE_SPECS`, after the `senescenceAge` entry (the last one, index 23), append (order MUST match the enum):

```ts
  // Sexual-selection genes — costKey null (no upkeep in v1; DISPLAY's "cost" is being conspicuous to mates).
  { centerKey: 'display', costKey: null, min: 0, max: 1 },
  { centerKey: 'preference', costKey: null, min: 0, max: 1 },
```

- [ ] **Step 4: Add config centers in `config.ts`**

In the `Config` interface, near the other gene centers (after `senescenceAgeCost`), add:

```ts
  /** DISPLAY gene founder CENTER (sexual-selection ornament, 0..1). */
  display: number;
  /** PREFERENCE gene founder CENTER (preferred DISPLAY value, 0..1). */
  preference: number;
```

In `defaultConfig`'s return, near `maturityAge`/`senescenceAge`, add:

```ts
    display: 0.5,
    preference: 0.5,
```

- [ ] **Step 5: Run the new test — verify it passes**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/genome.test.ts -t "DISPLAY and PREFERENCE"`
Expected: PASS.

- [ ] **Step 6: Re-pin the golden hash (it intentionally changed)**

The 2 new always-drawn genes shift the seed RNG stream, so `world.test.ts:24`'s constant `'a32e9375'` is now stale. Compute the new value:

Run:
```bash
NODE_OPTIONS=--expose-gc npx tsx -e "import {World} from './src/core/world.ts'; import {defaultConfig} from './src/core/config.ts'; const w=new World(defaultConfig({seed:3})); for(let t=0;t<1000;t++) w.step(); console.log(w.stateHash());"
```
Copy the printed 8-hex hash. In `src/core/world.test.ts:24`, replace `'a32e9375'` with the new hash, and update the test's comment block (lines ~16-23) to reflect the new reality:

```ts
  it('default-config determinism pin: stable hash after 1000 ticks', () => {
    // Re-pinned constant (life-sim-xa90): the default config now includes on-by-default features
    // (incl. the sexual-repro genes), so it is no longer byte-identical to the pre-feature engine. This
    // pin still fails LOUDLY on any UNINTENDED RNG reorder; recompute deliberately when the genome layout
    // changes. The real invariant (same seed → same hash run-to-run) is the test above.
    const w = new World(defaultConfig({ seed: 3 }));
    for (let t = 0; t < 1000; t++) w.step();
    expect(w.stateHash()).toBe('<NEW_HASH>');
  });
```

- [ ] **Step 7: Run the full suite — verify still green**

Run: `NODE_OPTIONS=--expose-gc npx vitest run`
Expected: PASS (314 — the original 313 plus the new genome test). If any OTHER test fails on a literal hash, it was relying on the byte stream; update it the same way (recompute + re-pin). No such case is expected (only `world.test.ts:24` holds a literal hash).

- [ ] **Step 8: Commit**

```bash
git add src/core/genome.ts src/core/config.ts src/core/genome.test.ts src/core/world.test.ts
git commit -m "feat(genome): add DISPLAY + PREFERENCE sexual-selection genes (count 24->26)"
```

---

### Task 2: `geneticDistance` + `brainDistance` stub

**Files:**
- Modify: `src/core/genome.ts` (append two exported functions)
- Test: `src/core/genome.test.ts`

**Interfaces:**
- Consumes: `SCALAR_GENE_COUNT`, `SCALAR_GENE_SPECS`, `ScalarGene`, `Config` (`mateDietWeight`).
- Produces:
  - `geneticDistance(genes: Float32Array, a: number, b: number, cfg: Config): number` — normalised L2 over ecological genes 0–23, DIET weighted by `cfg.mateDietWeight`, DISPLAY/PREFERENCE weighted 0, plus `brainDistance` (0 in v1).
  - `brainDistance(_brain: Float32Array, _a: number, _b: number): number` — returns 0 (modular seam for after the NN topology change).

> Note: `geneticDistance` reads `cfg.mateDietWeight`, added in Task 5. To keep this task runnable standalone, this task's test passes a config that already provides it via `defaultConfig({ mateDietWeight: 5 })` — but `mateDietWeight` doesn't exist until Task 5. **Therefore add the single config field `mateDietWeight` here** (interface + default `5`) so this task is self-contained; Task 5 adds the remaining knobs. (Folding one field into the task that first needs it.)

- [ ] **Step 1: Add `mateDietWeight` to config**

In `src/core/config.ts` Config interface (near the gene centers): `/** DIET up-weight in the mate genetic-distance metric (predator/prey isolation). */ mateDietWeight: number;`
In `defaultConfig` return: `mateDietWeight: 5,`

- [ ] **Step 2: Write the failing test**

In `src/core/genome.test.ts`:

```ts
it('geneticDistance: 0 for identical, symmetric, DIET-dominated, display-blind', () => {
  const cfg = defaultConfig({ mateDietWeight: 5 });
  const N = SCALAR_GENE_COUNT;
  const genes = new Float32Array(4 * N);
  // slot 0 and 1 identical grazers; slot 2 = grazer differing only in DISPLAY; slot 3 = predator (DIET 1).
  for (let s = 0; s < 4; s++) {
    genes[s * N + ScalarGene.DIET] = 0;
    genes[s * N + ScalarGene.MAX_SPEED] = 5;
  }
  genes[2 * N + ScalarGene.DISPLAY] = 1; // only the sexual axis differs
  genes[3 * N + ScalarGene.DIET] = 1; // predator
  expect(geneticDistance(genes, 0, 1, cfg)).toBe(0);
  expect(geneticDistance(genes, 0, 1, cfg)).toBe(geneticDistance(genes, 1, 0, cfg)); // symmetric
  expect(geneticDistance(genes, 0, 2, cfg)).toBe(0); // DISPLAY weighted 0 → same species
  expect(geneticDistance(genes, 0, 3, cfg)).toBeGreaterThan(2); // predator vs prey ≫ threshold (~0.6)
});
```

Add `geneticDistance` to the genome import in the test file.

- [ ] **Step 3: Run it — verify it fails**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/genome.test.ts -t "geneticDistance"`
Expected: FAIL (`geneticDistance` not exported).

- [ ] **Step 4: Implement in `genome.ts`** (append after `geneUpkeep`)

```ts
/** Brain contribution to genetic distance. v1 returns 0 — a modular seam: when the NN topology change
 *  lands, this becomes a real per-weight distance without touching geneticDistance's callers. */
export function brainDistance(_brain: Float32Array, _a: number, _b: number): number {
  return 0;
}

/** Genetic distance between two creatures: normalised L2 over the ECOLOGICAL scalar genes (DIET up-
 *  weighted by cfg.mateDietWeight so trophic role dominates → predator/prey reproductive isolation falls
 *  out of the metric). DISPLAY/PREFERENCE are sexual-selection axes, NOT species axes, so they weight 0.
 *  Plus a modular brain term (0 in v1). This is the compatibility metric the mate gate thresholds on. */
export function geneticDistance(genes: Float32Array, a: number, b: number, cfg: Config): number {
  const ab = a * SCALAR_GENE_COUNT;
  const bb = b * SCALAR_GENE_COUNT;
  let sum = 0;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    if (g === ScalarGene.DISPLAY || g === ScalarGene.PREFERENCE) continue; // sexual axes ≠ species axes
    const spec = SCALAR_GENE_SPECS[g]!;
    const range = spec.max - spec.min || 1;
    const d = (genes[ab + g]! - genes[bb + g]!) / range;
    const w = g === ScalarGene.DIET ? cfg.mateDietWeight : 1;
    sum += w * d * d;
  }
  return Math.sqrt(sum);
}
```

- [ ] **Step 5: Run it — verify it passes**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/genome.test.ts -t "geneticDistance"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/genome.ts src/core/genome.test.ts src/core/config.ts
git commit -m "feat(genome): geneticDistance metric (DIET-weighted) + brainDistance seam"
```

---

### Task 3: `crossoverScalarGenes` + `crossoverBrain` stub

**Files:**
- Modify: `src/core/genome.ts` (append two exported functions)
- Test: `src/core/genome.test.ts`

**Interfaces:**
- Consumes: `SCALAR_GENE_SPECS`, `SCALAR_GENE_COUNT`, `scalarGeneGatedOff`, `Config` (`mutationSigma`), `Rng`.
- Produces:
  - `crossoverScalarGenes(genes: Float32Array, child: number, mom: number, dad: number, rng: Rng, cfg: Config): void` — per-gene uniform pick (mom|dad) then Gaussian mutation + clamp; gated genes inherit from mom with no draw.
  - `crossoverBrain(brain, hue, child, mom, dad, rng, …flags): void` — v1 pass-through to `mutateGenome` from the mother (modular seam).

- [ ] **Step 1: Write the failing test**

```ts
it('crossoverScalarGenes: each child gene is near one parent allele, clamped', () => {
  const cfg = defaultConfig({ mutationSigma: 0 }); // no mutation → child gene EXACTLY one parent's
  const N = SCALAR_GENE_COUNT;
  const genes = new Float32Array(3 * N);
  for (let g = 0; g < N; g++) {
    genes[0 * N + g] = SCALAR_GENE_SPECS[g]!.min; // mom = min allele
    genes[1 * N + g] = SCALAR_GENE_SPECS[g]!.max; // dad = max allele
  }
  const rng = new Rng(42);
  crossoverScalarGenes(genes, 2, 0, 1, rng, cfg);
  let fromMom = 0;
  let fromDad = 0;
  for (let g = 0; g < N; g++) {
    const v = genes[2 * N + g]!;
    const spec = SCALAR_GENE_SPECS[g]!;
    expect(v === spec.min || v === spec.max).toBe(true); // exactly one parent (sigma 0)
    if (v === spec.min) fromMom++;
    else fromDad++;
  }
  expect(fromMom).toBeGreaterThan(0); // mixes both parents (not all from one)
  expect(fromDad).toBeGreaterThan(0);
});

it('crossoverScalarGenes is deterministic for a given rng state', () => {
  const cfg = defaultConfig({});
  const N = SCALAR_GENE_COUNT;
  const a = new Float32Array(3 * N);
  const b = new Float32Array(3 * N);
  for (let g = 0; g < N; g++) {
    a[g] = b[g] = 1;
    a[N + g] = b[N + g] = 2;
  }
  crossoverScalarGenes(a, 2, 0, 1, new Rng(7), cfg);
  crossoverScalarGenes(b, 2, 0, 1, new Rng(7), cfg);
  for (let g = 0; g < N; g++) expect(a[2 * N + g]).toBe(b[2 * N + g]);
});
```

Add `crossoverScalarGenes` to the test import.

- [ ] **Step 2: Run it — verify it fails**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/genome.test.ts -t "crossoverScalarGenes"`
Expected: FAIL (not exported).

- [ ] **Step 3: Implement in `genome.ts`** (append after `mutateScalarGenes`)

```ts
/** Sexual crossover of scalar genes: each gene is independently inherited from mom OR dad (uniform pick —
 *  preserves discrete allele combinations, unlike a blend, which speciation needs), then mutated + clamped
 *  exactly like mutateScalarGenes. Gated genes (forage/phero/age off) inherit from MOM with no draw, so
 *  the gating still skips RNG. One pick-draw per active gene; called per child in ascending mother order. */
export function crossoverScalarGenes(
  genes: Float32Array,
  child: number,
  mom: number,
  dad: number,
  rng: Rng,
  cfg: Config,
): void {
  const cb = child * SCALAR_GENE_COUNT;
  const mb = mom * SCALAR_GENE_COUNT;
  const db = dad * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const spec = SCALAR_GENE_SPECS[g]!;
    if (scalarGeneGatedOff(g, cfg)) {
      genes[cb + g] = genes[mb + g]!; // gated → inherit from mom, no draw
      continue;
    }
    const parentBase = rng.float() < 0.5 ? mb : db; // uniform per-gene pick
    const center = cfg[spec.centerKey];
    genes[cb + g] = clampTo(
      genes[parentBase + g]! + rng.gaussian(0, cfg.mutationSigma * center),
      spec.min,
      spec.max,
    );
  }
}

/** Sexual brain inheritance. v1: inherit the MOTHER's brain (+ hue), mutated — a modular seam. A separate
 *  session is changing the NN topology; once it lands this becomes real per-weight brain crossover with the
 *  dad parameter, without touching reproduce(). */
export function crossoverBrain(
  brain: Float32Array,
  hue: Float32Array,
  child: number,
  mom: number,
  _dad: number,
  rng: Rng,
  sigma: number,
  hueSigma: number,
  wallSenseGenes: boolean,
  flowSenseGenes: boolean,
  hungerSense: boolean,
  pheroSenseGenes: boolean,
): void {
  mutateGenome(
    brain, hue, child, mom, rng, sigma, hueSigma,
    wallSenseGenes, flowSenseGenes, hungerSense, pheroSenseGenes,
  );
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/genome.test.ts -t "crossover"`
Expected: PASS (both new tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/genome.ts src/core/genome.test.ts
git commit -m "feat(genome): crossoverScalarGenes (uniform pick) + crossoverBrain mother seam"
```

---

### Task 4: Store seeking fields + stateHash

**Files:**
- Modify: `src/core/store.ts` (declare arrays, init in constructor/clear/alloc)
- Modify: `src/core/world.ts` (`stateHash` — hash the two new fields)
- Test: `src/core/world.test.ts`

**Interfaces:**
- Produces: `store.seeking: Uint8Array`, `store.seekTicksLeft: Uint32Array` (both 0 on alloc/clear; both hashed).

- [ ] **Step 1: Write the failing test**

In `src/core/world.test.ts`, in the determinism describe block:

```ts
it('seeking store fields are reset-deterministic and hashed', () => {
  const w = new World(defaultConfig({ seed: 3, sexualReproduction: true }));
  for (let t = 0; t < 200; t++) w.step();
  const h1 = w.stateHash();
  w.reset();
  for (let t = 0; t < 200; t++) w.step();
  expect(w.stateHash()).toBe(h1); // reset → byte-identical, incl. seeking state
  expect(w.store.seeking.length).toBe(w.store.capacity);
  expect(w.store.seekTicksLeft.length).toBe(w.store.capacity);
});
```

(Uses `sexualReproduction`/the fields, which don't exist yet → fails. `sexualReproduction` lands in Task 5; for THIS task, temporarily drop `sexualReproduction: true` from the config literal and re-add it in Task 5's step. To keep Task 4 standalone, write the test WITHOUT the flag now: `defaultConfig({ seed: 3 })`.)

- [ ] **Step 2: Run it — verify it fails**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/world.test.ts -t "seeking store fields"`
Expected: FAIL (`store.seeking` undefined).

- [ ] **Step 3: Add fields in `store.ts`**

After the `breedCooldownLeft` declaration (line ~74):
```ts
  /** Mate-seeking state (life-sim-xa90): 1 while actively looking for a mate; seekTicksLeft counts the
   *  current search window down. Hashed (part of the determinism contract — they steer future behaviour). */
  readonly seeking: Uint8Array;
  readonly seekTicksLeft: Uint32Array;
```
In the constructor, after `this.breedCooldownLeft = new Uint32Array(capacity);`:
```ts
    this.seeking = new Uint8Array(capacity);
    this.seekTicksLeft = new Uint32Array(capacity);
```
In `clear()`, after `this.breedCooldownLeft.fill(0);`:
```ts
    this.seeking.fill(0);
    this.seekTicksLeft.fill(0);
```
In `alloc()`, after `this.breedCooldownLeft[slot] = 0;`:
```ts
    this.seeking[slot] = 0;
    this.seekTicksLeft[slot] = 0;
```

- [ ] **Step 4: Hash the fields in `world.ts` `stateHash`**

In `stateHash()`, the per-live-slot loop (~line 345), add the two fields alongside the existing `age`/`genId` hashing. First add `seeking, seekTicksLeft` to the destructure on line 344, then inside the loop (after the existing `h.u32(...)` calls for age/genId):
```ts
      h.u32(seeking[i]!);
      h.u32(seekTicksLeft[i]!);
```

- [ ] **Step 5: Run it — verify it passes**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/world.test.ts -t "seeking store fields"`
Expected: PASS. The golden-hash pin from Task 1 still holds (seeking is 0 for all in the asexual default, and `h.u32(0)` for the existing live creatures changes the hash — **so re-pin the golden hash again**: rerun the Step-6 command from Task 1 and update `world.test.ts` if it changed).

- [ ] **Step 6: Run full suite, re-pin golden if needed**

Run: `NODE_OPTIONS=--expose-gc npx vitest run`
If `world.test.ts` golden-pin fails, recompute (Task 1 Step 6 command) and update the constant. Expected after: all green.

- [ ] **Step 7: Commit**

```bash
git add src/core/store.ts src/core/world.ts src/core/world.test.ts
git commit -m "feat(store): seeking + seekTicksLeft fields, hashed in the determinism contract"
```

---

### Task 5: Config knobs for sexual reproduction

**Files:**
- Modify: `src/core/config.ts` (Config interface + defaultConfig)
- Test: `src/core/config` is exercised via `world.test.ts` (no standalone config test in this codebase)

**Interfaces:**
- Produces config fields: `sexualReproduction: boolean` (default `true`), `mateSeekWindow: number` (120), `mateContactRange: number` (12), `mateCompatThreshold: number` (0.6), `mateSenseAttraction: number` (1.0). (`mateDietWeight` already added in Task 2.)

- [ ] **Step 1: Write the failing test**

In `src/core/world.test.ts`:
```ts
it('sexualReproduction defaults on and is a config knob', () => {
  expect(defaultConfig({}).sexualReproduction).toBe(true);
  expect(defaultConfig({}).mateSeekWindow).toBe(120);
  expect(defaultConfig({ sexualReproduction: false }).sexualReproduction).toBe(false);
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/world.test.ts -t "sexualReproduction defaults"`
Expected: FAIL (`sexualReproduction` undefined).

- [ ] **Step 3: Add to `config.ts`**

Config interface (group them together near the reproduction knobs, after `breedCooldown`):
```ts
  /** Master toggle: sexual reproduction (crossover of two compatible parents). Default ON; false → the
   *  legacy asexual clone+mutate path (ablation). The ONLY behavioural gate for this feature. */
  sexualReproduction: boolean;
  /** Ticks a satiated creature stays in the mate-SEEKING state before giving up this cycle. */
  mateSeekWindow: number;
  /** World-unit radius for a mating contact (≈ one spatial-hash cell; covered by the 3×3 scan). */
  mateContactRange: number;
  /** Max geneticDistance for two creatures to be a compatible (interbreeding) pair — the species gate.
   *  Smaller = stricter isolation / easier speciation; too small risks crashing births. */
  mateCompatThreshold: number;
  /** Strength of the sight pull toward similar-looking creatures while seeking (bounded like cohesion). */
  mateSenseAttraction: number;
```

defaultConfig return (near `breedCooldown`):
```ts
    sexualReproduction: true,
    mateSeekWindow: 120,
    mateContactRange: 12,
    mateCompatThreshold: 0.6,
    mateSenseAttraction: 1.0,
```

- [ ] **Step 4: Run it — verify it passes**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/world.test.ts -t "sexualReproduction defaults"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts src/core/world.test.ts
git commit -m "feat(config): sexualReproduction toggle + mate-seeking knobs"
```

---

### Task 6: Sexual reproduce + seeking state machine (core)

**Files:**
- Modify: `src/core/economy.ts` (`reproduce` — add `hash` param + sexual branch + `findMate` helper; imports)
- Modify: `src/core/world.ts:293` (pass `this.hash` to `reproduce`)
- Modify: `src/core/economy.test.ts` (existing `reproduce` block: add `hash` arg + `sexualReproduction: false`; add new sexual tests)
- Test: `src/core/economy.test.ts`

**Interfaces:**
- Consumes: `crossoverScalarGenes`, `crossoverBrain`, `geneticDistance` (genome.ts), `satiatedBar`, `SpatialHash`, store `seeking`/`seekTicksLeft`.
- Produces: new `reproduce` signature
  `reproduce(store, rng, cfg, wallSenseGenes, flowSenseGenes, walls, hash: SpatialHash): number`.

- [ ] **Step 1: Update existing asexual tests to the ablation path + new signature**

In `src/core/economy.test.ts`, the `describe('reproduce (breed at the per-creature satiated bar)', …)` block (~line 671): every `defaultConfig(...)` used for those reproduce tests gains `sexualReproduction: false`, and every `reproduce(s, rng, cfg, false, false, null)` call gains a hash argument. Build a hash once per test where needed:
```ts
const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
// ...
reproduce(s, new Rng(1), cfg, false, false, null, hash);
```
(The asexual path ignores `hash`, so a fresh empty hash is fine. `SpatialHash` is already imported in this test file.)

- [ ] **Step 2: Run the updated block — verify still green (signature compiles after Step 4)**

Skip running until Step 4 (the new param doesn't exist yet). Proceed.

- [ ] **Step 3: Write the failing sexual tests**

Add a new describe block in `economy.test.ts`:

```ts
describe('sexual reproduction (crossover + compatibility + seeking)', () => {
  // Helper: a store with two adjacent satiated adults, scalar genes seeded compatible or not.
  function twoAdults(dietA: number, dietB: number) {
    const cfg = defaultConfig({
      sexualReproduction: true, ageStages: false, breedCooldown: 0,
      satiatedThreshold: 100, reproThreshold: 40, mateContactRange: 50, mateSeekWindow: 5,
    });
    const s = new OrganismStore(8);
    const N = SCALAR_GENE_COUNT;
    for (let i = 0; i < 2; i++) {
      const slot = s.alloc();
      s.x[slot] = 100 + i * 5; s.y[slot] = 100; // 5u apart, within mateContactRange
      s.energy[slot] = 200; // above satiatedBar
      for (let g = 0; g < N; g++) s.scalarGenes[slot * N + g] = defaultConfig({})[
        SCALAR_GENE_SPECS[g]!.centerKey
      ] as number;
      s.scalarGenes[slot * N + ScalarGene.SATIATED_THRESHOLD] = 100;
      s.scalarGenes[slot * N + ScalarGene.REPRO_THRESHOLD] = 40;
      s.scalarGenes[slot * N + ScalarGene.BIRTH_ENERGY] = 30;
    }
    s.scalarGenes[0 * N + ScalarGene.DIET] = dietA;
    s.scalarGenes[1 * N + ScalarGene.DIET] = dietB;
    s.rebuildLive();
    const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
    const tick = () => {
      hash.build(s);
      const b = reproduce(s, new Rng(1), cfg, false, false, null, hash);
      s.rebuildLive();
      return b;
    };
    return { cfg, s, tick };
  }

  it('compatible adults: enter seeking, then mate on a later tick', () => {
    const { s, tick } = twoAdults(0, 0); // identical diet → compatible
    expect(tick()).toBe(0); // tick 1: both enter SEEKING, no birth yet
    expect(s.seeking[0]).toBe(1);
    let births = 0;
    for (let t = 0; t < 5; t++) births += tick();
    expect(births).toBeGreaterThan(0); // mate on a seeking tick
  });

  it('predator × prey never breed (compatibility gate)', () => {
    const { tick } = twoAdults(0, 1); // grazer + predator → incompatible (DIET-dominated distance)
    let births = 0;
    for (let t = 0; t < 10; t++) births += tick();
    expect(births).toBe(0);
  });

  it('a lone satiated adult seeks then times out without breeding', () => {
    const { cfg } = twoAdults(0, 0);
    const s = new OrganismStore(4);
    const N = SCALAR_GENE_COUNT;
    const slot = s.alloc();
    s.x[slot] = 100; s.y[slot] = 100; s.energy[slot] = 200;
    for (let g = 0; g < N; g++) s.scalarGenes[slot * N + g] = 1;
    s.scalarGenes[slot * N + ScalarGene.SATIATED_THRESHOLD] = 100;
    s.scalarGenes[slot * N + ScalarGene.REPRO_THRESHOLD] = 40;
    s.rebuildLive();
    const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
    let births = 0;
    for (let t = 0; t < 10; t++) { hash.build(s); births += reproduce(s, new Rng(1), cfg, false, false, null, hash); }
    expect(births).toBe(0);
    expect(s.seeking[slot]).toBe(0); // timed out, exited seeking
  });

  it('energy is conserved on a sexual birth (mother pays, father unchanged)', () => {
    const { s, tick } = twoAdults(0, 0);
    const before = s.energy[0]! + s.energy[1]!;
    let bornSlot = -1;
    for (let t = 0; t < 6 && bornSlot < 0; t++) { tick(); if (s.liveCount > 2) bornSlot = 2; }
    expect(bornSlot).toBe(2);
    const after = s.energy[0]! + s.energy[1]! + s.energy[2]!;
    // total drops by exactly reproOverhead (provisioning is an internal transfer mother→child).
    expect(before - after).toBeCloseTo(defaultConfig({}).reproOverhead, 5);
  });
});
```

Add `crossoverScalarGenes`-era imports as needed (`geneticDistance` not needed in tests). Ensure `SCALAR_GENE_SPECS`, `SpatialHash`, `Rng` are imported (they are).

- [ ] **Step 4: Implement the sexual branch in `economy.ts`**

Add to the genome import block (top of `economy.ts`): `crossoverScalarGenes`, `crossoverBrain`, `geneticDistance`.

Add a `findMate` helper above `reproduce`:
```ts
/** Find the best compatible mate for mother `p` within mateContactRange (RNG-free, deterministic). Scans
 *  the post-MOVE hash 3×3 neighbourhood (cell ≥ contact range). A candidate is alive, mature, within range,
 *  and genetically compatible (distance < threshold). Among candidates, picks the one best matching the
 *  mother's PREFERENCE (min |display − preference|), tie-broken by lowest slot. Returns the slot or -1. */
function findMate(store: OrganismStore, p: number, cfg: Config, hash: SpatialHash): number {
  const { x, y, scalarGenes, age } = store;
  const N = SCALAR_GENE_COUNT;
  const range2 = cfg.mateContactRange * cfg.mateContactRange;
  const pref = scalarGenes[p * N + ScalarGene.PREFERENCE]!;
  const ww = cfg.worldWidth;
  const wh = cfg.worldHeight;
  let best = -1;
  let bestScore = Infinity;
  hash.forEachNeighbor(x[p]!, y[p]!, (j) => {
    if (j === p || !store.isAlive(j)) return;
    if (cfg.ageStages && age[j]! < scalarGenes[j * N + ScalarGene.MATURITY_AGE]!) return; // juvenile
    const dx = wrapDelta(x[j]! - x[p]!, ww);
    const dy = wrapDelta(y[j]! - y[p]!, wh);
    if (dx * dx + dy * dy > range2) return; // out of contact range
    if (geneticDistance(scalarGenes, p, j, cfg) >= cfg.mateCompatThreshold) return; // incompatible
    const score = Math.abs(scalarGenes[j * N + ScalarGene.DISPLAY]! - pref);
    if (score < bestScore || (score === bestScore && j < best)) { bestScore = score; best = j; }
  });
  return best;
}
```
(`wrapDelta` already exists in economy.ts.)

Change `reproduce`'s signature to add `hash: SpatialHash` as the last param. At the TOP of the per-parent loop body, AFTER the maturity gate + cooldown decrement + (for the asexual path) the existing satiated check, branch. Concretely, replace the body from the satiated check onward with:

```ts
    if (!cfg.sexualReproduction) {
      // ── Asexual path (ablation) — UNCHANGED from here down ──
      if (energy[p]! < satiatedBar(scalarGenes, p, cfg)) continue;
      // ... existing asexual alloc/mutate/provision block stays exactly as-is ...
      continue;
    }
    // ── Sexual path ──
    const ready = energy[p]! >= satiatedBar(scalarGenes, p, cfg);
    if (store.seeking[p]! === 1) {
      if (!ready) { store.seeking[p] = 0; continue; } // dropped below the bar → abandon the search
      const mate = findMate(store, p, cfg, hash);
      if (mate < 0) {
        store.seekTicksLeft[p] = store.seekTicksLeft[p]! - 1;
        if (store.seekTicksLeft[p]! === 0) {
          store.seeking[p] = 0;
          if (cfg.breedCooldown > 0) store.breedCooldownLeft[p] = cfg.breedCooldown; // forage before retry
        }
        continue;
      }
      // Compatible mate found → crossover birth. Mother = p, father = mate.
      const child = store.alloc();
      if (child < 0) break;
      const angle = rng.range(0, Math.PI * 2);
      let cx = x[p]! + Math.cos(angle) * offspringOffset;
      let cy = y[p]! + Math.sin(angle) * offspringOffset;
      cx %= worldWidth; if (cx < 0) cx += worldWidth;
      cy %= worldHeight; if (cy < 0) cy += worldHeight;
      if (walls !== null && walls.active && walls.isSolidAt(cx, cy)) { cx = x[p]!; cy = y[p]!; }
      x[child] = cx; y[child] = cy; vx[child] = vx[p]!; vy[child] = vy[p]!; heading[child] = heading[p]!;
      crossoverBrain(
        store.brain, store.hue, child, p, mate, rng, cfg.mutationSigma, cfg.hueMutationSigma,
        wallSenseGenes, flowSenseGenes, cfg.hungerSense, cfg.pheromoneEnabled,
      );
      crossoverScalarGenes(store.scalarGenes, child, p, mate, rng, cfg);
      store.resetLearned(child);
      const childBirth = scalarGenes[child * SCALAR_GENE_COUNT + ScalarGene.BIRTH_ENERGY]!;
      const childEnergy = Math.min(childBirth, energy[p]! - reproOverhead);
      energy[child] = childEnergy;
      store.prevEnergy[child] = childEnergy;
      energy[p] = energy[p]! - childEnergy - reproOverhead;
      births++;
      store.seeking[p] = 0;
      if (cfg.breedCooldown > 0) store.breedCooldownLeft[p] = cfg.breedCooldown;
      cfg.onBirth?.(p, store.genId[p]!, child, store.genId[child]!);
    } else if (ready) {
      store.seeking[p] = 1; // become a seeker; the steer picks it up next tick, mate attempt starts then
      store.seekTicksLeft[p] = cfg.mateSeekWindow;
    }
```

Keep the existing asexual block intact inside the `if (!cfg.sexualReproduction)` branch (move the current alloc/mutate/provision code there verbatim).

> **Forward seam (v2 bead `life-sim-z0f1`):** the `if (!cfg.sexualReproduction)` branch is intentionally the single decision point for reproduction mode. v2 (evolution of sex) replaces this global-config read with a per-creature heritable `REPRO_MODE` gene so asexual and sexual compete under selection — a localized change here. Do NOT generalize it in v1; just keep the branch clean and self-contained.

In `src/core/world.ts:293`, add `this.hash` as the final argument to the `reproduce(...)` call.

- [ ] **Step 5: Run the sexual + ablation tests**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/economy.test.ts`
Expected: PASS (updated asexual block + the 4 new sexual tests).

- [ ] **Step 6: Run the full suite**

Run: `NODE_OPTIONS=--expose-gc npx vitest run`
Expected: all green (re-pin the golden hash if behaviour-change shifted it — Task 1 Step 6 command). Typecheck: `npx tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add src/core/economy.ts src/core/world.ts src/core/economy.test.ts src/core/world.test.ts
git commit -m "feat(economy): sexual reproduction — seeking state machine + compatibility-gated crossover"
```

---

### Task 7: Mate-attraction steer while seeking

**Files:**
- Modify: `src/core/sense.ts` (`senseCreatures` — add a seeking mate pull inside the neighbour loop)
- Test: `src/core/sense.test.ts`

**Interfaces:**
- Consumes: `store.seeking`, `cfg.mateSenseAttraction`, hue + DIET of neighbours.
- Produces: when `seeking[i]`, the sight vector gains a pull toward same-diet-class, similar-hue neighbours.

- [ ] **Step 1: Write the failing test**

In `src/core/sense.test.ts` (follow the file's existing setup pattern for `senseCreatures`):
```ts
it('a seeking creature is pulled toward a similar-hue same-class neighbour', () => {
  const cfg = defaultConfig({ mateSenseAttraction: 2, cohesionGain: 0, shelterGain: 0 });
  const s = new OrganismStore(4);
  const N = SCALAR_GENE_COUNT;
  const a = s.alloc(); const b = s.alloc();
  s.x[a] = 100; s.y[a] = 100; s.heading[a] = 0;
  s.x[b] = 130; s.y[b] = 100; // directly ahead (+x)
  for (const slot of [a, b]) {
    s.scalarGenes[slot * N + ScalarGene.VISION_RANGE] = 100;
    s.scalarGenes[slot * N + ScalarGene.VISION_ACUITY] = 1;
    s.scalarGenes[slot * N + ScalarGene.VISION_FOV] = 3;
    s.scalarGenes[slot * N + ScalarGene.DIET] = 0;
    s.hue[slot] = 0.5;
  }
  s.rebuildLive();
  const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, s.capacity);
  hash.build(s);
  // not seeking → baseline sight
  senseCreatures(s, hash, cfg, null, null);
  const baseX = s.sightX[a]!;
  // seeking → stronger forward pull toward b
  s.seeking[a] = 1;
  senseCreatures(s, hash, cfg, null, null);
  expect(s.sightX[a]!).toBeGreaterThan(baseX);
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/sense.test.ts -t "seeking creature is pulled"`
Expected: FAIL (no mate pull yet → sightX unchanged).

- [ ] **Step 3: Implement in `senseCreatures`**

In the neighbour loop, where `pull` is accumulated (right after the cohesion block, before `const w = pull * (1 - d / range) * acuity;`), add:
```ts
          // Mate-seeking pull (life-sim-xa90): while SEEKING, add attraction toward creatures that LOOK
          // like compatible mates — same diet class + similar hue (cheap kin-by-appearance proxy; true
          // compatibility is decided at the contact gate in reproduce). Modular seam: replaced by the
          // kin-scent gradient when that field lands. Bounded by mateSenseAttraction so it can't swamp flee.
          if (store.seeking[i] === 1 && cfg.mateSenseAttraction > 0) {
            const sameClass = (myDiet < 0.5) === (itsDiet < 0.5) ? 1 : 0;
            if (sameClass) {
              let hd = Math.abs(myHue - hue[j]!);
              if (hd > 0.5) hd = 1 - hd;
              pull += cfg.mateSenseAttraction * (1 - 2 * hd);
            }
          }
```
(`store`, `myDiet`, `itsDiet`, `myHue`, `hue`, `i`, `j` are all in scope at that point.)

- [ ] **Step 4: Run it — verify it passes**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/sense.test.ts -t "seeking creature is pulled"`
Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck**

Run: `NODE_OPTIONS=--expose-gc npx vitest run && npx tsc --noEmit`
Expected: all green. Re-pin golden hash if it shifted (seeking is 0 at the default unless a creature seeks within 1000 ticks — if the pin moves, recompute).

- [ ] **Step 6: Commit**

```bash
git add src/core/sense.ts src/core/sense.test.ts src/core/world.test.ts
git commit -m "feat(sense): mate-seeking sight pull toward similar-looking mates"
```

---

### Task 8: Liveness guardrail + determinism (sexual ON)

**Files:**
- Test: `src/core/world.test.ts`

**Interfaces:**
- Consumes: everything above, via `World` with `sexualReproduction: true`.

- [ ] **Step 1: Write the tests**

```ts
describe('sexual reproduction — determinism + liveness', () => {
  // A demo-ish config: dense pockets so mate-seeking has partners (per the feasibility probe).
  const demoish = () => defaultConfig({
    seed: 7, sexualReproduction: true, foodPatchCount: 40, foodPatchRadius: 8,
    breedCooldown: 150, ageStages: true, hungerGatesFood: true,
  });

  it('same (config, seed) → identical hash after 1500 ticks (sexual ON)', () => {
    const a = new World(demoish());
    const b = new World(demoish());
    for (let t = 0; t < 1500; t++) { a.step(); b.step(); }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('liveness guardrail: world stays alive + breeds under sexual reproduction', () => {
    const w = new World(demoish());
    for (let t = 0; t < 1500; t++) w.step();
    expect(w.population).toBeGreaterThan(50); // not collapsed to extinction
    expect(w.totalBirths).toBeGreaterThan(0); // sexual births actually happen
  });
});
```

- [ ] **Step 2: Run — verify behaviour**

Run: `NODE_OPTIONS=--expose-gc npx vitest run src/core/world.test.ts -t "sexual reproduction — determinism"`
Expected: determinism test PASSES. The liveness test reveals reality:
- **If it PASSES** → births survive sexual + compatibility gating. 
- **If population collapses / 0 births** → this is the load-bearing finding. Tune (in `demoish()` and the defaults): raise `mateContactRange` (12→24), raise `mateSeekWindow` (120→200), raise `mateCompatThreshold` (0.6→0.9). Re-run until alive, then carry those values into `defaultConfig`. Document the final values + why in the commit.

- [ ] **Step 3: Run full suite + typecheck + lint**

Run: `NODE_OPTIONS=--expose-gc npx vitest run && npx tsc --noEmit && npx eslint src/core src/headless`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/core/world.test.ts src/core/config.ts
git commit -m "test(world): sexual-repro determinism + liveness guardrail (+ tuned mate knobs if needed)"
```

---

### Task 9: Measure speciation (no new source — observation + report)

**Files:**
- Run: `src/headless/life-history.ts` (already reconstructs lineage via `onBirth`)
- Run: `src/headless/mate-encounter-probe.ts` (re-confirm encounter under the shipped config)

**Interfaces:** none — measurement only.

- [ ] **Step 1: Add `sexualReproduction: true` to `DEMO_OVERRIDES`**

In `src/headless/life-history.ts`, add `sexualReproduction: true` to the `DEMO_OVERRIDES` object (mirrors `main.ts`; the demo session may also enable it in `main.ts`, out of scope here).

- [ ] **Step 2: Run the speciation measurement**

Run: `npx tsx src/headless/life-history.ts 6000 1-3 --demo 2>/dev/null | tail -120`
Read for: population alive across seeds; `totalBirths` healthy; lineage generation depth advancing; gene drift — does DIET stay bimodal / do clusters form; does DISPLAY drift coherently (early→late cohort + generation-vs-gene sparkline) — the sexual-selection signal; does PREFERENCE track DISPLAY.

- [ ] **Step 3: Confirm reproductive isolation**

Inspect `life-histories-seed{S}.csv`: group individuals by DIET class and check parent links — a diet-0 child should never have a diet-1 parent (and vice-versa). If predators have gone extinct (per `predation-engine-ceiling.md`), report that the predator/prey isolation case is untestable in this config and the emergent species are grazer subpopulations differentiated by other genes — still a valid speciation result if their lineages stop sharing recent ancestors.

- [ ] **Step 4: Re-run the feasibility probe under the shipped config**

Run: `npx tsx src/headless/mate-encounter-probe.ts 4000 1-3 --demo 2>/dev/null | tail -40`
Confirm the compatible-encounter rate at the shipped `mateCompatThreshold`/`mateContactRange` matches what the liveness guardrail implied.

- [ ] **Step 5: Write the findings + close the bead**

Append a short findings section to the spec doc (or a sibling `…-results.md`) with file:line evidence: did species emerge, are births healthy, did the ornament propagate. Then:
```bash
git add docs/superpowers/ src/headless/life-history.ts
git commit -m "docs(measure): sexual-repro speciation results + life-history demo override"
bd close life-sim-xa90 --reason="Sexual reproduction + compatibility-gated speciation + display/preference shipped; measured."
bd sync --flush-only
```

---

## Self-Review

**Spec coverage:**
- Genome (DISPLAY/PREFERENCE, crossover, distance) → Tasks 1–3. ✓
- Seeking state machine + compatibility-gated crossover birth → Task 6. ✓
- Mate-attraction steer (modular seam) → Task 7. ✓
- Brain inherited from mother + `crossoverBrain` seam → Task 3 + used in Task 6. ✓
- Config knobs + `sexualReproduction` toggle → Tasks 2 (mateDietWeight) + 5. ✓
- Store seeking fields hashed → Task 4. ✓
- Determinism test + liveness guardrail → Task 8. ✓
- Measurement (species emerge? births healthy? ornament propagates?) → Task 9. ✓
- Determinism-only invariant / golden re-pin (no draw-skip gating) → Tasks 1, 4. ✓
- Deferred items (CHOOSINESS, brain crossover, kin-scent field, father cost) → not built, seams present. ✓

**Placeholder scan:** `<NEW_HASH>`/`<NEW_HASH>` are computed-then-pasted in Task 1 Step 6 / Task 4 (explicit command given) — not open-ended placeholders. No "TBD"/"handle edge cases"/"similar to Task N". ✓

**Type consistency:** `reproduce(..., hash: SpatialHash)` defined in Task 6 and called with `this.hash` in world.ts; `crossoverScalarGenes(genes, child, mom, dad, rng, cfg)` and `crossoverBrain(brain, hue, child, mom, dad, rng, sigma, hueSigma, …flags)` consistent between Task 3 (def) and Task 6 (call); `geneticDistance(genes, a, b, cfg)` consistent Task 2 ↔ Task 6; store `seeking`/`seekTicksLeft` consistent Task 4 ↔ 6 ↔ 7. ✓

**Known sharp edges flagged for the implementer:**
- Vision evolves DOWN in this world (memory `perception-scale-mismatch`), so the Task-7 sight pull fires rarely in practice — the wander + contact scan is the real feasibility workhorse; the steer is legibility/bonus. Don't over-tune it.
- The golden-hash pin may need recomputing after Tasks 1, 4, 6, 7 (each can shift the default-config byte stream). The command is in Task 1 Step 6; re-pin whenever that one test fails on the literal constant — that is expected, not a regression, as long as the run-to-run determinism test stays green.
