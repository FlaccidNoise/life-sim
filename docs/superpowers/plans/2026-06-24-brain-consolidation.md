# Brain Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `feat/living-world` into `main` and reconcile the two divergent `Brain` layouts into ONE unified skip-connection MLP where the 4 identity-bearing scent channels feed both the linear synapses AND the hidden layer.

**Architecture:** Real 3-way `git merge`, conflicts hand-resolved to the unified layout (`BRAIN_GENES=146`). The merge-resolution core (Task 1) is one inseparable step — both layouts must be held in context to produce a compiling tree. Tasks 2–6 are bite-sized, independently-reviewable verification/extension tasks on top of the merged tree.

**Tech Stack:** TypeScript, data-oriented SoA core (Float64Array brains), Vitest, WebGL/Canvas2D renderer + headless harness sharing one sim core.

**Spec:** `docs/superpowers/specs/2026-06-24-brain-consolidation-design.md`
**Bead:** life-sim-20xr · **Worktree:** `.claude/worktrees/brain-consolidation` (branch `feat/brain-consolidation` off main @ 7a2e64a)

## Global Constraints

- **Determinism is the ONLY invariant:** same (config, seed) → byte-identical run-to-run (`world.test.ts`, first test). Golden-hash baseline is RETIRED — do NOT add a byte-identical-when-off test, an RNG-draw-skip gate, or a hardcoded stateHash constant.
- RNG consumed ONLY at reproduction, ascending live-slot order. Hot loop (sense/steer/move/metabolize) stays RNG-free.
- Gated synapse blocks (hidden/glow) draw NO RNG when their flag is off — preserve the `isPhero`/`hiddenLayer` gated-draw pattern in `seedGenome`/`mutateGenome` so ablation streams stay stable.
- **Unified constants (exact):** `BRAIN_GENES=146`, `NAMED_BRAIN_GENES=45`, `HIDDEN_INPUTS=20`, `HIDDEN_UNITS=4` (escape hatch: bump to 6 only if it bottlenecks — not now), `HIDDEN_OUTPUTS=3`, `SCENT_CHANNELS=4`.
- All 6 brain flags ON by default (already ON on living-world): `hiddenLayer`, `brainGatedEating`, `ageSense`, `readinessSense`, `moodGlow`, `glowSense`. `hungerSense` stays `false` (phase 4).
- Commit hook BLOCKS the Co-Authored-By trailer — OMIT it. `make` fails in a worktree — run `npx` directly.
- Test cmd: `NODE_OPTIONS=--expose-gc npx vitest run` (~90s). Typecheck: `npx tsc --noEmit`. Lint: `npx eslint src`.
- Re-verify `git log -1 main` immediately before the merge — main moves under us.

---

### Task 1: Execute the merge and resolve to the unified layout (compiling tree)

The high-context core. Produces a merged, tsc-green tree with the unified `Brain`/`HiddenInput` enums and `steer()` wiring scent into the hidden layer. Tests may still fail (Task 4 reconciles them). **Done by the main session (both layouts already in context), not a zero-context subagent.**

**Files:**
- Modify (resolve conflicts): `src/core/genome.ts`, `src/core/brain.ts`, `src/core/economy.ts`, `src/core/config.ts`, `src/core/world.ts`, `src/core/store.ts`, `src/core/sense.ts`, `src/core/health.ts`, `src/render/renderer.ts`, `src/app/observability/brain-view.ts`, and conflicting test files.

