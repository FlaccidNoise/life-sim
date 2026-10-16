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
- 2026-10-12: **The owner answered the five checks of the M2 exit.** Done: bud, die, and continue as a
  descendant (check 2, which also closes the open half of the M1 exit). Half done: the dimmed view,
  judged with eyes only (check 3). Open: the look of the bodies (check 1, the owner asks for shapes
  beyond ovals), the bench on a slower device (check 4), and the felt judgments (check 5).
  → `../findings/m2-exit.md`
- 2026-10-12: **`make gates-long` reads seeds 1, 4, 5, 6, 8.** The owner added 4 and 6: in the old bad
  world they passed at tick 36,000 and failed only at tick 144,000, which is what the long reading is
  for. The list ran once before it became the target, on 2026-10-13: 5 of 5 pass, in 10 minutes. No
  band changed. → `../gates.md` "The long reading"
- 2026-10-13: **The M3 plan is approved, with its eight differences from the roadmap and the design.**
  The owner took the recommended option of every choice below. → `../plans/2026-10-13-m3-minds.md`
- 2026-10-13: **Brain upkeep is a fixed cost per body, plus a small cost per hidden neuron and per
  expressed connection. An input or an output neuron costs nothing (C1).** A founder pays what it pays
  now, so the body keeps what holds its length, and a sense does not pay for its inputs, so the part
  upkeep does not come back. Rejected: the M2 rule (dropping the chemoreceptor would save 0.0078 per
  tick, and the deleted part upkeep removed it at 0.0072), and no cost at all (nothing holds the body
  or the throughput). → plan rule U1
- 2026-10-13: **An Eye declares its brain inputs per gene. A Chemoreceptor declares three inputs once
  for a body, sums its genes, and reads the scent at the centre (C2).** Rejected: per kind for both,
  and per gene for both. → plan rule B2
- 2026-10-13: **Mixing is built in M3 as a second stage (C3).** Stage 1 is brains and the viewer, with
  its own readings. Stage 2 switches mixing on. If mixing fails its measurement it is deleted alone.
  Rejected: its own milestone, and one switch-on for all of it. → plan "Batches"
- 2026-10-13: **The long gate reads three brain bands at tick 144,000: mean hidden neurons, mean
  connections, and brain shapes that 5% of the living hold (C4).** Each band is set from its proof on
  a bad world. The gap in hidden neurons to a control arm with `hidden_gain` 0 is printed with no band
  until its chance reading is known. The bands are in `make gates-long` only. → plan Task 9
- 2026-10-13: **The `shapes` band does not count a connection with an end on a port of a part (soft
  spot 11).** `shapes_raw` prints the count with them, with no band. 2% to 38% of bodies hold no
  chemoreceptor at tick 144,000, so brains differ by their ports with no brain mutation, and the bad
  world of the proof keeps part mutations. → plan Task 9, `../findings/m2-audit-2.md` M3
- 2026-10-13: **Bodies get a draw-only outline that follows their parts, in M3. The taper gene goes to
  M4 with the fin (C5).** No new gene and no rule in M3. → plan Task 14
- 2026-10-13: **The three things carried from M2 are decided at the close of the M3 retune, from its
  rows: the area band, the egg range, and bands for `plans` and `speed_cv` (C6).** One trial of the
  retune is kept for a wider egg range. → plan Task 10 part 5
- 2026-10-13: **R1 reads the two sense gaps. The share of bodies with no chemoreceptor is printed with
  no band (audit 2, question 1).** The share swings on one seed (seed 8: 9%, 60%, 29%, 11%), so a band
  on it either fails the default world or rejects nothing. → `../findings/m2-audit-2.md`
- 2026-10-13: **The chance input is the proof of the long gate, and the search stops (audit 2, question
  2).** `chemo_gain=0.0001` with `eye_gain=0.0001` fails 5 of 5 seeds. No world of the head is known
  that passes the short gate and clearly fails the long one, and M3 changes the rules under any
  that a search would find. → `../gates.md` "The long reading"
- 2026-10-13: **Evolution only, confirmed. Within-life learning stays a Lab toggle after M8.** The owner
  asked for brains that "evolve and learn" and kept the decision of 2026-10-09: no new evidence, and
  a brain has nothing to learn from before M4 brings a hunter. → `../roadmap.md` "Later"
- 2026-10-13: **No feature is added beyond the roadmap.** Variety comes from M4 (predation) and M6
  (zones, plant genomes). A feature that the owner names is placed in a milestone with a measurement.
  → `../roadmap.md`
