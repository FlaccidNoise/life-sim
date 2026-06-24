/**
 * Genome — the heritable per-creature traits, mutated at birth. This is the foundation of evolution:
 * offspring inherit the parent's genome plus small Gaussian mutations, and pure-economic selection
 * (survive + stay fed → reproduce) does the rest. No fitness function.
 *
 * The "brain" starts as a minimal linear sensor→motor map (a 2-input → 2-output net): the food
 * gradient in the heading frame (forward, lateral) drives turn + thrust. Six weights. Later bricks
 * grow this into a recurrent hidden-layer net and add within-life (Baldwin) learning — the gene layout
 * is addressed by name so adding genes won't scramble existing ones.
 *
 * `hue` is a VISIBLE-heredity gene (pillar 4): it drives the creature's render color, so a lineage
 * shares a color and a successful mutation's color visibly spreads through the population.
 */
import { type Rng } from './rng';
import { type Config } from './config';

/**
 * Evolvable SCALAR genes — per-creature continuous traits beyond the brain weights. Each is heritable
 * (seeded around a founder CENTER from config, mutated at birth, clamped to a range) and read by the
 * system it governs:
 *   - MAX_SPEED   → per-creature speed ceiling (physics.integrate)
 *   - EAT_RATE    → per-creature ingestion rate (economy.metabolize)
 *   - SENSE_RANGE → gradient sample half-step / smell range (sense.senseFood)
 *   - SIZE        → body size: render radius + the big-eats-small predation gate (economy.hunt); costed
 *   - MAX_TURN    → per-creature turn ceiling (brain.steer)
 *   - MAX_THRUST  → per-creature thrust ceiling (brain.steer)
 *   - METAB_EFF   → metabolic efficiency, a TRADEOFF: basal ×= e and thrust ×= e (cheap+weak ↔ costly+strong)
 *   - REPRO_THRESHOLD / SATIATED_THRESHOLD / BIRTH_ENERGY → life-history (r/K): the reproductive bars +
 *     offspring provisioning. Read per-creature in economy/learn; their "cost" is the strategy tradeoff.
 *
 * The five "more-is-costly" genes (maxSpeed, eatRate, senseRange, maxTurn, maxThrust) carry a `costKey`:
 * a value ABOVE its center adds basal upkeep (geneUpkeep). The rest have costKey null — SIZE (no sim
 * benefit yet), METAB_EFF (cost is the multiplicative basal×e), and the three life-history genes (their
 * cost is the inherent r/K tradeoff). Adding a new scalar gene = an enum slot + a spec entry.
 */
export const ScalarGene = {
  MAX_SPEED: 0,
  EAT_RATE: 1,
  SENSE_RANGE: 2,
  SIZE: 3,
  MAX_TURN: 4,
  MAX_THRUST: 5,
  METAB_EFF: 6,
  // Life-history genes (r/K strategy): the per-creature reproductive bars + offspring provisioning.
  REPRO_THRESHOLD: 7, // survival↔reproductive boundary (the learn-gate floor; where you land post-breed)
  SATIATED_THRESHOLD: 8, // "full" bar: stop eating + breed-at-the-top + peak learning
  BIRTH_ENERGY: 9, // energy each offspring is provisioned with (parent pays this + reproOverhead)
  // Trophic genes: where you sit on the herbivore↔carnivore axis and how hard you bite.
  DIET: 10, // 0 = pure grazer (graze ×(1−diet)) … 1 = pure hunter (bite drain ×diet); evolvable role
  DAMAGE: 11, // bite strength — energy drained per hunt tick (× diet); costed, so predators evolve teeth
  // Vision genes: each creature SEES nearby creatures (appeal-signed sight vector → brain). All costed
  // (sight is metabolically expensive) so predators/prey evolve different eyes — there are no free eyes.
  VISION_RANGE: 12, // how far it can see other creatures (world units)
  VISION_FOV: 13, // half-angle of the vision cone (rad): narrow tunnel ahead ↔ wide all-around
  VISION_ACUITY: 14, // sight clarity — multiplies the strength of the sight signal into the brain
  // Social gene: shelter-seeking. Weights an attraction toward LARGER, SIMILAR-diet creatures into the
  // sight vector (sense.senseCreatures), so small prey cluster around big herbivores. Costed (no free
  // herding instinct). Diet-similarity gates it so prey shelter near big grazers but still flee predators.
  SHELTER_DRIVE: 15,
  // Social gene: schooling/cohesion. Weights an attraction toward creatures of a SIMILAR HUE (shared
  // lineage/kin) into the sight vector, so like-colored creatures herd into visible schools. Costed (no
  // free schooling). Bounded so it can't override fleeing a threat (the appeal term still dominates there).
  COHESION_DRIVE: 16,
  // Forage gene (lever B): where this creature sits on the two-channel resource axis. 0 = channel-A
  // specialist … 1 = channel-B specialist, 0.5 = generalist. Read by metabolize (per-channel graze split
  // + specialization bonus) and senseFood (preference-blended smell) ONLY when cfg.foodChannels===2; with
  // a single channel the gene is pinned at its center and never drawn from RNG (determinism stays byte-
  // identical). Appended LAST so the existing genes' RNG draws are unchanged.
  FORAGE_PREF: 17,
  // F1 multi-resource (gated cfg.foodChannels>=3): a 3-way resource simplex needs a SECOND preference DOF,
  // plus per-channel smell ranges (channel A reuses SENSE_RANGE at slot 2 — no SENSE_RANGE_A, to avoid a
  // double-taxed unused gene). All appended at the TAIL so every prior gene's RNG draw is unchanged; each
  // skips its whole draw when foodChannels<3, keeping the stream byte-identical for the N<=2 ablation.
  FORAGE_PREF_C: 18, // with FORAGE_PREF, a barycentric position over {A,B,C}
  SENSE_RANGE_B: 19, // smell range for channel B (tradeoff vs A/C; costed)
  SENSE_RANGE_C: 20, // smell range for channel C
  // F2 pheromone (gated cfg.pheromoneEnabled): how strongly this creature deposits into the pheromone field.
  PHERO_DEPOSIT: 21,
  // Age / life stages (gated cfg.ageStages): the juvenile→adult and adult→elder age boundaries, in ticks.
  // Tail-gated like FORAGE_PREF/PHERO_DEPOSIT → drawn only when ageStages, so the OFF stream is byte-identical.
  MATURITY_AGE: 22, // below this age a creature can't breed (juvenile); uncosted (cost = delayed breeding)
  SENESCENCE_AGE: 23, // at/above this age the basal senescence tax begins (elder); costed (longevity tradeoff)
  // Sexual-selection genes (life-sim-xa90): a pure mate signal + the preference for it. Heritable, 0..1.
  // DISPLAY is what mates are chosen on; PREFERENCE is the display value this creature finds attractive.
  // Neither is an ecological/species axis, so geneticDistance weights them 0. Both now surface on the
  // radar's "Social & mating" lens (display/pref spokes); DISPLAY still has NO render cue on the dot and
  // PREFERENCE is not an NN input — those remain wired-but-invisible gaps for the visibility phase.
  DISPLAY: 24,
  PREFERENCE: 25,
} as const;
export const SCALAR_GENE_COUNT = 26;

