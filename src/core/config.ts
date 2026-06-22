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
  /** Number of independent food channels (lever B, niche partitioning). 1 = a single biomass field,
   *  byte-identical to a one-resource world (the ablation OFF state). 2 = a second logistic channel B2
   *  sharing the same fertility map; each cell's cap is split A/B so total biomass is unchanged. This is
   *  the gate for the FORAGE_PREF gene: with 1, that gene is never drawn from RNG (hash unchanged). */
  foodChannels: number;
  /** Channel-B's share of each cell's carrying capacity, [0,1] (channel A gets 1−this). Only used when
   *  foodChannels===2. 0.5 = symmetric two-resource cell; lower makes B scarcer (sharpens specialization). */
  foodChannelRatio: number;
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
  /** Basal upkeep per unit of SIZE gene above its center — now that size confers a predation refuge +
   *  bigger bite, it earns a cost (a big body is expensive to run), so size is a tradeoff not free drift. */
  sizeCost: number;
  /** SIZE physical couplings (all relative to cellRadius as the reference size; exp 0 = coupling OFF).
   *  Together they make a big body a slow, expensive-to-move tank with deep reserves — a real strategy. */
  /** Speed-ceiling tax: a creature's max-speed gene is scaled by (cellRadius/size)^sizeSpeedExp, so
   *  bigger = slower (a big body can't move as fast). */
  sizeSpeedExp: number;
  /** Move-cost tax: the speed² movement cost is scaled by (size/cellRadius)^sizeMoveCostExp, so bigger =
   *  costlier to move (mass costs energy to push). */
  sizeMoveCostExp: number;
  /** Energy-store boon: the satiated "full" bar is scaled by (size/cellRadius)^sizeStoreExp, so bigger =
   *  a deeper energy reserve (fills richer in good times, rides out lean stretches — helps big predators). */
  sizeStoreExp: number;

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
  /** Big-eats-small gate: a predator can only bite prey at least this many times SMALLER than itself
   *  (its size ≥ prey size × this). >1 makes body size a real predation axis — big bodies are a refuge
   *  from small hunters, so a size-structured food web (small prey ↔ mid hunters ↔ big apex) can form. */
  huntSizeRatio: number;
  /** Predation energy multiplier: a predator absorbs (drain × this) from a bite. >1 makes meat a big
   *  payoff vs grazing (deliberately not energy-conserving) — the incentive to hunt instead of sit.
   *  NB: too high is an energy printer → runaway to the population cap; keep modest. */
  predationGain: number;
  /** Exponent on the herbivory falloff: plant income ∝ (1−diet)^this. 1 = linear (predators keep a real
   *  plant fallback → FACULTATIVE, viable at low density); higher pushes toward OBLIGATE predation (which
   *  starves at this world's sparse encounter rate). */
  herbivoryExp: number;
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

  // ── Social: shelter-seeking ────────────────────────────────────────────────────────────────────
  /** SHELTER_DRIVE gene center — how strongly a creature is pulled toward LARGER, similar-diet creatures
   *  (folded into the sight vector). Center > 0 so the center-relative mutation isn't frozen. */
  shelterDrive: number;
  /** Basal upkeep per unit of SHELTER_DRIVE above its center (a strong herding instinct costs more). */
  shelterDriveCost: number;
  /** Global multiplier on the shelter term (ablation knob + live tuning). 0 = shelter OFF (proves it
   *  earns its keep); 1 = full strength. Does not touch the gene, so the gene still evolves under it. */
  shelterGain: number;
  /** COHESION_DRIVE gene center — how strongly a creature is pulled toward SIMILAR-HUE (lineage)
   *  creatures (folded into the sight vector → visible schools). Center > 0 so mutation isn't frozen. */
  cohesionDrive: number;
  /** Basal upkeep per unit of COHESION_DRIVE above its center (a strong schooling instinct costs more). */
  cohesionDriveCost: number;
  /** Global multiplier on the cohesion term (ablation knob + live tuning). 0 = schooling OFF. */
  cohesionGain: number;
  /** Schooling SELECTIVITY: false (default) = pull only toward SIMILAR-hue (lineage) neighbors, so
   *  schools are kin-clumps; true = hue-blind, pull toward ALL neighbors equally, so genetically diverse
   *  prey can herd into one dense school. An off-by-default behavior knob (byte-identical when false). */
  cohesionHueBlind: boolean;
  /** FORAGE_PREF gene founder CENTER [0,1] (lever B): 0 = channel-A specialist … 1 = channel-B specialist,
   *  0.5 = generalist. ONLY drawn from RNG (seed + mutation) when foodChannels===2; with one channel the
   *  gene is pinned here with no draw, so the determinism stream is byte-identical. 0.5 keeps founders
   *  unbiased so SELECTION drives the niche split rather than a seeded head start. */
  foragePref: number;

  /** Gaussian σ spread of founder brain weights around the seed brain (initial behavioral variation). */
  founderSigma: number;
  /** Founder SIZE-variety spread: founders' SIZE gene is seeded UNIFORMLY in cellRadius·[1−s, 1+s]
   *  (clamped to the gene range), so distinct body-size niches exist from t0 instead of all clustering
   *  at the center — raw material for the size-predation + shelter engines. 0 = all at center (ablation).
   *  NB this is wider AND flatter than founderSigma's gaussian, which still peaks at the center. */
  founderSizeSpread: number;
  /** Gaussian σ of per-weight brain mutation at birth (the evolutionary step size; live knob). */
  mutationSigma: number;
  /** Gaussian σ of hue-gene drift at birth (how fast lineage colors diverge). */
  hueMutationSigma: number;

  // ── Baldwin within-life learning (energy-gated Hebbian consolidation + eligibility traces) ────────
  /** Master off-switch for plasticity. false = the runtime brain never drifts from the genome (pure
   *  instinct) — the ablation that proves learning earns its keep without breaking the alive-guardrail. */
  learningEnabled: boolean;
  /** Plasticity step size for the reward-modulated update: Δw = learningRate · reward · eligibility,
   *  where reward = this tick's net energy change. Behavior that EARNED energy (foraging that fed,
   *  hunting that landed) is reinforced; behavior during a loss is weakened. */
  learningRate: number;
  /** Clamp on the learning reward (|Δenergy|) so a single big event (e.g. a fat predation tick) can't
   *  produce a runaway weight jump. */
  learnRewardClamp: number;
  /** Eligibility-trace blend λ ∈ (0,1]: elig = (1−λ)·elig + λ·(pre·post). Lower = longer memory of
   *  which synapses were active, bridging the decision→reward delay. */
  eligLambda: number;
  /** Per-tick decay of the learned DEVIATION back toward the genome instinct (the stability leg:
   *  without reinforcement the runtime brain relaxes to instinct; it never corrupts the genome). */
  weightDecay: number;
  /** Max learned DEVIATION from instinct per weight: |learnedBrain − genome| ≤ this. Bounding the
   *  deviation (not the absolute weight) keeps the runtime brain a small refinement of the heritable
   *  instinct — it can't run off to a saturated controller. The bias synapses are excluded from
   *  plasticity entirely (their constant input makes Hebbian learning a positive-feedback runaway). */
  maxLearnDeviation: number;

  // ── Steering output shaping (ablation knob; OFF by default = byte-identical to the hard clamp) ─────
  /** Motor-output saturation mode. false = HARD clamp turn/thrust to the per-creature MAX_TURN/MAX_THRUST
   *  genes (bang-bang: a strong signal snaps to the limit → the visible spin/vibrate pathology when a
   *  saturated controller pins the rudder). true = smooth tanh squash: out = max·tanh(raw/max), so small
   *  signals steer ~linearly and large ones ease into the limit (graded, legible motion). It shapes ONLY
   *  the applied motor output — the eligibility trace still uses the pre-shaping raw signal, so within-life
   *  learning is unchanged. OFF by default so the determinism hash is byte-identical until you opt in. */
  motorSquash: boolean;

  // ── Observation hooks (optional; OFF by default — pure instrumentation, never affects the sim) ────
  /** Fired once per successful birth inside reproduce(), in ascending parent-slot order, BEFORE the
   *  tick counter advances. Read-only by contract: it must not touch the store, RNG, or iteration —
   *  it exists so a harness can attribute child→parent lineage without an energy-trace heuristic.
   *  Undefined in defaultConfig, so production runs and the determinism hash are unaffected. */
  onBirth?: (parentSlot: number, parentGen: number, childSlot: number, childGen: number) => void;
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
    foodCap: 40, // rich pockets (raised 20→40): the prey base was food-STARVED — 70-84% of creatures sat
    // below their repro bar, so there was no energy headroom to fund a predator layer and predEncounter
    // stayed 0.000 (predators never landed a bite). Doubling the cap deepens each pocket's prey base; in
    // the seed 1/2/5 head-to-head it revived predation on 3/3 seeds (predEnc up to 0.045) and ~3×'d pop.
    foodRegen: 0.06, // faster regrowth (0.04→0.06): pairs with the deeper cap so grazed pockets refill
    // before the prey base bottoms out — sustains the deeper population rather than starving it back down.
    // Still leaves a graze-bare lag (cells don't refill instantly), so MIGRATION is still rewarded.
    foodDiffuse: 0.03, // low so pockets don't bleed into the gaps (islands stay distinct)
    foodInit: 1, // pockets start full
    foodPatchCount: 14, // distinct island communities scattered across the archipelago
    foodPatchRadius: 5, // ~320-unit pockets (5 cells × 64 units) — small + separate, not merged
    foodBaseFertility: 0, // truly dead water between pockets → real isolation, distinct islands
    foodChannels: 1, // single resource (byte-identical OFF state); 2 = niche-partitioning second channel
    foodChannelRatio: 0.5, // symmetric A/B split when channels===2 (total per-cell cap unchanged)
    eatRate: 2,
    basalCost: 0.12, // low starvation clock → longer lives + a SOFTER early crash, so predator founders
    // survive the sparse phase long enough to reach the prey boom (predator-viability fix; was 0.2)
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
    sizeCost: 0.015, // low upkeep → wider SIZE variance (probe szSd↑); still bounds the size arms race
    sizeSpeedExp: 0.2, // bigger = slower: gentle tax on the speed ceiling (size 2× ref → ~0.87×). A
    // GENTLE setting is deliberate: at 0.5 the slowdown anti-selects big bodies so hard that size
    // variety collapses; 0.2 is visible in motion yet lets big-body lineages persist (sweep-tuned).
    sizeMoveCostExp: 0, // bigger = costlier-to-move coupling DISABLED (live lever, raise to re-enable).
    // The move-cost penalty taxes the very chasing that predation depends on, so ANY positive value
    // taxed hunters into extinction on every probe seed — kept as a 0-default knob, not a behavior.
    sizeStoreExp: 1, // bigger = proportionally deeper energy reserve (size 2× ref → 2× the "full" bar).
    // The size BENEFIT: a deep tank rides out sparse pockets, which is what makes big bodies (and the
    // big-bodied predators that need them) viable — it DOUBLED surviving predators in the sweep.
    // Trophic / predation. ~15% of founders start as hunters (diet≈0.9); damage above its center costs
    // upkeep so predators evolve teeth at a price; bite reach ≈ 2·cellRadius (the collision cutoff).
    diet: 0.5,
    damage: 12, // bite-strength center: a kill drains a big chunk (lucrative hunting, energy-CONSERVING)
    damageCost: 0.05, // upkeep per damage above center
    predatorFraction: 0.15,
    biteRange: 16, // reach to land a sight-guided kill (hunt now scans a neighborhood sized to this)
    huntSizeRatio: 1.15, // must be ≥15% bigger than prey to eat it → size is a refuge + a weapon
    predationGain: 1.8, // meat is concentrated: a bite yields 1.8× the drain, so even RARE kills pay
    // through sparse stretches → carnivory resists diet-dilution and predators persist (was 1, which left
    // hunting too marginal at this encounter rate; combined with basalCost 0.12 it rescues 2/3 probe seeds)
    herbivoryExp: 1.3, // predators get little from algae → lean on HUNTING (max viable on seeds 1/2;
    // obligate carnivory, exp≥1.6, starves predators at this encounter rate — proven by probe)
    cannibalism: true, // current behavior (bite anyone nearest); flip off to spare same-diet peers
    // Vision. Founders seed with modest eyes (range ~14, ~57° half-cone, acuity 1); all costed so
    // predators evolve long focused sight and prey evolve wide all-around sight, each paying for it.
    visionRange: 140, // long-sight experiment: ~10× the old 14 so creatures see across the sparse world
    visionFov: 1.0,
    visionAcuity: 1,
    visionRangeCost: 0.002, // lowered 10× so the now-large range isn't instantly taxed away by upkeep
    visionFovCost: 0.15,
    visionAcuityCost: 0.2,
    // Shelter-seeking. Center 0.06 so the term (gene × sizeDiff[≤14] × dietSim[≤1]) is ~0.8 at founder
    // strength — comparable to the chase/flee appeal (≤1), so the behavior is visible but not dominant.
    // Modest cost so selection shapes it; gain 1 = on (ablate with 0).
    shelterDrive: 0.06,
    shelterDriveCost: 0.5,
    shelterGain: 1,
    // Schooling. Center 0.15 — a GENTLE same-hue pull: stronger (0.3+) clumps creatures so tight they
    // overgraze and crash carrying capacity (probe: pop −41% @0.3); 0.15 costs only ~11% pop on seed 1
    // and HELPS on seed 5 (loosely-schooling prey are easier to hunt → predators thrive). Modest cost;
    // gain 1 = on (ablate with 0). NB the term is gene × hueSim[≤1], bounded below the flee appeal.
    cohesionDrive: 0.15,
    cohesionDriveCost: 0.1,
    cohesionGain: 1,
    cohesionHueBlind: false,
    foragePref: 0.5, // FORAGE_PREF gene center (lever B); unbiased generalist, only drawn when foodChannels===2
    // NB pre-sight, predators hunt by PROXIMITY only — the encounter rate is too low for hunting to
    // pay, so the predator trait does not persist yet (it needs the sight slice to actively target
    // prey). The mechanic + genes + color are in place; sight activates it.
    founderSigma: 0.3,
    // Seed founders across a wide UNIFORM size band (cellRadius·[0, 2] = ~[2,12]) so big/small body
    // niches — and the predation refuge + shelter dynamics they drive — exist from t0 rather than having
    // to evolve out of a monomorphic start. Probe: szSd up, world stays alive. 0 disables (all at center).
    founderSizeSpread: 2.5, // wide band over the 2× range (≈[2,21] at cellRadius 6) → strong size variance from t0
    mutationSigma: 0.05,
    hueMutationSigma: 0.02,

    // Baldwin learning ON by default. Energy-gated: a creature only consolidates its behavior when
    // well-fed (peak at satiation). Decay-to-instinct + clamp keep drift bounded so it never
    // destabilises survival (the alive-guardrail).
    learningEnabled: true,
    learningRate: 0.02,
    learnRewardClamp: 3,
    eligLambda: 0.2,
    weightDecay: 0.002,
    maxLearnDeviation: 0.5,

    // Steering output shaping: OFF = hard clamp (current behavior, byte-identical hash). Flip on to
    // smoothly tanh-squash turn/thrust → graded, legible steering (kills the motor-saturation spin).
    motorSquash: false,
    ...overrides,
  };
}

/** The one config the demo, harness, and tests all use. */
export const DEMO_CONFIG: Config = defaultConfig();
