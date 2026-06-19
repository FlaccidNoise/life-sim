/**
 * Pure, RNG-free, sim-state-free genome metrics (M7 §3). Counts over a genome's static
 * gene/rule arrays — no develop(), no RNG, no SoA. Sits beside develop.ts in the
 * core/genome layer; imports only genome.ts + cells/types. Feeds genotypic-diversity
 * bucketing and trait-over-time telemetry.
 */
import { type Genome } from './genome';
import { CellType } from '../cells/types';
import { SenseSource } from '../cells/sense-source';

export interface GenomeTraits {
  geneCount: number;
  photoGenes: number;
  digestiveGenes: number;
  sensorGenes: number;
  smellGenes: number;
  sightGenes: number;
  hearingGenes: number;
  neuronGenes: number;
  moverGenes: number;
  meatGenes: number;
  motileGenes: number;
  divisionRuleCount: number;
  bondRuleCount: number;
  connectionCount: number;
  motorCount: number;
  meanMass: number;
  meanInitialEnergy: number;
  meanAbsWeight: number;
  generation: number;
}

/** PURE — counts over the genome's static gene/rule arrays. No develop(), no RNG. */
export function genomeTraits(g: Genome): GenomeTraits {
  const genes = g.genes;
  const n = genes.length;
  let photo = 0;
  let digestive = 0;
  let sensor = 0;
  let smell = 0;
  let sight = 0;
  let hearing = 0;
  let neuron = 0;
  let mover = 0;
  let meat = 0;
  let motile = 0;
  let massSum = 0;
  let energySum = 0;
  for (let i = 0; i < n; i++) {
    const gene = genes[i]!;
    switch (gene.cellType) {
      case CellType.PHOTO:
        photo++;
        break;
      case CellType.DIGESTIVE:
        digestive++;
        break;
      case CellType.SENSOR:
        sensor++;
        if (gene.senseSource === SenseSource.HEARING) hearing++;
        else if (gene.senseSource === SenseSource.SIGHT) sight++;
        else smell++;
        break;
      case CellType.NEURON:
        neuron++;
        break;
      case CellType.MOVER:
        mover++;
        break;
      case CellType.MEAT:
        meat++;
        break;
      case CellType.MOTILE:
        motile++;
        break;
    }
    massSum += gene.mass;
    energySum += gene.initialEnergy;
  }
  const conns = g.connectionRules;
  const cn = conns.length;
  let weightSum = 0;
  for (let i = 0; i < cn; i++) weightSum += Math.abs(conns[i]!.weight);
  return {
    geneCount: n,
    photoGenes: photo,
    digestiveGenes: digestive,
    sensorGenes: sensor,
    smellGenes: smell,
    sightGenes: sight,
    hearingGenes: hearing,
    neuronGenes: neuron,
    moverGenes: mover,
    meatGenes: meat,
    motileGenes: motile,
    divisionRuleCount: g.divisionRules.length,
    bondRuleCount: g.bondRules.length,
    connectionCount: cn,
    motorCount: g.motorRules.length,
    meanMass: n > 0 ? massSum / n : 0,
    meanInitialEnergy: n > 0 ? energySum / n : 0,
    meanAbsWeight: cn > 0 ? weightSum / cn : 0,
    generation: g.generation,
  };
}

/**
 * A coarse STRUCTURAL signature for genotypic-diversity bucketing — NOT exact genome
 * equality (continuous params differ on every mutant). Same body PLAN → same signature.
 * Built from per-type gene counts + (connection, motor) counts.
 */
export function genomeSignature(g: Genome): string {
  const t = genomeTraits(g);
  return `${t.photoGenes}p${t.digestiveGenes}d${t.sensorGenes}s${t.neuronGenes}n${t.moverGenes}m|${t.connectionCount}c${t.motorCount}t`;
}
