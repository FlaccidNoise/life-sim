/**
 * Simulation configuration. Reproducibility is from `(Config, seed)` — seed is
 * part of Config (spec §5.4). Only M0 fields are present; later milestones add
 * economy/physics/mutation coefficients here.
 */
export interface Config {
  seed: number;
  maxCells: number;
  worldWidth: number;
  worldHeight: number;
  dt: number;
  /** Cell radius in world units. Interaction cutoff / spatial-hash cell size = 2·cellRadius. */
  cellRadius: number;
  /** Soft-repulsion stiffness (force per unit of overlap). */
  repulsion: number;
  /** Velocity retained per tick after drag, in (0, 1]. Lower = more viscous. */
  damping: number;

  // Light field (coarse grid over the world)
  lightGridCols: number;
  lightGridRows: number;
  /** Per-patch light capacity ceiling. */
  lightMax: number;
  /** Number of seeded Gaussian patches for the patchy (non-uniform) init. */
  lightPatchCount: number;
  /** Patch radius in grid cells for the patchy init. */
  lightPatchRadius: number;
  /** Regen rate per tick toward each patch's capacity, in (0, 1]. */
  lightRegen: number;
  /** Toroidal diffusion coefficient per tick, in [0, 0.25] (stability bound: 4·diffuse < 1). */
  lightDiffuse: number;

  // Energy economy (§4.5). Every term is a live knob.
  // NOTE: photosynthesis/digestion/basal all scale with area = radius², so cellRadius
  // (default 6 → area 36) is a hidden economy lever — re-derive balance if it changes.
  /** Photosynthesis gain per (localLight · area) per tick. */
  photoGain: number;
  /** Light consumed per unit of photosynthesis energy gained. */
  photoDepletion: number;
  /** Max energy a digestive cell extracts from one prey per tick. */
  digestRate: number;
  /** Fraction of extracted energy the digester keeps (<1). */
  digestEfficiency: number;
  /** Basal metabolic cost per tick, per unit area (living cells only). */
  basalCost: number;
  /** Energy a MEAT cell loses per tick. */
  meatDecay: number;
  /** Energy a fresh corpse holds, per unit mass (biomass → food). */
  meatEnergyOnDeath: number;

  // Division (clone-only; M6 adds genome/mutation).
  /** Energy at/above which a living cell divides. */
  divideThreshold: number;
  /** Energy spent performing a division. */
  divideCost: number;
  /** Child placement offset from the parent, in world units. */
  divideJitter: number;
  /**
   * Density-dependent PHOTO division cap — a logistic carrying capacity for the plant field.
   * A PHOTO cell whose coarse density-grid bucket already holds more than this many live cells
   * (count recomputed each tick in World.fillDensity, bucket size = crowdGridSize) skips division,
   * so plant density self-limits BELOW the physical close-pack jam instead of growing until cells
   * permanently overlap (the "jiggle"). It caps DENSITY directly without touching any light/energy
   * term, so a thinned patch still regrows at full rate (unlike photoDepletion, which couples the
   * cap to the regrowth clock and collapses the food web). NB: density is measured on a grid, not by
   * cell overlap — a repulsion-relaxed packed field sits at center-distance ≈ 2r with ZERO strict
   * overlaps, so an overlap count cannot see density; the grid can. 65535 (Uint16 max) = OFF: the
   * density pass is skipped entirely and the M2/M3 economy is byte-identical to before.
   */
  crowdDivideCap: number;
  /** Side length (world units) of a density-grid bucket for crowdDivideCap. At the default 32 (~2.7
   *  cell-diameters at cellRadius 6) a bucket holds ~9 cells at full pack, so a cap of 2-3 yields a
   *  ~30-50% de-jammed field. Only used when the cap is on. */
  crowdGridSize: number;
  /** Fraction of initial cells spawned as PHOTO; the rest are DIGESTIVE. */
  initialPhotoFraction: number;

  // Food/smell field (chemotaxis gradient, §4.6). Coarse grid like the light field.
  foodGridCols: number;
  foodGridRows: number;
  /** Smell deposited per edible (PHOTO/MEAT) cell per tick. */
  foodDeposit: number;
  /** Toroidal diffusion coefficient per tick, in [0, 0.25] (4·diffuse < 1). */
  foodDiffuse: number;
  /** Fraction of smell lost per tick, in [0, 1). Keeps the field at equilibrium. */
  foodDecay: number;