- 2026-10-14: **Mixing is on in the default world: `mix_rate` 1, `fixed_upkeep` 0.0337 → 0.037, and
  the WASM throughput target of M3 is 2,600, down from 2,700.** The owner chose this at a hard stop:
  with mixing on, three trials left the bench at 2,650 to 2,800 against 2,700. Every other target is
  met (long gate 5/5 with every brain band). Mixing costs about 9%: more bodies and the crosses, not
  larger brains. Evolution drops it by tick 144,000 (accept share 0.01 to 0.24). The floor of 2,400
  is unchanged. → `../findings/m3-tuning.md` Part 4
- 2026-10-14: **Confirmed by the owner 2026-10-15. Was provisional: no band on area or on `plans`, the egg range as it is,
  and a band on `speed_cv` that fails under 0.10.** Area follows `len`, whose band bounds it already.
  `plans` read 0 in a passing world. With room above 0.7 the egg did not rise. `speed_cv` reads 0.22 to
  0.28 in good worlds and 0.05 to 0.07 with every body mutation off (0/5). → `../findings/m3-tuning.md`
  Part 5
- 2026-10-14: **Confirmed by the owner 2026-10-15. Was provisional: `mix_rate` stays a parameter whatever value the retune
  leaves it at.** The plan said to delete it if left at exactly 1. It is a chance per tick, as the
  structural rates that the plan keeps are, and three things read it: the mate card shows only when it
  is above 0, the field guide says "with mixing on", and a test pins it in `mate.rs`.
  → `../plans/2026-10-13-m3-minds.md` Task 15
- 2026-10-14: **Each hypothesis of a trial is committed before its run, not kept in a log folder.** A
  machine restart lost the folder in `/private/tmp`, and with it the hypotheses of Tasks 9 and 10 as
  written. The rows survive in `../findings/`. → `../findings/m3-tuning.md` Part 4
- 2026-10-14: **Confirmed by the owner 2026-10-15. Was provisional: stage 1 of the M3 retune closes with `mut_conn_remove`
  at 0.01, and the band on `shapes` is replaced by a band on `variety`.** At the Start values the long
  gate read 3 of 5 (the scent gap on seeds 4 and 8): with brain structure on, the bodies with no
  chemoreceptor took over on 2 of 3 seeds, and with it frozen they did not. At 0.01 the gate reads 5 of
  5 and the senses hold (mean `chemo` 0.201 against 0.166, higher on 8 of 10 seeds). On ten seeds the
  pass count is 9 of 10 against 8 of 10, which chance can give. `shapes` rejected the most varied world
  read (seed 3: `shapes=1`, `variety=27.3`). `variety`, the effective number of brain shapes, fails
  under 2.0 and read 1.0 on 3 of 3 seeds of the frozen world. Throughput is on its target of 2,700, not
  over it. → `../findings/m3-tuning.md` Part 3
- 2026-10-13: **Confirmed by the owner 2026-10-15. Was provisional: the three brain bands of the long gate.** `hidden` fails
  under 1.0, `conns` under 15.0, `shapes` under 2, each read with `gate-evolve --brain` at tick
  144,000. Each rejected a bad world of the head on 3 of 3 seeds: a brain that is the largest cost of
  a body reads 0.03 to 0.04 hidden neurons and 1.4 to 2.7 connections, and a world where no brain can
  change shape reads 1 shape. The Start values read 3.04 to 3.85, 34.7 to 42.6, and 4 to 6. The gap to
  a world with silent hidden neurons gets no band: it reads +3.18, -0.65, +1.10 against +1.45, -0.87,
  +0.92 by chance, so "evolution uses a hidden neuron" is not shown. `shapes` can fall as variety
  rises, and the retune prints a measure that cannot, to decide between them at its close.
  → `../findings/m3-brains.md`, `../gates.md` "The brain bands"
- 2026-10-13: **The game gets a walkthrough that teaches as it plays, asked for by the owner.** A full
  onboarding for a new player: a game first, and a true explanation of the biology, the evolution, the
  neural networks, and the computer science on screen. It is designed from research on onboarding
  methods, not improvised. This is a feature that the owner named, so it gets a milestone and a
  measurement: a first version in M3 after the rules are on, more beats with M4 to M6, and the polish
  in M8. Measured by the beats that a new player completes and a short check of what they understood.
  → `../roadmap.md` M3, `../research/onboarding.md`
