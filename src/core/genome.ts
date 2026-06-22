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
} as const;
export const SCALAR_GENE_COUNT = 18;

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
    | 'foragePref';
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
];

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
    // FORAGE_PREF (lever B) is only a live, evolving trait when the second food channel exists. With one
    // channel it's inert, so pin it at its center WITHOUT drawing from RNG. Because it's the LAST gene,
    // skipping that one draw leaves the seed RNG stream byte-identical to the pre-lever engine — the
    // determinism contract holds whenever foodChannels=1 (the ablation gate).
    if (g === ScalarGene.FORAGE_PREF && cfg.foodChannels !== 2) {
      genes[base + g] = center;
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
    // FORAGE_PREF: inherit the parent value with NO mutation draw when single-channel (see seedScalarGenes
    // — keeps the birth RNG stream byte-identical, so reproduction stays deterministic with foodChannels=1).
    if (g === ScalarGene.FORAGE_PREF && cfg.foodChannels !== 2) {
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
  // Interoceptive HUNGER input (lever E2): the creature senses its own energy deficit and can steer on it.
  // These two synapses, and their seed/mutation RNG, are LIVE only when cfg.hungerSense is on (else the
  // weights stay 0 and consume no RNG — see seedGenome/mutateGenome). HUNGER_TURN/THRUST must stay last so
  // the senses-core layout (g < HUNGER_TURN) is unchanged and the OFF path is byte-identical to pre-E2.
  HUNGER_TURN: 10, // hunger scalar → turn (e.g. wander/cast more when starving)
  HUNGER_THRUST: 11, // hunger scalar → thrust (e.g. forage harder when starving)
} as const;
/** Senses-core brain weights (food + sight) — the count present pre-E2 and the RNG-draw count on the
 *  hungerSense-OFF path. The 2 hunger synapses extend the array to BRAIN_GENES but draw RNG only when on. */
export const BRAIN_CORE_GENES = 10;
export const BRAIN_GENES = 12;

/** Founder brain ≈ the hand-tuned chemotaxis controller (turn toward lateral food, thrust up-gradient,
 *  gentle cruise) + ACTIVE sight: turn toward & thrust along the appeal-signed sight vector. Because that
 *  vector already points TOWARD prey (predators) and AWAY from threats (prey), one pair of positive
 *  weights gives chase AND flee from birth — so vision drives behavior immediately instead of waiting
 *  for the sight weights to evolve up from 0. Founders seed near this + noise. Layout order = Brain enum:
 *  [LAT_TURN, FWD_TURN, LAT_THRUST, FWD_THRUST, TURN_BIAS, THRUST_BIAS,
 *   SIGHT_LAT_TURN, SIGHT_FWD_TURN, SIGHT_LAT_THRUST, SIGHT_FWD_THRUST, HUNGER_TURN, HUNGER_THRUST].
 *  The two hunger weights seed at 0 so hunger starts neutral and evolves (like sight). */
const FOUNDER_BRAIN: readonly number[] = [1.2, 0, 0, 1.5, 0, 0.3, 1.0, 0, 0, 1.2, 0, 0];

/** Seed a founder's genome: founder brain + Gaussian spread, random hue (lineage colors diverge).
 *  hungerSense (lever E2) gates the 2 hunger synapses: when ON they draw founder noise like any weight;
 *  when OFF they are written to their founder value (0) WITHOUT consuming RNG, so the draw sequence — and
 *  thus every downstream rng.state — is byte-identical to the pre-E2 sim (the ablation safeguard). */
export function seedGenome(
  brain: Float32Array,
  hue: Float32Array,
  slot: number,
  rng: Rng,
  founderSigma: number,
  hungerSense: boolean,
): void {
  const base = slot * BRAIN_GENES;
  const n = hungerSense ? BRAIN_GENES : BRAIN_CORE_GENES;
  for (let g = 0; g < n; g++) brain[base + g] = FOUNDER_BRAIN[g]! + rng.gaussian(0, founderSigma);
  if (!hungerSense) {
    brain[base + Brain.HUNGER_TURN] = FOUNDER_BRAIN[Brain.HUNGER_TURN]!;
    brain[base + Brain.HUNGER_THRUST] = FOUNDER_BRAIN[Brain.HUNGER_THRUST]!;
  }
  hue[slot] = rng.float();
}

/** Copy a parent's genome to a child with Gaussian mutation (the only source of variation). hungerSense
 *  (lever E2) gates the 2 hunger synapses exactly as in seedGenome: when OFF they are COPIED from the
 *  parent (their 0) without drawing, so the RNG sequence is byte-identical to the pre-E2 sim. */
export function mutateGenome(
  brain: Float32Array,
  hue: Float32Array,
  child: number,
  parent: number,
  rng: Rng,
  sigma: number,
  hueSigma: number,
  hungerSense: boolean,
): void {
  const cb = child * BRAIN_GENES;
  const pb = parent * BRAIN_GENES;
  const n = hungerSense ? BRAIN_GENES : BRAIN_CORE_GENES;
  for (let g = 0; g < n; g++) brain[cb + g] = brain[pb + g]! + rng.gaussian(0, sigma);
  if (!hungerSense) {
    brain[cb + Brain.HUNGER_TURN] = brain[pb + Brain.HUNGER_TURN]!;
    brain[cb + Brain.HUNGER_THRUST] = brain[pb + Brain.HUNGER_THRUST]!;
  }
  let h = hue[parent]! + rng.gaussian(0, hueSigma);
  h -= Math.floor(h); // wrap into [0,1)
  hue[child] = h;
}
