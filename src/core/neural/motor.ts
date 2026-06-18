import { type NeuralNetwork } from './network';

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
): void {
  const act = net.actCur;
  const mc = net.moverCell;
  const tn = net.turnNeuron;
  const hn = net.thrustNeuron;
  const n = net.motorCount;
  const edge = carnivoreThrustMult !== 1;
  for (let k = 0; k < n; k++) {
    const m = mc[k]!;
    heading[m] = heading[m]! + turnScale * act[tn[k]!]!;
    let t = thrustScale * act[hn[k]!]! + thrustBias;
    let cap = maxThrust;
    if (edge && carnivore[organismId[m]!]! === 1) {
      t *= carnivoreThrustMult;
      cap = maxThrust * carnivoreThrustMult;
    }
    if (t < 0) t = 0;
    else if (t > cap) t = cap;
    thrust[m] = t;
  }
}
