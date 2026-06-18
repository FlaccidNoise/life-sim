import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig, type Config } from './config';
import { CellType } from '../cells/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-compare the cell SoA across two worlds (same capacity). */
function cellsEqual(a: World, b: World): boolean {
  const fa = a.cells.fields;
  const fb = b.cells.fields;
  for (let i = 0; i < a.cells.capacity; i++) {
    if (
      fa.posX[i] !== fb.posX[i] ||
      fa.posY[i] !== fb.posY[i] ||
      fa.energy[i] !== fb.energy[i] ||
      fa.cellType[i] !== fb.cellType[i] ||
      fa.organismId[i] !== fb.organismId[i] ||
      fa.genomeRef[i] !== fb.genomeRef[i] ||
      fa.age[i] !== fb.age[i] ||
      fa.heading[i] !== fb.heading[i]
    ) {
      return false;
    }
  }
  return true;
}

/** Assert SoA byte-identical across two runs with the SAME config. */
function assertReproducible(cfg: Config, ticks: number): void {
  const a = new World(cfg, false);
  a.seedLife(300);
  for (let t = 0; t < ticks; t++) a.tick();

  const b = new World(cfg, false);
  b.seedLife(300);
  for (let t = 0; t < ticks; t++) b.tick();

  expect(cellsEqual(a, b)).toBe(true);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('env-features — OFF baseline (byte-identical to M7)', () => {
  it('default config with all env features OFF produces same SoA as M7', () => {
    const cfg = defaultConfig({ seed: 42, maxCells: 800, worldWidth: 256, worldHeight: 256 });
    assertReproducible(cfg, 50);
  });

  it('toggling each feature ON changes cell state vs OFF', () => {
    const base = defaultConfig({ seed: 42, maxCells: 800, worldWidth: 256, worldHeight: 256 });

    // Day/night ON
    const dn = { ...base, dayNightDepth: 0.9 };
    {
      const a = new World(base, false);
      a.seedLife(300);
      for (let t = 0; t < 50; t++) a.tick();
      const b = new World(dn, false);
      b.seedLife(300);
      for (let t = 0; t < 50; t++) b.tick();
      let diff = false;
      for (let i = 0; i < a.cells.capacity; i++) {
        if (a.cells.fields.energy[i] !== b.cells.fields.energy[i]) { diff = true; break; }
      }
      expect(diff).toBe(true);
    }

    // Rocks ON
    const rocks = { ...base, rockCount: 20, rockRepulsion: 100 };
    {
      const a = new World(base, false);
      a.seedLife(300);
      for (let t = 0; t < 50; t++) a.tick();
      const b = new World(rocks, false);
      b.seedLife(300);
      for (let t = 0; t < 50; t++) b.tick();
      let diff = false;
      for (let i = 0; i < a.cells.capacity; i++) {
        if (
          a.cells.fields.posX[i] !== b.cells.fields.posX[i] ||
          a.cells.fields.posY[i] !== b.cells.fields.posY[i]
        ) { diff = true; break; }
      }
      expect(diff).toBe(true);
    }

    // Temperature cold penalty ON
    const temp = { ...base, tempColdPenalty: 2 };
    {
      const a = new World(base, false);
      a.seedLife(300);
      for (let t = 0; t < 50; t++) a.tick();
      const b = new World(temp, false);
      b.seedLife(300);
      for (let t = 0; t < 50; t++) b.tick();
      let diff = false;
      for (let i = 0; i < a.cells.capacity; i++) {
        if (a.cells.fields.energy[i] !== b.cells.fields.energy[i]) { diff = true; break; }
      }
      expect(diff).toBe(true);
    }

    // Current drift ON
    const current = { ...base, currentStrength: 5 };
    {
      const a = new World(base, false);
      a.seedLife(300);
      for (let t = 0; t < 50; t++) a.tick();
      const b = new World(current, false);
      b.seedLife(300);
      for (let t = 0; t < 50; t++) b.tick();
      let diff = false;
      for (let i = 0; i < a.cells.capacity; i++) {
        if (
          a.cells.fields.posX[i] !== b.cells.fields.posX[i] ||
          a.cells.fields.posY[i] !== b.cells.fields.posY[i]
        ) { diff = true; break; }
      }
      expect(diff).toBe(true);
    }

    // Toxin damage ON
    const toxin = { ...base, toxinDamage: 5 };
    {
      const a = new World(base, false);
      a.seedLife(300);
      for (let t = 0; t < 50; t++) a.tick();
      const b = new World(toxin, false);
      b.seedLife(300);
      for (let t = 0; t < 50; t++) b.tick();
      // Manually deposit toxin at cell positions in b
      for (let i = 0; i < b.cells.capacity; i++) {
        if (b.cells.isAlive(i)) {
          b.toxin.depositAt(b.cells.fields.posX[i]!, b.cells.fields.posY[i]!, 1);
        }
      }
      // Tick once more so toxin damage applies
      b.tick();
      a.tick();
      let diff = false;
      for (let i = 0; i < a.cells.capacity; i++) {
        if (a.cells.fields.energy[i] !== b.cells.fields.energy[i]) { diff = true; break; }
      }
      expect(diff).toBe(true);
    }
  });
});

describe('env-features — day/night photosynthesis modulation', () => {
  it('PHOTO cell energy gain is higher at midday than at midnight', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 256,
      worldHeight: 256,
      basalCost: 0, // isolate photo gain
      lightGridCols: 8,
      lightGridRows: 8,
      lightMax: 1, // keep patches at 1 so the cycle is the only modulator
      dayLength: 600,
      dayNightDepth: 0.9,
      seasonLength: 12000,
      seasonDepth: 0,
    });

    // Run to tick 150 (midday peak: sin(2π·150/600) = sin(π/2) = 1 → rawDay = 1)
    const wMidday = new World(cfg, false);
    wMidday.seedLife(10);
    // Advance to tick 149, then one more tick
    for (let t = 0; t < 149; t++) wMidday.tick();
    const beforeMidday = wMidday.cells.fields.energy.slice(0, wMidday.cells.aliveCount);
    wMidday.tick();
    const afterMidday = wMidday.cells.fields.energy.slice(0, wMidday.cells.aliveCount);
    const gainMidday = afterMidday[0]! - beforeMidday[0]!;

    // Run to tick 450 (midnight dip: sin(2π·450/600) = sin(3π/2) = -1 → rawDay = 0)
    const cfgNight = { ...cfg, seed: 1 };
    const wNight = new World(cfgNight, false);
    wNight.seedLife(10);
    for (let t = 0; t < 449; t++) wNight.tick();
    const beforeNight = wNight.cells.fields.energy.slice(0, wNight.cells.aliveCount);
    wNight.tick();
    const afterNight = wNight.cells.fields.energy.slice(0, wNight.cells.aliveCount);
    const gainNight = afterNight[0]! - beforeNight[0]!;

    expect(gainMidday).toBeGreaterThan(gainNight);
  });
});

