# Plants as entities — design + implementation plan

Status: design, not started. Target: the 2D sim (`index.html`), not lenia3d.
Base commit: `5493d30`. **Revision 3**, after two adversarial review rounds that ran the engine against the plan — see §14 for the item-by-item response. Revision 3 changed two mechanisms and closed one crash: the graze bite is now throttled by plant state (§4.1a), crowding now has a universal term as well as a light-specific one (§3.1, §3.4a), and the growth term's division by `K` is guarded (§3.1a).

**On line citations.** `src/core/config.ts`, `brain.ts` and `spin-probe.ts` are under concurrent edit by another agent, so config knobs are cited by **name** and not by line. `world.ts` cites are marked `~` where the review found drift; re-pin them when the concurrent work lands.

Owner decisions taken as given (not re-litigated):

- Plants are in-world entities with evolving lineages. No movement, no brain. Germinate → grow → seed nearby → die.
- `FoodField` is demoted to **soil fertility**. Keep `fertility` / `Kcell` / pockets / dead water / richness variance. Drop the living biomass channels `B` / `B2` / `B3`.
- Smell keeps working through an entity-deposited diffusing field.
- The rework serves four goals at once: more niches, legible behaviour, a bigger denser world, visible body diversity.
- **Eating** is a contact bite that drains the plant, hunt-style. One target per tick.
- **Competition** is shading by neighbours, counted through the plant spatial hash.
- **Scale** is decided by measurement inside the existing 32k cap. No perf work up front; §7.1 names the trigger.
- **Four later arcs** the data model must leave room for: corpses as entities, day/night or seasonal light, plant toxin against grazer tolerance, and a perf/world-size arc. §13.

---

## 1. Data model

### 1.1 The choice

**A — plants in `OrganismStore` behind a `kind` flag.** Shared spatial hash, shared render path, hashed for free, one iteration idiom.

**B — a separate plant SoA pool** (`src/core/plants.ts`), modelled on `Parcels` (`parcels.ts:23-32`) but with the `OrganismStore` free-list and ascending-live-list discipline (`store.ts:139-147, 272-283`).

### 1.2 Memory, computed from the store field list

`store.ts:151-195`, per slot:

| group | fields | bytes/slot |
|---|---|---|
| Float64 scalars | 26 named arrays (`store.ts:151-177,183`) | 208 |
| Float64 scent sense | `scentSenseX/Y` × `SCENT_CHANNELS` 4 (`store.ts:172-173`) | 64 |
| Float32 brain triple | `brain` + `learnedBrain` + `elig`, `BRAIN_GENES` 185 each (`store.ts:178,181,182`) | 2,220 |
| Float32 other genome | `scalarGenes` 31 + `hue` 1 (`store.ts:179-180`) | 128 |
| Uint32 / Int32 / Uint8 | 8 × u32, 1 × i32, 3 × u8 (`store.ts:184-195`) | 39 |
| **total** | | **2,659** |

At `maxOrganisms` 32,768 that is **87.1 MB**. The brain triple alone is **83.5%** of every slot.

A plant slot needs: `x`,`y` (f64, 16) + `energy` (f64, 8) + 6 genes (f32, 24) + `age` (u16, 2) + `seedCooldownLeft` (u16, 2) + `alive` (u8, 1) + `liveIndices` (u32, 4) = **57 bytes**.

| option | +32,768 plants | delta |
|---|---|---|
| A — shared store, capacity 32,768 → 65,536 | +87.1 MB | 87 MB → 174 MB |
| B — separate pool, `plantCapacity: 32768` | +1.87 MB | — |

Plus option B's own spatial hash at cell size 32 over 8192² (256×256 buckets): `bucketStart` 262 KB + `counts` 262 KB + `sorted` 131 KB = **0.65 MB**. Plus the 2-channel plant scent field (two `PheroField` at 128×128, double-buffered): **0.52 MB**. Plant subsystem total ≈ **3.0 MB**.

### 1.3 Recommendation: **B, a separate pool**

Reasons, in order of weight:

1. **47× the memory.** 87 MB against 1.9 MB at the same 32,768 count. The brain triple is dead weight on a brainless entity and it is five sixths of a slot.
2. **A `kind` branch lands in ~15 hot loops.** Every pass that walks `liveIndices` would need it: `senseFood` (`sense.ts:37`), `senseEnv`, `senseCreatures`, `senseCrowding`, `senseFertility`, `steer`, `depositScent` (`economy.ts:252`), `applyFlowForce`, `computeRepulsion`, `integrate`, `hunt`, `parasiteStep`, `metabolize` (`economy.ts:268`), `learn`, `reproduce`, `cullDead`, `hash.build` (`spatial-hash.ts:48`). Each branch is a correctness risk in code already tuned to byte-identical determinism.
3. **The spatial-hash cell size wants to differ.** The creature hash cell is `2·cellRadius` = 12u, sized to the repulsion cutoff. The plant graze scan wants 32u so a 3×3 neighbourhood covers the graze reach in one pass. Sharing forces one of the two to scan a wrong-sized neighbourhood.
4. **`maxOrganisms` never has to move.** It is a restart-required buffer; leaving it alone keeps the whole existing memory profile intact.

What option B costs, and why each cost is small:

| cost | mitigation |
|---|---|
| its own hash | `SpatialHash.build` takes an `OrganismStore` (`spatial-hash.ts:48`). Widen it to a structural type `{liveIndices, liveCount, x, y}`. Both stores satisfy it. ~1 line. |
| its own render pass | wanted anyway — plants need a different point shape and a different upload cadence (§8) |
| its own hash-into | 12 lines, mirroring `parcels.hashInto` (`parcels.ts:208-218`) |
| its own sense integration | one gradient read against the plant scent field (§5). Simpler than today's 3-channel branch. |

Do **not** copy `Parcels.freeSlot()` (`parcels.ts:85-89`) — it is an O(capacity) linear scan, fine at 120 slots and disqualifying at 32,768. Use the `OrganismStore` LIFO free stack (`store.ts:139, 216-217, 222-240`). Same for `Parcels.nearestTo` (`parcels.ts:182-205`).

---

## 2. Plant genome

Six genes, in a dedicated `PlantGene` enum and a dedicated `Float32Array` on the plant pool. **It does not touch `ScalarGene`, `SCALAR_GENE_COUNT`, or the animal gene layout at all** — so the tail-gating rule (`genome.ts:267-278`) is not engaged and every animal gene offset is untouched.

| idx | name | range | centre | founder seed | read by |
|---|---|---|---|---|---|
| 0 | `GROWTH_RATE` | 0.01 – 0.30 | **0.09** | gaussian | growth (§3.1) |
| 1 | `MAX_SIZE` | 5 – 120 | **31** | gaussian | growth ceiling, graze reserve, render radius |
| 2 | `SEED_RANGE` | 20 – 900 | 180 | gaussian | dispersal |
| 3 | `DEFENCE` | 0 – 1 | — | uniform | bite reduction, upkeep, colour |
| 4 | `LIGHT_NEED` | 0 – 1 | — | uniform | growth ceiling via the `LIGHT` field |
| 5 | `SPECIES` | 0 – 1 | — | uniform | the resource axis animals match against; scent split; colour |

The three centres in bold are **derived in §3.2 from measured engine constants**, and they are predictions increment 1 checks, not targets it must hit.

Mutation at germination: `child = clamp(parent + gaussian(0, plantMutationSigma · centre), min, max)`, mirroring `mutateScalarGenes`. `DEFENCE`, `LIGHT_NEED` and `SPECIES` seed **uniform**, not gaussian, for the same reason `FORAGE_PREF` / `THERMAL_PREF` / the morph genes do: a founding pool clustered at a centre has no raw material and selection has to build the range by slow mutation.

`SPECIES` is the important one. It replaces the three hand-placed food channels with one continuous, evolvable, heritable axis — the direct answer to the recorded root cause of monoculture, one resource → Gause exclusion (`docs/decisions/INDEX.md:50`), because plant lineages can now diverge along it themselves.

**`DEFENCE` ships as armour, not toxin.** As specified in §4.1 it cuts the bite symmetrically: the plant loses less biomass *and* the grazer gains less. That is armour. A toxin would cost the grazer energy without protecting biomass. The distinction matters for §13.3, which adds the toxin half plus a grazer tolerance gene; do not describe the shipped gene as a toxin in code comments or UI.

### 2.1 Animal genes: repurpose two, delete two

| gene | idx | change |
|---|---|---|
| `FORAGE_PREF` | 17 | unchanged meaning: position on the resource axis, now matched against plant `SPECIES` instead of a channel id. Gate moves from `foodChannels < 2` (`genome.ts:270`) to `!plantsEnabled`. |
| `FORAGE_PREF_C` | 18 | **rename to `FORAGE_BREADTH`**. Same [0,1] range, same tail position. How wide a band of plant `SPECIES` this animal can eat, through `breadth = plantBreadthMin + FORAGE_BREADTH·(1 − plantBreadthMin)` with **`plantBreadthMin: 0.58`** — see §4.1b for why that floor is not free to lower. |
| `SENSE_RANGE_B` | 19 | **delete.** Plants smell through one field at `SENSE_RANGE`. |
| `SENSE_RANGE_C` | 20 | **delete.** |

Deleting 19 and 20 shifts genes 21–30 down by two and takes `SCALAR_GENE_COUNT` 31 → 29. Checked against the known hard-coded indices: `biomes.ts` uses scalar 0/2/3/12/13/15/16, all below 19, so `BIOME_ATLAS` is unaffected. What does break, and must land in the same increment (§10 increment 3): `genome.test.ts:57-63`, which asserts the count is 31 and pins `DISPLAY` 24, `PREFERENCE` 25, `THERMAL_PREF` 27, `PHOTOSYNTH` 28, `PARASITISM` 29, `SCAVENGER` 30; `health.ts:42-70` `GENE_NAMES`; `observability/distributions.ts:79-80`. No cross-version hash compatibility is owed — the golden hash is retired.

---

## 3. Lifecycle + energy

### 3.1 Growth

Per plant, per tick:

```
light    = lightAt(x, y, tick)                            // ONE seam — see §13.2
fert     = food.fertilityAt(x, y)                         // food-field.ts:552, survives the demotion
n        = live plants within plantShadeRange (§3.4)      // ONE scan, TWO crowd terms
crowdK   = 1 / (1 + plantCrowdK * n)                      // UNIVERSAL: space + soil, hits every strategy
shadeL   = 1 / (1 + plantShadeK * n)                      // LIGHT-SPECIFIC: neighbours cast shade
lightEff = light * shadeL
lightT   = plantLowLightYield + (lightEff - plantLowLightYield) * LIGHT_NEED
K        = MAX_SIZE * fert * lightT * crowdK
Kc       = max(K, plantMinK)                              // GUARD — see §3.1a
growth   = GROWTH_RATE * (E + plantSeedEnergy) * (1 - E / Kc)
E       += max(growth, -plantStarveRate * E)              // bounded collapse
E       -= plantUpkeep * (1 + plantDefenceUpkeep * DEFENCE)
```

**The `+ plantSeedEnergy` term is load-bearing, not cosmetic.** Plain logistic growth `r·E·(1−E/K)` is multiplicative in `E`, so a plant driven near zero regrows at `r·E` — arbitrarily slowly — and `E = 0` is an absorbing state. That is precisely the producer-extinction failure the food field's diffusion exists to prevent (`food-field.ts:14-16`), and reintroducing it would make the contact bite consume-whole with extra steps. The seedling term makes zero non-absorbing. It is the second of two defences; the first is the graze reserve in §4.1, which stops a plant reaching low `E` from grazing in the first place.

The term shifts maximum sustained yield from `r·K/4` to `r·(K + E0)² / (4K)`. At `K` 35 and `plantSeedEnergy` 4 that is 1.24×, which §3.2 accounts for.

**`lightT` is the niche axis.** At `LIGHT_NEED` 0 the plant yields a flat `plantLowLightYield` (0.5) — shade-tolerant, half the light ceiling, indifferent to the light field and to being shaded. At `LIGHT_NEED` 1 it yields the full `lightEff` — best on bright open ground, starving in the dark or under a crowd. This reuses the existing `LIGHT` field (`abiotic.ts:51-75`) that today only `PHOTOSYNTH` reads.

