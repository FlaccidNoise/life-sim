import { describe, it, expect } from 'vitest';
import { lifecycle, type LifecycleResult } from './lifecycle';
import { CellType } from './types';
import { CellStore } from '../memory/cell-store';
import { defaultConfig } from '../sim/config';

const out: LifecycleResult = { births: 0, deaths: 0 };

// scalar-args wrapper for tests
function run(
  live: Uint32Array,
  n: number,
  store: CellStore,
  cfg: ReturnType<typeof defaultConfig>,
  tick: number,
) {
  lifecycle(
    live,
    n,
    store,
    cfg.seed,
    cfg.worldWidth,
    cfg.worldHeight,
    cfg.meatEnergyOnDeath,
    cfg.divideThreshold,
    cfg.divideCost,
    cfg.divideJitter,
    tick,
    out,
  );
}

describe('lifecycle — death and decay', () => {
  it('a living cell at energy<=0 becomes MEAT holding mass·meatEnergyOnDeath', () => {
    const cfg = defaultConfig();
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.PHOTO;
    f.energy[i] = -3;
    f.mass[i] = 1;
    f.radius[i] = 5;
    f.posX[i] = 10;
    f.posY[i] = 10;
    const live = new Uint32Array([i]);

    run(live, 1, store, cfg, 0);

    expect(store.isAlive(i)).toBe(true); // slot still occupied
    expect(f.cellType[i]).toBe(CellType.MEAT);
    expect(f.energy[i]).toBeCloseTo(cfg.meatEnergyOnDeath, 4);
    expect(out.deaths).toBe(1);
    expect(out.births).toBe(0);
  });

  it('a MEAT cell at energy<=0 frees its slot (corpse fully decayed)', () => {
    const cfg = defaultConfig();
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.MEAT;
    f.energy[i] = 0;
    f.mass[i] = 1;
    f.radius[i] = 5;
    f.posX[i] = 10;
    f.posY[i] = 10;
    const live = new Uint32Array([i]);
    const genBefore = f.generation[i]!;

    run(live, 1, store, cfg, 0);

    expect(store.isAlive(i)).toBe(false); // slot freed
    expect(f.generation[i]).toBe((genBefore + 1) >>> 0); // generation bumped
    expect(out.deaths).toBe(0); // decay-removal is not a "death" event
  });
});