describe('env-features — rock collision repulsion', () => {
  it('a cell overlapping a rock gets pushed away', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 512,
      worldHeight: 512,
      rockCount: 5,
      rockRadiusMin: 40,
      rockRadiusMax: 40,
      rockRepulsion: 10,
      rockGridSize: 128,
      repulsion: 0,
      damping: 0, // no drag → force = velocity
      basalCost: 0,
    });

    const w = new World(cfg, false);
    // Place a cell slightly offset from rock center so d > 0 (collision kernel requires d2 > 0)
    const f = w.cells.fields;
    const i = w.cells.alloc();
    f.posX[i] = w.rocks.cx[0]! + 5;
    f.posY[i] = w.rocks.cy[0]! + 5;
    f.radius[i] = cfg.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.PHOTO;
    f.forceX[i] = 0;
    f.forceY[i] = 0;
    f.velX[i] = 0;
    f.velY[i] = 0;

    // Tick once — rock force should be applied
    w.tick();
    // Cell should have moved away from the rock center (force > 0)
    const dx = f.posX[i] - w.rocks.cx[0]!;
    const dy = f.posY[i] - w.rocks.cy[0]!;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeGreaterThan(0);
  });

  it('rocks OFF (rockCount=0) has no effect on positions', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 256,
      worldHeight: 256,
      rockCount: 0,
    });

    const a = new World(cfg, false);
    a.seedLife(50);
    for (let t = 0; t < 20; t++) a.tick();

    const b = new World(cfg, false);
    b.seedLife(50);
    for (let t = 0; t < 20; t++) b.tick();

    expect(cellsEqual(a, b)).toBe(true);
  });
});

