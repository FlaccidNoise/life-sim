# Plan: Arc C — Environment as the regional-diversity engine

Third arc, following **Arc A** (legibility — shipped 2026-07-03) and **Arc B** (ecology robustify —
`plans/2026-07-legibility-then-ecology.md`). Where Arc B makes a predator/prey ecology emerge *reliably*,
Arc C makes **space** the driver of diversity: distinct regions become distinct selective environments, so
different phenotypes win in different places (**regional phenotypic differentiation**), and barriers to gene
flow let those differences harden into **reproductively-isolated lineage clusters** (**allopatric speciation**).

**Design intent (owner-confirmed 2026-07-03):** use BOTH the existing spatial machinery AND new abiotic axes.
Acceptance = the full biogeographic story on the SHIPPED demo across seeds 1–8: between-region trait σ ≫
within-region, region-distinct diet/forage niches, and reproductively-isolated lineage/hue clusters per region
that persist.

## Status (2026-07-04)
- **C0a LANDED** (a63c465): `src/headless/region-probe.ts` instrument + `onBirth` father-slot param +
  `walls.regionAt`. Determinism green.
- **C1 LANDED** (ee09268): `deadWaterCost` 0.02→0.05; demo-health-gate 8/8. Isolation is geometry-maxed
  (gene flow ~1.4%), so this is a marginal down-payment.
- **C3 mechanism LANDED OFF / WIP** (7727408): `abiotic.ts` temperature field + `THERMAL_PREF` gene +
  metabolize tax. OFF by default (demo byte-identical). NOT yet clearing the target.
- **⭐ CORE FINDING:** the exit's `between-region σ ≥ 2× within` (F_ST≥2) is **structurally impossible for
  existing traits** — diet/metabEff/size maintain within-region diversity (coexistence/tradeoffs) so a
  regional optimum shifts the region MEAN, not the within-region spread → F_ST~1. That is why C3 adds a
  DEDICATED THERMAL_PREF gene under pure regional selection. It partially works (temp↔pref r up to 0.76)
  but doesn't clear F_ST≥2 at 12k — the smooth gradient over 20 pockets + gene-flow re-mixing dilute it.
  TO TURN ON: assign temperature PER-POCKET (uniform per region), validate at 20k, raise tmc; then
  demo-health-gate for ecology safety before shipping.
- **Rejected:** `pocketCapVariance` (clamp conflict flattens pockets, kills predators); richnessVar 1.0 /
  forageGeneralistFloor 0.6 (seed-variable); metabEff temperature-optimum penalty (inert, r=0.09).
- **Remaining:** C3 tune-on → C2 (walls block movement already via sweptCollide; POROUS part = Voronoi
  biome borders — seal them + findMate biome-gate + flowPush down) → C4 → C5 → C-gate → C0b overlay.

## Context a fresh session needs
- Demo config = `defaultConfig({...livingWorldOverrides})`; `src/app/living-world-config.ts` is the single
  source (browser `main.ts`, headless probes, tests all read it). `defaultConfig()` alone is the bare baseline.
- **Determinism is the ONLY invariant:** same `(config, seed)` → byte-identical `world.stateHash()`. Every new
  field (abiotic gradient, disturbance schedule) MUST be seeded + deterministic — no wall-clock, no un-seeded
  RNG. Features ship ON (golden-hash ablation gate retired).
- **Arc C depends on Arc B** — regional differentiation needs (a) a working ecology to differentiate (B2
  density/geometry so interactions actually happen) and (b) B5's assortative mating for isolation to *harden*
  rather than erode. Do not start Arc C until B1/B2/B5 are landed. C0 (the instrument) can be built in parallel.

### Existing environmental machinery (already in the engine — Arc C activates + extends it)
- **Fertility pockets** (`fertilityPockets`, Gaussian), `deadWaterCost` (between-pocket travel tax),
  `pocketCapVariance`, `fertilityDriftRate`/`Interval`, `pocketDriftSpeed`.
- **Walls** (`wallRegionCount` Voronoi biomes, `wallDensity`, `wallPocketCoreRadius`, `wallCorridorRadius`,
  `wallOccludesVision`, `wallSenseRange`) — today occlude vision + dam food; do NOT yet block movement/mating.
- **Flow** (`flowStrength` seed-time, `flowScale`, `flowPushStrength` live) — mixes bodies between pockets
  (a gene-flow SOURCE that fights isolation; a lever to tune DOWN at barriers).