**Two crowd terms, from one neighbour scan.** Revision 2 routed crowding through the light term only. That gives a `LIGHT_NEED` 0 plant **no density feedback at all**, so shade-tolerant plants win every crowded core and grow without bound — and the germination cap was too loose to catch it (§3.4). The fix is to split the effect by what neighbours actually compete for:

| term | competes for | applies to | coefficient |
|---|---|---|---|
| `crowdK` | space and soil | **every plant, regardless of strategy** | `plantCrowdK: 0.02` |
| `shadeL` | light | only the `LIGHT_NEED` fraction of the ceiling | `plantShadeK: 0.045` |

A sun-demander pays both; a shade-tolerant plant pays only `crowdK`. Shade tolerance still buys something real — immunity to the light half — but **nothing is immune to crowding**, so every strategy has density feedback and the carrying capacity is bounded for all of them. Both terms read the same `n` from the same scan, so this costs one extra multiply, not a second pass.

**Read light through one `lightAt(x, y, tick)` seam**, not through `lightAtAxis` directly, even though the `tick` argument is ignored today. §13.2 adds the temporal term there and nowhere else.

### 3.1a `K` reaches zero, and the growth term divides by it

The logistic divides by `K`, and `K = MAX_SIZE · fert · lightT · crowdK` genuinely reaches **exactly zero** by two independent routes. Unguarded, `1 − E/0` is `−Infinity`, `E` becomes `−Infinity` then `NaN`, and the NaN propagates into the scent deposit, the render buffer and the determinism hash. This is a crash, not a tuning problem.

| route | when |
|---|---|
| `fert = 0` | `foodBaseFertility: 0` makes the dead water between pockets exactly zero, which is ~80% of the world. Germination cannot start there (§3.3 rejects below `plantGermFertility` 2.0), but `driftPockets` recarves the fertility map and can move a pocket **out from under a living plant** mid-run. The demo runs `fertilityDriftRate: 0` so this is currently unreachable — and the knob is live-tunable in the Knobs panel, so "currently unreachable" is not a guard. |
| `lightT = 0` | reachable **at germination**, no drift needed. `lightT` = `plantLowLightYield + (lightEff − plantLowLightYield)·LIGHT_NEED`, which at `LIGHT_NEED` 1 is just `lightEff = light · shadeL`, and `light` approaches 0 in a trough of the sine field. A committed sun-demander that germinates in the dark has a ceiling of zero. |

(`lightT` cannot go negative: its minimum over `LIGHT_NEED ∈ [0,1]` and `lightEff ∈ [0,1]` is 0, at `LIGHT_NEED` 1. So the only pathology is the zero.)

**The guard is two clamps and no branch:**

```
Kc = max(K, plantMinK)                        // plantMinK 0.5
E += max(growth, -plantStarveRate * E)        // plantStarveRate 0.05
```

The lower clamp on `K` bounds the divisor. The lower clamp on the increment bounds how fast a plant may shrink, which matters because at `K` = 0.5 and `E` = 35 the raw term is `0.09 × 39 × (1 − 70)` = **−242/tick** — mathematically correct (the plant is 70× over its ceiling) but it would put a large negative in a hashed `Float64` in a single tick. With the clamp, collapse is a bounded exponential at 5%/tick.

Neither clamp touches the healthy regime. While `E < K` the growth term is positive and the `max` is a no-op; when `E` slightly exceeds `K` the term is mildly negative and still smaller in magnitude than `plantStarveRate · E`. Only genuine ceiling collapse clips.

**What happens to the plant.** It shrinks toward zero at 5%/tick and dies by §3.5. From `E` 35 that is **~83 ticks** to the death threshold — slow enough to see a patch wilt, fast enough that a stranded plant is not an immortal zombie on dead water.

**The clamp bounds growth, not upkeep — so the pass order inside `plants.step()` is load-bearing.** `plantUpkeep` is subtracted *after* `max(growth, −plantStarveRate·E)` and is outside that clamp, so a plant at `E` 0.6 with the upkeep charge applied lands at a small negative in the same tick. That is fine arithmetically and fatal if anything reads it. The order is fixed:

```
grow (clamped)  →  upkeep  →  age  →  seed  →  cull
```

**The cull test must run after upkeep, in the same pass**, so no negative `E` survives to the end of `plants.step()`. Everything downstream then reads only culled state: the scent deposit (which would emit a negative deposit and poison the diffusing field), the render size (`√E` of a negative is `NaN`), and `hashInto`. §6 repeats this as a tick-order constraint rather than an implementation detail, because it is one.

**Two more consequences that must be handled with the guard, or it leaks:**

1. **§3.5's death test must become `E <= plantDeathEnergy`, not `E <= 0`.** Exponential decay approaches zero asymptotically and never reaches it, so an `E <= 0` test would never fire and the wilting plant would live forever at `E` = 10⁻¹⁵. Set `plantDeathEnergy: 0.5`, comfortably below `plantSeedEnergy` 4 so a fresh seedling is never at risk.
2. **§3.3's seed test must also require `K > plantMinK`.** The test is `E >= plantSeedThreshold · K`, which as `K` → 0 becomes trivially true — so a dying plant would fire a seed every time its cooldown expired, draining the forked RNG stream and the pool. A last-gasp dispersal is arguably good ecology, but only if it is bounded; gate it on a real ceiling.

### 3.2 Carrying capacity — derived from measured constants

Revision 1 derived this from four wrong inputs. The numbers below were measured by running `defaultConfig({...livingWorldOverrides, seed})` on seeds 1–3.

| constant | measured | how |
|---|---|---|
| Σ`Kcell` standing crop | **~700,000**, seeds 1/2/3 = 658,315 / 701,453 / 739,482 (±6%) | `capacityAt` over all 16,384 cells |
| mean fertility over the germination footprint | **3.28** | `fertilityAt` over the top 3,080 cells |
| mean light over that footprint | **0.658** | `lightAtAxis` (`abiotic.ts:69`) |
| plants per 32u hash cell at N = 20,000 | **1.62** | 20,000 ÷ (3,080 × 4,096 u²) × 1,024 u² |
| mean NND at N = 20,000 | **12.56 u** | `0.5/√λ` over the same footprint |

The footprint is the 3,080 cells inside 1σ of the 20 pockets — `πσ²·20` at `foodPatchRadius` 7 — which corresponds to `plantGermFertility ≈ 2.0` (§3.3).

**One equation, not two.** Revision 1 presented a standing-crop equation and a production equation as independent constraints; they are linearly dependent (`N·r·K/4` is `N·K` times `r/4`). Matching production adds no constraint on `N` or `K_p` beyond fixing `r`. So:

```
N · K_p = 700,000                               ← the only sizing equation
GROWTH_RATE ≈ r_field, adjusted for the +E0 term ← keeps production per unit standing crop the same
```

**Density and shading, in order.** Pick `N = 20,000` because it puts food NND at 12.56 u, inside `biteRange` 16 — the direct fix for the recorded density wall of NND ~75u ≫ biteRange 16u (`docs/decisions/INDEX.md:59`).

| N | NND | plants / 32u cell | n in a 3×3 |
|---|---|---|---|
| 10,000 | 17.8 u | 0.81 | 7.3 |
| **20,000** | **12.56 u** | **1.62** | **14.6** |
| 40,000 | 8.9 u | 3.25 | 29.2 |

Choose the two crowd coefficients (§3.1) so that at the footprint-mean n = 14.6 a plant loses a meaningful but not crippling share of each resource:

```
plantShadeK 0.045  →  shadeL = 1/(1 + 0.045×14.6) = 0.604    (light)
plantCrowdK 0.020  →  crowdK = 1/(1 + 0.020×14.6) = 0.774    (space/soil, universal)
```

`shadeL` spans 0.82 at a sparse edge (n = 5) to 0.43 in a dense core (n = 30). `crowdK` spans 0.91 to 0.63 — gentler, because space competition should throttle everyone without being the dominant term.

Mean `lightT` follows, with `LIGHT_NEED ~ U[0,1]` so its expectation is 0.5:

```
E[lightT] = 0.5 + (light̄ · shadeL − 0.5) · 0.5
          = 0.5 + (0.658 × 0.604 − 0.5) × 0.5 = 0.448
```

Working back to the gene centre:

```
K_p       = MAX_SIZE × fert × lightT × crowdK
          = MAX_SIZE × 3.28 × 0.448 × 0.774 = MAX_SIZE × 1.137
K_p       = 700,000 / 20,000 = 35
MAX_SIZE  = 35 / 1.137 = 30.8   →  centre 31
```

### 3.2a Growth rate is set by areal availability, not by global production

Matching the field's 11,070 energy/tick global maximum sustained yield would give `GROWTH_RATE ≈ 0.05`. **That is the wrong constraint and it under-sizes the system by a factor of two.**

The field delivered its whole cell's biomass to whoever stood in it; a plant delivers only to a grazer standing next to *that plant*. So the binding quantity is production **inside one grazer's reach**, not production summed over the world.

```
plants in reach  = π · plantGrazeRange² / (area per plant)
                 = π × 32² / 631 u²  =  5.1 plants
MSY per plant    = r · (K + E0)² / (4K)  =  r × 39² / 140  =  r × 10.86
production in reach = 5.1 × r × 10.86  =  55.4 r
```

Measured grazer eat budget (`effEatRate · herbivory`, demo config, 3,000 ticks): **mean 2.05/tick, p90 2.78/tick**. Requiring a mean grazer to be sustainable on its own reach with ~2× headroom for overlap with other grazers:

```
55.4 r ≥ 2 × 2.05   →   r ≥ 0.074      →   GROWTH_RATE centre 0.09
```

At `r = 0.09`: MSY per plant **0.978/tick**, production in reach **4.99/tick** against a 2.05 mean budget — 2.4× headroom — and system-wide production 20,000 × 0.978 = **19,560/tick**, which is 1.77× the field's MSY.

That 1.77× is deliberate, not an error. The field's *realised* production was far below its MSY because biomass sat near `K`, where logistic growth vanishes; grazed plants under §4.1's throttle sit near `K/2`, the most productive part of the curve. Increment 2's population gate (within 2× of the current 3-5k) is what catches genuine over-supply.

**All of these are predictions, not gates.** Increment 1 measures Σ`E`, the realised density, the realised mean `n` and the realised mean fertility, and reports how far each lands from the prediction; if the constants differ, re-run this derivation with them. Standing crop equals Σ`K_p` only while nothing eats — increment 2 pulls it below that, and by how much is itself the interesting number.

### 3.3 Seeding

```
if (E >= plantSeedThreshold * K && K > plantMinK && seedCooldownLeft == 0 && free slot exists) {
    ang = rng.range(0, 2π)                      // plant-forked stream, §6
    rad = SEED_RANGE * sqrt(rng.float())        // uniform in the disk, as parcels.ts:103-104
    (tx, ty) = wrap(x + rad·cos ang, y + rad·sin ang)
    reject if walls.solidAt(tx, ty)
    reject if food.fertilityAt(tx, ty) < plantGermFertility        // 2.0, §3.2
    reject if localPlantCount(tx, ty) >= plantCellCap
    else: alloc, genes = mutate(parent), E_child = plantSeedEnergy
    E -= plantSeedCost
    seedCooldownLeft = plantSeedCooldown
}
```

`plantGermFertility: 2.0` is not arbitrary — it is what makes the eligible area equal the 3,080-cell footprint every number in §3.2 is derived over. Measured eligible-area sensitivity:

| threshold | eligible cells | % of world | NND at N=20,000 |
|---|---|---|---|
| 0.5 | 7,978 | 48.7% | 20.2 u |
| 1.0 | 5,503 | 33.6% | 16.8 u |
| **2.0** | **2,904** | **17.7%** | **12.2 u** |
| 3.0 | 1,574 | 9.6% | 9.0 u |

At the engine's own in-a-pocket threshold (`0.3 · foodCap`, `world.ts:234`) the eligible area is 2.6× larger and NND rises to 20.2 u, **above `biteRange` 16**. So the NND gate and the germination threshold are one decision, not two, and `plant-probe.ts` must report the eligible-cell count alongside NND or the gate is uninterpretable.

