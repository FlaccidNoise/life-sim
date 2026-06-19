import {
  type Gene,
  type DivisionRule,
  type BondRule,
  type ConnectionRule,
  type MotorRule,
  type Genome,
} from './genome';
import { CellType } from '../cells/types';
import { SenseSource, SightTarget } from '../cells/sense-source';
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
  const off = 3 * r;
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
    glowGain: 0,
    senseSource: SenseSource.SMELL,
    sightTarget: SightTarget.FOOD,
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
    founderId: -1,
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
    glowGain: 0,
    senseSource: SenseSource.SMELL,
    sightTarget: SightTarget.FOOD,
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
    founderId: -1,
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
  const off = 3 * r;
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
    glowGain: 0,
    senseSource: SenseSource.SMELL,
    sightTarget: SightTarget.FOOD,
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
    founderId: -1,
  };
}

/**
 * A forager that grows BOTH senses for food: the standard 6-cell forager (smell FWD/LAT pair
 * wired to thrust/turn) PLUS a SIGHT eye organ — a (SIGHT, FWD_GRAD) + (SIGHT, LAT_GRAD) pair
 * with sightTarget FOOD — wired into the SAME steering loop (FWD-eye→thrust, LAT-eye→turn). It
 * smells long-range trails and sees nearby plants; when sight is OFF (viewRange 0) the eye pair
 * reads a zero vector and the forager degenerates to a smell forager. Mutable founder genome,
 * economically selected — no kernel reads a role label. DRY over buildForagerGenome.
 * 8 cells: MOVER(0) + smell FWD(1)/LAT(2) + turn(3)/thrust(4) neurons + DIGESTIVE mouth(5)
 * + eye FWD(6)/eye LAT(7).
 */
export function buildSightedForagerGenome(cellRadius = 6, initialEnergy = 100): Genome {
  const g = buildForagerGenome(cellRadius, initialEnergy);
  const r = cellRadius;
  const off = 3 * r;
  const lat = off * 0.6;
  // gene 6: FWD-channel eye, sightTarget FOOD. Placed forward beside the smell sensors.
  g.genes.push({
    innovation: 0,
    cellType: CellType.SENSOR,
    radius: r,
    mass: 2,
    initialEnergy,
    bias: 0,
    sensorChannel: SensorChannel.FWD_GRAD,
    glowGain: 0,
    senseSource: SenseSource.SIGHT,
    sightTarget: SightTarget.FOOD,
  });
  // gene 7: LAT-channel eye, sightTarget FOOD.
  g.genes.push({
    innovation: 0,
    cellType: CellType.SENSOR,
    radius: r,
    mass: 2,
    initialEnergy,
    bias: 0,
    sensorChannel: SensorChannel.LAT_GRAD,
    glowGain: 0,
    senseSource: SenseSource.SIGHT,
    sightTarget: SightTarget.FOOD,
  });
  g.divisionRules.push({
    parentGene: 0,
    childGene: 6,
    angle: Math.atan2(-lat * 0.5, off),
    dist: Math.hypot(off, lat * 0.5),
    stiffness: 1,
    repeat: 1,
  });
  g.divisionRules.push({
    parentGene: 0,
    childGene: 7,
    angle: Math.atan2(lat * 0.5, off),
    dist: Math.hypot(off, lat * 0.5),
    stiffness: 1,
    repeat: 1,
  });
  g.bondRules.push({ geneA: 1, geneB: 6, stiffness: 1 }); // brace eye to smell FWD
  g.bondRules.push({ geneA: 2, geneB: 7, stiffness: 1 }); // brace eye to smell LAT
  g.connectionRules.push({ preGene: 6, postGene: 4, weight: 1.5 }); // FWD-eye → thrust
  g.connectionRules.push({ preGene: 7, postGene: 3, weight: 1.5 }); // LAT-eye → turn
  return g;
}

