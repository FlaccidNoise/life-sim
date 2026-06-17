import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { develop } from '../genome/develop';
import { buildAutotrophGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';

export function spawnProvisionedAutotroph(
  w: World,
  energyPerCell: number,
  x = 1000,
  y = 1000,
): number {
  const ref = w.genomes.register(buildAutotrophGenome(w.config.cellRadius));
  const body = develop(
    buildAutotrophGenome(w.config.cellRadius),
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
    x,
    y,
    0,
    w.config.worldWidth,
    w.config.worldHeight,
    w.instantiateScratch,
  );
  const f = w.cells.fields;
  for (let i = 0; i < w.cells.capacity; i++)
    if (f.organismId[i] === org) f.energy[i] = energyPerCell;
  return org;
}

describe('M6 World wiring — reproduction + death in the tick', () => {
  it('a provisioned organism reproduces within one tick (genome registered, offspring built)', () => {
    const cfg = defaultConfig({ maxCells: 256, reproThreshold: 600, basalCost: 0, photoGain: 0 });
    const w = new World(cfg, false);
    spawnProvisionedAutotroph(w, 300); // 4 × 300 = 1200 ≥ 600
    expect(w.genomes.size).toBe(1);
    w.tick();
    expect(w.lastOrganismBirths).toBe(1);
    expect(w.genomes.size).toBe(2);
    expect(w.cells.aliveCount).toBe(8); // 4 parent + 4 offspring
    const child = w.genomes.get(1)!;
    expect(child.generation).toBe(1);
    expect(child.parentRef).toBe(0);
  });

  it('a starved organism dies atomically in the tick (cells → MEAT, id freed)', () => {
    const cfg = defaultConfig({
      maxCells: 256,
      organismDeathFloor: 0,
      basalCost: 0,
      photoGain: 0,
      reproThreshold: 1e12,
    });
    const w = new World(cfg, false);
    const org = spawnProvisionedAutotroph(w, 0); // aggregate energy 0 ≤ floor
    w.tick();
    expect(w.lastOrganismDeaths).toBe(1);
    expect(w.organisms.isAlive(org)).toBe(false);
    expect(w.genomes.get(0)).toBeUndefined(); // genome freed
  });

  it('does not perturb a genome-less organism (spawnSwimmer never reproduces or dies spuriously)', () => {
    const cfg = defaultConfig({ maxCells: 256 });
    const w = new World(cfg, false);
    // a manual bonded cluster with NO genome (organisms.genomeRef stays -1).
    const f = w.cells.fields;
    const o = w.organisms.alloc();
    const i0 = w.cells.alloc();
    const i1 = w.cells.alloc();
    for (const i of [i0, i1]) {
      f.posX[i] = 1000;
      f.posY[i] = 1000 + (i - i0) * 14;
      f.radius[i] = 6;
      f.mass[i] = 2;
      f.energy[i] = 5000;
      f.cellType[i] = 0;
      f.organismId[i] = o;
    }
    w.bonds.addBond(i0, f.generation[i0]!, i1, f.generation[i1]!, 14, 1);
    w.bonds.rebuildLive(w.cells);
    w.tick();
    expect(w.lastOrganismBirths).toBe(0);
    expect(w.lastOrganismDeaths).toBe(0);
    expect(w.organisms.isAlive(o)).toBe(true);
  });
});
