import { type CellStore } from '../memory/cell-store';
import { isNeural } from '../cells/types';

/** Sensor channel = which scalar a SENSOR cell injects as its activation each tick. */
export const SensorChannel = {
  /** Food gradient projected onto the body's forward axis. */
  FWD_GRAD: 0,
  /** Food gradient projected onto the body's lateral (left/right) axis. */
  LAT_GRAD: 1,
} as const;
export type SensorChannelValue = (typeof SensorChannel)[keyof typeof SensorChannel];

/**
 * The recurrent neuron-cell network (§4.6). A flat SoA synapse pool with a
 * free-list and gen-validated endpoints (slot index + generation in SEPARATE
 * parallel arrays — never bit-packed, §4.2). Per-cell `bias` and a double-buffered
 * activation pair (`actCur` = a(t−1) entering THINK, a(t) after `swap`; `actNxt` =
 * write scratch) are sized to `maxCells` and owned here so the buffer swap is a
 * pointer exchange (CellStore SoA views cannot swap). Topology is snapshotted:
 * `rebuildLive` is called only on structural events, never per tick.
 *
 * One global network across all organisms in single-thread (THINK iterates the
 * global live-synapse list); M8 partitions by organism graph.
 */
export class NeuralNetwork {
  readonly maxCells: number;
  readonly maxSynapses: number;

  // Synapse SoA pool.
  readonly pre: Uint32Array;
  readonly preGen: Uint32Array;
  readonly post: Uint32Array;
  readonly postGen: Uint32Array;
  readonly weight: Float32Array;
  private readonly synAlive: Uint8Array;
  private readonly synFree: Int32Array;
  private synFreeTop: number;

  // Per-cell neural state (indexed by cell slot).
  readonly bias: Float32Array;
  actCur: Float32Array;
  actNxt: Float32Array;

  // Compact live lists, rebuilt on structural events (ascending slot order).
  readonly liveSynapses: Uint32Array;
  liveSynapseCount: number;
  readonly liveNeurons: Uint32Array;
  liveNeuronCount: number;

  // Sensor bindings: which cell injects which channel.
  readonly sensorCell: Uint32Array;
  readonly sensorChannel: Uint8Array;
  sensorCount: number;

  // Motor bindings: a MOVER reads (turnNeuron, thrustNeuron) activations.
  readonly moverCell: Uint32Array;
  readonly turnNeuron: Uint32Array;
  readonly thrustNeuron: Uint32Array;
  motorCount: number;

  constructor(maxCells: number, maxSynapses: number, maxNeurons: number) {
    this.maxCells = maxCells;
    this.maxSynapses = maxSynapses;

    this.pre = new Uint32Array(maxSynapses);
    this.preGen = new Uint32Array(maxSynapses);
    this.post = new Uint32Array(maxSynapses);
    this.postGen = new Uint32Array(maxSynapses);
    this.weight = new Float32Array(maxSynapses);
    this.synAlive = new Uint8Array(maxSynapses);
    this.synFree = new Int32Array(maxSynapses);
    for (let i = 0; i < maxSynapses; i++) this.synFree[i] = maxSynapses - 1 - i;
    this.synFreeTop = maxSynapses;

    this.bias = new Float32Array(maxCells);
    this.actCur = new Float32Array(maxCells);
    this.actNxt = new Float32Array(maxCells);

    this.liveSynapses = new Uint32Array(maxSynapses);
    this.liveSynapseCount = 0;
    this.liveNeurons = new Uint32Array(maxNeurons);
    this.liveNeuronCount = 0;

    this.sensorCell = new Uint32Array(maxNeurons);
    this.sensorChannel = new Uint8Array(maxNeurons);
    this.sensorCount = 0;

    this.moverCell = new Uint32Array(maxNeurons);
    this.turnNeuron = new Uint32Array(maxNeurons);
    this.thrustNeuron = new Uint32Array(maxNeurons);
    this.motorCount = 0;
  }

  /** Allocate a synapse; returns slot or -1 if the pool is full (refuse-new policy). */
  addSynapse(pre: number, preGen: number, post: number, postGen: number, weight: number): number {
    if (this.synFreeTop === 0) return -1;
    const s = this.synFree[--this.synFreeTop]!;
    this.pre[s] = pre;
    this.preGen[s] = preGen;
    this.post[s] = post;
    this.postGen[s] = postGen;
    this.weight[s] = weight;
    this.synAlive[s] = 1;
    return s;
  }

  /** Free a synapse slot (M5 structural events; provided for completeness). */
  freeSynapse(s: number): void {
    if (this.synAlive[s] === 0) return;
    this.synAlive[s] = 0;
    this.synFree[this.synFreeTop++] = s;
  }

  addSensor(cell: number, channel: number): void {
    const k = this.sensorCount++;
    this.sensorCell[k] = cell;
    this.sensorChannel[k] = channel;
  }

  addMotor(mover: number, turnNeuron: number, thrustNeuron: number): void {
    const k = this.motorCount++;
    this.moverCell[k] = mover;
    this.turnNeuron[k] = turnNeuron;
    this.thrustNeuron[k] = thrustNeuron;
  }

  /**
   * Rebuild the live-synapse and live-neuron lists (ascending slot order).
   * Synapses with a dangling endpoint (dead/recycled cell — generation mismatch)
   * are pruned. Call ONLY on structural events (cell/synapse birth/death), per the
   * §4.6 snapshot rule — never per tick.
   */
  rebuildLive(store: CellStore): void {
    const f = store.fields;
    // Live neurons: alive neural cells, ascending.
    let nn = 0;
    for (let i = 0; i < store.capacity; i++) {
      if (store.isAlive(i) && isNeural(f.cellType[i]!)) this.liveNeurons[nn++] = i;
    }
    this.liveNeuronCount = nn;
    // Live synapses: alive slot + both endpoints gen-valid, ascending.
    let ns = 0;
    for (let s = 0; s < this.maxSynapses; s++) {
      if (this.synAlive[s] === 0) continue;
      if (!store.validate(this.pre[s]!, this.preGen[s]!)) continue;
      if (!store.validate(this.post[s]!, this.postGen[s]!)) continue;
      this.liveSynapses[ns++] = s;
    }
    this.liveSynapseCount = ns;
  }

  /** Exchange the activation double buffer by reference (after THINK writes actNxt). */
  swap(): void {
    const t = this.actCur;
    this.actCur = this.actNxt;
    this.actNxt = t;
  }
}
