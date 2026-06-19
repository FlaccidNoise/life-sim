# Plan 003: Add stability-cap tests for `grazeLatchStiffness` and `predLatchStiffness`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cc34e07..HEAD -- src/core/sim/config.test.ts src/core/sim/config.ts src/core/physics/latch-tether.ts src/core/physics/latch-tether.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-fix-lint-ci-gate.md` (so `make check` is green as
  the done-criteria gate).
- **Category**: tests (safety guard)
- **Planned at**: commit `cc34e07`, 2026-06-19

## Why this matters

The bond spring's stiffness (`bondStiffness`) is gated by a `config.test.ts`
assertion that keeps `bondStiffness·dt² ≤ 2.5`, well under the symplectic-Euler
two-free-mass divergence ceiling (~3). This guard exists because at `k=8` the
SoA state diverges to ~1e162 — a documented audit blocker that was fixed by the
gate.

The two **latch tether springs** (`predLatchStiffness` for predators,
`grazeLatchStiffness` for herbivores) are raw scatter springs applied in the
SAME symplectic-Euler force stage as bonds (`src/core/physics/latch-tether.ts`,
called from `world.ts`), with the same `fx = stiffness·dx` mutual form and no
`/d` normalization. They have the **same divergence physics** as bonds, but
**no cap, no config-test gate, and no divergence test**. A future slider or
re-tune could drive either past the ceiling and diverge SoA state to ±∞ — the
exact failure the bond gate prevents. This plan closes that gap for both
springs.

## Current state

The existing bond guard to mirror (`src/core/sim/config.test.ts:88-103`):
```ts
describe('M5 config', () => {
  it('exposes bond/organism/transfer/adhesion knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.bondStiffness).toBeGreaterThan(0);
    // Symplectic-Euler stability (audit blocker): the bond spring's effective k = bondStiffness·perBondStiffness
    // ... The two-free-mass ceiling for dt=1/damping=0.5/mass=1 is ~3; ... k=8 diverges to ~1e162.
    // Gate the default well under the ceiling so a future re-tune to an unstable value fails HERE ...
    expect(c.bondStiffness * c.dt * c.dt).toBeLessThanOrEqual(2.5);
    ...
    expect(c.transferRate).toBeLessThanOrEqual(0.5); // stability bound
```