/** Minimum reproductive-band width: satiated is read as max(satiatedGene, reproGene + this) so the two
 *  life-history bars can mutate independently without inverting (which would break the learn gate). */
export const MIN_BAND = 5;

interface ScalarGeneSpec {
  /** Config key supplying the founder center + the cost baseline for this gene. */
  centerKey:
    | 'maxSpeed'
    | 'eatRate'
    | 'senseStep'
    | 'cellRadius'
    | 'maxTurn'
    | 'maxThrust'
    | 'metabolicEfficiency'
    | 'reproThreshold'
    | 'satiatedThreshold'
    | 'birthEnergy'
    | 'diet'
    | 'damage'
    | 'visionRange'
    | 'visionFov'
    | 'visionAcuity'
    | 'shelterDrive'
    | 'cohesionDrive'
    | 'foragePref'
    | 'foragePrefC'
    | 'pheroDeposit'
    | 'maturityAge'
    | 'senescenceAge'
    | 'display'
    | 'preference';
  /** Config key for the per-unit-above-center basal cost coeff, or null for a non-upkeep gene. */
  costKey:
    | 'maxSpeedCost'
    | 'eatRateCost'
    | 'senseRangeCost'
    | 'maxTurnCost'
    | 'maxThrustCost'
    | 'sizeCost'
    | 'damageCost'
    | 'visionRangeCost'
    | 'visionFovCost'
    | 'visionAcuityCost'
    | 'shelterDriveCost'
    | 'cohesionDriveCost'
    | 'pheroDepositCost'
    | 'senescenceAgeCost'
    | null;
  /** Hard clamp range the gene value is kept within (at seed and at every mutation). */
  min: number;
  max: number;
}

