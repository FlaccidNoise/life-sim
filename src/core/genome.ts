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
 *   - SIZE        → render radius (renderer) — a FREE cosmetic gene for now (no sim benefit yet)
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
} as const;
export const SCALAR_GENE_COUNT = 12;

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
    | 'damage';
  /** Config key for the per-unit-above-center basal cost coeff, or null for a non-upkeep gene. */
  costKey:
    | 'maxSpeedCost'
    | 'eatRateCost'
    | 'senseRangeCost'
    | 'maxTurnCost'
    | 'maxThrustCost'
    | 'damageCost'
    | null;
  /** Hard clamp range the gene value is kept within (at seed and at every mutation). */
  min: number;
  max: number;
}

// Order MUST match the ScalarGene enum (index = gene id).
// SIZE is currently a FREE cosmetic gene (costKey null): it drives only render radius + display, with
// no simulation benefit yet, so charging upkeep would just be a vanity tax that selection shrinks. It
// will be re-costed once it confers a physical advantage (per-creature collision / big-eats-small) in
// the predation slice. METAB_EFF is also costKey null — its cost is the multiplicative basal×e instead.
export const SCALAR_GENE_SPECS: readonly ScalarGeneSpec[] = [
  { centerKey: 'maxSpeed', costKey: 'maxSpeedCost', min: 1, max: 20 },
  { centerKey: 'eatRate', costKey: 'eatRateCost', min: 0.2, max: 8 },
  { centerKey: 'senseStep', costKey: 'senseRangeCost', min: 8, max: 256 },
  { centerKey: 'cellRadius', costKey: null, min: 2, max: 16 },
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

/** Brain weight layout (index into the per-creature brain block). */
export const Brain = {
  LAT_TURN: 0, // lateral food gradient → turn
  FWD_TURN: 1, // forward food gradient → turn
  LAT_THRUST: 2, // lateral → thrust
  FWD_THRUST: 3, // forward → thrust (climb the gradient)
  TURN_BIAS: 4,
  THRUST_BIAS: 5, // baseline cruise
} as const;
export const BRAIN_GENES = 6;

/** Founder brain ≈ the hand-tuned chemotaxis controller (turn toward lateral food, thrust up-gradient,
 *  gentle cruise). Founders are seeded near this + noise, so the population forages from tick 0 and
 *  evolution refines + diversifies it (rather than starting blind and risking early extinction). */
const FOUNDER_BRAIN: readonly number[] = [1.2, 0, 0, 1.5, 0, 0.3];

/** Seed a founder's genome: founder brain + Gaussian spread, random hue (lineage colors diverge). */
export function seedGenome(
  brain: Float32Array,
  hue: Float32Array,
  slot: number,
  rng: Rng,
  founderSigma: number,
): void {
  const base = slot * BRAIN_GENES;
  for (let g = 0; g < BRAIN_GENES; g++)
    brain[base + g] = FOUNDER_BRAIN[g]! + rng.gaussian(0, founderSigma);
  hue[slot] = rng.float();
}

/** Copy a parent's genome to a child with Gaussian mutation (the only source of variation). */
export function mutateGenome(
  brain: Float32Array,
  hue: Float32Array,
  child: number,
  parent: number,
  rng: Rng,
  sigma: number,
  hueSigma: number,
): void {
  const cb = child * BRAIN_GENES;
  const pb = parent * BRAIN_GENES;
  for (let g = 0; g < BRAIN_GENES; g++) brain[cb + g] = brain[pb + g]! + rng.gaussian(0, sigma);
  let h = hue[parent]! + rng.gaussian(0, hueSigma);
  h -= Math.floor(h); // wrap into [0,1)
  hue[child] = h;
}
