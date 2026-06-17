# Tick READS/WRITES contract (§4.3)

The order and the per-step reads/writes that `World.tick` implements. The
golden-tick and integration tests assert against this contract; changing the
order means changing this table first.

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | rebuildLive | flags | liveIndices, liveCount |
| 1b | **bonds.rebuildLive** (M5) | bond pool (alive flags + endpoint slots/gens); cell generations | liveBonds, liveBondCount (prunes bonds with a dangling endpoint) |
| 2 | hash.build | posX, posY | hash buckets |
| 2b | **SENSE** | cellType, pos; **previous** tick's food field | senseX, senseY (**MOTILE and SENSOR**) |
| 2c | **orientSensors** (M5) | net.sensorCell; organismId; `organisms.mover`; **previous** tick's MOVER heading | heading (SENSOR cells ← their organism's MOVER heading) |
| 3 | **THINK** (M4) | sensor bindings + senseX/senseY + heading (body-frame projection); snapshotted live-synapse pool (pre/post); `actCur` (a(t−1)); bias; cellType (per-neuron re-check) | `actNxt` then **swap** → `actCur` holds a(t) (SENSOR/NEURON/MOVER activations) |
| 4 | **ACT** | MOTILE: cellType, senseX, senseY, heading (reflex). **driveMovers (M4):** motor bindings + `actCur`[turn/thrust neuron] + heading | heading, thrust (**MOTILE reflex AND MOVER from neurons**) |
| 5 | computeRepulsion | posX, posY, radius | forceX, forceY |
| 5b | **applyThrust** | cellType (via thrust=0 skip), heading, thrust | forceX, forceY (**accumulates** after repulsion) |
| 5c | **computeBondForces** (M5) | liveBonds; cellA/cellB; restLen; stiffness; posX/posY; `cfg.bondStiffness` | forceX, forceY (**scatter, equal-and-opposite**; accumulates after repulsion + thrust) |
| 5d | **computeAdhesion** (M5) | hash; posX/posY; radius; cellType; organismId; `cfg.adhesionStrength/Range` | forceX, forceY (gather pull toward same-type cells of a DIFFERENT organism; no-op when strength≤0, the default) |
| 6 | integrate | pos, vel, force, mass | posX, posY, velX, velY; resets force=0 |
| 6c | **breakStrainedBonds + split** (M5) | liveBonds; cellA/cellB; restLen; **post-integrate** posX/posY; organismId; bond adjacency; `cfg.bondMaxStrain/maxSplitChecksPerTick` | removes over-strained bonds (detaches adjacency); organismId (split relabels the smaller component); `organisms.mover` (migrates on split); `organisms` free-list (allocs the new id). If any broke → bonds.rebuildLive again |
| 6d | **computeDigestBonus** (M5) | liveBonds; cellA/cellB; cellType | digestBonus[] (reset then count bonded DIGESTIVE↔DIGESTIVE pairs) |
| 7 | **METABOLIZE** | cellType, energy, radius, pos, **thrust**, **digestBonus**; light field; hash buckets | energy (self **and eaten prey**, **−= moveCost·thrust²**, **−= neuralCost for SENSOR/NEURON/MOVER**, **digestive gain × (1+digestClusterBonus·digestBonus)**), light field (depletion) |
| 7b | **transferEnergy** (M5) | liveBonds; cellA/cellB; energy; `cfg.transferRate/transferEfficiency` | energy (diffuse from higher to lower endpoint per bond; `efficiency`<1 lost in transit) |
| 8 | **age** | liveIndices (tick-start set) | age |
| 9 | **LIVE/DIE/BREED** | cellType, energy, mass, pos | cellType (→MEAT), energy, **generation[] (bumped on every freed MEAT slot)**, frees meat slots, allocs child slots (split energy); lastBirths/lastDeaths |
| 10 | **ENVIRONMENT (light)** | light field, cap | light field (diffuse + regen; double-buffer swap) |
| 11 | rebuildLive (again) | flags | liveIndices, liveCount |
| 11b | **ENVIRONMENT (food)** | cellType, pos (**post-lifecycle live set**) | persistent food field (deposit + diffuse + decay; double-buffer swap) |
| 11c | **aggregateOrganisms** (M5) | post-lifecycle liveIndices; organismId; energy; posX/posY | `organisms` energy/cellCount/centroidX/centroidY (the authoritative per-organism numbers) |
| 11d | **killStarvedOrganisms** (M6) | organisms.energy/cellCount/genomeRef; organismId; mass; cellType; cfg.organismDeathFloor/meatEnergyOnDeath | atomic organism death: a dying organism's cells → MEAT (organismId→0, energy=mass·meatEnergyOnDeath), reaps their bonds, zeroes their net.actCur/actNxt, frees the org id + genome. If any died → net.rebuildLive + bonds.rebuildLive |
| 11e | **reproduceOrganisms** (M6) | organisms.energy/genomeRef/centroid; genomeStore; mutationRng (rng.split(2)); cfg.reproThreshold/reproParentFloor/offspringOffset/caps/maxBirthsPerTick + mutation rates | structural: a provisioned organism copy+mutates+develops an offspring, instantiates it near the parent (clean abort if under-provisioned/over-capacity/truncated), deducts body.totalEnergy from the parent's cells, registers the child genome + sets organisms.genomeRef/birthTick |
| 11f | **adulthood + live-organism scan** (M6) | organisms.isAlive/cellCount/energy/reachedAdulthood; cfg.reproThreshold | organisms.reachedAdulthood (set on first reaching reproThreshold); metrics.birthsReachedAdulthood/liveOrganisms |
| 12 | sampleMetrics | cellType, energy (current live set) | metrics |

