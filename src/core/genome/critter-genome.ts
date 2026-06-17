import {
  type Gene,
  type DivisionRule,
  type BondRule,
  type ConnectionRule,
  type MotorRule,
  type Genome,
} from './genome';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';

const TWO_PI = Math.PI * 2;

/**
 * The hand-authored genome that develops into the M5 critter (§8 M6 acceptance — proves
 * the encoding can represent the known wiring). Mirrors `spawnSwimmer`: a MOVER seed (gene
 * 0) with six spoke division rules emitting sensorFwd(1)/sensorLat(2)/clockA(3)/clockB(4)/
 * turn(5)/thrust(6) in alloc order, nine bond rules (bracing + cross-body), five connection
 * rules (the asymmetric steering loop + recurrent clock), per-gene sensor channels + biases,
 * one motor rule, mass 2 (the cohesion gotcha — heavier than free cells). Parameterised by
 * `cellRadius` so the offsets track config.cellRadius.
 */
export function buildCritterGenome(cellRadius = 6): Genome {
  const r = cellRadius;
  const off = 4 * r;
  const lat = off * 0.6;
  const aft = off * 1.8;
  const RESERVE = 5000;
  const g = (cellType: number, over: Partial<Gene> = {}): Gene => ({
    innovation: 0,
    cellType,
    radius: r,
    mass: 2,
    initialEnergy: RESERVE,
    bias: 0,
    sensorChannel: -1,
    ...over,
  });
  // Gene order = spawnSwimmer alloc order: 0 mover, 1 sensorFwd, 2 sensorLat, 3 clockA,
  // 4 clockB, 5 turn, 6 thrust.
  const genes: Gene[] = [
    g(CellType.MOVER),
    g(CellType.SENSOR, { sensorChannel: SensorChannel.FWD_GRAD }),
    g(CellType.SENSOR, { sensorChannel: SensorChannel.LAT_GRAD }),
    g(CellType.NEURON, { bias: 0.2 }),
    g(CellType.NEURON),
    g(CellType.NEURON),
    g(CellType.NEURON, { bias: 0.5 }),
  ];
  const spoke = (childGene: number, ox: number, oy: number): DivisionRule => ({
    parentGene: 0,
    childGene,
    angle: Math.atan2(oy, ox),
    dist: Math.hypot(ox, oy),
    stiffness: 1,
    repeat: 1,
  });
  const divisionRules: DivisionRule[] = [
    spoke(1, off, -lat),
    spoke(2, off, lat),
    spoke(3, -off, -lat),
    spoke(4, -off, lat),
    spoke(5, -aft, 0),
    spoke(6, aft, 0),
  ];
  const brace = (geneA: number, geneB: number): BondRule => ({ geneA, geneB, stiffness: 1 });
  const bondRules: BondRule[] = [
    brace(1, 2),
    brace(1, 6),
    brace(2, 6),
    brace(3, 4),
    brace(3, 5),
    brace(4, 5),
    brace(1, 3),
    brace(2, 4),
    brace(6, 5),
  ];
  const connectionRules: ConnectionRule[] = [
    { preGene: 2, postGene: 5, weight: 1.5 },
    { preGene: 1, postGene: 6, weight: 1.5 },
    { preGene: 4, postGene: 3, weight: 0.9 },
    { preGene: 3, postGene: 4, weight: -0.9 },
    { preGene: 3, postGene: 5, weight: 0.3 },
  ];
  const motorRules: MotorRule[] = [{ moverGene: 0, turnGene: 5, thrustGene: 6 }];
  return {
    seedGene: 0,
    genes,
    divisionRules,
    bondRules,
    connectionRules,
    motorRules,
    parentRef: -1,
    generation: 0,
  };
}

/**
 * The reproduction-demo body: a braced PHOTO cluster (seed + 3 children in a ring) with
 * photosynthesis income, mass 2 for cohesion, modest seed energy so it can accumulate to
 * reproThreshold + provision an offspring. No brain (keeps reproduction + organism death
 * off the neural-pruning edge cases).
 */