  // Predation (ecology pass). A PREDATOR mouth hunts forager organisms via a 2nd "prey-scent" field
  // and drains the prey ORGANISM's energy on contact → prey dies atomically via the existing path.
  // The prey-scent field reuses food's grid + diffuse/decay. 0 = OFF (no predation; M7 economy intact).
  /** Prey-scent emitted per living forager (non-carnivore) flesh cell per tick. 0 = predation OFF. */
  preyDeposit: number;
  /** Max energy a PREDATOR cell drains from one prey cell per tick (the carnivore digestRate). */
  predDigestRate: number;
  /** Fraction of drained prey energy the predator keeps (<1). */
  predDigestEfficiency: number;
  /** Predator strike-reach as a multiple of contact (ri+rj). A gradient-following predator lags
   *  equal-speed mobile prey, so contact-only (1) nets ~zero bites; >1 lets it bite from just beyond
   *  contact. MUST keep predReach·(ri+rj) within the 3×3 hash window (≤ ~1.5·cellSize). Default 1. */
  predReach: number;
  /** Carnivore movement advantage: a multiplier on every MOVER thrust (and its maxThrust ceiling)
   *  for organisms flagged carnivore. >1 lets a predator reposition/close faster than equal-speed
   *  prey — the speed half of the ambush+speed fix (chemotaxis pursuit lags equal-speed prey).
   *  Mass was the wrong lever (lighter cells gave no usable speed gain). Default 1 = no-op (the
   *  M2-M7 economy is byte-identical; only carnivore organisms exist when predation is enabled). */
  carnivoreThrustMult: number;
  /** Predation LATCH hold range, as a multiple of contact (ri+rj). Once a predator strikes a prey
   *  organism it keeps draining THAT organism each tick while any of its flesh cells stays within
   *  predLatchRange·(ri+rj) — converting a fleeting contact into a sustained, completed kill. Should
   *  be ≥ predReach (a wider hold than the strike), but still within the 3×3 hash window (~1.5·cellSize).
   *  0 = latch disabled → predation degenerates to the old single-strike bite. Default 0 (no-op). */
  predLatchRange: number;
  /** Predation tether spring constant — pulls a latched predator toward its prey (the "attachment")
   *  so a mobile prey can't outswim the drain. Scatter spring (mutual), so subject to the same
   *  symplectic-Euler stability ceiling as bonds; keep it modest. 0 = no tether. Default 0 (no-op). */
  predLatchStiffness: number;
  /** Predator-scent emitted per living carnivore flesh cell per tick (mirrors preyDeposit). Foragers
   *  read this field and flee down its gradient. 0 = fleeing OFF (no predScent field work, byte-identical). */
  predScentDeposit: number;
  /** Herbivore flee strength: multiplier on the predator-scent gradient a forager sensor subtracts from
   *  its steering (climbs food, slides away from predators). 0 = no fleeing (no-op, byte-identical). Default 0. */
  predFleeWeight: number;

  // Herbivore graze-latch (mirrors the predator latch for DIGESTIVE/MOTILE mouths grazing PHOTO chains).
  // OFF by default → the legacy instant-drain eating path runs and every output is byte-identical.
  /** Master flag: when true a DIGESTIVE/MOTILE mouth LATCHES onto an edible PHOTO cell and drains it
   *  at grazeRate/tick over many ticks (sustained grazing) instead of the instant FIRST-edible drain.
   *  false = legacy overlap-drain path (byte-identical). Default false; the demo opts in. */
  herbivoreLatch: boolean;
  /** Energy/tick a latched mouth drains from a held PHOTO cell (absolute, NOT area-scaled — like
   *  digestRate). Modest so a chain cell takes MANY ticks to consume and a brief brush no longer kills
   *  it; the cell still only severs at energy≤0 (severEatenChainCells). Anchored bases keep the
   *  baseToughness factor so foragers prefer chain cells. Only used when herbivoreLatch. */
  grazeRate: number;
  /** Graze latch acquire+hold range, as a multiple of contact (ri+rj). A mouth latches the FIRST
   *  edible PHOTO cell within grazeRange·(ri+rj) and keeps draining it until it's gone or out of range.
   *  MUST keep grazeLatchRange·(ri+rj) within the 3×3 hash window (≤ ~1.5·cellSize) or distant cells
   *  are missed. 0 = latch disabled → legacy overlap-drain path. Only used when herbivoreLatch. */
  grazeLatchRange: number;
  /** Graze tether spring constant — pulls a latched forager to its plant cell (the "attachment") so
   *  grazing is sustained. Scatter spring (mutual), subject to the same symplectic-Euler ceiling as
   *  bonds; keep modest so MOVER thrust can overpower it (a forager can still flee). 0 = no tether.
   *  Only used when herbivoreLatch. */
  grazeLatchStiffness: number;
  /** SATIATION: a forager mouth whose own cell energy ≥ grazeSatiation stops eating — it releases any
   *  graze-latch and skips ALL feeding this tick (no graze drain, no legacy overlap drain), so a
   *  well-fed forager roams instead of camping the food-knot. Gated STRICTLY on herbivoreLatch, so
   *  with the latch off satiation never applies and the legacy path is byte-identical. 1e9 (default)
   *  = effectively never satiated → no-op. Only used when herbivoreLatch. */
  grazeSatiation: number;
  /** SATIATED-ROAM: when >0, a non-carnivore MOVER whose cell energy ≥ grazeSatiation has its
   *  food-steering brain OVERRIDDEN by a wander (heading drift of ±exploreWander rad/tick) + a cruise
   *  thrust, so a fed forager swims off to explore instead of oscillating on the food patch (the
   *  "wiggle"). 0 (default) = off → legacy motor path byte-identical. The demo sets it. */
  exploreWander: number;

