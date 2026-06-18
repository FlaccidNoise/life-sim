import { type CellStore } from '../memory/cell-store';
import { type NeuralNetwork } from '../neural/network';
import { type BondNetwork } from './bonds';
import { type OrganismTable } from './organisms';
import { type DevelopedBody } from '../genome/develop';
import { CellType } from '../cells/types';
import { wrapDelta } from '../math/vec2';
import { type GlowEffectors } from '../neural/glow';

/**
 * Instantiate a developed body into the live world (the second half of §4.7 development:
 * grow in abstract space, THEN instantiate + let physics relax). TRANSACTIONAL: a capacity
 * pre-check (cells / bonds / synapses / organism id / bond degree) means it allocates
 * NOTHING and returns −1 if anything is short — the clean-abort path so an under-provisioned
 * or over-capacity reproduction never leaves a half-built organism (§4.5). Local positions
 * are rotated by `heading` + translated to (x, y); each bond's rest length is computed from
 * the resulting WORLD positions via `wrapDelta`, exactly like spawnSwimmer, so a placed body
 * holds its geometry. Allocation-free: `slotScratch` (≥ maxCellsPerOrganism) is reused first
 * as a per-cell degree counter, then as the local→slot map. Returns the new organism id.
 */
export function instantiateBody(
  body: DevelopedBody,
  cells: CellStore,
  net: NeuralNetwork,
  bonds: BondNetwork,
  organisms: OrganismTable,
  genomeRef: number,
  x: number,
  y: number,
  heading: number,
  worldWidth: number,
  worldHeight: number,
  slotScratch: Int32Array,
  glowEffectors: GlowEffectors,
): number {
  const count = body.count;
  if (count <= 0 || count > slotScratch.length) return -1;
  if (cells.capacity - cells.aliveCount < count) return -1;
  if (bonds.freeCount < body.bonds.length) return -1;
  if (net.synFreeCount < body.synapses.length) return -1;
  // Sensor/motor binding pools (sized maxNeurons = the binding arrays' length). Guarding these
  // keeps the "never half-builds" promise for bodies with sensors/motors, and pairs with the
  // death-time reclaim (removeMotorsFor/removeSensorsFor) so the counts stay bounded.
  let bodySensors = 0;
  for (let i = 0; i < count; i++) {
    if (body.sensorChannel[i]! >= 0 && body.cellType[i]! === CellType.SENSOR) bodySensors++;
  }
  if (net.sensorCount + bodySensors > net.sensorCell.length) return -1;
  if (net.motorCount + body.motors.length > net.moverCell.length) return -1;
  if (glowEffectors.maxEffectors - glowEffectors.effectorCount < body.glow.length) return -1;

  // Degree pre-check: reuse slotScratch as a per-cell bond-degree counter.
  for (let i = 0; i < count; i++) slotScratch[i] = 0;
  for (let bi = 0; bi < body.bonds.length; bi++) {
    const bd = body.bonds[bi]!;
    slotScratch[bd.a] = slotScratch[bd.a]! + 1;
    slotScratch[bd.b] = slotScratch[bd.b]! + 1;
  }
  const degCap = bonds.degreeCap;
  for (let i = 0; i < count; i++) if (slotScratch[i]! > degCap) return -1;

  const org = organisms.alloc();
  if (org < 0) return -1;

  const f = cells.fields;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);

  // Alloc + place cells in BFS order; slotScratch[local] = slot (overwrites the degree counts).
  for (let i = 0; i < count; i++) {
    const slot = cells.alloc();
    slotScratch[i] = slot;
    const lx = body.localX[i]!;
    const ly = body.localY[i]!;
    f.posX[slot] = x + (lx * cos - ly * sin);
    f.posY[slot] = y + (lx * sin + ly * cos);
    f.velX[slot] = 0;
    f.velY[slot] = 0;
    f.forceX[slot] = 0;
    f.forceY[slot] = 0;
    f.radius[slot] = body.radius[i]!;
    f.mass[slot] = body.mass[i]!;
    f.energy[slot] = body.initialEnergy[i]!;
    f.cellType[slot] = body.cellType[i]!;
    f.organismId[slot] = org;
    f.genomeRef[slot] = genomeRef;
    f.brainRef[slot] = 0;
    f.age[slot] = 0;
    f.heading[slot] = heading;
    f.senseX[slot] = 0;
    f.senseY[slot] = 0;
    f.thrust[slot] = 0;
    net.actCur[slot] = 0; // zero neural state for a recycled slot
    net.actNxt[slot] = 0;
    net.bias[slot] = body.bias[i]!;
  }

  // Bonds: rest length from world positions (wrapDelta), like spawnSwimmer.
  for (let bi = 0; bi < body.bonds.length; bi++) {
    const bd = body.bonds[bi]!;
    const a = slotScratch[bd.a]!;
    const b = slotScratch[bd.b]!;
    const dx = wrapDelta(f.posX[a]! - f.posX[b]!, worldWidth);
    const dy = wrapDelta(f.posY[a]! - f.posY[b]!, worldHeight);
    bonds.addBond(
      a,
      f.generation[a]!,
      b,
      f.generation[b]!,
      Math.sqrt(dx * dx + dy * dy),
      bd.stiffness,
    );
  }

  // Synapses.
  for (let si = 0; si < body.synapses.length; si++) {
    const sy = body.synapses[si]!;
    const pre = slotScratch[sy.pre]!;
    const post = slotScratch[sy.post]!;
    net.addSynapse(pre, f.generation[pre]!, post, f.generation[post]!, sy.weight);
  }

  // Sensor channels (SENSOR genes carry a channel).
  for (let i = 0; i < count; i++) {
    const ch = body.sensorChannel[i]!;
    if (ch >= 0 && body.cellType[i]! === CellType.SENSOR) net.addSensor(slotScratch[i]!, ch);
  }

  // Motors.
  for (let mi = 0; mi < body.motors.length; mi++) {
    const mo = body.motors[mi]!;
    net.addMotor(slotScratch[mo.mover]!, slotScratch[mo.turn]!, slotScratch[mo.thrust]!);
  }

  // Glow effector registrations.
  for (let gi = 0; gi < body.glow.length; gi++) {
    const g = body.glow[gi]!;
    const slot = slotScratch[g.cell]!;
    glowEffectors.addEffector(slot, f.generation[slot]!, g.gain);
  }

  organisms.mover[org] = body.motors.length > 0 ? slotScratch[body.motors[0]!.mover]! : -1;
  organisms.genomeRef[org] = genomeRef;

  net.rebuildLive(cells);
  bonds.rebuildLive(cells);
  return org;
}
