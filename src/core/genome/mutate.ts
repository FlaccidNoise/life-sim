import { type Genome, cloneGenome } from './genome';
import { type Rng } from '../math/rng';

/** Per-operator mutation rates + Gaussian σ (all live Config knobs; default 0 in M6). */
export interface MutationRates {
  paramSigma: number;
  paramRate: number;
  weightSigma: number;
  weightRate: number;
  addGeneRate: number;
  deleteGeneRate: number;
  duplicateGeneRate: number;
  rewireRate: number;
  changeTypeRate: number;
  duplicateSubgraphRate: number;
}

/** Standard-normal sample via Box–Muller. Deterministic from `rng` (two floats per call). */
export function gaussian(rng: Rng): number {
  let u1 = rng.float();
  if (u1 < 1e-12) u1 = 1e-12;
  const u2 = rng.float();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Produce a mutated copy of `parent` (§4.7). Operators are applied in a FIXED order, each
 * gated by its rate, drawing from `rng` (reproduction passes a `rng.split(2)` substream) —
 * so a given (parent, rng state, rates) is byte-deterministic. With all rates 0 the result
 * is an exact clone (M6 reproduction-first). Lineage (`parentRef`/`generation`) is set by
 * the caller, not here. Tasks 10–11 add the structural operators (which take a `GenomeStore`
 * for fresh innovation ids).
 */
export function mutateGenome(parent: Genome, rng: Rng, rates: MutationRates): Genome {
  const child = cloneGenome(parent);

  // Numeric gene-param perturbation.
  for (let gi = 0; gi < child.genes.length; gi++) {
    if (rng.float() < rates.paramRate) {
      const gene = child.genes[gi]!;
      gene.radius = Math.max(0.5, gene.radius + gaussian(rng) * rates.paramSigma);
      gene.mass = Math.max(0.1, gene.mass + gaussian(rng) * rates.paramSigma);
      gene.initialEnergy = Math.max(0, gene.initialEnergy + gaussian(rng) * rates.paramSigma);
      gene.bias = gene.bias + gaussian(rng) * rates.paramSigma;
    }
  }

  // Connection-weight perturbation (the addressable synapse-weight locus, §4.6).
  for (let ci = 0; ci < child.connectionRules.length; ci++) {
    if (rng.float() < rates.weightRate) {
      child.connectionRules[ci]!.weight += gaussian(rng) * rates.weightSigma;
    }
  }

  return child;
}
