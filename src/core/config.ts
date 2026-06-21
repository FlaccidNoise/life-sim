/**
 * Simulation configuration — the SINGLE source of truth. Per the rebuild spec's safeguard #2
 * ("one config, one scale"), DEMO_CONFIG is used by the browser demo, the headless harness, AND every
 * test. Demo = validated = tested. There is deliberately no separate "test scale" — validation that
 * doesn't run at the watched scale doesn't count.
 *
 * Phase 0 fields only. Each later phase ADDS its knobs here (and every new system ships with an
 * off-switch knob, enforced by the ablation gate).
 */
export interface Config {
  /** Seed for the single RNG. Part of the reproducibility key (Config, seed). */
  seed: number;
  /** Toroidal world dimensions in world units. ONE fixed scale (safeguard #2). */
  worldWidth: number;
  worldHeight: number;
  /** Fixed timestep. All rates are per-tick. */
  dt: number;
  /** Organism store capacity (restart-required buffer size). */
  maxOrganisms: number;
  /** Organisms seeded at world creation. A live knob — crank it to preview a fuller world. */
  initialPopulation: number;
  /** Initial speed (world units/tick) given to each seeded organism in a random direction. */
  driftSpeed: number;

  // ── Phase 1: physics ───────────────────────────────────────────────────────────────────────────
  /** Organism radius in world units. Collision cutoff = 2·cellRadius; also the spatial-hash cell size. */
  cellRadius: number;
  /** Soft-repulsion stiffness: force per unit of overlap when two organisms interpenetrate. */
  repulsion: number;
  /** Velocity retained per tick after drag, in (0, 1]. Lower = more viscous (motion bleeds off faster). */
  damping: number;
  /** Stability ceiling: max speed (world units/tick) after integration. Caps repulsion blow-ups. */
  maxSpeed: number;
  /**
   * Off-switch for the stability clamp (the Phase-1 ablation knob). true = clamp speed to maxSpeed;
   * false = no clamp, so a stiff repulsion can diverge — used to PROVE the clamp earns its keep.
   */
  stabilityClamp: boolean;

  // ── Phase 2: economy ─────────────────────────────────────────────────────────────────────────────
  /** Food-field grid resolution (a coarse logistic biomass field, NOT individual entities). */
  foodCols: number;
  foodRows: number;
  /** Per-cell biomass carrying capacity K. Eat income is drawn from the cell an organism sits in. */
  foodCap: number;
  /** Logistic regrowth rate r per tick: B += r·B·(1−B/K). 0 = food OFF (the ablation → extinction). */
  foodRegen: number;
  /** Inter-cell biomass diffusion per tick, [0,0.25]. Reseeds grazed-empty cells from neighbors so the
   *  field has no permanent B=0 absorbing state (the producer-extinction fix). */
  foodDiffuse: number;
  /** Initial fill as a fraction of foodCap, [0,1]. */
  foodInit: number;
  /** Archipelago: number of Gaussian FERTILITY POCKETS. 0 = uniform full world (no pockets). */
  foodPatchCount: number;
  /** Pocket radius in food-grid cells. */
  foodPatchRadius: number;
  /** Fertility of the dead water between pockets, [0,1] (small → near-dead gaps that isolate pockets). */
  foodBaseFertility: number;
  /** Max biomass an organism ingests per tick from its current cell (→ energy 1:1). */
  eatRate: number;
  /** Basal metabolic cost per tick (the starvation clock — high enough that not-eating kills). */
  basalCost: number;
  /** Movement cost per tick = moveCost · speed² (makes fast blind search expensive → senses pay off). */
  moveCost: number;
  /** FOUNDER CENTER for the per-creature reproThreshold gene: the survival↔reproductive boundary (the
   *  learn-gate floor; where a parent lands after breeding). Each creature evolves its own. */
  reproThreshold: number;
  /** FOUNDER CENTER for the per-creature satiatedThreshold gene: the "full" bar — stop eating (leave
   *  biomass), peak learning, and BREED ("breed at the top"). Each creature evolves its own (r/K). */
  satiatedThreshold: number;
  /** Reproduction OVERHEAD: energy lost per birth BEYOND what the child is provisioned with. The parent
   *  pays (child's birthEnergy gene + reproOverhead), so high-investment offspring genuinely cost more
   *  (energy-conserving — no free energy from a high birthEnergy gene). */
  reproOverhead: number;
  /** FOUNDER CENTER for the per-creature birthEnergy gene: how much energy each offspring starts with
   *  (and seeded founders start with). Low = many cheap young (r); high = few well-provisioned (K). */
  birthEnergy: number;
  /** Offspring placement offset from the parent, in world units. */
  offspringOffset: number;

