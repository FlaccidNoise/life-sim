# Plan 001: Restore the CI/lint gate (fix the 5 eslint errors in graze-latch tests)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat cc34e07..HEAD -- src/core/cells/graze-latch.test.ts src/core/sim/graze-latch-nonkill.test.ts src/core/sim/config.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (CI/quality gate)
- **Planned at**: commit `cc34e07`, 2026-06-19

## Why this matters

`make check` (and the GitHub Actions CI on every push/PR) is currently **RED**.
`pnpm typecheck` and `pnpm test` (475/475) pass, but `pnpm lint` fails with 5
errors, all in two test files added by the recent graze-latch feature commits.
Because CI gates `pnpm lint` between `typecheck` and `test`, every push now
fails the lint step — regressions can slip through unnoticed. This plan fixes
those 5 errors so the gate is green again. It is the prerequisite for every
other plan: their done criteria call `pnpm lint`, which must pass first.

## Current state

The repo's lint gate (from `.github/workflows/ci.yml`):
```yaml
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

The exact 5 errors (from `npx eslint .`, parsed via `-f json`):

| File | Line:Col | Rule | Message |
|------|----------|------|---------|
| `src/core/cells/graze-latch.test.ts` | 48:35 | `@typescript-eslint/no-unused-vars` | `'cfg' is assigned a value but never used` |
| `src/core/cells/graze-latch.test.ts` | 198:12 | `@typescript-eslint/no-unnecessary-type-assertion` | unnecessary `!` |
| `src/core/cells/graze-latch.test.ts` | 294:21 | `@typescript-eslint/no-unnecessary-type-assertion` | unnecessary `!` |
| `src/core/cells/graze-latch.test.ts` | 312:21 | `@typescript-eslint/no-unnecessary-type-assertion` | unnecessary `!` |
| `src/core/sim/graze-latch-nonkill.test.ts` | 309:12 | `@typescript-eslint/no-unnecessary-type-assertion` | unnecessary `!` |

The two relevant excerpts:

`src/core/cells/graze-latch.test.ts:48` (the unused `cfg` parameter — `cfg` is a
function parameter that the body never reads):
```ts
function setup(mouthType: number, cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 })) {
```
Callers in this file invoke `setup(CellType.DIGESTIVE)` etc. without passing
`cfg`, so the default-arg expression is needed at the call boundary but the
parameter binding itself is unused. The fix is to prefix the parameter name
with `_` (the eslint config's default ignores `_`-prefixed unused vars), OR
remove the parameter and rely on a local `const cfg = defaultConfig(...)` inside
the body where it's actually used. **Prefer the `_cfg` rename** — it is the
smallest change, keeps the default-arg expression (which other tests may grow
to pass an override into), and matches the eslint convention.

The four `!` assertions are `noUncheckedIndexedAccess`-style non-null assertions
on **typed-array indexed access** (e.g. `f.energy[plant]!`, `f.energy[target]!`).
TypeScript's `noUncheckedIndexedAccess` does **not** apply `undefined` to
`Float32Array`/`Uint32Array` indexed access — those element accesses are already
`number`, so the `!` is genuinely redundant. Fix: delete the `!`.

## Commands you will need

| Purpose   | Command                | Expected on success |
|-----------|------------------------|---------------------|
| Lint      | `pnpm lint`            | exit 0, no errors   |
| Typecheck | `pnpm typecheck`       | exit 0, no errors   |
| Tests     | `pnpm test`            | 475 pass (unchanged)|
| Full gate | `make check`           | typecheck ✓, lint ✓, 475 tests ✓ |

The repo uses **pnpm** (see `package.json` `packageManager: pnpm@11.7.0`). Run
from the repo root.

## Scope

**In scope** (the only files you should modify):
- `src/core/cells/graze-latch.test.ts`
- `src/core/sim/graze-latch-nonkill.test.ts`

**Out of scope** (do NOT touch):
- `eslint.config.*`, `tsconfig.json` — the rules are correct; the code is wrong.
- Any non-test source file.
- Do not "fix" other `!` assertions elsewhere in the repo — out of scope and
  behavior-risky.

## Git workflow

- Branch: `advisor/001-fix-lint-ci-gate` (off `main`).
- One commit. Message style (match the repo — conventional commits, lowercased
  scope, e.g. from `git log`): `fix(lint): remove unused cfg param and redundant type assertions in graze-latch tests`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Fix the unused `cfg` parameter

In `src/core/cells/graze-latch.test.ts`, rename the `setup` function's second
parameter from `cfg` to `_cfg`:

```ts
function setup(mouthType: number, _cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 })) {
```

If the body of `setup` actually references `cfg` somewhere (search first with
`grep -n "cfg" src/core/cells/graze-latch.test.ts`), then instead introduce a
local `const cfg = _cfg;` on the first line of the body so the rest of the
function is unchanged. The goal is simply: no unused binding named `cfg`.

**Verify**: `grep -n "cfg" src/core/cells/graze-latch.test.ts` → only the
parameter line (and a possible `const cfg = _cfg` line) reference `cfg`.

### Step 2: Remove the four redundant `!` assertions

Delete the trailing `!` at these exact locations (read each line first to
confirm the current text — see "Current state" for the rule firing on each):

- `src/core/cells/graze-latch.test.ts:198` — the expression on that line ends in
  `!` applied to a `Float32Array`/`Uint32Array` indexed access.
- `src/core/cells/graze-latch.test.ts:294` — same.
- `src/core/cells/graze-latch.test.ts:312` — same.
- `src/core/sim/graze-latch-nonkill.test.ts:309` — same.

Each is a single-character deletion of the `!` immediately following a
`]`-closed indexed access like `arr[i]!` → `arr[i]`. Read each line before
editing to make sure you're deleting the assertion `!`, not a logical-not `!`
or part of `!=`.

**Verify**: `pnpm lint` → exit 0, no errors.

### Step 3: Confirm nothing else regressed

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm test` → 475 passed (the test count must not drop; you changed no test
  logic, only a param name and 4 redundant assertions)

