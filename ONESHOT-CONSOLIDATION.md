You are a simulation engineer on life-sim, a deterministic 2-D TypeScript "Evolution Playground"
(data-oriented SoA core, WebGL renderer + headless harness sharing ONE sim core).

## Mission — THE GREAT CONSOLIDATION
Two big lines of work were developed in PARALLEL on separate branches and now must be merged into ONE
unified system on `main`, then fully INTERCONNECTED. After this session, on `main`, EVERY feature / gene
/ world-field / action must be:
  (1) DECISION-WIRED: plugged into the creature's neural network — a sensed INPUT, a brain-controlled
      OUTPUT, or both. The brain must be able to perceive it and/or act on it.
  (2) VISIBLE: it has a visual representation — on the radar chart (RadarView/LENSES), in the brain
      visualization (BrainView), and/or the creature's physical appearance (creature-visuals trait
      modules). Nothing wired-but-invisible; nothing visible-but-inert.
The goal is ONE tightly-coupled system producing complex, legible, EMERGENT behavior — not a pile of
disconnected mechanics. Legibility (you can SEE why a creature does what it does) is the success bar.
EXPLICIT OWNER REQUEST FOR THIS SESSION: perform the great consolidation (merge + reconcile the two brain
architectures into one), then verify EVERYTHING is wired correctly and working as intended — every input
reaches the brain, every output is a real decision, every gene is visible, and the unified world stays
alive and produces legible emergent behavior. Measure it; don't assume it.

## Repo + policy (READ FIRST)
- Repo: /Users/joshtaylor/CodingProjects/life-sim. Work on a FRESH branch off main, or a worktree — NEVER
  build on main directly. `git reset --hard` is hook-blocked; use `git checkout -b <name> main`.
- **main MOVES under you.** Multiple sessions merge in parallel. ALWAYS `git log -1 main` at start AND
  again before any merge (a planned fast-forward can become a real 3-way merge). The literal checkout dir
  (/Users/joshtaylor/CodingProjects/life-sim) usually sits on a DIVERGENT branch (feat/living-world) — do
  NOT trust it as main; verify the ref.
- Build policy (memory feature-default-on-policy.md): new features ship ON by default. Determinism is the
  ONLY invariant — same (config,seed) → byte-identical run-to-run (world.test.ts, FIRST test). RNG is
  consumed ONLY at reproduction, ascending live-slot order; the hot loop (sense/steer/move/metabolize) is
  RNG-FREE. The frozen "golden hash" baseline is RETIRED — do NOT add a byte-identical-when-off test, an
  RNG-draw-skip gate, or a hardcoded stateHash constant. Per feature: an ablation toggle + a
  same-(config,seed)→same-hash test + a headless liveness guardrail (a REAL load-bearing test —
  interconnection can crash the population; src/headless/env-guardrail.ts is the existing one).
- Determinism note from the brain arc: appended brain-weight blocks are ALWAYS-DRAWN at seed/mutate (they
  fall through the wall/flow/hunger/phero gating, drawing RNG unconditionally). Adding always-drawn genes
  changes the default world (allowed — golden hash retired) but stays same-(config,seed) reproducible. The
  genome byte-id tests (genome.test.ts) loop EAT_GATE_BIAS..BRAIN_GENES-1 to cover the always-drawn tail.
- Commands: tests `NODE_OPTIONS=--expose-gc npx vitest run` (~90-160s; the hidden layer added ~31% per-tick
  compute, so vitest testTimeout was raised to 120000 and the 3 heavy world.test integration tests carry
  explicit 120000 timeouts); typecheck `npx tsc --noEmit`; lint `npx eslint src`; build `npm run build`
  (a.k.a. `pnpm build`); live demo `npx vite preview --port <FRESH> --strictPort` after a build, or
  `npm run dev -- --port <FRESH> --strictPort` (ALWAYS a fresh port — same-port reload serves a STALE
  compiled main.ts; memory vite-stale-module-verify). Liveness probe: `npx tsx src/headless/env-guardrail.ts`
  (15000 ticks × 4 seeds, prints PASS/FAIL per seed). Track work in BEADS (bd create/update/close, bd sync
  --flush-only), NOT TodoWrite. Commit hook BLOCKS the Co-Authored-By trailer if it appears in the bash
  command line — write the message to a file and `git commit -F <file>`. `make` fails in a worktree — run
  npx directly.

## ACCURATE git state at hand-off (RE-VERIFY — main WILL have advanced)
- `main` @ **1fb7767** ("merge: sexual reproduction into main (scent + lineage)"). BRAIN_GENES=36,
  SCALAR_GENE_COUNT=26. Has: 16 SCENT synapses (PHERO_C0..C3 at brain slots 20-35), sexual reproduction
  (DISPLAY(24)/PREFERENCE(25) scalar genes, MATURITY_AGE(22)/SENESCENCE_AGE(23), crossover, mate-seeking),
  lineage family-tree inspector.