  // ── Steering + evolution (per-creature heritable brain) ─────────────────────────────────────────
  /** Gradient sample half-step in world units (central difference of the food field). */
  senseStep: number;
  /** Max heading change per tick (rad) — a physical limit on the brain's turn output. */
  maxTurn: number;
  /** Thrust force ceiling — a physical limit on the brain's thrust output. */
  maxThrust: number;

  // ── Evolvable scalar genes (per-creature, heritable, mutated at birth) ───────────────────────────
  // 15 scalar genes (see genome.ScalarGene). Each config value is the FOUNDER CENTER + cost baseline;
  // founders seed around it (± founderSigma·center) and offspring mutate (± mutationSigma·center).
  // NINE are "more-is-costly" (value ABOVE center adds basal upkeep via geneUpkeep, weighted by the cost
  // coeffs below): maxSpeed, eatRate, senseStep, maxTurn, maxThrust, damage, visionRange, visionFov,
  // visionAcuity. The rest are costKey null: metabolicEfficiency (its cost is the multiplicative
  // basal×e tradeoff), the three life-history genes + diet (cost is the strategy/graze↔hunt tradeoff),
  // and size (no benefit yet → costed when big-eats-small lands).
  /** Metabolic-efficiency gene CENTER (=1). A self-balancing tradeoff: basal cost ×= e and thrust ×= e,
   *  so a thrifty (low-e) metabolism is cheap to run but weak; a costly (high-e) one is strong. */
  metabolicEfficiency: number;
  /** Basal upkeep per unit of maxSpeed gene above its center (a faster body costs more). */
  maxSpeedCost: number;
  /** Basal upkeep per unit of eatRate gene above its center (a hungrier gut costs more). */
  eatRateCost: number;
  /** Basal upkeep per unit of senseStep (sense-range) gene above its center (seeing further costs more). */
  senseRangeCost: number;
  /** Basal upkeep per unit of maxTurn gene above its center (sharper turning costs more). */
  maxTurnCost: number;
  /** Basal upkeep per unit of maxThrust gene above its center (more push costs more). */
  maxThrustCost: number;

  // ── Trophic / predation ──────────────────────────────────────────────────────────────────────────
  /** DIET gene center — ONLY the mutation-step reference (founders are seeded bimodally, not here). */
  diet: number;
  /** DAMAGE gene center — bite-strength founder center + the upkeep baseline (teeth above this cost). */
  damage: number;
  /** Basal upkeep per unit of DAMAGE gene above its center (stronger teeth cost more to maintain). */
  damageCost: number;
  /** Fraction of FOUNDERS seeded as predators (diet ≈ 0.9) so the hunter niche is expressed from t0. */
  predatorFraction: number;
  /** Bite reach in world units: a predator drains the nearest creature within this radius. */
  biteRange: number;
  /** Cannibalism switch (ablation knob). true = a predator bites the nearest creature of ANY kind
   *  (current behavior). false = it only bites creatures meaningfully LOWER on the diet axis than
   *  itself (prey, not peers) — so similar-diet "guild-mates" are spared, preventing predator-on-
   *  predator drain. Kinship here is the diet gap (the same signal sight uses), not genetic lineage. */
  cannibalism: boolean;

