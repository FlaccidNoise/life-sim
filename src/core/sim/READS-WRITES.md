# Tick READS/WRITES contract (§4.3)

The order and the per-step reads/writes that `World.tick` implements. The
golden-tick and integration tests assert against this contract; changing the
order means changing this table first.

| # | Step | Reads | Writes |
|---|---|---|---|
| 1 | rebuildLive | flags | liveIndices, liveCount |
| 2 | hash.build | posX, posY | hash buckets |
| 3 | computeRepulsion | posX, posY, radius | forceX, forceY |
| 4 | integrate | pos, vel, force, mass | posX, posY, velX, velY; resets force=0 |
| 5 | **METABOLIZE** | cellType, energy, radius, pos; light field; hash buckets | energy (self **and eaten prey**), light field (depletion) |
| 6 | **age** | liveIndices (tick-start set) | age |
| 7 | **LIVE/DIE/BREED** | cellType, energy, mass, pos | cellType (→MEAT), energy, **generation[] (bumped on every freed MEAT slot)**, frees meat slots, allocs child slots (split energy); lastBirths/lastDeaths |
| 8 | **ENVIRONMENT** | light field, cap | light field (diffuse + regen; double-buffer swap) |
| 9 | rebuildLive (again) | flags | liveIndices, liveCount |
| 10 | sampleMetrics | cellType, energy (current live set) | metrics |

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

- **sampleMetrics runs after a second rebuildLive** (step 9 before 10), so metrics
  exclude freed corpses (`free()` never clears `cellType`, so a freed slot still
  reads MEAT) and include fresh-slot newborns; `metrics.population` then equals
  `cells.aliveCount`.
