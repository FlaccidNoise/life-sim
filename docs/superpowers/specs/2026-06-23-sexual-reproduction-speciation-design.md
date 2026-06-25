# Sexual reproduction + emergent speciation — design (life-sim-xa90)

**Status:** approved (brainstorming complete, 2026-06-23). Branch `feat/sexual-reproduction` off `main` (`48b1f31`).
**Goal:** replace asexual clone-and-mutate with **sexual reproduction** — offspring genome = **crossover of two
parents + mutation** — gate breeding on a **genetic-compatibility check** so that genetically divergent creatures
(predator vs prey, or a wanderer in a divergent population) **cannot interbreed**. Consequence: "species" becomes a
real emergent unit (reproductive isolation = the biological species concept), enabling sympatric/allopatric
speciation. Plus **mate-preference / display genes** (sexual selection) layered on top.

---

## 0. Feasibility evidence (probe run BEFORE design — `src/headless/mate-encounter-probe.ts`)

The bead's central risk was mate-encounter rarity at 8192². The probe (demo config, mean pop ~5400, 3 seeds, 4000
ticks) **contradicted the owner's "dense pockets are enough" hypothesis** and reshaped the design:

- **Raw encounter rate** — fraction of breeding-ready creatures with ANY neighbour within range:
  8u → **0%**, 16u → **4%**, 32u → 32%, 64u → 71%.
- Only **~1.5 creatures are breeding-ready per sampled tick** out of ~5400 alive (breedCooldown=150 + a high
  satiated bar make instantaneous readiness rare).
- **Readiness anti-correlates with crowding**: a creature hits its satiated bar precisely when it's a well-fed
  *loner* in a food patch, not when packed in a pocket. So the "dense pocket" intuition fails for the creatures
  that actually want to breed.
- Genetics are NOT the binding constraint: nearest-neighbour genetic distance median ~0.23 (p90 ~0.70), and diet
  classes are already spatially segregated. **Spatial sparsity is the blocker**, not compatibility.

**Conclusion:** an instantaneous "3×3 hash query for a satiated compatible mate" would crash births ~25× vs the
asexual rate. The mate-*finding* mechanism must spread the encounter over **time**, not rely on instantaneous
co-location. Owner chose **mate-seeking over time**: a wanderer that checks for a compatible contact each tick over
a ~120-tick window reaches a high cumulative encounter probability (per-tick ~2–4% → ~85–98% over the window),
because the mate need only be a mature compatible adult (a pool of ~most of the population), not also satiated.

---

## 1. Locked decisions (from brainstorming)

| Decision | Choice | Rationale |
|---|---|---|
| Brain inheritance | **Inherit from mother** + modular `crossoverBrain()` pass-through seam | A separate session is about to add a hidden layer + I/O to the brain (BRAIN_GENES/layout change). Index-aligned brain crossover now would break on that. Scalar genes + hue do real crossover; brain crossover drops in after the NN lands. |
| Mate-seeking signal (v1) | **Sight/hue-attraction + existing satiation-wander**, behind a modular seam | The kin-scent field is the *other* session's build (a 4-class scent model: prey / prey-omni / pred-omni / predator) and will serve mating too. v1 must not build a field; it uses an interim appearance-based pull and swaps to the scent gradient later. The SEEKING state machine, compatibility gate, and crossover are unchanged by that swap. |
| Sexual selection | **Include DISPLAY + PREFERENCE genes in v1** | Full bead scope. Additive/modular (append at gene slots 24/25). Watch an arbitrary ornament sweep via mate choice (Fisherian runaway). |
| Build policy | **ON by default** (`sexualReproduction: true`) + ablation toggle; determinism (same `(config,seed)` → same hash) is the ONLY invariant | Per `feature-default-on-policy.md` (owner directive 2026-06-23). Byte-clean / golden-hash / draw-skip gating is RETIRED — do NOT add it. |

**Deferred (noted, not built):** CHOOSINESS gene (evolvable per-creature threshold); brain crossover (waits for the
NN topology change); the kin-scent mate field (other session); a father-side mating energy cost.

