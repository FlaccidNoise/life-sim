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
- 2026-10-10: The M1 defaults are tuned against the health gate: `plant_growth` 0.02 and `intake_rate`
  0.08. Every other default is still arithmetic. Found in 5 of the 12 trials allowed.
  → `../findings/m1-tuning.md`
- 2026-10-10: Five rule questions from the M1 audit are the owner's to decide: grazing that follows
  scent, who counts as an heir, bodies at the gene floor, a push that ignores mass, and flat brain
  upkeep. No rule was changed for them in M1. The owner decided all five on 2026-10-11: see the five
  entries below. → `../findings/m1-exit.md`

- 2026-10-11: **Scent grazing that thins the world is fixed with numbers first, inside the M2 retune, not
  with a rule change now.** M2 changes what a body costs and eats, so it retunes anyway. Order: a probe
  counts plant deaths by cause with the sense on and off, then one trial of `bite_fraction`, then one of
  `plant_seed_range`, each read at 36,000 ticks against a sense-off pair. If the two trials do not close
  the gap, the fallback is a rule: a bite cannot take a plant under `plant_death_reserve`.
  → `../findings/m1-exit.md` problem 2, `../findings/m1-audit.md` finding F2
- 2026-10-11: **Possessing a creature also marks its living descendants.** A child born before the
  player took the body is an heir. `possess` scans the stored parent uid once, through living parents
  only. A descendant behind a dead parent is missed until M5 builds the lineage tree. A body the player
  left stays an heir, and the heirs of a death stay every marked creature. Built in M2.
  → `../design.md` §5.6, `../findings/m1-audit.md` finding F5
- 2026-10-11: **Body size gets a real tradeoff in M2.** Upkeep grows slower than mass. Intake scales with
  the mouth part, and the mouth scales with the area of the body, not its length. A small body stays
  cheaper to build and faster to its first bud. Judged at 36,000 ticks on 3 seeds: mean length away from
  both walls of its range, and a spread that does not collapse. Rejected: pinning the size genes, and
  waiting for predation in M4. → `../findings/m1-exit.md` problem 1, `../findings/m1-skip-drift.md`
- 2026-10-11: **The push between two bodies is split by mass.** The lighter body moves more, and two
  equal bodies move as they do now. A heavy body holds its place on a plant, which is one more side of
  the size tradeoff. Built in M2 with the size rules. Measured before and after on the same seeds:
  throughput at the gate, the share of newborns that starve as juveniles, and the speed a possessed
  adult keeps in a crowd. → `../findings/m1-audit.md` "Findings that need a rule change" 4
- 2026-10-11: **Brain upkeep stays a fixed cost per neuron and per connection in M2.** Its two numbers are
  part of the M2 retune. The rule is decided in M3, when brains can change shape and evolution can
  answer it. A fixed cost per body favours a large body and a large egg, which is what makes the M2
  egg-size gene a real choice. The health gate reports two new measures with no band: the share of
  newborns that starve as juveniles and the share that reach a first bud. Rejected: a cost that scales
  with mass, and a cost that scales with growth. → `../findings/m1-audit.md` "Findings that need a rule
  change" 5, `../design.md` risk R1
- 2026-10-11: **The M2 plan is approved with seven differences from the roadmap and the design:** no
  maturity-age gene, brood size is not a gene, eyes feed four fixed brain inputs until M3, three part
  kinds ignore their place, parts ride in every frame record, gene ranges stay constants, and no taper
  gene or part-type mutation. → `../plans/2026-10-11-m2-bodies.md`. Corrected 2026-10-12: four kinds
  ignore their place, not three. The plan's rule for the Fin never read its place, and the code
  does not.
- 2026-10-11: **The bands of `gate-evolve` follow their proofs.** The two "evolution keeps the sense" bands
  are 0.10, not 0.02: two worlds with the same useless sense gave gaps up to +0.07 by chance. The
  `parts` band stays at 3.0 and is proven on a harder bad world, because a world that can smell and
  see kept 4.6 to 4.8 parts under removal with no gain. A blind run that dies out fails its seed.
  → `../gates.md` "Gate-evolve"
