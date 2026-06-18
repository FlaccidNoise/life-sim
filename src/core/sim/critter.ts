import { type World } from './world';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';
import { SenseSource, SightTarget } from '../cells/sense-source';
import { wrapDelta } from '../math/vec2';

export interface Critter {
  organismId: number;
  mover: number;
  sensorFwd: number;
  sensorLat: number;
  clockA: number;
  clockB: number;
  turn: number;
  thrust: number;
}

/**
 * §10 R3 hand-wired sensorimotor critter, now a REAL bonded organism (M5; replaces the
 * M4 kinematic rigid grouping). A MOVER body with two front SENSOR cells (forward/lateral
 * food-gradient channels), a 2-neuron recurrent clock (search oscillator), and two output
 * NEURONs (turn, thrust) the MOVER reads. Cohesion is bond springs (MOVER spokes + rim
 * bracing + front↔back cross-body bonds for connectivity redundancy) PLUS heavier-than-
 * ecosystem cells (mass 2) so the body resists repulsion jostling and holds together as
 * ONE organism in the dense ecosystem. Energy is shared by intra-organism transfer. Organism
 * orientation = the MOVER's heading (propagated to the SENSORs by orientSensors). Cells
 * are provisioned with a large reserve and are lifecycle-exempt (organismId != 0), so the
 * topology is stable for the whole run. Deterministic (organism id from the per-World
 * OrganismTable free-list → first build gets id 1).
 */
/**
 * Critter cells are heavier than free ecosystem cells (mass 1). A heavier cell resists
 * the repulsion fling (accel = F/m) when the bonded body is jostled by the dense
 * ecosystem, keeping bond strain low (measured peak ≈0.42 vs the 1.0 break threshold) so
 * the organism holds together as ONE component instead of fragmenting. mass 2 was chosen
 * empirically (headless/cohesion-probe.ts): it cohered 6/6 spawned critters while keeping
 * the best locomotion; heavier (3–6) coheres too but locomotes less. It also makes the bond
 * spring more stable (k_eff/mass falls further below the integrator ceiling).
 */
const CRITTER_MASS = 2;

export function spawnSwimmer(world: World, x: number, y: number, heading: number): Critter {
  const f = world.cells.fields;
  const r = world.config.cellRadius;
  const org = world.organisms.alloc();
  if (org < 0) throw new Error('spawnSwimmer: out of organism ids');
  const RESERVE = 5000;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);

  const make = (type: number, ox: number, oy: number): number => {
    const i = world.cells.alloc();
    if (i < 0) throw new Error('spawnSwimmer: out of cell slots');
    f.posX[i] = x + (ox * cos - oy * sin);
    f.posY[i] = y + (ox * sin + oy * cos);
    f.velX[i] = 0;
    f.velY[i] = 0;
    f.forceX[i] = 0;
    f.forceY[i] = 0;
    f.radius[i] = r;
    f.mass[i] = CRITTER_MASS;
    f.energy[i] = RESERVE;
    f.cellType[i] = type;
    f.organismId[i] = org;
    f.genomeRef[i] = 0;
    f.brainRef[i] = 0;
    f.age[i] = 0;
    f.heading[i] = heading;
    f.senseX[i] = 0;
    f.senseY[i] = 0;
    f.thrust[i] = 0;
    return i;
  };

  // Body at the centre; passengers placed beyond the 2r contact range (no self-repulsion).
  const off = 4 * r;
  const lat = off * 0.6;
  const aft = off * 1.8;
  const mover = make(CellType.MOVER, 0, 0);
  const sensorFwd = make(CellType.SENSOR, off, -lat);
  const sensorLat = make(CellType.SENSOR, off, lat);
  const clockA = make(CellType.NEURON, -off, -lat);
  const clockB = make(CellType.NEURON, -off, lat);
  const turn = make(CellType.NEURON, -aft, 0);
  const thrust = make(CellType.NEURON, aft, 0);

  const net = world.net;
  const g = (i: number): number => f.generation[i]!;

  // Sensor channels.
  net.addSensor(sensorFwd, SensorChannel.FWD_GRAD, SenseSource.SMELL, SightTarget.FOOD);
  net.addSensor(sensorLat, SensorChannel.LAT_GRAD, SenseSource.SMELL, SightTarget.FOOD);

  // Steering loop: lateral gradient → turn; forward gradient → thrust (+ cruise bias).
  net.addSynapse(sensorLat, g(sensorLat), turn, g(turn), 1.5);
  net.addSynapse(sensorFwd, g(sensorFwd), thrust, g(thrust), 1.5);
  net.bias[thrust] = 0.5;
  // Recurrent clock → a slow search sweep on the turn neuron.
  net.addSynapse(clockB, g(clockB), clockA, g(clockA), 0.9);
  net.addSynapse(clockA, g(clockA), clockB, g(clockB), -0.9);
  net.bias[clockA] = 0.2;
  net.addSynapse(clockA, g(clockA), turn, g(turn), 0.3);
  net.addMotor(mover, turn, thrust);

  // M5 cohesion: bond springs (rest length = the spawn distance). Spokes from the MOVER
  // to every cell + bracing between rim cells → a triangulated, near-rigid body.
  world.organisms.mover[org] = mover;
  const k = 1; // per-bond relative stiffness; the global scale is cfg.bondStiffness
  const bond = (i: number, j: number): void => {
    const dx = wrapDelta(f.posX[i]! - f.posX[j]!, world.config.worldWidth);
    const dy = wrapDelta(f.posY[i]! - f.posY[j]!, world.config.worldHeight);
    const rl = Math.sqrt(dx * dx + dy * dy);
    const s = world.bonds.addBond(i, g(i), j, g(j), rl, k);
    if (s < 0) throw new Error('spawnSwimmer: out of bond slots or over the degree cap');
  };
  // Spokes (MOVER → all 6).
  bond(mover, sensorFwd);
  bond(mover, sensorLat);
  bond(mover, clockA);
  bond(mover, clockB);
  bond(mover, turn);
  bond(mover, thrust);
  // Bracing (rim triangulation; each rim cell stays ≤ degreeCap=8).
  bond(sensorFwd, sensorLat);
  bond(sensorFwd, thrust);
  bond(sensorLat, thrust);
  bond(clockA, clockB);
  bond(clockA, turn);
  bond(clockB, turn);
  // Cross-body redundancy: connect the front {sensorFwd,sensorLat,thrust} and back
  // {clockA,clockB,turn} triangles DIRECTLY (not only through the MOVER hub), so losing a
  // hub spoke does not detach a triangle — the organism stays one connected component.
  bond(sensorFwd, clockA);
  bond(sensorLat, clockB);
  bond(thrust, turn);

  net.rebuildLive(world.cells);
  world.bonds.rebuildLive(world.cells);

  return { organismId: org, mover, sensorFwd, sensorLat, clockA, clockB, turn, thrust };
}