/**
 * A PREDATOR: the forager body plan with its leading mouth (gene 5) swapped DIGESTIVE→PREDATOR
 * (carnivore) AND an AMBUSH brain. At instantiate the PREDATOR mouth flags the organism carnivore
 * → its SENSORs route to the prey-scent field (it hunts foragers), it is excluded from prey-scent
 * deposit, and it eats forager flesh via the predation branch of metabolize. Evolves under the same
 * economic selection (mutation may flip the mouth back to herbivore — diet drifts, lineage-blind).
 *
 * AMBUSH WIRING (the root-cause fix for pursuit-lag): a gradient-CHARGING predator perpetually lags
 * mobile, equal-speed prey (Phase 2 diagnosis: ~zero bites, starves on schedule). So instead of
 * advancing into prey-scent like a forager (sensorFwd→thrust +1.5), the predator INVERTS that link
 * (`fwdThrustWeight`, default negative) → high forward prey-scent CUTS thrust → it brakes and loiters
 * where prey are dense, letting prey wander into strike-reach. sensorLat→turn stays positive (it still
 * orients toward prey); thrustBias/cruise + the carnivore speed edge roam it fast between patches.
 * `fwdThrustWeight` is a tuning knob (swept in the headless probe). DRY over buildForagerGenome.
 */
export function buildPredatorGenome(
  cellRadius = 6,
  initialEnergy = 100,
  fwdThrustWeight = -1.5,
): Genome {
  const g = buildForagerGenome(cellRadius, initialEnergy);
  g.genes[5] = { ...g.genes[5]!, cellType: CellType.PREDATOR };
  const fwdThrust = g.connectionRules.find((c) => c.preGene === 1 && c.postGene === 4);
  if (fwdThrust) fwdThrust.weight = fwdThrustWeight;
  return g;
}

/**
 * A PURSUIT predator: the carnivore-mouth forager body (buildPredatorGenome) PLUS two new sense
 * organs that drive an active hunt — a SIGHT eye pair (sightTarget PREY) and a HEARING pair. Both
 * wire FWD→thrust (+) and LAT→turn (+) so the predator CHARGES and ORIENTS on prey it sees/hears.
 * (The inherited ambush smell wiring — fwd-smell→thrust negative — still brakes it in dense
 * prey-scent; sight/hearing add the closing burst.) Mutable founder genome under the same economic
 * selection; the carnivore flag is set STRUCTURALLY by the PREDATOR mouth, never by a role label.
 * 10 cells: predator body(0..5) + PREY-eye FWD(6)/LAT(7) + hearing FWD(8)/LAT(9).
 */
export function buildHearingPredatorGenome(cellRadius = 6, initialEnergy = 100): Genome {
  const g = buildPredatorGenome(cellRadius, initialEnergy);
  const r = cellRadius;
  const off = 3 * r;
  const lat = off * 0.6;
  const mkSensor = (channel: number, source: number, target: number): Gene => ({
    innovation: 0,
    cellType: CellType.SENSOR,
    radius: r,
    mass: 2,
    initialEnergy,
    bias: 0,
    sensorChannel: channel,
    glowGain: 0,
    senseSource: source,
    sightTarget: target,
  });
  g.genes.push(mkSensor(SensorChannel.FWD_GRAD, SenseSource.SIGHT, SightTarget.PREY)); // 6
  g.genes.push(mkSensor(SensorChannel.LAT_GRAD, SenseSource.SIGHT, SightTarget.PREY)); // 7
  g.genes.push(mkSensor(SensorChannel.FWD_GRAD, SenseSource.HEARING, SightTarget.FOOD)); // 8
  g.genes.push(mkSensor(SensorChannel.LAT_GRAD, SenseSource.HEARING, SightTarget.FOOD)); // 9
  g.divisionRules.push({
    parentGene: 0,
    childGene: 6,
    angle: Math.atan2(-lat * 0.5, off),
    dist: Math.hypot(off, lat * 0.5),
    stiffness: 1,
    repeat: 1,
  });
  g.divisionRules.push({
    parentGene: 0,
    childGene: 7,
    angle: Math.atan2(lat * 0.5, off),
    dist: Math.hypot(off, lat * 0.5),
    stiffness: 1,
    repeat: 1,
  });
  // The hearing pair spokes off the front smell sensors (genes 1, 2), NOT the seed: the MOVER seed
  // already carries 5 forager spokes + the 2 eye spokes (degree 7); two more would breach
  // bondDegreeCap (8) and instantiate would reject the body.
  g.divisionRules.push({
    parentGene: 1,
    childGene: 8,
    angle: Math.atan2(-lat, off),
    dist: lat,
    stiffness: 1,
    repeat: 1,
  });
  g.divisionRules.push({
    parentGene: 2,
    childGene: 9,
    angle: Math.atan2(lat, off),
    dist: lat,
    stiffness: 1,
    repeat: 1,
  });
  g.bondRules.push({ geneA: 1, geneB: 6, stiffness: 1 });
  g.bondRules.push({ geneA: 2, geneB: 7, stiffness: 1 });
  g.bondRules.push({ geneA: 3, geneB: 8, stiffness: 1 });
  g.bondRules.push({ geneA: 4, geneB: 9, stiffness: 1 });
  g.connectionRules.push({ preGene: 6, postGene: 4, weight: 1.5 }); // PREY-eye FWD → thrust
  g.connectionRules.push({ preGene: 7, postGene: 3, weight: 1.5 }); // PREY-eye LAT → turn
  g.connectionRules.push({ preGene: 8, postGene: 4, weight: 1.0 }); // hearing FWD → thrust
  g.connectionRules.push({ preGene: 9, postGene: 3, weight: 1.0 }); // hearing LAT → turn
  return g;
}

