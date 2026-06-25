# Brain consolidation + full interconnection — handoff (2026-06-24)

The mission: every gene, world-field, and action is (1) **decision-wired** (an NN input, output, or both) and
(2) **visible** (radar / brain view / creature appearance). One tightly-coupled system → robust, legible,
emergent creatures. NOTHING orphaned (code that exists but isn't tied into genes + NN), nothing
wired-but-invisible, nothing visible-but-inert.

This doc is the merge map + the orphaned-code audit seed. Re-verify everything against current `main` — it moves.

---

## 0. State of the world (verify with `git log -1 main`)

- **`main` @ `032e193`** has: 4-channel identity SCENT (16 brain synapses `PHERO_C0..C3`, `BRAIN_GENES=36`,
  scent-field.ts) · lineage family-tree inspector (`t`/🌳) · the merged SEXUAL REPRODUCTION (life-sim-xa90:
  DISPLAY/PREFERENCE genes, crossover, mate-seeking, viability gate) · `initialPopulation:1000`. The brain on
  main is **LINEAR** (sense→tanh→motor); **NO hidden layer, NO eat-gate** yet.
- **`feat/living-world` @ `0b2b68b`** (NOT merged; actively developed — the "upcoming NN session") has: a real
  **HIDDEN LAYER** (MLP), an **EAT_GATE** output, interoceptive **AGE/READINESS** inputs, **bioluminescence**,
  and a **glow-sense** comms channel. BUT it was built on the **OLD pre-scent brain layout** → its brain
  conflicts with main's scent layout (see §1). The literal main checkout dir usually sits on this branch.
- Full suite green on main (347). Determinism is the ONLY invariant; the frozen golden hash is RETIRED.

---

## 1. THE BRAIN-LAYOUT CONFLICT (the load-bearing reconciliation — do this FIRST)

Both branches reuse brain slots `20+` incompatibly. Exact layouts (from `genome.ts` `Brain` enum):

**main (scent):**
```
0-9   core: LAT/FWD_TURN, LAT/FWD_THRUST, TURN/THRUST_BIAS, SIGHT_LAT/FWD_TURN, SIGHT_LAT/FWD_THRUST
10-13 WALL_*      14-17 FLOW_*      18-19 HUNGER_TURN/THRUST
20-35 PHERO_C0..C3 (16 SCENT synapses, 4 ch × {LAT_TURN,FWD_TURN,LAT_THRUST,FWD_THRUST})
BRAIN_GENES = 36.  LINEAR map only (brain.ts steer reads these directly through tanh).
```

**feat/living-world (hidden layer + eat-gate):**
```
0-9   core (same)   10-13 WALL_*   14-17 FLOW_*   18-19 HUNGER_*
20-23 PHERO_* (OLD single-channel, 4 synapses)
24-28 EAT_GATE_{BIAS,FWD,LAT,SIGHT_FWD,SIGHT_LAT}   29-30 AGE_TURN/THRUST   31-32 READINESS_TURN/THRUST
NAMED_BRAIN_GENES = 33
33-88   HIDDEN_W1  (input→hidden:  HIDDEN_INPUTS=14 × HIDDEN_UNITS=4)
89-100  HIDDEN_W2  (hidden→output: 4 × HIDDEN_OUTPUTS=3  [turn, thrust, eatGate])
101+    GLOW_BIAS + GLOW_HID (mood-glow output, sigmoid over the hidden layer)
HiddenInput (14): FOOD_FWD/LAT, SIGHT_FWD/LAT, WALL_FWD/LAT, FLOW_FWD/LAT, PHERO_FWD/LAT (single!),
                  HUNGER, AGE, READINESS, BIAS
```

**Target unified layout** (reconcile into ONE — the scent must feed the HIDDEN LAYER, not a vestigial linear
path; this is mandate 1 for the most important sense we have):
```
0-19   core/sight/wall/flow/hunger  (unchanged, no conflict)
20-35  PHERO_C0..C3  (16 SCENT synapses, from main — KEEP)
36-40  EAT_GATE_*    (relocated from living-world's 24-28)
41-42  AGE_*         43-44 READINESS_*
…then append any NEW brain OUTPUTS from §3 (brain-gated BITE / BREED / SCENT-DEPOSIT) here, before the hidden block
NAMED_BRAIN_GENES = (last named slot + 1)
HIDDEN_W1 start = NAMED_BRAIN_GENES.  HIDDEN_INPUTS GROWS: replace the single PHERO_FWD/LAT (2) with the 4
   scent channels (8 inputs: C0..C3 × {fwd,lat}) + own-size/own-diet/crowding (§3) + AGE/READINESS + bias.
HIDDEN_OUTPUTS GROWS to cover the new brain-gated outputs (turn, thrust, eatGate, bite, breed, scentDeposit…).
GLOW block last.
```

**Reconciliation steps (keep determinism — gated draws, ascending-order RNG only at reproduction):**
1. Merge `feat/living-world` into `main` (real 3-way merge; expect conflicts in genome.ts/brain.ts/economy.ts/
   config.ts/world.ts/store.ts/sense.ts and the test files). Resolve the `Brain` enum + `BRAIN_GENES`/
   `NAMED_BRAIN_GENES`/`HIDDEN_*` constants to the target layout above. main's 16-synapse scent BLOCK replaces
   living-world's 4-synapse PHERO block; everything after shifts.
2. Rewire `brain.ts steer()`: the hidden layer's `hidIn[]` must be loaded with the 4 scent channels (read
   `store.scentSenseX/Y` per channel) where it currently reads the single phero. Grow `HIDDEN_INPUTS`.
