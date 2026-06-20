/**
 * Per-entity inspector — click a dot, watch its raw state update live. Phase 0 shows kinematics +
 * bookkeeping; later phases append brain I/O, genome, sense inputs, lineage, plasticity-delta. The
 * selection is held as (slot, genId) so it auto-invalidates when that slot is recycled — you never
 * silently inspect a different organism than the one you clicked.
 */
import { type OrganismStore } from '../../core/store';
import { Brain, BRAIN_GENES } from '../../core/genome';

export class Inspector {
  private slot = -1;
  private gen = 0;

  constructor(private readonly root: HTMLElement) {
    this.render(null);
  }

  select(slot: number, gen: number): void {
    this.slot = slot;
    this.gen = gen;
  }

  clear(): void {
    this.slot = -1;
  }

  render(store: OrganismStore | null): void {
    if (!store || this.slot < 0) {
      this.root.innerHTML = `<div class="muted">click a dot to inspect</div>`;
      return;
    }
    const i = this.slot;
    if (!store.isAlive(i, this.gen)) {
      this.root.innerHTML = `<div class="muted">selected #${i} — gone (slot recycled)</div>`;
      return;
    }
    const speed = Math.hypot(store.vx[i]!, store.vy[i]!);
    const b = i * BRAIN_GENES;
    const gene = (k: number): string => store.brain[b + k]!.toFixed(2);
    const rows: [string, string][] = [
      ['slot', `${i}`],
      ['age', `${store.age[i]!}`],
      ['energy', store.energy[i]!.toFixed(2)],
      ['speed', speed.toFixed(3)],
      ['hue', store.hue[i]!.toFixed(3)],
      ['sense', `${store.senseX[i]!.toFixed(2)}, ${store.senseY[i]!.toFixed(2)}`],
      ['brain·latTurn', gene(Brain.LAT_TURN)],
      ['brain·fwdThrust', gene(Brain.FWD_THRUST)],
      ['brain·cruise', gene(Brain.THRUST_BIAS)],
    ];
    this.root.innerHTML = rows
      .map(
        ([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`,
      )
      .join('');
  }
}
