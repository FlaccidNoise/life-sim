# Biogeographic Demes — Implementation Plan (Approach A)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Concentrate population into deep, stable, isolated demes so local density revives a visible predation layer and regions diverge — verified headless (≥4 seeds, one >100k) AND visually in the browser.

**Architecture:** Structure-only. Approach A touches ZERO engine code — only `livingWorldOverrides` knobs and (where a gate metric is missing) the headless probes. Determinism invariant unchanged. Approach B is out of scope here (separate plan, only if the Gause gate fails).

**Tech Stack:** TypeScript SoA sim core; `npx tsx` headless probes; `npx vite build && preview` browser demo; vitest.

## Global Constraints

- Determinism is the ONLY invariant: same (config, seed) → same run. Golden-hash retired.
- NO fitness/score/lineage read into any survival/repro/death/movement decision.
- `bodySense=false` (crashes the demo) — never flip on.
- This is EMPIRICAL tuning: "tests" = headless probe metrics + the determinism check + the in-browser visual gate. No fake unit tests.
- Knob values in tasks are STARTING points; the deliverable of the sweep task is the measured viable set, not these literals.
- Commit messages: write to a file, `git commit -F` (the hook blocks the literal "Co-Authored-By" in a bash command).
- Primary loop is IN THE BROWSER with the user watching. Headless is the fast secondary check; no conclusion is "done" until shown visually.

---

### Task 1: Measurement harness — predEncounter + local-NND

The gate needs sustained `predEncounter` and local nearest-neighbor distance inside a pocket. Confirm whether `predator-probe.ts` already emits them; add if missing.

**Files:**
- Inspect: `src/headless/predator-probe.ts`, `src/core/world.ts` (look for an existing `predEncounter`/`health()` metric)
- Modify (only if missing): `src/headless/predator-probe.ts`