3. `seedGenome`/`mutateGenome` (genome.ts) gate the scent block on `pheroSenseGenes` (already true on main) and
   the eat-gate/age/readiness/hidden/glow blocks on their flags (`hiddenLayer`, `moodGlow`, `readinessSense`,
   `ageStages`) — preserve the no-RNG-when-off gated-draw pattern so ablations stay stable.
4. Update `BrainView` (brain-view.ts) to render the hidden layer (W1/W2) + all named synapses incl. scent + the
   new outputs. Update `world.ts stateHash` if any new HASHED state appears (scent + seeking already hashed).
5. Verify: full suite green; same-(config,seed)→same-hash; a liveness guardrail; `npx tsc --noEmit`; `eslint`.

---

## 2. SEXUAL-REPRO STUBS to finish against the UNIFIED hidden-layer brain (life-sim-xa90 follow-through)

- **`crossoverBrain` (genome.ts ~305)** currently CLONES the mother's brain (`mutateGenome(child, mom)`). Make it
  REAL per-weight parental crossover over the FULL `BRAIN_GENES` (incl. hidden layer): mirror
  `crossoverScalarGenes` — per-weight uniform pick from mom|dad, then mutation, respecting the gated-draw skips.
- **`brainDistance`** was REMOVED (a dead always-0 stub). CREATE it: per-weight L2 over the brain (incl. hidden
  layer), and plug it into `geneticDistance`'s comment-seam → genetic distance reflects BEHAVIORAL divergence,
  not just diet → behavioral reproductive isolation (a divergent BRAIN can't interbreed even at the same diet).
- **Mate-finding** is currently a SIGHT proxy (sense.ts senseCreatures, `store.seeking`-gated) and BLEEDS OUT at
  8192² (seekers ~1000u apart vs the 12u contact scan; `findMate`'s 3×3 hash scan reaches only `2*cellRadius=12`).
  ROUTE IT THROUGH THE NN via the EXISTING kin scent channels (kin-cos/kin-sin in scent-field): a learned
  "seek-a-compatible-mate-by-scent" input/output. Diffusion gives the long range a raw spatial query can't.
- **DISPLAY(24)/PREFERENCE(25)**: DISPLAY is wired only to mate-choice and is INVISIBLE — make it drive a creature
  appearance cue (it's an ornament; the whole point is to be seen) + a radar axis. PREFERENCE is a fixed
  `|display−preference|` rule — make it an NN INPUT so mate choice is a brain computation.
- **Viability gate** (economy.ts: breed only if `energy > reproOverhead + REPRO_THRESHOLD`): a brain-gated BREED
  output (§3) composes with this — the brain chooses WHEN to commit; the gate enforces it can afford to.

---

## 3. ORPHANED-CODE AUDIT — the core deliverable (the user's explicit ask)

Produce a refreshed `docs/neural-network-interconnection-map.md` (the existing one PREDATES scent + sexual-repro):
a table over EVERY gene (genome.ts `ScalarGene`), world-field, and action, with two columns —
**decision-wired? (input / output / both / NO)** and **visible? (radar / brain / appearance / NO)** — then close
every gap. Known orphans / partial wirings to seed the audit (RE-VERIFY each against current code):

| Item | decision-wired today | visible today | action |
|---|---|---|---|
| DISPLAY (gene 24) | mate-choice only, NOT an NN input | NO | → appearance cue + radar axis; consider NN input |
| PREFERENCE (gene 25) | fixed mate-choice rule, NOT NN | NO | → NN input (brain-computed mate choice) + radar |
| PHERO_DEPOSIT (gene 21) | passive gene-scaled deposit | scent overlay (indirect) | → brain OUTPUT (modulable comms) |
| DAMAGE (gene 11) | involuntary bite in economy.hunt | radar? verify | → brain-gated BITE output (predation = a decision) |
| SIZE (3) / DIET (10) | physics/economy, NOT interoceptive NN inputs | radar/appearance partial | → own-size + own-diet NN inputs |
| local crowding/density | hash scan in economy.metabolize, NOT NN | NO | → NN input (the scan already exists) |
| fertility-under-foot | NOT NN | NO | → NN input (sense the food field value under the body) |
| hungerSense (HUNGER_* synapses) | wired but OFF in the demo | brain view | → flip ON in the demo |
| AGE / READINESS | living-world inputs (verify post-merge) | brain view | → verify survived merge + visible |
| breeding | involuntary energy trigger | NO | → brain-gated BREED output (+ viability gate) |
| vision / shelter / cohesion / forage | sight vector | radar? verify | → audit radar coverage |
| scent channels | 16 synapses + (post-merge) hidden inputs | `f` overlay + brain view | verify fed to hidden layer |
| bioluminescence / glow | living-world output + render | render glow | verify survived merge |

Rule of thumb: an INPUT lets the brain PERCEIVE the thing; an OUTPUT lets the brain ACT on it; both is best.
Every heritable trait gets a radar axis (LENSES in radar-view.ts); body-relevant genes drive appearance
(trait modules src/render/detail/*); every synapse incl. the hidden layer shows in BrainView.

---

## 4. Speciation reality (read before any speciation work) — `…-sexual-reproduction-speciation-results.md`

The compatibility gate PROVABLY works (0 cross-diet parent links) but emergent speciation does NOT yet appear:
the ecology collapses to a grazer MONOCULTURE (Gause exclusion → nothing to isolate), predators go extinct, and
there's NO Fisherian runaway (PREFERENCE doesn't track DISPLAY). **Sexual reproduction MAINTAINS isolation; it
doesn't CREATE diversity.** To SEE speciation you must pair it with the diversity levers (memories
diversity-levers / pocket-richness-diversity: two food channels, per-pocket richness) so populations DIVERGE,
then behavioral `brainDistance` + the kin-scent mate channel isolate the diverged groups. Follow-up bead
life-sim-id9w. Evolvable-reproduction-mode (the cost of sex) = bead life-sim-z0f1.

---

## 5. Process that worked (last session)

Brainstorm BEFORE building → written spec → bite-sized TDD plan → subagent-driven execution (fresh implementer +
independent reviewer per task) → measure honestly. Run a feasibility PROBE before any feature whose viability is
in doubt (the mate-encounter probe caught the 8192² density wall before any feature code). Surface real decisions
to the owner — especially anything that changes the economy or what evolves. `main` moves under you: re-check it
before merging. Track work in beads. Omit the Co-Authored-By trailer (hook blocks it).