/**
 * The forager handicapped at TURNING TOWARD FOOD: the `sensorLat→turn` connection weight
 * (preGene 2 → postGene 3) is knocked from the hand-tuned 1.5 down to `weight` (default 0.2),
 * while `sensorFwd→thrust` is left at the fit 1.5. A forager that can't steer toward off-axis
 * food passes it by → eats less → reproduces less under a SCARCE food field. This is the M7
 * adaptation-proof seed: turning is governed by `turnScale`, not `moveCost ∝ thrust²`, so it
 * carries a clean monotonic-positive economic gradient (verified — see the headless probe).
 * Only the lat→turn weight is overridden so the proof isolates THAT trait; `sensorFwd→thrust`
 * stays fit because in an abundant field a high thrust weight is actually anti-selected (it
 * overshoots patches and pays quadratic move-cost), which would confound the measurement.
 * DRY over buildForagerGenome — identical body, one connection-rule weight overridden.
 */
export function buildHandicappedForagerGenome(
  cellRadius = 6,
  initialEnergy = 100,
  weight = 0.2,
): Genome {
  const g = buildForagerGenome(cellRadius, initialEnergy);
  const latTurn = g.connectionRules.find((c) => c.preGene === 2 && c.postGene === 3);
  if (latTurn) latTurn.weight = weight;
  return g;
}

/**
 * Nocturnal-energy-conservation forager: a standard forager with an extra AMBIENT_LIGHT
 * SENSOR (gene 6) wired negatively to thrust. At night (ambient≈low), the sensor
 * SUPPRESSES thrust → the forager conserves energy in the dark when plants aren't
 * growing; by day it forages normally. This emergent strategy comes from a single
 * added sensor + inhibitory synapse — the core foraging loop (sensorLat→turn 1.5,
 * sensorFwd→thrust 1.5) is untouched.
 *
 * DRY over buildForagerGenome: same 6-cell body + 7th AMBIENT_LIGHT sensor, its spoke,
 * a brace bond, and a negative-weight connection to thrust.
 */
export function buildNightForagerGenome(cellRadius = 6, initialEnergy = 100): Genome {
  const g = buildForagerGenome(cellRadius, initialEnergy);
  const r = cellRadius;
  const off = 3 * r;
  // 7th gene: AMBIENT_LIGHT sensor placed behind the mover (away from the mouth).
  g.genes.push({
    innovation: 0,
    cellType: CellType.SENSOR,
    radius: r,
    mass: 2,
    initialEnergy,
    bias: 0,
    sensorChannel: SensorChannel.AMBIENT_LIGHT,
    glowGain: 0,
    senseSource: SenseSource.SMELL,
    sightTarget: SightTarget.FOOD,
  });
  g.divisionRules.push({
    parentGene: 0,
    childGene: 6,
    angle: Math.PI,
    dist: off * 1.2,
    stiffness: 1,
    repeat: 1,
  });
  g.bondRules.push({ geneA: 4, geneB: 6, stiffness: 1 }); // brace to thrust neuron
  g.connectionRules.push({ preGene: 6, postGene: 4, weight: -0.8 }); // ambient→thrust inhibitory
  return g;
}

