import { type Genome, type Gene, cloneGenome, GenomeStore } from './genome';
import { type Rng } from '../math/rng';
import { CellType } from '../cells/types';

const PALETTE = [
  CellType.PHOTO,
  CellType.DIGESTIVE,
  CellType.SENSOR,
  CellType.NEURON,
  CellType.MOVER,
];

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
  sensorChannelRate: number;
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
export function mutateGenome(
  parent: Genome,
  rng: Rng,
  rates: MutationRates,
  store: GenomeStore,
): Genome {
  const child = cloneGenome(parent);

  // Numeric gene-param perturbation.
  for (let gi = 0; gi < child.genes.length; gi++) {
    const gene = child.genes[gi]!;
    if (rng.float() < rates.paramRate) {
      gene.radius = Math.max(0.5, gene.radius + gaussian(rng) * rates.paramSigma);
      gene.mass = Math.max(0.1, gene.mass + gaussian(rng) * rates.paramSigma);
      gene.initialEnergy = Math.max(0, gene.initialEnergy + gaussian(rng) * rates.paramSigma);
      gene.bias = gene.bias + gaussian(rng) * rates.paramSigma;
      // Glow gain nudge (harmless for non-neurons; lets NEURON genes discover glow).
      gene.glowGain = Math.max(0, gene.glowGain + gaussian(rng) * rates.paramSigma);
    }
  }

  // Connection-weight perturbation (the addressable synapse-weight locus, §4.6).
  for (let ci = 0; ci < child.connectionRules.length; ci++) {
    if (rng.float() < rates.weightRate) {
      child.connectionRules[ci]!.weight += gaussian(rng) * rates.weightSigma;
    }
  }

  // Sensor-channel mutation: each SENSOR gene may get a fresh random channel (discovers env scalars).
  for (let gi = 0; gi < child.genes.length; gi++) {
    const gene = child.genes[gi]!;
    if (gene.cellType === CellType.SENSOR && rng.float() < rates.sensorChannelRate) {
      gene.sensorChannel = rng.int(6);
    }
  }

  // Change a gene's cell type to a different palette value.
  if (child.genes.length > 0 && rng.float() < rates.changeTypeRate) {
    const gi = rng.int(child.genes.length);
    const gene = child.genes[gi]!;
    const cur = gene.cellType;
    let t = PALETTE[rng.int(PALETTE.length)]!;
    if (t === cur) t = PALETTE[(PALETTE.indexOf(cur) + 1) % PALETTE.length]!;
    // When changing TO SENSOR, assign a valid random channel; when changing AWAY from SENSOR, clear it.
    if (cur !== CellType.SENSOR && t === CellType.SENSOR) {
      gene.sensorChannel = rng.int(6);
    } else if (cur === CellType.SENSOR && t !== CellType.SENSOR) {
      gene.sensorChannel = -1;
    }
    gene.cellType = t;
  }

  // Rewire a division rule to a different child gene.
  if (child.divisionRules.length > 0 && child.genes.length > 1 && rng.float() < rates.rewireRate) {
    const ri = rng.int(child.divisionRules.length);
    const rule = child.divisionRules[ri]!;
    let cg = rng.int(child.genes.length);
    if (cg === rule.childGene) cg = (cg + 1) % child.genes.length;
    rule.childGene = cg;
  }

  // Duplicate an existing gene (fresh innovation id) + a division rule from the seed.
  if (child.genes.length > 0 && rng.float() < rates.duplicateGeneRate) {
    const src = child.genes[rng.int(child.genes.length)]!;
    const copy: Gene = { ...src, innovation: store.nextInnovationId() };
    const newIndex = child.genes.push(copy) - 1;
    child.divisionRules.push({
      parentGene: child.seedGene,
      childGene: newIndex,
      angle: rng.range(0, Math.PI * 2),
      dist: rng.range(2 * src.radius, 5 * src.radius),
      stiffness: 1,
      repeat: 1,
    });
  }

  // Add a brand-new gene (random palette type, fresh innovation id) + a division rule.
  if (rng.float() < rates.addGeneRate) {
    const type = PALETTE[rng.int(PALETTE.length)]!;
    const gene: Gene = {
      innovation: store.nextInnovationId(),
      cellType: type,
      radius: 6,
      mass: 2,
      initialEnergy: 100,
      bias: 0,
      sensorChannel: type === CellType.SENSOR ? rng.int(6) : -1,
      glowGain: 0,
    };
    const newIndex = child.genes.push(gene) - 1;
    child.divisionRules.push({
      parentGene: child.seedGene,
      childGene: newIndex,
      angle: rng.range(0, Math.PI * 2),
      dist: rng.range(12, 30),
      stiffness: 1,
      repeat: 1,
    });
  }

  // Delete a non-seed gene: filter it out + remap every gene reference; drop rules touching it.
  if (rng.float() < rates.deleteGeneRate && child.genes.length > 1) {
    // Pick a victim among non-seed genes.
    let victim = rng.int(child.genes.length);
    if (victim === child.seedGene) victim = (victim + 1) % child.genes.length;
    if (victim !== child.seedGene) {
      const remap: number[] = [];
      let next = 0;
      for (let i = 0; i < child.genes.length; i++) remap[i] = i === victim ? -1 : next++;
      child.genes = child.genes.filter((_, i) => i !== victim);
      child.seedGene = remap[child.seedGene]!;
      child.divisionRules = child.divisionRules
        .filter((r) => r.parentGene !== victim && r.childGene !== victim)
        .map((r) => ({ ...r, parentGene: remap[r.parentGene]!, childGene: remap[r.childGene]! }));
      child.bondRules = child.bondRules
        .filter((r) => r.geneA !== victim && r.geneB !== victim)
        .map((r) => ({ ...r, geneA: remap[r.geneA]!, geneB: remap[r.geneB]! }));
      child.connectionRules = child.connectionRules
        .filter((r) => r.preGene !== victim && r.postGene !== victim)
        .map((r) => ({ ...r, preGene: remap[r.preGene]!, postGene: remap[r.postGene]! }));
      child.motorRules = child.motorRules
        .filter((r) => r.moverGene !== victim && r.turnGene !== victim && r.thrustGene !== victim)
        .map((r) => ({
          ...r,
          moverGene: remap[r.moverGene]!,
          turnGene: remap[r.turnGene]!,
          thrustGene: remap[r.thrustGene]!,
        }));
    }
  }

  // Duplicate a subgraph: copy a root gene + the genes reachable via division rules from it,
  // with fresh innovation ids + remapped division rules, and attach the copied root to the
  // seed. The key complexity driver (§4.7).
  if (rng.float() < rates.duplicateSubgraphRate && child.genes.length > 0) {
    const root = rng.int(child.genes.length);
    // BFS the subtree of genes reachable from `root` via division rules.
    const inSub: number[] = [root];
    const seen = new Set<number>([root]);
    for (let h = 0; h < inSub.length; h++) {
      const gp = inSub[h]!;
      for (let ri = 0; ri < child.divisionRules.length; ri++) {
        const r = child.divisionRules[ri]!;
        if (r.parentGene === gp && !seen.has(r.childGene)) {
          seen.add(r.childGene);
          inSub.push(r.childGene);
        }
      }
    }
    // Copy each subtree gene with a fresh innovation id; map old → new index.
    const copyIndex = new Map<number, number>();
    for (let k = 0; k < inSub.length; k++) {
      const old = inSub[k]!;
      const copy: Gene = { ...child.genes[old]!, innovation: store.nextInnovationId() };
      copyIndex.set(old, child.genes.push(copy) - 1);
    }
    // Replicate the internal division rules among the copies.
    const internal = child.divisionRules.filter(
      (r) => copyIndex.has(r.parentGene) && copyIndex.has(r.childGene),
    );
    for (let ri = 0; ri < internal.length; ri++) {
      const r = internal[ri]!;
      child.divisionRules.push({
        ...r,
        parentGene: copyIndex.get(r.parentGene)!,
        childGene: copyIndex.get(r.childGene)!,
      });
    }
    // Attach the copied root to the seed so the duplicated limb actually develops.
    child.divisionRules.push({
      parentGene: child.seedGene,
      childGene: copyIndex.get(root)!,
      angle: rng.range(0, Math.PI * 2),
      dist: rng.range(12, 30),
      stiffness: 1,
      repeat: 1,
    });
  }

  return child;
}