**Interfaces:**
- Produces (genome.ts):
  - `Brain` enum named slots: `…HUNGER_TURN=18, HUNGER_THRUST=19, PHERO_C0_LAT_TURN=20 … PHERO_C3_FWD_THRUST=35, EAT_GATE_BIAS=36, EAT_GATE_FWD=37, EAT_GATE_LAT=38, EAT_GATE_SIGHT_FWD=39, EAT_GATE_SIGHT_LAT=40, AGE_TURN=41, AGE_THRUST=42, READINESS_TURN=43, READINESS_THRUST=44`.
  - `NAMED_BRAIN_GENES = 45`.
  - `HiddenInput` enum (20): `FOOD_FWD=0, FOOD_LAT=1, SIGHT_FWD=2, SIGHT_LAT=3, WALL_FWD=4, WALL_LAT=5, FLOW_FWD=6, FLOW_LAT=7, SCENT_C0_FWD=8, SCENT_C0_LAT=9, SCENT_C1_FWD=10, SCENT_C1_LAT=11, SCENT_C2_FWD=12, SCENT_C2_LAT=13, SCENT_C3_FWD=14, SCENT_C3_LAT=15, HUNGER=16, AGE=17, READINESS=18, BIAS=19`.
  - `HIDDEN_INPUTS=20`, `HIDDEN_UNITS=4`, `HIDDEN_OUTPUTS=3`, `HIDDEN_W1=NAMED_BRAIN_GENES` (45), `HIDDEN_W2=HIDDEN_W1+HIDDEN_INPUTS*HIDDEN_UNITS` (125), `GLOW_BIAS=HIDDEN_W2+HIDDEN_UNITS*HIDDEN_OUTPUTS` (137), `GLOW_HID=GLOW_BIAS+1` (138), `GLOW_SENSE_LAT_TURN=GLOW_HID+HIDDEN_UNITS` (142) … `BRAIN_GENES=GLOW_SENSE_LAT_TURN+4` (146).
  - `seedGenome`/`mutateGenome`: the 16-synapse scent block gated on `pheromoneEnabled` (the `isPhero` range now `PHERO_C0_LAT_TURN..PHERO_C3_FWD_THRUST`); eat-gate/age/readiness/hidden/glow gated on their flags. Hidden block seeds 0.
- Produces (brain.ts `steer()`): inside the per-channel scent loop, after computing `cFwd`/`cLat`, ALSO write `hidIn[HiddenInput.SCENT_C{c}_FWD] = cFwd; hidIn[HiddenInput.SCENT_C{c}_LAT] = cLat;`. The single-channel `pheroSenseX/Y` path is REMOVED.
- Produces (store.ts/sense.ts): single-channel `pheroSenseX/Y` buffers removed; `scentSenseX/Y` (`[i*SCENT_CHANNELS+c]`) is the sole scent buffer feeding both paths.

- [ ] **Step 1: Re-verify main, start the merge**

```bash
cd .claude/worktrees/brain-consolidation
git log -1 --oneline main          # confirm still 7a2e64a (or note new tip)
git merge feat/living-world         # expect conflicts; do NOT commit yet
git status --short                  # list conflicted files
```
Expected: conflicts in genome.ts, brain.ts, economy.ts, config.ts, world.ts, store.ts, sense.ts, health.ts, renderer.ts, brain-view.ts, and test files.

