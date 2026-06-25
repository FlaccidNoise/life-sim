# A2c — BREED_GATE (brain-gated breeding) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote breeding from a pure energy-threshold reflex to a brain DECISION: a `breedGate[i]` sigmoid output gates whether a creature that COULD breed actually does, so the brain chooses *when*. **Evolve-only** (breeding costs energy → a reward-Hebbian gate would unlearn-to-breed). Seeded gate-OPEN (breeds by default). Behind `cfg.brainGatedBreeding` (OFF → no gate, byte-identical). **Determinism-critical:** the gate is checked AFTER the maturity/cooldown/viability checks but BEFORE any `spawnChildSlot`/rng draw, so the determinism stream is preserved.

**Architecture:** The last new hidden-layer output column (col 5): `HIDDEN_OUTPUTS 5→6`, a named `BREED_GATE_BIAS` gene (seeded open), a `store.breedGate[]` buffer. steer() computes it (NO eligibility — evolve-only); `reproduce()` skips breeding when the gate is below `breedGateThreshold`. The inspector renders + parity-checks it.

**Tech Stack:** TypeScript, Vitest. Deterministic SoA sim core (`src/core/`).

## Global Constraints

- **Determinism is the ONLY invariant:** same `(config, seed)` → byte-identical hash run-to-run. NO golden hash. `breedGate` is transient/derived (NOT hashed); the gate skip in `reproduce()` consumes NO rng (it sits before `spawnChildSlot`'s angle draw), mirroring the cooldown skip — so the determinism stream is preserved.
- **Always-drawn:** `BREED_GATE_BIAS` + the new W2 column draw regardless of `cfg.brainGatedBreeding`. OFF path = no gate check = byte-identical to the energy-threshold reflex.
- **Layout (A2c):** `BREED_GATE_BIAS=55` (a `Brain` enum slot), `NAMED_BRAIN_GENES 55→56`, `HIDDEN_OUTPUTS 5→6` (breedGate = output column **5**), derived `HIDDEN_W1=56`, `HIDDEN_W2=152`, `GLOW_BIAS=176`, `BRAIN_GENES 180→185`.
- **BREED_GATE_BIAS seeds gate-OPEN** (FOUNDER_BRAIN value `4`) and is in `learn()`'s bias-skip.
- **BREED is EVOLVE-ONLY:** NO eligibility for the breed W2 column (col 5) in the hidden→output elig loop (it stays at o+0/o+1/o+2/o+3 — turn/thrust/eatGate/biteGate). The new FOUNDER_BRAIN length guard (genome.ts) will catch an off-by-one layout edit at module load.
- **Liveness is the key safety net:** a breed gate that evolves shut would crash the population. Seeded gate-open + selection-against-not-breeding should keep it open, but the liveness guardrail must PASS.
- **Commands:** focused `npx vitest run <file>`; full `NODE_OPTIONS=--expose-gc npx vitest run` (~300s); `npx tsc --noEmit`; `npx eslint src`. Commit hook BLOCKS `Co-Authored-By` — omit it.

---

### Task 1: Genome layout + config (`brainGatedBreeding`, `breedGateThreshold`)

**Files:**
- Modify: `src/core/genome.ts` — `Brain` enum (`BREED_GATE_BIAS` after `SCENT_GATE_BIAS: 54`), `NAMED_BRAIN_GENES`, `HIDDEN_OUTPUTS`, `FOUNDER_BRAIN` (insert the gate-open bias).
- Modify: `src/core/config.ts` — `Config` interface + `defaultConfig`.
- Test: `src/core/genome.test.ts` — the layout-lock describe block.

**Interfaces:**
- Produces: `Brain.BREED_GATE_BIAS=55`; `NAMED_BRAIN_GENES=56`, `HIDDEN_OUTPUTS=6`, `HIDDEN_W2=152`, `GLOW_BIAS=176`, `BRAIN_GENES=185`; `cfg.brainGatedBreeding` (default true), `cfg.breedGateThreshold` (default 0.5).

- [ ] **Step 1: Update the layout-lock test (failing)**

In `src/core/genome.test.ts`, in the `unified brain layout` describe block, update the assertions:

```ts
  it('places the 16-synapse scent block at 20..35 and the interoceptive tail after readiness', () => {
    expect(Brain.PHERO_C0_LAT_TURN).toBe(20);
    expect(Brain.PHERO_C3_FWD_THRUST).toBe(35);
    expect(Brain.EAT_GATE_BIAS).toBe(36);
    expect(Brain.READINESS_THRUST).toBe(44);
    expect(Brain.BITE_GATE_BIAS).toBe(53);
    expect(Brain.SCENT_GATE_BIAS).toBe(54);
    expect(Brain.BREED_GATE_BIAS).toBe(55); // A2c: brain-gated breeding output bias
    expect(NAMED_BRAIN_GENES).toBe(56);
  });
  it('grows the hidden layer to 24 inputs and 6 outputs (turn/thrust/eat/bite/scent/breed)', () => {
    expect(SCENT_CHANNELS).toBe(4);
    expect(HIDDEN_INPUTS).toBe(24);
    expect(HIDDEN_OUTPUTS).toBe(6);
    expect(HiddenInput.BIAS).toBe(23);
  });
  it('derives downstream offsets from the unified sizes', () => {
    expect(HIDDEN_W1).toBe(NAMED_BRAIN_GENES); // 56
    expect(HIDDEN_W2).toBe(HIDDEN_W1 + HIDDEN_INPUTS * HIDDEN_UNITS); // 152
    expect(GLOW_BIAS).toBe(HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS); // 176
    expect(BRAIN_GENES).toBe(185);
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"`
Expected: FAIL (`Brain.BREED_GATE_BIAS` undefined; `HIDDEN_OUTPUTS` is 5).

- [ ] **Step 3: Add the `Brain` slot + bump `NAMED_BRAIN_GENES`**

In `src/core/genome.ts`, after `SCENT_GATE_BIAS: 54,` add:

```ts
  // A2c brain-gated breeding: a sigmoid breedGate output (hidden-layer column 5) read by reproduce() to gate
  // WHEN a breeding-eligible creature actually breeds. This is the named BIAS gene; the per-unit weights live
  // in the W2 block at output column 5. Seeded gate-OPEN; EVOLVE-ONLY (breeding cost → no reward-Hebbian).
  BREED_GATE_BIAS: 55,
```

Change `export const NAMED_BRAIN_GENES = 55;` to `= 56;`.

- [ ] **Step 4: Bump `HIDDEN_OUTPUTS`**

Change `export const HIDDEN_OUTPUTS = 5; // turn=0, thrust=1, eatGate=2, biteGate=3 (A2a), scentGate=4 (A2b)` to:

```ts
export const HIDDEN_OUTPUTS = 6; // turn=0, thrust=1, eatGate=2, biteGate=3, scentGate=4, breedGate=5 (A2c)
```

- [ ] **Step 5: Seed `FOUNDER_BRAIN` gate-open**

In `FOUNDER_BRAIN`, after the A2b scent line `4,` (SCENT_GATE_BIAS) add:

```ts
  // A2c BREED_GATE_BIAS (55): seeded gate-OPEN (sigmoid(4)≈0.98 → breeds by default; evolution refines timing).
  4,
```

(The hidden block auto-grows by HIDDEN_UNITS=4. The FOUNDER_BRAIN length guard added in A2b will verify length===185 at module load.)

- [ ] **Step 6: Add the config flags**

In `src/core/config.ts`, `Config` interface near `brainGatedScent`:

```ts
  /** A2c brain-gated breeding: when on, a breeding-eligible creature only breeds if its breedGate (0..1)
   *  sigmoid output is ≥ breedGateThreshold — the brain chooses WHEN to breed. Evolve-only. Seeded gate-open →
   *  founding breeding unchanged. Off → the pure energy-threshold reflex (byte-identical). */
  brainGatedBreeding: boolean;
  /** Threshold the breedGate must reach to permit breeding (A2c). Default 0.5; seeded gate ≈0.98 clears it. */
  breedGateThreshold: number;
```

In `defaultConfig`, near `brainGatedScent: true,`:

```ts
    brainGatedBreeding: true, // ON by default: breeding timing is a brain decision (seeded breed-open; evolve-only)
    breedGateThreshold: 0.5, // breedGate must reach this to breed; seeded ≈0.98 clears it (breeds by default)
```

- [ ] **Step 7: Run the layout test + full suite**

Run: `npx vitest run src/core/genome.test.ts -t "unified brain layout"` → PASS.
Run: `npx tsc --noEmit` → clean. `npx eslint src/core/genome.ts src/core/config.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → ALL green. (Drawn-but-unread → deterministic; the FOUNDER_BRAIN length guard passes at 185.) If `config.test.ts` snapshots keys, add the two new keys.

- [ ] **Step 8: Commit**

```bash
git add src/core/genome.ts src/core/config.ts src/core/genome.test.ts
git commit -m "feat(brain): A2c layout — BREED_GATE_BIAS + HIDDEN_OUTPUTS 5→6 + brainGatedBreeding (BRAIN_GENES 180→185)"
```

---

### Task 2: steer() computes breedGate (EVOLVE-ONLY) + inspector parity

**Files:**
- Modify: `src/core/store.ts` — add `breedGate` Float64Array (decl + alloc; default 1).
- Modify: `src/core/brain.ts` — `steer()` computes breedGate (after scentGate); `learn()` excludes `BREED_GATE_BIAS`. NO eligibility for col 5.
- Modify: `src/app/observability/brain-view.ts` — `computeBrainState` computes breedGate + `BrainState`; render a 7th output node.
- Test: `src/app/observability/brain-view.test.ts` — a non-saturated breedGate parity test (exercise the hidden→breed column 5; lower bound >0.6).

**Interfaces:**
- Consumes: `Brain.BREED_GATE_BIAS`, `HIDDEN_OUTPUTS`, `cfg.brainGatedBreeding`.
- Produces: `store.breedGate[i]` ∈ 0..1; `BrainState.breedGate`.

- [ ] **Step 1: Write the failing breedGate parity test**

In `src/app/observability/brain-view.test.ts`, add (mirror the A2b scentGate parity test — exercise the hidden→breed column 5, non-saturated, lower bound 0.6):

```ts
  it('computes a breedGate output that matches a real steer() run, exercising the hidden→breed column (A2c)', () => {
    const c = defaultConfig({ brainGatedBreeding: true, hiddenLayer: true });
    const s = new OrganismStore(8);
    const i = s.alloc();
    s.heading[i] = 0;
    const base = i * SCALAR_GENE_COUNT;
    for (let g = 0; g < SCALAR_GENE_COUNT; g++)
      s.scalarGenes[base + g] = c[SCALAR_GENE_SPECS[g]!.centerKey];
    const b = i * BRAIN_GENES;
    s.brain[b + Brain.BREED_GATE_BIAS] = 0.3;
    s.brain[b + HIDDEN_W1 + HiddenInput.FOOD_FWD * HIDDEN_UNITS + 0] = 0.8; // food-fwd → hidden unit 0
    s.brain[b + HIDDEN_W2 + 0 * HIDDEN_OUTPUTS + 5] = 0.6; // hidden unit 0 → breedGate column (5)
    s.senseX[i] = 0.5; // fwd 0.5 → hAct[0] = tanh(0.4) ≈ 0.38
    s.resetLearned(i);
    s.rebuildLive();
    const st = computeBrainState(s, c, i);
    steer(s, false, c.eligLambda, c.motorSquash, c);
    expect(st.breedGate).toBeCloseTo(s.breedGate[i]!, 10);
    // Correct (col 5, w 0.6) → sigmoid(0.3+0.38·0.6) ≈ 0.629; bias-only/wrong-column → sigmoid(0.3) ≈ 0.574.
    // The >0.6 lower bound (not 0.5) is what actually catches a wrong W2 column.
    expect(st.breedGate).toBeGreaterThan(0.6);
    expect(st.breedGate).toBeLessThan(0.7);
  });
```

- [ ] **Step 2: Run, verify it fails** — `npx vitest run src/app/observability/brain-view.test.ts -t breedGate` → FAIL (`s.breedGate`/`st.breedGate` undefined).

- [ ] **Step 3: Add the `breedGate` store buffer**

In `src/core/store.ts`, after the `scentGate` buffer add:

```ts
  // Transient per-tick BREED-GATE actuator (0..1): the brain's breeding-timing decision (A2c). Recomputed each
  // tick in steer(); read by reproduce() (gated at breedGateThreshold). Not hashed (derived). Defaults to 1
  // (breed-open) on alloc.
  readonly breedGate: Float64Array;
```

Constructor after `this.scentGate = new Float64Array(capacity);`: `this.breedGate = new Float64Array(capacity);`. In `alloc()` after `this.scentGate[slot] = 1;`: `this.breedGate[slot] = 1;`.

- [ ] **Step 4: Compute breedGate in steer() (evolve-only)**

In `src/core/brain.ts`: add `const brainGatedBreeding = cfg.brainGatedBreeding;`; add `breedGate` to the `store` destructure; declare `let breedGateRaw = 0;` near scentGateRaw. After the scentGate block:

```ts
    // Brain-gated breeding (A2c): a sigmoid timing decision from the hidden layer (output column 5) + a bias.
    // reproduce() gates breeding on this. EVOLVE-ONLY (no eligibility below — breeding cost would unlearn it).
    if (brainGatedBreeding) {
      breedGateRaw = learnedBrain[b + Brain.BREED_GATE_BIAS]!;
      if (hiddenLayer) {
        const w2 = b + HIDDEN_W2;
        for (let j = 0; j < HIDDEN_UNITS; j++)
          breedGateRaw += hAct[j]! * learnedBrain[w2 + j * HIDDEN_OUTPUTS + 5]!;
      }
      breedGate[i] = 1 / (1 + Math.exp(-breedGateRaw));
    }
```

Do NOT add `elig[o + 5]`. In `learn()`, extend the bias-skip with `|| g === Brain.BREED_GATE_BIAS`.

- [ ] **Step 5: Mirror breedGate in computeBrainState + render it**

In `src/app/observability/brain-view.ts`: add `breedGate: number` to `BrainState`. In `computeBrainState`, after the scentGate block:

```ts
  let breedGate = 0;
  if (cfg.brainGatedBreeding) {
    let breedGateRaw = lb[b + Brain.BREED_GATE_BIAS]!;
    if (cfg.hiddenLayer) {
      for (let j = 0; j < HIDDEN_UNITS; j++)
        breedGateRaw += hidden[j]! * lb[b + HIDDEN_W2 + j * HIDDEN_OUTPUTS + 5]!;
    }
    breedGate = 1 / (1 + Math.exp(-breedGateRaw));
  }
```

Add `breedGate` to the returned `BrainState`. In `render()`, add `drawOut(6, 'breed', st.breedGate)` (7th node), grow the `outY` denominator, route W2 col-5 edges to the breed node.

- [ ] **Step 6: Run the parity test + full suite** — focused breedGate test PASS; `npx vitest run src/core/world.test.ts` green (breedGate computed but UNREAD by reproduce → byte-identical to Task 1); tsc + eslint clean; FULL suite green.

- [ ] **Step 7: Commit**

```bash
git add src/core/store.ts src/core/brain.ts src/app/observability/brain-view.ts src/app/observability/brain-view.test.ts
git commit -m "feat(brain): A2c — steer computes breedGate (evolve-only) + inspector parity (unread yet)"
```

---

### Task 3: `reproduce()` gates breeding on breedGate (determinism-critical)

**Files:**
- Modify: `src/core/economy.ts` — `reproduce()` (gate AFTER the viability check, BEFORE the asexual/sexual branch — i.e. before any `spawnChildSlot`/rng draw).
- Test: `src/core/economy.test.ts` — a unit test (gate < threshold → no breed, no births; gate ≥ threshold → breeds).
- Test: `src/core/world.test.ts` — a brainGatedBreeding determinism test.

**Interfaces:**
- Consumes: `store.breedGate[p]` (Task 2), `cfg.brainGatedBreeding`, `cfg.breedGateThreshold`.
- Produces: `reproduce()` skips a creature (no rng/spawn) when `brainGatedBreeding && breedGate[p] < breedGateThreshold`.

- [ ] **Step 1: Write the failing unit test**

In `src/core/economy.test.ts`, add a test: a single satiated, mature, viable creature with energy above its satiated bar (so it WOULD breed); `breedGate=0` → `reproduce()` returns 0 births and the population is unchanged; `breedGate=1` → returns 1 birth. Reuse the file's existing `reproduce`/world scaffolding (it builds a store + cfg + rng). The crisp assertion is births=0 vs births=1.

- [ ] **Step 2: Run, verify it fails** — FAIL (the creature breeds regardless of the gate — not read yet).

- [ ] **Step 3: Gate breeding in reproduce()**

In `src/core/economy.ts` `reproduce()`, immediately AFTER the reproductive-viability gate (the `if (energy[p]! <= cfg.reproOverhead + scalarGenes[...REPRO_THRESHOLD]) continue;` block) and BEFORE the `if (!cfg.sexualReproduction)` branch, add:

```ts
    // A2c brain-gated breeding: the brain chooses WHEN to breed. Skip (consuming NO rng — before spawnChildSlot's
    // angle draw, mirroring the cooldown skip) when the gate is below threshold → the determinism stream is
    // preserved. Gated on brainGatedBreeding; seeded gate-open so this rarely bites at founding. Covers both the
    // asexual and sexual paths (the gate is common to both, before any spawn/rng).
    if (cfg.brainGatedBreeding && store.breedGate[p]! < cfg.breedGateThreshold) continue;
```

- [ ] **Step 4: Write the determinism test**

In `src/core/world.test.ts`:

```ts
  it('brainGatedBreeding ON is deterministic (A2c — same config+seed → identical hash run-to-run)', () => {
    const a = new World(defaultConfig({ seed: 6, brainGatedBreeding: true }));
    const b = new World(defaultConfig({ seed: 6, brainGatedBreeding: true }));
    for (let t = 0; t < 300; t++) { a.step(); b.step(); }
    expect(a.stateHash()).toBe(b.stateHash());
  });
```

- [ ] **Step 5: Run the tests + full suite** — focused unit test PASS; `npx vitest run src/core/world.test.ts -t brainGatedBreeding` PASS; tsc + eslint clean; FULL suite green.

- [ ] **Step 6: Commit**

```bash
git add src/core/economy.ts src/core/economy.test.ts src/core/world.test.ts
git commit -m "feat(economy): A2c — reproduce() gates breeding on breedGate (before rng; determinism-safe)"
```

---

### Task 4: Liveness (CRITICAL) + honest measurement

**Files:**
- Modify: a probe (extend `intero-probe.ts` or a new `breed-gate-probe.ts`).

- [ ] **Step 1: Liveness — the key safety check**

Run: `NODE_OPTIONS=--expose-gc npx tsx src/headless/liveness-probe.ts 4000 3` → MUST be `LIVENESS: PASS`. A breed gate that evolved shut would crash the population; if liveness FAILS, STOP and report (the seed/threshold may need revisiting). Record pop + births/deaths.

- [ ] **Step 2: Add a breedGate readout**

Report, over the live population after a demo run, the **mean + min/max (spread) of `store.breedGate`** and the fraction BELOW `breedGateThreshold` (= "gating breeding off"). Selection should keep the gate open (not-breeding is selected against), so expect it to stay ~open.

- [ ] **Step 3: Run + interpret honestly**

Run the probe (8000 ticks, seeds 1/2/3). **Interpret honestly:** does breedGate stay ~open (mean ≈0.98, ~0% below threshold) as selection-against-not-breeding predicts? Report the mean + fraction-below-threshold. If it stays open, the gate is wired+live but breeding-timing isn't being modulated (no benefit to deferring) — report that. If a fraction gate breeding off (and the population still survives), quote it. Either way, confirm the population didn't crash.

- [ ] **Step 4: Commit + record**

```bash
git add <the probe file>
git commit -m "test(brain): A2c breed-gate probe — measure breedGate spread + confirm no breeding collapse"
```

Record the numbers + verdict in bead `life-sim-rez7` and the roadmap before merging.

---

## Verification (before merge to main)

- [ ] `NODE_OPTIONS=--expose-gc npx vitest run` → full suite green; `npx tsc --noEmit` + `npx eslint src` clean.
- [ ] `liveness-probe.ts 4000 3` → **PASS** (the breed gate didn't crash the population). breedGate readout recorded.
- [ ] `git log -1 main` re-checked; FF/merge A2c; update roadmap (**A2 bucket COMPLETE**); `bd close life-sim-rez7`; `bd sync --flush-only`.

## Self-review (coverage vs spec)

- Spec "BREED_GATE = sigmoid(bias + hidden·W2col5), seeded open, behind brainGatedBreeding, gate AFTER viability/satiated BEFORE rng/spawn" → Tasks 1-3. ✓
- Spec "BREED evolve-only (no eligibility)" → Task 2 Step 4 (no `elig[o+5]`). ✓
- Spec "skip before any spawnChildSlot/rng (determinism)" → Task 3 Step 3 (gate before the branch). ✓
- Spec "liveness matters most" → Task 4 Step 1. ✓
- Spec "HIDDEN_OUTPUTS 5→6, BRAIN_GENES 180→185, breedGate=col 5" → Task 1. ✓
