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

  render(store: OrganismStore | null, reproThreshold = 0, satiatedThreshold = 0): void {
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
    // Baldwin learning is visible here: each weight shows the LEARNED runtime value with its GENOME
    // (instinct) value in parens — watch them diverge over a life, then snap back together at birth.
    // `drift` is the total |learned − instinct| across all weights: a single legible "how much has this
    // creature learned" number that grows with age and resets to 0 in its offspring.
    const wrow = (k: number): string =>
      `${store.learnedBrain[b + k]!.toFixed(2)} (${store.brain[b + k]!.toFixed(2)})`;
    let drift = 0;
    for (let g = 0; g < BRAIN_GENES; g++)
      drift += Math.abs(store.learnedBrain[b + g]! - store.brain[b + g]!);
    // Energy band → behavioral mode + the learning gate (0 in survival → 1 at satiation).
    const e = store.energy[i]!;
    const mode =
      e >= satiatedThreshold ? 'SATIATED' : e >= reproThreshold ? 'REPRODUCTIVE' : 'SURVIVAL';
    const span = satiatedThreshold - reproThreshold;
    const gate = span > 0 ? Math.max(0, Math.min(1, (e - reproThreshold) / span)) : 0;
    const rows: [string, string][] = [
      ['slot', `${i}`],
      ['age', `${store.age[i]!}`],
      ['energy', e.toFixed(2)],
      ['mode', mode],
      ['speed', speed.toFixed(3)],
      ['hue', store.hue[i]!.toFixed(3)],
      ['sense', `${store.senseX[i]!.toFixed(2)}, ${store.senseY[i]!.toFixed(2)}`],
      ['learn gate', gate.toFixed(2)],
      ['learn drift', drift.toFixed(3)],
      ['latTurn now(gene)', wrow(Brain.LAT_TURN)],
      ['fwdThrust now(gene)', wrow(Brain.FWD_THRUST)],
      ['cruise now(gene)', wrow(Brain.THRUST_BIAS)],
    ];
    this.root.innerHTML = rows
      .map(
        ([k, v]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`,
      )
      .join('');
  }
}
