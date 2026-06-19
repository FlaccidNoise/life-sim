# Plan 002: Add a determinism-contract test for the graze-latch / chain-plant / satiation ON paths

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cc34e07..HEAD -- src/core/sim/reproducibility.test.ts src/core/cells/metabolism.ts src/core/organism/plant.ts src/core/sim/config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: `plans/001-fix-lint-ci-gate.md` (CI must be green so the new
  test's `make check` gate is meaningful; also the lint errors are in a graze
  test file you'll be editing near).
- **Category**: tests (determinism contract)
- **Planned at**: commit `cc34e07`, 2026-06-19

## Why this matters

This project's stated correctness oracle is **byte-identical determinism given
(Config, seed)**, enforced by `src/core/sim/reproducibility.test.ts`. The audit
found that the newest hot-path code — the herbivore **graze-latch**, the
**sessile chain-plant** lifecycle, and **eat-and-go satiation** (all gated on
`herbivoreLatch` / `sessilePlants` / `grazeSatiation`, all ON in the active demo
config) — has **no case in `reproducibility.test.ts`**. The predation+fleeing
ON path *does* have one (added in the last audit cycle, see
`reproducibility.test.ts:324`). The graze/chain/satiation path is the asymmetric
gap: behavioral tests exist (`graze-latch.test.ts`, `plant-*.test.ts`) but none
pins **byte-identical-across-two-runs**. Because the owner is actively tuning
these exact knobs via headless probes, a missing contract case means a
non-determinism regression (a stray `Math.random`, a `Set`-iteration order, a
`Date.now`) could land silently and corrupt every probe comparison. This plan
adds the missing contract case, mirroring the existing predation-ON block.

## Current state

The determinism contract test file: `src/core/sim/reproducibility.test.ts`. It
already contains, as a precedent to copy structurally:

```ts
describe('reproducibility — predation + fleeing (3-trophic ecology) ON', () => {
  // The default OFF paths (preyDeposit/predScentDeposit 0) are covered by every suite above. This
  // pins the FULL ecology hot path — predation kernel (latch-and-drain), the latch tether force pass,
  // and prey fleeing (predScent deposit + flee steering) — must be byte-deterministic AND non-vacuously
  // active (the latch actually engages, carnivores deposit flee-scent, all 3 trophic levels coexist).
  // A small DENSE arena so predators contact prey within a few hundred ticks (the balance itself is
  // validated separately at 2048² in feel-probe.ts; here we only need the code paths to fire).
  function runEco(): { w: World; births: number; latched: boolean; sustained: boolean; ... } { ... }
  ...
  expect(Array.from(fa.latchCell)).toEqual(Array.from(fb.latchCell));
  expect(Array.from(fa.latchPrey)).toEqual(Array.from(fb.latchPrey));
  ...
  expect(a.latched).toBe(true); // the predation LATCH engaged at least once
  expect(a.sustained).toBe(true); // a predator drained the same prey org across ticks
  expect(a.foragersEnd).toBeGreaterThan(0); // all three trophic levels coexist at the end
  expect(a.predatorsEnd).toBeGreaterThan(0);
```

The ON-path knobs this plan must exercise (from `src/core/sim/config.ts`):
```
herbivoreLatch: false,        // default OFF; demo sets true
grazeRate: 1.0,
grazeLatchRange: 1.5,
grazeLatchStiffness: 0.8,     // gentle tether
grazeSatiation: 1e9,          // default OFF; demo lowers it
sessilePlants: false,         // default OFF; demo sets true
plantMaxChain, plantMaturityChain, plantGrowthThreshold, plantGrowthCost, plantBondLen,
plantSettleSpeed, plantBaseDensityCap, plantSporeThreshold, plantSporeCost, plantSporeImpulse
```

The hot-path code these knobs activate (so you know what "non-vacuous" means
for each):
- `src/core/cells/metabolism.ts` — the `herbivoreLatch && grazeLatchRange > 0`
  graze-latch branch (acquire + hold + drain at `grazeRate`), and the
  `satiated = herbivoreLatch && energy >= grazeSatiation` short-circuit that
  releases the latch and skips all eating.
- `src/core/organism/plant.ts` (`PlantSystem`) — `severEatenChainCells`,
  `growPlants`, `producePlantSpores`, `settleSpores`. Called from
  `src/core/sim/world.ts` gated on `cfg.sessilePlants`.
- `src/core/physics/latch-tether.ts` `applyLatchTether(..., grazePhoto=true)` —
  the herbivore tether, called from `world.ts` with `grazeLatchStiffness`.

**Repo conventions to match** (the contract is load-bearing — read these
before writing):
- `reproducibility.test.ts` runs the SAME config+seed through `new World(cfg)`
  **twice** (`a` and `b`), ticks both for N ticks, then asserts every
  state-bearing array is elementwise equal between the two runs, AND asserts
  the new code path actually fired (non-vacuity). Use `Array.from(a.x)` vs
  `Array.from(b.x)` for typed-array equality (the file's idiom).
- The contract must NOT depend on wall-clock or `Date` — it never does. If your
  test needs "the latch fired" you detect it by inspecting `latchPrey`/`latchCell`
  arrays or by counting plant cells, never by timing.
- `defaultConfig({...overrides})` is the config builder (see the predation
  block's `runEco`). Override only the knobs you need; leave everything else at
  defaults so the OFF-path tests stay the byte-identical baseline.
- Small DENSE arena (the predation block uses a small world so paths fire within
  a few hundred ticks). Match that — the *balance* is validated elsewhere in
  `src/headless/feel-probe.ts`; this test only needs the paths to fire and to be
  byte-identical.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Install   | `pnpm install`                   | exit 0              |
| Typecheck | `pnpm typecheck`                 | exit 0, no errors   |
| Tests     | `pnpm test -- reproducibility`   | the new + existing reproducibility tests pass |
| Lint      | `pnpm lint`                      | exit 0              |
| Full gate | `make check`                     | green               |

Run from the repo root. `pnpm test -- <filter>` runs only matching test files.

## Scope

**In scope** (the only files you should modify):
- `src/core/sim/reproducibility.test.ts` — add ONE new `describe` block.

**Out of scope** (do NOT touch):
- Any `src/core/**` non-test source. The determinism contract is read-only here;
  if a path isn't deterministic, that's a separate bug → STOP and report.
- The predation-ON block, the crowdDivideCap block, or any existing test.
- `config.ts` defaults. You override in the test only.

## Git workflow

- Branch: `advisor/002-graze-determinism-test` (off `main`, or off 001's branch
  if 001 has landed — see dependency).
- One commit. Message: `test(repro): pin graze-latch + chain-plant + satiation ON paths as byte-deterministic`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Read the precedent and the hot path

Read in full:
- `src/core/sim/reproducibility.test.ts` lines ~324–480 (the predation+fleeing
  ON block — your structural template).
- `src/core/cells/graze-latch.test.ts` (to see how a graze-latch is set up in a
  unit test — the `setup(mouthType, cfg)` helper and how `latchPrey`/`latchCell`
  are inspected).
- `src/core/organism/plant.ts` (the four `PlantSystem` methods, to know which
  `cfg.sessilePlants`-gated calls fire in `world.ts` per tick).

**Verify**: you can name, for each of {graze-latch acquire, graze-latch hold,
satiation-release, chain-plant grow, chain-plant spore, chain-plant settle},
which `cfg` knob turns it on and which store array or count you'd inspect to
prove it fired. If you cannot, re-read — do not proceed.

### Step 2: Write the new `describe` block

Add a new block **after** the predation+fleeing block, structured exactly like
it. Title:
```ts
describe('reproducibility — graze-latch + sessile chain-plants + satiation ON', () => {
```

The block must:

1. **Build a config** via `defaultConfig({...})` that turns ON, at minimum:
   - `herbivoreLatch: true`
   - `grazeLatchRange: 1.5` (already the default, but set explicitly for clarity)
   - `grazeLatchStiffness: 0.8`
   - `grazeSatiation: <a value low enough to actually trigger>` — pick a value
     that some forager mouths will exceed during the run (e.g. `60` at the
     small-world economy; verify by inspection in step 3). The default `1e9`
     never fires — you must lower it.
   - `sessilePlants: true`
   - the chain-plant knobs at their defaults (you can read them from
     `defaultConfig()`; only override if a default makes the run die out before
     paths fire).
   - Use a **small dense world** (mirror the predation block's dimensions) and a
     fixed `seed`.
   - Seed the world with plants + a few foragers (mirror how the predation
     block seeds predators+foragers; use the repo's existing
     `developInto`/spawn helpers exactly as the predation block does).

2. **Run it twice** (`a` and `b`), tick both for the same N ticks (a few hundred
   — enough for graze, grow, spore, settle, and at least one satiation-release
   to fire). N is a `const`, identical for both runs.

3. **Assert byte-identical** between `a` and `b` for, at minimum:
   - `cells.fields.energy`, `posX`, `posY`, `cellType`, `organismId`,
     `latchPrey`, `latchCell`, `anchored` (the last three are the new
     contract-relevant arrays — `anchored` because chain-plant physics pins it).
   - `bonds.liveBonds` contents, `organisms.cellCount`, `organisms.energy`,
     `organisms.carnivore`.
   - `lineage` via `serializeLineageLog(a.w.lineage) === serializeLineageLog(...)`.
   - `preyField.field` and `predScent.field` IF you keep predation OFF in this
     config (they should be all-zero in both — assert equality either way).
   Use `expect(Array.from(a.x)).toEqual(Array.from(b.x))` — the file's idiom.

4. **Assert non-vacuity** (the paths actually fired) on run `a` (and that `b`
   fired identically where you assert a boolean):
   - graze-latch engaged: some `latchPrey[i] > 0` at some point during the run
     (track a `grazed` boolean across the tick loop, mirroring the predation
     block's `latched`).
   - satiation released: at some tick a mouth had `latchPrey[i] > 0` and a
     later tick had `latchPrey[i] === 0` while still alive (track a
     `satiationReleased` boolean) — OR, simpler and equally valid, assert that
     `grazeSatiation` is finite and at least one mouth's energy exceeded it
     during the run. Pick the assertion you can make robustly; document which.
   - chain-plant grew: the plant cell count increased above its seed count at
     some point (track `maxPlants`).
   - a spore settled into a new base: `anchored[i]===1` count increased above
     the seed-base count at some point (track `maxBases`), OR a new plant
     organism id appeared. Pick one; document it.
   - All three: `expect(a.grazed).toBe(true)`,
     `expect(a.grazed).toBe(b.grazed)`, etc., matching the predation block's
     `expect(a.latched).toBe(b.latched)` pattern.

**Verify**: `pnpm test -- reproducibility` → all reproducibility tests pass,
including your new block (it runs green AND the non-vacuity asserts pass — if a
non-vacuity assert fails, the path didn't fire; see STOP conditions).

### Step 3: Tune for non-vacuity if a path didn't fire

If step 2's non-vacuity asserts fail, the config didn't actually exercise a
path. **Do not weaken the assert.** Instead adjust the config minimally so the
path fires: e.g. lower `grazeSatiation` further, run more ticks, seed more
foragers, raise `plantGrowthThreshold` affordability. Re-run
`pnpm test -- reproducibility` after each adjustment.

If after reasonable tuning a path genuinely will not fire in a small dense
arena (e.g. spore-settle needs a long drift), you may **drop that one
non-vacuity assert** and add a `// NON-VACUITY DEFERRED: <path> requires a
larger world to fire; covered by headless/feel-probe.ts` comment — but keep the
byte-identical asserts for every array. Report which assert you dropped and
why in your NOTES.

**Verify**: `pnpm test -- reproducibility` → green; every remaining non-vacuity
assert passes.

### Step 4: Full gate

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm test` → all pass; the reproducibility file gained exactly one
  `describe` block; total test count rises by the number of `it`s you added.

## Test plan

This plan *is* a test plan. The new `describe` block is the deliverable.
Pattern to model after: the `reproducibility — predation + fleeing (3-trophic
ecology) ON` block at `reproducibility.test.ts:324`.

Cases the single block must cover (via its non-vacuity asserts):
1. graze-latch acquire + hold + drain fires (byte-identical + engaged).
2. satiation releases the latch (byte-identical + released).
3. chain-plant growth fires (byte-identical + plant count grew).
4. chain-plant spore/settle fires (byte-identical + base count grew) — unless
   deferred per step 3's escape hatch.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; a new `describe('reproducibility — graze-latch +
      sessile chain-plants + satiation ON', ...)` block exists and passes
- [ ] The new block asserts byte-identity of `latchPrey`, `latchCell`,
      `anchored`, `energy`, `organismId`, `cellType`, `posX`, `posY` across two
      runs (`grep` the block for each array name)
- [ ] The new block has at least 3 passing non-vacuity asserts (grazed,
      chain-plant grew, satiation released) — or 2 + a documented DEFERRED
      comment per step 3
- [ ] No files outside `src/core/sim/reproducibility.test.ts` are modified
- [ ] `plans/README.md` status row updated (if you maintain the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The two runs are **not byte-identical** for some array you asserted (after
  confirming you used identical config+seed+tick count). A determinism
  violation in the graze/chain-plant path is a real bug — STOP and report the
  diverging array + the hot-path code location. Do NOT weaken the equality
  assert to make it pass.
- The predation-ON block (your template) is not present or has drifted from the
  excerpts — re-anchor on the current file, but report.
- A non-vacuity assert cannot be made to pass even after the step-3 tuning, AND
  the step-3 escape hatch (documented DEFERRED) also doesn't fit (e.g. graze
  itself won't fire) — STOP; the config or the path is broken and the reviewer
  needs to see it.
- You find yourself wanting to edit `src/core/**` non-test source to make the
  test pass. STOP. That's a bug fix, out of scope here.
- The `sessilePlants` / `herbivoreLatch` knobs don't exist in `defaultConfig`
  at the names in "Current state" — the repo has drifted; re-grep and report.

## Maintenance notes

- When a future change adds another `herbivoreLatch`/`sessilePlants`-gated knob
  or array, this block should be extended to assert it byte-identical (add the
  array to the equality list) and to exercise it (add a non-vacuity assert).
- A reviewer should scrutinize: (a) the two runs use the SAME config object
  shape and seed — a common mistake is mutating `cfg` between runs; (b) the
  non-vacuity asserts are not tautologies (e.g.
  `expect(a.grazed).toBe(true)` where `grazed` is set unconditionally — it must
  be set only when the path actually fires); (c) no `Date.now()`/`Math.random`
  leaked into the test helper.
- The balance/economy validity of the graze+chain-plant config is NOT this
  test's job — it's `headless/feel-probe.ts`'s. If a reviewer asks "does this
  config actually sustain?", the answer is "out of scope; this test pins
  determinism only."
