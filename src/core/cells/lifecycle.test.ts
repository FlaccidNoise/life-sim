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

describe('lifecycle — division', () => {
  it('a cell at/above threshold clones a same-type child, splitting energy 50/50', () => {
    const cfg = defaultConfig({ divideThreshold: 200, divideCost: 10 });
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.DIGESTIVE;
    f.energy[i] = 250;
    f.mass[i] = 1;
    f.radius[i] = 4;
    f.posX[i] = 100;
    f.posY[i] = 100;
    const live = new Uint32Array([i]);

    run(live, 1, store, cfg, 5);

    expect(out.births).toBe(1);
    expect(store.aliveCount).toBe(2);
    const half = (250 - 10) * 0.5;
    expect(f.energy[i]).toBeCloseTo(half, 4);
    let child = -1;
    for (let s = 0; s < store.capacity; s++) if (s !== i && store.isAlive(s)) child = s;
    expect(child).toBeGreaterThanOrEqual(0);
    expect(f.cellType[child]).toBe(CellType.DIGESTIVE);
    expect(f.energy[child]).toBeCloseTo(half, 4);
    expect(f.age[child]).toBe(0);
  });

  it('does not divide below threshold', () => {
    const cfg = defaultConfig({ divideThreshold: 200 });
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.PHOTO;
    f.energy[i] = 150;
    f.mass[i] = 1;
    f.radius[i] = 4;
    const live = new Uint32Array([i]);
    run(live, 1, store, cfg, 0);
    expect(out.births).toBe(0);
    expect(store.aliveCount).toBe(1);
  });

  it('refuses to divide when no free slot remains (no allocation, no crash)', () => {
    const cfg = defaultConfig({ divideThreshold: 100, maxCells: 1 });
    const store = new CellStore(1, false);
    const f = store.fields;
    const i = store.alloc(); // last and only slot
    f.cellType[i] = CellType.PHOTO;
    f.energy[i] = 500;
    f.mass[i] = 1;
    f.radius[i] = 4;
    const live = new Uint32Array([i]);
    run(live, 1, store, cfg, 0);
    expect(out.births).toBe(0);
    expect(f.energy[i]).toBe(500); // untouched
  });

  it("a division child does not inherit a recycled slot's stale thrust/heading", () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const corpse = store.alloc(); // slot 0 — decays & frees this tick
    const parent = store.alloc(); // slot 1 — divides this tick
    f.cellType[corpse] = CellType.MEAT;
    f.energy[corpse] = 0; // ≤0 MEAT → freed in pass 2
    f.mass[corpse] = 1;
    f.thrust[corpse] = 9; // STALE value the LIFO free-list would hand to the child
    f.heading[corpse] = 2.5;
    f.cellType[parent] = CellType.MOTILE;
    f.energy[parent] = 1000;
    f.mass[parent] = 1;
    f.radius[parent] = 6;
    f.posX[parent] = 100;
    f.posY[parent] = 100;
    f.heading[parent] = 0.5;
    const live = new Uint32Array([corpse, parent]);
    const out = { births: 0, deaths: 0 };
    lifecycle(live, 2, store, 1, 256, 256, 30, 100 /*divideThreshold*/, 10, 6, 0, out);
    // The child recycles slot 0 (LIFO). It must carry thrust=0 and the PARENT's heading.
    expect(f.thrust[0]).toBe(0);
    expect(f.heading[0]).toBeCloseTo(0.5, 6);
  });
});
