# B-food-1 — per-pocket independent drift — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give each food pocket its OWN drift velocity (direction), so A-patches and B-patches wander independently and cross/overlap/merge — instead of today's two per-channel global directions. Behind `cfg.perPocketDrift` (default true, ablatable; OFF = the legacy per-channel drift, byte-identical).

**Architecture:** `FoodField` draws per-pocket directions at `seedPatches` from the **forked velocity rng** (the cardinal food-field rule: never touch the main organism stream), stores them in `pocketDirX/Y`, and `driftPockets` (RNG-free) steps each pocket along its own direction. A `perPocketDrift` field/param switches the draw + the step; OFF preserves the exact 2-channel-direction draws + per-channel step.

**Tech Stack:** TypeScript, Vitest. Deterministic SoA sim core (`src/core/`).

## Global Constraints

- **Determinism is the ONLY invariant:** the per-pocket direction draws stay on the forked velocity rng (`this.rng.fork(0x5eed)`), so the main organism RNG stream is untouched whether per-pocket is on or off; run-to-run reproducible. NO golden hash. `driftPockets` stays RNG-free (reads stored directions).
- **On-by-default:** `cfg.perPocketDrift` defaults `true`. OFF → the legacy per-channel `dirA`/`dirB` drift (the `drawDriftDirections` off-branch + the `driftPockets` channel-dir step are UNCHANGED → byte-identical to current main).
- **Ablation test pattern:** `perPocketDrift:false !== perPocketDrift:true` (the flag is live) + run-twice-same-hash each + a structural test (per-pocket directions are spread, not ≤2 global dirs).
- **Commands:** focused `npx vitest run src/core/food-field.test.ts`; full `NODE_OPTIONS=--expose-gc npx vitest run` (~300s); `npx tsc --noEmit`; `npx eslint src`. Commit hook BLOCKS `Co-Authored-By` — omit it.

---

### Task 1: `perPocketDrift` config flag + the per-pocket-drift mechanic

**Files:**
- Modify: `src/core/config.ts` — `Config` interface (near `fertilityDriftRate`) + `defaultConfig`.
- Modify: `src/core/food-field.ts` — `pocketDirX/Y` fields + `perPocketDrift` field; `seedPatches` new param; `drawDriftDirections` per-pocket branch; `driftPockets` per-pocket branch.
- Modify: `src/core/world.ts` — pass `cfg.perPocketDrift` to `seedPatches`.
- Test: `src/core/food-field.test.ts` — per-pocket-drift tests.
- Test: `src/core/world.test.ts` — determinism + ablation.

**Interfaces:**
- Produces: `cfg.perPocketDrift` (default true); `FoodField` drifts each pocket along its own direction when on.

- [ ] **Step 1: Write the failing tests**

