# Tidepool — Roadmap

Every milestone ends with something you can open in a browser and play. Each adds one system.
Design: `design.md`. Build rules and interfaces: `architecture.md`.

M0 and M1 have a task-level plan: `plans/2026-10-10-m0-m1-first-swim.md`. M2 has one too:
`plans/2026-10-11-m2-bodies.md`. Only the next milestone has one. Each later milestone gets its plan when the
one before it ships, because what is learned from playing a milestone changes the next one.

## Rules for every milestone

1. **Playable exit.** The exit check is a person playing the build, plus the gates below. Tests passing
   with a world that looks dead is a failed milestone.
2. **Health gate.** Any change to simulation rules or constants runs the headless health gate: 12,000
   ticks or more, 3 seeds or more, one run at a time, paired with a baseline run of the same protocol.
   6,000-tick readings were wrong in both directions on the draft.
3. **Throughput gate.** Headless ticks per second at the reference population must stay above the budget
   in `architecture.md`. It is a test, and it fails the build.
4. **A feature that fails its measurement is deleted.** Keep the note in `docs/findings/`, not the code.
   No off-by-default flags for dead features.
5. **Mechanism fires is not evolution uses it is not it helps.** Claim only the one that was measured. A
   fresh-context reviewer checks each milestone's claims against its probes.
6. **Long reading at the exit.** Before a milestone closes, run `make gates-long`: the evolution gate at
   tick 144,000 on seeds 1, 4, 5, 6, 8. It is not in CI. M2 lost its senses between tick 36,000 and tick
   144,000, and no gate read that far (`gates.md`).

## Milestones

### M0 — Foundation (done 2026-10-10)

The empty game, wired end to end.

- Project scaffold under `tidepool/` with its own build, test, lint, and type gates.
- Simulation core skeleton: seeded RNG, entity pool with a `uid` from a birth counter, spatial hash,
  tick loop, state hash. Circles that drift.
- Simulation runs in a worker. The page draws what the worker sends.
- Headless runner with the same core, for gates and probes.
- A checksummed snapshot, with a test that save, load, and run on equals an unbroken run.
- Determinism test, throughput test, and a proof that each gate rejects a known-bad change.
- An in-page benchmark, to read the time-skip budget on a real laptop and phone.

Exit: open the page, see moving dots at 60 fps, with the sim in a worker. `make check` is green and each
gate has been seen to fail on a bad input.

### M1 — First swim (built 2026-10-10, exit closed 2026-10-12 but for the felt judgments)

Status: every gate passes and a fresh-context audit found nothing that blocks the exit. On 2026-10-11
the owner swam and died and could not continue as a descendant. The M2 plan carried the fixes. On
2026-10-12 the owner played the M2 build, budded, and played as the descendant
(`findings/m2-exit.md`, owner check 2). Still open: the four felt judgments of `findings/m1-feel.md`.

The smallest world you can live in.

- Rigid body with thrust and torque. Cilia and one rear Flagellum. A Filter mouth.
- Plants as simple rooted entities with a reserve and a per-bite fraction.
- Energy: intake with a satiation stop, upkeep, movement cost, growth from juvenile to adult.
- Budding with mutation of body numbers. Old age.
- A small fixed-shape starter brain so NPCs forage. A Chemoreceptor reading plant scent.
- Click a creature to possess it. Keyboard, mouse, and touch steering. Camera follow.
- Release the controls and the brain drives.
- On death, choose a living descendant. No time-skip yet.

Exit: a stranger can swim, eat, bud, die, and continue as a descendant with no instructions. The world
stays alive at 12,000 ticks on 3 seeds.

### M2 — Bodies (built 2026-10-12, owner check open)

Status: every task of the plan is built, pushed on 2026-10-12, and `make check` and `make gates` exit
0. The fresh-context audit found that evolution removed the senses. The cause was the upkeep of a
part, and it is deleted (`findings/m2-audit.md`, `findings/m2-senses.md`). The owner answered the five
checks of the exit on 2026-10-12 (`findings/m2-exit.md`), and a second audit ran at the head on
2026-10-13 with no High finding (`findings/m2-audit-2.md`). The owner's answers: the bud and the
descendant are done, the dimmed view is judged with eyes only, and three are open: the bench on a
slower device, the felt judgments, and the look of the bodies. The owner's words on the last: bodies
need "new shapes too. Not just bigger/smaller ovals".

Looks and function become one thing.

- The variable-length part list, history ids, and the add, remove, and duplicate mutations.
- Life-history genes: old age and egg size. A body is mature when it is full-grown, and the size of
  a brood follows the egg and the parent's reserve: neither is a gene (`decisions/INDEX.md`,
  2026-10-11). They are world parameters in M1.
- Part costs: build energy, upkeep, mass. A part has no upkeep of its own since 2026-10-12: it costs
  through its mass alone (`decisions/INDEX.md`).
- Eye and Fin. The view cone: the player sees what the eyes see.
- The genome-driven creature renderer: membrane, visible parts, motion.