## Test plan

No new tests. The fix is mechanical; the existing 475 tests are the regression
guard (removing a `!` that the type system already proves redundant cannot
change runtime behavior). If `pnpm test` shows any failure, that is a STOP
condition — do not "fix" the test to make it pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0 (zero errors)
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with exactly 475 tests passing
- [ ] `make check` is green end-to-end
- [ ] No files outside `src/core/cells/graze-latch.test.ts` and
      `src/core/sim/graze-latch-nonkill.test.ts` are modified (`git status`)
- [ ] `plans/README.md` status row updated (if you maintain the index)

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (e.g. line 48 isn't the
  `setup(mouthType, cfg = ...)` signature; the repo has drifted — re-confirm the
  eslint output with `npx eslint . -f json` and fix the *current* locations, but
  report the drift).
- Removing a `!` causes a `tsc` type error (it shouldn't, since the assertion is
  flagged as unnecessary — but if it does, STOP; that means the lint rule and
  the type system disagree and the reviewer needs to see it).
- `pnpm test` shows any test failure after your edits.
- The eslint output shows MORE than these 5 errors (there is additional lint
  debt; do not expand scope — report it).

## Maintenance notes

- This plan is the unblock for plans 002–005, whose done criteria all require
  `make check` green. Land it first.
- The root cause (typed-array `!` assertions + an unused param) is a one-off
  from a fast-moving feature commit, not a systemic pattern — a reviewer should
  glance at whether other recent test files carry the same habit, but that's
  out of scope here.
- The `_cfg` rename preserves the default-arg `defaultConfig({...})` expression
  so a future test can pass an override: `setup(CellType.DIGESTIVE,
  defaultConfig({ cellRadius: 4 }))`. Keep the default arg.