  // Sensing & movement (§4.4). All live knobs.
  /** Gradient magnitude below which a mover coasts at cruiseThrust instead of steering. */
  senseThreshold: number;
  /** Max radians per tick a mover turns toward the gradient. */
  turnRate: number;
  /** Thrust force per unit gradient magnitude. */
  thrustGain: number;
  /** Thrust force cap. */
  maxThrust: number;
  /** Thrust applied while coasting (no gradient) — deterministic roaming. */
  cruiseThrust: number;
  /** Energy per tick = moveCost · thrust². */
  moveCost: number;
  /** Fraction of initial cells spawned as MOTILE (rest split photo/digestive). */
  initialMotileFraction: number;

  // Neural network (§4.6, §5.2). maxSynapses is a buffer-resize knob (restart-required);
  // overflow policy is refuse-new (addSynapse returns -1). The rest are live knobs.
  /** Synapse pool capacity. Not derivable from maxCells (§5.2); restart-required. */
  maxSynapses: number;
  /** Energy per tick charged to each SENSOR/NEURON/MOVER cell (per-synapse cost deferred). */
  neuralCost: number;
  /** Radians per tick a MOVER turns per unit of turn-neuron activation. */
  turnScale: number;
  /** Thrust force per unit of thrust-neuron activation. */
  thrustScale: number;
  /** Baseline thrust added to thrustScale·activation before clamping (a cruise term). */
  thrustBias: number;

  // Bonds & organisms (§4.4, §4.8, §5.2). maxBonds/maxOrganisms/bondDegreeCap are
  // buffer-resize knobs (restart-required; overflow = refuse-new). The rest are live.
  /** Bond pool capacity. Not derivable from maxCells (§5.2); restart-required. */
  maxBonds: number;
  /** Organism-id capacity (id 0 = free/food). Restart-required. */
  maxOrganisms: number;
  /** Max bonds per cell — sizes the per-cell adjacency. Restart-required. */
  bondDegreeCap: number;
  /** Global bond-spring stiffness scale (× each bond's relative stiffness). */
  bondStiffness: number;
  /** A bond breaks when (dist − restLen)/restLen exceeds this. */
  bondMaxStrain: number;
  /** Per-tick fraction of a bond's energy gap moved to the needier endpoint, (0, 0.5]. */
  transferRate: number;
  /** Fraction of transferred energy that arrives (<1; the rest is lost in transit). */
  transferEfficiency: number;
  /** Short-range adhesion strength (0 = OFF; minimal in M5, genome-gated formation is M6). */
  adhesionStrength: number;
  /** Adhesion range in world units (must be ≤ ~2·hash cellSize for the 3×3 query). */
  adhesionRange: number;
  /** Digestion gain multiplier per bonded DIGESTIVE neighbour (the multicellular payoff). */
  digestClusterBonus: number;
  /** Max split-checks per tick (guards a mass-break tick; excess strained bonds defer). */
  maxSplitChecksPerTick: number;

