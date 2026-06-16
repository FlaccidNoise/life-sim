import { type NeuralNetwork } from './network';

/**
 * Copy each organism's MOVER heading to its SENSOR cells (§4.6 body-frame projection).
 * After the M4 critter is folded into bonds, SENSOR cells no longer inherit the body
 * heading via the (deleted) kinematic snap, so they would project the food gradient in
 * a stale frame. Run before THINK; reads the MOVER heading set by the PREVIOUS tick's
 * driveMovers (the same one-tick orientation lag M4 documented — imperceptible for
 * chemotaxis). `organismMover` is `OrganismTable.mover` (−1 = no mover). Allocation-free;
 * no organism-module import (keeps the §5.1 layering: neural ↛ organism).
 */
export function orientSensors(
  net: NeuralNetwork,
  organismId: Uint32Array,
  organismMover: Int32Array,
  heading: Float32Array,
): void {
  const sc = net.sensorCell;
  const sn = net.sensorCount;
  for (let k = 0; k < sn; k++) {
    const i = sc[k]!;
    const org = organismId[i]!;
    if (org === 0) continue;
    const m = organismMover[org]!;
    if (m >= 0) heading[i] = heading[m]!;
  }
}
