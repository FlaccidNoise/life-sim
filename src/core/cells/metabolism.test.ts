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

// Oversized zero-bonus array: covers every store's slot indices (never OOB).
// All-zero → digestion multiplier 1 + bonus·0 = 1 → identical pre-M5 behaviour.
const noBonus = new Uint8Array(64);

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
      0,
      0,
      noBonus,
      0,
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
      0,
      0,
      noBonus,
      0,
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
      0,
      0,
      noBonus,
      0,
    );
    expect(f.energy[a]).toBeCloseTo(100 - cfg.basalCost * 9, 4);
  });
});

describe('metabolism — basal cost and meat decay', () => {
  it('a MEAT cell only decays (no basal, no gain)', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
    const store = new CellStore(8, false);
    const f = store.fields;
    const m = store.alloc();
    f.posX[m] = 100;
    f.posY[m] = 100;
    f.radius[m] = 5;
    f.energy[m] = 20;
    f.mass[m] = 1;
    f.cellType[m] = CellType.MEAT;
    const live = new Uint32Array([m]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(1);
    lf.light.fill(1); // light present but meat ignores it
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
      0,
      0,
      noBonus,
      0,
    );
    expect(f.energy[m]).toBeCloseTo(20 - cfg.meatDecay, 4);
  });

  it('basal cost scales with area (radius²)', () => {
    const cfg = defaultConfig({ worldWidth: 1024, worldHeight: 1024 });
    const store = new CellStore(8, false);
    const f = store.fields;
    const big = store.alloc();
    f.posX[big] = 100;
    f.posY[big] = 100;
    f.radius[big] = 4;
    f.energy[big] = 100;
    f.mass[big] = 1;
    f.cellType[big] = CellType.DIGESTIVE;
    const live = new Uint32Array([big]);
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
      0,
      0,
      noBonus,
      0,
    );
    expect(f.energy[big]).toBeCloseTo(100 - cfg.basalCost * 16, 4);
  });
});

describe('metabolism — M3 movement cost & MOTILE digestion', () => {
  it('charges moveCost·thrust² to a moving cell on top of basal', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.posX[i] = 500;
    f.posY[i] = 500;
    f.radius[i] = 2; // area 4
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.MOTILE;
    f.thrust[i] = 3;
    const live = new Uint32Array([i]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0); // no photosynthesis
    const hash = buildHash(store, live, 1, 1024, 1024, 12);
    // photoGain 0, photoDepletion 0, digestRate 7, eff 0.7, basal 0.01, meatDecay 0.5, moveCost 0.02
    metabolize(live, 1, f, hash, lf, 0, 0, 7, 0.7, 0.01, 0.5, 0.02, 0, noBonus, 0);
    // energy = 100 − basal(0.01·4) − moveCost(0.02·3²) = 100 − 0.04 − 0.18
    expect(f.energy[i]).toBeCloseTo(100 - 0.04 - 0.18, 4);
  });

  it('a MOTILE eats an adjacent PHOTO like a digestive', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const a = store.alloc(); // motile — lower slot, eats first
    const b = store.alloc(); // photo prey, adjacent (within ri+rj)
    f.posX[a] = 500;
    f.posY[a] = 500;
    f.radius[a] = 3;
    f.mass[a] = 1;
    f.energy[a] = 100;
    f.cellType[a] = CellType.MOTILE;
    f.thrust[a] = 0;
    f.posX[b] = 503;
    f.posY[b] = 500;
    f.radius[b] = 3;
    f.mass[b] = 1;
    f.energy[b] = 50;
    f.cellType[b] = CellType.PHOTO;
    const live = new Uint32Array([a, b]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0); // isolate digestion (prey photosynthesises 0)
    const hash = buildHash(store, live, 2, 1024, 1024, 12);
    metabolize(live, 2, f, hash, lf, 0, 0, 7, 0.7, 0.01, 0.5, 0.02, 0, noBonus, 0);
    const area = 9;
    // MOTILE extracts min(7,50)=7, keeps 0.7·7=4.9, pays basal 0.01·9, move 0.
    expect(f.energy[a]).toBeCloseTo(100 + 7 * 0.7 - 0.01 * area, 4);
    // PHOTO prey loses the 7 eaten, gains 0 light, then pays its OWN basal 0.01·9.
    expect(f.energy[b]).toBeCloseTo(50 - 7 - 0.01 * area, 4);
  });
});

