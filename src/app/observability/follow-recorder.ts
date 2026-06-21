/**
 * Follow recorder — logs ONE creature's state every tick into a CSV ring buffer, so you can lock onto
 * an individual and read its whole life story (energy swings, the mode it lived in, what its brain was
 * doing) as a table instead of a flicker on screen. Paired with the follow-cam (main.ts) that keeps the
 * creature centered while this records it.
 *
 * record() is called once per sim tick (inside the step loop, so it captures every tick even at 64×).
 * Faithful columns are the observed state (x/y/energy/age/speed/mode); turnNow/thrustNow/drift are the
 * brain's CURRENT response (recomputed via computeBrainState), labeled "now" because they reflect the
 * post-step brain, not the exact value applied mid-step. Read-only — never mutates the sim.
 */
import { type OrganismStore } from '../../core/store';
import { type Config } from '../../core/config';
import { ScalarGene, SCALAR_GENE_COUNT, MIN_BAND } from '../../core/genome';
import { computeBrainState } from './brain-view';

const HEADER = 'tick,x,y,energy,age,speed,mode,diet,turnNow,thrustNow,drift';

export class FollowRecorder {
  private slot = -1;
  private gen = 0;
  private readonly rows: string[] = [];
  private readonly cap: number;

  constructor(cap = 20000) {
    this.cap = cap;
  }

  /** Start following (and recording) a creature. Clears any prior recording. */
  follow(slot: number, gen: number): void {
    this.slot = slot;
    this.gen = gen;
    this.rows.length = 0;
  }

  /** Stop following and discard the recording. */
  clear(): void {
    this.slot = -1;
    this.rows.length = 0;
  }

  get following(): boolean {
    return this.slot >= 0;
  }

  get followedSlot(): number {
    return this.slot;
  }

  /** True only while the followed INDIVIDUAL is still alive (genId-checked, so a recycled slot that now
   *  holds a different creature reads as dead — the camera must release, not silently track the new one). */
  isFollowedAlive(store: OrganismStore): boolean {
    return this.slot >= 0 && store.isAlive(this.slot, this.gen);
  }

  get count(): number {
    return this.rows.length;
  }

  /** Append one row for the followed creature at the current tick (no-op if it's gone). */
  record(store: OrganismStore, cfg: Config, tick: number): void {
    if (this.slot < 0 || !store.isAlive(this.slot, this.gen)) return;
    const i = this.slot;
    const sg = i * SCALAR_GENE_COUNT;
    const e = store.energy[i]!;
    const repro = store.scalarGenes[sg + ScalarGene.REPRO_THRESHOLD]!;
    let satiated = store.scalarGenes[sg + ScalarGene.SATIATED_THRESHOLD]!;
    if (satiated < repro + MIN_BAND) satiated = repro + MIN_BAND;
    const mode = e >= satiated ? 'satiated' : e >= repro ? 'reproductive' : 'survival';
    const speed = Math.hypot(store.vx[i]!, store.vy[i]!);
    const bs = computeBrainState(store, cfg, i);
    const diet = store.scalarGenes[sg + ScalarGene.DIET]!;
    this.rows.push(
      `${tick},${store.x[i]!.toFixed(2)},${store.y[i]!.toFixed(2)},${e.toFixed(3)},` +
        `${store.age[i]!},${speed.toFixed(4)},${mode},${diet.toFixed(3)},` +
        `${bs.turn.toFixed(4)},${bs.thrust.toFixed(4)},${bs.drift.toFixed(3)}`,
    );
    if (this.rows.length > this.cap) this.rows.shift();
  }

  /** The recording as CSV text (header + rows). Empty body if nothing recorded. */
  toCsv(): string {
    return HEADER + '\n' + this.rows.join('\n');
  }
}
