import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';
import { torusDist } from '../math/vec2';

describe('chemotaxis acceptance — a single motile climbs a patchy food gradient', () => {
  it('moves closer to a food source using the DEFAULT food/thrust knobs', () => {
    // Validate the REAL default smell-field + reflex physics. Override ONLY world/grid
    // size (a small torus, so the persistent smell wraps to a nonzero gradient everywhere)
    // and the economy isolators — keep foodDeposit/foodDiffuse/foodDecay/thrustGain/
    // maxThrust/turnRate at their defaultConfig values, so a pass proves the live demo climbs.
    const cfg = defaultConfig({
      maxCells: 64,
      worldWidth: 800,
      worldHeight: 800,
      foodGridCols: 16,
      foodGridRows: 16, // 50-unit patches on the small torus
      repulsion: 0, // isolate chemotaxis from crowding
      divideThreshold: 1e9, // no division
      initialMotileFraction: 0, // we place the single motile by hand
      basalCost: 0, // don't starve during the climb (energy is huge anyway)
      moveCost: 0, // isolate steering from the energy economy
      cruiseThrust: 0, // pure gradient-following; the small torus guarantees a nonzero gradient
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;

    // PHOTO "food" cluster near (430, 400). Its NEARER toroidal copy to the motile is the
    // +x direction (direct ~286 vs wrap ~514), so heading=PI genuinely faces AWAY and the
    // reflex must turn the cell around.
    for (let k = 0; k < 12; k++) {
      const i = w.cells.alloc();
      f.posX[i] = 430 + (k % 4) * 4;
      f.posY[i] = 400 + ((k / 4) | 0) * 4;
      f.radius[i] = cfg.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = CellType.PHOTO;
    }
    const m = w.cells.alloc();
    f.posX[m] = 150;
    f.posY[m] = 400;
    f.radius[m] = cfg.cellRadius;
    f.mass[m] = 1;
    f.energy[m] = 1e6; // immortal for the test
    f.cellType[m] = CellType.MOTILE;
    f.heading[m] = Math.PI; // pointing AWAY (−x) from the food's nearer (+x) copy

    const foodX = 436;
    const foodY = 404;
    const d0 = torusDist(f.posX[m], f.posY[m], foodX, foodY, 800, 800);

    for (let t = 0; t < 600; t++) w.tick(); // smell equilibrates, then the motile climbs

    const d1 = torusDist(f.posX[m], f.posY[m], foodX, foodY, 800, 800);
    expect(d1).toBeLessThan(d0 - 100); // climbed a clear, substantial distance up-gradient
  });
});
