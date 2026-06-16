import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';
import { torusDist } from '../math/vec2';
import { spawnSwimmer } from './critter';

// Geometry mirrors the PROVEN chemotaxis.test.ts: a small 800² torus with a 16-grid
// (50-unit patches) so the persistent smell wraps to a NONZERO, climbable gradient
// everywhere — unlike a large 1600²/64-grid world where the smell decay length
// (~sqrt(diffuse/decay) ≈ 2.7 patches) makes the central-difference gradient round to
// EXACTLY 0 in Float32 more than a few patches from the source (audit blocker). DEFAULT
// neural + sense/move knobs; only world/grid size + economy isolators are overridden,
// so a pass proves the live-demo default critter swims.
describe('M4 acceptance — hand-wired critter swims to food via its brain', () => {
  it('steers off-axis and closes a clear distance to a food source on DEFAULT knobs', () => {
    const cfg = defaultConfig({
      maxCells: 64,
      worldWidth: 800,
      worldHeight: 800,
      foodGridCols: 16,
      foodGridRows: 16, // 50-unit patches on the small torus
      repulsion: 0, // isolate steering from crowding
      divideThreshold: 1e9, // PHOTO food cluster must not divide
      basalCost: 0,
      initialMotileFraction: 0,
    });
    const w = new World(cfg, false);
    const f = w.cells.fields;

    // PHOTO "food" cluster near (400, 560). PHOTO is edible → it deposits smell each tick
    // (World.tick food deposit), building the persistent gradient. The MOVER is not a
    // heterotroph, so it never eats the cluster — the source persists.
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

    // Critter starts ABOVE the food, facing +x — so the food is OFF its heading axis
    // (mostly +y). Reaching it REQUIRES the LAT_GRAD→turn channel to work; a flipped
    // lateral-steering sign would turn it away and the test would fail (audit minor #8).
    const start = spawnSwimmer(w, 400, 250, 0);
    const d0 = torusDist(f.posX[start.mover]!, f.posY[start.mover]!, foodX, foodY, 800, 800);
    const alive0 = w.cells.aliveCount; // 12 PHOTO + 7 critter = 19

    for (let t = 0; t < 1500; t++) w.tick(); // smell equilibrates, then the brain climbs

    const d1 = torusDist(f.posX[start.mover]!, f.posY[start.mover]!, foodX, foodY, 800, 800);
    expect(d1).toBeLessThan(d0 - 150); // closed a clear, substantial distance up-gradient

    // Coarse population guard: under this config (divideThreshold 1e9, basalCost 0) the
    // count is fixed, so a gross regression (e.g. the critter exploding into clones) shows
    // up here. The neural lifecycle EXEMPTION itself is directly tested in lifecycle.test.ts.
    expect(w.cells.aliveCount).toBe(alive0);
    expect(f.cellType[start.mover]!).toBe(CellType.MOVER);
  });
});
