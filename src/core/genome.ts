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
