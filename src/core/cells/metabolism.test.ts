import { describe, it, expect } from 'vitest';
import { metabolize } from './metabolism';
import { CellType } from './types';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { LightField } from '../environment/light-field';
import { defaultConfig } from '../sim/config';

function buildHash(
  store: CellStore,
  live: Uint32Array,
  n: number,
  w: number,
  h: number,
  cell: number,
) {
  const hash = new SpatialHash(w, h, cell, store.capacity);
  hash.build(live, n, store.fields.posX, store.fields.posY);
  return hash;
}

describe('metabolism — photosynthesis', () => {
  it('a PHOTO cell gains photoGain·light·area and depletes its patch', () => {
    const cfg = defaultConfig({
      worldWidth: 1024,
      worldHeight: 1024,
      lightGridCols: 16,
      lightGridRows: 16,
    });
    const store = new CellStore(16, false);
    const f = store.fields;
    const i = store.alloc();
    f.posX[i] = 512;
    f.posY[i] = 512;
    f.radius[i] = 2;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.PHOTO;
    const live = new Uint32Array([i]);

    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(1);
    lf.light.fill(1); // uniform 1.0 so the math is exact
    const patch = lf.patchIndex(512, 512);

    const hash = buildHash(store, live, 1, 1024, 1024, 2 * cfg.cellRadius);
    metabolize(
      live,
      1,
      f,
      hash,
      lf,
      cfg.photoGain,
      cfg.photoDepletion,
      cfg.digestRate,
      cfg.digestEfficiency,
      cfg.basalCost,
      cfg.meatDecay,
    );

    const area = 2 * 2;
    const gain = cfg.photoGain * 1 * area;
    const basal = cfg.basalCost * area;
    expect(f.energy[i]).toBeCloseTo(100 + gain - basal, 4); // energy is Float32 → digit 4
    expect(lf.light[patch]).toBeCloseTo(1 - gain * cfg.photoDepletion, 5);
  });
});

describe('metabolism — digestion', () => {
  it('a DIGESTIVE cell eats an adjacent MEAT cell; energy moves with efficiency loss', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
    const store = new CellStore(16, false);
    const f = store.fields;
    const a = store.alloc(); // digestive
    const b = store.alloc(); // meat (adjacent)
    f.posX[a] = 500;
    f.posY[a] = 500;
    f.radius[a] = 3;
    f.mass[a] = 1;
    f.energy[a] = 100;
    f.cellType[a] = CellType.DIGESTIVE;
    f.posX[b] = 503;
    f.posY[b] = 500;
    f.radius[b] = 3;
    f.mass[b] = 1;
    f.energy[b] = 100;
    f.cellType[b] = CellType.MEAT;
    const live = new Uint32Array([a, b]);

    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0); // no light → isolate digestion
    const hash = buildHash(store, live, 2, 1024, 1024, 2 * cfg.cellRadius);
    metabolize(
      live,
      2,
      f,
      hash,
      lf,
      cfg.photoGain,
      cfg.photoDepletion,
      cfg.digestRate,
      cfg.digestEfficiency,
      cfg.basalCost,
      cfg.meatDecay,
    );

    const area = 3 * 3;
    // a (lower slot) eats first: extracts digestRate, gains rate*efficiency, pays basal
    expect(f.energy[a]).toBeCloseTo(
      100 + cfg.digestRate * cfg.digestEfficiency - cfg.basalCost * area,
      4,
    );
    // b is meat: loses what was eaten, then decays meatDecay
    expect(f.energy[b]).toBeCloseTo(100 - cfg.digestRate - cfg.meatDecay, 4);
  });

  it('a DIGESTIVE cell with no edible neighbour only pays basal cost', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
    const store = new CellStore(16, false);
    const f = store.fields;
    const a = store.alloc();
    f.posX[a] = 500;
    f.posY[a] = 500;
    f.radius[a] = 3;
    f.energy[a] = 100;
    f.mass[a] = 1;
    f.cellType[a] = CellType.DIGESTIVE;
    const live = new Uint32Array([a]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0);
    const hash = buildHash(store, live, 1, 1024, 1024, 2 * cfg.cellRadius);
    metabolize(
      live,
      1,
      f,
      hash,
      lf,
      cfg.photoGain,
      cfg.photoDepletion,
      cfg.digestRate,
      cfg.digestEfficiency,
      cfg.basalCost,
      cfg.meatDecay,
    );
    expect(f.energy[a]).toBeCloseTo(100 - cfg.basalCost * 9, 4);
  });
});
