/**
 * THINK + ACT step — each creature runs its OWN brain (a heritable per-creature genome, §genome.ts).
 * The brain is a minimal linear sensor→motor map: the food gradient in the heading frame (forward,
 * lateral) → turn + thrust. Reads the 6 brain weights for the creature's slot; turns the heading and
 * SETS the force buffer to the resulting thrust (repulsion += on top afterward).
 *
 * Because the weights are heritable + mutated at birth, behavior now EVOLVES: a creature that steers
 * better forages better, reproduces more, and its weights (and color) spread. A later brick grows
 * this into a recurrent hidden-layer net and adds within-life (Baldwin) learning.
 */
import { type OrganismStore } from './store';
import { Brain, BRAIN_GENES } from './genome';

export function steer(store: OrganismStore, maxTurn: number, maxThrust: number): void {
  const { liveIndices, liveCount, heading, senseX, senseY, forceX, forceY, brain } = store;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const h = heading[i]!;
    const dx = Math.cos(h);
    const dy = Math.sin(h);
    const gx = senseX[i]!;
    const gy = senseY[i]!;
    const fwd = gx * dx + gy * dy; // food gradient ahead
    const lat = -gx * dy + gy * dx; // food gradient to the left

    const b = i * BRAIN_GENES;
    let turn =
      brain[b + Brain.LAT_TURN]! * lat +
      brain[b + Brain.FWD_TURN]! * fwd +
      brain[b + Brain.TURN_BIAS]!;
    if (turn > maxTurn) turn = maxTurn;
    else if (turn < -maxTurn) turn = -maxTurn;
    const nh = h + turn;
    heading[i] = nh;

    let thrust =
      brain[b + Brain.LAT_THRUST]! * lat +
      brain[b + Brain.FWD_THRUST]! * fwd +
      brain[b + Brain.THRUST_BIAS]!;
    if (thrust < 0) thrust = 0;
    else if (thrust > maxThrust) thrust = maxThrust;
    forceX[i] = thrust * Math.cos(nh);
    forceY[i] = thrust * Math.sin(nh);
  }
}
