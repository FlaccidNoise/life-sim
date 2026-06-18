import { type NeuralNetwork } from './network';
import { CellType } from '../cells/types';
import { type CellArrays } from '../memory/cell-store';

/**
 * Standalone SoA pool of GLOW effector bindings (§4.6 neuron→glow effector). A
 * NEURON cell bound as a glow source emits light proportional to its activation
 * into a GlowField. Lives outside NeuralNetwork so no edits to the network class
 * are needed; mirrors the motor-pool pattern but uses its own free-list.
 */
export class GlowEffectors {
  readonly maxEffectors: number;

  /** Neuron cell slot firing glow. */
  readonly neuronCell: Uint32Array;
  /** Generation of the neuron slot (for validation by caller). */
  readonly neuronGen: Uint32Array;
  /** Per-effector scalar gain (noise scale or genome-provided intensity). */
  readonly gain: Float32Array;

  private readonly alive: Uint8Array;
  private readonly freeList: Int32Array;
  private freeTop: number;

  constructor(maxEffectors: number) {
    this.maxEffectors = maxEffectors;
    this.neuronCell = new Uint32Array(maxEffectors);
    this.neuronGen = new Uint32Array(maxEffectors);
    this.gain = new Float32Array(maxEffectors);
    this.alive = new Uint8Array(maxEffectors);
    this.freeList = new Int32Array(maxEffectors);
    for (let i = 0; i < maxEffectors; i++) this.freeList[i] = maxEffectors - 1 - i;
    this.freeTop = maxEffectors;
  }

  get effectorCount(): number {
    return this.maxEffectors - this.freeTop;
  }

  /** Allocate a glow effector slot; returns index or -1 if full. */
  addEffector(cell: number, gen: number, g: number): number {
    if (this.freeTop === 0) return -1;
    const k = this.freeList[--this.freeTop]!;
    this.neuronCell[k] = cell;
    this.neuronGen[k] = gen;
    this.gain[k] = g;
    this.alive[k] = 1;
    return k;
  }

  /**
   * Swap-remove every glow effector whose neuron slot matches `cell`
   * (organism death / neuron recycle reclaim).
   */
  removeFor(cell: number): void {
    for (let k = this.effectorCount - 1; k >= 0; k--) {
      if (this.neuronCell[k] !== cell) continue;
      this.alive[k] = 0;
      this.neuronCell[k] = this.neuronCell[this.effectorCount - 1]!;
      this.neuronGen[k] = this.neuronGen[this.effectorCount - 1]!;
      this.gain[k] = this.gain[this.effectorCount - 1]!;
      this.freeList[this.freeTop++] = k;
    }
  }
}

/** Structural param type for computeGlow — avoids importing GlowField from environment. */
export interface GlowDepositTarget {
  depositAt(x: number, y: number, amount: number): void;
}

/**
 * Read each live glow effector's neuron activation from `net.actCur` and deposit
 * `glowGain * activation` into the glow field at that neuron's world position.
 * Skips non-NEURON slots (recycled). Allocation-free; read-only on net.actCur.
 *
 * Run after THINK+swap so actCur holds a(t) — no lag.
 */
export function computeGlow(
  net: NeuralNetwork,
  glow: GlowDepositTarget,
  eff: GlowEffectors,
  f: CellArrays,
  glowGain: number,
): void {
  const act = net.actCur;
  const nc = eff.neuronCell;
  const ng = eff.neuronGen;
  const g = eff.gain;
  const ct = f.cellType;
  const px = f.posX;
  const py = f.posY;
  const n = eff.effectorCount;
  for (let k = 0; k < n; k++) {
    const i = nc[k]!;
    if (ct[i]! !== CellType.NEURON) continue; // recycled or non-NEURON slot
    const a = act[i]!;
    if (a <= 0) continue;
    glow.depositAt(px[i]!, py[i]!, glowGain * a * g[k]!);
  }
}