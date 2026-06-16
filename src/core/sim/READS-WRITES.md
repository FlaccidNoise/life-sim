# Tick READS/WRITES contract (§4.3)

The order and the per-step reads/writes that `World.tick` implements. The
golden-tick and integration tests assert against this contract; changing the
order means changing this table first.

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | rebuildLive | flags | liveIndices, liveCount |
| 2 | hash.build | posX, posY | hash buckets |
| 2b | **SENSE** | cellType, pos; **previous** tick's food field | senseX, senseY (**MOTILE only**) |
| 3 | **THINK** | *(M4 neural — skipped in M3)* | *(none)* |
| 4 | **ACT** | cellType, senseX, senseY, heading | heading, thrust (**MOTILE only**) |
| 5 | computeRepulsion | posX, posY, radius | forceX, forceY |
| 5b | **applyThrust** | cellType (via thrust=0 skip), heading, thrust | forceX, forceY (**accumulates** after repulsion) |
| 6 | integrate | pos, vel, force, mass | posX, posY, velX, velY; resets force=0 |
| 7 | **METABOLIZE** | cellType, energy, radius, pos, **thrust**; light field; hash buckets | energy (self **and eaten prey**, **−= moveCost·thrust²**), light field (depletion) |
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
