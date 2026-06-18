# Senses & Smarter Creatures — Design (sub-project 1 of 2)

**Status:** design, approved in brainstorm 2026-06-18; revised after an adversarial spec review (the
review corrected the sensor-model description, the sight-range/spatial-hash mismatch, and a drifting-cap
determinism trap). Builds on the merged M7.5 ecology + the environmental layer. **Sub-project 1** of a
two-part arc; **sub-project 2** (in-life Lamarckian plasticity, unsupervised/Hebbian, reward-free) is a
*separate later spec* layered on top of this one.

## Goal

Turn the current "wiggle-into-food" foragers into **fewer, smarter, longer-lived individual creatures**
that navigate a **sparser, drifting world** with **distinct senses** and a visible **predator-prey arms
race** — all emergent, evolved, and wired through the genome-developed neural net. No scripted goals; the
only goal is survival. Give creatures **smell, sight, and hearing** as evolvable sense organs feeding
their brains, put their food in **drifting zones** they must find and follow, tune the economy so a fed
creature lives ~3-5 minutes and a starving one dies fast, and let pursuit/flight/territoriality emerge.

## Success bar (definition of done)

1. **Three working senses**, each an evolvable sensor-organ wired into the genome brain: SMELL
   (chemical/food), SIGHT (line-of-sight to creatures), HEARING (motion/noise).
2. **Drifting food zones** — sparse, rich pockets whose centers migrate slowly; creatures congregate in
   them and must follow as they drift.
3. **Felt longevity** — at the canonical **1× rate of 60 ticks/s**, a fed creature averages ~3-5 min
   (10.8k-18k ticks); cutting off food → death in seconds. K-selected: few, large, long-lived.
4. **Purposeful navigation** — the Phase-1 feel-probe records *today's* baseline (path-straightness toward
   food, time-to-food); the gate is a concrete improvement (target ≥30% straighter OR time-to-food down
   ≥30%), with the sensorimotor loop visible in the brain inspector.
5. **Emergent arms race** — predators pursue prey by sight/hearing; prey flee by smell/sight/hearing; all
   three trophic levels keep population >0 at 12k ticks across **≥5 seeds**.
6. **Invariants preserved throughout** — cardinal rule, byte-identical determinism, OFF-by-default,
   allocation-free hot loop (detailed below). `make check` green at every increment.

## Invariants (every increment)

- **Cardinal rule:** sense/movement/death decisions read ONLY `f.cellType[j]` and
  `organisms.carnivore[f.organismId[j]]` — never `founderId`/lineage/species/any id. Sight target
  classification, hearing, drift, and longevity all obey this. Founder predator vs forager genomes differ
  ONLY by which cell types they develop (PREDATOR cells → carnivore flag set *structurally*) and their
  synapse weights; **no core kernel ever reads a "this is a predator genome" label** — the carnivore
  branch is inferred from `organisms.carnivore`, exactly as today. Hand-wired founder brains are mutable
  starting genomes selected economically, NOT scripted behavior.
- **Determinism:** no `Math.random`/`Date.now` on the hot path; new field deposits run end-of-tick over
  the post-lifecycle live set (same one-tick coupling as food); spatial queries run in canonical
  bucket-then-ascending-slot order; sight "nearest" ties resolve to first-in-canonical-scan-order via
  strict `<` on squared toroidal distance. Drift is a pure `f(tick, per-patch phase/freq)` where the
  phases/freqs are drawn ONCE at init from a **new dedicated `rng.split` stream** (not `STREAM_LIGHT`), so
  adding drift cannot perturb existing streams. `reproducibility.test.ts` gets a senses-ON + drift-ON case.
- **OFF-by-default & byte-identical-until-opt-in:** drift amplitude 0 ⇒ the light cap is left exactly as
  `seedPatches` set it (NO per-tick recompute — the only safe way to stay byte-identical); `loudnessGain`
  0 ⇒ NoiseField deposit+step skipped entirely; sight viewRange gated so no query runs without sight
  sensors; the new `senseSource` mutation draw and the expanded sensor-channel count are gated behind
  senses-ON so baseline RNG draws are unchanged. New sense modalities exist only on genomes that grow them.
