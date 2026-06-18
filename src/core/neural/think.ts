import { type NeuralNetwork } from './network';
import { CellType } from '../cells/types';
import { SensorChannel } from './network';

/**
 * THINK step (§4.3 step 3) — one synchronous double-buffered forward pass of the
 * recurrent equation `a_j(t) = tanh(bias_j + Σ_i w_ij·a_i(t−1))` (§4.6, φ=tanh).
 * Reads `net.actCur` (a(t−1)); writes `net.actNxt`; the caller swaps afterwards so
 * `actCur` then holds a(t). Allocation-free; iterates the snapshotted live-synapse
 * and live-neuron lists; gen-validation of endpoints already happened in
 * `rebuildLive`, but each live-neuron slot's cellType is re-checked (a recycled
 * slot is skipped). NO RNG.
 *
 * Sensor cells are pure inputs: their activation is the food gradient projected
 * into the body frame (heading), NOT computed from synapses. Non-sensor neurons
 * (NEURON, MOVER) sum their incoming synapses over a(t−1).
 */
export function think(
  net: NeuralNetwork,
  cellType: Uint8Array,
  senseX: Float32Array,
  senseY: Float32Array,
  heading: Float32Array,
): void {
  const cur = net.actCur;
  const nxt = net.actNxt;

  // (a) Zero the write buffer for every live neuron slot (O(neurons), not O(cells)).
  const neu = net.liveNeurons;
  const nn = net.liveNeuronCount;
  for (let k = 0; k < nn; k++) nxt[neu[k]!] = 0;

  // (b) Accumulate recurrent synapse contributions into the write buffer (a(t−1)).
  const live = net.liveSynapses;
  const ns = net.liveSynapseCount;
  const { pre, post, weight } = net;
  for (let k = 0; k < ns; k++) {
    const s = live[k]!;
    nxt[post[s]!] = nxt[post[s]!]! + weight[s]! * cur[pre[s]!]!;
  }

  // (c) Inject sensor cells — overwrites their accumulator.
  const sc = net.sensorCell;
  const ch = net.sensorChannel;
  const sn = net.sensorCount;
  for (let k = 0; k < sn; k++) {
    const i = sc[k]!;
    if (cellType[i]! !== CellType.SENSOR) continue;
    const c = ch[k]!;
    if (c === SensorChannel.FWD_GRAD) {
      const h = heading[i]!;
      nxt[i] = senseX[i]! * Math.cos(h) + senseY[i]! * Math.sin(h);
    } else if (c === SensorChannel.LAT_GRAD) {
      const h = heading[i]!;
      nxt[i] = -senseX[i]! * Math.sin(h) + senseY[i]! * Math.cos(h);
    } else {
      // Scalar channel (AMBIENT_LIGHT / TEMP / TOXIN / GLOW): precomputed by senseScalars.
      nxt[i] = net.sensorScalar[i]!;
    }
  }

  // (d) Apply bias + tanh to every non-sensor neuron (sensors already set in (c)).
  const bias = net.bias;
  for (let k = 0; k < nn; k++) {
    const j = neu[k]!;
    const t = cellType[j]!;
    if (t === CellType.SENSOR) continue; // injected, not squashed
    if (t !== CellType.NEURON && t !== CellType.MOVER) continue; // recycled slot
    nxt[j] = Math.tanh(bias[j]! + nxt[j]!);
  }
}