- 2026-10-11: **The fallback rule for grazing is built.** The two trials of the grazing decision did not
  close the gap: `bite_fraction` 0.02 read 88%, 87%, 68% of the blind-eye world and put body length on
  its floor, and `plant_seed_range` 96 changed nothing. So a bite cannot take a plant under
  `plant_death_reserve`, as that decision said. With sight a plant died 5 to 7 times as often, and the
  rich ground emptied first. → `../findings/m2-tuning.md`
- 2026-10-12: **The M2 retune closed at trial 8 of 12.** Six defaults moved: `plant_growth` 0.035,
  `plant_cap` 55, `part_mass` 1, `neuron_upkeep` 0.0012, `conn_upkeep` 0.0003, `birth_growth` 0.7. Body
  length holds on three of them at once, each at an end of its range. → `../findings/m2-tuning.md`
- 2026-10-12: **A part has no upkeep of its own. `part_upkeep` is deleted, and a part costs through its
  mass alone.** With the upkeep, evolution removed the chemoreceptor on 6 of 10 seeds by tick 144,000
  and both senses on one. Without it the chemoreceptor settles at 0.17 to 0.23 on 10 of 10 and no body
  is without a sense. Design risk R1: lower the cost before adding mechanisms. The world is then too
  full for the throughput floor, so the food is cut, in at most 3 trials past the 12 of the plan, each
  read on 10 seeds at ticks 36,000 and 144,000 before it becomes a default. Rejected: half the upkeep
  (6 of 10 seeds), a rule that makes plants come and go (not built, the controls did not point to it),
  and a looser band. → `../findings/m2-senses.md`
- 2026-10-12: **`plant_growth` is 0.03.** Trial 13, the first of the 3 allowed past the 12. With no part
  upkeep the world held 260 more creatures and the WASM bench read 2,385 against 2,400. At 0.03 it
  reads 2,933 to 3,127, `make gates` exits 0, and on 10 seeds the chemoreceptor reads 0.16 to 0.27 at
  tick 144,000. → `../findings/m2-senses.md`
- 2026-10-12: **The nine open questions of the M2 audit are decided, with two small additions and no
  change to a band, a rule, or a default.** Added: `make gates-long` runs the evolution gate at tick
  144,000 on seeds 1, 5, 8 at each milestone exit and not in CI (H2), and the row of `gate-evolve`
  prints `speed` and `area` with no band (M3, M7). Kept: the two sense gaps stay at 0.10 (H3), `plans`
  and `speed_cv` stay with no band (M5), and the near circle on the page stays until the owner's check
  3 (L7). Carried: the size rule and the egg gene to M3 with brain upkeep (M7, M9), the strength of the
  fin to M4 (L5, its test is renamed to say that it holds at a grip of 0.6), and the throughput of an
  old world to M5 (M8). → `../findings/m2-exit.md`, `../roadmap.md`

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
- 2026-10-10: The throughput benches time the default world after 12,000 ticks of settling, not a
  seeded 3072 by 1536 world. The seeded world was an estimate from before the ecology existed and does
  not hold its population. The floor and the reference population of 1,500 do not change.
  → `../gates.md`, `../findings/m1-tuning.md`
- 2026-10-10: A world side is at most 16,384 units. The scent field has 8-unit cells, so a larger bound
  let a crafted snapshot allocate about 512 MB. → `../../crates/sim/src/world.rs` (`MAX_WORLD_SIZE`)
- 2026-10-10: The fertility map is made when the founders are seeded, not when the world is made, so
  that `fert_blobs` and `fert_radius` set through `--param` take effect.
  → `../../crates/sim/src/world.rs` (`seed_founders`)
- 2026-10-11: **Parts ride in every frame record.** A creature record holds 12 packed part words, one
  for each part gene. `architecture.md` §8 says appearance is sent once per `uid`. The packed list
  needs no cache on the page and adds about 70 KB to a full frame. The split waits for a measured
  need. → `../plans/2026-10-11-m2-bodies.md` difference 5, `../../crates/sim/src/frame.rs`

## Process

- 2026-10-09: Every milestone ends playable. A feature that fails its measurement is deleted, not
  flagged off. → `../roadmap.md`
- 2026-10-09: Simulation changes are gated at 12,000 ticks on 3 seeds, one run at a time, against a
  baseline. Carried over from the draft's 2026-09-07 rule. → `../roadmap.md`
- 2026-10-10: Building is done by sub-agents under an orchestrator, one task per agent, with the tier
  named per task. → `../architecture.md` §12
