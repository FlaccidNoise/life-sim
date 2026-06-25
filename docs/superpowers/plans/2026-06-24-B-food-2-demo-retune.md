# B-food-2 — demo retune (separate A/B patches) + diversity measurement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Switch the live demo from co-located A+B food (mode 0) to **separate A-patches and B-patches** (`pocketChannelMode 1`), **sparser** (`foodPatchCount 40→20`) and **blobbier** (`foodPatchRadius 8→14`). With B-food-1's per-pocket drift already on (demo has `fertilityDriftRate 1`), the A and B patches now wander independently + cross/overlap/merge. **Measure honestly** whether this deepens the two-niche FORAGE_PREF split (the demonstrable diversity win) and concentrates prey.

**Architecture:** Pure config change (`main.ts` + `DEMO_OVERRIDES`) — no new mechanic. Plus a determinism/per-channel-speed guard test and a forage-diversity + prey-NND measurement probe. NB `20·14² (3920) > 40·8² (2560)` total pocket area, so sparser-but-blobbier preserves/raises total food while concentrating it into fewer richer blobs (liveness should hold; measure to confirm).

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- **Determinism is the ONLY invariant.** Switching `pocketChannelMode 0→1` + the new patch count/radius is a deterministic config change (a different world). NO golden hash.
- **`pocketChannelMode 1` is a deliberate per-feature DEMO flip** (the global `defaultConfig` default stays 0 — modes 0/1 are mutually exclusive, per `feature-default-on-policy`). Change `main.ts` (browser demo) AND `DEMO_OVERRIDES` (life-history.ts, headless probes) together so they match.
- **Liveness must hold** — the sparser field must not starve the population. If it does, tune `foodPatchCount`/`foodCap`/`foodRegen` UP and re-measure (don't ship a dead demo).
- **Commands:** focused vitest; full `NODE_OPTIONS=--expose-gc npx vitest run`; tsc; eslint. Probes via `npx tsx`. Commit hook BLOCKS `Co-Authored-By` — omit it.

---

### Task 1: Demo retune config + per-channel-speed guard

**Files:**
- Modify: `src/app/main.ts` — the demo config (`pocketChannelMode`, `foodPatchCount`, `foodPatchRadius`).
- Modify: `src/headless/life-history.ts` — `DEMO_OVERRIDES` (same three knobs, to match).
- Test: `src/core/food-field.test.ts` — a per-channel-speed test (mode 1 + perPocketDrift: A-pockets avg slower than B).

**Interfaces:**
- Produces: the demo grows separate drifting A/B patches.

- [ ] **Step 1: Write the per-channel-speed test (the reviewer's B-food-1 gap)**

In `src/core/food-field.test.ts`, add (confirms per-pocket DIRECTION but per-channel SPEED — A drifts slower than B). Build a 2-channel `pocketChannelMode=1` field with `perPocketDrift=true`, `driftRateA` small, `driftRateB` large, step it, and assert mean displacement of channel-A pockets < channel-B pockets. Match the file's existing FoodField/seedPatches construction (reuse the B-food-1 drift-field helper if present):

```ts
  it('per-pocket drift keeps per-channel SPEED: A-pockets drift slower than B-pockets (mode 1)', () => {
    // channels=2, pocketChannelMode=1 → pockets alternate A/B; driftRateA << driftRateB. Per-pocket DIRECTION
    // (independent angles) but per-channel SPEED → A-pockets move less than B-pockets on average.
    const f = makeDriftField2ch({ perPocketDrift: true, driftRateA: 0.1, driftRateB: 1.0 }); // helper per the file
    const before = f.patchCenters.map((c) => ({ x: c.x, y: c.y }));
    for (let t = 0; t <= f.driftIntervalForTest; t++) f.driftPockets(t);
    let aSum = 0, aN = 0, bSum = 0, bN = 0;
    f.patchCenters.forEach((c, i) => {
      const d = Math.hypot(c.x - before[i]!.x, c.y - before[i]!.y);
      if (i % 2 === 0) { aSum += d; aN++; } else { bSum += d; bN++; } // mode-1 round-robin: even=A, odd=B
    });
    expect(aSum / aN).toBeLessThan(bSum / bN); // A (rate 0.1) drifts less than B (rate 1.0)
  });
```

(Implement `makeDriftField2ch` to match the existing food-field drift-test construction with `channels=2, pocketChannelMode=1`. If the round-robin channel assignment isn't strictly even/odd, derive each pocket's channel from the field's diagnostics instead of `i % 2`. The LOAD-BEARING assertion is `meanA < meanB`.)

- [ ] **Step 2: Run, verify it fails or passes-by-construction**

Run: `npx vitest run src/core/food-field.test.ts -t "per-channel SPEED"`
Expected: PASS (the mechanic already keeps per-channel speed) — this is a guard/characterization test confirming the B-food-1 claim. If it FAILS, the per-channel rate isn't being applied with per-pocket direction — investigate before the config change.

- [ ] **Step 3: Retune `main.ts`**

In `src/app/main.ts`, in the demo config object, change `foodPatchCount: 40,` → `foodPatchCount: 20,`; `foodPatchRadius: 8,` → `foodPatchRadius: 14,`; and ADD `pocketChannelMode: 1,` (near `foodChannels: 2`). Add a brief comment: `// B-food: separate A/B patches (mode 1), sparser+blobbier, drifting per-pocket → two-niche diversity`.

- [ ] **Step 4: Mirror in `DEMO_OVERRIDES`**

In `src/headless/life-history.ts`, in `DEMO_OVERRIDES`, make the SAME three changes (`foodPatchCount: 20`, `foodPatchRadius: 14`, add `pocketChannelMode: 1`) so the headless probes measure the retuned demo.

- [ ] **Step 5: Liveness check (the safety gate)**

Run: `NODE_OPTIONS=--expose-gc npx tsx src/headless/liveness-probe.ts 4000 3` → expect `LIVENESS: PASS`. Record pop + FORAGE_PREF mean/std. If EXTINCT or near-dead, the sparser field starved it — bump `foodPatchCount` (e.g. 24) or `foodCap`/`foodRegen` and re-run until liveness PASSES; record the final values.

- [ ] **Step 6: Type/lint + full suite**

Run: `npx tsc --noEmit` → clean. `npx eslint src/app/main.ts src/headless/life-history.ts src/core/food-field.test.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → ALL green.

- [ ] **Step 7: Commit**

```bash
git add src/app/main.ts src/headless/life-history.ts src/core/food-field.test.ts
git commit -m "feat(demo): B-food-2 — separate drifting A/B patches (mode 1, sparser 20, blobbier 14)"
```

---

### Task 2: Forage-diversity + prey-concentration measurement (the demonstrable win)

**Files:**
- Create: `src/headless/forage-diversity-probe.ts`.

**Interfaces:**
- Consumes: `World`, `defaultConfig`, `DEMO_OVERRIDES`, `ScalarGene`.

- [ ] **Step 1: Write the probe**

Create `src/headless/forage-diversity-probe.ts` that runs the demo config in TWO modes — the **retune** (`pocketChannelMode 1`, as now in DEMO_OVERRIDES) vs the **baseline** (`pocketChannelMode 0`, co-located) — from the same seed, N ticks, and reports over the live population:
- **FORAGE_PREF mean + std + the bimodality** (fraction with pref < 0.33 [A-specialist], 0.33–0.67 [generalist], > 0.67 [B-specialist]) — the two-niche split. Hypothesis: the retune (separate drifting A/B patches) sustains BOTH an A-specialist and a B-specialist cohort (a real bimodal split) where the baseline collapses to one niche (A-monoculture). Quote the per-bin fractions for both modes.
- **Prey concentration:** mean nearest-neighbour distance (NND) over a sample of the live population (a fixed-radius hash scan or a sampled pairwise min) under the retune vs baseline. Lower NND = more concentrated. Report honestly (concentration is necessary-not-sufficient for predation per the ceiling memory).
- pop (liveness sanity) for both modes.

```ts
/**
 * B-food-2 measurement: does the separate-drifting-A/B retune (pocketChannelMode 1, sparser+blobbier) deepen the
 * two-niche FORAGE_PREF split vs the co-located baseline (mode 0)? And concentrate prey? Read-only.
 * Run: npx tsx src/headless/forage-diversity-probe.ts [ticks] [seed]
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { ScalarGene, SCALAR_GENE_COUNT } from '../core/genome';
import { DEMO_OVERRIDES } from './life-history';

const TICKS = Number(process.argv[2] ?? 8000);
const SEED = Number(process.argv[3] ?? 1);

for (const pocketChannelMode of [0, 1]) {
  const config: Config = defaultConfig({ seed: SEED, ...(DEMO_OVERRIDES as Partial<Config>), pocketChannelMode });
  const world = new World(config);
  for (let t = 0; t < TICKS; t++) world.step();
  const s = world.store;
  let n = 0, sum = 0, aSpec = 0, gen = 0, bSpec = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const pref = s.scalarGenes[s.liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
    n++; sum += pref;
    if (pref < 0.33) aSpec++; else if (pref > 0.67) bSpec++; else gen++;
  }
  const mean = n ? sum / n : NaN;
  let v = 0;
  for (let k = 0; k < s.liveCount; k++) {
    const pref = s.scalarGenes[s.liveIndices[k]! * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
    v += (pref - mean) * (pref - mean);
  }
  const std = n ? Math.sqrt(v / n) : NaN;
  process.stdout.write(
    `mode ${pocketChannelMode === 1 ? '1 (retune: separate A/B)' : '0 (baseline: co-located)'} — pop ${n} ` +
    `FORAGE_PREF mean ${mean.toFixed(3)} std ${std.toFixed(3)} | A-spec ${((100*aSpec)/Math.max(1,n)).toFixed(0)}% ` +
    `gen ${((100*gen)/Math.max(1,n)).toFixed(0)}% B-spec ${((100*bSpec)/Math.max(1,n)).toFixed(0)}%\n`,
  );
}
process.stdout.write('INTERPRET: retune (mode 1) should show a BIMODAL split (both A-spec AND B-spec cohorts, std UP) vs the baseline (mode 0) single-niche collapse. If both collapse to one niche, say so.\n');
```

- [ ] **Step 2: Run + interpret honestly**

Run: `npx tsx src/headless/forage-diversity-probe.ts 8000 1` (+ seeds 2, 3).
**Interpret honestly:** does mode 1 (the retune) sustain BOTH an A-specialist and B-specialist cohort (bimodal, std up) where mode 0 collapses to one niche? Quote the per-bin fractions. This is the demonstrable diversity win — if it holds, it's what the live demo will showcase (forage color-mode: two distinct specialist colors thriving in their drifting patches). If both modes collapse to one niche, report that plainly (the retune didn't deepen diversity) — do NOT claim a win the numbers don't support.

- [ ] **Step 3: Commit + record**

```bash
git add src/headless/forage-diversity-probe.ts
git commit -m "test(food): B-food-2 — forage-diversity + prey-concentration probe (retune vs baseline)"
```

Record the numbers + verdict in bead `life-sim-4bxw` and the roadmap.

---

## Verification (before merge)

- [ ] `NODE_OPTIONS=--expose-gc npx vitest run` → full suite green; tsc + eslint clean.
- [ ] `liveness-probe.ts 4000 3` → PASS (the retune didn't starve the demo). diversity-probe numbers recorded with an honest verdict.
- [ ] `git log -1 main` re-checked (MOVES — parallel sessions, esp. on food/demo config); rebase onto main if moved + re-run full suite; FF/merge; `bd sync --flush-only`.

## Self-review (coverage vs spec)

- Spec "demo: pocketChannelMode 0→1, sparser, blobbier" → Task 1 Steps 3-4. ✓
- Spec "measure forage-diversity (bimodal split) + prey NND vs baseline, honest" → Task 2. ✓
- Spec "liveness must hold (don't ship a dead demo)" → Task 1 Step 5. ✓
- Reviewer's per-channel-speed gap → Task 1 Step 1. ✓