**Forward seam — evolvable reproduction mode (v2, bead `life-sim-z0f1`):** in real biology asexual and sexual
reproduction *compete* under selection (the "evolution of sex"). v1 deliberately keeps `sexualReproduction` a
**global config toggle**, but reproduction branches on a single check inside `reproduce()` — so v2 can turn that
into a per-creature heritable `REPRO_MODE` gene with a localized change. v2's real work is NOT the gene; it's
engineering a **benefit-to-recombination** that offsets asexual's ~2-fold cost (else asexual fixates and sex goes
extinct — v1's probe already showed sex is the more expensive strategy here). Candidate levers: Red Queen /
changing environment (the living-world's migrating pockets let recombination track a moving optimum clones can't),
Muller's ratchet (asexual mutation-load accumulation), or a direct clone-tax. Out of scope for v1; the seam is
intentional.

---

## 2. Genome changes (`src/core/genome.ts`)

- Append to the `ScalarGene` enum: `DISPLAY = 24`, `PREFERENCE = 25`. `SCALAR_GENE_COUNT = 26`.
  - `DISPLAY`: 0–1 ornament — a pure mate signal (drives a render cue; no survival benefit). `costKey: null` in v1.
  - `PREFERENCE`: 0–1 — the display value this creature finds attractive. `costKey: null`.
  - Add `SCALAR_GENE_SPECS` entries: centerKeys `display` / `preference` (config centers 0.5), `min 0, max 1`.
  - **Ungated / always-drawn.** Bumping `SCALAR_GENE_COUNT` shifts the seed/birth RNG stream vs `main`; that is
    ALLOWED under the on-by-default policy (determinism ≠ byte-identical-to-old). Any test asserting a *literal*
    hash constant is updated to run-to-run equality (`world.test.ts` is already determinism-by-equality).

- **`crossoverScalarGenes(genes, child, mom, dad, rng, cfg)`** — new. Per-gene **uniform pick**: for each gene
  `g`, draw one RNG value; pick mom's or dad's allele; then apply the same Gaussian mutation + clamp as
  `mutateScalarGenes`. Uniform pick (not blend/average) preserves discrete allele combinations → maintains the
  distinct trait clusters speciation needs. Tail-gated genes (forage/phero/age) keep their existing
  `scalarGeneGatedOff` no-draw behaviour (inherit from mom when gated off — no pick draw), so gating still works.

- **`geneticDistance(genes, a, b, cfg)`** — new. Normalised L2 over the *ecological* genes 0–23:
  `sqrt( Σ_g w_g · ((g_a − g_b)/range_g)² )`, `range_g` from `SCALAR_GENE_SPECS`. `w_DIET = cfg.mateDietWeight`
  (default 5); DISPLAY/PREFERENCE weighted **0** (sexual axes are not species axes); all other ecological genes
  weight 1. A `brainDistance(a,b)` hook returns **0** in v1 (modular seam for after the NN lands).

---

## 3. Reproduction rewrite (`src/core/economy.ts`)

`reproduce()` keeps its asexual body for `sexualReproduction === false` (ablation, unchanged). For
`sexualReproduction === true` it runs the **sexual + seeking** path. Both iterate parents in **ascending
live-slot order**, drawing RNG only at birth.

### 3a. Store additions (`src/core/store.ts`)
- `seeking: Uint8Array` — 1 while a creature is actively looking for a mate.
- `seekTicksLeft: Uint32Array` — countdown of the current seeking window.
- Both reset on `alloc`/`free`; both folded into `stateHash` (tight determinism contract).

### 3b. Per-parent loop (ascending slot order), sexual path
For each live parent `p`:
1. **Maturity / cooldown gates** — identical to today (juvenile `MATURITY_AGE` gate; `breedCooldownLeft`
   decrement-and-skip). RNG-free, before any draw.