## Ordering notes (the contract the golden-tick + integration tests assert against)

- METABOLIZE runs in canonical ascending live-slot order. Within it, a DIGESTIVE
  at a **lower** slot mutates `energy[j]` of a PHOTO/MEAT prey at a **higher**
  slot *before* that prey runs its own photosynthesis/decay — so a PHOTO eaten by
  a lower-slot digestive photosynthesises from its already-reduced energy that
  same tick. Two digestives targeting the same prey: the lower-slot eater eats
  first. All deterministic; the digestion query uses the hash built from
  **pre-integrate** positions (spec §4.3 order is hash → forces → integrate →
  metabolize, with no rebuild between) — a cell crossing a bucket boundary during
  integrate may miss a genuinely-adjacent prey for one tick; the post-integrate
  exact-distance check prevents false *positives* and the miss self-corrects next
  tick. Do **not** add a second `hash.build` (contradicts the spec, adds an O(n)
  sort for a one-tick false-negative-only effect).

- **age runs BEFORE lifecycle** (step 6 before 7), over the tick-start live set.
  This is required: the free-list is LIFO, so a slot freed in lifecycle pass 2 is
  the first slot `alloc` returns for a division child in pass 3 — if age ran after
  lifecycle it would bump that newborn from 0 to 1. Running age first ages every
  cell alive during METABOLIZE (including ones about to become MEAT — harmless)
  and leaves division children at the age 0 that lifecycle sets.

- **sampleMetrics runs after a second rebuildLive** (step 11 before 12), so metrics
  exclude freed corpses (`free()` never clears `cellType`, so a freed slot still
  reads MEAT) and include fresh-slot newborns; `metrics.population` then equals
  `cells.aliveCount`.

## SENSE/ACT/food coupling notes (M3)

- **SENSE reads the PREVIOUS tick's food field** (one-tick delay). The persistent
  food field is updated at the END of the tick (step 11b), *after* SENSE (step 2b)
  has already read it — so a mover steers on the gradient as it stood last tick. On
  tick 0 the field is all zeros, so the first sense returns a flat gradient and
  movers coast at `cruiseThrust`. This decouples the deposit→sense loop into a clean
  one-tick lag (no within-tick feedback).

- **METABOLIZE charges THIS tick's thrust.** ACT (step 4) writes `thrust`, then
  METABOLIZE (step 7) reads it the same tick for `energy −= moveCost·thrust²`. A
  mover pays for the thrust it just applied, not last tick's — no lag here.

- **Food deposit uses post-integrate positions** (step 11b, over the post-lifecycle
  live set) while **light depletion uses pre-integrate positions** of the same tick
  (METABOLIZE step 7 runs before the cell moved this tick — the hash and pos it reads
  are pre-integrate within the next tick's frame). This is an intentional, documented
  asymmetry: smell is laid down where a cell *ends up*, light is consumed where it
  *was* — both self-consistent within their own step ordering and stable at equilibrium.

## THINK / neural coupling notes (M4)

- **Sensor → neuron → mover within a tick.** SENSE (step 2b) writes the world-frame
  gradient THIS tick → THINK (step 3) injects the **body-frame** projection
  (`fwd = gx·cos+gy·sin`, `lat = −gx·sin+gy·cos`) into the sensor's `actNxt` and
  computes neuron/motor activations → after THINK's buffer **swap** `actCur` holds
  a(t) → ACT (step 4, `driveMovers`) reads `actCur`[motor neuron] THIS tick to drive
  the MOVER. So THINK→ACT is same-tick (no lag). The **recurrent term reads a(t−1)**
  (`actCur` before the swap): every synapse path carries an inherent one-tick delay
  (sensor→hidden→output reaction lag of 1 tick per synapse — standard for a
  synchronous recurrent net, imperceptible for chemotaxis). The internal clock is
  built from recurrent neuron synapses and demonstrates persistent activation with
  no external input.

- **Topology is snapshotted, not per-tick.** `net.rebuildLive` (gen-validates synapse
  endpoints, collects live neurons) runs only on structural events (critter build),
  NOT in `tick()`. THINK does not re-validate generation per tick (§4.6: never
  recomputed per tick); its only per-tick guard is a cellType re-check on each live
  neuron. In M4 neural cells never die/divide (exempt in lifecycle), so the topology
  is immutable and no synapse can dangle at runtime.

- **METABOLIZE charges THIS tick's neuralCost** for SENSOR/NEURON/MOVER cells (a small
  per-cell brain upkeep, §4.5; per-synapse cost deferred), alongside this tick's thrust
  cost. Critter cells are provisioned with a large reserve and are lifecycle-exempt, so
  they neither starve nor divide over the demo.