**No separate seed entity.** Germination is the birth event. A dormant-seed pool is reconsidered and still rejected in §11 risk 1.

Draw discipline: draw the two RNG values **only when a slot is actually allocated and the position passes**, following `parcels.ts:97-99` where a full pool draws nothing, so a full pool cannot silently shift the stream.

### 3.4 Local competition

**Shading by neighbours (owner).** Growth falls with the nearby plant count, counted through the plant spatial hash. This ships in increment 1 — it is the carrying-capacity mechanism, not an optimisation.

```
n       = live plants within plantShadeRange, 3×3 plant-hash scan, excluding self
crowdK  = 1 / (1 + plantCrowdK * n)              // 0.020 — universal, multiplies K
shadeL  = 1 / (1 + plantShadeK * n)              // 0.045 — light only, multiplies light
```

One scan, two terms. Set `plantShadeRange` to the plant-hash cell size (32u) so the 3×3 neighbourhood covers it in one pass — the rule `SpatialHash` documents at `spatial-hash.ts:7`.

Four consequences, all wanted:

- **Every strategy has density feedback.** `crowdK` multiplies `K` for all plants, so no gene combination escapes the ceiling. This is the fix for revision 2's unbounded shade-tolerant monoculture.
- **`LIGHT_NEED` is still a succession axis.** Sun-demanders colonise open ground and bright regions fast, then shade themselves out; shade-tolerant plants pay only `crowdK` and inherit the crowded cores. They are advantaged there, not immune to crowding there.
- **`MAX_SIZE` is a competitive trait** for the sun-demanding strategy specifically. A big sun-demander loses less absolute ceiling to a given `shadeL` than a small one. Among shade-tolerant plants it does not — a difference worth seeing in the gene census.
- **The two strategies partition the pocket** rather than one excluding the other — the coexistence mechanism the single-resource field never had.

Cost: one extra 3×3 plant-hash scan per plant per tick. At 20,000 plants and n ≈ 14.6 that is **~292k neighbour reads/tick** — the largest new pass, and the first thing to look at if §7.1's threshold trips. A count is deliberately cheaper than a biomass sum: no energy read, so the scan touches only `bucketStart`/`sorted`. If the count proves too blunt, the biomass variants are the same expressions over `ΣE_neighbours / MAX_SIZE` at one extra array read per neighbour.

### 3.4a The germination cell cap, derived

Revision 2 set `plantCellCap: 12` by eye and claimed it as the global roof. It is not: the germination footprint is 2,904 food cells at 64u, hence **11,616 plant-hash cells at 32u**, so 12 × 11,616 = 139,392 permitted plants — **4.3× the pool**. It never binds and it roofs nothing.

Derive it instead from the pool and the footprint, at a factor α over the pool-average density:

```
plantCellCap = ceil(α · plantCapacity / eligibleHashCells)
             = ceil(2 × 32,768 / 11,616) = ceil(5.64)  →  6
```

At the target density (20,000 plants over 11,616 cells = λ 1.72 per cell), a Poisson tail gives `P(n ≥ 6)` = **0.8%** — so the cap rejects about one germination in 125. It binds lightly: a live constraint on local clumping, not a distortion of the target.

Two honest limits:

- **It is still not the global roof, and it should not be.** 6 × 11,616 = 69,696 > 32,768. The real global roof is the pool itself: `alloc()` returns −1 when the free stack is empty and germination simply fails. That is automatic, costs nothing, and is the correct place for the guarantee. Capacity is `crowdK`'s job; the cap's job is local.
- **What the cap genuinely buys** is a hard worst-case bound of **9 × 6 = 54 candidates** on both new neighbourhood passes (shading here, grazing in §4.2), which is what keeps the §7 budget from having a tail.

**Why not `plantCellCap: 2`, the minimal alternative.** A cap of 2 does make `cap × eligibleCells` = 23,232 fit inside the 32,768 pool, so it *would* be a true global roof with no new gene term. It is rejected on one number: at the target density of λ 1.72 per cell, `P(n ≥ 2)` = **51.3%**, so the cap would reject **half of every germination attempt**.

That is not a guard, it is the carrying-capacity mechanism — and a bad one. It is spatially discrete rather than continuous, it is blind to plant size and strategy (a cell with two seedlings is "full" while a cell with one giant is not), and it would dominate `crowdK` and `shadeL` entirely, so `LIGHT_NEED` and `MAX_SIZE` would stop being competitive traits. The succession axis in §3.4 depends on density feedback being smooth.

**Ruling: ship the universal crowd term, cap 6.** `plantCellCap: 2` is the documented fallback if increment 1 measures that `crowdK` is not binding — that is, if realised standing crop overshoots the ~700,000 prediction while mean `n` stays low, which would mean plants are clustering into cells the crowd term cannot see at 32u resolution. That outcome would argue for a smaller `plantShadeRange` first, and the hard cap only after.

### 3.5 Death

A plant dies when either:

- `E <= plantDeathEnergy` (0.5) — starved or wilted. Reachable when `K` collapses below the upkeep equilibrium: a sun-demander shaded out, a plant germinated in the dark, one crowded past what `crowdK` leaves it, or one whose pocket drifted away (§3.1a). The threshold is a small positive number, **not zero**, because §3.1a's bounded collapse decays exponentially and never reaches zero exactly. It sits below `plantSeedEnergy` 4 so a fresh seedling is never inside it. **Not reachable by grazing**, because the reserve is subtracted before the bite and the throttle makes the bite vanish as the reserve is approached (§4.1a).
- `age >= plantMaxAge`.

Freeing pushes the slot onto the free stack. Plant slots need no generational id: nothing holds a cross-tick reference to a plant, and grazing resolves within a single tick.

That grazing cannot kill a plant is deliberate. It does not make plants invulnerable — it makes **herbivory non-lethal while competition stays lethal**, which is the correct split. Grazers suppress plant biomass and so change who wins the crowding and shading contests; they do not clear ground directly. Note the coupling this creates: heavy grazing lowers `E` across a patch, which does *not* lower `n`, so the crowd terms keep biting even where biomass is gone. Whether that is a problem is an increment-2 observation, not a known defect.

---

## 4. Grazing interface

**Contact bite that drains the plant, hunt-style (owner).** One target per tick. The plant survives and regrows. Not consume-whole — that is what parcels already do (`economy.ts:514`) and that niche exists.

This keeps the existing eat-rate economics (`EAT_RATE`, `eatGate`, satiation) working unchanged, keeps a plant as a renewable patch an animal can dwell on, and makes the graze pass structurally identical to `hunt` — the same scan, the same best-target selection, the same `min(bite, target energy)` cap. One idiom, two consumers.

### 4.1 What replaces the `foodChannels` 1/2/3 triplication

Today `metabolize` branches three ways across `economy.ts:331-406` — a single-channel path, a two-channel path with two sub-paths on `forageAvailabilityWeighted`, and a three-channel barycentric path. All of it collapses to:

```
if (energy[i] >= satiated) { gained = 0 }           // unchanged graze-stop: economy.ts:331
else {
  budget  = effEatRate * herbivory                  // unchanged: economy.ts:322-330
  breadth = plantBreadthMin + FORAGE_BREADTH * (1 - plantBreadthMin)
  spec    = forageGeneralistFloor
          + (1 + forageSpecBonus - forageGeneralistFloor) * (1 - FORAGE_BREADTH)

  // ONE 3x3 plant-hash scan at plantGrazeRange -> pick ONE target, hunt-style
  best = -1; bestScore = 0
  for each live plant p within plantGrazeRange:
      match_p = max(0, 1 - |FORAGE_PREF - SPECIES_p| / breadth)
      if (match_p <= 0) continue                    // outside this animal's dietary band
      edible_p = plantEnergy_p - plantGrazeFloor * MAX_SIZE_p     // THE ROOT RESERVE
      if (edible_p <= 0) continue                   // already cropped to the root
      score = edible_p * match_p
      if (score > bestScore) { bestScore = score; best = p }

  if (best >= 0) {
      // THROTTLED BITE: take at most a fixed FRACTION of what is above the reserve, so intake
      // falls as the plant is cropped. This is the move-on signal, and it is what makes plant
      // persistence unconditional rather than parameter-dependent.
      bite   = min(budget, plantBiteFraction * edible_best) * (1 - plantDefenceBite * DEFENCE_best)
      plantEnergy_best -= bite
      gained = bite * match_best * spec
  } else gained = 0
}
gained *= dietSpec                                  // unchanged: economy.ts:404-408
```

### 4.1a Why an unthrottled bite kills every plant

Measured grazer eat budget (`effEatRate · herbivory`, demo config, 3,000 ticks): **mean 2.05/tick, p90 2.78/tick**. A single plant's peak logistic production is `r(K+E0)²/(4K)` = **0.978/tick** at `K` 35 and `r` 0.09 — and only **0.543/tick** at the production-matched `r` of 0.05 that revision 2 specified.

So the *mean* grazer out-eats a plant's peak production by **2.1×**, and revision 2's parameters made it 3.8×. Every grazer strips every plant it settles on, in about a dozen ticks. The root reserve alone does not save this: it stops the last bite, but the grazer then sits on a plant pinned at the reserve, earning nothing, and the ecology fails at increment 2 exactly as §11 risk 5 warns.

**The reserve and the throttle do different jobs and both are needed.** The reserve says what cannot be taken; the throttle says how fast what remains may be taken.

**Persistence becomes unconditional.** With `bite = f · (E − R)`, the bite vanishes at `E = R` while growth there is `r(R + E0)(1 − R/K) > 0` for any `r > 0`. **No parameter inequality is required** — a throttled grazer can asymptotically approach the reserve but can never reach it, whatever its budget. That is the structural guarantee revision 2 lacked.

**Where the equilibrium sits.** Under one persistent grazer, `E` settles where growth equals bite:

```
r (E + E0) (1 − E/K) = f (E − R)
```

which is the quadratic `(r/K)E² + (f − r + rE0/K)E − (rE0 + fR) = 0`. At the shipping values — `r` 0.09, `K` 35, `E0` 4, `f` = `plantBiteFraction` 0.25, `R` = `plantGrazeFloor · MAX_SIZE` = 0.15 × 31 = **4.65**:

```
E* = 7.98            (reserve 4.65, so 1.7× the reserve — comfortably clear)
realised intake at E* = f (E* − R) = 0.25 × 3.33 = 0.83/tick
```

**What that means behaviourally, and why it is the point.** A grazer arriving at a full plant (`E` ≈ 35) takes `min(2.05, 0.25 × 30.4)` = its full budget — the throttle is invisible when food is abundant. It crops the plant to `E*` in roughly 13 ticks, at which point its intake has fallen to 0.83/tick, **40% of its budget**. Staying is survivable (`basalCost` 0.06 plus movement is well under 0.83) but is heavily outcompeted by moving. The plant recovers to near `K` in roughly 90 ticks.

That is a crop-and-move forager with a visible signal, which is the behaviour the owner asked to be able to see, and it is emergent from two numbers rather than scripted.

**Sustained intake is an areal question, and §3.2a is where it is answered.** A grazer cannot live off one plant — nor should it. Its reach holds 5.1 plants producing 4.99/tick between them at `r` 0.09, against a 2.05 mean budget. That 2.4× headroom is what `GROWTH_RATE` 0.09 buys and is the reason §3.2a rejects the global-production match as the sizing constraint.

**Increment 2 gates on realised intake, not on the model.** The `bite ÷ budget ≥ 0.7` gate (§10) measures the population mean, which mixes grazers on fresh plants (ratio 1.0) with grazers that have overstayed (ratio 0.4). A population mean below 0.7 means grazers are not moving on — raise `plantGrowthRate` or `plantBiteFraction`, in that order.

**Two alternatives rejected.** A **wilt timer** (die only after `E` sits at zero for N ticks) adds a per-plant counter and a stateful death path, and still lets a grazer zero the plant, so the dwell behaviour still breaks — it treats the symptom. **The seedling term alone** makes zero non-absorbing but leaves a stripped plant regrowing at `r·E0` = 0.36/tick from near zero, a ~90-tick hole in the food supply wherever a grazer passes. The throttle prevents the state, the reserve bounds it, and the seedling term is the backstop if anything else ever drives `E` low.

Structural notes:

