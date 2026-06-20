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
  /** Max biomass an organism ingests per tick from its current cell (→ energy 1:1). */
  eatRate: number;
  /** Basal metabolic cost per tick (the starvation clock — high enough that not-eating kills). */
  basalCost: number;
  /** Movement cost per tick = moveCost · speed² (makes fast blind search expensive → senses pay off). */
  moveCost: number;
  /** Energy at/above which an organism reproduces (asexual split; genome added in Phase 5). */
  reproThreshold: number;
  /** Energy the parent spends to reproduce (birthEnergy goes to the child, the remainder is lost). */
  reproCost: number;
  /** Starting energy of a seeded organism and of each offspring. */
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
  /** Gaussian σ spread of founder brain weights around the seed brain (initial behavioral variation). */
  founderSigma: number;
  /** Gaussian σ of per-weight brain mutation at birth (the evolutionary step size; live knob). */
  mutationSigma: number;
  /** Gaussian σ of hue-gene drift at birth (how fast lineage colors diverge). */
  hueMutationSigma: number;
}

export function defaultConfig(overrides: Partial<Config> = {}): Config {
  return {
    seed: 1,
    // One fixed moderate scale (rebuild decision): big enough for real ecology later, small enough
    // to validate at full scale in real time on a laptop.
    worldWidth: 1024,
    worldHeight: 1024,
    dt: 1,
    maxOrganisms: 4096,
    // Phase 0 is a watchable skeleton; a modest crowd makes the instrument panel legible (motion,
    // the population series, click-to-inspect). Physics/economy arrive in later phases.
    initialPopulation: 200,
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
    foodCols: 128,
    foodRows: 128,
    foodCap: 6,
    foodRegen: 0.06,
    foodDiffuse: 0.05,
    foodInit: 0.5, // start half-full → less fuel for the first overshoot
    eatRate: 2,
    basalCost: 0.4,
    moveCost: 0.01,
    // Slow breeding (long generation vs the starvation clock) damps the boom-bust toward a sustained,
    // turning-over population instead of an overshoot-to-extinction. Tuned headlessly.
    reproThreshold: 60,
    reproCost: 35, // 25 to the child + 10 lost; parent drops to ≥25 and stays viable
    birthEnergy: 25,
    offspringOffset: 8,

    // Steering + evolution. Founders seeded near a chemotaxis brain (genome.ts FOUNDER_BRAIN) with a
    // spread; offspring mutate. cellRadius=6 → senseStep ≈ one food cell.
    senseStep: 8,
    maxTurn: 0.35,
    maxThrust: 1,
    founderSigma: 0.3,
    mutationSigma: 0.05,
    hueMutationSigma: 0.02,
    ...overrides,
  };
}

/** The one config the demo, harness, and tests all use. */
export const DEMO_CONFIG: Config = defaultConfig();