// Order MUST match the ScalarGene enum (index = gene id).
// SIZE is now PHYSICAL: it gates predation (big-eats-small, see economy.hunt) so a big body is a refuge
// from small hunters + a bigger bite — therefore it's costed (sizeCost upkeep), making size a real
// tradeoff (safe-but-expensive ↔ small-cheap-fecund). METAB_EFF stays costKey null — its cost is the
// multiplicative basal×e instead.
export const SCALAR_GENE_SPECS: readonly ScalarGeneSpec[] = [
  { centerKey: 'maxSpeed', costKey: 'maxSpeedCost', min: 1, max: 20 },
  { centerKey: 'eatRate', costKey: 'eatRateCost', min: 0.2, max: 8 },
  { centerKey: 'senseStep', costKey: 'senseRangeCost', min: 8, max: 256 },
  { centerKey: 'cellRadius', costKey: 'sizeCost', min: 2, max: 32 }, // SIZE: physical (refuge + bite + speed/move/store couplings), so costed; max 2× for big-body strategies
  { centerKey: 'maxTurn', costKey: 'maxTurnCost', min: 0.05, max: 1.2 },
  { centerKey: 'maxThrust', costKey: 'maxThrustCost', min: 0.1, max: 4 },
  { centerKey: 'metabolicEfficiency', costKey: null, min: 0.5, max: 1.5 },
  // Life-history genes — costKey null (no upkeep; their "cost" is the strategy tradeoff itself).
  { centerKey: 'reproThreshold', costKey: null, min: 20, max: 120 },
  { centerKey: 'satiatedThreshold', costKey: null, min: 40, max: 220 },
  { centerKey: 'birthEnergy', costKey: null, min: 8, max: 90 },
  // Trophic genes. DIET costKey null (its cost is the graze↔hunt income tradeoff); its center (0.5) is
  // only the mutation-step reference — founders are seeded BIMODALLY (herbivores ~0 + a predator
  // fraction ~0.9) in world.seedWorld, not around the center. DAMAGE is costed (teeth cost upkeep).
  { centerKey: 'diet', costKey: null, min: 0, max: 1 },
  { centerKey: 'damage', costKey: 'damageCost', min: 0, max: 20 },
  // Vision genes — ALL costed (no free eyes). Range cap raised to 256u (~21 hash cells) for the
  // long-sight experiment: the sight scan radius now DERIVES from each creature's range (sense.ts), so
  // big eyes see far (and cost more cells to scan). FOV is a half-angle [~6°, 180°]; acuity scales signal.
  { centerKey: 'visionRange', costKey: 'visionRangeCost', min: 0, max: 256 },
  { centerKey: 'visionFov', costKey: 'visionFovCost', min: 0.1, max: 3.14159 },
  { centerKey: 'visionAcuity', costKey: 'visionAcuityCost', min: 0, max: 3 },
  // SHELTER_DRIVE — costed social attraction toward bigger same-guild creatures (no free herding).
  // Center > 0 so the center-relative mutation step isn't frozen; weakly ON from birth, selection tunes.
  { centerKey: 'shelterDrive', costKey: 'shelterDriveCost', min: 0, max: 0.4 },
  // COHESION_DRIVE — costed attraction toward same-hue (lineage) creatures → schools. Center > 0 so the
  // gene can mutate; bounded so it stays comparable to the chase/flee appeal rather than swamping it.
  { centerKey: 'cohesionDrive', costKey: 'cohesionDriveCost', min: 0, max: 2 },
  // FORAGE_PREF (lever B) — position on the two-channel resource axis [0=A specialist … 1=B specialist].
  // costKey null: there's no upkeep for a preference; the tradeoff is the opportunity cost of NOT eating
  // the other channel (the specialization bonus in metabolize rewards committing). Appended LAST so the
  // RNG draws for every prior gene are unchanged; only drawn at all when cfg.foodChannels===2 (see below).
  { centerKey: 'foragePref', costKey: null, min: 0, max: 1 },
  // F1: 2nd preference DOF (null cost, like FORAGE_PREF) + channel B/C smell ranges (costed like SENSE_RANGE).
  { centerKey: 'foragePrefC', costKey: null, min: 0, max: 1 },
  { centerKey: 'senseStep', costKey: 'senseRangeCost', min: 8, max: 256 },
  { centerKey: 'senseStep', costKey: 'senseRangeCost', min: 8, max: 256 },
  // F2: pheromone deposit strength — costed (no free chemical broadcast); the tradeoff for signalling.
  { centerKey: 'pheroDeposit', costKey: 'pheroDepositCost', min: 0, max: 5 },
  // Age / life stages — MATURITY_AGE uncosted (its cost is the opportunity cost of delayed breeding);
  // SENESCENCE_AGE costed (senescenceAgeCost) so a durable long-lived body pays upkeep — longevity is a real
  // tradeoff, not free upward drift. Appended at the TAIL so every prior gene's RNG draw is unchanged.
  { centerKey: 'maturityAge', costKey: null, min: 0, max: 800 },
  { centerKey: 'senescenceAge', costKey: 'senescenceAgeCost', min: 50, max: 4000 },
  // Sexual-selection genes — costKey null (no upkeep in v1; DISPLAY's "cost" is being conspicuous to mates).
  { centerKey: 'display', costKey: null, min: 0, max: 1 },
  { centerKey: 'preference', costKey: null, min: 0, max: 1 },
];

/** Tail-gated scalar genes: each takes its founder CENTER (seed) / parent value (mutate) WITHOUT drawing
 *  RNG when its gate is off, so the draw stream is byte-identical for any OFF subset (the FORAGE_PREF
 *  pattern generalized). Every gated gene lives at the tail (17..23) after all always-drawn genes; the
 *  gates are monotonic in foodChannels so widening FORAGE_PREF's gate from `!==2` to `<2` preserves the
 *  channels=1 (skip) and channels=2 (draw) streams exactly. */
export function scalarGeneGatedOff(g: number, cfg: Config): boolean {
  if (g === ScalarGene.FORAGE_PREF) return cfg.foodChannels < 2;
  if (
    g === ScalarGene.FORAGE_PREF_C ||
    g === ScalarGene.SENSE_RANGE_B ||
    g === ScalarGene.SENSE_RANGE_C
  )
    return cfg.foodChannels < 3;
  if (g === ScalarGene.PHERO_DEPOSIT) return !cfg.pheromoneEnabled;
  if (g === ScalarGene.MATURITY_AGE || g === ScalarGene.SENESCENCE_AGE) return !cfg.ageStages;
  return false;
}