- 2026-10-13: **Confirmed by the owner 2026-10-15. Was provisional: the walkthrough is built from twelve principles of the
  research, and its eight open questions are answered for the build.** No step for steering or
  eating, and no step that blocks play: a randomized study of 45,000 players found that a tutorial
  pays only for unfamiliar mechanics. Each beat is act first, then one true sentence. No line gives a
  cause a purpose, and a test in `make check` holds that. The first life keeps its length, and the
  first death leads with the living descendants. The game says that the player's heir and mate
  choices are selection by a chooser, and that the founders' brains were wired by hand. Every note is
  also in one field guide, which never opens by itself. Not taken: a voice, and a guess before the
  time-skip (M5). → `../plans/2026-10-13-walkthrough.md`, `../research/onboarding.md` section 5
- 2026-10-13: **Confirmed by the owner 2026-10-15. Was provisional: the default draw of a body stays as it was, and four
  looks wait behind `?look=1|2|3|4`.** Look 1 narrows the lighter end, look 2 also draws parts at twice
  the size with a fan for a mouth and a fork for a chemoreceptor, look 3 also swells the body at each
  mouth. Looks 2 and 3 are 12% to 59% over today's draw time, against a limit of a tenth. The owner saw
  looks 1 to 3 and asked for the scale and thin lines of look 1 with the detail of look 3: that is
  look 4, built the same day, near the limit on a loaded machine. The owner picks one or none, and
  the rest is deleted. → `../findings/m3-shapes.md`
- 2026-10-15: **The owner confirmed every provisional entry above in one reply ("yes to all"), picked
  look 4, approved the M4 plan, and authorized a push.** The six entries now read "Confirmed by the
  owner 2026-10-15". → `../findings/m3-exit.md` "Open problems"
- 2026-10-15: **The `variety` band of the long gate reads `variety_wired`: the effective number of
  brain shapes over the hidden neurons with a way in from an input and a way out to an output.** The
  band stays at 2.0. `variety`, over every hidden neuron, is printed with no band: a cross can leave a
  donor's hidden genes unwired, and it counts them. `variety_wired` read 12 to 38 on seeds 1, 4, 5,
  6, 8 at the M3 defaults. The proof is run again for `variety_wired` on the frozen world (the four
  structural rates at 0). → `../gates.md` "The brain bands", `../../crates/headless/src/evolve.rs`
- 2026-10-15: **Look 4 is the only draw of a body.** The scale and thin lines of look 1 with the
  detail of look 3: the outline tapers from the parts and swells at each mouth, drawn from the parts
  a body carries, with no gene. Looks 0 to 3 and `?look` are deleted. Still open: the draw-time
  reading on a quiet machine and on a phone (owner check 7). → `../findings/m3-shapes.md`
- 2026-10-15: **The M4 plan is approved: the recommended option of every choice, C9 at option B, and
  its eight differences from the roadmap and the design.** C1 a Jaw bites on contact and facing with
  `lunge` as its trigger. C2 `bite_mass_ratio`, start 1.15. C3 `founder_jaw` hunters with hand-wired
  starter brains. C4 a jaw-size eye input and two hurt inputs. C5 debris in its own pool of 4,096
  pieces, a new budget of `architecture.md` §2 that the owner accepted. C6 coexistence read at tick
  12,000 in CI and at tick 144,000 in `make gates-long`, over the second half of the run. C7 no taper
  gene. C8 the fin measured at the motor stop. C9 the bench world is decided with data at the end of
  stage 1, and a lower reference population comes back to the owner. C10 the first kill in view is
  drawn, no shield. C11 no cysts. The build runs through its first three stops as M3's did.
  → `../plans/2026-10-14-m4-teeth.md`
- 2026-10-16: **Every M4 rule ships on in the default world, and the build runs through the end of
  stage 2 without waiting.** The owner, at the close of batch E: "I want it all to be on." The
  shipped game shows the newest rules every time. Task 12 switches each group on and retunes; a
  feature that fails its measurement stays on and goes to the owner as a finding, since deleting
  it is the owner's call. The hard stops of the plan are unchanged. → `../plans/2026-10-14-m4-teeth.md`
  "How the build runs without the owner"
