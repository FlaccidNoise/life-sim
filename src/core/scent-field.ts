/**
 * Identity-bearing scent: a FIXED-N bank of diffusing scalar PheroFields. Each creature deposits a
 * low-dimensional "signature" — a projection of its genetic makeup — across the channels:
 *
 *   ch0 PREY    ∝ (1 − diet)           grazers smell edible → predators evolve to climb it (follow prey)
 *   ch1 PRED    ∝ diet                 hunters smell dangerous → prey evolve to descend it (flee predators)
 *   ch2 SIG_COS ∝ 0.5 + 0.5·cos(2πh)   hue projected onto a 2-D compass → lineages climb their own
 *   ch3 SIG_SIN ∝ 0.5 + 0.5·sin(2πh)   hue-mix → kin/species clustering (emergent at the lineage level)
 *
 * NOT per-creature (that is infeasible: thousands of creatures × a grid each). N small & fixed gives the
 * same emergent behavior at fixed cost. Each channel reuses PheroField's toroidal diffuse / multiplicative
 * decay / central-difference gradient / wall no-flux / deterministic hash VERBATIM. RNG-free throughout
 * (deposit split is pure arithmetic; field updates are pure). Diffuse/decay are shared across channels.
 *
 * `identity=false` (the ablation) deposits `amount` equally into all channels: the field still lives and
 * diffuses, but carries no role/kin information (every channel identical → gradients identical → no
 * follow/flee/cluster can emerge). Same cost, gene layout, and determinism — it isolates the INFORMATION.
 */
import { PheroField } from './phero-field';

export const SCENT_CHANNELS = 4;
export const Scent = { PREY: 0, PRED: 1, SIG_COS: 2, SIG_SIN: 3 } as const;

const TWO_PI = Math.PI * 2;

export class ScentField {
  private readonly ch: PheroField[];

  constructor(worldWidth: number, worldHeight: number, cols: number, rows: number) {
    this.ch = [];
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      this.ch.push(new PheroField(worldWidth, worldHeight, cols, rows));
    }
  }

  channel(c: number): PheroField {
    return this.ch[c]!;
  }

  /** Deposit a creature's signature. identity=true → split by diet/hue; false → equal into all channels. */
  deposit(x: number, y: number, diet: number, hue: number, amount: number, identity: boolean): void {
    if (amount <= 0) return;
    if (!identity) {
      for (let c = 0; c < SCENT_CHANNELS; c++) this.ch[c]!.deposit(x, y, amount);
      return;
    }
    const a = hue * TWO_PI;
    this.ch[Scent.PREY]!.deposit(x, y, amount * (1 - diet));
    this.ch[Scent.PRED]!.deposit(x, y, amount * diet);
    this.ch[Scent.SIG_COS]!.deposit(x, y, amount * (0.5 + 0.5 * Math.cos(a)));
    this.ch[Scent.SIG_SIN]!.deposit(x, y, amount * (0.5 + 0.5 * Math.sin(a)));
  }

  stepAll(diffuse: number, decay: number, blocked: Uint8Array | null): void {
    for (let c = 0; c < SCENT_CHANNELS; c++) this.ch[c]!.step(diffuse, decay, blocked);
  }

  /** Write each channel's world-frame gradient into outX[base+c]/outY[base+c]. */
  gradientsInto(
    x: number,
    y: number,
    step: number,
    outX: Float64Array,
    outY: Float64Array,
    base: number,
  ): void {
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      const g = this.ch[c]!.gradientAt(x, y, step);
      outX[base + c] = g.gx;
      outY[base + c] = g.gy;
    }
  }

  reset(): void {
    for (let c = 0; c < SCENT_CHANNELS; c++) this.ch[c]!.reset();
  }

  /** Hash all channels in channel order (the scent is sim state when active). */
  hashInto(h: { f: (v: number) => void }): void {
    for (let c = 0; c < SCENT_CHANNELS; c++) this.ch[c]!.hashInto(h);
  }

  fillTexture(c: number, out: Uint8Array): void {
    this.ch[c]!.fillTexture(out);
  }
}