function clampTo(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/** Seed a founder's scalar genes around each config center (spread = founderSigma·center, clamped). */
export function seedScalarGenes(genes: Float32Array, slot: number, rng: Rng, cfg: Config): void {
  const base = slot * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const spec = SCALAR_GENE_SPECS[g]!;
    const center = cfg[spec.centerKey];
    // Tail-gated genes (FORAGE_PREF, the F1 multi-resource genes, PHERO_DEPOSIT) are pinned at their center
    // WITHOUT drawing RNG when their feature is off — keeping the seed stream byte-identical (see
    // scalarGeneGatedOff). They live at the tail so skipping their draw never shifts an earlier gene.
    if (scalarGeneGatedOff(g, cfg)) {
      genes[base + g] = center;
      continue;
    }
    // FORAGE_PREF seeds UNIFORM over [0,1] (not clustered at the 0.5 center) so the founding pool already
    // holds committed A- and B-specialists, not just generalists. With the generalist penalty on, those
    // specialists thrive from t=0 and carry the population while it sorts into niches — without the spread an
    // all-generalist founding pool eats the penalty en masse and crashes before specialists emerge. One RNG
    // draw (rng.float()), like the gaussian path it replaces, so it stays at the tail-safe draw position.
    if (g === ScalarGene.FORAGE_PREF) {
      genes[base + g] = rng.float();
      continue;
    }
    genes[base + g] = clampTo(
      center + rng.gaussian(0, cfg.founderSigma * center),
      spec.min,
      spec.max,
    );
  }
}

/** Copy a parent's scalar genes to a child with Gaussian mutation (step = mutationSigma·center, clamped). */
export function mutateScalarGenes(
  genes: Float32Array,
  child: number,
  parent: number,
  rng: Rng,
  cfg: Config,
): void {
  const cb = child * SCALAR_GENE_COUNT;
  const pb = parent * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const spec = SCALAR_GENE_SPECS[g]!;
    const center = cfg[spec.centerKey];
    // Tail-gated genes inherit the parent value with NO mutation draw when their feature is off (mirrors
    // seedScalarGenes — keeps the birth RNG stream byte-identical for any OFF subset).
    if (scalarGeneGatedOff(g, cfg)) {
      genes[cb + g] = genes[pb + g]!;
      continue;
    }
    genes[cb + g] = clampTo(
      genes[pb + g]! + rng.gaussian(0, cfg.mutationSigma * center),
      spec.min,
      spec.max,
    );
  }
}

/** Sexual crossover of scalar genes: each gene is independently inherited from mom OR dad (uniform pick —
 *  preserves discrete allele combinations, unlike a blend, which speciation needs), then mutated + clamped
 *  exactly like mutateScalarGenes. Gated genes (forage/phero/age off) inherit from MOM with no draw, so
 *  the gating still skips RNG. One pick-draw per active gene; called per child in ascending mother order. */
export function crossoverScalarGenes(
  genes: Float32Array,
  child: number,
  mom: number,
  dad: number,
  rng: Rng,
  cfg: Config,
): void {
  const cb = child * SCALAR_GENE_COUNT;
  const mb = mom * SCALAR_GENE_COUNT;
  const db = dad * SCALAR_GENE_COUNT;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const spec = SCALAR_GENE_SPECS[g]!;
    if (scalarGeneGatedOff(g, cfg)) {
      genes[cb + g] = genes[mb + g]!; // gated → inherit from mom, no draw
      continue;
    }
    const parentBase = rng.float() < 0.5 ? mb : db; // uniform per-gene pick
    const center = cfg[spec.centerKey];
    genes[cb + g] = clampTo(
      genes[parentBase + g]! + rng.gaussian(0, cfg.mutationSigma * center),
      spec.min,
      spec.max,
    );
  }
}

/** Sexual brain inheritance. v1: inherit the MOTHER's brain (+ hue), mutated — a modular seam. A separate
 *  session is changing the NN topology; once it lands this becomes real per-weight brain crossover with the
 *  dad parameter, without touching reproduce(). */
export function crossoverBrain(
  brain: Float32Array,
  hue: Float32Array,
  child: number,
  mom: number,
  _dad: number,
  rng: Rng,
  sigma: number,
  hueSigma: number,
  wallSenseGenes: boolean,
  flowSenseGenes: boolean,
  hungerSense: boolean,
  pheroSenseGenes: boolean,
): void {
  mutateGenome(
    brain, hue, child, mom, rng, sigma, hueSigma,
    wallSenseGenes, flowSenseGenes, hungerSense, pheroSenseGenes,
  );
}

/** Extra basal upkeep this creature pays for its costed genes: Σ max(0, gene − center)·costCoeff. */
export function geneUpkeep(genes: Float32Array, slot: number, cfg: Config): number {
  const base = slot * SCALAR_GENE_COUNT;
  let cost = 0;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    const spec = SCALAR_GENE_SPECS[g]!;
    if (spec.costKey === null) continue; // non-upkeep gene (metabolic efficiency is multiplicative)
    const over = genes[base + g]! - cfg[spec.centerKey];
    if (over > 0) cost += over * cfg[spec.costKey];
  }
  return cost;
}