describe('metabolism — M4 neuralCost', () => {
  it('charges neuralCost to a NEURON cell on top of basal (no move, no digest)', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.posX[i] = 500;
    f.posY[i] = 500;
    f.radius[i] = 2; // area 4
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.NEURON;
    f.thrust[i] = 0;
    const live = new Uint32Array([i]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0);
    const hash = buildHash(store, live, 1, 1024, 1024, 12);
    // photoGain 0, photoDepletion 0, digestRate 7, eff 0.7, basal 0.01, meatDecay 0.5, moveCost 0.02, neuralCost 0.05
    metabolize(live, 1, f, hash, lf, 0, 0, 7, 0.7, 0.01, 0.5, 0.02, 0.05, noBonus, 0);
    // energy = 100 − basal(0.01·4) − neural(0.05) = 100 − 0.04 − 0.05
    expect(f.energy[i]).toBeCloseTo(100 - 0.04 - 0.05, 4);
  });

  it('charges a MOVER basal + neuralCost + moveCost·thrust²', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.posX[i] = 500;
    f.posY[i] = 500;
    f.radius[i] = 2; // area 4
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.MOVER;
    f.thrust[i] = 3;
    const live = new Uint32Array([i]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0);
    const hash = buildHash(store, live, 1, 1024, 1024, 12);
    metabolize(live, 1, f, hash, lf, 0, 0, 7, 0.7, 0.01, 0.5, 0.02, 0.05, noBonus, 0);
    // 100 − basal(0.04) − neural(0.05) − move(0.02·9=0.18)
    expect(f.energy[i]).toBeCloseTo(100 - 0.04 - 0.05 - 0.18, 4);
  });

  it('does NOT charge neuralCost to a non-neural cell (PHOTO) even when the knob is large', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const i = store.alloc();
    f.posX[i] = 500;
    f.posY[i] = 500;
    f.radius[i] = 2; // area 4
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.PHOTO;
    f.thrust[i] = 0;
    const live = new Uint32Array([i]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0); // no photosynthesis gain
    const hash = buildHash(store, live, 1, 1024, 1024, 12);
    // neuralCost 99 — must be ignored for PHOTO; only basal(0.01·4) applies.
    metabolize(live, 1, f, hash, lf, 0, 0, 7, 0.7, 0.01, 0.5, 0.02, 99, noBonus, 0);
    expect(f.energy[i]).toBeCloseTo(100 - 0.04, 4);
  });
});

describe('metabolism — M5 digestion-clustering bonus', () => {
  it('scales a bonded digestive cluster cell gain by 1 + digestClusterBonus·neighbours', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eater = store.alloc();
    const prey = store.alloc();
    f.posX[eater] = 500;
    f.posY[eater] = 500;
    f.posX[prey] = 503; // within contact (ri+rj = 12)
    f.posY[prey] = 500;
    f.radius[eater] = 6;
    f.radius[prey] = 6;
    f.mass[eater] = 1;
    f.mass[prey] = 1;
    f.energy[eater] = 100;
    f.energy[prey] = 100;
    f.cellType[eater] = CellType.DIGESTIVE;
    f.cellType[prey] = CellType.PHOTO; // edible
    const live = Uint32Array.from([eater, prey]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0);
    const hash = buildHash(store, live, 2, 1024, 1024, 12);

    const digestBonus = new Uint8Array(8);
    digestBonus[eater] = 2; // pretend it has 2 bonded digestive neighbours
    // digestRate 7, eff 0.7, basal 0, meatDecay 0.5, moveCost 0, neuralCost 0, clusterBonus 0.5
    metabolize(live, 2, f, hash, lf, 0, 0, 7, 0.7, 0, 0.5, 0, 0, digestBonus, 0.5);
    // extracted 7, base gain 7·0.7 = 4.9; multiplier 1 + 0.5·2 = 2 → 9.8 gained. start 100.
    expect(f.energy[eater]).toBeCloseTo(100 + 4.9 * 2, 4);
  });

  it('is identical to the unbonded case when digestBonus[i] is 0 (M2/M3 regression)', () => {
    const store = new CellStore(8, false);
    const f = store.fields;
    const eater = store.alloc();
    const prey = store.alloc();
    f.posX[eater] = 500;
    f.posY[eater] = 500;
    f.posX[prey] = 503;
    f.posY[prey] = 500;
    f.radius[eater] = 6;
    f.radius[prey] = 6;
    f.mass[eater] = 1;
    f.energy[eater] = 100;
    f.energy[prey] = 100;
    f.cellType[eater] = CellType.DIGESTIVE;
    f.cellType[prey] = CellType.PHOTO;
    const live = Uint32Array.from([eater, prey]);
    const lf = new LightField(16, 16, 1024, 1024);
    lf.cap.fill(0);
    lf.light.fill(0);
    const hash = buildHash(store, live, 2, 1024, 1024, 12);
    const digestBonus = new Uint8Array(8); // all zero
    metabolize(live, 2, f, hash, lf, 0, 0, 7, 0.7, 0, 0.5, 0, 0, digestBonus, 0.5);
    expect(f.energy[eater]).toBeCloseTo(100 + 4.9, 4); // unchanged from the no-bonus path
  });
});