- 2026-10-16: **Decided by the owner's delegation of 2026-10-16 (was provisional): a trigger output
  that arrives by mutation or a cross rests closed at `starter_trigger_bias`, as a founder's does.** Found by the mid-build audit: `prune`
  gave it bias 0, so one wire above 0 fired it on every cooldown and a new Jaw or gland paid for it, a
  selection against mutant hunters before any trial. Rule P2 named founders only; this reads it as
  the rule for every trigger. The three body outputs still rest at 0. → `../findings/m4-audit-1.md`
- 2026-10-16: **Decided by the owner's delegation of 2026-10-16 (was provisional): `fin_grip` 0.6
  (choice C8, the motor stop).** At 0.3
  a fin of 0.3 costs 6% of top speed for 13% less slip; at 0.6 it costs no top speed for 28% less
  slip. Evolution keeps the fin in neither arm at tick 144,000 (mean size 0.00 to 0.03 with the fin
  working or dead), so the value is picked from the motor rows alone. The M2 test is already named
  for 0.6. No taper gene (choice C7): the carry is closed. → `../findings/m4-motor.md`
- 2026-10-16: **Withdrawn 2026-10-16 (was provisional): the predation bands of `gate-health` at
  12,000 ticks.** The diet retune sets them again from its own rows (Task 7 of
  `../plans/2026-10-16-m4-retune-diet.md`). The record of what they were:
  `kills_late` 20 or more and `flesh_late` 0.01 or more (a world with no predation reads 0 and
  0.000), `hunt_hi` 0.8 or less and `prey_lo` 150 or more (a world where every body hunts and any
  body can be bitten reads 1.000 and 0). `hunt_lo` is not a gate at 12,000: hunters arise by
  mutation in a world with no founder hunter (0.03 to 0.16) and dead jaws are not yet selected
  out (0.08 to 0.23). The Start world fails `hunt_hi` and `prey_lo` on 3 of 3: every body hunts
  by the second half. The retune starts from that. → `../findings/m4-gates.md`
- 2026-10-16: **Withdrawn 2026-10-16 (was provisional), reset by the diet retune's Task 7: the
  predation bands of the long gate at 144,000 ticks were `kills_late` 20 or more and `flesh_late` 0.01 or more, judged under `--brain --predation`.**
  A world with a dead jaw (`bite_rate=0`) reads 0 and 0.000 on 5 of 5 seeds; the default world
  240 to 690 and 0.022 to 0.037. `hunt_lo` is not a gate at either length: a dead jaw costs a tenth
  of a part's mass and drifts to 4% to 96% of the living by 144,000. `hunt_hi` and `prey_lo` are not
  set at 144,000: the default world fails them. → `../findings/m4-tuning.md` Part 2
- 2026-10-16: **The M4 rules ship on with the ratio-3 set, and the takeover of the hunters is a
  finding for the owner, not a default.** Five trials at the boom (`bite_mass_ratio` 2.0 and 3.0,
  the guards doubled, `bite_rate` 0.2, `lunge_cost` 2.0): the mass ratio sets the pace of the
  takeover and nothing stops it. Rule J1 gives a jaw a payoff from the first contact with anyone's
  young, rule K1 gives it no cost but mass, and a hunter keeps its Filter, so a jawless lineage is
  strictly worse; the draft measured the same (C11, C15, C16) and named negative frequency
  dependence as the need. That is a rule, and the owner's. The shipped defaults: `bite_mass_ratio`
  3.0 with the other Start values, under which the world holds 486 to 904 bodies at 144,000 with
  every M2 and brain band on 5 of 5, a boom and bust on one seed in three, and persistent prey on
  another. Target 1 (the 12,000-tick bands) is met by three bands and failed by `flesh_late` 0.01,
  a band set before any good world was read; target 4 (the share bands at 144,000) is not met;
  target 2 is met at the floor (WASM 2,440 against 2,400, under the target of 2,600); target 3 is
  met; target 5 is met with the gland off (5 of 5) and not with it on (3 of 5, the eye gap on seeds
  6 and 8 at 0.08). Untried levers: the guards at ratio 3 or 4.0, `founder_jaw`, `corpse_share`, a
  wider range for the ratio. → `../findings/m4-tuning.md`
- 2026-10-16: **The owner delegated the open M4 choices.** "I'm good with whatever rule change makes
  the most sense in terms of realistic simulation behavior", and for the rest: research it and make
  the decision that makes the most sense. The entries below dated 2026-10-16 that say "by the
  owner's delegation" rest on this. The owner approved the plan the same day: "Go on the diet plan. Approved."
