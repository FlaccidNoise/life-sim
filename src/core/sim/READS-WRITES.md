# Tick READS/WRITES contract (§4.3)

The order and the per-step reads/writes that `World.tick` implements. The
golden-tick and integration tests assert against this contract; changing the
order means changing this table first.

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | rebuildLive | flags | liveIndices, liveCount |
| 2 | hash.build | posX, posY | hash buckets |
| 2b | **SENSE** | cellType, pos; **previous** tick's food field | senseX, senseY (**MOTILE and SENSOR**) |
| 3 | **THINK** (M4) | sensor bindings + senseX/senseY + heading (body-frame projection); snapshotted live-synapse pool (pre/post); `actCur` (a(t−1)); bias; cellType (per-neuron re-check) | `actNxt` then **swap** → `actCur` holds a(t) (SENSOR/NEURON/MOVER activations) |
| 4 | **ACT** | MOTILE: cellType, senseX, senseY, heading (reflex). **driveMovers (M4):** motor bindings + `actCur`[turn/thrust neuron] + heading | heading, thrust (**MOTILE reflex AND MOVER from neurons**) |
| 5 | computeRepulsion | posX, posY, radius | forceX, forceY |
| 5b | **applyThrust** | cellType (via thrust=0 skip), heading, thrust | forceX, forceY (**accumulates** after repulsion) |
| 6 | integrate | pos, vel, force, mass | posX, posY, velX, velY; resets force=0 |
| 6b | **repositionPassengers** (M4) | rigid-group table; body pos/heading | passenger posX/posY/heading; passenger velX/velY/forceX/forceY ← 0 (kinematic override) |
| 7 | **METABOLIZE** | cellType, energy, radius, pos, **thrust**; light field; hash buckets | energy (self **and eaten prey**, **−= moveCost·thrust²**, **−= neuralCost for SENSOR/NEURON/MOVER**), light field (depletion) |
| 8 | **age** | liveIndices (tick-start set) | age |
| 9 | **LIVE/DIE/BREED** | cellType, energy, mass, pos | cellType (→MEAT), energy, **generation[] (bumped on every freed MEAT slot)**, frees meat slots, allocs child slots (split energy); lastBirths/lastDeaths |
| 10 | **ENVIRONMENT (light)** | light field, cap | light field (diffuse + regen; double-buffer swap) |
| 11 | rebuildLive (again) | flags | liveIndices, liveCount |
| 11b | **ENVIRONMENT (food)** | cellType, pos (**post-lifecycle live set**) | persistent food field (deposit + diffuse + decay; double-buffer swap) |
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

- **Sensor heading lag (one tick).** THINK's body-frame projection (step 3) reads the
  passenger sensor's `heading`, which was set by the PREVIOUS tick's
  `repositionPassengers` (step 6b runs after THINK). So a sensor projects the gradient
  using the body orientation as of last tick. Accepted (a one-tick frame lag is
  imperceptible for chemotaxis); recorded so a future reader does not treat it as a bug.

- **Kinematic override + one-sided passenger momentum.** `repositionPassengers`
  (step 6b) runs AFTER integrate and OVERWRITES passenger positions to the rigid
  body-frame layout, zeroing their velocity and force. Passengers sit at offsets
  larger than the contact range, so they rarely overlap anything; when one does push
  an ecosystem cell via repulsion (step 5), the reposition then zeroes the passenger's
  own velocity/force — so a passenger can shove but never recoils. Negligible in M4
  (the intended "the critter occupies space" behaviour); M5 organism physics makes it
  symmetric. Only the MOVER body integrates dynamically.

- **METABOLIZE charges THIS tick's neuralCost** for SENSOR/NEURON/MOVER cells (a small
  per-cell brain upkeep, §4.5; per-synapse cost deferred), alongside this tick's thrust
  cost. Critter cells are provisioned with a large reserve and are lifecycle-exempt, so
  they neither starve nor divide over the demo.
