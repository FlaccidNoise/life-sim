import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

/** Place `n` DIGESTIVE cells (bonded into a chain if `bonded`) amid a fixed PHOTO field. */
function harvest(bonded: boolean): number {
  const cfg = defaultConfig({
    // The 20×20 PHOTO lawn (400 cells) + 4 digestives needs > 256 slots; size for it
    // so every cell gets a real slot (a too-small cap silently fails allocs → NaN).
    maxCells: 512,
    worldWidth: 400,
    worldHeight: 400,
    foodGridCols: 8,
    foodGridRows: 8,
    repulsion: 0,
    basalCost: 0,
    moveCost: 0,
    divideThreshold: 1e9,
    initialMotileFraction: 0,
    transferRate: 0, // isolate the digestion bonus from sharing
    digestClusterBonus: 0.5,
  });
  const w = new World(cfg, false);
  const f = w.cells.fields;
  // A dense PHOTO lawn the digestives sit in (constant prey supply; divide disabled).
  for (let gx = 0; gx < 20; gx++) {
    for (let gy = 0; gy < 20; gy++) {
      const i = w.cells.alloc();
      f.posX[i] = 40 + gx * 16;
      f.posY[i] = 40 + gy * 16;
      f.radius[i] = cfg.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 1e6; // effectively infinite prey so both runs see the same supply
      f.cellType[i] = CellType.PHOTO;
    }
  }
  // 4 digestives clustered at the centre.
  const org = bonded ? w.organisms.alloc() : 0;
  const ds: number[] = [];
  for (let kk = 0; kk < 4; kk++) {
    const i = w.cells.alloc();
    f.posX[i] = 180 + (kk % 2) * 14;
    f.posY[i] = 180 + ((kk / 2) | 0) * 14;
    f.radius[i] = cfg.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.DIGESTIVE;
    f.organismId[i] = org;
    ds.push(i);
  }
  if (bonded) {
    for (let kk = 0; kk + 1 < ds.length; kk++) {
      w.bonds.addBond(
        ds[kk]!,
        f.generation[ds[kk]!]!,
        ds[kk + 1]!,
        f.generation[ds[kk + 1]!]!,
        14,
        1,
      );
    }
    // also brace 0-2 and 1-3 so each has ≥1 digestive neighbour
    w.bonds.addBond(ds[0]!, f.generation[ds[0]!]!, ds[2]!, f.generation[ds[2]!]!, 14, 1);
    w.bonds.addBond(ds[1]!, f.generation[ds[1]!]!, ds[3]!, f.generation[ds[3]!]!, 14, 1);
    w.bonds.rebuildLive(w.cells);
  }
  for (let t = 0; t < 200; t++) w.tick();
  let total = 0;
  for (const i of ds) total += f.energy[i]!;
  return total;
}

describe('M5 payoff — bonded digestive clusters out-harvest lone cells', () => {
  it('a bonded cluster accumulates strictly more energy than the same lone digestives', () => {
    const bonded = harvest(true);
    const lone = harvest(false);
    expect(bonded).toBeGreaterThan(lone); // the digestion-clustering bonus is the selection gradient
  });
});
