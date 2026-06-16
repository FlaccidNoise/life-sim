import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';

describe('golden tick — SENSE → ACT → thrust → move cost (one MOTILE cell)', () => {
  it('senses the gradient, steers, thrusts, moves, and pays moveCost·thrust²', () => {
    const cfg = defaultConfig({
      maxCells: 4,
      worldWidth: 800,
      worldHeight: 800,
      foodGridCols: 8,
      foodGridRows: 8, // 100-unit patches
      repulsion: 0,
      photoGain: 0,
      basalCost: 0.01,
      moveCost: 0.02,
      divideThreshold: 1e9,
      damping: 0.5,
      dt: 1,
      cellRadius: 2,
      turnRate: 10, // large → heading snaps straight to the gradient this tick
      thrustGain: 1,
      maxThrust: 100, // no clamp
      cruiseThrust: 0,
      senseThreshold: 1e-6,
      // Stop the END-of-tick food update from perturbing the post-tick field.
      foodDeposit: 0,
      foodDiffuse: 0,
      foodDecay: 0,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;

    // +x ramp in the food field BEFORE ticking: patch col c holds value c.
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) w.food.field[r * 8 + c] = c;

    const i = w.cells.alloc(); // 0
    f.posX[i] = 350; // patch col 3, mid-patch
    f.posY[i] = 350;
    f.radius[i] = 2;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.MOTILE;
    f.heading[i] = 0;
    f.velX[i] = 0;
    f.velY[i] = 0;

    w.tick();

    // SENSE: gx = col4 - col2 = 2, gy = 0. Heading snaps to atan2(0,2)=0 (already 0).
    expect(f.senseX[i]).toBeCloseTo(2, 5);
    expect(f.heading[i]).toBeCloseTo(0, 6);
    // ACT: thrust = thrustGain·|grad| = 1·2 = 2.
    expect(f.thrust[i]).toBeCloseTo(2, 5);
    // INTEGRATE: F=(2,0), m=1, dt=1, damping=0.5 → v=(2*0.5)=1 in x; moved +1 in x.
    expect(f.velX[i]).toBeCloseTo(1, 5);
    expect(f.posX[i]).toBeCloseTo(351, 4);
    // METABOLIZE: energy = 100 − basal(0.01·4) − moveCost(0.02·2²) = 100 − 0.04 − 0.08.
    expect(f.energy[i]).toBeCloseTo(100 - 0.04 - 0.08, 4);
  });
});
