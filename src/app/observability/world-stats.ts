/**
 * World stats block — a compact key/value readout of the whole population the per-frame graph can't
 * show as numbers: head-count, vital rates, and the trophic/energy means. Pure read-only bucketing over
 * the live set each frame (cheap: one pass, no allocation beyond the row strings). Sits atop the world
 * panel, above the population graph.
 */
import { type OrganismStore } from '../../core/store';
import { ScalarGene, SCALAR_GENE_COUNT } from '../../core/genome';
import { dietShape } from '../../render/palette';

export class WorldStats {
  constructor(private readonly root: HTMLElement) {
    this.render(null, 0, 0);
  }

  /** `lastBirths`/`lastDeaths` are the most recent tick's vital counts (world.lastBirths/lastDeaths). */
  render(store: OrganismStore | null, lastBirths: number, lastDeaths: number): void {
    if (!store || store.liveCount === 0) {
      this.root.innerHTML = `<div class="ws" style="grid-column:1/-1">
        <span class="ws-k">population</span><span class="ws-v">${store ? 'extinct' : '—'}</span></div>`;
      return;
    }
    const n = store.liveCount;
    let ageSum = 0;
    let eSum = 0;
    let herb = 0;
    let omni = 0;
    let pred = 0;
    for (let k = 0; k < n; k++) {
      const i = store.liveIndices[k]!;
      ageSum += store.age[i]!;
      eSum += store.energy[i]!;
      const shape = dietShape(store.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!);
      if (shape === 2) pred++;
      else if (shape === 1) omni++;
      else herb++;
    }
    const rows: [string, string][] = [
      ['pop', `${n}`],
      ['diet ○◇△', `${herb}/${omni}/${pred}`],
      ['births/t', `${lastBirths}`],
      ['deaths/t', `${lastDeaths}`],
      ['mean age', `${Math.round(ageSum / n)}`],
      ['mean energy', (eSum / n).toFixed(1)],
    ];
    this.root.innerHTML = rows
      .map(
        ([k, v]) => `<div class="ws"><span class="ws-k">${k}</span><span class="ws-v">${v}</span></div>`,
      )
      .join('');
  }
}