2. **Trigger** `energy[p] ≥ satiatedBar(p)`:
   - If `!seeking[p]`: **enter SEEKING** — `seeking[p] = 1`, `seekTicksLeft[p] = cfg.mateSeekWindow`. (No birth
     this tick; the steer picks up the seeking flag next tick.)
   - If `seeking[p]`: **try to mate** (3c). On success → birth + exit seeking. On failure → `seekTicksLeft[p]--`;
     if it reaches 0, **exit seeking** and set `breedCooldownLeft[p] = cfg.breedCooldown` (refractory — forage
     before retrying, no perma-seeking energy burn).
   - If `energy[p] < satiatedBar(p)` while seeking (dropped below the bar mid-search): exit seeking (it must
     re-forage). RNG-free.

### 3c. Mate selection + crossover birth (the only RNG draws)
- Scan `world.hash` (post-move build, still valid at `reproduce()` time — nothing moves between the line-282
  build and `reproduce()`; dead slots filtered via `isAlive`) over the 3×3 neighbourhood of `p`. A **candidate**
  mate `m` is: `m ≠ p`, `isAlive(m)`, **mature** (`age[m] ≥ MATURITY_AGE[m]` when `ageStages`), within
  `cfg.mateContactRange` (toroidal distance), and **compatible** (`geneticDistance(p,m) < cfg.mateCompatThreshold`).
  The mate need NOT be satiated/off-cooldown (the feasibility win — large partner pool).
- **Choice among candidates** (RNG-free, deterministic): pick the candidate minimising
  `|DISPLAY[m] − PREFERENCE[p]|`; tie-break by lowest slot. (Sexual selection.)
- **Birth** — `p` is the **mother**: `alloc()` child; spawn near `p` (existing `offspringOffset` + angle RNG +
  wall fallback); `crossoverBrain()` stub → `mutateGenome(child, mom=p)` (brain+hue from mother, mutated);
  `crossoverScalarGenes(child, mom=p, dad=m)` + mutation; `resetLearned(child)`; provision child to its
  `BIRTH_ENERGY` capped by `energy[p] − reproOverhead`; mother pays provisioning + `reproOverhead`
  (energy-conserving, identical bookkeeping to today). Father pays nothing (genes only). Set
  `breedCooldownLeft[p] = cfg.breedCooldown`; `seeking[p] = 0`. Fire `cfg.onBirth?.(p, …, child, …)`.
- A creature initiates ≤ once/tick (loop visits each parent once). Being chosen as a father is read-only and may
  happen for multiple mothers in a tick — deterministic and harmless.

### 3d. Determinism summary
RNG consumed ONLY at birth (crossover per-gene picks → mutation → spawn angle), in ascending mother-slot order.
Seeking entry/exit, candidate scan, compatibility, and mate choice are all RNG-free. Same `(config,seed)` →
byte-identical run-to-run (the only invariant).

---

## 4. Mate-seeking steer (`src/core/sense.ts`)

When `store.seeking[i]`, `senseCreatures` adds a **mate-attraction** to creature `i`'s sight vector: a pull toward
the nearest neighbour that is the **same diet class** and **similar hue** (cheap kin-by-appearance proxy — you're
drawn toward creatures that *look* like compatible mates; true compatibility is decided at the contact gate).
Strength = `cfg.mateSenseAttraction`. This composes with the existing satiation-wander (which covers ground when no
mate is in sense range) and is the **modular seam**: when the 4-class scent field lands, this term is replaced by
steering up the matching kin-scent gradient — no change to §3. RNG-free.

---

## 5. Config (`src/core/config.ts`)