- **Availability weighting stops being a knob.** `forageAvailabilityWeighted` exists to stop a specialist starving on an absent channel; with a continuous species axis and a real plant list, "what is present" is the candidate set, and `score = edible × match` is availability weighting on a single target. The knob dies.
- **One target, not a split budget.** An animal in a mixed patch commits to one plant per tick rather than nibbling everything in reach. That is what makes grazing legible on screen, and it is why `score` weights by edible energy: a grazer prefers the biggest well-matched plant nearby, so plants are cropped down rather than uniformly shaved. It also halves the scan — one pass, no candidate list, no allocation. Its cost is §11 risk 7.
- **The generalist penalty moves from preference to breadth.** With a continuous `SPECIES` axis a point-valued `FORAGE_PREF` is always "committed", so `s01 = 2|pref − 0.5|` (`economy.ts:344, 384`) is meaningless. Breadth carries it. `forageGeneralistFloor` (demo 0.7) and `forageSpecBonus` survive with their tuned values and their original intent.
- **Contested plants resolve by lowest slot.** `metabolize` walks `liveIndices` ascending (`economy.ts:316`), each bite is capped by the plant's edible energy, so an earlier creature can crop a plant to its reserve before a later one reaches it. Identical to `hunt`'s cap and to `eatParcels`. No new determinism hazard.
- **`herbivoryExp`, `dietGeneralistFloor`, `eatGate`, `satiatedBar`, `METAB_EFF` are untouched.** The graze block's inputs and its single `gained` output keep their contract.

### 4.1b `plantBreadthMin` must be ≥ 0.58, and that is a real concession

§3.2a sizes the whole ecology on 5.1 plants in reach producing 4.99/tick. **That count assumes every plant in reach is edible to the grazer standing next to it**, which is only true for a broad feeder. A specialist sees a subset.

At `plantBreadthMin` 0.1 a narrow eater realises **0.49× its budget** and starves — the areal headroom that `GROWTH_RATE` 0.09 buys is spent twice over by the match filter. Two mechanisms compound: with `SPECIES` uniform on [0,1] and band half-width `b`, only ~`2b` of plants qualify at all, and those that do are multiplied by `match < 1`, which averages 0.5 across a qualifying band.

**Set `plantBreadthMin: 0.58`.** The threshold sits at 0.5 for a structural reason: at `breadth ≥ 0.5` an interior specialist's band spans the entire `SPECIES` axis, so **no plant is ever categorically inedible to any animal** and §3.2a's areal count holds for every genotype. 0.58 adds margin so the worst-matched plant still yields `1 − 0.5/0.58` = 0.14 rather than ~0.

**What this concedes.** With the floor at 0.58, `FORAGE_BREADTH` no longer partitions the resource — it grades a preference. Everyone can eat everything, at different rates. The species axis still selects, through two channels that survive intact: `score = edible × match` makes a narrow eater preferentially *choose* its own species, and `spec` still pays it a conversion bonus for committing. What is lost is hard dietary isolation between plant guilds.

That is the honest trade, and it is forced by density, not by taste: hard partitioning needs enough plants in reach that a specialist still finds several of its own kind, which at 5.1 plants per reach it does not. Raising plant density is what would buy it back, and that is the world-size arc (§13.4), not this rework. Do not lower this floor to "sharpen the niches" without first raising `N` and re-running §3.2a — the failure mode is silent starvation of the specialist tails, not an obvious crash.

### 4.2 Scan cost

Plant hash cell 32u, 3×3 neighbourhood, 1.62 plants/cell at the target density → **~15 candidates** per creature, one pass. At `liveCount` 5,000: **~74k distance checks/tick**, allocation-free, hard-bounded at 9 × 6 = 54 candidates by `plantCellCap` (§3.4a). Note the distinction the perf budget needs: ~15 is the number of plants **scanned** in the 3×3; only the **5.1** inside `plantGrazeRange` are eligible targets, and §3.2a sizes production against that 5.1. For scale, today's 3-channel graze does 6 field samples per creature (`economy.ts:390-398`) = 30k, but the field also runs regrow + diffuse + advect over 3 × 16,384 cells ≈ 1.8M flops/tick which goes away entirely (§7).

The graze scan and `hunt`'s scan are the same shape, so factor the neighbourhood walk once. `hunt` already derives its scan radius from `biteRange` via `ceil(range/cellSize)` capped at half the grid; the graze pass does the same against `plantGrazeRange` on the plant hash. Do not hand-roll a second 3×3 — that is the `mateContactRange` dead-knob class of bug this codebase has already fixed once.

---

## 5. Smell and sight

### 5.1 Smell — a dedicated 2-channel plant scent field

Do **not** add a channel to `ScentField`. That field is 4 fixed channels (`scent-field.ts:21`) wired to 16 brain genes and gated on `pheromoneEnabled`; widening it shifts `BRAIN_GENES` and disturbs every evolved brain.

Instead: a new `PlantScent` owning **two `PheroField` instances** (`phero-field.ts`, 168 lines, already tested, with toroidal diffusion, wall no-flux, gradient reads and a determinism hash). Each plant deposits its own biomass, split by species exactly the way `ScentField.deposit` splits by diet (`scent-field.ts:48-51`):

```
amount = plantScentStrength * E
LO.deposit(x, y, amount * (1 - SPECIES))
HI.deposit(x, y, amount * SPECIES)
```

`senseFood` then collapses from 76 lines of three-way branching (`sense.ts:37-113`) to:

```
pref = scalarGenes[sg + FORAGE_PREF]
step = scalarGenes[sg + SENSE_RANGE]
plantScent.LO.gradientInto(xi, yi, step, tmp, 0)   // allocation-free, §below
plantScent.HI.gradientInto(xi, yi, step, tmp, 2)
senseX[i] = (1 - pref) * tmp[0] + pref * tmp[2]
senseY[i] = (1 - pref) * tmp[1] + pref * tmp[3]
```

Why this is the right shape:

- **The gene layout is undisturbed; the gradient SCALE is not.** `senseX`/`senseY` feed the existing `FOOD_FWD`/`FOOD_LAT` brain inputs and `SENSE_RANGE` keeps its units (the central-difference half-step), so no gene index and no brain weight index moves. But the field being differenced changes from biomass in `[0, Kcell]` with `Kcell` up to 200 to a deposit/decay equilibrium `P* ≈ Σdeposit / plantScentDecay`. Evolved weights assume the old magnitude, so the level must be scale-matched. See the calibration below. Revision 1 claimed "every evolved brain and every smell finding stays applicable" — that was wrong and is now §11 risk 3.
- **The preference-blended gradient survives.** `sense.ts:84-100` pulls a B-specialist toward B-rich cells; the two-channel species split reproduces that continuously, in one expression, with no channel count.
- **`gradientAt` allocates a `{gx, gy}` object per call** (`phero-field.ts:68`). Two calls per creature per tick at 5,000 creatures = 10,000 allocations/tick. Add a `gradientInto(x, y, step, out, base)` variant mirroring `ScentField.gradientsInto` (`scent-field.ts:59-72`). Allocation-free, as the file header promises (`sense.ts:5`).

**Scale calibration.** Match the equilibrium level to the old `Kcell` ceiling of 200 (= `foodCap` 40 × `foodMaxFertility` 5). At 6.5 plants per 64u scent cell (1.62 per 32u cell × 4), mean `E` ≈ 35, `plantScentDecay` 0.02:

```
P* = plantScentStrength × 6.5 × 35 / 0.02 = plantScentStrength × 11,375
P* = 200  →  plantScentStrength ≈ 0.018
```

Starting value, not a final one. Increment 3's acceptance includes the **ratio of the new gradient magnitude to the old**, measured over the same positions, because that ratio is what the evolved brain weights actually see.

Deposit cost: 20,000 plants × 2 channels = **40,000** `idx()`-plus-add per tick, 2× the existing creature scent deposit (5,000 × 4). Field step: 2 × 16,384 cells × (diffuse ~12 flops + decay 1) ≈ **0.43M flops**, against the 3-channel food field's ~1.8M it replaces.

Decay and diffusion start from the tuned pheromone values `pheroDiffuse: 0.2` and `pheroDecay: 0.02` (documented as carrying a signal ~64-91u in 10-20 ticks, which crosses the pocket NND), under their own `plantScentDiffuse` / `plantScentDecay` knobs, because the plant field wants a shorter memory than a communication trail.

`senseFertility` (`sense.ts:394-406`, the `bodySense` interoceptive input, `bodySense: false` in the demo) changes from summing channel biomass to summing plant `E` in the 3×3 plant-hash neighbourhood.

### 5.2 Sight — not in the first pass

Plants should **not** enter `senseCreatures` initially. That scan is already the most expensive per-creature pass: it scales as range² with `MAX_VISION_CELLS` 96 and `VISION_RANGE` max 1,152. Adding 20,000 static entities to every vision cone is an unbounded blow-up, and the sight channel already has a food payoff in parcels (`sense.ts:318-345`).

Revisit in increment 6 with a measurement: gate on `plantAppeal > 0` and measure frame time before shipping.

---

## 6. Determinism

The contract is unchanged: same `(config, seed)` → same `world.stateHash()`.

**RNG stream.** Plants get a dedicated forked stream, `new Rng((cfg.seed ^ PLANT_SALT) >>> 0)`, the pattern at `parcels.ts:20, 55`, with a salt distinct from the parcel (`0x27d4eb2f`), wall (`0x9e3779b9`) and flow (`0x85ebca6b`) salts. Founder placement, germination position and gene mutation all draw from it. `world.rng` is never touched on the plant path, so the organism stream stays byte-identical whether plants are on or off. That is what makes increment 1 measurable in isolation.

`Plants.reset()` re-seeds that stream and re-runs founder seeding, so `World.reset()` reproduces construction byte-for-byte — the property `parcels.ts:76-82` maintains and `world.test.ts` asserts.

**Iteration order.** Plants rebuild an ascending `liveIndices` list each tick (`store.ts:272-283` pattern). Growth, seeding, death and scent deposit all walk it ascending. Germination allocates into freed slots mid-loop; skip any slot at or beyond the captured `liveCount` so a plant born this tick does not grow or seed in the same tick — the guard `reproduce` uses via `liveGen` (`economy.ts:769`).

**Tick order.** Insert into `world.step`:

| position | pass | why there |
|---|---|---|
| unchanged | `driftPockets` (`world.ts:~365`) | fertility still drifts |
| unchanged | `senseFood` | reads **last tick's** plant scent — the documented one-tick coupling (`sense.ts:5`) |
| **new** | `plantHash.build()` | beside the pre-`hunt` `hash.build(s)` at `world.ts:~415`, so grazing sees post-move positions |
| unchanged | `metabolize` | grazing drains plants here |
| **new**, in FIELDS | `plants.step()` | **grow (clamped) → upkeep → age → seed → cull**, in that order — after all grazing. The order is a correctness constraint, not a style choice: `plantUpkeep` is applied outside §3.1a's growth clamp and can drive `E` negative, so the cull must run after it and before anything reads `E`. |
| **new**, in FIELDS | `plantScent.deposit + step` | after `plants.step`, so it reads culled state only — a negative `E` here would emit a negative deposit into a diffusing field that has no floor |
| replaced | `this.food.step(...)` (`world.ts:450-455`) | deleted; fertility is static unless drifting |

Rebuild the plant hash every tick. Plants do not move, so a dirty flag would skip most rebuilds — a real optimisation, deliberately **not** in increment 1 per the owner's "no perf work up front". It is item 1 on §7.1's reserve list.

**Hash coverage.** In `stateHash` (`world.ts:~496`), after `this.food.hashInto(h)`:

```
if (this.plants !== null) this.plants.hashInto(h);
if (this.plantScent !== null) this.plantScent.hashInto(h);
```

Both gated on non-null so the OFF path is byte-identical, matching the scent/glow/parcel pattern at `world.ts:~549-553`.

**Hash `x`, `y`, `energy`, `age` AND all six genes.** Revision 1 excluded the genes by analogy to the brain-weight exclusion. That analogy is wrong, and the codebase already says so: the comment at `world.ts:~491-493` folds `scalarGenes` and `hue` in precisely because *motor-inert* genes would otherwise be an invisible divergence. **A plant never moves, so every plant gene is motor-inert.** `SPECIES` and `DEFENCE` surface only through the scent split and through which animals choose to eat the plant — both indirect, both able to cancel. This is the same coverage hole the 2026-06-27 audit closed for the animal genome; do not reopen it.

