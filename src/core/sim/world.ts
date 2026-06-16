import { type Config } from './config';
import { Rng } from '../math/rng';
import { CellStore } from '../memory/cell-store';

/**
 * The simulation world. M0 has no physics: `tick()` only ages live cells in
 * canonical (ascending slot-index) order, which is deterministic and allocates
 * nothing. M1 replaces the trivial tick with the real simulation pipeline.
 */
export class World {
  readonly config: Config;
  readonly rng: Rng;
  readonly cells: CellStore;
  tickCount: number;

  constructor(config: Config, preferShared = true) {
    this.config = config;
    this.rng = new Rng(config.seed);
    this.cells = new CellStore(config.maxCells, preferShared);
    this.tickCount = 0;
  }

  /** Spawn up to `n` cells at seeded random positions. Returns the number spawned. */
  spawn(n: number): number {
    const f = this.cells.fields;
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      const i = this.cells.alloc();
      if (i < 0) break;
      f.posX[i] = this.rng.range(0, this.config.worldWidth);
      f.posY[i] = this.rng.range(0, this.config.worldHeight);
      f.velX[i] = 0;
      f.velY[i] = 0;
      f.forceX[i] = 0;
      f.forceY[i] = 0;
      f.radius[i] = 1;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = 0;
      f.organismId[i] = 0;
      f.genomeRef[i] = 0;
      f.brainRef[i] = 0;
      f.age[i] = 0;
      spawned++;
    }
    return spawned;
  }

  /** Advance one tick. M0: age live cells. */
  tick(): void {
    const f = this.cells.fields;
    const capacity = this.cells.capacity;
    for (let i = 0; i < capacity; i++) {
      if (!this.cells.isAlive(i)) continue;
      f.age[i] = (f.age[i]! + 1) >>> 0;
    }
    this.tickCount++;
  }
}