In `src/core/food-field.test.ts`, add (match the file's existing FoodField construction + a multi-pocket drift setup; reuse how existing drift tests build a drifting field — they call `seedPatches(...)` with `driftRate>0` + a forked velocity rng). The key assertions:

```ts
  it('per-pocket drift makes pockets wander in DISTINCT directions (B-food-1)', () => {
    // Build a drifting field with many pockets and step it; per-pocket drift → the set of pocket displacement
    // directions should have real spread (many distinct angles), unlike per-channel drift (≤ 2 global dirs).
    const mk = (perPocketDrift: boolean): number => {
      const f = makeDriftField(/* count */ 16, perPocketDrift); // helper: seedPatches with driftRate>0 + velocityRng
      const before = f.patchCenters.map((c) => ({ x: c.x, y: c.y }));
      for (let t = 0; t <= f.driftIntervalForTest; t++) f.driftPockets(t); // advance one recarve
      const angles = new Set<number>();
      f.patchCenters.forEach((c, i) => {
        const dx = c.x - before[i]!.x, dy = c.y - before[i]!.y;
        if (Math.hypot(dx, dy) > 1e-9) angles.add(Math.round(Math.atan2(dy, dx) * 100)); // quantized angle
      });
      return angles.size; // distinct displacement directions
    };
    expect(mk(false)).toBeLessThanOrEqual(2); // per-channel: ≤ 2 global directions
    expect(mk(true)).toBeGreaterThan(2); // per-pocket: many distinct directions (16 pockets → ~16 angles)
  });
```

(Implement `makeDriftField` inline in the test to match the existing FoodField constructor + seedPatches signature; expose the drift interval via a small helper or a known constant. If the existing tests already have a drift-field helper, reuse it and pass the new `perPocketDrift` arg.)

In `src/core/world.test.ts`, add:

```ts
  it('perPocketDrift OFF vs ON diverge; both deterministic (B-food-1, forked-rng safe)', () => {
    const off = new World(defaultConfig({ seed: 2, fertilityDriftRate: 1, perPocketDrift: false }));
    const on = new World(defaultConfig({ seed: 2, fertilityDriftRate: 1, perPocketDrift: true }));
    const off2 = new World(defaultConfig({ seed: 2, fertilityDriftRate: 1, perPocketDrift: false }));
    for (let t = 0; t < 400; t++) { off.step(); on.step(); off2.step(); }
    expect(on.stateHash()).not.toBe(off.stateHash()); // the flag changes the drift pattern → the world
    expect(off.stateHash()).toBe(off2.stateHash()); // determinism (run-twice-same-hash)
  });
```

(`fertilityDriftRate` must be > 0 for drift to engage; the default demo has it 1, but `defaultConfig` may have it 0 — set it explicitly in the test.)

- [ ] **Step 2: Run, verify they fail**

Run: `npx vitest run src/core/food-field.test.ts -t "per-pocket"` and `npx vitest run src/core/world.test.ts -t perPocketDrift`
Expected: FAIL (`perPocketDrift` not a config key; per-pocket directions not implemented → `mk(true)` ≤ 2).

- [ ] **Step 3: Add the config flag**

In `src/core/config.ts`, `Config` interface near `fertilityDriftRate`:

```ts
  /** B-food-1: when on, each migrating food pocket drifts along its OWN direction (drawn per-pocket from the
   *  forked velocity rng) so patches wander independently + cross/overlap/merge. Off → the legacy two per-channel
   *  global drift directions (byte-identical). Only matters when fertilityDriftRate > 0. */
  perPocketDrift: boolean;
```

In `defaultConfig`, near `fertilityDriftRate`:

```ts
    perPocketDrift: true, // ON by default: pockets drift independently (B-food-1)
```

- [ ] **Step 4: Add the food-field fields + seedPatches param**

In `src/core/food-field.ts`: add private fields near `dirAx`:

```ts
  // B-food-1 per-pocket drift: each pocket's own unit drift direction (drawn from the forked velocity rng at
  // seedPatches when perPocketDrift). driftPockets reads these (RNG-free). Persist across recarves like the
  // channel dirs; size = pocketCount. When perPocketDrift is off these stay length 0 and the channel dirs drive.
  private pocketDirX: Float64Array = new Float64Array(0);
  private pocketDirY: Float64Array = new Float64Array(0);
  private perPocketDrift = false;
```

In `seedPatches`, add a trailing param `perPocketDrift = false,` (after `velocityRng`), and store it: `this.perPocketDrift = perPocketDrift;` (place this assignment BEFORE the `if (driftRate > 0 && velocityRng) this.drawDriftDirections(velocityRng);` call so drawDriftDirections sees it).

- [ ] **Step 5: Branch `drawDriftDirections` for per-pocket draws**

In `src/core/food-field.ts`, change `drawDriftDirections` to draw per-pocket directions when `this.perPocketDrift` (else the legacy 2 channel dirs, unchanged):

```ts
  private drawDriftDirections(velocityRng: { float(): number }): void {
    if (this.perPocketDrift) {
      // Per-pocket: one independent direction per pocket from the forked velocity rng. Uniform angles over the
      // pockets naturally spread (no forced separation needed). pocketChan/pocketCount are already set.
      this.pocketDirX = new Float64Array(this.pocketCount);
      this.pocketDirY = new Float64Array(this.pocketCount);
      for (let p = 0; p < this.pocketCount; p++) {
        const ang = velocityRng.float() * 2 * Math.PI;
        this.pocketDirX[p] = Math.cos(ang);
        this.pocketDirY[p] = Math.sin(ang);
      }
      return;
    }
    const aAng = velocityRng.float() * 2 * Math.PI;
    let bAng = velocityRng.float() * 2 * Math.PI;
    let d = Math.abs(bAng - aAng) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d < 0.6) bAng = aAng + 2.1;
    this.dirAx = Math.cos(aAng);
    this.dirAy = Math.sin(aAng);
    this.dirBx = Math.cos(bAng);
    this.dirBy = Math.sin(bAng);
  }
```

NOTE: `drawDriftDirections` is called in `seedPatches` AFTER the per-pocket pre-pass sets `pocketCount`/`pocketChan` — confirm `this.pocketCount` is set before this call (it is set in the pocket pre-pass). If `pocketCount` is assigned later in seedPatches, move the per-pocket allocation to just after `pocketCount` is known (read the function and place correctly).

- [ ] **Step 6: Branch `driftPockets` to use per-pocket directions**

In `src/core/food-field.ts` `driftPockets`, inside the per-pocket loop, replace the channel-direction lookup with a per-pocket one when on:

```ts
      const rate = ch === 0 ? this.driftRateA : this.driftRateB;
      const dx = this.perPocketDrift ? this.pocketDirX[p]! : ch === 0 ? this.dirAx : this.dirBx;
      const dy = this.perPocketDrift ? this.pocketDirY[p]! : ch === 0 ? this.dirAy : this.dirBy;
```

(The per-channel `rate` is kept so A/B can still have different average SPEEDS; only the DIRECTION is now per-pocket. The rest of `driftPockets` is unchanged and stays RNG-free.)

- [ ] **Step 7: Pass the flag from world.ts**

In `src/core/world.ts`, in the `this.food.seedPatches(...)` call, add `cfg.perPocketDrift,` as the final argument (after the `this.rng.fork(0x5eed)` velocityRng argument).

- [ ] **Step 8: Run the tests**

Run: `npx vitest run src/core/food-field.test.ts -t "per-pocket"` → PASS (mk(false) ≤ 2, mk(true) > 2).
Run: `npx vitest run src/core/world.test.ts -t perPocketDrift` → PASS (off ≠ on; off deterministic).

- [ ] **Step 9: Type/lint + full suite**

Run: `npx tsc --noEmit` → clean. `npx eslint src/core/food-field.ts src/core/config.ts src/core/world.ts` → clean.
Run: `NODE_OPTIONS=--expose-gc npx vitest run` → ALL green. (If `config.test.ts` snapshots keys, add `perPocketDrift`.)

- [ ] **Step 10: Commit**

```bash
git add src/core/config.ts src/core/food-field.ts src/core/world.ts src/core/food-field.test.ts src/core/world.test.ts
git commit -m "feat(food): B-food-1 — per-pocket independent drift (each pocket wanders on its own; ablatable)"
```

---

### Task 2: Liveness + reset-determinism guard

**Files:**
- Test: `src/core/food-field.test.ts` — a reset-determinism test (the per-pocket dirs persist correctly).

- [ ] **Step 1: Reset-determinism test**

In `src/core/food-field.test.ts`, add a test that a world with `perPocketDrift:true` + drift produces an identical hash after `reset()` + re-run (the per-pocket directions are stable across reset, like the channel dirs):

```ts
  it('perPocketDrift world is reset-deterministic (B-food-1)', () => {
    const w = new World(defaultConfig({ seed: 8, fertilityDriftRate: 1, perPocketDrift: true }));
    for (let t = 0; t < 200; t++) w.step();
    const h1 = w.stateHash();
    w.reset();
    for (let t = 0; t < 200; t++) w.step();
    expect(w.stateHash()).toBe(h1);
  });
```

(Place in `world.test.ts` if that's where reset tests live — match the existing reset-determinism test location.)

- [ ] **Step 2: Liveness**

Run: `NODE_OPTIONS=--expose-gc npx tsx src/headless/liveness-probe.ts 4000 3` → `LIVENESS: PASS` (per-pocket drift is on in the demo via the default; the world must survive). Record pop + FORAGE_PREF/DIET.

- [ ] **Step 3: Run + commit**

Run the reset test → PASS. tsc + eslint clean.

```bash
git add src/core/food-field.test.ts src/core/world.test.ts
git commit -m "test(food): B-food-1 — reset-determinism guard for per-pocket drift"
```

---

## Verification (before merge)

- [ ] `NODE_OPTIONS=--expose-gc npx vitest run` → full suite green; tsc + eslint clean.
- [ ] `liveness-probe.ts 4000 3` → PASS.
- [ ] `git log -1 main` re-checked (it MOVES — parallel sessions); rebase onto main if moved + re-run full suite; FF/merge; `bd sync --flush-only`.

## Self-review (coverage vs spec)

- Spec "per-pocket velocity from the forked velocity rng; driftPockets reads it (RNG-free)" → Task 1 Steps 5-6. ✓
- Spec "perPocketDrift flag, default true, ablatable, OFF byte-identical" → Task 1 Steps 3-4. ✓
- Spec "determinism (forked rng, run-twice), ablation off!=on, pocket-angle spread, recarve-persistence" → Task 1 Step 1 + Task 2. ✓