The latch tether kernel — `src/core/physics/latch-tether.ts`
`applyLatchTether(live, n, latchCell, latchPrey, cellType, organismId, radius,
posX, posY, forceX, forceY, worldW, worldH, stiffness, grazePhoto)`. It applies
`f = stiffness·(dist−rest)/dist · dx` (with a rest length = `ri+rj` contact) to
both endpoints, equal and opposite (Newton's 3rd). The existing tests
(`src/core/physics/latch-tether.test.ts`) cover correctness (equal-and-opposite,
no-op at rest, stale-handle rejection, graze-vs-pred validity) but **not**
divergence/stability.

The two knobs (from `src/core/sim/config.ts`):
```
predLatchStiffness: 0,     // default OFF; ecology config sets 1.0
grazeLatchStiffness: 0.8,  // default ON-demo; gentle tether
```
Both are `number` fields on the `Config` type; `defaultConfig()` returns them.

**The stability criterion.** The bond gate uses `k·dt² ≤ 2.5` where the
ceiling is ~3 for two equal free masses at `dt=1, damping=0.5, mass=1`. The
latch tether has the same integrator, same mass regime (a predator/prey or
forager/plant pair), and the same mutual-spring form — so the **same ceiling
applies**. (The latch's `(dist−rest)/dist` factor is ≤ the bond's `/d` factor
at typical separations, so the latch is no MORE stable than a bond at equal k;
the bond gate is a safe, conservative bound to reuse.)

## Commands you will need

| Purpose   | Command                          | Expected on success |
|-----------|----------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                 | exit 0              |
| Tests     | `pnpm test -- config.test latch-tether` | all pass |
| Lint      | `pnpm lint`                      | exit 0              |
| Full gate | `make check`                     | green               |

## Scope

**In scope** (the only files you should modify):
- `src/core/sim/config.test.ts` — add stiffness-cap asserts for the two latch
  knobs, mirroring the bond assert.
- `src/core/physics/latch-tether.test.ts` — add ONE divergence test asserting
  that a stiffness above the ceiling produces non-finite force (the
  "fails-here-not-13-tasks-later" guard, mirroring the bond gate's rationale).

**Out of scope** (do NOT touch):
- `config.ts` — do NOT add a runtime clamp. The repo's pattern is a TEST gate
  that fails at re-tune time, not a silent clamp (the bond knob is uncapped at
  runtime too; the test is the guard). Adding a clamp would be a behavior
  change and a different decision.
- `latch-tether.ts` source.
- The bond stiffness assert or any existing test.

## Git workflow

- Branch: `advisor/003-latch-stiffness-cap` (off `main` or off 001 if landed).
- One commit. Message: `test(config,physics): gate latch tether stiffness under the symplectic-Euler ceiling`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the two config-test cap asserts

In `src/core/sim/config.test.ts`, inside the existing `describe('M5 config', ...)`
block (or a new `describe('ecology/latch config', ...)` block immediately after
it — your choice, but match the file's style), add asserts that mirror the bond
gate for both latch knobs:

```ts
// Latch tether springs share the bond spring's symplectic-Euler divergence
// physics (mutual fx=stiffness·dx, same force stage, same mass regime — see
// latch-tether.ts). Gate their defaults under the same k·dt² ≤ 2.5 ceiling so
// a future re-tune past the ~3 two-free-mass ceiling fails here, not as Inf/NaN
// in the SoA force buffers. (Defaults are 0 and 0.8, both well under; this
// guards against a bad slider/re-tune.)
expect(c.predLatchStiffness * c.dt * c.dt).toBeLessThanOrEqual(2.5);
expect(c.grazeLatchStiffness * c.dt * c.dt).toBeLessThanOrEqual(2.5);
```

**Verify**: `pnpm test -- config.test` → passes (the defaults `0` and `0.8`
with `dt` from `defaultConfig()` are both ≤ 2.5 — confirm `c.dt` value first
with a quick `grep -n "dt:" src/core/sim/config.ts` if unsure).

### Step 2: Add a divergence test to `latch-tether.test.ts`

Add one `it(...)` to the existing `describe('applyLatchTether', ...)` block in
`src/core/physics/latch-tether.test.ts`. It asserts that a stiffness ABOVE the
ceiling produces a non-finite (or explosively large) force — i.e. the guard in
step 1 is protecting against a real failure mode. Model it on the bond's
documented `k=8 diverges to ~1e162` evidence:

```ts
it('a stiffness above the symplectic-Euler ceiling drives the force toward divergence', () => {
  // The bond gate documents k·dt² ≤ 2.5 (ceiling ~3). At k=8 (k·dt²=8 with dt=1)
  // a mutual spring on two free masses diverges. The latch tether has the same
  // form, so an above-ceiling stiffness must show the instability HERE — a
  // single-tick force that is non-finite or |f| >> a sane stiffness's force.
  const s = setup(10); // dist 10, rest 6 → spring term 4
  applyLatchTether(
    s.live, 2, s.latchCell, s.latchPrey, s.cellType, s.organismId,
    s.radius, s.posX, s.posY, s.forceX, s.forceY,
    4096, 4096,
    1e6, // far above any sane stiffness; well past the ceiling
    false,
  );
  // A divergent spring either yields Infinity/NaN, or a force vastly larger
  // than the k=1 baseline (which is ~4 for this geometry — see the first test).
  // Assert the instability is visible, not hidden.
  const f = s.forceX[0]!;
  expect(!Number.isFinite(f) || Math.abs(f) > 1e3).toBe(true);
});
```

Notes:
- `setup(dist)` is the file's existing helper (see "Current state" — it builds a
  2-cell predator/prey geometry with `latchCell[0]=2` etc.). Reuse it; do not
  duplicate.
- The exact divergence threshold (`1e3`) is deliberately loose — the point is
  "instability is visible", not a precise divergence proof. The step-1 config
  gate is the precise guard. If `1e6` stiffness at this geometry yields a
  finite-but-huge force (e.g. `4e6`), the `> 1e3` branch covers it. If it yields
  `Infinity`, the `!isFinite` branch covers it. Either is acceptable evidence.
- If the kernel clamps or otherwise prevents the divergence (it does not, per
  the source read, but verify), STOP — that changes the plan.

**Verify**: `pnpm test -- latch-tether` → all pass, including the new `it`.

### Step 3: Full gate

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `pnpm test` → all pass; `config.test.ts` gained 2 asserts, `latch-tether.test.ts`
  gained 1 `it`.

## Test plan

This plan is itself the test plan. No source changes, so no behavioral
regression risk.

Cases covered:
1. `config.test.ts`: `predLatchStiffness·dt² ≤ 2.5` (gate).
2. `config.test.ts`: `grazeLatchStiffness·dt² ≤ 2.5` (gate).
3. `latch-tether.test.ts`: above-ceiling stiffness shows visible instability
   (the divergence the gate prevents).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -n "predLatchStiffness \* c.dt" src/core/sim/config.test.ts` returns
      a line asserting `≤ 2.5`
- [ ] `grep -n "grazeLatchStiffness \* c.dt" src/core/sim/config.test.ts`
      returns a line asserting `≤ 2.5`
- [ ] `grep -n "divergence\|ceiling\|isFinite" src/core/physics/latch-tether.test.ts`
      returns the new divergence test
- [ ] No files outside `config.test.ts` and `latch-tether.test.ts` are modified
- [ ] `plans/README.md` status row updated (if you maintain the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The default `dt` in `defaultConfig()` makes `grazeLatchStiffness·dt² > 2.5`
  (i.e. the current default `0.8` already exceeds the gate). That would mean the
  gate as written fails on the unmodified config — STOP and report the actual
  `dt` and product; the reviewer decides whether to lower the default or raise
  the gate bound (do NOT silently pick one).
- The latch tether kernel normalizes by distance in a way that makes the
  `1e6`-stiffness force small and finite (so the divergence test's
  `> 1e3 || !isFinite` assert fails). Report the actual force value; the
  reviewer decides a new threshold.
- The knobs are not named `predLatchStiffness` / `grazeLatchStiffness` in
  `defaultConfig()` — repo drift; re-grep and report.
- You find yourself wanting to edit `config.ts` or `latch-tether.ts` source.
  STOP — that's out of scope (a runtime clamp is a different decision).

## Maintenance notes

- If a future change raises either latch stiffness default, the config test will
  fail at the gate — that's the intended behavior. The fix is to re-derive
  stability (the ceiling is ~3 for the current integrator+mass regime; if the
  integrator changes, re-derive BOTH the bond and latch gates together).
- A reviewer should confirm the two config asserts use the SAME bound (`2.5`)
  and SAME formula (`k·dt²`) as the bond assert — consistency is the point.
- The divergence test is evidence the guard is non-vacuous (the bad value
  really does blow up). If a future kernel change makes the tether
  self-stabilizing, the divergence test may need updating — but then the gate
  may be unnecessary too; revisit together.