Cost: 10 mixes per plant × 20,000 = 200,000; plant scent 2 × 16,384 = 32,768; removing the food field's `B`/`B2`/`B3` saves 49,152. Against today's field total (49,152 food + 65,536 scent + 16,384 glow = 131,072) the new total is ~314,700, **≈2.4×**. `stateHash` runs on the 500 ms status cadence, not per frame (`main.ts:670-672, 872`), so this is a 2 Hz cost. Acceptable.

**Fertility stops being hashed.** With `fertilityDriftRate: 0` in the demo the fertility map is static after seeding, so it is not dynamic state. `fertilityDriftRate` is live-tunable in the Knobs panel, so **put the contingency at the deletion site as a code comment**, not only here: if drift is turned on, hash the pocket centres (`pocketPc`/`pocketPr`, `food-field.ts:83-88`) — 40 numbers — not the 16,384-cell map.

**Testing the isolation claim.** There is no animal-only sub-hash today; `stateHash` folds the organism loop and every field into one digest, so with plants ON the whole hash moves by construction and "the animal population is unchanged" is not directly testable. Add `organismHash()` — the organism loop alone, stopping before `food.hashInto` — as a test helper, and assert it is identical with `plantsEnabled` true and false. That is the honest form of the claim and it belongs in increment 1.

---

## 7. Performance budget

Per tick at 20,000 plants and 5,000 creatures, using the corrected density (§3.2):

| pass | work | note |
|---|---|---|
| `plants.rebuildLive` | 32,768 slot scan | capacity-bound |
| `plantHash.build` | 20,000 counting sort | every tick — no dirty flag in v1 |
| **shade scan** | 20,000 × ~14.6 neighbours | **~292k reads — the largest new pass** |
| grow + upkeep + age | 20,000 × ~12 flops | one `lightAt` (a sin) and one `fertilityAt` per plant |
| seed check | 20,000 branches; ~1–2% seed | ≈ 300 RNG draws/tick |
| scent deposit | 40,000 index-and-add | 2× the existing creature scent deposit |
| plant scent diffuse + decay | 2 × 16,384 cells | |
| graze scan | 5,000 × ~15 scanned (5.1 in range) | ~74k distance checks, one pass, ≤54 worst case |
| **removed:** food regrow + diffuse + advect | −3 × 16,384 × ~36 flops | ≈ −1.8M flops |
| **removed:** 6 field samples/creature in graze | −30,000 | |
| **removed:** 4–12 field samples/creature in `senseFood` | −20,000 to −60,000 | replaced by 8 samples |

**Field work drops roughly 4×; entity work rises by less than revision 1 feared** — the corrected density cuts both new scans by 3.7×. Whether it is a net win is still a measurement, not a claim.

`maxOrganisms` stays at 32,768 and `plantCapacity` starts at 32,768. Total added memory ≈ **3.0 MB** against the store's existing 87 MB.

### 7.1 The measurement and the threshold

**Instrument, already present:** `stepMsEma` in `main.ts:668` — an EMA of wall-clock ms per sim tick, shown on the 500 ms perf cadence alongside `world.hash.stats()` (`main.ts:871`). Headless equivalent: wrap `world.step()` in `performance.now()` in `plant-probe.ts` and report mean ms/tick over the last 1,000 ticks.