- **Zero-alloc hot loop:** new kernels (NoiseField step, sight query, occlusion, cap recompute) allocate
  nothing per tick — reused scratch, like the rest.

## Design

### 1. The sensory model — how a sense reaches the brain (corrected)

**How sensing actually works in this engine** (the review corrected my first draft): a SENSOR cell does
not feed the brain a 2D vector. `cells/sense.ts` writes a 2D gradient into the per-cell scratch pair
`senseX/senseY`; then in `neural/think.ts` each sensor cell injects exactly **one scalar** activation,
chosen by its `sensorChannel` — `FWD_GRAD` projects `senseX/senseY` onto the body heading, `LAT_GRAD`
onto the lateral axis. So **"smell" today is a *pair* of sensor cells** (a forward gradient sensor + a
lateral gradient sensor) reading the same `senseX/senseY`. A directional sense organ is therefore a PAIR.

**Adding modalities (two orthogonal gene attributes):**
- A new per-sensor-gene attribute **`senseSource` ∈ {SMELL, SIGHT, HEARING}** selects *what fills
  `senseX/senseY`* for that sensor cell (which field/query). Stored per-gene in `develop.ts` body arrays
  and per-cell alongside `net.sensorChannel`; the brain-inspector labels sensors by `senseSource`.
- The existing **`sensorChannel` (FWD_GRAD / LAT_GRAD)** still does the projection-to-scalar. So a full
  sight organ = two cells: `(SIGHT, FWD_GRAD)` + `(SIGHT, LAT_GRAD)`. Sight and hearing **reuse** the
  existing FWD/LAT projection — no new projection math, and smell-trained projection weights transfer.
- `sense.ts` becomes: for each sensor cell, fill `senseX/senseY` from `senseSource` (SMELL = chemical-
  field gradient as today; HEARING = noise-field gradient; SIGHT = the sight vector below), THEN `think.ts`
  projects per `sensorChannel` unchanged.
- **Mutation surface:** `senseSource` and sight's `sightTarget` join the gene-mutation operators, and the
  hardcoded `rng.int(6)` channel count in `mutate.ts` is bumped — all gated behind senses-ON so baseline
  RNG draws stay byte-identical; the senses-ON reproducibility test covers the expanded range.

**SMELL** *(exists; keep)* — central finite-difference of a diffusing chemical field. Source field is
chosen by the organism's `carnivore` flag exactly as today (carnivore → prey-scent, herbivore → food +
the existing pred-scent flee term). No change to smell routing in v1. → **find food**.

**HEARING** *(new — `NoiseField`)* — a `ScalarField` subclass using the default deposit/diffuse/decay
`step` (literally `class NoiseField extends ScalarField {}`, like `GlowField`; assumes the merged env
refactor). **Deposit:** at end-of-tick (step 11b, alongside `food.depositAt`, over the post-lifecycle live
set), each cell deposits `loudnessGain * speed` where `speed = hypot(velX, velY)` (motion, not effort —
a cell thrusting into a rock with speed≈0 is silent). **Per-cell** deposit (a bigger body is louder by
cell count — accepted; flagged as a tuning knob). SENSE reads its **gradient** next tick (same one-tick
coupling as smell). **Undifferentiated** — one field, everyone deposits and reads — so it carries
ambiguous "something is moving near me, that way"; the brain *evolves* how to use it. **Self-noise** is
attenuated only by the one-tick lag + decay + the gradient read (a lone mover's own centered deposit has
~0 gradient at its location); there is **no** per-organism subtraction (impossible on a summed field) —
validated headlessly that hearing-only creatures still navigate. `loudnessGain` 0 = OFF (skip
deposit+step). → **detect motion you can't see**.

**SIGHT** *(new — a dedicated cone query; the one mechanism that legitimately exceeds the 3×3 window)* — a
general visual sense with **evolvable, type-tuned eyes**. The sensor looks along the sensor cell's
`heading` and finds the **nearest object of its target class** within `viewRange` and `viewHalfAngle`.
- **Query:** a dedicated scan over an `(2R+1)×(2R+1)` hash block, `R = ceil(viewRange/cellSize)`, NOT the
  shared 3×3 loop. `viewRange` is a config knob with a **documented cost ceiling** (start `R ≤ 3-4` ≈
  48-60 units, profiled in `scaling-bench` per the `predReach` discipline). The toroidal-seam
  double-count guard (which the 3×3 alias guard does not generalize to) is re-derived for the wider window.