  // ── Vision genes (founder centers + costs; sight is metabolically expensive — no free eyes) ────────
  /** VISION_RANGE gene center — how far a creature sees other creatures (world units). */
  visionRange: number;
  /** VISION_FOV gene center — half-angle of the vision cone (radians). */
  visionFov: number;
  /** VISION_ACUITY gene center — sight clarity (signal-strength multiplier into the brain). */
  visionAcuity: number;
  /** Basal upkeep per unit of VISION_RANGE above its center (seeing farther costs more). */
  visionRangeCost: number;
  /** Basal upkeep per radian of VISION_FOV above its center (wider all-around vision costs more). */
  visionFovCost: number;
  /** Basal upkeep per unit of VISION_ACUITY above its center (sharper vision costs more). */
  visionAcuityCost: number;

  /** Gaussian σ spread of founder brain weights around the seed brain (initial behavioral variation). */
  founderSigma: number;
  /** Gaussian σ of per-weight brain mutation at birth (the evolutionary step size; live knob). */
  mutationSigma: number;
  /** Gaussian σ of hue-gene drift at birth (how fast lineage colors diverge). */
  hueMutationSigma: number;

  // ── Baldwin within-life learning (energy-gated Hebbian consolidation + eligibility traces) ────────
  /** Master off-switch for plasticity. false = the runtime brain never drifts from the genome (pure
   *  instinct) — the ablation that proves learning earns its keep without breaking the alive-guardrail. */
  learningEnabled: boolean;
  /** PEAK plasticity step size (applied when fully satiated). The EFFECTIVE rate is energy-gated:
   *  it ramps 0 (at reproThreshold) → learningRate (at satiatedThreshold), so a creature only
   *  consolidates what it's doing when it's well-fed. NOT a live knob — learning emerges from energy. */
  learningRate: number;
  /** Eligibility-trace blend λ ∈ (0,1]: elig = (1−λ)·elig + λ·(pre·post). Lower = longer memory of
   *  which synapses were active, bridging the decision→reward delay. */
  eligLambda: number;
  /** Per-tick decay of the learned DEVIATION back toward the genome instinct (the stability leg:
   *  without reinforcement the runtime brain relaxes to instinct; it never corrupts the genome). */
  weightDecay: number;
  /** Runtime-weight clamp ±W: learned weights are bounded to [−weightClamp, +weightClamp]. */
  weightClamp: number;
}