/** Genetic distance between two creatures: normalised L2 over the ECOLOGICAL scalar genes (DIET up-
 *  weighted by cfg.mateDietWeight so trophic role dominates → predator/prey reproductive isolation falls
 *  out of the metric). DISPLAY/PREFERENCE are sexual-selection axes, NOT species axes, so they weight 0.
 *  A brain-weight term can be added here when the NN topology change lands (per-weight distance over the
 *  brain block) without touching this function's callers. This is the compatibility metric the mate gate
 *  thresholds on. */
export function geneticDistance(genes: Float32Array, a: number, b: number, cfg: Config): number {
  const ab = a * SCALAR_GENE_COUNT;
  const bb = b * SCALAR_GENE_COUNT;
  let sum = 0;
  for (let g = 0; g < SCALAR_GENE_COUNT; g++) {
    if (g === ScalarGene.DISPLAY || g === ScalarGene.PREFERENCE) continue; // sexual axes ≠ species axes
    const spec = SCALAR_GENE_SPECS[g]!;
    const range = spec.max - spec.min || 1;
    const d = (genes[ab + g]! - genes[bb + g]!) / range;
    const w = g === ScalarGene.DIET ? cfg.mateDietWeight : 1;
    sum += w * d * d;
  }
  return Math.sqrt(sum);
}

/** Brain weight layout (index into the per-creature brain block). Two sensory gradients in the heading
 *  frame drive turn + thrust: the FOOD gradient (chemotaxis) and the SIGHT vector (appeal-signed pull
 *  toward edible creatures / away from threats). Sight weights seed at 0 so vision starts neutral and
 *  evolves — a predator evolves a positive sight response (chase), prey evolve one too (flee). */
export const Brain = {
  LAT_TURN: 0, // lateral food gradient → turn
  FWD_TURN: 1, // forward food gradient → turn
  LAT_THRUST: 2, // lateral → thrust
  FWD_THRUST: 3, // forward → thrust (climb the gradient)
  TURN_BIAS: 4,
  THRUST_BIAS: 5, // baseline cruise
  SIGHT_LAT_TURN: 6, // lateral sight vector → turn
  SIGHT_FWD_TURN: 7, // forward sight vector → turn
  SIGHT_LAT_THRUST: 8, // lateral sight → thrust
  SIGHT_FWD_THRUST: 9, // forward sight → thrust (chase prey / flee predators)
  // Wall-sense weights: wall-proximity vector (lateral, forward) in the heading frame → turn + thrust.
  // Seed at 0 and only drawn when the world HAS walls (wallSenseGenes), so a wall-less world stays
  // byte-identical. Steer wires these in; here they're allocated + gated only.
  WALL_LAT_TURN: 10,
  WALL_FWD_TURN: 11,
  WALL_LAT_THRUST: 12,
  WALL_FWD_THRUST: 13,
  // Flow-sense weights: flow-transient vector (lateral, forward) → turn + thrust. Gated on flowSenseGenes.
  FLOW_LAT_TURN: 14,
  FLOW_FWD_TURN: 15,
  FLOW_LAT_THRUST: 16,
  FLOW_FWD_THRUST: 17,
  // Interoceptive HUNGER input (lever E2): the creature senses its own energy deficit and can steer on it.
  // These two synapses, and their seed/mutation RNG, are LIVE only when cfg.hungerSense is on (else the
  // weights stay 0 and consume no RNG — see seedGenome/mutateGenome). Kept LAST so each gated block (wall,
  // flow, hunger) consumes RNG only when on; with all three off the draw sequence is the BRAIN_CORE_GENES
  // pre-feature stream, byte-identical to legacy.
  HUNGER_TURN: 18, // hunger scalar → turn (e.g. wander/cast more when starving)
  HUNGER_THRUST: 19, // hunger scalar → thrust (e.g. forage harder when starving)
  // F2 identity-bearing scent: 4 channels × (lat/fwd × turn/thrust) = 16 synapses. The per-channel
  // gradient ∇P_c (lateral, forward) in the heading frame → turn + thrust. Gated on pheroSenseGenes; seed
  // at 0 so evolution picks each channel's SIGN — climb prey-scent / descend predator-scent / cluster on
  // kin-hue. Per-channel base = PHERO_C0_LAT_TURN+c*4. These 16 weights ALSO feed the hidden layer (the 8
  // SCENT_C* HiddenInput slots) — the same dual linear+hidden path every other sense uses.
  PHERO_C0_LAT_TURN: 20,
  PHERO_C0_FWD_TURN: 21,
  PHERO_C0_LAT_THRUST: 22,
  PHERO_C0_FWD_THRUST: 23,
  PHERO_C1_LAT_TURN: 24,
  PHERO_C1_FWD_TURN: 25,
  PHERO_C1_LAT_THRUST: 26,
  PHERO_C1_FWD_THRUST: 27,
  PHERO_C2_LAT_TURN: 28,
  PHERO_C2_FWD_TURN: 29,
  PHERO_C2_LAT_THRUST: 30,
  PHERO_C2_FWD_THRUST: 31,
  PHERO_C3_LAT_TURN: 32,
  PHERO_C3_FWD_TURN: 33,
  PHERO_C3_LAT_THRUST: 34,
  PHERO_C3_FWD_THRUST: 35,
  // Eat-gate OUTPUT (slice B): a 0..1 sigmoid throttle on grazing intake that ALSO costs mobility (eating
  // slows the body), so eating is a decision — graze (fed, slow, catchable) vs lift the head to flee. Reads
  // food + sight + bias. Seeded to default-eat (high bias) with a threat→suppress weight so prey lift their
  // heads when a predator is ahead, then evolution/learning refine it. Always present (on-by-default policy).
  EAT_GATE_BIAS: 36,
  EAT_GATE_FWD: 37, // food gradient fwd → eat more when food is ahead
  EAT_GATE_LAT: 38,
  EAT_GATE_SIGHT_FWD: 39, // appeal-signed sight fwd → keep eating toward appeal, lift head from a threat ahead
  EAT_GATE_SIGHT_LAT: 40,
  // Interoceptive AGE input (slice C): the creature's maturity (min(age/ageNorm,1), 0=newborn…1=old) drives
  // turn + thrust on its own synapses, so life-stage behaviour can evolve. Always present (on-by-default).
  AGE_TURN: 41,
  AGE_THRUST: 42, // seeded slightly + so older creatures roam a touch more (restless elders); evolution tunes
  // Interoceptive REPRO-READINESS input (slice D): clamp((energy−reproThreshold)/(satiatedBar−reproThreshold),
  // 0,1) — 0 while just surviving … 1 near the breeding bar — on its own synapses. Distinct from hunger (it
  // is clamped to the breeding BAND, not the full bar). Seeded 0; the repro-timing response evolves.
  READINESS_TURN: 43,
  READINESS_THRUST: 44,
} as const;
/** Senses-core brain weights (food + sight) — the count present before walls/flow/hunger, and the RNG-draw
 *  count when all gated blocks are off. Each gated block extends the array but draws RNG only when on. */