- **Per-region resources**: `foodChannels: 3` + `pocketChannelMode: 1` (pockets round-robin a channel, so a
  forage specialist must live in its resource's island). Demo already runs this.

### Measured findings this arc builds on (memory)
- `biogeographic-demes-redesign`: density in deep SMALL pockets is the diversity keystone (revives predation +
  bounds pop); `dietGeneralistFloor` fights omnivory drift so a bimodal split persists past 20k all seeds.
- `pocket-richness-diversity`: **per-pocket richness** (deep predator-haven vs shallow grazer-refuge) drives
  **between-pocket diet SD 8–10×**; `deadWaterCost` isolation is a real lever — but these ship OFF/conservative.
- `perception-scale-mismatch` / `vision-revival-null`: DENSITY is the lever, not sense range; to move a trait
  regionally use an **AVOIDANCE / cost** (a region PENALIZES the wrong phenotype), not another carrot.

---

## Tasks (each one reviewable commit; verify headlessly, keep determinism green)

### C0 — Regional-differentiation instrument (methodology FIRST) [S→M]
Before adding a single lever, build the measurement — otherwise we can't tell a working lever from noise.
- **`src/headless/region-probe.ts`**: partition the world into regions (by pocket, wall-biome, or gradient
  cell), then report the F_ST-like ratio **between-region trait σ / within-region σ** per trait (diet, forage,
  metabEff, vision, size, hue), per-region diet/forage niche histograms, and **cross-region gene flow** (share
  of births whose parents came from different regions — the isolation metric). Reuses `evolve-probe`'s
  onBirth-lineage tracking.
- **Browser overlay** (extends Arc A): a region-tint layer + a "regional differentiation" readout (the σ ratio
  + cross-region mixing %), so the biogeographic story is legible, not just probe-only.
- **Accept:** the probe runs on `livingWorldOverrides` across seeds 1–8 and prints a stable differentiation
  ratio; the overlay shows regions. This is the acceptance instrument for every C-task below.

### C1 — Activate the proven isolation machinery (existing structure, low-risk down-payment) [S]
Turn ON + tune the OFF/conservative isolation levers the demes work already validated on probe configs, on the
SHIPPED demo: **per-pocket richness variance** (deep predator-haven vs shallow grazer-refuge) and
**`deadWaterCost`** (raise the between-pocket travel tax so demes stop freely mixing). Verify per-pocket
resource specialization (`pocketChannelMode`) is actually biting.
- **Accept:** C0 shows between-region diet σ ≫ within (reproduce the 8–10× SD finding on the demo, not a
  probe-only config), with pop still bounded and the ecology alive across seeds 1–8.

### C2 — Walls as real gene-flow barriers (existing structure) [M]
Today walls occlude vision + dam food but are porous to bodies/mating. Make wall boundaries impede
**movement and mate-contact** across biomes (or make `wallCorridorRadius` corridors the only crossings) and
tune `flowPushStrength` DOWN so the current stops shuttling genes across barriers. Couple with Arc B's B5
assortative mating: barrier + assortative mating = allopatric speciation.
- **Accept:** C0 shows reproductively-isolated lineage/hue clusters aligned to wall biomes; cross-biome
  crossover share drops sharply and stays down.

### C3 — Abiotic gradient axis (NEW environment axis) [M]
Add ONE spatially-varying, seeded abiotic field (recommend **temperature** or **depth/light**) that GATES a
trait's *optimum*, so regions have distinct trait targets even absent barriers. Per the vision-revival-null
lesson, implement it as a **regional COST/avoidance** (the region penalizes the wrong phenotype), e.g.
metabEff optimum tracks temperature (cold favors high metabEff, warm low), or vision payoff tracks depth/light
(dark regions favor smell over sight). Deterministic (field seeded once). One new brain input optional.
- **Accept:** C0 shows per-region trait means (metabEff/vision) diverge ALONG the gradient; between-region σ ≫
  within on that trait, across seeds.

### C4 — Disturbance / seasonality (NEW temporal axis) [M]
Add localized disturbance out of phase per region — periodic pocket resets/blooms, or a slow seasonal
oscillation of the C3 gradient — so regions are moving targets at different phases (temporal niche variation).
Complements Arc B's B3 (un-freeze pockets) and prevents convergence to one global optimum.
- **Accept:** regions cycle out of phase; regional differentiation is SUSTAINED past t20k instead of settling
  to a single global phenotype.

### C5 — Second abiotic axis + signaling niche (NEW, stretch) [M]
If C3 lands, add a second orthogonal gradient (e.g. light, orthogonal to temperature) so the regional trait
space is 2-D → more distinct regional niches. Optionally make **bioluminescence** (already a render feature) a
real signaling channel that pays off only in dark regions, giving a region-specific communication trait.
- **Accept:** ≥3 distinct regional trait-niches coexist; between-region σ rises vs C3 alone.

### C-gate — Regional-diversity CI gate (methodology crosscut) [S]
Extend Arc B's B-gate: `region-probe` asserts the SHIPPED demo sustains between-region σ ≫ within-region +
reproductively-isolated clusters + bounded gene flow on seeds 1–8 after warmup. Closes the loop so a later
tuning change can't silently collapse the regionalization.

---

## Approaches considered (why this ordering)
- **A — Instrument-first, existing-isolation, then new axes (CHOSEN).** C0 measures, C1 banks the proven
  low-risk win, C2/C3 add the two big levers (existing barrier + new gradient), C4/C5 add depth. Every lever is
  gated by C0's differentiation ratio so we never ship a lever we can't measure. Matches the owner's "both
  existing + new axes" and "both phenotype + speciation" calls.
- **B — New-axes-first.** Lead with gradients + disturbance. More novel but skips the proven isolation
  substrate; high risk of thrashing on tuning without a working deme structure underneath. Rejected as lead.
- **C — Barriers-only** (walls + dead-water + assortative mating, no abiotic gradients). Clean allopatric
  speciation but only delivers HALF the target (isolation without regional trait-optima). Rejected — the owner
  wants phenotypic differentiation too.

## Sequencing & dependencies
- **Prereq:** Arc B B1/B2/B5 landed (working ecology + assortative mating). C0 buildable in parallel with Arc B.
- C0 → C1 (down-payment) → {C2 barrier, C3 gradient} → C4 (temporal) → C5 (stretch) → C-gate.
- Each task is one reviewable increment; commit per task as a rewind point. Determinism test green every commit.

## Exit criteria
`region-probe 20000 1-8 5000` on the shipped demo shows, on ≥6/8 seeds: between-region trait σ ≥ ~2× within-
region on diet + at least one abiotic-gated trait; region-distinct diet/forage niches; reproductively-isolated
lineage clusters with cross-region gene-flow share well below the mixed baseline; sustained past t20k. The
browser overlay lets a first-time viewer see the regions and name which one the predators/specialists live in.
The C-gate is green in CI.
