# Tidepool M4 retune — Diet

Status: **Written 2026-10-16. Waits for the owner's go.** The owner chose the direction on
2026-10-16: hunters that eat only meat, and one spectrum from herbivore through omnivore to
carnivore that evolution moves along. The owner left the exact rule to the evidence. The evidence is
`../research/diet-coexistence.md`. The decisions are in `../decisions/INDEX.md` under 2026-10-16.

**Goal:** herbivores and carnivores coexist at tick 144,000 on 5 of 5 seeds, with omnivores free to
appear between them. No lineage gets a jaw for free.

**Why the M4 world fails now:** a Filter eats plants and debris at its full rate, and a Jaw bites at
its full rate, on the same body. A jaw costs only its mass (rule K1). A body with both mouths is
strictly better than a body with one, so every lineage grows a jaw and keeps its Filter
(`../findings/m4-tuning.md`, the stop of rule 5). The draft found the same and named negative
frequency dependence as the need.

**What the evidence says to build:** one diet gene with the trade-off on intake, not on digestion.
A trade-off on digestion alone lets one specialist win (Rueffler et al. 2006). A trade-off on intake
with an exponent above 1 makes each specialist deplete its own food, which favours the rarer kind and
lets a lineage split. The draft measured the same shape: a continuous diet gene with a generalist
penalty gave a lasting grazer and hunter split on 8 of 8 seeds at tick 20,000.

## The rules

**D1, the diet gene.** Every genome carries `diet`, a body gene in [0, 1] beside `len`, `wid`, `egg`,
`old`, and `hue`. A bud mutates it by a step of `diet_sigma`. A crossover mixes it as it mixes the
other body genes. Two factors come from it:

- Filter intake (plants and debris) is multiplied by `(1 − diet)^diet_k`.
- A bite's take is multiplied by `diet^diet_k`, before the shells block a share of it.

At `diet` 0 a body is a pure herbivore: a jaw takes nothing. At `diet` 1 it is an obligate
carnivore: a Filter takes nothing. Between, a body eats both, and less of each. `diet_k` above 1 is
the generalist penalty. At `diet_k` 1.5 a body at `diet` 0.5 takes 35% of each food.

The founders: a founder with no jaw starts at `founder_diet` (start 0). A founder hunter (the
`founder_jaw` share) starts at `founder_hunter_diet` (start 0.8, so it can still filter 9% while it
learns to hunt). Both are parameters.

**E1, the eye's jaw input.** The eye's jaw input is multiplied by `eye_gain`, as every other eye input
is. Today the blind arm of the eye gap still sees teeth (item 5 of `../findings/m4-audit-2.md`), so
the gate does not measure blindness. Not a tuning lever: a fix to what the gate measures.

**Held in reserve, I1, predator interference.** A bite's take is divided by `1 + interference · n`,
where `n` is the number of other bodies with a jaw within `interference_radius` of the biter. Built
only if D1 fails its targets after its trials (Part 3, rule 6). The evidence: predator-dependent
feeding fits 18 of 19 data sets better than the standard curve (Skalski & Gilliam 2001).

New parameters: `diet_k`, `diet_sigma`, `founder_diet`, `founder_hunter_diet`. Off: `diet_k` 0, which
makes both factors 1 and gives the M4 world back.

## Tasks

Agent tiers are those of `../architecture.md` §12. Each brief starts with `git merge --ff-only main`
and the head hash, bans `cargo fmt --all` and `make fmt`, and limits the files. No agent runs a gate
or a bench. The orchestrator runs them after each merge, one at a time.

### Task 1: E1 (`coder-std`)

`crates/sim/src/eye.rs`: the jaw input times `eye_gain`. A test: with `eye_gain` 0 an eye in front of
a jaw reads 0. Not in the save. The state hash changes only through what the brains do.

### Task 2: D1 in the core (`coder`, Opus)

- `genome.rs`: the `diet` gene, its range, its mutation by `diet_sigma`, its crossover, its save and
  load, and the founders' values. `energy.rs::contact`: the Filter factor. `bite.rs::step`: the bite
  factor. `params.rs`: the four parameters with Off at `diet_k` 0.
- Snapshot format 10 to 11. The frame record carries `diet` as one more word (`CREATURE_STRIDE` 25 to
  26), so the page can name it. `ABI_VERSION` 8 to 9.
- The factors use `sim::math`, never `powf` (the determinism rule of `../../AGENTS.md`). `diet_k` moves
  in steps of 0.25: `x^k` is the fourth root of `x` (two `sqrt`) to the whole power `4k`, so it is
  exact on native and WASM. `0^0` is 1. The parameter's range rejects other values.