export const BRAIN_CORE_GENES = 10;
/** Number of named (non-hidden) brain weights — the linear sensor→motor map above (slots 0..44). The hidden
 *  layer's weight blocks start here. */
export const NAMED_BRAIN_GENES = 45;

/** Order of the 20 scalars fed into the hidden layer (slice E) — the same heading-frame inputs turn/thrust
 *  read, plus a constant bias. The single pre-merge PHERO pair is replaced by the 4 identity-bearing scent
 *  channels (8 inputs: C0..C3 × {fwd,lat}) so scent feeds the NONLINEAR layer, not just the linear synapses.
 *  Index into the W1 input→hidden block. */
export const HiddenInput = {
  FOOD_FWD: 0,
  FOOD_LAT: 1,
  SIGHT_FWD: 2,
  SIGHT_LAT: 3,
  WALL_FWD: 4,
  WALL_LAT: 5,
  FLOW_FWD: 6,
  FLOW_LAT: 7,
  SCENT_C0_FWD: 8,
  SCENT_C0_LAT: 9,
  SCENT_C1_FWD: 10,
  SCENT_C1_LAT: 11,
  SCENT_C2_FWD: 12,
  SCENT_C2_LAT: 13,
  SCENT_C3_FWD: 14,
  SCENT_C3_LAT: 15,
  HUNGER: 16,
  AGE: 17,
  READINESS: 18,
  BIAS: 19,
} as const;

/** Hidden layer (slice E): a fixed H-unit tanh layer adding a NONLINEAR correction ON TOP of the linear
 *  sensor→motor map (skip-connection / residual), giving the brain conditional logic ("flee only if a
 *  predator is close AND I'm cornered") the single linear layer cannot express. H is a COMPILE-TIME constant
 *  (it sizes the genome stride, so it can't be a live knob). Two contiguous weight blocks after the named
 *  genes, addressed by index math:
 *    - W1 input→hidden:  HIDDEN_W1 + i*HIDDEN_UNITS + j     (HIDDEN_INPUTS × HIDDEN_UNITS)
 *    - W2 hidden→output: HIDDEN_W2 + j*HIDDEN_OUTPUTS + o   (HIDDEN_UNITS × HIDDEN_OUTPUTS)
 *  Inputs ordered by HiddenInput; outputs are turn(0)/thrust(1)/eatGate(2). All seed 0 (+founder noise breaks
 *  symmetry). Plasticity is asymmetric: input→hidden is EVOLVED-only (frozen within life — the Hebbian rule
 *  can't credit-assign through a hidden unit), hidden→output LEARNS. Gated by cfg.hiddenLayer (the forward
 *  pass is skipped when off); the weights are always drawn (on-by-default policy). */