- **Target class (evolvable, NOT diet-routed):** each sight gene carries a `sightTarget ∈ {FOOD, PREY,
  PREDATOR}` — FOOD = nearest edible (PHOTO/MEAT) cell, PREY = nearest non-carnivore organism flesh,
  PREDATOR = nearest carnivore flesh. The genome grows **any mix** of eyes and the brain wires each however
  it likes; nothing forces what a creature sees. The described behavior — predators chase prey, prey
  approach plants and flee predators — *emerges from selection*: a predator that wastes an eye on FOOD or
  never wires its PREY-eye to pursuit is out-competed; likewise a prey that stares at predators without
  fleeing. Classification reads ONLY `f.cellType[j]` + `organisms.carnivore[f.organismId[j]]`
  (cardinal-safe). The creature's own organism cells are excluded from the scan. `sightTarget` joins the
  evolvable gene attributes (gated behind senses-ON like `senseSource`).
- **Selection & ties:** nearest by strict `<` on squared toroidal distance (`wrapDelta`); exact ties (which
  occur on a torus) resolve to first-in-canonical-scan-order (lowest bucket, then ascending sorted slot).
  Documented in `READS-WRITES.md`.
- **Output:** `senseX/senseY = unitDirectionToTarget × proximity`, `proximity = clamp((viewRange − dist)/
  viewRange, 0, 1)`; **zero vector** when no target is in cone (then FWD/LAT project to 0).
- **Rocks occlude** sight — but this is **net-new geometry** (segment-from-eye-to-target vs each rock
  circle: closest-point-on-segment-to-center < rockRadius, over rocks in the corridor via the rock grid),
  so it's a **separate OFF-able sub-task within Phase 3**: the first sight build lands *without* occlusion,
  then occlusion is added incrementally (reused scratch, canonical order, allocation-free). → **see what's
  right there** (plants or creatures) — short-range, line-of-sight, complementary to smell's long-range trail.

### 2. The world — drifting food zones + longevity economy

**Drifting zones.** *(In this engine light drives food via photosynthesis, so "drifting light patches" ARE
"drifting food zones.")* Push the light field toward **few, tight, rich** Gaussian patches (fewer patches,
smaller radius, higher per-patch cap); `crowdDivideCap` keeps each zone lush-but-not-jammed. New per-patch
state on `LightField` — `{centerX, centerY, radius, peakCap, phase, freq}` — is seeded ONCE at init from a
**dedicated drift RNG stream** and retained (today's `seedPatches` discards centers; it's refactored to
keep them). Each tick when `driftAmplitude > 0`, `cap[]` is recomputed as a pure sum-of-Gaussians at
`center(t) = base + driftAmplitude·[sin(freq·t + phase), cos(freq·t + phase)]`, via a **single shared
Gaussian-sum-and-normalize helper** that `seedPatches` also calls (one accumulation/normalization order,
so no float-non-associativity drift). When `driftAmplitude == 0`, **the cap is not recomputed at all** —
byte-identical to today. Light blooms ahead of the drift and fades behind; the zone visibly migrates and
creatures must follow. Spacing is set headlessly so travel between zones is a real journey but zones stay
smell-able from afar (measured: smell carries ~92% of the half-world). Territoriality is emergent.

**Longevity economy (K-selection).** Target (§3 of the bar): fed ~3-5 min (10.8k-18k ticks @ 60/s),
income cut-off → death in seconds. Levers: low `basalCost`, high `reproThreshold` (longer lives, fewer
offspring), reserves tuned so starvation hits the death floor fast. Steers the documented r/K tension hard
toward K. Numbers derived by the headless feel-probe, not guessed.

### 3. Movement & behavior — purposeful, fast, legible

- **Decisive steering & speed (tuning):** raise `maxThrust` and the turn/thrust response so a clear sense
  signal → committed turn + real acceleration. Pursuit and flight become dynamic.
