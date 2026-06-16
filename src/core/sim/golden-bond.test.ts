import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

/** Freeze everything except bond springs + integrate so the relaxation is clean. */
function bondCfg(over = {}) {
  return defaultConfig({
    maxCells: 64,
    worldWidth: 800,
    worldHeight: 800,
    repulsion: 0,
    photoGain: 0,
    basalCost: 0,
    neuralCost: 0,
    moveCost: 0,
    divideThreshold: 1e9,
    damping: 0.5,
    dt: 1,
    cellRadius: 6,
    initialMotileFraction: 0,
    foodDeposit: 0,
    foodDiffuse: 0,
    foodDecay: 0,
    transferRate: 0, // isolate mechanics from energy flow
    adhesionStrength: 0,
    bondStiffness: 1.5, // PINNED: a mechanics golden test must freeze its inputs, not float on the live default (audit)
    ...over,
  });
}

/** Build a bonded organism of `count` cells in a line; returns the slots. */
function buildOrganism(w: World, count: number, x: number, y: number, spacing: number): number[] {
  const f = w.cells.fields;
  const org = w.organisms.alloc();
  const cells: number[] = [];
  for (let i = 0; i < count; i++) {
    const c = w.cells.alloc();
    f.posX[c] = x + i * spacing;
    f.posY[c] = y;
    f.radius[c] = w.config.cellRadius;
    f.mass[c] = 1;
    f.energy[c] = 100 * (i + 1); // distinct energies for the split partition assertion
    f.cellType[c] = CellType.PHOTO;
    f.organismId[c] = org;
    cells.push(c);
  }
  for (let i = 0; i + 1 < count; i++) {
    w.bonds.addBond(
      cells[i]!,
      f.generation[cells[i]!]!,
      cells[i + 1]!,
      f.generation[cells[i + 1]!]!,
      spacing,
      1,
    );
  }
  w.bonds.rebuildLive(w.cells);
  return cells;
}

describe('golden bond — spring relaxation + split-on-break through World.tick', () => {
  it('a stretched bond relaxes toward restLen', () => {
    const w = new World(bondCfg(), false);
    const f = w.cells.fields;
    const org = w.organisms.alloc();
    const a = w.cells.alloc();
    const b = w.cells.alloc();
    f.posX[a] = 400;
    f.posY[a] = 400;
    f.posX[b] = 430; // 30 apart, restLen 20 → stretched
    f.posY[b] = 400;
    f.radius[a] = 6;
    f.radius[b] = 6;
    f.mass[a] = 1;
    f.mass[b] = 1;
    f.energy[a] = 1e6;
    f.energy[b] = 1e6;
    f.cellType[a] = CellType.PHOTO;
    f.cellType[b] = CellType.PHOTO;
    f.organismId[a] = org;
    f.organismId[b] = org;
    w.bonds.addBond(a, f.generation[a]!, b, f.generation[b]!, 20, 1);
    w.bonds.rebuildLive(w.cells);

    const d0 = Math.abs(f.posX[b] - f.posX[a]);
    for (let t = 0; t < 200; t++) w.tick();
    const d1 = Math.abs(f.posX[b] - f.posX[a]);
    expect(d0).toBeCloseTo(30, 4);
    expect(d1).toBeCloseTo(20, 0); // relaxed to within ~1 unit of restLen 20
  });

  it('a chain pulled past maxStrain breaks in-world and splits into two organisms', () => {
    // High strain config: a 4-cell chain whose rest length is far below its spacing → the
    // springs are over-stretched at t0, so the weakest bond exceeds maxStrain and breaks.
    const w = new World(bondCfg({ bondMaxStrain: 0.2, bondStiffness: 1 }), false);
    const f = w.cells.fields;
    const cells = buildOrganism(w, 4, 300, 400, 40); // spacing 40
    // Re-set every bond's restLen to 20 so spacing 40 → strain 1.0 > 0.2 → all break.
    for (let s = 0; s < w.bonds.liveBondCount; s++) w.bonds.restLen[w.bonds.liveBonds[s]!] = 20;
    const energyBefore = cells.reduce((sum, c) => sum + f.energy[c]!, 0); // buildOrganism sets 100*(i+1)

    w.tick(); // integrate barely moves them (stiff-free); breakage runs on the strained bonds

    // At least one bond broke → more than one organism now spans the chain.
    const ids = new Set(cells.map((c) => f.organismId[c]!));
    expect(ids.size).toBeGreaterThan(1);
    // Energy is conserved across the split (the split path only relabels organismId; transferRate=0).
    // NOTE (audit): do NOT assert which id c0 keeps — the SMALLER/first-closed side gets the FRESH id, and
    // bond0 = c0-c1 breaks first so c0 (degree 0) closes immediately and is RELABELLED, not kept. Assert the
    // partition PROPERTY (membership + energy), as split.test.ts does; never a fixed id here.
    const energyAfter = cells.reduce((sum, c) => sum + f.energy[c]!, 0);
    expect(energyAfter).toBeCloseTo(energyBefore, 4);
  });
});