export const HIDDEN_UNITS = 4; // escape hatch: bump to 6 only if 4 bottlenecks — not speculatively
export const HIDDEN_INPUTS = 20; // 8 sense pairs (food/sight/wall/flow) + 8 scent (C0..C3 × fwd/lat) + hunger/age/readiness/bias
export const HIDDEN_OUTPUTS = 3; // turn=0, thrust=1, eatGate=2
export const HIDDEN_W1 = NAMED_BRAIN_GENES; // input→hidden block start (slot 45)
export const HIDDEN_W2 = HIDDEN_W1 + HIDDEN_INPUTS * HIDDEN_UNITS; // hidden→output block start (slot 125)

/** Mood-glow output (slice F): bioluminescence = sigmoid(GLOW_BIAS + Σ_j hidden_j·GLOW_HID_j), reading the
 *  hidden "mood" layer + a bias. DISPLAY-ONLY (no motor/energy effect) and EVOLVE-ONLY (no within-life
 *  learning). The hidden→glow weights seed at 0 + founder noise, so each LINEAGE drifts to its OWN glow
 *  trigger — different species evolve different glow mechanisms. Hue stays for lineage; glow is a separate
 *  channel. Always drawn (on-by-default policy); the forward pass is gated on cfg.moodGlow. */
export const GLOW_BIAS = HIDDEN_W2 + HIDDEN_UNITS * HIDDEN_OUTPUTS; // 137 (after the hidden W2 block)
export const GLOW_HID = GLOW_BIAS + 1; // 138; hidden→glow weights (HIDDEN_UNITS of them)

/** GLOW-SENSE weights (slice F3): the glow-field gradient ∇G (lateral, forward) in the heading frame →
 *  turn + thrust — the receiver side of the glow communication channel (the deposit side reads store.glow).
 *  A tail block of 4 weights AFTER the hidden→glow block. They have a REAL input (the sensed gradient), so
 *  unlike the display-only mood-glow weights they both EVOLVE and LEARN (eligibility traces in steer). Seed
 *  at 0 so evolution picks the SIGN — approach the glowing crowd or flee it. Always drawn (on-by-default,
 *  like the eat-gate/age/readiness/glow blocks), so the draw stream is consistent whether glowSense is on. */
export const GLOW_SENSE_LAT_TURN = GLOW_HID + HIDDEN_UNITS; // 142
export const GLOW_SENSE_FWD_TURN = GLOW_SENSE_LAT_TURN + 1; // 143
export const GLOW_SENSE_LAT_THRUST = GLOW_SENSE_LAT_TURN + 2; // 144
export const GLOW_SENSE_FWD_THRUST = GLOW_SENSE_LAT_TURN + 3; // 145
export const BRAIN_GENES = GLOW_SENSE_LAT_TURN + 4; // 146

/** Founder brain ≈ the hand-tuned chemotaxis controller (turn toward lateral food, thrust up-gradient,
 *  gentle cruise) + ACTIVE sight: turn toward & thrust along the appeal-signed sight vector. Because that
 *  vector already points TOWARD prey (predators) and AWAY from threats (prey), one pair of positive
 *  weights gives chase AND flee from birth — so vision drives behavior immediately instead of waiting
 *  for the sight weights to evolve up from 0. Founders seed near this + noise. The 8 env-sense weights
 *  (wall + flow) seed at 0 — neutral — so the response is evolved/learned, not hand-set (and a world with
 *  walls/flow OFF never draws them, staying byte-identical). Layout order = Brain enum:
 *  [LAT_TURN, FWD_TURN, LAT_THRUST, FWD_THRUST, TURN_BIAS, THRUST_BIAS,
 *   SIGHT_LAT_TURN, SIGHT_FWD_TURN, SIGHT_LAT_THRUST, SIGHT_FWD_THRUST,
 *   WALL_LAT_TURN, WALL_FWD_TURN, WALL_LAT_THRUST, WALL_FWD_THRUST,
 *   FLOW_LAT_TURN, FLOW_FWD_TURN, FLOW_LAT_THRUST, FLOW_FWD_THRUST, HUNGER_TURN, HUNGER_THRUST,
 *   PHERO_C0_LAT_TURN … PHERO_C3_FWD_THRUST (16),
 *   EAT_GATE_BIAS, EAT_GATE_FWD, EAT_GATE_LAT, EAT_GATE_SIGHT_FWD, EAT_GATE_SIGHT_LAT,
 *   AGE_TURN, AGE_THRUST, READINESS_TURN, READINESS_THRUST]. The 16 scent weights seed at 0; the eat-gate
 *   seeds BIAS 4 (sigmoid≈0.98 → eat ~fully by default) + SIGHT_FWD 2 (a threat ahead pulls the gate down →
 *   lift head + regain mobility); the age input seeds AGE_THRUST 0.3 (older → a touch more thrust), AGE_TURN
 *   0; the repro-readiness pair seeds 0 (the repro-timing response evolves); every other weight 0. */