export function defaultConfig(overrides: Partial<Config> = {}): Config {
  return {
    seed: 1,
    // The archipelago: a big 8192² world of fertility POCKETS (rich food islands) separated by
    // near-dead water, so isolated communities form and can evolve down different tracks.
    worldWidth: 8192,
    worldHeight: 8192,
    dt: 1,
    maxOrganisms: 32768,
    // Seeded into the pockets (rejection-sampled onto fertile spots), spread across the islands.
    // Modest count so the small pockets aren't overgrazed at t0.
    initialPopulation: 90,
    driftSpeed: 1.5,
    // Physics defaults: light drag so seeded motion is visibly sustained (organisms glide + wrap),
    // soft repulsion that spreads crowding, a speed ceiling that bounds any repulsion spike.
    cellRadius: 6,
    repulsion: 2,
    // Moderate drag now that organisms are self-propelled (Phase 3): thrust sets terminal speed
    // (v* ≈ thrust·d/(1−d)) so the brain controls movement, instead of relying on ballistic drift.
    damping: 0.9,
    maxSpeed: 6,
    stabilityClamp: true,

    // Economy (arithmetic per the spec §4.4): a fed organism nets ≈ +2/tick and reaches the repro bar
    // in a few ticks; an unfed one nets ≈ −0.6/tick and starves on a clock. Tuned headlessly so the
    // population sustains BOTH births and deaths (the Phase-2 anti-"0 births" gate).
    foodCols: 128, // 64-unit cells over the 8192 world
    foodRows: 128,
    foodCap: 14, // rich pockets so a SMALL island still sustains a breeding community
    foodRegen: 0.15, // fast regrowth → small pockets recover from grazing (isolated → must self-heal)
    foodDiffuse: 0.03, // low so pockets don't bleed into the gaps (islands stay distinct)
    foodInit: 1, // pockets start full
    foodPatchCount: 14, // distinct island communities scattered across the archipelago
    foodPatchRadius: 5, // ~320-unit pockets (5 cells × 64 units) — small + separate, not merged
    foodBaseFertility: 0, // truly dead water between pockets → real isolation, distinct islands
    eatRate: 2,
    basalCost: 0.3, // lowered a touch so creatures live a bit longer → occasional cross-gap drift/breeding
    moveCost: 0.01,
    // Slow breeding (long generation vs the starvation clock) damps the boom-bust toward a sustained,
    // turning-over population instead of an overshoot-to-extinction. Tuned headlessly.
    reproThreshold: 60, // gene center: survival↔reproductive boundary
    satiatedThreshold: 100, // gene center: breed-at-the-top trigger + eat-stop + peak learning
    reproOverhead: 15, // energy lost per birth beyond provisioning (parent pays birthEnergy + this)
    birthEnergy: 25, // gene center: offspring provisioning
    offspringOffset: 8,

    // Steering + evolution. Founders seeded near a chemotaxis brain (genome.ts FOUNDER_BRAIN) with a
    // spread; offspring mutate. senseStep ≈ one food cell (64u) so the gradient reads across cells.
    senseStep: 64,
    maxTurn: 0.35,
    maxThrust: 1,
    // Evolvable scalar genes. Founders seed at the centers above (maxSpeed/eatRate/senseStep/cellRadius/
    // maxTurn/maxThrust) + this efficiency center, so the t0 world matches the pre-gene tuning; cost
    // coeffs (live levers) are modest so selection shapes the distribution rather than slamming it.
    metabolicEfficiency: 1,
    maxSpeedCost: 0.05,
    eatRateCost: 0.15,
    senseRangeCost: 0.004,
    maxTurnCost: 0.4,
    maxThrustCost: 0.2,
    // Trophic / predation. ~15% of founders start as hunters (diet≈0.9); damage above its center costs
    // upkeep so predators evolve teeth at a price; bite reach ≈ 2·cellRadius (the collision cutoff).
    diet: 0.5,
    damage: 8, // bite-strength center (founders carry it; predators use it ×diet)
    damageCost: 0.05, // upkeep per damage above center
    predatorFraction: 0.15,
    biteRange: 12,
    cannibalism: true, // current behavior (bite anyone nearest); flip off to spare same-diet peers
    // Vision. Founders seed with modest eyes (range ~14, ~57° half-cone, acuity 1); all costed so
    // predators evolve long focused sight and prey evolve wide all-around sight, each paying for it.
    visionRange: 14,
    visionFov: 1.0,
    visionAcuity: 1,
    visionRangeCost: 0.02,
    visionFovCost: 0.15,
    visionAcuityCost: 0.2,
    // NB pre-sight, predators hunt by PROXIMITY only — the encounter rate is too low for hunting to
    // pay, so the predator trait does not persist yet (it needs the sight slice to actively target
    // prey). The mechanic + genes + color are in place; sight activates it.
    founderSigma: 0.3,
    mutationSigma: 0.05,
    hueMutationSigma: 0.02,

    // Baldwin learning ON by default. Energy-gated: a creature only consolidates its behavior when
    // well-fed (peak at satiation). Decay-to-instinct + clamp keep drift bounded so it never
    // destabilises survival (the alive-guardrail).
    learningEnabled: true,
    learningRate: 0.02,
    eligLambda: 0.2,
    weightDecay: 0.002,
    weightClamp: 4,
    ...overrides,
  };
}

/** The one config the demo, harness, and tests all use. */
export const DEMO_CONFIG: Config = defaultConfig();