  // Developmental genome & reproduction (§4.5, §4.7). Caps are restart-ish (size scratch);
  // the rest are live knobs. Mutation rates default 0 (clone-only) for M6 reproduction-first.
  /** Organism aggregate energy at/above which it reproduces asexually (copy+mutate+develop). */
  reproThreshold: number;
  /** Energy the parent organism must retain after provisioning an offspring (clean-abort floor). */
  reproParentFloor: number;
  /** Offspring placement offset from the parent centroid, in world units. */
  offspringOffset: number;
  /** Organism aggregate energy at/below which the WHOLE organism dies (atomic, §4.8). */
  organismDeathFloor: number;
  /** Hard cap on cells one development may produce (bounds runaway rules, §4.7). Sizes scratch. */
  maxCellsPerOrganism: number;
  /** Hard cap on development recursion depth (bounds runaway rules, §4.7). */
  maxRecursionDepth: number;
  /** Max organism births processed per tick (bounds structural-phase work). */
  maxBirthsPerTick: number;
  /** Gaussian σ for numeric gene-param mutation. */
  mutationParamSigma: number;
  /** Per-gene probability of a numeric-param mutation. */
  mutationParamRate: number;
  /** Gaussian σ for connection-weight mutation. */
  mutationWeightSigma: number;
  /** Per-connection-rule probability of a weight mutation. */
  mutationWeightRate: number;
  /** Probability of an add-gene mutation per reproduction. */
  mutationAddGeneRate: number;
  /** Probability of a delete-gene mutation per reproduction. */
  mutationDeleteGeneRate: number;
  /** Probability of a duplicate-gene mutation per reproduction. */
  mutationDuplicateGeneRate: number;
  /** Probability of a rewire-rule-target mutation per reproduction. */
  mutationRewireRate: number;
  /** Probability of a change-cell-type mutation per reproduction. */
  mutationChangeTypeRate: number;
  /** Probability of a duplicate-subgraph mutation per reproduction (the complexity driver). */
  mutationDuplicateSubgraphRate: number;
  /** Probability of assigning a new random sensor channel to a SENSOR gene (discovers env scalars). */
  mutationSensorChannelRate: number;
  /** Ticks between evolution-telemetry samples (read-only; keeps the hot loop alloc-free). */
  metricsEvolutionInterval: number;
  /** Cap on phylogeny LineageLog nodes; dead subtrees are pruned (leaves-up) beyond this. */
  maxLineageNodes: number;

  // ──── Environmental features (M9-early) — all OFF by default ────
  // Every env feature defaults OFF so the default Config is byte-identical to M7.
  // Toggle feature ON by setting its depth / strength / penalty > 0.

  /** Ticks per full day/night cycle. Used by lightMultiplier (pure). */
  dayLength: number;
  /** Day/night swing depth, [0,1]. 0 = OFF (eternal noon). >0 = night dims to 1-depth. */
  dayNightDepth: number;
  /** Ticks per full season cycle. Used by lightMultiplier (pure). */
  seasonLength: number;
  /** Season swing depth, [0,1]. 0 = OFF. >0 = winter dims baseline light. */
  seasonDepth: number;

  /** Number of immovable rock obstacles. 0 = OFF. Requires restart (maxRocks sized). */
  rockCount: number;
  /** Rock radius range min, world units. */
  rockRadiusMin: number;
  /** Rock radius range max, world units. */
  rockRadiusMax: number;
  /** Soft repulsion stiffness against rock overlap. */
  rockRepulsion: number;
  /** RockField grid cell side length, world units. Sizes the uniform grid. */
  rockGridSize: number;
  /** RockField buffer capacity. Restart-required. */
  maxRocks: number;

  /** GlowField grid columns. Sizes the glow field. */
  glowGridCols: number;
  /** GlowField grid rows. */
  glowGridRows: number;
  /** Glow diffusion coefficient, [0,0.25]. */
  glowDiffuse: number;
  /** Glow decay per tick, [0,1). */
  glowDecay: number;
  /** Glow emission gain per effector (glowGain * activation deposited per tick). */
  glowGain: number;
  /** Energy cost per active glow effector per tick. 0 = OFF. */
  glowCost: number;
  /** GlowEffectors buffer capacity. Restart-required. */
  maxGlowEffectors: number;