- **Smart founder brains:** hand-wire founder forager/predator genomes to *use* the senses so purposeful
  behavior is visible from tick 0 (evolution then refines): predator = sight→steer-toward-prey +
  hearing→home-in; prey = smell→toward-food, sight/hearing→flee. These are *starting genomes* (mutable,
  economically selected) — not scripted behavior, and no core kernel reads a role label (see Invariants).
- **Emergent arms race:** prey sense predators and flee; predators sense prey and pursue; drifting zones
  keep both migrating. Emergent from senses + economy + selection.
- **Visible brains:** the `B` inspector already shows live neuron firing; label sensor inputs by
  `senseSource` so a sight-lock → interneuron → mover-pursuit chain is readable.

### 4. Testing & build order

**Testing (oracle-driven):**
- Unit tests per kernel: `NoiseField` (deposit = loudnessGain·speed, gradient, diffuse/decay); sight
  (nearest creature in cone, the `(2R+1)²` window + toroidal-seam guard, diet routing, tie-break,
  output encoding); occlusion (segment-vs-circle); `senseSource` routing into `senseX/senseY`; drift cap
  recompute (shared helper, amplitude-0 no-op).
- **Golden behavior tests** (annotated with earliest runnable build step): sight-unit tests at step 3; a
  sighted predator catches a fleeing prey + a sight-only forager finds food faster than smell-only — both
  at **step 4** (need founder brains).
- **Headless feel-probe** is the gate — records the baseline (path-straightness, time-to-food) and reports
  lifespan distribution, zone count/drift, predator/prey cycle, purposefulness delta, across ≥5 seeds +
  long runs. Nothing reaches the live demo until it passes the bar.
- `reproducibility.test.ts`: senses-ON + drift-ON, byte-identical + non-vacuous (covers the expanded
  mutation range).

**Build order (incremental, each `make check`-green + byte-identical + probe-gated):**
1. **Drifting zones + longevity economy** — get the *world* right first (sparse/drifting/K-selected);
   record the navigation baseline.
2. **Hearing + sensor-modality scaffolding** — `senseSource` attribute end-to-end (gene → develop →
   instantiate → sense.ts → inspector), the `NoiseField`, the read path. One sense as the template.
3. **Sight (no occlusion)** — the `(2R+1)²` cone query, diet routing, tie-break, output encoding; then
   **3b: rock occlusion** as an OFF-able increment.
4. **Smart founder brains + movement/feel tuning** — the purposeful payoff; the catch/flee golden tests.
5. **Arms-race balance + brain-inspector sense labels** — tune the 3-trophic dynamic, make it legible.

## Risks & mitigations

- **Self-noise in hearing** — only the one-tick lag + gradient suppress it (no per-organism subtraction);
  probe that hearing-only creatures still navigate, else add a small dead-zone or read-magnitude variant.
- **Sight query cost** — bound by `R = ceil(viewRange/cellSize)` with a profiled ceiling; the wider-window
  toroidal-seam guard is a correctness item, tested explicitly.
- **Drift determinism** — amplitude-0 is a hard no-recompute no-op; the shared Gaussian-sum helper keeps
  amplitude>0 reproducible; dedicated RNG stream keeps baseline streams byte-identical.
- **Balance fragility** (a new sense over-powers one side) — multi-seed long-run probe is the gate; senses
  ramp via founder wiring + OFF-by-default knobs.
- **Economy re-derivation** for K longevity is fiddly — headless per-lever, re-baseline.

## Out of scope (later / separate)

- **Sub-project 2:** in-life unsupervised (Hebbian) plasticity + Lamarckian inheritance, reward-free.
- Custom/destructible rocks and rock-sheltered **safe habitats** (owner wants this *later*).
- Prey-sees-prey **schooling**, hearing target-tuning, per-gene smell field-selection, body-occlusion
  sight — deferred knobs.
- M8 parallelism. (Inter-creature signaling/communication was not discussed and is not planned.)

## Open tuning questions (derived headlessly, not guessed)

Zone count + drift speed + spacing; sight `viewRange` + `viewHalfAngle` (+ the cost ceiling on `R`);
hearing `loudnessGain` + decay; the longevity economy numbers (`basalCost` / `reproThreshold` / reserves);
movement gains (`maxThrust` / turn / thrust scales).
