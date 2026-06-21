/**
 * Per-entity inspector — click a dot, watch its raw state update live. Phase 0 shows kinematics +
 * bookkeeping; later phases append brain I/O, genome, sense inputs, lineage, plasticity-delta. The
 * selection is held as (slot, genId) so it auto-invalidates when that slot is recycled — you never
 * silently inspect a different organism than the one you clicked.
 */
import { type OrganismStore } from '../../core/store';
import { type Config } from '../../core/config';
import {
  Brain,
  BRAIN_GENES,
  ScalarGene,
  SCALAR_GENE_COUNT,
  MIN_BAND,
  geneUpkeep,
} from '../../core/genome';

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

  render(store: OrganismStore | null, cfg: Config | null = null): void {
    if (!store || !cfg || this.slot < 0) {
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
    // Evolvable scalar genes (per-creature, heritable) + the basal upkeep they cost this creature.
    const sg = i * SCALAR_GENE_COUNT;
    const g = (k: number): string => store.scalarGenes[sg + k]!.toFixed(2);
    // Energy band → behavioral mode + the learning gate, using this creature's OWN life-history bars.
    const e = store.energy[i]!;
    const repro = store.scalarGenes[sg + ScalarGene.REPRO_THRESHOLD]!;
    let satiated = store.scalarGenes[sg + ScalarGene.SATIATED_THRESHOLD]!;
    if (satiated < repro + MIN_BAND) satiated = repro + MIN_BAND;
    const mode = e >= satiated ? 'SATIATED' : e >= repro ? 'REPRODUCTIVE' : 'SURVIVAL';
    const gate = Math.max(0, Math.min(1, (e - repro) / (satiated - repro)));
    const rows: [string, string][] = [
      ['slot', `${i}`],
      ['age', `${store.age[i]!}`],
      ['energy', e.toFixed(2)],
      ['mode', mode],
      ['speed', speed.toFixed(3)],
      ['hue', store.hue[i]!.toFixed(3)],
      ['gene·maxSpeed', g(ScalarGene.MAX_SPEED)],
      ['gene·eatRate', g(ScalarGene.EAT_RATE)],
      ['gene·senseRange', g(ScalarGene.SENSE_RANGE)],
      ['gene·size', g(ScalarGene.SIZE)],
      ['gene·maxTurn', g(ScalarGene.MAX_TURN)],
      ['gene·maxThrust', g(ScalarGene.MAX_THRUST)],
      ['gene·metabEff', g(ScalarGene.METAB_EFF)],
      ['gene·reproBar', g(ScalarGene.REPRO_THRESHOLD)],
      ['gene·satiated', g(ScalarGene.SATIATED_THRESHOLD)],
      ['gene·birthEnergy', g(ScalarGene.BIRTH_ENERGY)],
      ['gene·diet', g(ScalarGene.DIET)], // 0 herbivore (green) … 1 predator (red)
      ['gene·damage', g(ScalarGene.DAMAGE)],
      ['gene·visRange', g(ScalarGene.VISION_RANGE)],
      ['gene·visFOV', g(ScalarGene.VISION_FOV)],
      ['gene·visAcuity', g(ScalarGene.VISION_ACUITY)],
      ['sight', `${store.sightX[i]!.toFixed(2)}, ${store.sightY[i]!.toFixed(2)}`],
      ['gene upkeep', geneUpkeep(store.scalarGenes, i, cfg).toFixed(3)],
      ['learn gate', gate.toFixed(2)],
      ['learn drift', drift.toFixed(3)],
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
