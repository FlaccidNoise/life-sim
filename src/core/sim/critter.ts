import { type World } from './world';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';

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
 * §10 R3 hand-wired sensorimotor critter: a MOVER body with two front SENSOR cells
 * (forward/lateral food-gradient channels), a 2-neuron recurrent clock (search
 * oscillator — demonstrates persistent activation), and two output NEURONs (turn,
 * thrust) the MOVER reads. Built deterministically; cells are provisioned with a
 * large energy reserve (maternal-provisioning analog) so the critter survives the
 * demo horizon without M5 intra-organism transfer. Neural cells are exempt from
 * lifecycle death/division (see cells/lifecycle), so the topology never corrupts.
 *
 * Passenger offsets exceed the contact range (2·cellRadius) so the kinematic group
 * never soft-repels itself; positions are snapped each tick by repositionPassengers.
 */
export function spawnSwimmer(world: World, x: number, y: number, heading: number): Critter {
  const f = world.cells.fields;
  const r = world.config.cellRadius;
  // Per-World deterministic organism id (no module-global state → no cross-test/cross-run
  // determinism hazard; two fresh Worlds both start at 1).
  const org = world.nextOrganismId++;
  const RESERVE = 5000;

  const make = (type: number, ox: number, oy: number): number => {
    const i = world.cells.alloc();
    if (i < 0) throw new Error('spawnSwimmer: out of cell slots');
    // initial position = body-frame offset rotated by heading (reposition keeps it there)
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    f.posX[i] = x + (ox * cos - oy * sin);
    f.posY[i] = y + (ox * sin + oy * cos);
    f.velX[i] = 0;
    f.velY[i] = 0;
    f.forceX[i] = 0;
    f.forceY[i] = 0;
    f.radius[i] = r;
    f.mass[i] = 1;
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

  // Body at the centre; passengers placed comfortably beyond the 2r contact range so the
  // kinematic group never soft-repels itself (asserted in critter.test). Offsets are
  // computed once and reused for both placement and the rigid-group table (no duplication).
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
  net.addSensor(sensorFwd, SensorChannel.FWD_GRAD);
  net.addSensor(sensorLat, SensorChannel.LAT_GRAD);

  // Steering loop: lateral gradient → turn; forward gradient → thrust (+ cruise bias).
  net.addSynapse(sensorLat, g(sensorLat), turn, g(turn), 1.5);
  net.addSynapse(sensorFwd, g(sensorFwd), thrust, g(thrust), 1.5);
  net.bias[thrust] = 0.5; // forward cruise

  // Recurrent clock oscillator → a slow search sweep on the turn neuron.
  net.addSynapse(clockB, g(clockB), clockA, g(clockA), 0.9);
  net.addSynapse(clockA, g(clockA), clockB, g(clockB), -0.9);
  net.bias[clockA] = 0.2; // kick the oscillator off zero
  net.addSynapse(clockA, g(clockA), turn, g(turn), 0.3);

  // Motor binding: the MOVER reads (turn, thrust) neuron activations.
  net.addMotor(mover, turn, thrust);

  // Rigid group: every cell except the body is a passenger at its body-frame offset.
  world.addPassenger(sensorFwd, mover, off, -lat);
  world.addPassenger(sensorLat, mover, off, lat);
  world.addPassenger(clockA, mover, -off, -lat);
  world.addPassenger(clockB, mover, -off, lat);
  world.addPassenger(turn, mover, -aft, 0);
  world.addPassenger(thrust, mover, aft, 0);

  net.rebuildLive(world.cells);

  return { organismId: org, mover, sensorFwd, sensorLat, clockA, clockB, turn, thrust };
}
