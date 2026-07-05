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
  /** Per-pocket richness peak (Gaussian amplitude). 1 = legacy (each pocket peaks at fertility 1 → K=cap).
   *  >1 makes pockets DEEP reservoirs (peak fertility>1 → K=cap·peak>cap), so a pocket holds a dense, deep
   *  prey cluster regardless of world size — the big-world predation lever. */
  foodPatchRichness: number;
  /** Per-pocket richness VARIATION, [0,1]: each pocket's peak = richness·(1 + var·(2·rng−1)), so pockets
   *  differ in depth (some deep predator-havens, some shallow grazer-refuges). 0 = uniform (NO extra RNG
   *  draw → byte-identical to legacy when richness=1 and maxFertility=1). The diversity-from-place lever. */
  foodPatchRichnessVar: number;
  /** Hard clamp on per-cell fertility after pockets are summed. 1 = legacy (K never exceeds cap). Raise it
   *  to let deep pockets exceed K=cap (needed for foodPatchRichness>1 to actually deepen the reservoir). */
  foodMaxFertility: number;
  /** Dead-water tax: extra per-tick energy drain ∝ (1−fertility) under a creature — max in the dead gaps
   *  between pockets, 0 inside a pocket — so crossing the open water is risky and residents stay home long
   *  enough for local communities to diverge. The ISOLATION lever. 0 = OFF (byte-identical). */
  deadWaterCost: number;
  /** Per-pocket carrying-capacity VARIANCE (lever C — archipelago biome diversity). 0 = every pocket has
   *  the same ceiling K = cap (the ablation OFF state: no RNG drawn, Kcell stays exactly cap·fertility,
   *  byte-identical). >0 draws each pocket an independent richness scale s ∈ [1−this, 1+this] from a FORKED
   *  RNG stream, so pockets range from lean (cap·(1−this)) to rich (cap·(1+this)). Distinct K per island →
   *  lineages on different pockets face different carrying capacity → body-size / strategy diverges across
   *  the archipelago. The forked stream keeps the archipelago LAYOUT fixed: the pocket centres (fertility
   *  map) and seedPatches' main-RNG draws are identical across variance, so turning this on moves only
   *  per-pocket K — not where the islands are. Founders, rejection-sampled onto biomass, then settle
   *  differently on the re-weighted islands (the intended ecological effect, not a layout shift). */
  pocketCapVariance: number;
  /** Number of independent food channels (lever B, niche partitioning). 1 = a single biomass field,
   *  byte-identical to a one-resource world (the ablation OFF state). 2 = a second logistic channel B2
   *  sharing the same fertility map; each cell's cap is split A/B so total biomass is unchanged. This is
   *  the gate for the FORAGE_PREF gene: with 1, that gene is never drawn from RNG (hash unchanged). */
  foodChannels: number;
  /** Channel-B's share of each cell's carrying capacity, [0,1] (channel A gets 1−this). Only used when
   *  foodChannels===2. 0.5 = symmetric two-resource cell; lower makes B scarcer (sharpens specialization). */
  foodChannelRatio: number;
  /** Specialization CONVERSION bonus (lever B, two-channel only): a committed forager (FORAGE_PREF→0 or 1)
   *  converts grazed biomass into spec=1+this·(2·|pref−0.5|) energy, vs 1× for a generalist (pref=0.5).
   *  This is the disruptive pressure that splits one FORAGE_PREF cloud into two niches — no biomass is
   *  created (the field still depletes by what's grazed; specialists are just MORE EFFICIENT at their
   *  channel). 0 = ablation (no specialization incentive; income ceiling = single-channel, so the only
   *  difference left is the split resource pool itself). Only read when foodChannels===2. */
  forageSpecBonus: number;
  /** Generalist energy FLOOR — the conversion multiplier a fully-indifferent forager (FORAGE_PREF=0.5)
   *  earns, vs 1+forageSpecBonus for a full specialist. <1 PENALISES generalism: spec ramps linearly
   *  from this floor (indifferent) up to 1+forageSpecBonus (committed), so a generalist earns less energy
   *  per grazed unit than a specialist eating its own channel. This is what pulls FORAGE_PREF off 0.5 and
   *  into two niches (the owner's "everyone is gray" fix). 1 = no penalty (legacy). Read at foodChannels≥2. */
  forageGeneralistFloor: number;
  /** Diet-axis disruptive selection (the forage-spec pattern mirrored onto DIET): graze AND hunt income
   *  ×= dietGeneralistFloor + (1−dietGeneralistFloor)·2·|diet−0.5|, so the omnivore (diet 0.5) earns
   *  dietGeneralistFloor× while committed grazers/hunters (diet 0 or 1) earn 1×. <1 PENALISES omnivory,
   *  pulling DIET off the jack-of-all-trades midpoint into committed grazer/predator niches. No biomass or
   *  drain is changed — it's a conversion efficiency on the absorbed energy. 1 = OFF = byte-identical
   *  (1+(1−1)·d01 = 1, income ×1). No gene, no RNG — a pure coefficient read in the per-creature loops. */
  dietGeneralistFloor: number;
  /** Availability-weight the TWO-channel eat budget (mirrors the 3-channel branch). false = legacy split:
   *  the budget is allocated by FORAGE_PREF alone (budget·(1−pref) on A, budget·pref on B) REGARDLESS of
   *  what biomass is present — so a soft B-specialist that drifts onto A-only food wastes its B share on an
   *  empty channel and slowly starves, which collapses the fugitive B niche to an A-monoculture. true =
   *  allocate by pref·localBiomass (renormalized): the budget flows to the resource actually present, so an
   *  off-channel specialist falls back to what's there and survives transit between drifting pockets — the
   *  B niche stays viable. The specialization-bonus commitment reward is unchanged. Only read at
   *  foodChannels===2; equal-availability cells (both channels present) are identical to the legacy split. */
  forageAvailabilityWeighted: boolean;
  /** Max biomass an organism ingests per tick from its current cell (→ energy 1:1). */
  eatRate: number;
  /** Basal metabolic cost per tick (the starvation clock — high enough that not-eating kills). */
  basalCost: number;
  /** Movement cost per tick = moveCost · speed² (makes fast blind search expensive → senses pay off). */
  moveCost: number;
  /** FOUNDER CENTER for the per-creature reproThreshold gene: the survival↔reproductive boundary (the
   *  learn-gate floor; where a parent lands after breeding). Each creature evolves its own. */
  reproThreshold: number;
  /** DIET up-weight in the mate genetic-distance metric (predator/prey isolation). */
  mateDietWeight: number;
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
  /** Breeding refractory period (ticks): after a creature reproduces it cannot breed again for this many
   *  ticks, even while energetically able. This opens a "well-fed but not breeding" dwell — the regime the
   *  hunger-gate needs to express satiation behavior (forage → breed → cooldown: wander while full → breed)
   *  — and spaces reproduction into a real life-cycle. The FIRST breed is never gated (newborns start ready),
   *  so getting established is unaffected. 0 = OFF: no gating, byte-identical to pre-cooldown (the contract). */
  breedCooldown: number;
  /** Master toggle: sexual reproduction (crossover of two compatible parents). Default ON; false → the
   *  legacy asexual clone+mutate path (ablation). The ONLY behavioural gate for this feature. */
  sexualReproduction: boolean;
  /** Ticks a satiated creature stays in the mate-SEEKING state before giving up this cycle. */
  mateSeekWindow: number;
  /** World-unit radius for a mating contact (≈ one spatial-hash cell; covered by the 3×3 scan). */
  mateContactRange: number;
  /** Max geneticDistance for two creatures to be a compatible (interbreeding) pair — the species gate.
   *  Smaller = stricter isolation / easier speciation; too small risks crashing births. */
  mateCompatThreshold: number;
  /** Strength of the sight pull toward similar-looking creatures while seeking (bounded like cohesion). */
  mateSenseAttraction: number;

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
  /** Founding-protection: seed the predator founders CLUSTERED into the N deepest pockets (instead of
   *  scattered) so a hunter lineage starts together on a dense prey reservoir and survives the bootstrap —
   *  the founding lottery is the real gate on big-world predation. 0 = OFF (scattered, byte-identical). */
  predatorSeedClusters: number;
  /** Predator founder size bias [0,1]: seeds predator founders in the UPPER size band — their SIZE is drawn
   *  from [lo + predatorSizeBoost·(hi−lo), hi] instead of the full [lo,hi]. Big bodies are the predator's
   *  WEAPON (huntSizeRatio: can only eat prey smaller than size/ratio), so seeding hunters big lets them
   *  actually catch prey from t0 instead of starving small. 0 = OFF (full band, byte-identical). */
  predatorSizeBoost: number;
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
  /** Holling Type-II handling-time refractory (ticks). After a SUCCESSFUL bite a predator is "busy handling
   *  prey" and cannot feed again for this many ticks — a per-predator deterministic countdown (no gene, no
   *  RNG). This caps kills-per-time regardless of prey density (the Type-II functional response), bounding
   *  the predator energy-printer that otherwise booms without limit on dense prey. 0 = OFF = byte-identical
   *  to today (every read/write of the counter is gated on this being >0). */
  huntHandlingTime: number;
  /** Exponent on the herbivory falloff: plant income ∝ (1−diet)^this. 1 = linear (predators keep a real
   *  plant fallback → FACULTATIVE, viable at low density); higher pushes toward OBLIGATE predation (which
   *  starves at this world's sparse encounter rate). */
  herbivoryExp: number;
  /** Cannibalism switch (ablation knob). true = a predator bites the nearest creature of ANY kind
   *  (current behavior). false = it only bites creatures meaningfully LOWER on the diet axis than
   *  itself (prey, not peers) — so similar-diet "guild-mates" are spared, preventing predator-on-
   *  predator drain. Kinship here is the diet gap (the same signal sight uses), not genetic lineage. */
  cannibalism: boolean;
  /** Minimum DIET advantage a predator needs over its prey (only read when cannibalism is false). A target
   *  is edible only if its DIET ≤ attacker DIET − this — so prey must be MEANINGFULLY lower on the diet axis,
   *  not merely an ε lower. 0 = the strict-lower rule (any lower diet is edible) → byte-identical to today.
   *  0.25 means a 0.78 predator won't eat a 0.77 near-peer (realistic) but a 0.8/0.99 predator can still eat a
   *  0.5 omnivore. The SIZE refuge (huntSizeRatio) applies on top either way — prey must also be small enough. */
  huntDietGap: number;
  /** Red Queen counter-damage (lever E1). When a predator lands a bite it pays back this FRACTION of the
   *  prey's DAMAGE gene in energy: predatorEnergy −= counterBiteFraction · preyDAMAGE. 0 = OFF (hunt skips
   *  the subtraction → byte-identical to today). No gene, no RNG — a pure coefficient read in hunt.
   *  The FIRM effect is a predator-side TAX: biting high-DAMAGE prey costs the attacker, so it raises the
   *  bar on whom it pays to hunt. The hoped-for prey-side response (prey evolving teeth as a deterrent) is
   *  UNVERIFIED and may not occur: DAMAGE is upkeep-costed for every creature, a bitten prey dies regardless
   *  of its own DAMAGE, and a diet-0 prey gets zero offensive income from teeth — so any return is purely an
   *  indirect kin/group effect (degrading predators that bite neighbours) and individual selection may push
   *  prey DAMAGE DOWN instead. Treat the arms race as a hypothesis to probe, not a given. Higher fractions
   *  make hunting less rewarding (net depends on predationGain/realized drain, not a clean threshold); a
   *  large value starves predators. Safe live-tune ~0.1–0.3. */
  counterBiteFraction: number;

  // ── Density-dependent mortality (lever D — boom-bust) ───────────────────────────────────────────
  /** Energy drained per tick per local neighbor ABOVE crowdThreshold: extraCost = this·max(0, N−crowdThreshold),
   *  where N = live creatures within crowdRadius. 0 = OFF (metabolize skips the neighbor scan entirely, so the
   *  energy arithmetic is byte-identical to today). >0 knocks back the locally-dominant — a dense grazer clump
   *  drains faster than it can climb to its breed bar, then thins via the EXISTING cull (energy≤0 dies) — which
   *  turns the flat/damped equilibrium into boom-bust oscillation. No gene, no RNG: a pure config coefficient
   *  read in metabolize, the same class as basalCost/moveCost. */
  crowdingMortality: number;
  /** Free-density band: the local-neighbor count below which crowding costs NOTHING. Sparse creatures (e.g.
   *  predators, whose nearest-neighbor distance ≫ crowdRadius) sit under it and are spared. Only read when
   *  crowdingMortality>0 (untouched on the OFF skip path). */
  crowdThreshold: number;
  /** Radius (world units) for counting local neighbors. Default 2·cellRadius (= the collision/hash-cell cutoff,
   *  so the existing 3×3 hash neighborhood already covers it — no scan-size growth). Only read when
   *  crowdingMortality>0. */
  crowdRadius: number;

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
  /** Schooling SELECTIVITY: true (default) = hue-blind, pull toward ALL neighbors regardless of lineage;
   *  false = pull only toward SIMILAR-hue (lineage) neighbors so schools are kin-clumps. Hue-blind is the
   *  default because the school-strength sweep showed it ~3× sustained predator count (99→282 across seeds
   *  1/2/5) and ~4.5× snapshot predEncounter with zero predator extinctions — the lineage restriction
   *  starved predators of contact. Set false to restore the kin-clump behavior (still ablatable). */
  cohesionHueBlind: boolean;
  /** FORAGE_PREF gene founder CENTER [0,1] (lever B): 0 = channel-A specialist … 1 = channel-B specialist,
   *  0.5 = generalist. ONLY drawn from RNG (seed + mutation) when foodChannels===2; with one channel the
   *  gene is pinned here with no draw, so the determinism stream is byte-identical. 0.5 keeps founders
   *  unbiased so SELECTION drives the niche split rather than a seeded head start. */
  foragePref: number;

  // ── F1 multi-resource (3-channel niche partitioning by place; OFF default foodChannels<3 = byte-identical) ──
  /** FORAGE_PREF_C gene center [0,1]: the 2nd preference DOF for a 3-way {A,B,C} resource simplex. Only drawn
   *  when foodChannels>=3 (the tail-gated draw); 0.5 = unbiased. */
  foragePrefC: number;
  /** How the food pockets are assigned a resource channel when foodChannels===3 (couples diet to place):
   *  0 = legacy (all pockets grow channel A — N>=3 stays a single-resource world, used to ablate the
   *  spatial-partition mechanic); 1 = round-robin by pocket index (deterministic, RNG-free) so distinct
   *  islands grow distinct resources. Byte-identical at foodChannels<3 (the field never splits). */
  foodPocketChannelMode: number;
  /** ch2-diff (wall-tied channel A): when true AND a per-pocket channel split is active (foodPocketChannelMode
   *  ===1 with foodChannels>=2), channel-A pockets are biased toward NEAR-WALL cells (a stable structural
   *  resource that clusters against the biome walls) and channel-B pockets toward OPEN WATER — split at the
   *  median wall-proximity of the pockets. Deterministic + RNG-order-stable (a pure read of the wall field
   *  after each centre is drawn). false (default) = legacy round-robin p%channels assignment → byte-identical.
   *  Needs walls (wallRegionCount>0) to have a meaningful proximity signal; with no walls every pocket reads
   *  the same "far" proximity so the split degrades gracefully to all-A. */
  foodChannelAWallTied: boolean;
  /** ch2-diff (drifting channel B): per-channel advection multiplier for channel B — channel B's biomass is
   *  advected by the flow at this× the rate of channels A/C, so it smears DOWNSTREAM into a mobile plume a
   *  forager must chase while A stays put. 1 (default) = uniform advection across channels → byte-identical.
   *  Only has an effect when flow is active (flowStrength>0) and B2 exists (foodChannels>=2). Keep ≲3: a
   *  large value pushes the moved fraction past the CFL=0.25 ceiling and the upwind scheme can go negative. */
  foodChannelBDriftMult: number;

  // ── Migrating food pockets (the pocket CENTRES drift over time so food moves; OFF default = byte-identical) ──
  /** Master multiplier on pocket drift. 0 (default) = pockets are STATIC: driftPockets is a no-op, no
   *  forked velocity RNG is drawn, no recarve runs → byte-identical to a fixed archipelago (the OFF state).
   *  >0 scales every pocket's per-tick displacement: each channel's pockets sweep COHERENTLY along their own
   *  global direction (dirA / dirB), so the two resource zones cross and rearrange. The forked velocity RNG
   *  (seeded independently) draws the two directions, so the MAIN organism stream is untouched even when ON. */
  fertilityDriftRate: number;
  /** Recarve cadence: the fertility map + channelMask + Kcell are rebuilt from the moved pocket centres every
   *  this-many ticks (NOT every tick — 40 Gaussians × 128² is ~650k exp). Biomass keeps regrowing/decaying in
   *  place between recarves, so the pocket visibly migrates. Only read when fertilityDriftRate>0. */
  fertilityDriftInterval: number;
  /** Channel-A pocket drift rate multiplier (the SLOW seasonal current). Default 0.2 = A pockets creep. */
  foodPocketDriftRateA: number;
  /** Channel-B pocket drift rate multiplier (the NORMAL seasonal current). Default 1.0 = B pockets sweep. */
  foodPocketDriftRateB: number;
  /** Base pocket drift speed in world units/tick the per-channel rate scales. The displacement applied at a
   *  recarve is pocketDriftSpeed · fertilityDriftRate · rate(channel) · fertilityDriftInterval along dir. */
  pocketDriftSpeed: number;
  /** B-food-1: when on, each migrating food pocket drifts along its OWN direction (drawn per-pocket from the
   *  forked velocity rng) so patches wander independently + cross/overlap/merge. Off → the legacy two per-channel
   *  global drift directions (byte-identical). Only matters when fertilityDriftRate > 0. */
  perPocketDrift: boolean;

  // ── F2 pheromones (a diffusing deposit-and-sense field; OFF default pheromoneEnabled=false = byte-identical) ──
  /** Master switch for the pheromone field + the 4 PHERO brain genes + PHERO_DEPOSIT scalar gene. false =
   *  the field is never allocated, the genes never draw RNG, and the sim is byte-identical to pre-feature. */
  pheromoneEnabled: boolean;
  /** PHERO_DEPOSIT gene center: baseline deposit loudness a creature broadcasts. Only drawn when enabled. */
  pheroDeposit: number;
  /** Per-unit-above-center upkeep for PHERO_DEPOSIT (no free chemical broadcast). */
  pheroDepositCost: number;
  /** Inter-cell diffusion of each scent channel per tick [0,0.25] — how FAR the signal carries (shared
   *  across channels for V1) and, with decay, the DELAY that makes it candidate breathing feedback. */
  pheroDiffuse: number;
  /** Scent decay per tick (0,1] — each channel forgets at this rate. Low + diffuse = long-memory feedback. */
  pheroDecay: number;
  /** Per-tick passive deposit scale: every live creature broadcasts PHERO_DEPOSIT_gene·pheroDepositStrength
   *  of its signature each tick. The continuous trail (vs on-graze) so predators — who hunt, not graze —
   *  also lay scent. Lower it / raise pheroDecay if the field saturates. */
  pheroDepositStrength: number;
  /** Identity ablation: true → deposit splits by diet (role) + hue (signature); false → equal into all
   *  channels (field alive but information-free). The toggle that isolates the feature's effect. */
  scentIdentity: boolean;

  // ── F3 glow-sense (a diffusing glow field whose deposit source is store.glow; SELECTS the glow signal) ──
  /** Master switch for the glow field + the 4 GLOW_SENSE brain genes. When on, every creature deposits its
   *  store.glow each tick into a diffusing scalar field and senses that field's gradient as a brain input —
   *  so glow becomes a signal others react to. The genes are ALWAYS drawn (consistent stream) either way;
   *  this just toggles whether the field is allocated/deposited/sensed/hashed. */
  glowSense: boolean;
  /** Inter-cell diffusion of the glow field per tick [0,0.25] — how FAR the glow signal carries. */
  glowDiffuse: number;
  /** Glow-field decay per tick (0,1] — the field forgets at this rate (low + diffuse = long-memory). */
  glowDecay: number;
  /** Scale on the per-tick glow deposit: each creature adds store.glow·glowDepositStrength into its cell. */
  glowDepositStrength: number;

  /** Gaussian σ spread of founder brain weights AND scalar genes around the seed center (initial variation).
   *  NB the population is fragile to this: raising it past ~0.3 floods the founding pool with unfit extremes
   *  (ruinous costed-gene upkeep + unreachable repro thresholds) that starve before breeding — measured
   *  births collapse to ~0 at 0.5–0.7. Widen the trait SPACE via the gene RANGES, not this founder spread. */
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
  /** Evolvable per-creature damping (drift ↔ dart): when on, integrate() reads each creature's DAMPING
   *  gene instead of the global `damping` constant. The gene is drawn from RNG regardless of this flag,
   *  so toggling it is a pure read-path switch — the determinism hash for a given seed is unaffected by
   *  the flag. ON by default (movement-style variance). */
  evolvableDamping: boolean;
  /** Fraction of MAX_THRUST a creature may apply in REVERSE (backward force). 0 = forward-only (legacy
   *  motor); 0.5 = can back away from a threat at half forward power while still facing it. This is its
   *  OWN ablation knob — set to 0 and the motor is byte-identical to the pre-reverse engine. */
  reverseThrustFraction: number;
  /** Brain-gated eating (slice B): when on, a creature's eatGate brain output (0..1) throttles its graze
   *  intake AND eating slows the body (thrust ×= 1 − eatGate·eatMovePenalty), so grazing is a real decision
   *  — graze (fed but slow + catchable) vs lift the head to flee at full speed. Off = legacy unconditional
   *  eating with no mobility cost (its ablation switch). */
  brainGatedEating: boolean;
  /** A2a brain-gated predation: when on, hunt()'s bite drain is scaled by the creature's biteGate (0..1)
   *  sigmoid output, so biting is a DECISION (graze-only vs strike). Seeded gate-open → founding predation is
   *  unchanged; the gate learns + evolves. Off → unconditional auto-bite (the legacy reflex), ×1 byte-identical. */
  brainGatedBiting: boolean;
  /** A2b brain-gated scent deposit: when on, depositScent()'s amount is scaled by the creature's scentGate
   *  (0..1) sigmoid output, so signalling is a DECISION (broadcast vs go silent). Evolve-only. Seeded gate-open
   *  → founding deposit unchanged. Off → unconditional passive deposit (the reflex), ×1 byte-identical. */
  brainGatedScent: boolean;
  /** A2c brain-gated breeding: when on, a breeding-eligible creature only breeds if its breedGate (0..1)
   *  sigmoid output is ≥ breedGateThreshold — the brain chooses WHEN to breed. Evolve-only. Seeded gate-open →
   *  founding breeding unchanged. Off → the pure energy-threshold reflex (byte-identical). */
  brainGatedBreeding: boolean;
  /** Threshold the breedGate must reach to permit breeding (A2c). Default 0.5; seeded gate ≈0.98 clears it. */
  breedGateThreshold: number;
  /** How hard active eating cuts thrust (the mobility cost that makes the eat-gate matter). 0 = eating is
   *  free (gate only throttles intake); 0.4 = a full-gate grazer moves at ~60% thrust. */
  eatMovePenalty: number;
  /** Age sense (slice C): feed an interoceptive "maturity" input = min(age/ageNorm, 1) (0 = newborn …
   *  1 = at/past the reference lifespan) into the brain on its own turn/thrust synapses, so behaviour can
   *  depend on life stage (juvenile dispersal, elder risk-taking). Off = the brain can't sense its age. */
  ageSense: boolean;
  /** Reference lifespan (ticks) the age input normalizes against — age/ageNorm saturates at 1 here. */
  ageNorm: number;
  /** Repro-readiness sense (slice D): feed clamp((energy − reproThreshold)/(satiatedBar − reproThreshold),
   *  0, 1) — 0 while just surviving, ramping to 1 as the creature nears its breeding bar — on its own
   *  turn/thrust synapses, so behaviour can change as reproduction approaches (e.g. settle before breeding).
   *  Distinct from hunger (whose denominator is the full bar): this one is clamped to the breeding BAND.
   *  Off = the brain can't sense breeding readiness. */
  readinessSense: boolean;
  /** A1a interoceptive body sense: feed own-SIZE (= SIZE/(2·cellRadius)) and own-DIET (0..1) as brain inputs
   *  (both the linear map and the hidden layer), so behaviour can be conditional on the body. Gates only the
   *  steer() forward pass; the synapses are always drawn (on-by-default policy). */
  bodySense: boolean;
  /** A1b local-crowding sense radius (world units): senseCrowding counts live neighbors within this distance
   *  into store.crowding. Wider than the 2·cellRadius repulsion cutoff (which holds creatures ~12u apart, so a
   *  12u radius reads ~0 — the dead lever-D scan's failure). Only read when bodySense (the A1 umbrella flag). */
  crowdSenseRange: number;
  /** Normalization divisor for the crowding count: crowdN = min(crowding/this, 1). ~8 neighbors → saturated. */
  crowdSenseNorm: number;
  /** Hidden layer (slice E): when on, a fixed H-unit tanh layer adds a NONLINEAR correction on top of the
   *  linear sensor→motor map (skip-connection), giving the brain conditional logic ("flee only if a predator
   *  is close AND I'm cornered"). Off = the pure linear brain (the hidden forward pass is skipped). The
   *  hidden weights always exist in the genome either way; this just toggles whether they're computed. */
  hiddenLayer: boolean;
  /** Mood-glow (slice F): when on, a glow brain output = sigmoid(GLOW_BIAS + Σ hidden·GLOW_HID) reads the
   *  hidden "mood" layer and drives bioluminescence brightness, so you can scan the population and see which
   *  creatures are "lit up". Display-only + evolve-only; hidden→glow weights diverge per lineage, so different
   *  species glow for different reasons. Off = no glow output computed. */
  moodGlow: boolean;

  // ── Walls (env pass 1) ─────────────────────────────────────────────────────
  /** FINE wall-grid resolution (decoupled from the food grid for creature-scale nooks). */
  wallCols: number;
  wallRows: number;
  /** Voronoi biome regions, each carved by one generator. 0 = NO WALLS (off; byte-identical). */
  wallRegionCount: number;
  /** Target solid fraction [0,1] of the carved terrain. */
  wallDensity: number;
  /** Fine cells kept open at a food-pocket centre in pocket-eroding regions. */
  wallPocketCoreRadius: number;
  /** Corridor half-width (fine cells) carved by the connectivity guarantee. */
  wallCorridorRadius: number;
  /** Ablation: walls block line-of-sight (sight occlusion). false = sight ignores walls. */
  wallOccludesVision: boolean;
  /** Central-difference half-step (world units) for the neural wall-proximity gradient. */
  wallSenseRange: number;

  // ── Flow field (env pass 1) ────────────────────────────────────────────────
  /** Advection magnitude (CFL-clamped to ≤0.25 cell/tick). 0 = NO FLOW (off; byte-identical). */
  flowStrength: number;
  /** Streamfunction wavelength in FOOD cells (eddy size). */
  flowScale: number;
  /** Force on creatures from the current. 0 = OFF (default — byte-identical). */
  flowPushStrength: number;
  /** Susceptibility exponent: push ×= (cellRadius/size)^this (big bodies resist). */
  flowPushSizeExp: number;

  // ── Abiotic gradient (env pass 2 — Arc C3: SPACE as a selective-optimum axis) ────────────────────────
  /** Temperature-mismatch metabolic tax (Arc C3, the regional-differentiation engine): a SEEDED spatially-
   *  varying temperature field (abiotic.ts, in [0,1]) and a dedicated THERMAL_PREF gene (also [0,1]); a
   *  creature pays extra basal cost = this · (THERMAL_PREF − temp)² for being adapted to the wrong local
   *  temperature. THERMAL_PREF has no other role, so this is PURE regional stabilizing selection with no
   *  diversity-maintaining counter-force → each region drives THERMAL_PREF to its LOCAL temperature
   *  (monomorphic per region) → between-region σ ≫ within-region (the F_ST target that diet/metabEff can't
   *  reach, because their tradeoffs keep a within-region spread). The field is a pure function of (position,
   *  seed) — NO RNG draw — and THERMAL_PREF is tail-gated, so 0 = OFF is byte-identical to pre-feature. */
  temperatureMetabCost: number;
  /** Number of temperature bands across the world (the gradient's spatial frequency). 1 = a single
   *  warm→cold sweep; higher packs more bands (more distinct regional optima per unit distance). Only read
   *  when temperatureMetabCost>0 (and by observers querying temperatureAt). */
  temperatureScale: number;
  /** THERMAL_PREF founder CENTER (0.5 = mid-temperature). Only drawn from RNG when temperatureMetabCost>0
   *  (tail-gated); otherwise pinned here with no draw → byte-identical. */
  thermalPref: number;

  // ── Drifting SIGHT-ONLY food parcels (gives the VISION genes a reason to exist) ─────────────────────
  /** Master switch for drifting sight-only food parcels: discrete, high-value, perishable food motes that
   *  emit NO smell (not in the FoodField gradient) and are perceived ONLY by the sight system, so a
   *  creature with working eyes can intercept them for a big payoff — making VISION_RANGE/FOV/ACUITY (+ the
   *  SIGHT brain weights) pay. false (default) = the parcel pool is never allocated, the spawn RNG never
   *  advances, sense/eat skip the parcel block entirely → byte-identical to pre-feature (the OFF contract).
   *  All randomness is on a DEDICATED forked Rng (cfg.seed ^ SALT), so even ON it never perturbs the
   *  organism RNG stream (seeding + reproduction stay byte-identical). */
  parcelsEnabled: boolean;
  /** Parcel pool capacity (max simultaneous live parcels). Only allocated when parcelsEnabled. */
  parcelCapacity: number;
  /** Spawn a parcel every this-many ticks, up to capacity (one parcelRng draw-pair per spawn). 0 = never. */
  parcelSpawnInterval: number;
  /** Energy payoff for eating a parcel — deliberately BIG (a sight-guided intercept is the reward that
   *  makes eyes worth their upkeep). */
  parcelEnergy: number;
  /** Parcel lifetime in ticks before it expires (perishable → eyes must act fast, and the pool turns over). */
  parcelLifetime: number;
  /** Per-tick energy decay of a live parcel (a second perishability channel; expire when energy ≤ 0). */
  parcelDecay: number;
  /** Advection strength: a parcel drifts by parcelDriftMult × the local flow velocity each tick. 0 = static
   *  (parcels sit still; only decay/age). Needs flow active to actually move. */
  parcelDriftMult: number;
  /** Appeal weight folded into the SIGHT vector per perceived parcel (the pull strength toward a parcel,
   *  the analogue of the creature-appeal term — positive = attractive). */
  parcelAppeal: number;
  /** Eat radius (world units): a creature within this of a live parcel consumes it for parcelEnergy. */
  parcelEatRange: number;
  /** CLUSTERED parcel spawning: spawn parcels in a few drifting hotspots instead of uniformly, so a
   *  creature's see-farther annulus sometimes overlaps a dense jackpot a short-range creature misses
   *  (a cluster's summed weak-pulls is a strong far-beacon that defeats the (1−d/range) falloff) — the
   *  lever that makes VISION_RANGE pay at 8192². false (default) = parcels spawn at a UNIFORM world
   *  position (the 2-draw legacy path), so cluster RNG never advances and the parcel stream is identical
   *  to pre-clustering → byte-identical OFF ablation. Only ever active when parcelsEnabled. */
  parcelClustering: boolean;
  /** Number of spawn hotspots when parcelClustering is on (cluster centers drawn once from the parcel
   *  forked RNG at construction; static for now — parcels still drift away from their center). */
  parcelClusterCount: number;
  /** Cluster radius (world units): a spawned parcel lands uniformly in a disk of this radius about its
   *  chosen cluster center (then toroidally wrapped). */
  parcelClusterRadius: number;

  // ── Interoceptive hunger brain input (lever E2 — ablation knob; OFF by default = byte-identical) ───
  /** Adds a HUNGER sense to the brain: a creature feels its own energy deficit (1 − energy/satiatedBar,
   *  clamped to [0,1]) as an extra input wired to two evolvable synapses (HUNGER_TURN, HUNGER_THRUST), so
   *  steering can become state-dependent (e.g. cast/forage harder when starving, cruise when full). false =
   *  OFF: the two synapses are never seeded/mutated with RNG and never read, so the sim is byte-identical to
   *  pre-E2 (safeguard #1). true = the weights seed near 0 and EVOLVE; behavior couples to internal state. */
  hungerSense: boolean;

  /** Hunger-gated food drive (satiation → stop seeking): when true, the FOOD gradient feeding the brain
   *  is multiplied by hunger = clamp(1 − energy/satiatedBar, 0, 1), so a FULL creature's food-seeking
   *  fades to zero and it steers on its OTHER drives (sight/flow/pheromone/bias) — i.e. it wanders/explores
   *  instead of grinding the gradient — while a starving one still seeks at full strength. Only the food
   *  gradient is scaled (not sight/wall/flow/pheromone). false = OFF: the gradient is never scaled, so the
   *  sim is byte-identical to pre-gate (the OFF golden contract). Reuses the satiatedBar hunger signal. */
  hungerGatesFood: boolean;

  /** Food-gate shape (only meaningful when hungerGatesFood is on): the food drive = clamp(hunger /
   *  foodGateThreshold, 0, 1), so a creature forages at FULL strength until its hunger drops below this
   *  threshold, then eases off — i.e. only a NEARLY-FULL creature reduces its food-seeking (the gate
   *  doesn't handicap the still-hungry majority). 0.4 ≈ "ease off only in the top 40% of the energy range".
   *  Set ≤0 for the raw-linear gate (drive = hunger). Unused when hungerGatesFood is off. */
  foodGateThreshold: number;

  /** Lower bound on the satiation food-drive (only meaningful when hungerGatesFood is on). The gate's
   *  drive is floored at this value, so drive ∈ [foodDriveFloor, 1]. 0 = the full gate (a fed creature's
   *  food gradient is zeroed → it stops relocating and parks in place — the satiation-parking failure mode
   *  that craters births: a parked creature never tops up its energy and so can't reproduce through the
   *  breed cooldown). 1 = the gate is effectively off (always forages at full strength → keeps chasing the
   *  depleting gradient into fresh pockets = roams). Intermediate values let a fed creature keep relocating
   *  toward fresh food while still easing off near satiation. Default 0 = byte-identical to the pre-floor gate. */
  foodDriveFloor: number;

  // ── Age / life stages (juvenile/adult/elder; OFF by default = byte-identical) ─────────────────────
  /** Master switch for age-dependent metabolism + life stages. false = the two age genes (MATURITY_AGE,
   *  SENESCENCE_AGE) draw NO RNG and neither the senescence tax nor the maturity gate is consulted, so the
   *  sim is byte-identical to pre-feature (the OFF golden contract). true = the genes seed/mutate and `age`
   *  becomes a real life axis: a juvenile breeding lock + an elder metabolic decline + a costed longevity gene. */
  ageStages: boolean;
  /** Senescence tax slope (per tick past SENESCENCE_AGE): an elder's basal cost is scaled by
   *  (1 + senescenceRate·(age − SENESCENCE_AGE)), so upkeep climbs with age until the creature can no longer
   *  break even and starves — death of old age, reaped by the EXISTING cull (no new death path). Only read
   *  when ageStages; 0 → no tax (the senescence-only ablation within an ageStages-on world). */
  senescenceRate: number;
  /** MATURITY_AGE gene founder CENTER (ticks): below this age a creature cannot breed (juvenile). */
  maturityAge: number;
  /** SENESCENCE_AGE gene founder CENTER (ticks): at/above this age the senescence tax begins (elder). */
  senescenceAge: number;
  /** Basal upkeep per unit of SENESCENCE_AGE gene above its center: a durable (long-lived) body costs more
   *  to run every tick (disposable-soma / antagonistic-pleiotropy), so longevity is a genuine tradeoff —
   *  a balanced polymorphism rather than free upward drift toward immortality. */
  senescenceAgeCost: number;
  /** DISPLAY gene founder CENTER (sexual-selection ornament, 0..1). */
  display: number;
  /** PREFERENCE gene founder CENTER (preferred DISPLAY value, 0..1). */
  preference: number;

  // ── Observation hooks (optional; OFF by default — pure instrumentation, never affects the sim) ────
  /** Fired once per successful birth inside reproduce(), in ascending parent-slot order, BEFORE the
   *  tick counter advances. Read-only by contract: it must not touch the store, RNG, or iteration —
   *  it exists so a harness can attribute child→parent lineage without an energy-trace heuristic.
   *  fatherSlot is the second parent in a sexual (crossover) birth, or -1 for an asexual clone —
   *  region-probe reads both parents' positions to measure cross-region gene flow (the isolation metric).
   *  Undefined in defaultConfig, so production runs and the determinism hash are unaffected. */
  onBirth?: (
    parentSlot: number,
    parentGen: number,
    childSlot: number,
    childGen: number,
    fatherSlot?: number,
  ) => void;
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
    // Higher count seeds a denser founder pool — more well-fed seekers can find compatible mates at
    // the 8192² demo scale (sexual reproduction's encounter rate scales with density).
    initialPopulation: 1000,
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
    foodPatchRichness: 1, // legacy depth (peak fertility 1 → K=cap); >1 = deep reservoirs (the spike lever)
    foodPatchRichnessVar: 0, // OFF: uniform pockets, NO extra RNG draw → byte-identical to legacy
    foodMaxFertility: 1, // legacy clamp (K never exceeds cap); raise with richness>1 to deepen reservoirs
    deadWaterCost: 0, // OFF: no dead-water tax → byte-identical; >0 = isolation (residents stay in pockets)
    pocketCapVariance: 0, // lever C OFF: every pocket K = cap (byte-identical). >0 = per-pocket K variance
    foodChannels: 1, // single resource (byte-identical OFF state); 2 = niche-partitioning second channel
    foodChannelRatio: 0.5, // symmetric A/B split when channels===2 (total per-cell cap unchanged)
    forageSpecBonus: 0.5, // specialists convert up to 1.5× energy (the disruptive niche-split pressure)
    forageGeneralistFloor: 0.85, // gentle generalist penalty: pulls FORAGE_PREF off 0.5 without a t=0 founder crash
    dietGeneralistFloor: 1, // OFF (byte-identical): 1+(1−1)·d01 = 1 → income ×1; <1 penalises the omnivore (diet 0.5)
    forageAvailabilityWeighted: false, // legacy pref-only 2-channel split; demo opts in (keeps the fugitive B niche alive)
    eatRate: 2,
    basalCost: 0.12, // low starvation clock → longer lives + a SOFTER early crash, so predator founders
    // survive the sparse phase long enough to reach the prey boom (predator-viability fix; was 0.2)
    moveCost: 0.01,
    // Slow breeding (long generation vs the starvation clock) damps the boom-bust toward a sustained,
    // turning-over population instead of an overshoot-to-extinction. Tuned headlessly.
    reproThreshold: 60, // gene center: survival↔reproductive boundary
    mateDietWeight: 5,
    satiatedThreshold: 100, // gene center: breed-at-the-top trigger + eat-stop + peak learning
    reproOverhead: 15, // energy lost per birth beyond provisioning (parent pays birthEnergy + this)
    birthEnergy: 25, // gene center: offspring provisioning
    offspringOffset: 8,
    breedCooldown: 0, // OFF: no breeding refractory → byte-identical; >0 spaces reproduction (the dwell lever)
    sexualReproduction: true,
    mateSeekWindow: 120,
    mateContactRange: 12,
    mateCompatThreshold: 0.6,
    mateSenseAttraction: 1.0,

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
    predatorSeedClusters: 0, // OFF: predators scattered (byte-identical); >0 = cluster into N deepest pockets
    predatorSizeBoost: 0, // OFF: predators drawn from the full size band (byte-identical); >0 seeds them big
    biteRange: 16, // reach to land a sight-guided kill (hunt now scans a neighborhood sized to this)
    huntSizeRatio: 1.15, // must be ≥15% bigger than prey to eat it → size is a refuge + a weapon
    predationGain: 1.8, // meat is concentrated: a bite yields 1.8× the drain, so even RARE kills pay
    // through sparse stretches → carnivory resists diet-dilution and predators persist (was 1, which left
    // hunting too marginal at this encounter rate; combined with basalCost 0.12 it rescues 2/3 probe seeds)
    huntHandlingTime: 0, // OFF: no handling-time refractory → byte-identical; >0 = Type-II cap on kills/time
    herbivoryExp: 1.3, // predators get little from algae → lean on HUNTING (max viable on seeds 1/2;
    // obligate carnivory, exp≥1.6, starves predators at this encounter rate — proven by probe)
    cannibalism: true, // current behavior (bite anyone nearest); flip off to spare same-diet peers
    huntDietGap: 0, // OFF (byte-identical): prey edible if any lower diet. >0 = require a meaningful diet gap
    // Red Queen counter-damage (lever E1) OFF by default: 0 → hunt skips the counter-bite, byte-identical.
    // >0 (live-tune ~0.1–0.3) taxes the predator by counterBiteFraction·preyDAMAGE per bite; the prey-side
    // arms-race response is a hypothesis to probe, not a given (see the interface doc).
    counterBiteFraction: 0,
    // Density-dependent mortality (lever D) OFF by default: crowdingMortality 0 → metabolize skips the
    // neighbor scan, hash byte-identical. >0 (live-tune ~0.15–0.4) drains the over-dense → boom-bust breathing.
    crowdingMortality: 0,
    crowdThreshold: 6, // local neighbors allowed for free; above this the per-neighbor drain kicks in
    crowdRadius: 12, // = 2·cellRadius (one hash-cell cutoff; the 3×3 neighborhood already covers it)
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
    cohesionHueBlind: true,
    foragePref: 0.5, // FORAGE_PREF gene center (lever B); unbiased generalist, only drawn when foodChannels>=2
    // F1 multi-resource (OFF default: foodChannels stays 1/2 → these are byte-identical no-ops).
    foragePrefC: 0.5, // 2nd preference DOF center; only drawn when foodChannels>=3
    foodPocketChannelMode: 0, // 0 = all pockets channel A (no spatial split); 1 = round-robin distinct islands
    foodChannelAWallTied: false, // ch2-diff OFF: legacy round-robin channel assignment → byte-identical
    foodChannelBDriftMult: 1, // ch2-diff OFF: uniform advection across channels → byte-identical
    // F2 identity-bearing scent (master OFF here; the demo turns pheromoneEnabled on — on-by-default policy).
    // Migrating food pockets (OFF default: fertilityDriftRate=0 → driftPockets no-ops, no forked velocity RNG,
    // no recarve → byte-identical to the static archipelago). Flip on to make the pockets MOVE: channel-A
    // pockets creep along dirA (slow), channel-B pockets sweep along dirB (normal) — two crossing currents.
    fertilityDriftRate: 0,
    fertilityDriftInterval: 20, // recarve every 20 ticks (cheap: ~650k exp / 20 ticks ≈ 33k exp/tick)
    foodPocketDriftRateA: 0.2, // channel A creeps (the slow seasonal current)
    foodPocketDriftRateB: 1.0, // channel B sweeps at the normal rate
    pocketDriftSpeed: 0.6, // base world-units/tick the per-channel rate scales
    perPocketDrift: true, // ON by default: pockets drift independently (B-food-1)
    // F2 pheromones (OFF default: pheromoneEnabled=false → field never allocated, genes never draw → no-op).
    pheromoneEnabled: false,
    pheroDeposit: 1.0, // PHERO_DEPOSIT gene center (deposit loudness)
    pheroDepositCost: 0.01, // upkeep per unit above center
    pheroDiffuse: 0.2, // carries the signal ~64-91u in 10-20 ticks (crosses the ~40u pocket NND)
    pheroDecay: 0.02, // slow forget → long-memory delayed feedback (the breathing candidate)
    pheroDepositStrength: 0.1, // per-tick passive deposit; ×4 channels ×live creatures, so kept small
    scentIdentity: true, // identity-bearing by default (on-by-default policy)
    // F3 glow-sense (ON by default — glow is now a SELECTED comms signal). Knobs mirror the pheromone field.
    glowSense: true,
    glowDiffuse: 0.2, // mirrors pheroDiffuse: carries the glow signal across the pocket NND
    glowDecay: 0.02, // mirrors pheroDecay: slow forget → long-memory glow trail
    glowDepositStrength: 1, // mirrors pheroGrazeStrength: scale on the per-tick store.glow deposit
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
    evolvableDamping: true,
    reverseThrustFraction: 0.5, // ON by default: creatures can back away at half forward power
    brainGatedEating: true, // ON by default: eating is a decision — graze slow vs lift the head to flee fast
    brainGatedBiting: true, // ON by default: predation is a brain decision (seeded bite-open; learns)
    brainGatedScent: true, // ON by default: scent deposit is a brain decision (seeded broadcast-open; evolve-only)
    brainGatedBreeding: true, // ON by default: breeding timing is a brain decision (seeded breed-open; evolve-only)
    breedGateThreshold: 0.5, // breedGate must reach this to breed; seeded ≈0.98 clears it (breeds by default)
    eatMovePenalty: 0.25, // eased from 0.4: eating still costs mobility (gate ON) but ~3× healthier population
    ageSense: true, // ON by default: the brain can sense its own maturity (life-stage behaviour)
    ageNorm: 1000, // ~average lifespan at the shipped economy → maturity reaches ~1 near mid-late life
    readinessSense: true, // ON by default: the brain can sense how close it is to breeding (the repro band)
    bodySense: true, // ON by default: the brain senses its own size + diet (A1a interoceptive inputs)
    crowdSenseRange: 36, // = 6·cellRadius; wider than the 12u repulsion cutoff so neighbors can register
    crowdSenseNorm: 8, // crowding count → [0,1]: 8 neighbors-in-radius reads as fully crowded
    hiddenLayer: true, // ON by default: the nonlinear hidden layer (conditional logic — the emergent-behavior substrate)
    moodGlow: true, // ON by default: bioluminescence read from the hidden mood layer (display + comms signal)

    // Walls: 5 biome regions over a 512² fine grid (16u cells), ~35% solid, vision-occluding.
    // Default OFF (wallRegionCount 0) so defaultConfig stays a TRUE no-op — byte-identical to the
    // pre-feature engine (the OFF-state golden contract). The shipping VALUES live here so the live
    // demo turns walls on with a single override (wallRegionCount 5); see src/app/main.ts.
    wallCols: 512,
    wallRows: 512,
    wallRegionCount: 0,
    wallDensity: 0.43,
    wallPocketCoreRadius: 3,
    wallCorridorRadius: 2,
    wallOccludesVision: true,
    wallSenseRange: 24,
    // Flow: divergence-free current that drifts food; default OFF (flowStrength 0) for the same
    // no-op reason as walls. The demo opts in with a strong flowStrength 4. Creature push OFF by default.
    flowStrength: 0,
    flowScale: 18,
    flowPushStrength: 0,
    flowPushSizeExp: 1,
    // Abiotic temperature gradient (Arc C3): OFF by default (temperatureMetabCost 0 → penalty block skipped
    // → byte-identical). The demo opts in to make METAB_EFF differentiate regionally along the gradient.
    temperatureMetabCost: 0,
    temperatureScale: 1.5,
    thermalPref: 0.5,
    // Drifting sight-only food parcels: OFF by default (pool never allocated, spawn RNG never advances,
    // sense/eat skip the parcel block) → byte-identical. Flip on to give the VISION genes a payoff: discrete,
    // high-value, perishable, smell-less motes that only eyes can find + intercept. All randomness is on a
    // dedicated forked RNG, so even ON the organism stream stays byte-identical (only the sim state diverges).
    parcelsEnabled: false,
    parcelCapacity: 64, // up to 64 simultaneous motes drifting across the archipelago
    parcelSpawnInterval: 10, // one new parcel every 10 ticks (up to the cap)
    parcelEnergy: 60, // a big payoff — ~a full repro-bar's worth, so a sight-guided intercept clearly pays
    parcelLifetime: 400, // perishable: a parcel persists ~400 ticks then vanishes (the pool turns over)
    parcelDecay: 0.1, // slow energy bleed (also expires it if lifetime is long)
    parcelDriftMult: 1, // drift at the full local flow velocity (needs flowStrength>0 to actually move)
    parcelAppeal: 1, // sight pull toward a parcel (≈ the creature-appeal scale)
    parcelEatRange: 8, // intercept reach to consume a parcel
    // Clustered parcel spawning: OFF by default (uniform spawn = the 2-draw legacy path, cluster RNG never
    // advances) → byte-identical. Flip on (with parcelsEnabled) to concentrate the same parcel budget into a
    // few hotspots so seeing FAR to spot a distant jackpot pays — the lever that revives VISION_RANGE.
    parcelClustering: false,
    parcelClusterCount: 8, // spawn hotspots when clustering is on
    parcelClusterRadius: 120, // parcels land within this radius (world units) of a cluster center
    // Interoceptive hunger brain input (lever E2): OFF = byte-identical (hunger synapses unseeded/unread).
    // Flip on to give the brain its own energy-deficit sense, evolving from a neutral 0.
    hungerSense: false,
    // Hunger-gated food drive (satiation → wander): OFF = byte-identical (food gradient never scaled).
    // Flip on so a full creature stops climbing the food gradient and drifts on its other drives.
    hungerGatesFood: false,
    foodGateThreshold: 0.4, // ease off food-seeking only in the top ~40% of the energy range (unused when gate off)
    foodDriveFloor: 0, // full gate (byte-identical): a fed creature's food drive falls to 0. >0 keeps it relocating.
    // Age / life stages (OFF default: ageStages false → the 2 age genes never draw, neither the senescence
    // tax nor the maturity gate fires → byte-identical). Flip on to make `age` a real axis: juvenile breeding
    // lock + elder senescence decline + a costed longevity gene. Rate/cost/centers tuned via life-history probe.
    ageStages: false,
    senescenceRate: 0.01, // elder basal-tax slope per tick past SENESCENCE_AGE (only read when ageStages)
    maturityAge: 100, // MATURITY_AGE gene center (ticks): ≈ under the first-breed median → the gate bites
    senescenceAge: 400, // SENESCENCE_AGE gene center (ticks): ≈ mean lifespan → only the long tail gets capped
    senescenceAgeCost: 0.0005, // basal upkeep per unit SENESCENCE_AGE above center (the longevity tradeoff)
    display: 0.5,
    preference: 0.5,
    ...overrides,
  };
}

/** The one config the demo, harness, and tests all use. */
export const DEMO_CONFIG: Config = defaultConfig();
