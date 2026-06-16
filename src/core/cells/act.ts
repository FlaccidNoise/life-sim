import { type CellArrays } from '../memory/cell-store';
import { CellType } from './types';

const TAU = Math.PI * 2;

/**
 * ACT step (§4.3 step 4) — the hardcoded pre-neural chemotaxis reflex (M4 replaces
 * this with a neuron-cell network at the same seam). For each mover (MOTILE): steer
 * `heading` toward the sensed gradient by at most `turnRate` rad/tick, and set
 * `thrust = clamp(thrustGain·|grad|, 0, maxThrust)`. Below `senseThreshold` the
 * cell coasts at `cruiseThrust` (deterministic roaming so a cell in a flat zone
 * still explores — NO RNG). Allocation-free; scalar/array params only.
 */
export function act(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  turnRate: number,
  thrustGain: number,
  maxThrust: number,
  senseThreshold: number,
  cruiseThrust: number,
): void {
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    if (f.cellType[i]! !== CellType.MOTILE) continue;
    const gx = f.senseX[i]!;
    const gy = f.senseY[i]!;
    const mag = Math.sqrt(gx * gx + gy * gy);
    if (mag > senseThreshold) {
      const desired = Math.atan2(gy, gx);
      let d = desired - f.heading[i]!;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const step = d > turnRate ? turnRate : d < -turnRate ? -turnRate : d;
      f.heading[i] = f.heading[i]! + step;
      let t = thrustGain * mag;
      if (t > maxThrust) t = maxThrust;
      f.thrust[i] = t;
    } else {
      f.thrust[i] = cruiseThrust;
    }
  }
}