## Bond / organism coupling notes (M5)

The M4 kinematic rigid grouping (`repositionPassengers`, the `rigidPassenger/Body/Off*`
table, `addPassenger`, `nextOrganismId`) is GONE. Cohesion is now bond physics: the
hand-wired critter is a real bonded organism (spokes from the MOVER to every cell +
cross-bracing between rim cells → a triangulated, soft-but-braced body). The cells
integrate dynamically like any other; nothing snaps them to a body frame.

- **Sensor orientation lag (one tick).** `orientSensors` (step 2c) reads the MOVER
  heading set by LAST tick's `driveMovers` (step 4 runs after it). So a SENSOR projects
  the gradient (THINK, step 3) using the body orientation as of last tick — the same
  one-tick frame lag M4 documented. Imperceptible for chemotaxis; recorded so a future
  reader does not treat it as a bug.

- **Split does not prune cross-organism synapses.** M4's single global neural net is
  retained; a split (step 6c) never frees a cell, so every synapse endpoint stays valid
  (no dangling). Per-organism brain partitioning + severed-activation zeroing is M6. The
  split-on-break test uses non-neural cells, so this never bites in M5.

- **Aggregates recomputed each tick.** The split (step 6c) relabels `organismId`
  incrementally on the smaller component; `aggregateOrganisms` (step 11c) is the
  authority for the per-organism energy/cellCount/centroid numbers.

- **bondMaxStrain is a soft-body tolerance, not a rigidity claim (Task 14 retune).** The
  hand-wired critter is genuinely soft: its single MOVER yanks 6 spokes (effective
  k = `bondStiffness·1` = 1.5) which transiently stretch to ~2× rest under thrust+turn.
  At the original `bondMaxStrain=0.6` the spokes snapped within ~8 ticks and the body
  fragmented (critter-swim closed ~7 units, not ≥150). Raised to **1.0** (config
  default), the spokes flex without breaking and the critter homes in robustly across
  start headings. Counterintuitively, raising `bondStiffness` toward the ceiling made it
  WORSE (tightens the orbital limit cycle); cohesion here comes from strain tolerance +
  bracing geometry, NOT large k. Under a genuine hard pull a bond still snaps
  (split.test / golden-bond override `bondMaxStrain` to 0.2). Even at 1.0 a single direct
  spoke can break during an aggressive no-food spin, but the cross-bracing keeps every
  cell in ONE organism — the body never flies apart (asserted in golden-think's cohesion
  case as an organism-membership invariant, not an exact spoke length).

## Genome / reproduction / death coupling notes (M6)

- **Development is RNG-free + isolated.** `develop(genome)` grows the body in abstract local
  space via a fixed BFS rule-firing order (a PURE function — the seed→reproducible-body
  guarantee); `instantiateBody` rotates+translates it into the world and computes each bond's
  rest length from world positions (like spawnSwimmer). Mutation is the ONLY stochastic M6
  step → `rng.split(2)` (light=split(1); M3/M4/M5 draw none). Reproduction scans ascending
  organism id, so per-organism mutation draws are canonically ordered → byte-reproducible.
- **Death BEFORE reproduction.** 11d runs before 11e so a starved organism cannot reproduce
  the tick it dies. Both read the 11c energy aggregate (pre-death/pre-deduction); cell energy
  is authoritative and the aggregate refreshes next tick. Each organism reproduces at most once
  per tick (the scan visits it once), so no double-birth.
- **Organism-id freeing is owned by death (11d), not a separate sweep.** In M6 an organism
  only empties via atomic death (which frees the id) — organism cells are lifecycle-exempt
  (no per-cell death/division), and a strain-split relabels the smaller component to a NEW id
  without emptying the parent. So no free-empty pass is needed.
- **Maternal provisioning + clean abort (§4.5).** Reproduction aborts WITHOUT allocating if
  the parent can't afford `body.totalEnergy` while keeping `reproParentFloor`, if development
  truncated, or if `instantiateBody` fails its capacity pre-check — never a half-grown corpse.
- **Global brain across organisms.** No synapse crosses organisms (development wires within
  one body), so the single global NeuralNetwork THINK pass is correct for many simultaneous
  brains; per-organism partitioning stays an M8 perf optimisation. A dead organism's neural
  cells become MEAT → `net.rebuildLive` (called after a death) de-lists their synapses; their
  motor/sensor bindings are reclaimed (removeMotorsFor/removeSensorsFor) and their activations +
  thrust zeroed in 11d.
- **spawnSwimmer stays genome-less** (organisms.genomeRef −1) → it never reproduces/dies
  spuriously; only `instantiateBody`-built organisms carry a genomeRef. A strain-split fragment
  inherits no genome ref (sterile until it dies) — a documented M6 degradation (rare event).