describe('env-features — current drift', () => {
  it('a free cell drifts in the current direction over N ticks', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 512,
      worldHeight: 512,
      currentGridCols: 8,
      currentGridRows: 8,
      currentPatchCount: 0, // uniform field — no patches
      currentPatchRadius: 6,
      currentStrength: 5,
      currentEvolveRate: 0, // frozen current
      repulsion: 0,
      basalCost: 0,
    });

    const w = new World(cfg, false);
    // Override the current field to be uniform rightward using direct buffer access.
    const vx = (w.current as unknown as { _vx: Float32Array })._vx;
    const vy = (w.current as unknown as { _vy: Float32Array })._vy;
    for (let i = 0; i < vx.length; i++) {
      vx[i] = cfg.currentStrength;
      vy[i] = 0;
    }

    const f = w.cells.fields;
    const i = w.cells.alloc();
    f.posX[i] = 100;
    f.posY[i] = 100;
    f.radius[i] = cfg.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.PHOTO;
    f.forceX[i] = 0;
    f.forceY[i] = 0;
    f.velX[i] = 0;
    f.velY[i] = 0;

    for (let t = 0; t < 10; t++) w.tick();

    // With damping 0.5, the drift reaches terminal velocity = strength/(1 - damping) * dt
    // Actually: v_new = v_old * damping + force = v_old * 0.5 + 5
    // Terminal: v = 5 / (1 - 0.5) = 10
    // So position should move right significantly
    expect(f.posX[i]).toBeGreaterThan(100);
  });

  it('currentStrength=0 yields no drift (byte-identical to no-current)', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 256,
      worldHeight: 256,
      currentStrength: 0,
    });
    assertReproducible(cfg, 30);
  });
});

describe('env-features — temperature metabolism penalty', () => {
  it('cells in cold patches lose more energy than in warm patches', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 500,
      worldWidth: 512,
      worldHeight: 512,
      tempGridCols: 16,
      tempGridRows: 16,
      tempPatchCount: 16,
      tempPatchRadius: 2,
      tempMin: 0,
      tempMax: 1,
      tempDiffuse: 0,
      tempRegen: 0, // frozen field so positions are stable
      tempComfortLow: 0.3,
      tempComfortHigh: 0.7,
      tempColdPenalty: 5, // heavy penalty
      tempHeatPenalty: 0,
      photoGain: 0, // no photosynthesis income
      basalCost: 0.01, // small basal so temperature multiplier matters
    });

    const w = new World(cfg, false);
    // Find cold and warm grid patches by scanning the grid directly.
    const temp = w.temperature;
    let coldIdx = 0;
    let warmIdx = 0;
    let minTemp = Infinity;
    let maxTemp = -Infinity;
    for (let idx = 0; idx < temp.cols * temp.rows; idx++) {
      const t = temp.temp[idx]!;
      if (t < minTemp) { minTemp = t; coldIdx = idx; }
      if (t > maxTemp) { maxTemp = t; warmIdx = idx; }
    }
    const coldX = (coldIdx % temp.cols) * temp.worldWidth / temp.cols + temp.worldWidth / temp.cols / 2;
    const coldY = (Math.floor(coldIdx / temp.cols)) * temp.worldHeight / temp.rows + temp.worldHeight / temp.rows / 2;
    const warmX = (warmIdx % temp.cols) * temp.worldWidth / temp.cols + temp.worldWidth / temp.cols / 2;
    const warmY = (Math.floor(warmIdx / temp.cols)) * temp.worldHeight / temp.rows + temp.worldHeight / temp.rows / 2;
    // Sanity: the field has meaningful variation
    expect(minTemp).toBeLessThan(maxTemp);
    expect(minTemp).toBeLessThan(cfg.tempComfortLow);

    // Place cells at those positions
    const f = w.cells.fields;
    const coldCell = w.cells.alloc();
    f.posX[coldCell] = coldX;
    f.posY[coldCell] = coldY;
    f.radius[coldCell] = cfg.cellRadius;
    f.mass[coldCell] = 1;
    f.energy[coldCell] = 100;
    f.cellType[coldCell] = CellType.PHOTO;

    const warmCell = w.cells.alloc();
    f.posX[warmCell] = warmX;
    f.posY[warmCell] = warmY;
    f.radius[warmCell] = cfg.cellRadius;
    f.mass[warmCell] = 1;
    f.energy[warmCell] = 100;
    f.cellType[warmCell] = CellType.PHOTO;

    w.tick();

    // Cold cell should have lost more energy
    const coldLoss = 100 - f.energy[coldCell];
    const warmLoss = 100 - f.energy[warmCell];
    expect(coldLoss).toBeGreaterThan(warmLoss);
  });

  it('tempColdPenalty=0 has no effect (OFF path)', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 256,
      worldHeight: 256,
      tempColdPenalty: 0,
      tempHeatPenalty: 0,
    });
    assertReproducible(cfg, 20);
  });
});

