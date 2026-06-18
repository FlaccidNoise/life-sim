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