const FOUNDER_BRAIN: readonly number[] = [
  // core (0-9): chemotaxis + sight
  1.2, 0, 0, 1.5, 0, 0.3, 1.0, 0, 0, 1.2,
  // wall (10-13), flow (14-17), hunger (18-19) — neutral
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  // scent C0..C3 (20-35) — 16 weights seed 0 (evolution picks each channel's sign)
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  // eat-gate (36-40): BIAS 4, FWD 0, LAT 0, SIGHT_FWD 2, SIGHT_LAT 0
  4, 0, 0, 2, 0,
  // age (41-42): AGE_TURN 0, AGE_THRUST 0.3 ; readiness (43-44): 0, 0
  0, 0.3, 0, 0,
  // Hidden layer (slice E): HIDDEN_INPUTS·HIDDEN_UNITS (80) input→hidden + HIDDEN_UNITS·HIDDEN_OUTPUTS (12)
  // hidden→output weights, all seeded 0 — the founder Gaussian noise at seed breaks the unit symmetry.
  ...new Array<number>(HIDDEN_INPUTS * HIDDEN_UNITS + HIDDEN_UNITS * HIDDEN_OUTPUTS).fill(0),
  // Mood-glow (slice F): GLOW_BIAS dim baseline (sigmoid(−1.5)≈0.18 — glow is the exception, not the norm);
  // the HIDDEN_UNITS hidden→glow weights seed 0 (founder noise → each lineage drifts to its own trigger).
  -1.5,
  ...new Array<number>(HIDDEN_UNITS).fill(0),
  // Glow-sense (slice F3): the 4 ∇G turn/thrust weights seed 0 — evolution picks the sign (approach a
  // glowing crowd or flee it). Always drawn (consistent stream); they learn (real input → eligibility).
  ...new Array<number>(4).fill(0),
];

/** Seed a founder's genome: founder brain + Gaussian spread, random hue (lineage colors diverge).
 *  The 8 env-sense weights (wall/flow) and the 2 hunger weights are GATED: a WALL weight is drawn only
 *  when `wallSenseGenes`, a FLOW weight only when `flowSenseGenes`, a HUNGER weight only when `hungerSense`.
 *  When gated off the weight is set to its founder value (0) WITHOUT drawing RNG — so with all three off the
 *  stream is byte-identical to the pre-feature BRAIN_CORE_GENES genome (the ablation gate). */
export function seedGenome(
  brain: Float32Array,
  hue: Float32Array,
  slot: number,
  rng: Rng,
  founderSigma: number,
  wallSenseGenes: boolean,
  flowSenseGenes: boolean,
  hungerSense: boolean,
  pheroSenseGenes: boolean,
): void {
  const base = slot * BRAIN_GENES;
  for (let g = 0; g < BRAIN_GENES; g++) {
    const isWall = g >= Brain.WALL_LAT_TURN && g <= Brain.WALL_FWD_THRUST;
    const isFlow = g >= Brain.FLOW_LAT_TURN && g <= Brain.FLOW_FWD_THRUST;
    const isHunger = g >= Brain.HUNGER_TURN && g <= Brain.HUNGER_THRUST;
    const isPhero = g >= Brain.PHERO_C0_LAT_TURN && g <= Brain.PHERO_C3_FWD_THRUST;
    if (
      (isWall && !wallSenseGenes) ||
      (isFlow && !flowSenseGenes) ||
      (isHunger && !hungerSense) ||
      (isPhero && !pheroSenseGenes)
    ) {
      brain[base + g] = FOUNDER_BRAIN[g]!; // 0, no draw
      continue;
    }
    brain[base + g] = FOUNDER_BRAIN[g]! + rng.gaussian(0, founderSigma);
  }
  hue[slot] = rng.float();
}

/** Copy a parent's genome to a child with Gaussian mutation (the only source of variation). The wall/flow
 *  and hunger weights are GATED exactly as in seedGenome: when their flag is off, the child INHERITS the
 *  parent's weight with NO draw — so all three off keeps the birth stream byte-identical to the pre-feature
 *  engine. */
export function mutateGenome(
  brain: Float32Array,
  hue: Float32Array,
  child: number,
  parent: number,
  rng: Rng,
  sigma: number,
  hueSigma: number,
  wallSenseGenes: boolean,
  flowSenseGenes: boolean,
  hungerSense: boolean,
  pheroSenseGenes: boolean,
): void {
  const cb = child * BRAIN_GENES;
  const pb = parent * BRAIN_GENES;
  for (let g = 0; g < BRAIN_GENES; g++) {
    const isWall = g >= Brain.WALL_LAT_TURN && g <= Brain.WALL_FWD_THRUST;
    const isFlow = g >= Brain.FLOW_LAT_TURN && g <= Brain.FLOW_FWD_THRUST;
    const isHunger = g >= Brain.HUNGER_TURN && g <= Brain.HUNGER_THRUST;
    const isPhero = g >= Brain.PHERO_C0_LAT_TURN && g <= Brain.PHERO_C3_FWD_THRUST;
    if (
      (isWall && !wallSenseGenes) ||
      (isFlow && !flowSenseGenes) ||
      (isHunger && !hungerSense) ||
      (isPhero && !pheroSenseGenes)
    ) {
      brain[cb + g] = brain[pb + g]!; // inherit, no draw
      continue;
    }
    brain[cb + g] = brain[pb + g]! + rng.gaussian(0, sigma);
  }
  let h = hue[parent]! + rng.gaussian(0, hueSigma);
  h -= Math.floor(h); // wrap into [0,1)
  hue[child] = h;
}
