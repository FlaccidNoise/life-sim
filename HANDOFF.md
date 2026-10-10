# Handoff — Tidepool: planning done, build starts at Task 1

**Date:** 2026-10-10
**Project:** life-sim, subproject `tidepool/`

The previous handoff (draft ecology work, 2026-09-07) is at `git show 90dbb50:HANDOFF.md`. The draft in
`src/` is frozen.

## Current Task

Build Tidepool milestones M0 (foundation) and M1 (first playable) from the plan. The next session is an
orchestrator: it dispatches sub-agents per task, checks each claim, and commits. No game code exists yet.

## Completed

- Owner interview and locked game design.
- Three research reports and a TypeScript against Rust/WASM benchmark.
- Architecture, roadmap (M0 to M8), and a 20-task plan for M0 and M1.
- Toolchain claims in the plan were run in a scratch project and work.

## Pending

1. Tasks 1 to 9 (M0), then 10 to 20 (M1), in the plan's batch order.
2. Owner checks at M1 exit: `/?bench` on a phone and a mid-range laptop, and a five-minute feel test.
3. Plan M2 from what M1 measured.

## Open Questions

- **Push rule conflict.** The root `AGENTS.md` says push at session end. The owner's global rules say
  push only when asked. This session followed the root file. The owner should pick one.
- Whether one time-skip (24,000 ticks) changes anything a player can see. First read: Task 16
  `probe-skip`. Proven or killed at M5.

## Key Decisions

All in `tidepool/docs/decisions/INDEX.md`. The three a fresh session is most likely to second-guess:

- Rust/WASM core, not TypeScript. Measured, not preferred.
- About 1,500 creatures, not the draft's 5,000 or more. The time-skip budget sets it.
- Evolution only. Learning is a later Lab toggle.

## Relevant Files

| File | Notes |
|------|-------|
| `tidepool/docs/plans/2026-10-10-m0-m1-first-swim.md` | **The plan.** 20 tasks, batches A to O, agent per task |
| `tidepool/AGENTS.md` | Gotchas for anyone working in `tidepool/` |
| `tidepool/docs/architecture.md` | Budgets (§2), determinism (§5.3), agent tiers (§12) |
| `tidepool/docs/design.md` | The game. Risks R1 to R13 in §13 |
| `tidepool/docs/roadmap.md` | Exit checks per milestone |
| `tidepool/docs/research/kernel-bench.md` | Why Rust, and the per-phase costs |
| `tidepool/docs/research/draft-inventory.md` | What the draft measured. Constraints C1 to C37 |
| `tidepool/spikes/kernel-bench/rust/src/lib.rs` | Compiled reference for the hash, brain step, and diffusion |

## Context & Warnings

- Working tree is clean. Branch `main`.
- Rust 1.99.0 is installed at user level. If `cargo` is not found: `. "$HOME/.cargo/env"`.
- `tidepool/` has no `Makefile` or `package.json` until Task 1.
- Function bodies in the plan were not compiled. Signatures, layouts, test assertions, and commands are
  binding. The plan's "Known soft spots" section lists what to expect.
- Every parameter default is arithmetic. Task 16 tunes against the health gate.
- The repo is public. Keep home paths and host addresses out of commits.
- The benchmark agent from the planning session never wrote its report. The orchestrator finished it.
  Lesson: an idle sub-agent with no report has failed. Check, do not wait.

## Suggested Next Steps

1. Read the plan in full. Map its Batches table to dispatches.
2. Dispatch Task 1 to `coder-std`. Verify with `make check` from `tidepool/`. Commit.
3. Continue batch by batch. Two agents share a batch only where the table says so.

## Copy-paste prompt

```
You are the orchestrator for building Tidepool: a browser game with a Rust/WebAssembly life simulation,
where the player is one creature among evolving creatures that each run a neural network. You do not
write the code. You dispatch sub-agents, verify what they claim, and commit.

## Context
Repo: ~/CodingProjects/life-sim, branch main. Tidepool is in tidepool/. The code in src/ is a frozen
first draft: do not touch it. A planning session produced the design, the architecture, a roadmap, and
a 20-task plan for milestones M0 (foundation) and M1 (first playable). No game code exists yet.

## Read first, in this order
1. tidepool/AGENTS.md
2. tidepool/docs/plans/2026-10-10-m0-m1-first-swim.md  (all of it)
3. tidepool/docs/architecture.md  (§2 budgets, §5.3 determinism, §12 agent tiers)
4. tidepool/docs/roadmap.md  (M0 and M1 exit checks)
5. HANDOFF.md

## Decided. Do not reopen without new evidence.
- Core: Rust to wasm32 with SIMD, zero crates, hand-written C ABI, one worker, no SharedArrayBuffer.
  Measured 2.0 to 2.6x faster than TypeScript (tidepool/docs/research/kernel-bench.md).
- Budget: 2,400 ticks per second at about 1,500 creatures. The time-skip sets the population.
- Full list: tidepool/docs/decisions/INDEX.md

## What a fresh session gets wrong
- tidepool/ is its own pnpm root. Run pnpm and make from tidepool/, never from the repo root.
- If cargo is not found: . "$HOME/.cargo/env"   (rustc 1.99.0 is installed)
- Function bodies in the plan were not compiled. Signatures, layouts, test assertions, and commands
  are binding. Fix a snippet that does not compile and keep its signature.
- Parameter defaults are arithmetic, not measurement. Task 16 tunes them. Do not tune earlier.
- One 12,000-tick simulation at a time. Never two tuners on one world.
- A sub-agent's report is a claim. An idle agent with no report has failed.
- Browser checks: an unused port each time, tab in the foreground.

## What I need you to do
1. Run git log --oneline -5 and ls tidepool. Confirm they match HANDOFF.md.
2. Execute the plan with sub-agents, batch by batch, following its Batches table (A to O).
   - Use the agent named in each task heading: coder and senior-coder and auditor run Opus 5.5,
     coder-std and task-std run Sonnet 5.5. Use quick-task with model "haiku" for lookups that feed
     no decision, such as listing files or grepping a log.
   - Give each agent: its task section from the plan word for word, the plan's Global constraints
     section, and the paths to read. Agents start with no context.
   - Where two tasks share a batch, tell each agent which files belong to the other and that it must
     not edit or revert them.
3. After each report: run the task's check commands yourself, read the diff, then commit with the
   message the task gives.
4. Keep going through M0 into M1 without checking in. Stop and tell me only when: a step fails 3
   times, Task 5 cannot make native and WASM hashes equal, Task 16 uses 12 tuning trials without a
   pass, an audit finding needs a rule change, or M1 is done and the owner checks in Task 20 are due.
5. Start with Task 1 now.
```