/**
 * Signaling/flocking forager: the turn neuron (gene 3) emits glow (glowGain=0.8)
 * proportional to its activation, AND the forager has a GLOW sensor (gene 6) wired
 * POSITIVELY to thrust (weight 1.2) — so it is attracted to glow from conspecifics.
 * This creates a primitive follow-the-glow flocking effect. The forager pays glowCost
 * when the turn neuron is active, an economic tradeoff: signaling costs energy but
 * enables conspecific attraction.
 *
 * DRY over buildForagerGenome: same 6-cell body, glowGain set on gene 3, + 7th GLOW
 * sensor with its spoke, brace bond, and positive connection to thrust.
 */
export function buildGlowForagerGenome(cellRadius = 6, initialEnergy = 100): Genome {
  const g = buildForagerGenome(cellRadius, initialEnergy);
  const r = cellRadius;
  const off = 3 * r;
  // Set glowGain on the turn neuron (gene 3).
  const turnGene = g.genes[3]!;
  g.genes[3] = { ...turnGene, glowGain: 0.8 };
  // 7th gene: GLOW sensor placed forward between mover and mouth.
  g.genes.push({
    innovation: 0,
    cellType: CellType.SENSOR,
    radius: r,
    mass: 2,
    initialEnergy,
    bias: 0,
    sensorChannel: SensorChannel.GLOW,
    glowGain: 0,
    senseSource: SenseSource.SMELL,
    sightTarget: SightTarget.FOOD,
  });
  g.divisionRules.push({
    parentGene: 0,
    childGene: 6,
    angle: 0,
    dist: off * 0.6,
    stiffness: 1,
    repeat: 1,
  });
  g.bondRules.push({ geneA: 5, geneB: 6, stiffness: 1 }); // brace to mouth
  g.connectionRules.push({ preGene: 6, postGene: 4, weight: 1.2 }); // glow→thrust excitatory
  return g;
}

/**
 * Toxin-avoidance forager: a standard forager with an extra TOXIN SENSOR (gene 6)
 * wired to the turn neuron with weight 1.5. High toxin → strong turn activation →
 * reflexive avoidance wiggle. Since TOXIN is a scalar (not a gradient), the avoidance
 * is a random-walk away from toxin patches rather than gradient climbing — acceptable
 * as a first-cut avoidance mechanism that improves survival in toxic environments.
 *
 * DRY over buildForagerGenome: same 6-cell body + 7th TOXIN sensor, its spoke,
 * a brace bond, and a positive connection to turn.
 */
export function buildToxinAvoiderGenome(cellRadius = 6, initialEnergy = 100): Genome {
  const g = buildForagerGenome(cellRadius, initialEnergy);
  const r = cellRadius;
  const off = 3 * r;
  // 7th gene: TOXIN sensor placed on the dorsal side.
  g.genes.push({
    innovation: 0,
    cellType: CellType.SENSOR,
    radius: r,
    mass: 2,
    initialEnergy,
    bias: 0,
    sensorChannel: SensorChannel.TOXIN,
    glowGain: 0,
    senseSource: SenseSource.SMELL,
    sightTarget: SightTarget.FOOD,
  });
  g.divisionRules.push({
    parentGene: 0,
    childGene: 6,
    angle: -Math.PI / 2,
    dist: off * 0.8,
    stiffness: 1,
    repeat: 1,
  });
  g.bondRules.push({ geneA: 1, geneB: 6, stiffness: 1 }); // brace to sensorFwd
  g.connectionRules.push({ preGene: 6, postGene: 3, weight: 1.5 }); // toxin→turn excitatory
  return g;
}