- 2026-10-16: **The takeover is answered by a diet gene with the trade-off on intake (rule D1).** One
  body gene `diet` in [0, 1]: Filter intake times `(1 − diet)^diet_k`, a bite's take times
  `diet^diet_k`, `diet_k` above 1, so `diet` 1 is an obligate carnivore and 0 a pure herbivore. The
  owner asked for hunters that eat only meat and a herbivore to carnivore spectrum. The literature
  says a trade-off on digestion alone lets one specialist win, and one on intake with an exponent
  above 1 lets a lineage split (Rueffler et al. 2006). The draft measured a lasting split on 8 of 8
  seeds with a continuous diet gene and a generalist penalty. Predator interference (I1) is held in
  reserve. A gene, not a ratio of mouth sizes: the owner asked for a preference, and a gene is one
  number that a chart and a card can show. → `../research/diet-coexistence.md`,
  `../plans/2026-10-16-m4-retune-diet.md`
- 2026-10-16: **Amendment to the diet retune, rule D2, a food chain: a body bites only a body whose
  `diet` is at least `bite_diet_gap` under its own, by the owner's delegation; the owner to confirm
  at the exit.** Not the plan's named reserve (I1). T1 to T3: at `bite_mass_ratio` 3.0 the founder
  hunters starve before tick 1,000, with gene mixing on or off. T4: at 1.15 every body bites every
  other, the world becomes a cannibal cloud of 190 to 320 bodies at `diet` 0.25 to 0.46, and no
  carnivore holds. Prey defined only by size gives no food that only hunters need. The draft's
  "cannibalism off" restored the predator and prey balance (predators 85% to 41%).
  → `../findings/m4-diet.md` T1 to T4, `../plans/2026-10-16-m4-retune-diet.md`
- 2026-10-16: **The eye's jaw input is scaled by `eye_gain` (rule E1), by the owner's delegation.**
  A blind eye must not see teeth, or the eye gap of the long gate does not measure blindness
  (item 5 of `../findings/m4-audit-2.md`). → `../plans/2026-10-16-m4-retune-diet.md` Task 1
- 2026-10-16: **"The shipped set" (provisional) is superseded by the diet retune.** The ratio-3 set
  stays the default until the retune ships its own.
- 2026-10-16: **A bigger world is M6, built as zones with gaps, not as more area, by the owner's
  delegation.** The owner asked for a much bigger world with independent pockets of evolution. The
  literature: linked patches kept predator and prey three times longer than one tank of the same
  volume, and too much migration synchronises patches and favours over-exploiting hunters
  (`../research/diet-coexistence.md` (d)). The draft: world size alone was cosmetic, and isolation
  came from barriers, not gaps. Throughput is per body, so more area at the same density would break
  the time-skip budget. M6's column already has zones and narrow gaps: the gap width is its
  migration lever, measured with too little and too much. After the diet retune and M5, since
  pockets need coexistence to diversify. → `../roadmap.md` M6

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
- 2026-10-16: **The throughput floor is read per creature-tick: at most 278 nanoseconds at the
  reference world, which is 2,400 ticks per second at 1,500 bodies (choice C9), by the owner's
  delegation.** The M4 world holds 1,540 bodies, so it read 2,385 to 2,451 ticks per second at 265 to
  272 ns: faster per body than the floor asks, and failing one reading in three on the extra bodies.
  The per-body reading says whether the code got slower. How long a skip takes in a world that holds
  more bodies is M5's exit, not this gate. The void line stays.
  → `../plans/2026-10-16-m4-retune-diet.md` Task 5, `../findings/m4-exit.md` "Throughput"
- 2026-10-16: **The debris pool stays 4,096 pieces and `MAX_NEURONS` stays 96, by the owner's
  delegation.** The pool is 13% used at tick 36,000. A body with eight cones holds 55 hidden neurons
  and not the 64 planned, but bodies hold about 4 hidden neurons at tick 144,000. Neither budget is
  near a measured limit. → `../findings/m4-exit.md` "Open problems" item 5
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
- 2026-10-13: **The M3 build runs through four of its five owner stops.** At the bands of Task 9, the
  look of Task 14, the end of stage 1, and the proposals of Task 10 part 5, the orchestrator takes the
  recommended option, logs it here as "provisional, owner to confirm", and goes on. Hard stops stay: a
  change to an existing band, a rule, the floor, or the reference population, deleting a feature, a
  target that is not met after its trial cap, and any push. After M3 the M4 plan is written and waits
  for the owner. → `../plans/2026-10-13-m3-minds.md` "How the build runs without the owner"