- Tests: with `diet_k` 0 both factors are 1 at every `diet`. The M4 hash cannot come back: the gene's
  mutation is one more random draw per bud. A `diet` 1 body takes nothing from
  a plant. A `diet` 0 body's bite takes nothing. A body at 0.5 takes `0.5^k` of each. The gene
  survives a save and a load and is in the hash.

### Task 3: `probe-diet` (`coder-std`)

`tidepool-headless probe-diet --seeds --ticks --every`: per sample, the share of the living with
`diet` under 0.3 (herbivores), 0.3 to 0.7 (omnivores), over 0.7 (carnivores), the mean and the spread
of `diet`, and the hunter share and kills of `probe-hunt`. Exit 0 always: a probe, not a gate.

### Task 4: the page names the diet (`coder-std`)

The inspector, the bud card, and the death card say "eats plants", "eats both", or "eats flesh" from
the record's word. The guide's chapter on mouths says what `diet` does in one sentence. Vitest pins
the three words at 0.29, 0.5, and 0.71. No new colour: the look waits for M7's charts.

### Task 5: the bench reads per creature (`coder-std`)

`scripts/bench-wasm.mjs` and the native bench gate on nanoseconds per creature-tick: at most 278,
which is 2,400 ticks per second at the reference population of 1,500. Ticks per second is still
printed. The void line stays. `../gates.md` gets the proof: a build with a spin loop in the tick is
rejected.

### Task 6: trials (the orchestrator)

Baseline: the defaults after Tasks 1 to 5 with `diet_k` 0, at 12,000 (`gate-health`, seeds 1 to 3),
36,000 (`gate-evolve`), and 144,000 (`make gates-long` and `probe-diet`, seeds 1, 4, 5, 6, 8).

A trial is one changed parameter, or one group that only makes sense together, with its hypothesis
committed to `../findings/m4-diet.md` before the run. One run at a time. Every `--param` is written
out in a script file. **At most 10 trials.**

Targets, in the order that decides a conflict:

1. At tick 144,000 on 5 of 5 seeds: herbivores 10% or more of the living, carnivores 10% or more,
   the spread of `diet` 0.20 or more, and kills in the second half. The draft's gate used the same
   10% and 0.20.
2. The same at tick 12,000 on seeds 1 to 3, the roadmap's exit for M4.
3. `gate-health` passes its M3 bands 3 of 3. `gate-evolve` passes its M2 bands 3 of 3.
4. `make gates-long` passes its M2 and brain bands 5 of 5.
5. The bench passes Task 5's floor, read as an interleaved A/B against the head before Task 2.

Rules:

1. T1 is `diet_k` 1.5 with the start founders. Then `diet_k` 1.25, 2.0, and 2.5 if T1 misses.
2. For carnivores dying out: the founding first (`founder_hunter_diet` 0.6, then `founder_jaw`), then
   the payoff (`bite_rate`), then the fallback (`corpse_share`).
3. For carnivores taking over: `diet_k` up, then `bite_mass_ratio`. A payoff cut does not damp a boom
   (the draft, C15).
4. For omnivores taking over (the spread under 0.20): `diet_k` up.
5. Never judge at fewer ticks than the target names. A seeded run is deterministic: a miss is never
   noise and is never rerun.
6. If no trial meets target 1 after 6 trials, build I1 (`coder`), and spend the rest of the trials
   on `interference` from 0.3 (three hunters near halve a bite).
7. After 10 trials, stop. A target not met goes to the owner with its rows.

### Task 7: the bands (the orchestrator)

From the rows of the shipped default, set the diet bands of `gate-health` (12,000) and of the long
gate (144,000), and the predation bands that were provisional on 2026-10-16. Each band goes in
`../gates.md` with the bad world it rejects: `diet_k` 0 (every body a generalist), `founder_jaw` 0
with `diet_sigma` 0 (no carnivores can arise), and `bite_rate` 0 (no kills).

### Task 8: exit (the orchestrator)

Rebake both saved worlds at the new defaults. `make check`, `make gates`, `make gates-long`, rows in
`../findings/m4-diet.md`. A fresh-context audit (`auditor`). The browser: a carnivore with no Filter
hunting in the 36,000-tick world, and the words on the cards. Owner checks: see a herbivore, an
omnivore, and a carnivore in one world, and be eaten by an obligate carnivore.

## What this plan does not do

- No bigger world. That is M6, the column (`../roadmap.md`): zones with gaps between them, where the
  gap is the migration lever. The research says that subdivision beats area, and that too much
  migration favours over-exploiting hunters.
- No digestion efficiency per food. Meat assimilates at about 0.9 in nature, near the 1:1 bite. The
  fault is the free jaw, not digestion.
- No change to the plants.
