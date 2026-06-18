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
    cfg.crowdDivideCap,
    cfg.sessilePlants,
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
    lifecycle(
      live,
      2,
      store,
      1,
      256,
      256,
      30,
      100 /*divideThreshold*/,
      10,
      6,
      65535,
      false,
      0,
      out,
    );
    // The child recycles slot 0 (LIFO). It must carry thrust=0 and the PARENT's heading.
    expect(f.thrust[0]).toBe(0);
    expect(f.heading[0]).toBeCloseTo(0.5, 6);
  });
});

describe('lifecycle — density-dependent PHOTO division cap (carrying capacity)', () => {
  function photoAt(store: CellStore, energy: number, density: number): number {
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.PHOTO;
    f.energy[i] = energy;
    f.mass[i] = 1;
    f.radius[i] = 6;
    f.posX[i] = 100;
    f.posY[i] = 100;
    f.localDensity[i] = density;
    return i;
  }

  it('a crowded PHOTO (localDensity > cap) does NOT divide despite ample energy', () => {
    const store = new CellStore(8, false);
    const i = photoAt(store, 500, 7); // bucket holds 7 cells, cap 6
    const out = { births: 0, deaths: 0 };
    lifecycle(
      Uint32Array.from([i]),
      1,
      store,
      1,
      1024,
      1024,
      30,
      150,
      10,
      6,
      /*cap*/ 6,
      false,
      0,
      out,
    );
    expect(out.births).toBe(0);
    expect(store.aliveCount).toBe(1);
    expect(store.fields.energy[i]).toBe(500); // untouched — no division occurred
  });

  it('an uncrowded PHOTO (localDensity <= cap) divides normally', () => {
    const store = new CellStore(8, false);
    const i = photoAt(store, 500, 6); // exactly at cap — still allowed
    const out = { births: 0, deaths: 0 };
    lifecycle(
      Uint32Array.from([i]),
      1,
      store,
      1,
      1024,
      1024,
      30,
      150,
      10,
      6,
      /*cap*/ 6,
      false,
      0,
      out,
    );
    expect(out.births).toBe(1);
    expect(store.aliveCount).toBe(2);
  });

  it('the OFF sentinel (65535) never suppresses division however crowded', () => {
    const store = new CellStore(8, false);
    const i = photoAt(store, 500, 60000); // extreme crowding
    const out = { births: 0, deaths: 0 };
    lifecycle(
      Uint32Array.from([i]),
      1,
      store,
      1,
      1024,
      1024,
      30,
      150,
      10,
      6,
      /*cap*/ 65535,
      false,
      0,
      out,
    );
    expect(out.births).toBe(1);
  });

  it('the cap is PHOTO-only: a crowded free DIGESTIVE still divides', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.cellType[i] = CellType.DIGESTIVE;
    f.energy[i] = 500;
    f.mass[i] = 1;
    f.radius[i] = 6;
    f.localDensity[i] = 7; // crowded, but the cap targets only the PHOTO producer
    const out = { births: 0, deaths: 0 };
    lifecycle(
      Uint32Array.from([i]),
      1,
      store,
      1,
      1024,
      1024,
      30,
      150,
      10,
      6,
      /*cap*/ 6,
      false,
      0,
      out,
    );
    expect(out.births).toBe(1);
  });
});

describe('lifecycle — neural cells are exempt from death + division (M4)', () => {
  it('does NOT divide a provisioned NEURON/MOVER even above divideThreshold', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const a = store.alloc();
    const b = store.alloc();
    f.cellType[a] = CellType.NEURON;
    f.cellType[b] = CellType.MOVER;
    f.energy[a] = 5000;
    f.energy[b] = 5000;
    f.mass[a] = 1;
    f.mass[b] = 1;
    const before = store.aliveCount;
    const out = { births: 0, deaths: 0 };
    lifecycle(
      Uint32Array.from([a, b]),
      2,
      store,
      1,
      1024,
      1024,
      30,
      150,
      10,
      6,
      65535,
      false,
      0,
      out,
    );
    expect(out.births).toBe(0);
    expect(store.aliveCount).toBe(before); // no clones allocated
  });

  it('does NOT convert a depleted SENSOR/NEURON to MEAT', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const a = store.alloc();
    f.cellType[a] = CellType.SENSOR;
    f.energy[a] = -5; // would normally die
    f.mass[a] = 1;
    const out = { births: 0, deaths: 0 };
    lifecycle(Uint32Array.from([a]), 1, store, 1, 1024, 1024, 30, 150, 10, 6, 65535, false, 0, out);
    expect(out.deaths).toBe(0);
    expect(f.cellType[a]).toBe(CellType.SENSOR); // still a sensor, not MEAT
  });

  it('still divides a PHOTO above threshold (guard does not break normal division)', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const a = store.alloc();
    f.cellType[a] = CellType.PHOTO;
    f.energy[a] = 300;
    f.mass[a] = 1;
    f.radius[a] = 6;
    const out = { births: 0, deaths: 0 };
    lifecycle(Uint32Array.from([a]), 1, store, 1, 1024, 1024, 30, 150, 10, 6, 65535, false, 0, out);
    expect(out.births).toBe(1);
  });
});

describe('lifecycle — organism cells are exempt from death + division (M5)', () => {
  it('does NOT convert a depleted bonded (organismId!=0) DIGESTIVE to MEAT', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const a = store.alloc();
    f.cellType[a] = CellType.DIGESTIVE;
    f.organismId[a] = 7; // in an organism
    f.energy[a] = -5; // would normally die
    f.mass[a] = 1;
    const out = { births: 0, deaths: 0 };
    lifecycle(Uint32Array.from([a]), 1, store, 1, 1024, 1024, 30, 150, 10, 6, 65535, false, 0, out);
    expect(out.deaths).toBe(0);
    expect(f.cellType[a]).toBe(CellType.DIGESTIVE); // still alive, not MEAT
  });

  it('does NOT divide a bonded DIGESTIVE above threshold', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const a = store.alloc();
    f.cellType[a] = CellType.DIGESTIVE;
    f.organismId[a] = 7;
    f.energy[a] = 5000;
    f.mass[a] = 1;
    f.radius[a] = 6;
    const before = store.aliveCount;
    const out = { births: 0, deaths: 0 };
    lifecycle(Uint32Array.from([a]), 1, store, 1, 1024, 1024, 30, 150, 10, 6, 65535, false, 0, out);
    expect(out.births).toBe(0);
    expect(store.aliveCount).toBe(before);
  });

  it('STILL kills/divides a FREE (organismId 0) cell — ecosystem unaffected', () => {
    const store = new CellStore(4, false);
    const f = store.fields;
    const dead = store.alloc();
    f.cellType[dead] = CellType.DIGESTIVE;
    f.organismId[dead] = 0;
    f.energy[dead] = -1;
    f.mass[dead] = 1;
    const big = store.alloc();
    f.cellType[big] = CellType.PHOTO;
    f.organismId[big] = 0;
    f.energy[big] = 300;
    f.mass[big] = 1;
    f.radius[big] = 6;
    const out = { births: 0, deaths: 0 };
    lifecycle(
      Uint32Array.from([dead, big]),
      2,
      store,
      1,
      1024,
      1024,
      30,
      150,
      10,
      6,
      65535,
      false,
      0,
      out,
    );
    expect(out.deaths).toBe(1);
    expect(f.cellType[dead]).toBe(CellType.MEAT);
    expect(out.births).toBe(1);
  });
});
