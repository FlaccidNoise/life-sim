# Plan 004: Bundle `metabolize()`'s 31 positional args into named structs (reused-scratch, allocation-free)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the desired result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cc34e07..HEAD -- src/core/cells/metabolism.ts src/core/sim/world.ts src/core/cells/metabolism.test.ts src/core/cells/graze-latch.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (behavior-preserving; the byte-identical determinism test is
  the safety net)
- **Depends on**: `plans/002-graze-chainplant-determinism-test.md` — the new
  determinism case exercises the `metabolize` graze/satiation ON path
  byte-identically, which is the regression guard for this refactor. Do NOT
  run this plan before 002 lands (the OFF-path reproducibility tests alone
  don't cover the graze branch).
- **Category**: tech-debt (maintainability)
- **Planned at**: commit `cc34e07`, 2026-06-19

## Why this matters

`metabolize()` takes **31 positional arguments** (`src/core/cells/metabolism.ts`
signature). They include adjacent same-typed pairs: three `number`s
(`predDigestRate, predDigestEfficiency, predReach`), three `Uint32Array`s
(`latchPrey, latchCell, organismCellCount`), and four trailing `number`/
`boolean` graze knobs. Swapping any same-typed pair compiles clean under
`tsc --strict` and silently changes behavior on the hottest economy kernel.
The prior audit flagged this at 22 args (SIMP-002); the graze-latch feature
added 4 more and **worsened** it to 31. This plan groups the scalar economy
knobs and the typed-array refs into named structs, reusing per-tick scratch
objects (the repo's existing `reproParams` / `env` pattern) so the refactor
adds **zero allocations** on the hot path. Behavior is byte-identical; the
determinism test (002) is the proof.

## Current state

The current signature (`src/core/cells/metabolism.ts`, ~line 60-92):
```ts
export function metabolize(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  hash: SpatialHash,
  light: LightField,
  photoGain: number,
  photoDepletion: number,
  digestRate: number,
  digestEfficiency: number,
  baseToughness: number,
  basalCost: number,
  meatDecay: number,
  moveCost: number,
  neuralCost: number,
  digestBonus: Uint8Array,
  digestClusterBonus: number,
  env: EnvEffects,
  predDigestRate: number,
  predDigestEfficiency: number,
  predReach: number,
  latchPrey: Uint32Array,
  latchCell: Uint32Array,
  organismCellCount: Uint32Array,
  predLatchRange: number,
  herbivoreLatch: boolean,
  grazeRate: number,
  grazeLatchRange: number,
  grazeSatiation: number,
): void {
```

The single call site (`src/core/sim/world.ts`, ~line 734):
```ts
    metabolize(
      live, n, f, this.hash, this.light,
      cfg.photoGain, cfg.photoDepletion, cfg.digestRate, cfg.digestEfficiency,
      cfg.baseToughness, cfg.basalCost, cfg.meatDecay, cfg.moveCost, cfg.neuralCost,
      this.digestBonus, cfg.digestClusterBonus, env,
      cfg.predDigestRate, cfg.predDigestEfficiency, cfg.predReach,
      f.latchPrey, f.latchCell, this.organisms.cellCount,
      cfg.predLatchRange, cfg.herbivoreLatch, cfg.grazeRate, cfg.grazeLatchRange, cfg.grazeSatiation,
    );
```

**The precedent to copy — the repo's reused-scratch struct pattern.** The
codebase already does exactly this for two other hot-path call sites:
- `EnvEffects` (the `env` arg above) — a typed object, reused via a
  `World.env` scratch mutated each tick (see the audit's ENV-01 fix and the
  `world.ts` `syncEnv`/`this.env` machinery).
- `reproParams` — a `ReproParams` struct reused per-tick at `world.ts:169-179`
  (referenced in `docs/decisions/INDEX.md` and the scaling plan).

This plan adds two more structs in the same style. Match their shape: an
`interface` declared in the relevant module, a `readonly` field on `World`
holding one pre-allocated instance, mutated in place each tick before the
call (no `new` in the tick loop).

The determinism contract (`src/core/sim/reproducibility.test.ts`) — including
the graze/chain-plant ON case from plan 002 — must remain byte-identical
before and after this refactor. That is the safety net.

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                 | exit 0              |
| Tests     | `pnpm test`                      | all pass (475 + 002's new) |
| Lint      | `pnpm lint`                      | exit 0              |
| Determinism | `pnpm test -- reproducibility` | all pass (the byte-identity proof) |
| Full gate | `make check`                     | green               |

## Scope

**In scope** (the only files you should modify):
- `src/core/cells/metabolism.ts` — new interfaces, change the signature, update
  the body's local references (the body reads the params by name; grouping
  changes the access path `x` → `economy.x` etc., not the logic).
- `src/core/sim/world.ts` — declare the two scratch struct fields, populate
  them each tick (in `tick`, near the existing `syncEnv`/`syncReproParams`
  calls), update the `metabolize(...)` call site.
- `src/core/cells/metabolism.test.ts` — update the existing unit tests' call
  sites to the new signature (these construct args inline; re-group them into
  the structs).
- `src/core/cells/graze-latch.test.ts` — same: update the `step`/`metabolize`
  call sites in this file's helper to the new signature.

**Out of scope** (do NOT touch):
- `src/core/sim/reproducibility.test.ts` — it calls `world.tick`, not
  `metabolize` directly, so it needs no change; it is the regression guard.
- Any other `metabolize` caller (there is exactly one: `world.ts`).
- The `EnvEffects`/`env` struct or the `reproParams` struct — leave them; this
  plan adds NEW structs, doesn't refactor the existing ones.
- `config.ts` — no config changes.
- The actual metabolism logic (the graze-latch branch, the satiation
  short-circuit, the predation branch, the env effects). **Only the arg
  grouping changes.** If you find a logic bug while refactoring, STOP and
  report it separately — do not fix it in this plan.

## Git workflow

- Branch: `advisor/004-metabolize-arg-structs` (off `main`, or off 002's
  branch if 002 has landed — the dependency is real).
- Commit per logical unit is encouraged (e.g. (1) add interfaces + scratch
  fields without changing the call, (2) switch the signature + call site +
  tests). Message style: `refactor(metabolize): bundle economy + latch/predation args into reused-scratch structs`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Decide the struct boundaries and declare the interfaces

Group the 31 args into (keep `live, n, f, hash, light` as direct args — they're
the "what to iterate" set, distinct each call; everything else is "params"):

1. `EconomyParams` — the scalar economy knobs:
   `photoGain, photoDepletion, digestRate, digestEfficiency, baseToughness,
   basalCost, meatDecay, moveCost, neuralCost, digestClusterBonus`.
   (10 numbers.)
2. `PredationParams` — the predator-latch scalar knobs:
   `predDigestRate, predDigestEfficiency, predReach, predLatchRange`.
   (4 numbers.)
3. `GrazeParams` — the herbivore graze-latch knobs:
   `herbivoreLatch: boolean, grazeRate, grazeLatchRange, grazeSatiation`.
   (1 boolean + 3 numbers.)
4. `LatchArrays` — the typed-array refs:
   `digestBonus: Uint8Array, latchPrey: Uint32Array, latchCell: Uint32Array,
   organismCellCount: Uint32Array`.
   (4 typed arrays — `digestBonus` rides here because it's a per-cell array
   like the latch arrays, not a scalar knob.)

Keep `env: EnvEffects` as-is (already a struct).

Declare these interfaces in `src/core/cells/metabolism.ts` (exported, next to
`EnvEffects`). Field order within each struct: the SAME order as the current
positional args (so a reviewer can eyeball the 1:1 mapping).

**Verify**: `pnpm typecheck` → exit 0 (interfaces declared, not yet used — no
error).

### Step 2: Change the `metabolize` signature and body

New signature:
```ts
export function metabolize(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  hash: SpatialHash,
  light: LightField,
  economy: EconomyParams,
  env: EnvEffects,
  pred: PredationParams,
  graze: GrazeParams,
  arrays: LatchArrays,
): void {
```

Update the body's references: every bare `photoGain` → `economy.photoGain`,
`digestRate` → `economy.digestRate`, `predDigestRate` → `pred.predDigestRate`,
`herbivoreLatch` → `graze.herbivoreLatch`, `latchPrey` → `arrays.latchPrey`,
`digestBonus` → `arrays.digestBonus`, etc. This is a mechanical find-replace
per name; **do not change any expression's logic, operator, or order**.

**Verify**: `pnpm typecheck` → will FAIL at the call site and the test call
sites (expected — step 3 fixes them). Confirm the ONLY errors are
"metabolize expected N arguments, got M" or property-name mismatches at the
`world.ts` call and the two test files. If `metabolism.ts` itself has a
typecheck error, STOP — you made a reference-rename mistake; fix it before
proceeding.

### Step 3: Update the call site in `world.ts`

1. Add two `readonly` scratch fields on `World` (near the existing
   `this.env` / `this.reproParams` declarations, ~`world.ts:150-180`):
   ```ts
   readonly predParams: PredationParams;
   readonly grazeParams: GrazeParams;
   ```
   (Pre-allocate once in the constructor with the default values, like
   `reproParams`. `EconomyParams` and `LatchArrays` can be built inline at the
   call site OR also be scratch fields — your choice, but prefer scratch for
   `EconomyParams` since it has 10 fields and is mutated every tick. The
   `LatchArrays` refs (`this.digestBonus`, `f.latchPrey`, `f.latchCell`,
   `this.organisms.cellCount`) are already stable references — a fresh object
   literal per tick is cheap but to match the "zero hot-loop allocation" rule
   from the audit, make it a scratch field too, mutated in place.)

2. Add a `syncEconomyAndLatch()`-style private method (or inline the mutations
   in `tick` next to `syncEnv`/`syncReproParams`) that copies the current
   `cfg.*` values into the scratch structs each tick. Mirror how
   `syncReproParams` works.

3. Replace the `metabolize(...)` call (the 31-arg form in "Current state")
   with the 10-arg form using the scratch structs and `f`/`this.hash`/
   `this.light`/`env`.

**Verify**: `pnpm typecheck` → exit 0 (call site now matches the new
signature). `pnpm test -- reproducibility` → ALL reproducibility tests still
pass byte-identically (this is the critical proof the refactor preserved
behavior).

### Step 4: Update the two test files' call sites

`src/core/cells/metabolism.test.ts` and `src/core/cells/graze-latch.test.ts`
both call `metabolize(...)` (or a `step()` helper that wraps it) with inline
args. Re-group their inline args into the new structs. Keep the test VALUES
identical — only the grouping changes. If a test builds its args via a
`defaultConfig()` and reads `cfg.x`, you can build the structs by spreading
the cfg fields, e.g. `economy: { photoGain: cfg.photoGain, ... }`.

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm test` → all pass (475 + 002's new tests). No test count change, no
  test logic change — only call-site regrouping.

### Step 5: Full gate

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm test` → all pass
- `make check` → green

## Test plan

No NEW tests — the existing suite + plan 002's determinism case ARE the test
plan. The refactor is behavior-preserving by construction; the byte-identical
reproducibility contract is the proof. Specifically:
- `pnpm test -- reproducibility` (incl. 002's graze/chain-plant/satiation ON
  case) must be byte-identical pre- and post-refactor. Run it BEFORE
  (baseline) and AFTER; the two `Array.from(...)` equality asserts must still
  pass.
- The existing `metabolism.test.ts` and `graze-latch.test.ts` unit tests
  verify the per-tick energy math is unchanged (their `expect(f.energy[...]`
  assertions must still hold to the same values).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0 with the same count as before this plan (475 + 002's
      new tests)
- [ ] `pnpm test -- reproducibility` passes byte-identically (no array-
      equality assert weakened)
- [ ] The `metabolize` signature has exactly 10 parameters (`grep -n "export function metabolize" src/core/cells/metabolism.ts` + read the signature)
- [ ] No `new EconomyParams`/`new PredationParams`/etc. inside the `tick()`
      hot loop (`grep -n "new EconomyParams\|new PredationParams\|new GrazeParams\|new LatchArrays" src/core/sim/world.ts` returns nothing — scratch fields are mutated, not allocated)
- [ ] `EconomyParams`, `PredationParams`, `GrazeParams`, `LatchArrays`
      interfaces are `export`ed from `metabolism.ts`
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated (if you maintain the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The reproducibility test (any case, but especially 002's graze/chain-plant ON
  case) is NOT byte-identical after the refactor. A divergence means the
  regrouping changed behavior (most likely: a field wired to the wrong struct
  member, or a scratch struct mutated by a later tick-step that reads the old
  value). STOP — do not "adjust" the test; find the wiring error.
- `metabolize` has a caller OTHER than `world.ts` and the two test files
  (grep `metabolize(` across `src/`). Each extra caller is a test-site update
  you must add to scope — report it before proceeding.
- A struct field would need a different type than the original positional arg
  (e.g. a `Uint8Array` accidentally grouped into a scalar struct). Re-group;
  do not change types.
- You discover a genuine logic bug in the metabolism body while renaming
  references. STOP; report the bug; do NOT fix it in this plan (open a
  separate finding).
- The repo's `reproParams`/`env` scratch pattern referenced in "Current state"
  is not found at `world.ts:150-180` / the `syncReproParams` method — repo
  drift; re-locate and report.

## Maintenance notes

- After this lands, a future metabolism knob addition is ONE new struct field +
  one assignment in the sync method, not a new positional arg slipped into a
  same-typed run. That's the whole point.
- A reviewer should verify the 1:1 field mapping (struct field order matches
  the old positional order) and that NO scratch struct is read by a later
  tick-step before it's re-synced (the scratch is mutated each tick before
  `metabolize`; if a future change moves the call, the sync must move too).
- The `LatchArrays` struct bundles `digestBonus` (a per-cell array) with the
  latch arrays. If a future change makes `digestBonus` per-organism or removes
  it, revisit the grouping — but the grouping is a naming concern, not a
  behavior one.
- If plan 002 has NOT landed, do NOT run this plan — the OFF-path
  reproducibility tests don't cover the graze branch you're refactoring, so a
  behavior change there could slip through. This is a hard dependency.