  /** TemperatureField grid columns. */
  tempGridCols: number;
  /** TemperatureField grid rows. */
  tempGridRows: number;
  /** Number of Gaussian temperature patches seeded. */
  tempPatchCount: number;
  /** Patch radius in grid cells for temperature seeding. */
  tempPatchRadius: number;
  /** Minimum temperature after normalization. */
  tempMin: number;
  /** Maximum temperature after normalization. */
  tempMax: number;
  /** Temperature diffusion coefficient, [0,0.25]. */
  tempDiffuse: number;
  /** Temperature regen rate toward capacity per tick, (0,1]. */
  tempRegen: number;
  /** Low comfort bound for basal metabolism penalty. Temps below this incur coldPenalty. */
  tempComfortLow: number;
  /** High comfort bound for basal metabolism penalty. Temps above this incur heatPenalty. */
  tempComfortHigh: number;
  /** Basal energy multiplier penalty per unit temperature below comfortLow. 0 = OFF. */
  tempColdPenalty: number;
  /** Basal energy multiplier penalty per unit temperature above comfortHigh. 0 = OFF. */
  tempHeatPenalty: number;

  /** ToxinField grid columns. */
  toxinGridCols: number;
  /** ToxinField grid rows. */
  toxinGridRows: number;
  /** Toxin diffusion coefficient, [0,0.25]. */
  toxinDiffuse: number;
  /** Toxin decay per tick, [0,1). */
  toxinDecay: number;
  /** Energy loss per unit toxin concentration per tick. 0 = OFF. */
  toxinDamage: number;
  /** Toxin deposited per tick at a decaying MEAT cell's position. 0 = OFF. */
  toxinDepositOnMeatDecay: number;

  /** CurrentField grid columns. */
  currentGridCols: number;
  /** CurrentField grid rows. */
  currentGridRows: number;
  /** Number of vector-velocity patches seeded. */
  currentPatchCount: number;
  /** Patch radius in grid cells for current seeding. */
  currentPatchRadius: number;
  /** Current drift strength scale. 0 = OFF. */
  currentStrength: number;
  /** Current field evolution (diffusion) rate, [0,0.25]. */
  currentEvolveRate: number;

  // ──── Sessile chain-plants ────
  // A plant is an organism of PHOTO cells: a pinned tough BASE (anchored=1) + a bonded chain. Gated on
  // sessilePlants so the default config keeps the legacy free-clone PHOTO path and every existing test/probe
  // is byte-identical. The live demo (main.ts) sets it true.
  /** Master flag for the sessile chain-plant model. false (default) = legacy free-clone PHOTO; true = plants
   *  grow chains, spore, and are grazed (free-clone PHOTO division is skipped, base cells are pinned/tough). */
  sessilePlants: boolean;
  /** Hard cap on cells per plant (base + chain). */
  plantMaxChain: number;
  /** Min cells before a plant can spore. */
  plantMaturityChain: number;
  /** Organism energy needed to grow one tip cell. */
  plantGrowthThreshold: number;
  /** Energy spent (deducted from the base) per tip cell grown. */
  plantGrowthCost: number;
  /** Chain link rest length in world units (~2.5·cellRadius). */
  plantBondLen: number;
  /** Base energy needed before a mature plant emits a spore. */
  plantSporeThreshold: number;
  /** Energy spent (deducted from the base) per spore emitted. */
  plantSporeCost: number;
  /** Spore ejection speed; with damping=0.5 the total drift ≈ this value in world units (sets dispersal). */
  plantSporeImpulse: number;
  /** Speed below which a drifting spore anchors into a new base. */
  plantSettleSpeed: number;
  /** Plant-base density cap: a slowed free-PHOTO spore does NOT anchor into a new base if its coarse
   *  density-grid bucket already holds more than this many live cells (localDensity, the same field
   *  crowdDivideCap fills via World.fillDensity) — it keeps drifting (settles later or starves), so a
   *  pocket stays discrete patches with open water instead of a packed green wall. localDensity is only
   *  filled when crowdDivideCap is on; when off it's 0 so this cap never triggers (safe). 65535 (Uint16
   *  max, default) = OFF (no-op), mirroring crowdDivideCap. */
  plantBaseDensityCap: number;
  /** Base digest-rate multiplier (anchored base drains baseToughness× as fast as a chain cell). 0.1 ≈ 10× tougher. */
  baseToughness: number;
}