**Interfaces:**
- Produces: `predator-probe.ts` prints per-checkpoint `predEncounter` (fraction of predators landing ≥1 bite that tick, or the existing engine counter) and `localNND` (mean nearest-neighbor distance among the densest pocket's residents).

- [ ] **Step 1:** Grep for an existing encounter metric: `grep -rn "predEncounter\|encounter\|bites" src/core/world.ts src/core/economy.ts`. If the engine already counts bites/encounters, surface that counter in the probe instead of recomputing.
- [ ] **Step 2:** If no metric exists, add to `predator-probe.ts`'s `counts()`: count predators with ≥1 successful bite this tick (read the same bite path hunt() uses) → `predEncounter = bitingPreds / max(1, pred)`. Add `localNND`: for the 50 densest-cell residents, mean distance to nearest live neighbor.
- [ ] **Step 3:** Run baseline to confirm the metric reads the known value: `npx tsx src/headless/predator-probe.ts 6000 4`. Expected: current demo shows `predEncounter` ≤ ~0.06 (matches the documented ceiling) — proves the metric is correct before we change anything.
- [ ] **Step 4:** Commit (only if probe changed). Message file → `git commit -F`.

---

### Task 2: Headless sweep — find a viable A knob set

Sweep the Approach-A bundle via `predator-probe.ts` `key=value` overrides (no config edit yet). Find a set where predation is revived AND liveness holds across seeds.

**Files:**
- Use: `src/headless/predator-probe.ts` (key=value overrides), `src/headless/long-run.ts`

**Interfaces:**
- Consumes: the metrics from Task 1.
- Produces: a chosen knob set `{foodPatchRichness, foodMaxFertility, deadWaterCost, fertilityDriftRate:0, foodPatchRichnessVar, predatorSeedClusters, predatorSizeBoost, herbivoryExp, predationGain, initialPopulation, foodPatchCount}` written to a scratch notes file.

- [ ] **Step 1:** Concentration sweep. Run e.g.
  `npx tsx src/headless/predator-probe.ts 30000 4 foodPatchRichness=3 foodMaxFertility=3 fertilityDriftRate=0 deadWaterCost=0.02 predatorSeedClusters=4 predatorSizeBoost=0.85 herbivoryExp=0.7 predationGain=3`
  Vary `foodPatchRichness` {2,3,4}, `foodPatchCount` {12,16,24}, `initialPopulation` {1000,2000}. Goal: sustained `predEncounter` > 0.1 with `localNND` < `biteRange` (16) inside deep pockets.
- [ ] **Step 2:** Isolation/divergence check. For the best 1-2 sets, confirm `deadWaterCost` holds demes apart without mass extinction (pred + prey both persist on ≥4 seeds at 30k).
- [ ] **Step 3:** Record the winning set + its metrics in `scratchpad/A-sweep-notes.md`. If NO set clears predEncounter>0.1 without crashing, STOP and report — that refutes the density thesis and we rethink before B.
- [ ] **Step 4:** Liveness pre-check on the winner: `npx tsx src/headless/long-run.ts 50000 1-4` with the set applied (temporarily via a scratch override or by Task 3 first). Expect no extinction across seeds.

---

### Task 3: Bake winners into living-world-config + verify determinism + full suite

**Files:**
- Modify: `src/app/living-world-config.ts` (the demo knobs)
- Verify: `npx tsc --noEmit`, `npx eslint .`, vitest

**Interfaces:**
- Consumes: the knob set from Task 2.
- Produces: updated `livingWorldOverrides` with documented WHY comments per changed knob (match the file's existing comment density).

- [ ] **Step 1:** Edit `livingWorldOverrides`: set the Task-2 winners; set `fertilityDriftRate: 0` and explain (fixed demes → regional history); add `foodPatchRichness`/`foodMaxFertility`/`deadWaterCost`/`foodPatchRichnessVar`/the predator bundle/`predatorSeedClusters`. Keep `bodySense:false`. Update the now-stale drift/predator-OFF comments.
- [ ] **Step 2:** Determinism check: run the demo config twice headless for a fixed seed, confirm identical population trajectory (same (config,seed) → same run). Reuse `long-run.ts 5000 1` twice; outputs must match exactly.
- [ ] **Step 3:** `npx tsc --noEmit` → clean. `npx eslint .` → clean (run npx directly, not make).
- [ ] **Step 4:** `NODE_OPTIONS=--expose-gc npx vitest run` → green. Any liveness/long-run CI gate test that asserts old monoculture numbers must be updated to the new regime (document the change in the commit).
- [ ] **Step 5:** Commit. Message file → `git commit -F`. Close/annotate the beads issue.

---

### Task 4: Browser visual confirmation (WITH the user)

No conclusion is done until seen. Drive the live demo together.

**Files:**
- Use: `npx vite build && npx vite preview --port <FRESH> --strictPort`; `src/app/main.ts` Knobs panel.

- [ ] **Step 1:** Build + preview on a FRESH port, open foreground tab, keep it visible (no hidden-tab pump — it crashed last session).
- [ ] **Step 2:** Run at high speed (in-app speed select up to 64×) in bounded chunks, letting it paint. Watch for: visible predator/prey chases; `c` to color-by diet/lineage (distinct predators?); pan across pockets for region A ≠ region B.
- [ ] **Step 3:** Screenshot the key moments; narrate what to look for; pause and discuss with the user. Live-tune via the Knobs panel if something's off (seed-time knobs need reset/rebuild).
- [ ] **Step 4:** Confirm the three success criteria are VISIBLE: chases, distinct regional species, within-pocket coexistence. If not, return to Task 2 with what the eye caught.

---

### Task 5: Long-run gate + B decision

**Files:**
- Use: `src/headless/long-run.ts`, `predator-probe.ts`, `gene-census.ts`

- [ ] **Step 1:** `npx tsx src/headless/long-run.ts 110000 1` — one >100k confirmation: liveness + emergent diet/size trajectory (not omnivory drift).
- [ ] **Step 2:** Gause gate: measure within-pocket niche count persistence past 20k (diet bimodality + forage-pref spread inside single pockets). If niches PERSIST → A succeeded, B not needed; document and stop. If they COLLAPSE → log it; B (apostatic predation) is justified → new spec/plan.
- [ ] **Step 3:** Update memory (MEMORY.md + a new finding file) with the result: did concentration revive predation, did regions diverge, did niches hold. Honest nulls.

---

## Self-Review

- **Spec coverage:** A knobs (T2,T3), drift-kill (T3), measurement gate predEncounter/regional-SD/Gause/liveness (T1,T2,T5), browser visual (T4), B decision (T5). ✓
- **Placeholders:** knob literals flagged as starting points (deliverable = measured set). ✓
- **Determinism:** explicit check T3 step 2. ✓
- Typo guard: "movement/movement" in Global Constraints — drop the dup on edit.