- `feat/living-world` @ **0b2b68b** (the "smarter brains" arc — THIS hand-off's work). BRAIN_GENES=110,
  SCALAR_GENE_COUNT=22. NOT merged. 9 commits ahead of the merge-base (1d6ab13); main is 49 ahead.
- The two branches share merge-base **1d6ab13** ("reverse thrust + adopt on-by-default feature policy").

## What feat/living-world adds (the "smarter brains" arc — all committed, validated, NOT merged)
Built this session as small TDD slices, each: fresh-context validator (all clean, zero defects) + env
guardrail (alive all 4 seeds) + full suite green + determinism byte-identical. Spec:
docs/superpowers/specs/2026-06-23-smarter-brains-design.md.
- **Policy** (1d6ab13): on-by-default; determinism the only invariant; retired the golden-hash. (This is
  the merge-base, so it's already shared with main.)
- **A — reverse thrust**: thrust floor −reverseThrustFraction·maxThrust (0.5; 0 = legacy forward-only),
  both motor paths, −0 guarded so frac=0 is bit-identical.
- **B — brain-gated eating**: a new EAT_GATE OUTPUT (first non-locomotor output) — a sigmoid throttle on
  graze intake that ALSO costs mobility (thrust ×= 1−eatGate·eatMovePenalty), so eating is a decision
  (graze slow vs lift head to flee). NOTE: eating is otherwise FREE in this engine (no movement coupling),
  so the eat-immobilize tradeoff is what makes the gate non-degenerate.
- **C — age input**: interoceptive maturity = min(age/ageNorm,1) on AGE_TURN/AGE_THRUST synapses.
- **D — repro-readiness input**: clamp((energy−reproThreshold)/(satiatedBar−reproThreshold),0,1) on
  READINESS synapses. Built as "readiness" NOT "fullness" because for a linear net energy/satiatedBar is
  just 1−hunger (same axis) — clamping to the breeding BAND makes it distinct.
- **E — HIDDEN LAYER** (the big one): a fixed H=4 tanh hidden layer as a SKIP-CONNECTION (residual) on top
  of the linear map — output = linear(inputs) + Σ_j hidden_j·W2. Gives conditional logic the linear map
  can't ("flee only if predator close AND cornered"). ASYMMETRIC plasticity: hidden→output (W2) LEARNS via
  the existing Hebbian rule; input→hidden (W1) is EVOLVE-ONLY/frozen within life (the Hebbian rule can't
  credit-assign through a hidden unit — this is the honest limit). H is a COMPILE-TIME constant (it sizes
  the genome stride). The 3-layer brain inspector (brain-view.ts) renders the violet hidden column + edges.
- **F — mood-glow** (3 sub-slices): F1 glow OUTPUT = sigmoid(GLOW_BIAS + Σ hidden·GLOW_HID) read from the
  hidden "mood" layer (display-only, evolve-only, no elig); F2 the renderer lights biolum from it
  (amp = u_glow·a_mood); F3 the glow-SENSE comms channel — a glow scalar field (reuses PheroField) that
  creatures deposit their glow into each tick and sense the GRADIENT of → 4 GLOW_SENSE brain weights
  (LEARNED). This makes glow a SELECTED signal (others react). Owner's design intent: glow is dim at
  founding (GLOW_BIAS −1.5 → ~0.18, "exception not norm"); each lineage's hidden→glow weights diverge so
  DIFFERENT SPECIES EVOLVE DIFFERENT GLOW MECHANISMS. Plus a fix(health): exactly-0 energy on a live
  creature is a valid post-reproduce transient (was wrongly flagged).

### feat/living-world brain slot map (BRAIN_GENES=110) — the OLD pre-scent layout it was built on:
  0-9   core (LAT/FWD turn+thrust, TURN/THRUST bias, SIGHT_*) — BRAIN_CORE_GENES=10
  10-13 WALL_*      14-17 FLOW_*      18-19 HUNGER_*      20-23 PHERO_* (OLD 4-synapse phero)
  24-28 EAT_GATE (bias, fwd, lat, sight_fwd, sight_lat)     29-30 AGE_{TURN,THRUST}
  31-32 READINESS_{TURN,THRUST}
  33-88 HIDDEN_W1 (input→hidden, HIDDEN_INPUTS=14 × HIDDEN_UNITS=4)   89-100 HIDDEN_W2 (hidden→output 4×3)
  101 GLOW_BIAS   102-105 GLOW_HID (hidden→glow)   106-109 GLOW_SENSE_{LAT,FWD}_{TURN,THRUST}
  HiddenInput order (14): food fwd/lat, sight fwd/lat, wall fwd/lat, flow fwd/lat, phero fwd/lat, hunger,
  age, readiness, bias. HIDDEN_OUTPUTS=3 (turn=0, thrust=1, eat-gate=2); glow reads hidden via GLOW_HID.

### Deferred (flagged, not done — fold into this consolidation):
- Glow-field VISUAL overlay (F3 channel works but the field has no layer overlay like pheromones do).
- Glow metabolic COST knob (defaults 0 — add when tuning F3 selection so glow isn't free).
- Mood-glow is DIM at founding by design — a render-gain/seed tune gives more immediate pop if wanted.
- Hidden-layer ~31% per-tick perf (accepted; trim H or skip-if-near-zero if the demo lags).
- BRAIN_DEPTH evolvable-depth gene + brain-gated REPRODUCTION timing (deferred from the arc).

### STRANDED WIP in the feat/living-world worktree (NOT mine — resolve at consolidation):
main.ts (a half-done livingWorldOverrides refactor — the import was fixed so it builds), parcels.ts
(clustering), untracked living-world-config.ts / vision-census.ts / vision-revival spec. From another
session. Decide finish/stash/drop before merging the worktree state.

### Just-merged to main from feat/sexual-reproduction (life-sim-xa90, @1fb7767) — VERIFY + FINISH:
- DISPLAY(24)+PREFERENCE(25) genes; `geneticDistance` (DIET-weighted compatibility; DISPLAY/PREFERENCE
  weighted 0); `crossoverScalarGenes` (per-gene uniform pick + mutation).
- Reproduction is SEXUAL by default: a satiated/mature/off-cooldown creature enters a SEEKING state
  (store.seeking/seekTicksLeft, hashed) for `mateSeekWindow` ticks, gets a sight pull toward similar-looking
  creatures (gated by store.seeking), and on contact with a genetically-COMPATIBLE mate (geneticDistance <
  mateCompatThreshold within mateContactRange) does a crossover birth. `sexualReproduction:false` = asexual
  ablation. Shared spawnChildSlot/provisionAndFinalize helpers.
- Reproductive-VIABILITY gate: breeds only if energy > reproOverhead + REPRO_THRESHOLD, provisioning
  reserves that floor → mother never breeds into death (fixed a breed-to-zero zombie bug; both paths).
- **STUBS to finish:** `crossoverBrain` (genome.ts) currently CLONES the mother's brain (no paternal
  crossover); `brainDistance` was removed (dead always-0 stub); `geneticDistance` has a comment-seam where a
  per-weight brain term plugs in. DISPLAY/PREFERENCE have NO radar axis, NO appearance, and PREFERENCE is
  NOT an NN input. Mate-seeking is a SIGHT proxy, not NN-routed.
- **Measured findings (docs/superpowers/specs/2026-06-23-sexual-reproduction-speciation-results.md):** the
  compatibility gate PROVABLY works (0 cross-diet parent links). BUT emergent speciation does NOT yet
  appear: (a) ecology collapses to a 1-2 dynasty grazer MONOCULTURE (pre-existing Gause exclusion — nothing
  to isolate; fix is upstream DIVERSITY: memories diversity-levers + pocket-richness-diversity), (b)
  predators go extinct (predation-engine-ceiling), (c) NO Fisherian runaway (PREFERENCE↔DISPLAY corr ≈ 0),
  (d) at 8192² seekers too SPARSE to meet (contact 12u vs ~1000u spacing — mate-seeking bleeds out; alive
  at 2048²). KEY LESSON: sexual repro MAINTAINS species boundaries, it does not CREATE the diversity to
  isolate. Follow-up bead life-sim-id9w; v2 bead life-sim-z0f1 = evolvable REPRO_MODE.

## CRITICAL CONFLICT (the load-bearing reconciliation)
main's 16 SCENT synapses occupy slots 20-35; feat/living-world's old 4-synapse phero (20-23) + eat-gate
(24-28) + age/readiness (29-32) + hidden layer (33-100) + glow/glow-sense (101-109) occupy 20-109. They
OVERLAP and BRAIN_GENES is 36 vs 110 — the two brains are INCOMPATIBLE and CANNOT be naively merged. They
MUST be reconciled into ONE unified brain:
   all senses (food / sight / wall / flow / 4×scent / hunger / age / readiness / glow-sense)
        → HIDDEN LAYER (MLP, skip-connection) → outputs (turn / thrust / eat-gate / glow / new outputs §4)
Do this reconciliation FIRST — it unblocks everything. Concretely: take main's 16-scent block + sexual-repro
scalar genes (DISPLAY/PREFERENCE/MATURITY/SENESCENCE → SCALAR_GENE_COUNT 26) as the base, then re-lay
feat/living-world's hidden layer + eat-gate + age/readiness + glow + glow-sense ON TOP with a fresh,
non-overlapping slot map, and make the 16 SCENT inputs FEED THE HIDDEN LAYER (HIDDEN_INPUTS grows to
include the 4 scent channels — they must not be a vestigial linear-only path). Recompute every brain index
(genome.ts, brain.ts steer + learn elig, brain-view.ts, the genome byte-id reference loops). Keep
determinism (same-seed→same-hash + full suite + a liveness guardrail).

## What to do (this order; small, individually-reviewable TDD increments; subagent-driven)
1. ORIENT + CONSOLIDATE THE BRAIN. Verify main's scent + sexual-repro state; merge feat/living-world and
   RECONCILE the two layouts into ONE unified inputs→hidden-layer→outputs brain (per CRITICAL CONFLICT).
   The 16-scent block must feed the HIDDEN LAYER. Verify the sexual-repro viability gate + EAT_GATE + glow
   survive. Full suite green + determinism + a liveness guardrail at the unified scale.
2. RE-AUDIT — refresh docs/neural-network-interconnection-map.md (it EXISTS on main but predates BOTH the
   sexual-repro and living-world merges): for EVERY gene, world-field, action, two columns — "decision-wired?
   (input/output/no)" and "visible? (radar/brain/appearance/no)". List gaps on BOTH axes. Seed gaps:
   DISPLAY/PREFERENCE, own-size, own-diet, local crowding, fertility-under-foot, brain-gated bite/breed/
   scent-deposit, AGE/READINESS (verify they survived), glow + glow-sense (verify).
3. WIRE MISSING INPUTS (gated-synapse template; route through the hidden layer): own-SIZE, own-DIET, local
   CROWDING/density (the hash scan exists in economy.metabolize), fertility-under-foot, and PREFERENCE (so
   mate-choice is a brain computation, not a fixed |display−preference| rule). Flip hungerSense ON in the demo.
4. PROMOTE INVOLUNTARY ACTIONS TO BRAIN OUTPUTS (decisions, routed through the hidden layer): brain-gated
   BITE (uses DAMAGE → predation a decision); brain-controlled SCENT-DEPOSIT strength (PHERO_DEPOSIT → a
   modulable comms channel); brain-gated BREED (composes with the viability gate — brain chooses WHEN, gate
   enforces affordability). EAT_GATE + glow already exist from living-world — verify + extend the pattern.
5. FINISH the sexual-repro brain seams against the UNIFIED hidden-layer layout: `crossoverBrain` = real
   per-weight parental crossover (mirror crossoverScalarGenes — uniform pick + mutation over the FULL
   BRAIN_GENES incl. hidden layer); CREATE `brainDistance` (per-weight L2) and plug into geneticDistance's
   seam → behavioral (not just dietary) isolation. THEN route mate-finding through the NN via the kin SCENT
   channels (kin-cos/kin-sin) — a learned "seek a compatible mate by scent" input+output that fixes the
   8192² sparsity (sight-only seeking bleeds out). FIRST fix the upstream DIVERSITY (diversity-levers /
   pocket-richness-diversity), else you isolate a monoculture into one species.
6. CLOSE VISIBILITY GAPS (mandate 2): every synapse incl. the hidden layer + every I/O in BrainView; every
   heritable trait gets a radar axis (extend LENSES — DISPLAY/PREFERENCE missing); body genes show in
   appearance (src/render/detail/*). DISPLAY is an ORNAMENT — drive a visible appearance cue from it (and
   watch §5's sexual selection move it). Add the deferred glow-field overlay. Nothing wired-but-invisible.
7. VERIFY + MEASURE (honest): determinism + a liveness guardrail per feature + a multi-seed
   src/headless/life-history.ts --demo run showing the newly-wired systems SHIFT behavior — own-size →
   divergent flee/tank; brain-gated bite → does predEncounter rise?; PREFERENCE-as-input + brainDistance →
   behavioral mate choice; kin-scent mate channel → do seekers find mates at 8192² (re-run
   mate-encounter-probe.ts)?; glow-sense → do creatures respond to others' glow? Report with file:line
   evidence. The bar is emergent, legible, INTERCONNECTED behavior AND honest measurement — if a wiring
   doesn't move behavior or speciation still doesn't emerge, SAY SO with numbers (last session's
   monoculture/no-runaway findings were the most valuable output).

## Process that worked
brainstorming skill BEFORE building; a written spec + a bite-sized TDD plan; subagent-driven execution
(fresh implementer + INDEPENDENT reviewer per task — never self-validate; the per-slice fresh-context
validators caught real issues every time); a feasibility PROBE before any feature whose viability is in
doubt (the mate-encounter probe caught the 8192² density wall before any feature code). Surface real
decisions to the owner rather than guessing — especially anything that changes the economy or what evolves.
