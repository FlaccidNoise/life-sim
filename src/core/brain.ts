/**
 * THINK + ACT step (Phase 3) — the steering controller. Reads the sensed food gradient (senseX/senseY)
 * in the organism's HEADING frame and:
 *   - turns toward the side with more food:   turn   = clamp(turnGain · lateralGradient, ±maxTurn)
 *   - thrusts forward, harder up-gradient:    thrust = clamp(cruiseThrust + thrustGain · fwdGradient, 0, maxThrust)
 * then SETS the force buffer to that thrust along the new heading (repulsion += on top afterward).
 *
 * This is a 2-input linear sensor→motor map — the honest, minimal precursor to the evolvable neural
 * net: Phase 5 makes these gains a per-organism heritable genome (+ a hidden layer), Phase 6 adds
 * within-life plasticity. The ABLATION knob is the gains: turnGain=thrustGain=0 → blind cruise (still
 * self-propelled, but ignores food) — isolating the value of SENSING from the value of propulsion.
 * cruiseThrust is always on so "sensing off" is a fair baseline (moving, just not toward food).
 */
import { type OrganismStore } from './store';

export function steer(
  store: OrganismStore,
  turnGain: number,
  thrustGain: number,
  cruiseThrust: number,
  maxTurn: number,
  maxThrust: number,
): void {
  const { liveIndices, liveCount, heading, senseX, senseY, forceX, forceY } = store;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const h = heading[i]!;
    const dx = Math.cos(h);
    const dy = Math.sin(h);
    const gx = senseX[i]!;
    const gy = senseY[i]!;
    const fwd = gx * dx + gy * dy; // gradient component ahead
    const lat = -gx * dy + gy * dx; // gradient component to the left

    let turn = turnGain * lat;
    if (turn > maxTurn) turn = maxTurn;
    else if (turn < -maxTurn) turn = -maxTurn;
    const nh = h + turn;
    heading[i] = nh;

    let thrust = cruiseThrust + thrustGain * fwd;
    if (thrust < 0) thrust = 0;
    else if (thrust > maxThrust) thrust = maxThrust;
    forceX[i] = thrust * Math.cos(nh);
    forceY[i] = thrust * Math.sin(nh);
  }
}
