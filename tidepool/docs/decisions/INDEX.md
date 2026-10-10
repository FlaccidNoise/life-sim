# Tidepool — Decision Log

Decisions that are hard to reverse. One line each, with where the reasoning lives. The draft's log is
`/docs/decisions/INDEX.md`. It does not bind Tidepool, but its measured lessons are collected in
`../research/draft-inventory.md` and they do.

## Game

- 2026-10-09: Tidepool is a ground-up rebuild in `tidepool/`, as a game. The draft in `/src` is kept as
  a reference and is not extended. → `../design.md` §1
- 2026-10-09: The player is a lineage. Steer one creature. On death, continue as a descendant.
  → `../design.md` §15 rows 1 and 2
- 2026-10-09: The world gets harder through a time-skip on death in a persistent world, not through
  real-time evolution during play. → `../design.md` §4
- 2026-10-09: Sandbox with no required goal. Zones, chronicle, and rivals are pulls. Endgame deferred.
  → `../design.md` §3
- 2026-10-09: Watch mode with full debug control ships in v1, on the same simulation as Play.
  → `../design.md` §9
- 2026-10-09: One scale, a rigid body with evolved parts, parts grant abilities. No multicellular soft
  bodies. → `../design.md` §5, §12
- 2026-10-09: Brains have variable topology, recurrent state, per-neuron time constants, and inputs and
  outputs declared by parts. A brain viewer is a first-class feature. → `../design.md` §6
- 2026-10-09: **Evolution only in v1. Within-life learning is a Lab toggle, off by default, in a later
  milestone.** This revises the draft's 2026-06-20 decision that made learning core: the old rule
  reached 34% of the weights and measured net-harmful. → `../design.md` §6
- 2026-10-09: Reproduction is budding, with optional gene mixing by mutual consent. Lineage is a tree
  through the budding parent. → `../design.md` §5.6
- 2026-10-09: One tall continuous world with four zones. → `../design.md` §7
- 2026-10-10: A Filter mouth eats on contact with no brain output. The draft measured brain-gated
  eating at 2.7 times fewer creatures. → `../plans/2026-10-10-m0-m1-first-swim.md` Task 13

## Architecture

- 2026-10-10: **The simulation core is Rust compiled to WebAssembly with SIMD.** Measured 2.0 to 2.6
  times faster than TypeScript at 1,000 to 2,000 creatures. TypeScript misses the time-skip budget at
  1,000. This reverses the draft's 2026-06-15 "TypeScript over Rust". → `../research/kernel-bench.md`
- 2026-10-10: No `wasm-bindgen`. A hand-written C ABI. → `../architecture.md` §1, §6
- 2026-10-10: One simulation worker. No `SharedArrayBuffer`, no WASM threads. Frames cross by transfer.
  → `../architecture.md` §3, `../research/tech-feasibility.md`
- 2026-10-10: The time-skip sets the population. Reference world: 1,500 creatures. Floor: 2,400 ticks
  per second. Skip target 24,000 ticks, hard stop at 30 seconds of wall time. → `../architecture.md` §2
- 2026-10-10: Tick is 1/20 second. Creatures sense and think on every second tick, staggered.
  → `../architecture.md` §2
- 2026-10-10: The state hash is the CRC of the snapshot bytes, so the hash and the save cannot disagree
  about what the state is. → `../architecture.md` §5.3
- 2026-10-10: Native and WASM must give the same hash. No standard-library transcendental functions in
  the core. → `../architecture.md` §5.3
- 2026-10-10: WebGL2 only, hand-written. Preact with signals for UI. Netlify for hosting.
  → `../architecture.md` §1
- 2026-10-10: The throughput gate times the `.wasm` in Node, because the floor in §2 is defined for
  WASM. The native bench stays for probes. Found by the M0 audit: native read 1.46 times WASM.
  → `../gates.md`

## Process

- 2026-10-09: Every milestone ends playable. A feature that fails its measurement is deleted, not
  flagged off. → `../roadmap.md`
- 2026-10-09: Simulation changes are gated at 12,000 ticks on 3 seeds, one run at a time, against a
  baseline. Carried over from the draft's 2026-09-07 rule. → `../roadmap.md`
- 2026-10-10: Building is done by sub-agents under an orchestrator, one task per agent, with the tier
  named per task. → `../architecture.md` §12
