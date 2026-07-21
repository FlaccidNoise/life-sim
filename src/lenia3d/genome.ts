/**
 * Lenia genome — heritable per-creature traits, mutated at birth. Each creature's BODY and GAIT
 * emerge from its Lenia kernel/growth params; evolution selects viable lifeforms by pure
 * economic pressure (survive + reproduce). No fitness function.
 *
 * Genes are a Float32Array stride addressed by name (see G enum). Tail-safe: append-only.
 */
import { type Rng } from '../core/rng';

export const G = {
  MU_K: 0, // kernel peak radius (the shell particles sit on)
  SIGMA_K: 1, // kernel width
  W_K: 2, // kernel weight (potential contribution per particle)
  MU_G: 3, // growth peak (potential value where attraction is strongest)
  SIGMA_G: 4, // growth width
  C_REP: 5, // short-range repulsion strength (prevents collapse)
  N: 6, // particle count (discrete; floored)
  HUE: 7, // lineage color [0,1)
  HUNGER: 8, // food-seeking drive [0,1]
  MAX_SPEED: 9, // CoM speed cap
  REPRO_THRESHOLD: 10, // energy bar to breed
  BIRTH_ENERGY: 11, // energy provisioned to each offspring
  MOVE_COST: 12, // metabolic cost per unit CoM speed²
} as const;
export const GENE_COUNT = 13;

/** Hard clamp ranges (kept at seed + every mutation). Tuned so viable configs exist in-range. */
const RANGES: readonly { min: number; max: number }[] = [
  { min: 1.5, max: 6 }, // MU_K
  { min: 0.4, max: 2.5 }, // SIGMA_K
  { min: 0.02, max: 0.4 }, // W_K
  { min: 0.1, max: 0.9 }, // MU_G
  { min: 0.05, max: 0.4 }, // SIGMA_G
  { min: 0.2, max: 3 }, // C_REP
  { min: 6, max: 28 }, // N
  { min: 0, max: 0.999 }, // HUE
  { min: 0, max: 1 }, // HUNGER
  { min: 0.3, max: 2.5 }, // MAX_SPEED
  { min: 30, max: 200 }, // REPRO_THRESHOLD
  { min: 10, max: 80 }, // BIRTH_ENERGY
  { min: 0.01, max: 0.5 }, // MOVE_COST
];

/** Founder center values — tuned to produce stable-ish clusters immediately (the demo is alive on
 *  load; evolution diversifies from there). wK raised vs the continuous-Lenia reference (0.022) so a
 *  small discrete cluster reaches U≈muG: ~6 shell-neighbors × wK ≈ muG. */
const FOUNDER: readonly number[] = [
  3.0, // MU_K
  1.0, // SIGMA_K
  0.1, // W_K
  0.6, // MU_G
  0.15, // SIGMA_G
  1.0, // C_REP
  16, // N
  0, // HUE (overwritten with rng at seed)
  0.6, // HUNGER
  1.2, // MAX_SPEED
  80, // REPRO_THRESHOLD
  30, // BIRTH_ENERGY
  0.08, // MOVE_COST
];

const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Seed a founder's genome around FOUNDER with Gaussian spread (sigma = founderSigma·|center|). */
export function seedGenome(genes: Float32Array, rng: Rng, founderSigma: number): void {
  for (let g = 0; g < GENE_COUNT; g++) {
    const c = FOUNDER[g]!;
    const { min, max } = RANGES[g]!;
    if (g === G.HUE) {
      genes[g] = rng.float();
    } else if (g === G.N) {
      genes[g] = clamp(Math.round(c + rng.gaussian(0, 2)), min, max);
    } else {
      genes[g] = clamp(c + rng.gaussian(0, founderSigma * Math.abs(c)), min, max);
    }
  }
}

/** Return a NEW genome = parent's + Gaussian mutation (step = mutationSigma·|value|). */
export function mutateFrom(parent: Float32Array, rng: Rng, mutationSigma: number): Float32Array {
  const child = new Float32Array(GENE_COUNT);
  for (let g = 0; g < GENE_COUNT; g++) {
    const { min, max } = RANGES[g]!;
    const v = parent[g]!;
    if (g === G.HUE) {
      let h = v + rng.gaussian(0, 0.05);
      h -= Math.floor(h);
      child[g] = h;
    } else if (g === G.N) {
      child[g] = clamp(Math.round(v + rng.gaussian(0, 2)), min, max);
    } else {
      child[g] = clamp(v + rng.gaussian(0, mutationSigma * Math.abs(v || 1)), min, max);
    }
  }
  return child;
}

export const GENE_NAMES = [
  'muK',
  'sigmaK',
  'wK',
  'muG',
  'sigmaG',
  'cRep',
  'n',
  'hue',
  'hunger',
  'maxSpeed',
  'reproThreshold',
  'birthEnergy',
  'moveCost',
];
