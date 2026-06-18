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
  w.glowEffectors,
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

function orgWithGenomeRef(w: World, ref: number): number {
  for (let o = 1; o < w.organisms.maxOrganisms; o++)
    if (w.organisms.isAlive(o) && w.organisms.genomeRef[o] === ref) return o;
  return -1;
}

describe('M6 reproduction loop — resemblance, lineage, death reclaim', () => {
  it('a clone offspring (mutation off) develops into a body identical to the parent', async () => {
    const { develop } = await import('../genome/develop');
    const cfg = defaultConfig({
      maxCells: 256,
      reproThreshold: 600,
      basalCost: 0,
      photoGain: 0,
      organismDeathFloor: -1,
    });
    const w = new World(cfg, false);
    spawnProvisionedAutotroph(w, 300);
    w.tick();
    expect(w.lastOrganismBirths).toBe(1);
    const parent = w.genomes.get(0)!;
    const child = w.genomes.get(1)!;
    const caps = [cfg.maxCellsPerOrganism, cfg.maxRecursionDepth] as const;
    // Offspring resembles the parent: same developed structure (clone-only default).
    expect(develop(child, caps[0], caps[1]).cellType).toEqual(
      develop(parent, caps[0], caps[1]).cellType,
    );
    expect(develop(child, caps[0], caps[1]).bonds).toEqual(develop(parent, caps[0], caps[1]).bonds);
  });

  it('a fed lineage reaches generation ≥ 2 (offspring themselves reproduce)', () => {
    const cfg = defaultConfig({
      maxCells: 256,
      reproThreshold: 600,
      basalCost: 0,
      photoGain: 0,
      organismDeathFloor: -1,
    });
    const w = new World(cfg, false);
    spawnProvisionedAutotroph(w, 300);
    w.tick(); // gen-0 parent → gen-1 child
    const childOrg = orgWithGenomeRef(w, 1);
    expect(childOrg).toBeGreaterThan(0);
    const f = w.cells.fields;
    for (let i = 0; i < w.cells.capacity; i++) if (f.organismId[i] === childOrg) f.energy[i] = 300; // feed the child
    w.tick(); // the gen-1 child → a gen-2 grandchild
    let maxGen = 0;
    for (let r = 0; r < 32; r++) {
      const g = w.genomes.get(r);
      if (g) maxGen = Math.max(maxGen, g.generation);
    }
    expect(maxGen).toBeGreaterThanOrEqual(2);
  });

  it('atomic death reclaims the organism id for reuse', () => {
    const cfg = defaultConfig({
      maxCells: 256,
      organismDeathFloor: 0,
      reproThreshold: 1e12,
      basalCost: 0,
      photoGain: 0,
    });
    const w = new World(cfg, false);
    const org = spawnProvisionedAutotroph(w, 0); // aggregate 0 ≤ floor → dies next tick
    w.tick();
    expect(w.organisms.isAlive(org)).toBe(false);
    const org2 = spawnProvisionedAutotroph(w, 100, 1500, 1500);
    expect(org2).toBe(org); // the freed id is recycled (free-list LIFO)
  });

  it('reproduces from EARNED photosynthesis energy (no manual top-up) — closes the §8 loop', () => {
    // A bright, fully-lit small world so the autotroph reliably accumulates to reproThreshold
    // from photosynthesis alone (proves "organisms reproduce" against the earned-energy path,
    // not just hand-injected energy). lightPatchRadius spans the grid → light is nonzero
    // everywhere; high photoGain + low reproThreshold make a birth happen within the window.
    const cfg = defaultConfig({
      maxCells: 256,
      worldWidth: 256,
      worldHeight: 256,
      lightGridCols: 8,
      lightGridRows: 8,
      lightPatchCount: 8,
      lightPatchRadius: 8,
      lightMax: 2,
      photoGain: 0.5,
      basalCost: 0.005,
      reproThreshold: 300,
      reproParentFloor: 80,
    });
    const w = new World(cfg, false);
    spawnProvisionedAutotroph(w, 60, 128, 128); // starts below threshold; must earn the rest
    let births = 0;
    for (let t = 0; t < 4000; t++) {
      w.tick();
      births += w.lastOrganismBirths;
    }
    expect(births).toBeGreaterThan(0); // photosynthesis income drove at least one reproduction
    expect(w.genomes.size).toBeGreaterThan(1);
  });
});
