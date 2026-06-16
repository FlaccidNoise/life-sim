import { type NeuralNetwork } from './network';

/**
 * Motor binding (§4.6 neuron→mover effector). For each MOVER, read its two motor
 * neurons' current activations (`net.actCur`, a(t) after the THINK swap): the turn
 * neuron rotates `heading` by `turnScale·a`, the thrust neuron sets
 * `thrust = clamp(thrustScale·a + thrustBias, 0, maxThrust)`. Allocation-free.
 * Runs at ACT (§4.3 step 4), same tick THINK wrote the activations (no lag).
 */
export function driveMovers(
  net: NeuralNetwork,
  heading: Float32Array,
  thrust: Float32Array,
  turnScale: number,
  thrustScale: number,
  thrustBias: number,
  maxThrust: number,
): void {
  const act = net.actCur;
  const mc = net.moverCell;
  const tn = net.turnNeuron;
  const hn = net.thrustNeuron;
  const n = net.motorCount;
  for (let k = 0; k < n; k++) {
    const m = mc[k]!;
    heading[m] = heading[m]! + turnScale * act[tn[k]!]!;
    let t = thrustScale * act[hn[k]!]! + thrustBias;
    if (t < 0) t = 0;
    else if (t > maxThrust) t = maxThrust;
    thrust[m] = t;
  }
}