export function buildAutotrophGenome(cellRadius = 6): Genome {
  const r = cellRadius;
  const d = 2.2 * r;
  const g = (over: Partial<Gene> = {}): Gene => ({
    innovation: 0,
    cellType: CellType.PHOTO,
    radius: r,
    mass: 2,
    initialEnergy: 50,
    bias: 0,
    sensorChannel: -1,
    ...over,
  });
  const genes: Gene[] = [g(), g(), g(), g()];
  const divisionRules: DivisionRule[] = [
    { parentGene: 0, childGene: 1, angle: 0, dist: d, stiffness: 1, repeat: 1 },
    { parentGene: 0, childGene: 2, angle: TWO_PI / 3, dist: d, stiffness: 1, repeat: 1 },
    { parentGene: 0, childGene: 3, angle: -TWO_PI / 3, dist: d, stiffness: 1, repeat: 1 },
  ];
  const bondRules: BondRule[] = [
    { geneA: 1, geneB: 2, stiffness: 1 },
    { geneA: 2, geneB: 3, stiffness: 1 },
    { geneA: 3, geneB: 1, stiffness: 1 },
  ];
  return {
    seedGene: 0,
    genes,
    divisionRules,
    bondRules,
    connectionRules: [],
    motorRules: [],
    parentRef: -1,
    generation: 0,
  };
}

/**
 * A VIABLE brain-driven forager: the M5 critter's sense→steer→thrust loop PLUS a leading
 * DIGESTIVE "mouth" (gene 5) so the body actually eats the PHOTO/MEAT it swims into — closing
 * the sense→move→EAT→reproduce→die loop the bare critter lacks. Mortal: modest seed energy
 * (no 5000 reserve), so it must forage to survive and earns reproduction by eating. 6 cells:
 * MOVER(0) + sensorFwd(1)/sensorLat(2) + turn(3)/thrust(4) neurons + digestive(5). mass 2 for
 * cohesion. `initialEnergy` is low so a 6-cell offspring (~6·initial) is affordable under a
 * reproThreshold a fed forager can reach.
 */
export function buildForagerGenome(cellRadius = 6, initialEnergy = 100): Genome {
  const r = cellRadius;
  const off = 4 * r;
  const lat = off * 0.6;
  const aft = off * 1.8;
  const g = (cellType: number, over: Partial<Gene> = {}): Gene => ({
    innovation: 0,
    cellType,
    radius: r,
    mass: 2,
    initialEnergy,
    bias: 0,
    sensorChannel: -1,
    ...over,
  });
  // 0 mover, 1 sensorFwd, 2 sensorLat, 3 turn, 4 thrust, 5 digestive (mouth).
  const genes: Gene[] = [
    g(CellType.MOVER),
    g(CellType.SENSOR, { sensorChannel: SensorChannel.FWD_GRAD }),
    g(CellType.SENSOR, { sensorChannel: SensorChannel.LAT_GRAD }),
    g(CellType.NEURON),
    g(CellType.NEURON, { bias: 0.5 }),
    g(CellType.DIGESTIVE),
  ];
  const spoke = (childGene: number, ox: number, oy: number): DivisionRule => ({
    parentGene: 0,
    childGene,
    angle: Math.atan2(oy, ox),
    dist: Math.hypot(ox, oy),
    stiffness: 1,
    repeat: 1,
  });
  const divisionRules: DivisionRule[] = [
    spoke(1, off, -lat),
    spoke(2, off, lat),
    spoke(3, -aft, -lat),
    spoke(4, -aft, lat),
    spoke(5, off * 1.6, 0), // the digestive mouth leads the body
  ];
  const brace = (geneA: number, geneB: number): BondRule => ({ geneA, geneB, stiffness: 1 });
  const bondRules: BondRule[] = [
    brace(1, 2), // front sensors
    brace(1, 5),
    brace(2, 5), // front triangle incl. the mouth
    brace(3, 4), // back neurons
    brace(1, 3),
    brace(2, 4), // cross-body bracing
  ];
  const connectionRules: ConnectionRule[] = [
    { preGene: 2, postGene: 3, weight: 1.5 }, // sensorLat → turn (steer toward food)
    { preGene: 1, postGene: 4, weight: 1.5 }, // sensorFwd → thrust (advance into food)
  ];
  const motorRules: MotorRule[] = [{ moverGene: 0, turnGene: 3, thrustGene: 4 }];
  return {
    seedGene: 0,
    genes,
    divisionRules,
    bondRules,
    connectionRules,
    motorRules,
    parentRef: -1,
    generation: 0,
  };
}