| Key | Default | Meaning |
|---|---|---|
| `sexualReproduction` | `true` | Master toggle. `false` → today's asexual `reproduce()` (ablation). |
| `mateSeekWindow` | `120` | Ticks a creature stays in SEEKING before timing out. |
| `mateContactRange` | `12` | World-unit radius for a mating contact (≈ one hash cell; covered by the 3×3 scan). |
| `mateCompatThreshold` | `0.6` | Max `geneticDistance` for a compatible pair. Smaller = stricter isolation / easier speciation; too small risks birth crash. |
| `mateDietWeight` | `5` | DIET up-weight in `geneticDistance` (makes predator/prey isolation fall out of the metric). |
| `mateSenseAttraction` | `1.0` | Strength of the seeking mate-attraction steer (bounded like `cohesionDrive` so it can't override fleeing a threat; tune via the guardrail). |
| `display`, `preference` | `0.5` | Founder centers for the new genes. |

All carry doc comments verified against the actual sim code (per `config-doc-drift.md` — do not trust drifted
comments). `onBirth` hook is unchanged (read-only; still fires once per real birth with exact parent→child ids).

---

## 6. Tests (TDD — failing test first)

1. **`crossoverScalarGenes`** (`genome.test.ts`): child alleles each come from one parent (within mutation noise);
   determinism (same rng state → same child); clamping respected.
2. **`geneticDistance`** (`genome.test.ts`): 0 for identical; symmetric; a DIET gap dominates (predator vs prey
   distance ≫ same-class distance at `mateDietWeight=5`); DISPLAY/PREFERENCE differences contribute 0.
3. **Compatibility gate** (`economy.test.ts`): a seeking mother with only an *incompatible* neighbour in contact
   range does NOT breed; with a *compatible* one it does. Predator×prey pair never breeds.
4. **Seeking state machine** (`economy.test.ts`): satiated creature enters SEEKING (no instant birth); times out
   to a cooldown after `mateSeekWindow` with no mate; mates and exits seeking on a compatible contact.
5. **Mother-pays energy conservation** (`economy.test.ts`): post-birth `Σenergy` = pre-birth − `reproOverhead`
   (father unchanged); mother drops into her reproductive band.
6. **Determinism** (`world.test.ts`): two worlds, same `(config,seed)`, identical `stateHash` at tick N with
   `sexualReproduction:true`.
7. **Liveness guardrail** (`world.test.ts`): demo-ish config, `sexualReproduction:true`, ~1500 ticks (fast enough
   for the unit suite) → `population > floor` (e.g. > 50), `totalBirths > 0`, not extinct. The full ~3000-tick /
   multi-seed liveness check lives in the §7 measurement run. **Load-bearing** — sexual + compatibility-gated
   mating could crash births to extinction.
8. **Ablation parity** (`world.test.ts`): `sexualReproduction:false` runs the asexual path and stays deterministic.

Existing 313 tests stay green (literal-hash assertions, if any, updated to equality — they change by policy).

---

## 7. Measurement (does speciation actually emerge?)

Run `npx tsx src/headless/life-history.ts 6000 1-5 --demo` (already reconstructs family trees via `onBirth`) plus a
focused check:
- **Reproductive isolation:** do lineages split into clusters that stop sharing recent ancestors? Do diet-0 and
  diet-1 sublineages (if predators persist) become non-interbreeding (no cross-class parent links)?
- **Births stay healthy:** `totalBirths`, % ever reproduced, population trajectory vs the asexual baseline.
- **Sexual selection:** does DISPLAY drift coherently (an arbitrary ornament sweeping) and does PREFERENCE track
  it? (early→late cohort means + generation-vs-gene sparkline already in life-history output.)
- **Compatibility calibration:** if births crash → raise `mateCompatThreshold` / `mateSeekWindow` /
  `mateContactRange`; if no isolation emerges → lower the threshold. Report with file:line evidence.

---

## 8. Module boundaries (what each new unit does / depends on)

- `geneticDistance` / `crossoverScalarGenes` (genome.ts): pure functions over `scalarGenes` + cfg. No store/RNG
  coupling beyond the passed rng. Testable in isolation.
- Seeking state machine (economy.ts `reproduce`): owns `seeking`/`seekTicksLeft`; depends on `store`, `world.hash`,
  `geneticDistance`, cfg. The only RNG site.
- Mate-attraction steer (sense.ts): reads `seeking` + hue/diet; writes the sight vector. RNG-free. The swap-point
  for the future kin-scent field.
- `crossoverBrain()` (genome.ts): pass-through stub now; the single edit point when the NN topology lands.