- [ ] **Step 2: Resolve `genome.ts`** to the unified `Brain` + `HiddenInput` enums and derived constants (per Interfaces above). KEEP main's 16-synapse scent block at 20–35; relocate living-world's eat-gate→36–40, age→41–42, readiness→43–44. Set `HIDDEN_INPUTS=20`. Rewrite `HiddenInput` to swap the single PHERO for 8 scent slots. Verify all offsets derive correctly (they're computed, not literal).

- [ ] **Step 3: Resolve `brain.ts steer()`** — keep main's channel loop for the 16 linear scent synapses; inside it populate the 8 scent `hidIn[]` slots. Delete the single-channel phero read. Keep living-world's hidden-layer math, eat-gate, age/readiness, glow, reverse-thrust. Wire the hidden-layer eligibility traces over the new `HIDDEN_INPUTS=20`.

- [ ] **Step 4: Resolve `store.ts`/`sense.ts`** — remove `pheroSenseX/Y`; confirm `scentSenseX/Y` is the sole scent buffer. Resolve `economy.ts`, `config.ts`, `world.ts`, `health.ts`, `renderer.ts`, `brain-view.ts` preserving BOTH branches' machinery (scent system + hidden/eat/glow/biolum). For test-file conflicts, take a union for now (Task 4 fixes assertions).

- [ ] **Step 5: Reach a compiling tree**

```bash
npx tsc --noEmit
```
Expected: PASS (no type errors). Iterate Steps 2–4 until clean.

- [ ] **Step 6: Grep for dead single-channel phero path**

```bash
grep -rn "pheroSense" src/ ; grep -rn "PHERO_FWD\b\|PHERO_LAT\b" src/
```
Expected: no remaining consumers of the single-channel buffers (only the 4-channel `scentSense*` and `PHERO_C0..C3` survive).

- [ ] **Step 7: Commit the merge**

```bash
git add -A
git commit -m "feat(brain): merge living-world hidden layer with 4-channel scent — unified brain (BRAIN_GENES=146)"
```

---

### Task 2: Unified-layout constants/offsets unit test

Lock the layout so later edits can't silently break it.

**Files:**
- Test: `src/core/genome.test.ts` (add a describe block)

**Interfaces:**
- Consumes: the `Brain`/`HiddenInput` enums + constants from Task 1.

- [ ] **Step 1: Write the failing test**

```typescript
import { Brain, HiddenInput, BRAIN_GENES, NAMED_BRAIN_GENES, HIDDEN_INPUTS, HIDDEN_UNITS, HIDDEN_OUTPUTS, HIDDEN_W1, HIDDEN_W2, GLOW_BIAS } from './genome';
import { SCENT_CHANNELS } from './scent-field';

describe('unified brain layout', () => {
  it('places the 16-synapse scent block at 20..35 and named tail at 45', () => {
    expect(Brain.PHERO_C0_LAT_TURN).toBe(20);
    expect(Brain.PHERO_C3_FWD_THRUST).toBe(35);
    expect(Brain.EAT_GATE_BIAS).toBe(36);
    expect(Brain.READINESS_THRUST).toBe(44);
    expect(NAMED_BRAIN_GENES).toBe(45);
  });
  it('grows the hidden layer to carry 4 scent channels (20 inputs)', () => {
    expect(HIDDEN_INPUTS).toBe(20);
    expect(SCENT_CHANNELS).toBe(4);
    // 8 scent hidden inputs, contiguous
    expect(HiddenInput.SCENT_C0_FWD).toBe(8);
    expect(HiddenInput.SCENT_C3_LAT).toBe(15);
    expect(HiddenInput.BIAS).toBe(19);
  });
  it('derives downstream offsets from the unified sizes', () => {
    expect(HIDDEN_W1).toBe(45);
    expect(HIDDEN_W2).toBe(45 + HIDDEN_INPUTS * HIDDEN_UNITS); // 125
    expect(GLOW_BIAS).toBe(HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS); // 137
    expect(BRAIN_GENES).toBe(146);
  });
});
```

- [ ] **Step 2: Run, expect PASS** (Task 1 already implements the layout — this is a lock-in test, not red→green).

```bash
NODE_OPTIONS=--expose-gc npx vitest run src/core/genome.test.ts -t "unified brain layout"
```
Expected: PASS. If FAIL, the layout from Task 1 is wrong — fix genome.ts, not the test.

- [ ] **Step 3: Commit**

```bash
git add src/core/genome.test.ts && git commit -m "test(brain): lock unified brain layout offsets"
```

---

### Task 3: `steer()` feeds scent into the hidden layer

Prove mandate 1: scent is not a vestigial linear path — it reaches the nonlinear hidden units.

**Files:**
- Test: `src/core/brain.test.ts` (add a test)

**Interfaces:**
- Consumes: `steer(store, learn, eligLambda, motorSquash, cfg)` and `scentSenseX/Y` from Task 1.

- [ ] **Step 1: Write the failing test** — set up a single creature with `hiddenLayer:true`, all linear scent synapses (20–35) and core synapses ZEROED, but a non-zero `HIDDEN_W1` weight on a `SCENT_C0` input and a non-zero `HIDDEN_W2` weight to turn. Inject a scent gradient via `scentSenseX[ i*SCENT_CHANNELS + 0 ]`. Assert heading changes (turn ≠ 0). Then zero the scent gradient and assert turn returns to baseline. (Exact harness: mirror the existing brain.test.ts single-creature setup — `makeStore`/`seedGenome` then overwrite specific `learnedBrain` weights.)

- [ ] **Step 2: Run, expect FAIL** if scent isn't wired to `hidIn[]` (turn stays 0).

```bash
NODE_OPTIONS=--expose-gc npx vitest run src/core/brain.test.ts -t "scent feeds hidden"
```

- [ ] **Step 3: Fix** — if FAIL, the scent→`hidIn[]` write in Task 1 Step 3 is missing/wrong. Ensure `hidIn[HiddenInput.SCENT_C{c}_FWD/LAT]` is populated in the channel loop.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/core/brain.test.ts src/core/brain.ts && git commit -m "test(brain): scent gradients drive the hidden layer (mandate 1)"
```

---

### Task 4: Reconcile the full suite to the unified layout

Update every test that asserts old offsets/`BRAIN_GENES`/single-channel phero. Failures are the signal the layout changed correctly — do NOT weaken the layout to satisfy a stale test.

**Files:**
- Modify: any failing `*.test.ts` (brain.test.ts, genome.test.ts, brain-view.test.ts, world.test.ts, sense.test.ts, economy.test.ts, health.test.ts).

- [ ] **Step 1: Run the full suite, catalog failures**

```bash
NODE_OPTIONS=--expose-gc npx vitest run 2>&1 | tail -40
```

- [ ] **Step 2: Fix each failure** by updating the assertion to the unified layout (new offsets, 4-channel scent, `BRAIN_GENES=146`). For any determinism test, keep it as same-(config,seed)→same-hash with NO hardcoded golden constant — if a test pins a literal hash, replace it with a run-twice-compare-equal assertion.

- [ ] **Step 3: Full suite green**

```bash
NODE_OPTIONS=--expose-gc npx vitest run 2>&1 | tail -5
```
Expected: all tests pass (347+ merged total). `npx tsc --noEmit` and `npx eslint src` clean.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(brain): reconcile suite to unified brain layout"
```

---

### Task 5: BrainView renders the unified brain

Mandate 2 (partial — full visibility sweep is phase 7): the inspector must not crash and must show the hidden layer + 16 scent synapses + eat-gate/age/readiness + glow for the unified offsets.

**Files:**
- Modify: `src/app/observability/brain-view.ts`
- Test: `src/app/observability/brain-view.test.ts`

**Interfaces:**
- Consumes: unified `Brain`/`HiddenInput` constants; a creature's `BRAIN_GENES=146`-length brain slice.

- [ ] **Step 1: Write/extend the failing test** — render BrainView for a seeded creature; assert it produces the hidden-layer rows (W1 over 20 inputs × 4 units, W2 over 4×3) and a 4-channel scent block without throwing / NaN. (Mirror living-world's existing brain-view.test.ts structure, updated for 20 inputs + 16 scent synapses.)

- [ ] **Step 2: Run, expect FAIL** (old view assumes 14 inputs / single phero).

```bash
NODE_OPTIONS=--expose-gc npx vitest run src/app/observability/brain-view.test.ts
```

- [ ] **Step 3: Update brain-view.ts** to the unified offsets: iterate `HIDDEN_INPUTS=20` (label the 8 scent rows C0..C3 × fwd/lat), render the 16 linear scent synapses, eat-gate (5), age (2), readiness (2), glow block.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/app/observability/brain-view.ts src/app/observability/brain-view.test.ts && git commit -m "feat(ui): BrainView renders the unified hidden-layer + 4-channel scent brain"
```

---

### Task 6: Liveness + determinism guardrail (the load-bearing verification)

Interconnection can crash the population to extinction. Prove it survives with all features ON, and that the unified brain is deterministic.

**Files:**
- Test: `src/core/world.test.ts` (determinism — likely already present; confirm it covers the unified brain) and a headless liveness check via `src/headless/life-history.ts`.

- [ ] **Step 1: Determinism** — confirm `world.test.ts`'s run-twice-same-hash test passes with the unified brain + all flags ON. If the existing test uses default config, it already exercises this; if not, add a same-(config,seed)→equal-hash assertion (NO golden literal).

```bash
NODE_OPTIONS=--expose-gc npx vitest run src/core/world.test.ts
```
Expected: PASS.

- [ ] **Step 2: Headless liveness** — run the demo config multi-seed and record population survival.

```bash
npx tsx src/headless/life-history.ts 4000 3 200 --demo
```
Expected: population > 0 at the final stride across all 3 seeds (no extinction). Record the actual end-population numbers in the bead/commit message.

- [ ] **Step 3: Live smoke (fresh port)** — `npm run dev -- --port 5199 --strictPort`, open in browser, confirm the sim runs, BrainView opens without error, scent overlay (`f`) and bioluminescence render. (Manual; capture a note.)

- [ ] **Step 4: Commit the evidence**

```bash
git add -A && git commit -m "test(brain): liveness + determinism guardrail for the unified brain"
```

---

## Self-Review

- **Spec coverage:** merge+reconcile (T1) · constants (T2) · scent→hidden mandate-1 (T3) · suite green (T4) · BrainView visibility (T5) · determinism + liveness (T6). All spec acceptance criteria mapped.
- **Scope boundaries honored:** no new outputs, no own-size/diet/crowding inputs, no crossoverBrain/brainDistance, glow stays linear, hungerSense stays off — all deferred to later sub-projects per spec.
- **Determinism:** every determinism check is run-twice-compare-equal, no golden literal (Global Constraints + T4 Step 2 + T6 Step 1).
- **Type consistency:** `BRAIN_GENES=146`, `NAMED_BRAIN_GENES=45`, `HIDDEN_INPUTS=20`, `HiddenInput.SCENT_C0_FWD=8…SCENT_C3_LAT=15` used consistently across T1–T6.
```
