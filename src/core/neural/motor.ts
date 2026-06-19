import { type NeuralNetwork } from './network';
import { hashFloat3 } from '../math/rng';

/**
 * Motor binding (§4.6 neuron→mover effector). For each MOVER, read its two motor
 * neurons' current activations (`net.actCur`, a(t) after the THINK swap): the turn
 * neuron rotates `heading` by `turnScale·a`, the thrust neuron sets
 * `thrust = clamp(thrustScale·a + thrustBias, 0, maxThrust)`. Allocation-free.
 * Runs at ACT (§4.3 step 4), same tick THINK wrote the activations (no lag).
 *
 * CARNIVORE SPEED EDGE: when `carnivoreThrustMult !== 1`, a MOVER whose organism is flagged
 * carnivore has its thrust (and its maxThrust ceiling) scaled by the multiplier — predators move
 * faster than equal-speed prey so they can reposition/close (the speed half of the ambush+speed
 * fix). The branch is gated on `!== 1` so the default leaves the M2-M7 economy byte-identical.
 *
 * SATIATED-ROAM (exploreWander > 0, herbivore demo): a forager is pure chemotaxis (steer to food,
 * thrust to food), so once fed it oscillates on the food patch — it WIGGLES, never swims. When a
 * NON-carnivore MOVER's energy ≥ grazeSatiation (it's full) we OVERRIDE the food-steering brain with
 * a deterministic wander (hashFloat3 heading drift) + a cruise thrust, so a sated forager swims OFF
 * to explore open water and only re-engages food-seeking once it's hungry again (feed→patrol→feed).
 * Gated on exploreWander>0 (default 0) so the legacy motor path is byte-identical. hashFloat3 keeps
 * it deterministic; the loop is ascending-k.
 */
export function driveMovers(
  net: NeuralNetwork,
  heading: Float32Array,
  thrust: Float32Array,
  turnScale: number,
  thrustScale: number,
  thrustBias: number,
  maxThrust: number,
  organismId: Uint32Array,
  carnivore: Uint8Array,
  carnivoreThrustMult: number,
  energy: Float32Array,
  grazeSatiation: number,
  exploreWander: number,
  seed: number,
  tick: number,
  patrolCruise: number,
): void {
  const act = net.actCur;
  const mc = net.moverCell;
  const tn = net.turnNeuron;
  const hn = net.thrustNeuron;
  const n = net.motorCount;
  const edge = carnivoreThrustMult !== 1;
  const explore = exploreWander > 0;
  const patrol = patrolCruise > 0;
  for (let k = 0; k < n; k++) {
    const m = mc[k]!;
    const org = organismId[m]!;
    if (explore && carnivore[org]! !== 1 && energy[m]! >= grazeSatiation) {
      // Satiated herbivore → roam (ignore food-steering): gentle wander + cruise so it swims off.
      heading[m] = heading[m]! + (hashFloat3(seed, tick, m) - 0.5) * 2 * exploreWander;
      thrust[m] = maxThrust * 0.6;
      continue;
    }
    heading[m] = heading[m]! + turnScale * act[tn[k]!]!;
    let t = thrustScale * act[hn[k]!]! + thrustBias;
    let cap = maxThrust;
    if (edge && carnivore[org]! === 1) {
      t *= carnivoreThrustMult;
      cap = maxThrust * carnivoreThrustMult;
    } else if (patrol) {
      // BASELINE PATROL (hunger-independent): a thrust FLOOR + gentle wander layered on top of the
      // chemotaxis steer (act[tn] already applied above), so a HUNGRY herbivore keeps swimming and
      // patrolling its community instead of camping the food-gradient peak and oscillating (the
      // steady-state "wiggle"). It still climbs the gradient — it just never sits still. Default 0 = off.
      if (t < patrolCruise) t = patrolCruise;
      heading[m] = heading[m]! + (hashFloat3(seed, tick, m) - 0.5) * 2 * exploreWander;
    }
    if (t < 0) t = 0;
    else if (t > cap) t = cap;
    thrust[m] = t;
  }
}