export function defaultConfig(overrides: Partial<Config> = {}): Config {
  return {
    seed: 1,
    maxCells: 100_000,
    // M2: a 2048² world at ~20k seeded cells is the empirically-tuned "breathing"
    // regime — dense enough that digestive cells contact prey passively (no movement
    // until M3), so the 2nd trophic level sustains instead of starving to a PHOTO
    // monoculture (§10 R1). Headless sweep: stable diversity ~0.2–0.3 through 1000+
    // ticks. A sparser 4096² world collapses digestives → monoculture.
    worldWidth: 2048,
    worldHeight: 2048,
    dt: 1,
    cellRadius: 6,
    repulsion: 2,
    damping: 0.5,

    lightGridCols: 32, // 64-unit patches over the 2048 world
    lightGridRows: 32,
    lightMax: 1,
    lightPatchCount: 32,
    lightPatchRadius: 6,
    lightRegen: 0.3, // patches recover fast enough to sustain producers (was 0.05)
    lightDiffuse: 0.1,

    photoGain: 0.05,
    photoDepletion: 0.01, // a photo cell no longer strip-mines its patch in one tick (was 0.2)
    // Digestion tuned for stable coexistence: potent enough that passive contact
    // sustains a digestive, gentle enough not to strip prey and overshoot→crash.
    digestRate: 7,
    digestEfficiency: 0.7,
    basalCost: 0.015, // cheaper upkeep keeps digestives alive between meals (was 0.02)
    meatDecay: 0.5,
    meatEnergyOnDeath: 30,

    divideThreshold: 150, // lower than 200 → faster prey turnover; also damps predator overshoot
    divideCost: 10,
    divideJitter: 6,
    crowdDivideCap: 65535, // OFF by default (Uint16 max) — the M2/M3 economy is unperturbed; the live demo (main.ts) opts in, mirroring the mutation-rate-default-0 pattern
    crowdGridSize: 32, // ~2.7 cell-diameters per density bucket (only used when crowdDivideCap is on)

    // 0.75 = a 3:1 producer:consumer seed (was 0.85); the larger consumer cohort
    // plus the damping above settles into sustained coexistence rather than a
    // predator boom-bust that ends in monoculture.
    initialPhotoFraction: 0.75,

    foodGridCols: 64, // 32-unit patches over the 2048 world — fine enough that a prey cluster stands out above background (32² gave a near-uniform, noisy field in the dense regime)
    foodGridRows: 64,
    foodDeposit: 2,
    foodDiffuse: 0.22, // near the 0.25 stability cap (4·diffuse < 1) → long smell range
    foodDecay: 0.03, // PERSISTENT field (NOT cleared per tick): deposit balanced by decay → equilibrium ∝ local food density, diffused into a smooth long-range gradient

    preyDeposit: 0, // OFF by default (no predation) — the verified M2-M7 economy is byte-identical; the demo opts in
    predDigestRate: 40, // a predator BITE drains flesh fast (vs digestRate 7 for stripping a plant) so a latched predator kills a ~600-energy forager in a sustained chase, not 50 ticks
    predDigestEfficiency: 0.7, // same conversion loss as herbivore digestion
    predReach: 1, // contact-only by default (no-op); the demo raises it so hunters can land bites on mobile prey
    carnivoreThrustMult: 1, // OFF by default (no-op); the ecology config raises it to give predators a speed edge over equal-speed prey
    predLatchRange: 0, // OFF by default (no-op → old single-strike bite); the ecology config enables the latch hold
    predLatchStiffness: 0, // OFF by default (no tether); the ecology config enables the attachment spring
    predScentDeposit: 0, // OFF by default (no fleeing) — predScent field is skipped entirely, byte-identical
    predFleeWeight: 0, // OFF by default (no-op); the ecology config raises it so foragers flee predator scent

    herbivoreLatch: false, // OFF by default → legacy instant-drain eating, byte-identical; the demo sets true
    grazeRate: 1.0, // modest per-tick latch drain; at the r4 economy a lit chain cell refills ~0.78/tick (photoGain·area·light) so net drain is slow → a 10-20 unit cell takes ~15-90 ticks to consume (the OWNER fine-tunes after)
    grazeLatchRange: 1.5, // acquire+hold radius ×(ri+rj); kept ≤1.5 so grazeLatchRange·(ri+rj) stays inside the 3×3 hash window (the predLatchRange 2.5 risks missing out-of-bucket cells)
    grazeLatchStiffness: 0.8, // gentle tether (< predLatchStiffness 1.0, ≪ bond ceiling 2.5) so a fleeing forager's MOVER thrust can overpower it and detach
    grazeSatiation: 1e9, // OFF by default (effectively never satiated → byte-identical legacy); the demo lowers it so a fed forager stops grazing and roams
    exploreWander: 0, // OFF by default (no satiated-roam override → byte-identical motor path); the demo sets it so fed foragers swim off and explore

    senseThreshold: 1e-4,
    turnRate: 0.25, // ~14°/tick — visibly curves toward food without snapping
    // thrustGain·|grad| must land in the PROPORTIONAL band, not pin at maxThrust. Saturation
    // threshold = maxThrust/thrustGain; with 6/3 = 2, thrust ramps proportionally for the
    // typical |grad| ≈ 0.2–2 and only clamps on the steepest gradients (so the live thrustGain
    // knob actually does something). thrustGain 40/maxThrust 5 would be pure bang-bang.
    thrustGain: 3,
    maxThrust: 6, // terminal speed ≈ 6 world-units/tick (damping 0.5)
    cruiseThrust: 0.5, // gentle roam so a motile in a flat zone explores until it picks up a scent
    moveCost: 0.02, // at maxThrust → ~0.72 energy/tick; affordable once it reaches food
    initialMotileFraction: 0.1,

    maxSynapses: 4096, // ample for hand-wired M4 critters; grows in M6 (genome wiring)
    neuralCost: 0.01, // small — a brain isn't free, but the M4 demo critter (provisioned) survives
    turnScale: 0.3, // |a_turn|≤1 → ≤0.3 rad/tick ≈ 17°/tick: curves toward food, no snapping
    thrustScale: 3, // a_thrust∈(−1,1) → ±3, plus bias
    thrustBias: 2, // baseline cruise so the critter keeps moving while searching

    // A forager body develops to 11 bonds (5 division-tree + 6 brace rules), so maxBonds 4096
    // capped the live forager population at exactly floor(4096/11)=372 organisms — a HARD plateau
    // (instantiateBody refuses a birth when bonds.freeCount < body.bonds.length, instantiate.ts).
    // M5's 4096 predates M6/M7 organism reproduction; 16384 lifts the ceiling to ~1489 foragers so
    // the population is ECOLOGY-limited (boom-bust), not buffer-limited (frozen). +405 KiB, ~0/tick
    // (the force/transfer kernels iterate the COMPACT live-bond list, not the pool). Restart-required.
    maxBonds: 16384,
    maxOrganisms: 8192, // stay ahead of maxBonds/11≈1489 foragers; sizes an O(maxOrganisms) per-tick scan (trivial)
    bondDegreeCap: 8, // the braced critter peaks at 6 bonds/cell; headroom for clusters
    bondStiffness: 1.5, // SYMPLECTIC-EULER STABILITY (audit blocker): the bond force's effective spring constant is k_eff = bondStiffness·perBondStiffness (the /d in the kernel cancels the ddx=±d projection — see bond-force.ts). The two-free-mass ceiling for dt=1/damping=0.5/mass=1 is ~3, and a multi-spoke hub like the MOVER is TIGHTER, so keep ≤2.5. k=8 diverges to ~1e162 in a few ticks. Cohesion comes from bracing geometry + low strain tolerance, NOT large k. Live knob (tune via golden-bond / critter-swim within the ceiling).
    bondMaxStrain: 1.0, // break at 100% stretch. M5 RETUNE (Task 14): the bonded hand-wired critter is a SOFT body — its single MOVER yanks 6 soft spokes (k_eff=bondStiffness·1=1.5) which transiently stretch to ~2× rest under thrust+turn. At the original 0.6 the spokes snapped within ~8 ticks, fragmenting the body so it could not chemotax (critter-swim closed only ~7 units, not ≥150). At 1.0 the spokes flex without breaking and the critter homes in robustly across start headings (closes ~250-290 units; verified 5/5). NOT a stiffness change — raising bondStiffness toward the ceiling made it WORSE (the orbital limit cycle tightens); cohesion here comes from strain tolerance, not k. Still snaps under a genuine hard pull (golden-bond overrides to 0.2). Live knob.
    transferRate: 0.1, // gentle diffusion; well under the 0.5 oscillation bound
    transferEfficiency: 0.95, // 5% lost per hop — a small cost to sharing
    adhesionStrength: 0, // OFF by default: the verified M2/M3 ecosystem must be unperturbed
    adhesionRange: 18, // 3·cellRadius — inside the spatial-hash 3×3 neighbourhood
    digestClusterBonus: 0.5, // a fully-bonded digestive cluster out-harvests lone cells (payoff); 0 for free (organismId 0) cells
    maxSplitChecksPerTick: 64,

    // M6 developmental genome. reproThreshold is reachable by a small autotroph body
    // (a few PHOTO cells photosynthesising + sharing energy); the parent floor keeps it
    // alive after provisioning. organismDeathFloor 0 = die when the body's total energy
    // is spent. Caps bound runaway recursion well above the critter's 7 cells.
    reproThreshold: 600,
    reproParentFloor: 200,
    offspringOffset: 40,
    organismDeathFloor: 0,
    maxCellsPerOrganism: 256,
    maxRecursionDepth: 16,
    maxBirthsPerTick: 64,
    mutationParamSigma: 0.1,
    mutationParamRate: 0, // OFF by default (clone-only) — M6 is reproduction-first; M7 turns these up
    mutationWeightSigma: 0.1,
    mutationWeightRate: 0,
    mutationAddGeneRate: 0,
    mutationDeleteGeneRate: 0,
    mutationDuplicateGeneRate: 0,
    mutationRewireRate: 0,
    mutationChangeTypeRate: 0,
    mutationDuplicateSubgraphRate: 0,
    mutationSensorChannelRate: 0,
    metricsEvolutionInterval: 16,
    maxLineageNodes: 4000,

    // ──── Environmental features (M9-early) — all OFF by default ────
    // OFF = byte-identical to M7. Toggle feature ON by setting depth/strength/penalty > 0.
    dayLength: 600,
    dayNightDepth: 0,
    seasonLength: 12000,
    seasonDepth: 0,

    rockCount: 0,
    rockRadiusMin: 8,
    rockRadiusMax: 24,
    rockRepulsion: 4,
    rockGridSize: 64,
    maxRocks: 2048,

    glowGridCols: 32,
    glowGridRows: 32,
    glowDiffuse: 0.2,
    glowDecay: 0.05,
    glowGain: 1,
    glowCost: 0.05,
    maxGlowEffectors: 4096,

    tempGridCols: 32,
    tempGridRows: 32,
    tempPatchCount: 16,
    tempPatchRadius: 6,
    tempMin: 0,
    tempMax: 1,
    tempDiffuse: 0.1,
    tempRegen: 0.3,
    tempComfortLow: 0.3,
    tempComfortHigh: 0.7,
    tempColdPenalty: 0,
    tempHeatPenalty: 0,

    toxinGridCols: 64,
    toxinGridRows: 64,
    toxinDiffuse: 0.2,
    toxinDecay: 0.03,
    toxinDamage: 0,
    toxinDepositOnMeatDecay: 0,

    currentGridCols: 32,
    currentGridRows: 32,
    currentPatchCount: 16,
    currentPatchRadius: 6,
    currentStrength: 0,
    currentEvolveRate: 0.05,

    // ──── Sessile chain-plants ────
    // OFF by default so the legacy free-clone PHOTO path runs and every existing test/probe is byte-identical.
    // Energy knobs below are scaled for the library default cellRadius=6 (area 36); the r4 demo (area 16)
    // overrides them ~2.25× smaller. baseToughness/chain-counts/settleSpeed/impulse are geometry/velocity, not energy.
    sessilePlants: false,
    plantMaxChain: 7,
    plantMaturityChain: 7,
    plantGrowthThreshold: 27, // organism energy gate to grow a tip cell (r6; ~12 at the r4 demo)
    plantGrowthCost: 18, // deducted from the base per tip cell (threshold > cost keeps a survival buffer)
    plantBondLen: 15, // 2.5·cellRadius at r6 (10 at the r4 demo)
    plantSporeThreshold: 135, // base energy gate to spore (r6; ~60 at the r4 demo)
    plantSporeCost: 90, // deducted from the base per spore (threshold > cost so sporing never self-starves the base)
    plantSporeImpulse: 25, // total drift ≈ impulse world-units at damping 0.5 (a few cell radii of dispersal)
    plantSettleSpeed: 0.5, // a spore anchors when speed < this (anchors ~6 ticks after a 25-impulse launch)
    plantBaseDensityCap: 65535, // OFF by default (Uint16 max → no-op, mirrors crowdDivideCap); the demo lowers it to rein plant-base overgrowth into discrete patches
    baseToughness: 0.1, // a base drains ~10× slower than a chain cell — evolvably killable, not invulnerable

    ...overrides,
  };
}

export function serializeConfig(config: Config): string {
  return JSON.stringify(config);
}

export function deserializeConfig(json: string): Config {
  const parsed = JSON.parse(json) as Partial<Config>;
  return defaultConfig(parsed);
}