Exit: after a long headless run, creatures in one world visibly differ in body plan, and the difference
changes how they move and what they see. Part count does not collapse to the minimum (risk R1).

### M3 — Minds

- Variable-topology recurrent brains. Inputs and outputs come from parts.
- Brain upkeep. Mutations that add and remove neurons and connections.
- Carried from M2 (`decisions/INDEX.md`, 2026-10-12), to decide with the rule of brain upkeep: the size
  band reads length alone while the area falls, the egg gene sits at the top of its range, and
  `plans` and `speed_cv` have no band.
- Mixing: mate contact, the `accept mate` output, crossover by history id, the mate-choice overlay.
  Known before the build: `repro.rs` draws the genome of a child, and its history ids, before it knows
  that the parent can pay. A child that is never born uses up ids. Ids stay unique, so crossover can
  still line genes up by id (`findings/m2-audit.md`, finding L9).
- Brain viewer, first version: live graph, part-grouped inputs, strongest path in words.
- Added by the owner on 2026-10-13: **the walkthrough, first version.** A guided first play that
  works as a game and also explains, truthfully, the biology, the evolution, the neural networks,
  and the computer science of what is on screen. It is designed from research on onboarding
  (`research/onboarding.md`) and has its own plan. It is built after the M3 rules are on, so it
  teaches what M3 has: steer, eat, bud, let go, read the brain, mix genes. M4, M5, and M6 each add
  the beats of what they bring, and M8 polishes it into the first-minute flow. Measured by the beats
  a new player completes and a short check of what they understood.

Exit: brains in a long-run world differ in shape and are not all minimal (risk R1). A player can watch
their own brain while they play, let go, and see it take over.

### M4 — Teeth

- Jaw, Spike, Shell plate, Toxin gland. Abilities: dash, lunge, toxin cloud.
- Contact rules with facing and defended arcs. Energy-conserving transfers.
- Carried from M2: the strength of the Fin. At the default `fin_grip` of 0.3 a fin raises the slip,
  and it cuts the slip at 0.6 (`findings/m2-audit.md`, finding L5). That decision rested on a fin in 2%
  of bodies at tick 36,000. At tick 144,000 a fin is in 26% of the bodies of seed 1 and in 36% or more
  of seed 8, at about the size a new part gets (`findings/m2-audit-2.md`, question 3). No reading says
  whether evolution uses it.
- Corpses become debris. Debris is food for Filter mouths.
- The death freeze and death card.

Exit: predators and prey coexist at 12,000 ticks on 3 seeds (risks R2, R4, R5). Being hunted by
something that learned to dash is frightening and its cause is always shown.

### M5 — Deep time

- Headless fast-forward in the worker, with progress streamed to the page.
  Carried from M2: an old world read 2,357 to 2,471 ticks per second against the floor of 2,400, at tick
  108,000 on a busy machine. Read it on a quiet machine first (`findings/m2-exit.md`).
- The save format: versioned, checksummed, last-good backup, export and import.
- The world resumes where the player left it.
- The skip montage, the skip report, the heir picker with candidates that differ.
- Bottleneck stop. Lineage tree in the core. Chronicle, first version.

Exit: die, watch generations pass in seconds, read what changed, and return to a world that is visibly
different. Close the tab, reopen it, and the same world is there.

### M6 — The column

- The tall world: light falling with depth, rock shelves with gaps, four zones.
- Debris sinks. Vents on the floor. Chloroplast, Photophore, Lateral line.
- Plant genomes: growth rate, seed range, light need. Plants do not evolve before this.
- Eyes need light. Scent trails and movement ripples are drawn for the player.
- Sunlit-to-abyss lighting: caustics, fog, bloom.

Exit: each zone holds a different community after a long run. A sighted shallow-water body is nearly
blind in the abyss, and the player feels it. No zone is an empty screen (risk R10).

### M7 — Watch

- Inspector, charts, overlays, column minimap, time bar.
- God tools. The Lab panel.
- Rival lineage detection and naming. The full chronicle.

Exit: every number and field in the simulation can be seen and changed from the page, and it looks like
a game, not a debug panel.

### M8 — Ship

- The creature art pass and animation cues that show intent: wind-up, flinch, lunge.
- Generative audio.
- Touch polish and phone performance.
- The baked world and the first-minute flow.
- Deploy to Netlify. A performance pass on a mid-range laptop and a real phone.

Exit: the 60-second test. A person who has never seen it opens the link on a phone and on a laptop, and
within a minute has possessed a creature, let go of it, and understood that everything is alive.

### Later

- Within-life learning as a Lab toggle, with a new rule.
- Share a creature or a world by link. Gamepad. An endgame.

## Order of risk

The roadmap front-loads what could sink the project.

| Risk | First answered in |
|---|---|
| Time-skip throughput (R12) | M0, as a failing test from day one |
| Steering feel | M1 |
| Traits stripped, minimal brains (R1) | M2 for parts, M3 for brains |
| Predators persist (R2 to R5) | M4 |
| One skip changes something visible | M1, as a first read by probe. M5 proves or kills it. |
| Skip is legible and worth it | M5 |