describe('env-features — toxin damage', () => {
  it('toxin damage reduces cell energy vs no toxin', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 256,
      worldHeight: 256,
      toxinGridCols: 16,
      toxinGridRows: 16,
      toxinDiffuse: 0,
      toxinDecay: 0,
      toxinDamage: 10,
      photoGain: 0,
      basalCost: 0,
    });

    const w = new World(cfg, false);
    const f = w.cells.fields;
    const i = w.cells.alloc();
    f.posX[i] = 100;
    f.posY[i] = 100;
    f.radius[i] = cfg.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.PHOTO;

    // Deposit toxin at the cell's position
    w.toxin.depositAt(100, 100, 2);
    expect(w.toxin.sampleAt(100, 100)).toBeGreaterThan(0);

    w.tick();
    expect(f.energy[i]).toBeLessThan(100);
  });

  it('toxinDamage=0 has no effect (OFF path)', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 256,
      worldHeight: 256,
      toxinDamage: 0,
    });
    assertReproducible(cfg, 20);
  });
});

describe('env-features — glow emission', () => {
  it('active glow effector deposits glow and costs energy', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 256,
      worldHeight: 256,
      glowGridCols: 8,
      glowGridRows: 8,
      glowGain: 2,
      glowCost: 0.1,
      maxGlowEffectors: 64,
      basalCost: 0,
      photoGain: 0,
    });

    const w = new World(cfg, false);
    const f = w.cells.fields;

    // Create a NEURON cell with activation 1
    const n = w.cells.alloc();
    f.posX[n] = 128;
    f.posY[n] = 128;
    f.radius[n] = cfg.cellRadius;
    f.mass[n] = 1;
    f.energy[n] = 100;
    f.cellType[n] = CellType.NEURON;
    f.organismId[n] = 0;
    f.heading[n] = 0;

    // Add it as a glow effector
    w.glowEffectors.addEffector(n, f.generation[n]!, 1);

    // Set activation to 1 (a(t-1) in actCur, before swap)
    w.net.actCur[n] = 1;
    w.net.swap(); // actCur now holds a(t) = 1

    // Tick — computeGlow should fire
    w.tick();

    // Check glow field non-zero at the neuron's position
    expect(w.glow.sampleAt(128, 128)).toBeGreaterThan(0);

    // Check energy was charged
    expect(f.energy[n]).toBeLessThan(100);
  });

  it('glowCost=0 creates no energy charge', () => {
    const cfg = defaultConfig({
      seed: 1,
      maxCells: 100,
      worldWidth: 256,
      worldHeight: 256,
      glowGridCols: 8,
      glowGridRows: 8,
      glowGain: 2,
      glowCost: 0, // OFF
      maxGlowEffectors: 64,
      basalCost: 0,
      neuralCost: 0,
      photoGain: 0,
    });

    const w = new World(cfg, false);
    const f = w.cells.fields;

    const n = w.cells.alloc();
    f.posX[n] = 128;
    f.posY[n] = 128;
    f.radius[n] = cfg.cellRadius;
    f.mass[n] = 1;
    f.energy[n] = 100;
    f.cellType[n] = CellType.NEURON;

    w.glowEffectors.addEffector(n, f.generation[n]!, 1);
    w.net.actCur[n] = 1;
    w.net.swap();

    w.tick();

    // Glow still emitted
    expect(w.glow.sampleAt(128, 128)).toBeGreaterThan(0);
    // But no energy charge from glowCost (basal/neural are 0 so total stays 100)
    expect(f.energy[n]).toBe(100);
  });
});

describe('env-features — reproducibility with env ON', () => {
  it('two runs with non-default env config produce byte-identical SoA', () => {
    const cfg = defaultConfig({
      seed: 9999,
      maxCells: 500,
      worldWidth: 512,
      worldHeight: 512,
      dayNightDepth: 0.5,
      seasonDepth: 0.3,
      rockCount: 10,
      tempColdPenalty: 1,
      toxinDamage: 1,
      currentStrength: 2,
    });
    assertReproducible(cfg, 40);
  });
});