import { type Genome } from './genome';
import { genomeTraits } from './traits';

const C1 = 1.0; // weight on structural/morphological disjointness (per-type + rule-count diffs)
const C2 = 0.4; // weight on mean connection-weight difference (behavioral)

/** Speciation cutoff: genomes with distance < this join the same species (greedy clustering). */
export const SPECIES_THRESHOLD = 1.0;

/**
 * Genetic distance for speciation (M7 §5, Plan B Phase 5). δ = C1·(composition disjointness)/N +
 * C2·(mean |Δweight|). Composition disjointness = Σ over the 7 cell types of |countA − countB|,
 * plus |ΔconnectionCount| + |ΔmotorCount| — this captures exactly the morphological axes that
 * genotypicDiversity (genomeSignature) buckets, so changeType/duplicate/add/delete morphs land in
 * distinct species. The weight term is index-aligned over the shared connection-rule prefix. PURE:
 * no develop(), no RNG, no SoA. NOTE (design): NEAT-style innovation-id matching is degenerate in
 * this codebase because founder genes are all innovation 0 — composition matching is the correct
 * substitute (see plan Global Constraints).
 */
export function genomeDistance(a: Genome, b: Genome): number {
  const ta = genomeTraits(a);
  const tb = genomeTraits(b);
  const comp =
    Math.abs(ta.photoGenes - tb.photoGenes) +
    Math.abs(ta.digestiveGenes - tb.digestiveGenes) +
    Math.abs(ta.sensorGenes - tb.sensorGenes) +
    Math.abs(ta.neuronGenes - tb.neuronGenes) +
    Math.abs(ta.moverGenes - tb.moverGenes) +
    Math.abs(ta.meatGenes - tb.meatGenes) +
    Math.abs(ta.motileGenes - tb.motileGenes) +
    Math.abs(ta.connectionCount - tb.connectionCount) +
    Math.abs(ta.motorCount - tb.motorCount);
  const n = Math.max(ta.geneCount, tb.geneCount, 1);
  const m = Math.min(a.connectionRules.length, b.connectionRules.length);
  let wsum = 0;
  for (let i = 0; i < m; i++)
    wsum += Math.abs(a.connectionRules[i]!.weight - b.connectionRules[i]!.weight);
  const wbar = m > 0 ? wsum / m : 0;
  return C1 * (comp / n) + C2 * wbar;
}
