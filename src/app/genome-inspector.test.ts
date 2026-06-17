import { describe, it, expect } from 'vitest';
import { renderGenomeInspector } from './genome-inspector';
import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { buildCritterGenome } from '../core/genome/critter-genome';
import { instantiateBody } from '../core/organism/instantiate';

function fakePanel(): { textContent: string } {
  return { textContent: '' };
}

describe('renderGenomeInspector', () => {
  it('renders genes + lineage for an organism with a genome', () => {
    const w = new World(defaultConfig({ maxCells: 64 }), false);
    const ref = w.genomes.register(buildCritterGenome(w.config.cellRadius));
    const body = develop(
      buildCritterGenome(w.config.cellRadius),
      w.config.maxCellsPerOrganism,
      w.config.maxRecursionDepth,
    );
    const org = instantiateBody(
      body,
      w.cells,
      w.net,
      w.bonds,
      w.organisms,
      ref,
      400,
      400,
      0,
      w.config.worldWidth,
      w.config.worldHeight,
      w.instantiateScratch,
    );
    const p = fakePanel();
    renderGenomeInspector(w, org, p as unknown as HTMLElement);
    expect(p.textContent).toContain(`genome #${ref}`);
    expect(p.textContent).toContain('gen 0');
    expect(p.textContent).toContain('genes 7');
    expect(p.textContent).toContain('MOVER');
  });

  it('handles a genome-less organism and no selection gracefully', () => {
    const w = new World(defaultConfig({ maxCells: 64 }), false);
    const p = fakePanel();
    renderGenomeInspector(w, 0, p as unknown as HTMLElement);
    expect(p.textContent).toContain('no organism');
    const o = w.organisms.alloc();
    renderGenomeInspector(w, o, p as unknown as HTMLElement);
    expect(p.textContent).toContain('no genome');
  });
});
