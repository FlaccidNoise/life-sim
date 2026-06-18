import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';
import { torusDist } from '../math/vec2';
import { develop } from '../genome/develop';
import { buildCritterGenome } from '../genome/critter-genome';
import { instantiateBody } from '../organism/instantiate';

describe('M6 acceptance — a genome-DEVELOPED critter swims to food via its brain', () => {
  it('develops buildCritterGenome and closes a clear distance up-gradient (default knobs)', () => {
    const cfg = defaultConfig({
      maxCells: 64,
      worldWidth: 800,
      worldHeight: 800,
      foodGridCols: 16,
      foodGridRows: 16,
      repulsion: 0,
      divideThreshold: 1e9,
      basalCost: 0,
      initialMotileFraction: 0,
      reproThreshold: 1e12, // the 5000-reserve critter must NOT reproduce during the swim
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;

    for (let k = 0; k < 12; k++) {
      const i = w.cells.alloc();
      f.posX[i] = 400 + (k % 4) * 4;
      f.posY[i] = 560 + ((k / 4) | 0) * 4;
      f.radius[i] = cfg.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = CellType.PHOTO;
    }
    const foodX = 406;
    const foodY = 564;

    const scratch = new Int32Array(cfg.maxCellsPerOrganism);
    const body = develop(
      buildCritterGenome(cfg.cellRadius),
      cfg.maxCellsPerOrganism,
      cfg.maxRecursionDepth,
    );
    const org = instantiateBody(
      body,
      w.cells,
      w.net,
      w.bonds,
      w.organisms,
      0,
      400,
      250,
      0,
      cfg.worldWidth,
      cfg.worldHeight,
      scratch,
    w.glowEffectors,
    );
    expect(org).toBeGreaterThanOrEqual(1);
    const mover = w.organisms.mover[org]!;
    expect(f.cellType[mover]).toBe(CellType.MOVER);

    const d0 = torusDist(f.posX[mover]!, f.posY[mover]!, foodX, foodY, 800, 800);
    const alive0 = w.cells.aliveCount; // 12 PHOTO + 7 critter

    for (let t = 0; t < 1500; t++) w.tick();

    const d1 = torusDist(f.posX[mover]!, f.posY[mover]!, foodX, foodY, 800, 800);
    expect(d1).toBeLessThan(d0 - 150); // the developed brain climbs the gradient
    expect(w.cells.aliveCount).toBe(alive0); // no explosion; organism cells stay lifecycle-exempt
    expect(f.cellType[mover]).toBe(CellType.MOVER);
  });
});