**Baseline: MEASURED, increment 0.** Demo config headless, `plantsEnabled` absent, mean ms/tick over
ticks 2000-6000, seeds 1-3 (macOS, node 22, other agents' jobs on other cores):

| seed | end pop | ms/tick, plants OFF |
|---|---|---|
| 1 | 5,367 | 66.56 |
| 2 | 70 | 16.57 |
| 3 | 10,292 | 86.85 |
| **mean** | | **56.66** |

Cost tracks population at roughly 8 µs per creature per tick; seed 2 is cheap because that seed very
nearly collapses (pop 70), which is a separate demo-health question and not a plant one.

**This measurement invalidates the absolute threshold below, and that is increment 0's real finding.**
The 0.26 ms/tick figure was derived as 16.7 ms ÷ 64 on the assumption that the demo holds 64× speed. The
plants-OFF baseline is **218× over it**, so no plant work of any kind could ever meet it and a gate
nothing can pass gates nothing. Either the browser demo does not in fact hold 64× at a 5k population, or
the browser and headless numbers diverge in a way nobody has measured — the browser `stepMsEma` half of
increment 0 is still owed and is what would settle it. **Until then the ratio is the only usable gate.**

| trigger | meaning | response |
|---|---|---|
| plants-on ms/tick ≤ 1.25 × baseline | acceptable | ship |
| > 1.25 × baseline | the plant subsystem costs more than a quarter of the sim | reserve list below, re-measure |
| > 0.26 ms/tick absolute | 64× speed no longer holds 60 fps (16.7 ms ÷ 64 ticks) | same, and blocking for the demo |

~~The absolute number matters more than the ratio~~ — **retracted by the increment-0 measurement above.**
The baseline is 56.66 ms/tick, so the absolute row cannot discriminate between a cheap plant subsystem and
an expensive one. Increment 1 measures **1.09×** (70.50 / 21.86 / 93.56 ms/tick on seeds 1/2/3 against the
baselines above), inside the 1.25× gate, so the ratio gate passes and nothing on the reserve list is
triggered. Both halves were measured interleaved in one process so they saw identical machine conditions;
the absolute numbers carry background load from other jobs, the ratio does not.

**Reserve list, in order. None ship in increment 1.**

1. **Dirty-flag the plant hash rebuild.** Plants never move; the hash changes only on birth or death. Cheapest win, zero behaviour change.
2. **Fold the shade scan into the graze scan's neighbourhood walk**, or refresh the neighbour count every N ticks. Shading is slow-moving; a 4-tick-stale count changes nothing ecologically and quarters the pass. Stale-by-a-fixed-period is deterministic; stale-by-convenience is not.
3. **Dirty-flag the renderer position and species uploads** (§8), leaving only `a_size` per frame.
4. **Lower the standing count** via `plantMaxSize` and `plantShadeK`, and re-derive §3.2. Halving to 10,000 moves NND to 17.8 u, outside `biteRange` 16 — this trades ecology for frame time and is the last resort.

Explicitly **not** on this list: caching light per plant at germination. It would be a fair win at 20,000 sines per tick, but it forecloses §13.2's day/night arc, which needs light re-read every tick through the `lightAt(x, y, tick)` seam. Pay the sine.

**Raising the cap.** `plantCapacity` above 32,768 costs 61 bytes per slot; 64k plants is +2.0 MB. Memory is not the constraint. The shade and graze scans are, and both scale with local density rather than with the cap — so raising it is cheap if and only if the extra plants go into *new* area rather than into denser pockets. That is §13.4.

---

## 8. Rendering + legibility

Plants are drawn in the WebGL swarm as their own pass, not appended to the creature buffers. The creature dot pass already uploads ten per-creature attribute arrays every frame (`renderer.ts:867-911`) and draws at `renderer.ts:916`; appending 20,000 plants would take that from ~50k floats/frame to ~250k, about 1 MB per frame.

**A minimal version ships in increment 1**, not increment 5. `a_pos` (vec2) + `a_size` (float), one uniform colour, no species hue, no shape work — roughly 40 lines. The reason is §11 risk 6: the plant count is derived from arithmetic, nobody has looked at it, and the answer may move `plantMaxSize` by 2×. Increments 1 through 4 otherwise tune against numbers a later increment could invalidate, on a project whose stated goal is legible behaviour. A dot per plant makes increment 1's density gates checkable by eye.

Increment 5 then adds the parts that cost real work:

- **Radius** ∝ `√E`, clamped to ~1.5 device px minimum so a seedling is visible at world zoom.
- **Hue** from `SPECIES`, on the *same* hue wheel the creature `hue` gene uses (`renderer.ts:68-103`), so a specialist grazer visibly matches the colour of the plants it eats. The strongest single legibility win here, and it costs nothing.
- **Saturation / value** from `DEFENCE` — an armoured plant reads darker, so an unbrowsed dark patch surrounded by cropped ground is a readable story.
- **Shape**: a fixed square or diamond against the creature's circle. Plants also never move, which at any zoom with motion is the clearest cue of all.

Upload plainly every frame in both increments — 20,000 × 4 floats = 320 KB/frame. The dirty-flag path is item 3 on §7.1's reserve list; it exists because position and species change only on birth or death while size changes every tick.

At world zoom the plants **are** the fertility map — a coloured carpet whose texture is the pocket structure, replacing the deleted scalar heatmap. Species-coloured patches make the resource axis visible for the first time; today `FORAGE_PREF` divergence is only observable through a probe.

---

## 9. What gets deleted

No compat shims. Base inventory: `scratchpad/del-inventory.md`. Each increment carries its own share — see §10.

### 9.1 `src/core/food-field.ts` — 895 lines → ~230-260

| lines | member | action |
|---|---|---|
| 52-63 | `B`, `B2`, `B3`, `scratch`×3, `channelMask`, `advectScratch` | delete |
| 45-47, 68-69 | `channels`, `ratio`, `pocketChannelMode`, `wallTied`, `driftMult` | delete |
| 168-174 | `fracA` | delete |
| 175-192 | `refill()` | delete |
| 536-550 | `sampleAt` / `sampleAt2` / `sampleAt3` | delete |
| 563-592 | `grazeAt` / `grazeAt2` / `grazeAt3` | delete |
| 593-606 | `hasChannel()`, `total()` | delete |
| 629-672 | `fillTexture`, `fillTextureChannel`, `fillTextureTotal` | delete |
| 676-889 | `step`, `stepChannel`, `stepChannel3`, `advect`, `advectChannel` | delete |
| 890-894 | `hashInto` | delete — leave the §6 drift contingency as a comment at the site |
| 211-363 | `seedPatches` | surgery — strip the pocket-channel assignment block, keep placement, richness draw, lever-C scale, drift dirs |
| 364-416 | `recarve` | surgery — strip dominant-channel tagging and the `refill()` tail |
| 459-497 | `driftPockets` | surgery — collapse the per-channel rate/dir branch to one rate |
| 110-160 | constructor | surgery — drop the channel params and the biomass allocations |
| 39-44, 498-535, 551-562, 608-625 | `fertility`, `Kcell`, `recomputeK`, `fertilityMap`, `reset`, `idx`, `fertilityAt`, `capacityAt`, `capacity`, `maxCapacity`, `pocketCentres` | **keep unchanged** |

### 9.1a Two call sites outside `food-field.ts` that the surgery breaks

**`world.ts:277-285` — founder placement, on the RNG path.** Revision 1 missed this.

```
const f = this.walls.active && this.walls.isSolidAt(tx, ty) ? -1 : this.food.sampleAt(tx, ty);
if (f > best) { best = f; bx = tx; by = ty; }
if (f >= fertileThreshold) break;                     // world.ts:285
```

Founders score 8 random candidate positions by **channel-A biomass** and `break` early on the first fertile hit (`fertileThreshold = 0.3 · food.capacity`, `world.ts:234`). Two consequences, both hash-breaking:

1. `capacityAt` is not a drop-in. Measured: it differs from `sampleAt` on **9,823 of 16,384 cells**, max absolute difference 200. Cause is `refill()` (`food-field.ts:175-190`) — with `foodChannels: 3` and `pocketChannelMode: 1` a cell's whole `Kcell` goes into only its assigned channel, so `sampleAt` reads 0 across every B and C pocket. **Founder placement is currently channel-A-biased and sees roughly a third of the pockets.**
2. The early `break` means the number of `rng.range` draws consumed depends on the score. Change the score and the organism stream shifts from tick 0.

**Replacement:** score by `food.fertilityAt(tx, ty)` with `fertileThreshold = plantGermFertility` (2.0), which ties founder placement to exactly where plants can grow. Removing the channel-A bias is a behaviour improvement — founders will see all 20 pockets — but it is a behaviour *change*, and the demo hash moves from tick 0. Increment 4's acceptance must state that it moves and why, so it does not surface as a mystery diff.

**`walls.ts:345-357` — `pocketFertility`** constructs its own `FoodField` with the 6-arg constructor and calls the 4-arg `seedPatches`, then reads `fertilityMap()`. Both signatures change under §9.1's surgery, so both call lines need updating. Note separately: this reconstruction already omits richness, variance and `maxFertility`, so it does **not** reproduce the demo's actual fertility map — the recorded "ghost pocket" divergence. This plan is not obliged to fix that, but it must not silently change it either; keep the reconstruction's behaviour as close to today's as the new signature allows and say so in the commit.

### 9.2 Config knobs

Deleted: `foodDiffuse` · `foodChannels` · `foodChannelRatio` · `foodPocketChannelMode` · `foodChannelAWallTied` · `foodChannelBDriftMult` · `forageAvailabilityWeighted` · `foragePrefC` (becomes the `FORAGE_BREADTH` centre) · `foodRegen` (replaced by `plantGrowthRate`) · `foodInit`.

Kept as soil structure: `foodCap` · `foodCols`/`foodRows` · `foodPatchCount`/`Radius`/`Richness`/`RichnessVar` · `foodBaseFertility` · `foodMaxFertility` · `deadWaterCost` · `pocketCapVariance` · `fertilityDriftRate`/`Interval` · `foodPocketDriftRateA`/`B` · `pocketDriftSpeed` · `perPocketDrift`.

Kept and rewired: `forageSpecBonus` · `forageGeneralistFloor` · `foragePref` · `dietGeneralistFloor` · `herbivoryExp` · `eatRate`/`eatRateCost`.

New: `plantsEnabled` · `plantCapacity` · `plantFounderCount` · `plantGrowthRate` · `plantMaxSize` · `plantSeedRange` · `plantMutationSigma` · `plantFounderSigma` · `plantUpkeep` · `plantDefenceUpkeep` · `plantDefenceBite` · `plantLowLightYield` · `plantSeedThreshold` · `plantSeedCost` · `plantSeedEnergy` · `plantSeedCooldown` · `plantGermFertility` · `plantCellCap` · `plantMaxAge` · `plantMinK` · `plantStarveRate` · `plantDeathEnergy` · `plantGrazeRange` · `plantGrazeFloor` · `plantBiteFraction` · `plantScentStrength` · `plantScentDiffuse` · `plantScentDecay` · `plantBreadthMin` · `plantShadeRange` · `plantShadeK` · `plantCrowdK` · `plantRefugeRate`. Later arcs only: `plantAppeal`.

Net: 10 removed, 33 added. The plant system is more parametric than the field it replaces; the defence is that the parameters describe organisms rather than a grid, and that the three mutually-exclusive food levers documented at `living-world-config.ts:46-58` stop fighting each other.

**Every new knob's doc comment must state the measured quantity it was derived from** — `plantShadeK: 0.045 // shadeL 0.60 at the measured footprint-mean n=14.6`, not `// shading strength`. Config doc drift is a recorded recurring failure in this repo (`predatorFraction` documented 0.9, actually 0.7), and 33 undocumented knobs would guarantee a repeat.

### 9.3 Tests, by owning increment

| file | what | increment |
|---|---|---|
| `plants.test.ts` (new) | germination, growth, graze floor, seeding, death, shading, hash, reset-reproducibility | 1 |
| `economy.test.ts` | ~20 `it` blocks (52, 102, 316, 331, 352, 367, 419, 428, 437, 501, 548, 598, 604, 608, 705, 733, 769, 800, 1009, 1016, 1020) rewritten against the plant pool | 2 |
| `sense.test.ts` | 3 rewrite (46, 77, 507), 1 adapts (33) | 3 |
| `genome.test.ts` | 57-63 — the `SCALAR_GENE_COUNT` 31 assertion and the six pinned indices | 3 |
| `food-field.test.ts` | 29 of 42 `it` blocks delete; 13 fertility/pocket tests survive | 4 |
| `world.test.ts` | 3 touch (261, 274, 439) plus the founder-placement hash | 4 |

### 9.4 Headless probes, by owning increment

| probe | what | increment |
|---|---|---|
| `plant-probe.ts` (new) | count, Σ`E`, NND, eligible cells, mean `n`, per-pocket occupancy, ms/tick | 1 |
| `demo-forage-probe.ts` · `forage-probe.ts` · `demo-niche-sweep.ts` · `gate-check.ts` · `demo-pop-sweep.ts` · `harness.test.ts` forage assertions | die or lose their `foodChannels` sweep | 2 or 3, whichever breaks them |
| `long-run.ts:87,113` · `harness.ts:114` · `env-guardrail.ts:36` · `spin-probe.ts:456-458,491-493` | read `world.food.total()` or `sampleAt*`; repoint to `plants.totalBiomass()` | 4 |
| `region-probe.ts` | `pocketCentres`/`capacityAt` survive; its FORAGE_PREF sum needs the rename | 2 |
| `biome-divergence.ts` | survives unchanged | — |

### 9.5 Renderer and app

`renderer.ts`: delete the four `FoodLayer.TOTAL`/`CHANNEL_A`/`B`/`C` entries (`renderer.ts:41-44`) and the food branch of `fieldSource` (~648-664) — about 20 lines. The texture, program and upload plumbing stays; the scent layers share it. Add the plant point program (increment 1, minimal; increment 5, full).
`main.ts`: 164-166 default layer · 178-187 name map · 193-206 layer ring · 344 HUD `food:` field · 132 and 907 graph series.
`observability/history.ts`: remove `food` at 45, 129, 150 — and **add `plantCount`, `plantBiomass`, `speciesMean`, `speciesSigma` in increment 1**, alongside the existing 9 gene mean/σ series. This is the browser long-run capture path; without a replacement series, long runs lose all producer data.
`observability/knobs.ts`: 200 (`forageAvailabilityWeighted`), 84 (`foodRegen`); the richness/variance/maxFertility knobs stay. Add the new plant knobs.
`observability/distributions.ts`: 79-80 — the two forage gene rows.

---

## 10. Migration plan

Each increment ships ON in the demo (default config OFF, the pattern `living-world-config.ts:5` describes), **with `pnpm typecheck`, `pnpm lint` and `pnpm test:all` green on that increment** — which is why §9.3 and §9.4 are distributed by owning increment rather than parked at the end.

**Increment 0 — take the baseline.** Before any code: run the demo config headless at steady state and record mean ms/tick with plants absent, plus the browser `stepMsEma` at 64× speed. Every perf claim here is relative to that number and nobody has it. An hour, not a day; skipping it makes §7.1's threshold unusable.

### Increment 1 — the plant pool, running in parallel

New `src/core/plants.ts` and `src/core/plant-scent.ts`: founder seeding, growth with the shade term and the seedling term, seeding, death, the germination cap, the scent deposit, the plant spatial hash, the hash-into. Plus `plants.test.ts`, `organismHash()` (§6), the minimal plant dot draw (§8), the four `history.ts` series (§9.5), and `plant-probe.ts`. `plantsEnabled` ON in the demo.

**The food field still feeds and still smells.** Plants are inert food-web-wise: they grow, they are visible, nothing eats them.

Shading ships here because it *is* the carrying-capacity mechanism — without it the growth equation has no density feedback and the headline measurement is meaningless.

**Acceptance — `plant-probe.ts`**, demo config, seeds 1-5, at t = 0 / 2k / 8k / 20k:

| metric | prediction (§3.2) | gate |
|---|---|---|
| plant count at t=8k | 20,000 | 14,000 – 28,000 every seed |
| Σ plant energy at t=8k | ~700,000 (ungrazed, so ≈ Σ`K_p`) | within ±30%, every seed |
| mean fertility over occupied cells | 3.28 | report; a large miss invalidates the `MAX_SIZE` centre |
| mean `n` in a 3×3 | 14.6 | report; feeds `plantShadeK` |
| mean NND, **over the eligible germination footprint** | 12.56 u | < 16 u (below `biteRange`), with the eligible-cell count reported alongside |
| **realised plants within `plantGrazeRange` of a random pocket point** | **5.1** | **≥ 3.5** — the areal input §3.2a sizes `GROWTH_RATE` on, and §11 risk 7's early warning |
| eligible cells at `plantGermFertility` 2.0 | 2,904 | report |
| pool saturation | — | `count < 0.9 × plantCapacity` every seed |
| per-pocket occupancy, all 20 | all occupied | report — the ungrazed **baseline** for increment 2's extinction gate |
| **ms/tick** | — | **≤ 1.25 × increment-0 baseline, and ≤ 0.26 ms/tick** |
| determinism | — | `organismHash()` identical with plants on and off; twin runs identical; `plantsEnabled:false` full hash matches `5493d30` |

`MAX_SIZE` 31, `GROWTH_RATE` 0.09, `plantShadeK` 0.045 and `plantCrowdK` 0.02 are **predictions this increment measures**, not targets it must hit. If the measured constants differ, re-run §3.2's derivation with them and adjust the centres; that is the increment working as intended, not a failure.

If the ms/tick row fails, work §7.1's reserve list in order before touching ecology targets.

### Increment 2 — grazing cuts over

`metabolize`'s graze block (`economy.ts:331-406`) reads plants through the single-target bite with the root reserve. `foodChannels` branch deleted, `grazeAt*` deleted, `FORAGE_PREF_C` → `FORAGE_BREADTH` renamed everywhere including `health.ts` `GENE_NAMES` and `distributions.ts`. Owns `economy.test.ts` and the forage probes it breaks (§9.3, §9.4). The field still supplies smell.

**`plantRefugeRate` ships here, non-zero.** A low per-tick probability of spontaneous germination in any cell above `plantGermFertility` — the field's diffusion analogue. It ships *with* grazing rather than after it because pocket extinction is grazing-driven and this is the first increment where it can happen; shipping the mitigation and tuning it down is recoverable, shipping grazing without it and watching the demo go dark is not. This increment's measurement is allowed to tune it to 0.

**Acceptance:**

| metric | gate |
|---|---|
| `demo-health-gate.ts` (the nightly gate) | passes |
| dietσ at 20k, `evolve-probe.ts`, seeds 1-4 | **≥ 0.24** — the recorded number for `dietGeneralistFloor: 0.7` (`living-world-config.ts:129-138`) |
| end population | within 2× of the current 3-5k |
| predator guild | alive on every seed |
| **whole-pocket plant extinction**, all 20 pockets, seeds 1-5, 20k | **zero**, against increment 1's ungrazed baseline. If zero also holds at `plantRefugeRate: 0`, ship 0. |
| mean bite ÷ eat budget | **≥ 0.7** — §11 risk 7, that single-target eating is not silently capping intake |
| **mean realised intake ÷ budget, per `FORAGE_BREADTH` decile** | **≥ 0.7 in every decile** — the population mean can pass while the narrow-breadth tail starves invisibly (§4.1b). If only the bottom deciles fail, raise `plantBreadthMin`; if all fail, it is `plantGrowthRate`. |
| Σ plant energy | report the drawdown from increment 1's ungrazed figure; this is the herbivory pressure number |

Five dials, in order of directness: `plantGrowthRate` (production per plant, the term §3.2a sizes the whole ecology on), `plantBiteFraction` (how fast a plant is cropped, hence how often a grazer must move), `plantGrazeRange` (acts on §11 risk 8 — a predator's herbivory fallback needs a plant in reach; past 32 u it breaks the 3×3 guarantee unless the plant hash cell grows with it, `spatial-hash.ts:7`), then `plantMaxSize`, then `eatRate` last because it also inflates hunting.

### Increment 3 — smell cuts over

`senseFood` reads `PlantScent` via the new `PheroField.gradientInto`. `sampleAt*` deleted. `SENSE_RANGE_B`/`SENSE_RANGE_C` deleted, `SCALAR_GENE_COUNT` 31 → 29. `senseFertility` reads the plant hash. Owns `sense.test.ts` and `genome.test.ts`'s layout lock (§9.3).

**Acceptance:**

| metric | gate |
|---|---|
| new gradient magnitude ÷ old, same positions | report, and tune `plantScentStrength` from the 0.018 starting value until it is within 2× |
| `FORAGE_PREF` variance at 8k | ≥ 0.07 — the recorded number for the working B niche |
| plant `SPECIES` variance at 8k | > 0.05 — the resource axis splitting on both sides |
| `SENSE_RANGE` gene mean | has not collapsed to its floor (the "vision evolves down" failure mode) |

### Increment 4 — delete the biomass field

Everything remaining in §9.1, §9.1a, §9.2, plus `food-field.test.ts`, `world.test.ts` and the `total()` probes. `food.step` removed from the tick.

**Acceptance:** `tsc --noEmit` clean, full suite green, `food-field.ts` under 260 lines, `grep -rn "foodChannels\|grazeAt\|sampleAt2" src/` empty outside `plants.ts`. `stateHash` wall time measured before and after; expect ~2.4× (§6) at 2 Hz and no more. **And explicitly: the demo hash moves from tick 0** because founder placement changes score function (§9.1a) — state the old and new hash in the commit message so it is a recorded change, not a mystery.

### Increment 5 — full rendering

Species hue, defence value, plant shape, the heatmap layer deleted, `main.ts` and `knobs.ts` cleanup.

**Acceptance:** in-browser at 64×, frame time at 5,000 creatures + 20,000 plants within 110% of increment 0's browser baseline. Follow the frame-pump and fresh-port procedure from the browser-verify notes — a backgrounded tab suspends `requestAnimationFrame`, and a same-port reload can run a stale compiled `main.ts`.

### Increment 6 — tuning, regional structure, optional sight

Per-biome `SPECIES` bias, reusing `BiomeConfig.preferredChannel`'s slot which the channel deletion orphans (`biomes.ts:45`; the `channelBias` field that used to sit beside it was deleted in `3d38b4a`). Plant sight if measured worth it. Whatever §7.1's threshold demanded.

**Acceptance:** `region-probe.ts` shows between-region plant `SPECIES` σ ≥ within-region σ — the F_ST shape the Arc C work chased and could not reach with animal traits, because plant species has no within-region coexistence pressure holding the spread open.

---

## 11. Risks and unknowns

**1. Pocket-level plant extinction.** Pure logistic growth has an absorbing state at zero, and the field's diffusion is the documented fix (`food-field.ts:14-16`). Pocket spacing at 20 pockets over 8192² is ~1,800 u, well beyond `SEED_RANGE`'s 900 max, so a pocket cleared of plants cannot be recolonised by dispersal. Options, re-ranked after the review:

| option | verdict |
|---|---|
| **(a) the graze reserve (§4.1) + seedling term (§3.1)** | **shipped, increment 1.** Removes the pressure at source: grazing can no longer take a plant to zero, so the dominant extinction mechanism does not exist. |
| **(b) `plantRefugeRate`** | **shipped, increment 2**, non-zero, tunable to 0 by that increment's measurement. The backstop for extinction from starvation or from a shading collapse, which (a) does not cover. |
| (c) raise `SEED_RANGE` max above pocket spacing | rejected — it makes dispersal range a non-choice, deleting a gene's worth of variation to solve a problem (a) and (b) already solve. |
| (d) a per-cell dormant seed bank | rejected — it is the textbook answer and it does buy local recolonisation, but with (a) shipped the scenario it addresses is rare, and it costs a second per-cell array plus its own hash coverage and reset path. Reconsider only if increment 2 measures extinctions that (b) cannot damp. |
| (e) accept it as real ecology | rejected as a default. Pocket extinction and recolonisation is genuinely interesting, but "the demo can go dark" is not a risk to accept before measuring it. |

**2. Smell grain does not improve.** The plant scent grid is 128×128 at 64 u/cell, the same resolution as the field it replaces, so a creature still smells a patch, not a plant. Nothing regresses; nothing improves. Resolving individual plants means a 512×512 grid: 262,144 cells × 2 channels × 2 buffers = 4.2 MB and 8× the diffusion cost. **Unmeasured.** If "legible behaviour" means watching a creature track a specific plant, decide before increment 3.

**3. The smell gradient changes scale, and every smell-tuning result was measured against the old one.** §5.1 gives a starting `plantScentStrength` of 0.018 that matches the equilibrium level to the old `Kcell` ceiling, but level-matching is not gradient-matching: the deposit/decay field has different spatial structure from a logistic biomass field with advection. Budget a retuning pass on `senseStep` and the food brain gene weights in increment 3, and treat the measured magnitude ratio as that increment's headline number.

**4. Knob count goes up, not down.** 10 removed, 28 added. The claim that this is simpler rests on the parameters describing organisms rather than a grid, and on the three mutually-exclusive food levers ceasing to conflict. Not yet demonstrated.

**5. Increment 2 is the one that can go wrong quietly.** The graze income path is where the tuned bimodal diet split lives. Population can look healthy while the split erodes to omnivory, which is why the gate is dietσ and not population.

**6. The plant count is derived, not seen** — and §8's minimal draw in increment 1 is the mitigation. 20,000 comes from matching the field's integrated fertility, and whether it reads as densely vegetated or as noise may still move `plantMaxSize` by 2× once someone looks.

**7. Single-target throttled eating caps intake, and the whole ecology now rides on one areal calculation.** Today a grazer's whole `effEatRate · herbivory` budget is spendable wherever any biomass exists, because the field is a continuous scalar. With one throttled target per tick, intake is `min(budget, plantBiteFraction · edible_best)` — so an animal on a cropped plant earns 0.83/tick against a 2.05 budget (§4.1a) and must relocate to earn more.

Whether relocating is *enough* rests entirely on §3.2a's areal sum: 5.1 plants in reach × 0.978/tick production = 4.99/tick against a 2.05 mean budget. Three of those four numbers are derived from measurements taken outside this system — plant density from a fertility integral, production from a logistic whose parameters are themselves derived, budget from the current engine. **If the realised density inside pockets is materially below the footprint average, or if grazers cluster so that neighbourhoods overlap more than 2×, the headroom disappears and grazers starve in increment 2.**

The gate is `bite ÷ budget ≥ 0.7` measured over the population, which mixes grazers on fresh plants (ratio ~1.0) with grazers that have overstayed (~0.4). Below 0.7 means grazers are not finding fresh plants fast enough. Response order: raise `plantGrowthRate` (more production per plant), then `plantBiteFraction` (a slower move-on signal), then `plantMaxSize`. Not `eatRate`, which would also inflate hunting. Increment 1 can de-risk this early by reporting realised plants-within-32u rather than only the footprint-average NND.

**8. The predator herbivory fallback becomes spatially stochastic.** Today `metabolize` grazes the cell under foot, and inside a pocket food is always present. Under plants, a predator's `herbivoryExp: 0.7` fallback needs a plant within `plantGrazeRange` — usually true at NND 12.6 u, but not always, so a deterministic income becomes a stochastic one with spatial structure. `plantGrazeRange` is the dial that acts directly on it and is listed first in increment 2 for that reason.

**9. Not measured, stated as estimates:** the 3.0 MB subsystem memory; the ~4× reduction in field work; the 2.4× hash cost; the shade scan's ~292k reads/tick; browser frame time with 20,000 extra points; the cost of 20,000 `Math.sin` calls per tick. Increment 0 turns the first performance question into a number; increment 1 turns the rest of §3.2's predictions into numbers.

---

## 12. What happens to `PHOTOSYNTH`

**Keep it, unchanged.** Do not merge it into plants and do not delete it.

`PHOTOSYNTH` (`ScalarGene` 28, index 26 after §2.1's deletions) is a **motile autotroph**, not a plant. It draws from the `LIGHT` field (`abiotic.ts:51-75`), its income is `photo · light · photosynthGain · stillness` where `stillness = 1/(1 + photosynthStillnessK · speed²)` (`economy.ts:466-467`), it has a full brain, it reproduces sexually, and it is eaten by `hunt()` rather than by grazing. Commit `de39c09` recorded a stable 5-way ecology with 578 autotrophs alongside 421 grazers, 495 predators, 59 scavengers and 18 parasites.

Keeping it costs nothing: tail-gated, byte-identical when off, zero code change under this rework. And it gains something — rooted plants now also read `LIGHT` through `LIGHT_NEED`, so the two autotrophs genuinely compete for the same resource. A drifting plankton-like autotroph and a rooted plant contesting a light field, with different consumers (bitten versus grazed) and different reproduction (sexual versus seeding), is a real trophic structure and it arrives free.

Deleting a working, measured, stable niche to make the ontology tidy would be the wrong trade.

---

## 13. Designed for — four later arcs

Not built here. This section shows each lands as an additive change rather than a rework, and names what must not be optimised away in the meantime.

### 13.1 Corpses as entities

**Write `plants.ts` as a static-entity pool that corpses join via a `kind` byte, not as a second pool and not as a parameterised base class.** One pool, `kind: Uint8Array` with `PLANT = 0`, `CORPSE = 1`, one hash, one render pass, one hash-into. The genes array is per-slot and a corpse simply leaves it zeroed; 24 wasted bytes per corpse is not worth a second pool's worth of iteration, hashing and rendering plumbing.

A corpse:

- skips growth, shading, seeding and scent deposit — one branch on a byte already in cache at the top of `plants.step`,
- decays: `E -= corpseDecay`, dies at zero or at `corpseMaxAge`,
- is consumed through the **same contact-bite path as grazing** (§4.1), scored by `SCAVENGER` instead of the `FORAGE_PREF`/`SPECIES` match, and with no root reserve — a corpse *should* be consumable to nothing.

What it replaces: `world.deathPositions` (`world.ts:117`, a `Float64Array` sized to `maxOrganisms × 2`) and the whole `scavenge()` pass, which are today's corpse substitute. `cullDead` allocates a corpse at the death position instead of writing the array.

**The justification is the entity model, not performance.** `scavenge` was O(deaths × liveCount) with a per-death allocation when this plan's first revision was written; commit `9c04cf0` has since given it a hash-neighbourhood scan sized to `scavengeRange` and hoisted the `eligible` array, so there is no perf debt left to collect. What the arc buys instead:

- **A corpse becomes a thing in the world**, with a position, a size, a decay clock and a render dot, rather than a one-tick energy event that has already vanished by the time anyone could look at it. Scavenging is currently invisible.
- **Competition over a corpse becomes real.** Today `scavenge` splits `corpseEnergy` among everyone in range by `SCAVENGER²` in a single tick. As an entity, a corpse is drained over many ticks by whoever is actually standing on it, so arrival order and persistence matter — the same contested-resource dynamics grazing gets.
- **One consumption idiom instead of two.** The contact bite (§4.1) already handles a static, energy-bearing, drainable entity. A corpse is that, scored by `SCAVENGER` rather than by species match, so `scavenge()` stops being a separate special-cased pass.

The cost is honest: it adds a per-tick loop over corpses that the current design does not pay, so the arc is roughly perf-neutral rather than a saving.

Accommodation needed now: **none.** The `kind` byte is added when the arc starts; nothing in this plan's layout moves.

### 13.2 Day/night or seasonal light

`lightAtAxis` is a pure function of position and seed with no RNG and no state (`abiotic.ts:62-70`). A time term is one added argument: `0.5 + 0.5·sin(x·cx + y·cy + phase + ω·t)`.

**The accommodation is required now and it is one line of discipline:** §3.1 reads light through a single `lightAt(x, y, tick)` seam, and every other light consumer (`metabolize`'s `PHOTOSYNTH` income) routes through the same one. With that seam in place the arc is a change to one function body and `PHOTOSYNTH` inherits the oscillation for free.

**What this forecloses, deliberately:** caching light per plant at germination. It is a genuine optimisation at 20,000 sines per tick and §7.1 excludes it by name. If a future perf pass proposes it, the correct answer is hoisting a per-tick `LightAxis` computed once, not a per-plant cache.

### 13.3 Plant toxin against grazer tolerance

Half exists. `DEFENCE` (plant gene 3) already cuts the bite and already costs upkeep — but as §2 states, **that is armour, not toxin**: it is symmetric, so the plant loses less biomass and the grazer gains less. A toxin costs the grazer energy without protecting biomass.

The arc adds both the missing half and its counter:

- **plant side:** no new gene. `DEFENCE` becomes dual, adding a toxicity term to the graze outcome: `gained -= plantToxinCost · DEFENCE_p · bite`. The armour half is unchanged.
- **animal side:** one new `ScalarGene` at the tail — `TOXIN_TOLERANCE`, index 29 after §2.1's two deletions, [0,1], costed, tail-gated so OFF is byte-identical, seeded uniform like the morph genes. It cancels the toxicity half only: `gained -= plantToxinCost · max(0, DEFENCE_p − TOXIN_TOLERANCE_i) · bite`. Tolerance never helps against armour, which keeps the two halves independent.

That is a full Red Queen loop and a second niche axis orthogonal to `SPECIES`, from one gene on each side. Accommodation needed now: **none**, provided `DEFENCE` ships in increment 1 rather than being deferred as "colour only". It is in the increment-1 gene table for this reason.

### 13.4 Perf and world size

Three properties make a world-size arc a config change rather than a rewrite: `plantCapacity` is independent of `maxOrganisms`; the plant hash cell size is independent of the creature hash cell size; and nothing in the plant pool is O(N²) — free-stack alloc, counting-sort hash, 3×3 scans throughout. That last is the property `Parcels` lacks (`parcels.ts:85-89, 182-205`), which is why §1.3 says not to copy it.

**What is currently a constant and must become derived when the arc starts:**

| constant | today | derived from |
|---|---|---|
| `foodCols`/`foodRows` | 128 (16,384 cells at 64 u) | world size ÷ target cell size |
| plant scent + glow grid dims | same 128 (`world.ts:~153,157`) | ditto — three grids, one derivation |
| plant hash cell | 32 u | `plantGrazeRange` and `plantShadeRange`, which must move together (`spatial-hash.ts:7`) |
| `plantCapacity` | 32,768 | eligible-cell count × target density |
| `foodPatchCount` | 20 | world area ÷ target pocket spacing |
| §7.1's absolute threshold | 0.26 ms/tick | 16.7 ms ÷ target speed multiplier |

The load-bearing observation from §7.1: the plant subsystem's cost scales with **local density**, not with world area or with the cap. A world twice as wide at the same pocket density costs proportionally more total work but the same per-entity work, and the frame budget is per-tick. So a bigger, sparser world is close to free per entity; a denser world is not. The fertility map — which survives this rework untouched — is exactly the knob that decides which one you get.

Prerequisite, recorded elsewhere and not fixed here: `walls.ts` reconstructs food pockets from a different RNG stream than the real field (§9.1a), so `openPockets`/`connectPockets` carve open space at positions unrelated to the actual pockets. A world-size arc that leans on pocket geometry needs that fixed first.

---

## 14. Review response

Against the adversarial review at `scratchpad/plan-review.md` (7 blocking, 12 should-fix, 9 nit). "Stale" means the reviewer read revision 1 before the round-2 owner answers landed.

| item | response |
|---|---|
| B1 §4 vs §4.1 contradiction | **stale** — both were already single-target hunt-style before the review landed. §4.1's income-ceiling consequence is now §11 risk 7 with a gate. |
| B2 grazing is lethal / absorbing state | **fixed, §4.1 + §3.1** — root reserve `plantGrazeFloor · MAX_SIZE` (primary) plus the `+plantSeedEnergy` seedling term (backstop). Wilt-timer option rejected with reason in §4.1. |
| B3 extinction measured where it cannot happen | **fixed, §10** — increment 1 measures ungrazed per-pocket occupancy as a baseline only; the extinction gate moves to increment 2, which ships `plantRefugeRate` non-zero and may tune it to 0. |
| B4 §3.2 derivation wrong in four places | **fixed, §3.2** — re-derived from the measured constants (crop ~700,000 ±6%, fert 3.28, light 0.658, 1.62/cell, n 14.6), `crowdT` carried through. `MAX_SIZE` 38→24 (→**31** in revision 3), `GROWTH_RATE` 0.06→0.05 (→**0.09**), `plantShadeK` 0.02→**0.045**. Stated as predictions increment 1 measures. |
| B5 `world.ts:277-285` founder placement | **fixed, new §9.1a** — replacement is `fertilityAt` at `plantGermFertility`; channel-A bias and hash movement both stated; increment 4 acceptance records the hash change. |
| B6 increments 2 and 3 cannot ship green | **fixed, §9.3/§9.4 rewritten by owning increment**, §10 preamble now names the three CI commands. |
| B7 §13 missing | **stale** — §13 exists. The review's four content requirements are folded in: pool-reuse decision, the `lightAt(x,y,tick)` seam, armour-vs-toxin, and the derived-constants table. |
| S1 hash the plant genes | **accepted, §6** — the `world.ts:~491-493` comment mandates it for motor-inert genes, and a plant is entirely motor-inert. Hash cost restated 1.33× → **2.4×**. |
| S2 increment 1's determinism claim untestable | **accepted, §6 + increment 1** — `organismHash()` test helper. |
| S3 `walls.ts:345-357` constructs a `FoodField` | **accepted, §9.1a**, with the ghost-pocket divergence flagged as not-fixed-here. |
| S4  `genome.test.ts` pins the layout | **accepted, §2.1 + §9.3**, owned by increment 3. |
| S5 "zero genome disturbance" is wrong | **accepted, §5.1** — split into layout (undisturbed) vs scale (must be matched); `plantScentStrength ≈ 0.018` derived; increment 3 gates on the magnitude ratio. |
| S6 `plantGermFertility` unvalued | **accepted, §3.3** — 2.0, with the eligible-area table and the NND-gate restatement over the actual footprint. |
| S7 light caching forecloses seasons | **already addressed** in revision 1's §7.1; now reinforced by the §3.1 seam and §13.2. |
| S8 nothing visible until increment 5 | **accepted, §8 + increment 1** — minimal position+radius draw moves to increment 1. |
| S9 food history series deleted, none added | **accepted, §9.5** — four plant series in increment 1. |
| S10 extinction option list incomplete | **partly accepted, §11 risk 1** — re-ranked with the graze floor first and `plantRefugeRate` as backstop. Seed bank added to the table and **rejected**: with the floor shipped its scenario is rare, and it costs a second per-cell array plus hash and reset coverage. Reconsider if increment 2 measures extinctions `plantRefugeRate` cannot damp. |
| S11 `plantGrazeRange` missing as a dial | **accepted** — now the first of four dials in increment 2, with the 3×3 guarantee caveat. |
| S12 `plantCellCap` oversold | **accepted, §3.4** — restated as a scan-cost and pool-overflow guard with the 108-candidate worst-case bound; capacity is shading's job. |
| N1 two equations linearly dependent | accepted — §3.2 presents one sizing equation plus the `r` match. |
| N2 738,000 is one seed | accepted — mean ~700,000 ±6%, all three seeds quoted. |
| N3 `config.ts` cites match a dirty tree | accepted — config knobs are now cited by name, with a header note. |
| N4 `world.ts` cite drift | accepted — `~365`, `~415`, `~496`, `~491-493`, `~549-553`. |
| N5 §9.1 overlapping line ranges | accepted — the keep row is now 498-535 / 551-562 / 608-625. |
| N6 scan estimates 3.7× too high | accepted — graze ~15 scanned / 5.1 in range / ~74k checks, shade ~292k reads, throughout §3.4, §4.2, §7. |
| N7 `FoodLayer` is four entries at 41-44 | accepted, §9.5. |
| N8 hash contingency should be a code comment | accepted, §6 and §9.1. |
| N9 28 knobs, no doc requirement | accepted, §9.2 — every new knob's comment must state the measured quantity it came from. |

### Round 2

| item | response |
|---|---|
| R1 grazers out-eat regrowth; the reserve stops the last bite but not the starvation | **fixed, §4.1a** — the bite is now throttled by plant state, `bite = min(budget, plantBiteFraction · (E − R))` at `plantBiteFraction: 0.25`. Persistence becomes **unconditional**: the bite vanishes at the reserve while growth there is strictly positive, so no parameter inequality is needed. Equilibrium under one persistent grazer `E* = 7.98` against reserve 4.65, realised intake 0.83/tick = 40% of a mean budget, which is the move-on gradient. Sustained intake is answered arealy in new **§3.2a**: `GROWTH_RATE` 0.05→**0.09**, sized so 5.1 plants in reach produce 4.99/tick against a 2.05 mean budget. The reviewer's per-plant peak figure of ~2.2/tick was `r·K`; the peak of the logistic is `r·K/4`, so the shortfall was **worse** than reported — 3.8× at revision 2's parameters, not 1.3×. |
| R2 crowding via light only ⇒ no feedback for `LIGHT_NEED` 0; cap 12 permits 4.5× the pool | **fixed, §3.1 + §3.4a** — two crowd terms from one scan: `crowdK` (`plantCrowdK` 0.02) multiplies `K` for **every** strategy, `shadeL` (`plantShadeK` 0.045) multiplies light only. Shade tolerance still buys immunity to the light half; nothing is immune to crowding. `plantCellCap` derived as `ceil(2 · plantCapacity / eligibleHashCells)` = `ceil(2 × 32,768 / 11,616)` = **6**, which binds on ~0.8% of germinations at the target density and bounds both new scans at 9 × 6 = 54. The global roof is dropped as a claim: it is the pool's own free stack, which is automatic. §3.2 re-derived: `MAX_SIZE` 24→**31**. |
| R3 §13.1 justifies corpses on a defect `9c04cf0` already fixed | **fixed, §13.1** — the perf argument is withdrawn and stated as withdrawn. Corpses are justified on the entity model: a visible, persistent, contestable object drained over many ticks through the existing bite idiom, instead of a one-tick invisible energy split. The arc is called roughly perf-neutral, not a saving. |
| R4 increment 6 cites `channelBias`, deleted in `3d38b4a` | **fixed** — the reference is removed; only `preferredChannel` (`biomes.ts:45`) is cited. |
| R5 §3.1 divides by `K` unguarded; `K` reaches exactly 0 | **fixed, new §3.1a** — both routes named (`fert` 0 over the ~80% dead water, reachable mid-run via `driftPockets`; `lightT` 0 for a `LIGHT_NEED` 1 plant in a light trough, reachable at germination with no drift). Guard is two clamps, no branch: `Kc = max(K, plantMinK 0.5)` and `E += max(growth, −plantStarveRate·E)` at 0.05. Unclamped the raw term is −242/tick at `K` 0.5, `E` 35 — correct but a large negative into a hashed Float64 in one tick. A collapsed plant shrinks at 5%/tick and dies in **~83 ticks**. Two dependent rules fixed with it: §3.5's death test becomes `E <= plantDeathEnergy` 0.5 (exponential decay never reaches 0), and §3.3's seed test gains `K > plantMinK` (as `K` → 0 the threshold `E >= plantSeedThreshold·K` is trivially true, so a dying plant would fire a seed every cooldown). |
| R7 `plantBreadthMin` unvalued; the areal inequality assumes all 5.1 plants are edible | **fixed, new §4.1b** — set to **0.58**. The threshold is structural at 0.5, where an interior specialist's band spans the whole `SPECIES` axis so no plant is categorically inedible and §3.2a holds for every genotype; 0.58 leaves the worst-matched plant at 0.14 rather than ~0. At 0.1 a specialist realises 0.49× its budget and starves. Concession stated plainly: `FORAGE_BREADTH` now grades a preference rather than partitioning the resource, and hard partitioning is bought back only by raising `N`, which is the §13.4 world-size arc. Increment 2 gains **realised intake ÷ budget ≥ 0.7 per `FORAGE_BREADTH` decile**, because the population mean passes while the narrow tail starves. |
| R8 `plantUpkeep` falls outside the growth clamp | **fixed, §3.1a + §6** — upkeep is applied after the clamp and can drive `E` negative in the same tick, so the pass order `grow (clamped) → upkeep → age → seed → cull` is a correctness constraint and the cull must run after upkeep. Stated in both places, with what breaks otherwise: a negative scent deposit into a field with no floor, `√E` = `NaN` in the render size, and a negative in the determinism hash. |
| R6 minimal alternative `plantCellCap: 2` | **rejected with the number, §3.4a** — at λ 1.72 it rejects **51.3%** of germinations, so it becomes the capacity mechanism rather than a guard: spatially discrete, blind to plant size and strategy, and it would dominate `crowdK`/`shadeL` and flatten the §3.4 succession axis. The universal crowd term ships; cap 2 is recorded as the fallback if increment 1 shows `crowdK` not binding, and even then a smaller `plantShadeRange` is tried first. |
