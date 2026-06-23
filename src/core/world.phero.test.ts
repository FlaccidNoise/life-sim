import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { OrganismStore } from './store';
import { PheroField } from './phero-field';
import { metabolize } from './economy';
import { SpatialHash } from './spatial-hash';
import { FoodField } from './food-field';
import { ScalarGene, SCALAR_GENE_COUNT, Brain, BRAIN_GENES } from './genome';

/**
 * F2 pheromones — world-level determinism + the byte-identity gate (OFF==default) and non-vacuity
 * (ON!=default), plus the deposit-order determinism test. A smaller, denser world is used so grazing
 * actually populates the field within a short run (the byte-identity invariant is scale-independent).
 */
const SMALL = {
  seed: 7,
  worldWidth: 2048,
  worldHeight: 2048,
  foodCols: 64,
  foodRows: 64,
  initialPopulation: 200,
};

describe('World — F2 pheromones', () => {
  it('pheromoneEnabled OFF is byte-identical to the default (field-level, after a long run)', () => {
    // The default config already has pheromoneEnabled=false; this pins that EXPLICITLY setting it false
    // (and constructing the phero field path's `null` branch) leaves the full state hash unchanged.
    const baseline = new World(defaultConfig({ ...SMALL }));
    const off = new World(defaultConfig({ ...SMALL, pheromoneEnabled: false }));
    for (let t = 0; t < 400; t++) {
      baseline.step();
      off.step();
    }
    expect(off.stateHash()).toBe(baseline.stateHash());
    expect(off.phero).toBeNull(); // field never allocated when off
  });

  it('pheromoneEnabled ON diverges from the default (the field is real sim state)', () => {
    const off = new World(defaultConfig({ ...SMALL }));
    const on = new World(defaultConfig({ ...SMALL, pheromoneEnabled: true }));
    for (let t = 0; t < 400; t++) {
      off.step();
      on.step();
    }
    expect(on.phero).not.toBeNull();
    // The ON world must DIVERGE: the field populates (deposits) and the PHERO genes/sense perturb movement.
    expect(on.stateHash()).not.toBe(off.stateHash());
  });

  it('ON field actually populates (non-vacuity): mean/max P > 0 after grazing', () => {
    const on = new World(defaultConfig({ ...SMALL, pheromoneEnabled: true }));
    for (let t = 0; t < 300; t++) on.step();
    expect(on.phero).not.toBeNull();
    expect(on.phero!.total()).toBeGreaterThan(0);
    expect(on.phero!.max()).toBeGreaterThan(0);
  });

  it('ON path is deterministic (same seed → byte-identical)', () => {
    const a = new World(defaultConfig({ ...SMALL, pheromoneEnabled: true }));
    const b = new World(defaultConfig({ ...SMALL, pheromoneEnabled: true }));
    for (let t = 0; t < 200; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('2 grazers depositing into the SAME cell same tick → byte-identical P across runs (ascending-order)', () => {
    // Two creatures sit on the same food cell with DIFFERENT PHERO_DEPOSIT genes; both graze this tick and
    // both deposit into the one cell. Deposit is ascending live-slot, RNG-free — so the cell's P is the
    // sum of both genes, identical every run regardless of which slot deposits first (sum commutes, and
    // the order is fixed anyway). Run it twice and assert byte-identical field hashes.
    const cfg = defaultConfig({
      pheromoneEnabled: true,
      pheroDepositOnGraze: true,
      pheroGrazeStrength: 1,
      pheroDiffuse: 0,
      pheroDecay: 0,
    });
    const run = (): number => {
      const store = new OrganismStore(4);
      const a = store.alloc();
      const b = store.alloc();
      store.rebuildLive();
      // Both at the SAME world position (one cell). Food field full so both can graze.
      const food = new FoodField(
        cfg.worldWidth,
        cfg.worldHeight,
        cfg.foodCols,
        cfg.foodRows,
        cfg.foodCap,
        1,
      );
      const phero = new PheroField(cfg.worldWidth, cfg.worldHeight, cfg.foodCols, cfg.foodRows);
      for (const i of [a, b]) {
        store.x[i] = 100;
        store.y[i] = 100;
        store.energy[i] = 1; // below satiated → will graze
        const sg = i * SCALAR_GENE_COUNT;
        store.scalarGenes[sg + ScalarGene.EAT_RATE] = 1;
        store.scalarGenes[sg + ScalarGene.METAB_EFF] = 1;
        store.scalarGenes[sg + ScalarGene.REPRO_THRESHOLD] = 50;
        store.scalarGenes[sg + ScalarGene.SATIATED_THRESHOLD] = 100;
      }
      // Distinct deposit genes so order would matter if it weren't deterministic.
      store.scalarGenes[a * SCALAR_GENE_COUNT + ScalarGene.PHERO_DEPOSIT] = 2;
      store.scalarGenes[b * SCALAR_GENE_COUNT + ScalarGene.PHERO_DEPOSIT] = 3;
      const hash = new SpatialHash(cfg.worldWidth, cfg.worldHeight, 2 * cfg.cellRadius, 4);
      hash.build(store);
      metabolize(store, food, hash, cfg, phero);
      return phero.sampleAt(100, 100);
    };
    const first = run();
    const second = run();
    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0); // both genes (2+3) deposited proportional to what they grazed
  });

  it('ablation: with phero OFF the 4 PHERO brain genes stay 0 after a long run (never drawn)', () => {
    const w = new World(defaultConfig({ ...SMALL, pheromoneEnabled: false }));
    for (let t = 0; t < 400; t++) w.step();
    const s = w.store;
    s.rebuildLive();
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      const b = i * BRAIN_GENES;
      expect(s.brain[b + Brain.PHERO_LAT_TURN]).toBe(0);
      expect(s.brain[b + Brain.PHERO_FWD_TURN]).toBe(0);
      expect(s.brain[b + Brain.PHERO_LAT_THRUST]).toBe(0);
      expect(s.brain[b + Brain.PHERO_FWD_THRUST]).toBe(0);
    }
  });
});
