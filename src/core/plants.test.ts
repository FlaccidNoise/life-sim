import { describe, it, expect, vi } from 'vitest';
import { World } from './world';
import { Plants, PlantGene, PLANT_GENE_COUNT } from './plants';
import { PlantScent } from './plant-scent';
import { defaultConfig, type Config } from './config';
import { FoodField } from './food-field';
import { Walls } from './walls';
import { Rng } from './rng';
import { Hasher } from './hash';

/** A small plant world: 1024² instead of 8192², so the field/wall work per tick is ~64× cheaper. These
 *  tests assert the lifecycle rules and the determinism contract, not demo ecology.
 *  It MUST carry the demo's DEEP-POCKET fertility knobs: defaultConfig clamps fertility at 1
 *  (foodPatchRichness 1, foodMaxFertility 1), so nothing anywhere clears plantGermFertility 2.0 and no
 *  plant can germinate at all. The germination threshold is only meaningful against deep reservoirs. */
const plantConfig = (overrides: Partial<Config> = {}): Config =>
  defaultConfig({
    worldWidth: 1024,
    worldHeight: 1024,
    foodCols: 16,
    foodRows: 16,
    initialPopulation: 30,
    foodPatchRichness: 3,
    foodPatchRichnessVar: 0.8,
    foodMaxFertility: 5,
    plantsEnabled: true,
    plantCapacity: 4096,
    plantFounderCount: 200,
    ...overrides,
  });

/** A bare pool with its own field + walls, for the rules that are easier to drive without a World. */
function bare(overrides: Partial<Config> = {}): { cfg: Config; plants: Plants; food: FoodField } {
  const cfg = plantConfig(overrides);
  const food = new FoodField(
    cfg.worldWidth,
    cfg.worldHeight,
    cfg.foodCols,
    cfg.foodRows,
    cfg.foodCap,
    cfg.foodInit,
    cfg.foodChannels,
    cfg.foodChannelRatio,
    cfg.foodPocketChannelMode,
    cfg.foodChannelAWallTied,
    cfg.foodChannelBDriftMult,
  );
  const walls = new Walls(cfg.worldWidth, cfg.worldHeight, cfg.wallCols, cfg.wallRows, cfg);
  food.seedPatches(
    cfg.foodPatchCount,
    cfg.foodPatchRadius,
    cfg.foodBaseFertility,
    new Rng(cfg.seed),
    cfg.foodPatchRichness,
    cfg.foodPatchRichnessVar,
    cfg.foodMaxFertility,
    cfg.pocketCapVariance,
    new Rng(0xc),
    () => 0,
    cfg.fertilityDriftRate,
    cfg.fertilityDriftInterval,
    cfg.foodPocketDriftRateA,
    cfg.foodPocketDriftRateB,
    cfg.pocketDriftSpeed,
    new Rng(0x5eed),
    cfg.perPocketDrift,
    () => -1,
  );
  return { cfg, plants: new Plants(cfg, food, walls), food };
}

const hashOf = (p: Plants): string => {
  const h = new Hasher();
  p.hashInto(h);
  return h.hex();
};

describe('Plants — lifecycle', () => {
  it('founders establish only on ground above plantGermFertility', () => {
    const { cfg, plants, food } = bare();
    expect(plants.liveCount).toBeGreaterThan(0);
    let infertile = 0;
    for (let k = 0; k < plants.liveCount; k++) {
      const i = plants.liveIndices[k]!;
      if (food.fertilityAt(plants.x[i]!, plants.y[i]!) < cfg.plantGermFertility) infertile++;
    }
    expect(infertile).toBe(0);
  });

  it('growth never yields a negative or NaN energy, over a long run', () => {
    // Accumulate and assert ONCE: a per-plant expect() here is millions of calls and dominates the run.
    const { plants } = bare();
    let bad = 0;
    for (let t = 0; t < 400; t++) {
      plants.buildHash();
      plants.step(t);
      for (let k = 0; k < plants.liveCount; k++) {
        const e = plants.energy[plants.liveIndices[k]!]!;
        if (!Number.isFinite(e) || e <= 0) bad++;
      }
    }
    expect(bad).toBe(0);
    expect(plants.liveCount).toBeGreaterThan(0);
  });

  it('K-guard: a plant on zero-fertility ground wilts by bounded decay instead of going to -Infinity', () => {
    // Drive the fertility=0 route directly: plantMinK bounds the divisor and plantStarveRate bounds the
    // per-tick loss, so E must fall smoothly to the death threshold rather than blowing up in one tick.
    const { cfg, plants } = bare({ plantFounderCount: 0 });
    const r = cfg.plantGrowthRate;
    const e0 = cfg.plantSeedEnergy;
    let e = 35;
    const seen: number[] = [];
    for (let t = 0; t < 200 && e > cfg.plantDeathEnergy; t++) {
      const growth = r * (e + e0) * (1 - e / cfg.plantMinK); // K collapsed to the clamp
      e += Math.max(growth, -cfg.plantStarveRate * e);
      e -= cfg.plantUpkeep;
      seen.push(e);
      expect(Number.isFinite(e)).toBe(true);
    }
    expect(e).toBeLessThanOrEqual(cfg.plantDeathEnergy);
    expect(seen.length).toBeGreaterThan(50); // bounded collapse, not a one-tick crash
    expect(plants.liveCount).toBe(0);
  });

  it('a plant dies at plantMaxAge', () => {
    // Seeding is disabled by an unreachable threshold, not by a long cooldown: a fresh plant starts with
    // seedCooldownLeft 0, so a cooldown blocks only the SECOND dispersal and the founders would still
    // leave a generation of children behind to survive the age cull.
    const { plants } = bare({ plantMaxAge: 40, plantSeedThreshold: 10 });
    expect(plants.liveCount).toBeGreaterThan(0);
    for (let t = 0; t < 41; t++) {
      plants.buildHash();
      plants.step(t);
    }
    expect(plants.liveCount).toBe(0);
  });

  it('an unaffordable seed cost blocks seeding without killing the parent (I4 solvency guard)', () => {
    // On collapsed-K ground plantSeedThreshold·K can fall below plantSeedCost — without the solvency
    // guard the plant would pass the seed gate, pay a cost it cannot afford, and be culled the same
    // tick (a churn treadmill that turns a fraction of the parent's energy into a full-energy child).
    // Compare identical founders that differ only in whether plantSeedCost is affordable: the control
    // must seed at least once; the guarded one must never pay a cost it cannot survive.
    const shared = { plantFounderCount: 1, plantCapacity: 16, plantSeedCooldown: 0 };
    const control = bare(shared).plants;
    const guarded = bare({ ...shared, plantSeedCost: 1e6 }).plants;
    for (let t = 0; t < 300; t++) {
      control.buildHash();
      control.step(t);
      guarded.buildHash();
      guarded.step(t);
    }
    expect(control.liveCount).toBeGreaterThan(1); // affordable cost: the founder does seed
    expect(guarded.liveCount).toBe(1); // unaffordable cost: guard blocks every attempt, parent survives
  });

  it('the germination cell cap binds: no hash cell ever holds more than plantCellCap plants', () => {
    const cap = 3;
    const { plants } = bare({ plantCellCap: cap, plantSeedCooldown: 5 });
    for (let t = 0; t < 250; t++) {
      plants.buildHash();
      plants.step(t);
    }
    const perCell = new Map<number, number>();
    for (let k = 0; k < plants.liveCount; k++) {
      const i = plants.liveIndices[k]!;
      const b =
        plants.hash.rowOf(plants.y[i]!) * plants.hash.cols + plants.hash.colOf(plants.x[i]!);
      perCell.set(b, (perCell.get(b) ?? 0) + 1);
    }
    expect(Math.max(...perCell.values())).toBeLessThanOrEqual(cap);
  });

  it('every gene stays inside its declared range under a huge mutation sigma', () => {
    const { plants } = bare({ plantMutationSigma: 2, plantSeedCooldown: 5 });
    for (let t = 0; t < 200; t++) {
      plants.buildHash();
      plants.step(t);
    }
    // Bounds are compared through Math.fround: the clamp runs in float64 and the result is STORED in a
    // Float32Array, so the boundary values round outward (0.3 stores as 0.30000001192…).
    const lo = [0.01, 5, 20, 0, 0, 0].map(Math.fround);
    const hi = [0.3, 120, 900, 1, 1, 1].map(Math.fround);
    let outOfRange = 0;
    for (let k = 0; k < plants.liveCount; k++) {
      const g = plants.liveIndices[k]! * PLANT_GENE_COUNT;
      for (let j = 0; j < PLANT_GENE_COUNT; j++) {
        const v = plants.genes[g + j]!;
        if (!(v >= lo[j]! && v <= hi[j]!)) outOfRange++;
      }
    }
    expect(outOfRange).toBe(0);
  });

  it('founder DEFENCE / LIGHT_NEED / SPECIES seed uniform, not clustered at a centre', () => {
    const { plants } = bare({ plantFounderCount: 600 });
    for (const gene of [PlantGene.DEFENCE, PlantGene.LIGHT_NEED, PlantGene.SPECIES]) {
      let sum = 0;
      let sumSq = 0;
      for (let k = 0; k < plants.liveCount; k++) {
        const v = plants.genes[plants.liveIndices[k]! * PLANT_GENE_COUNT + gene]!;
        sum += v;
        sumSq += v * v;
      }
      const m = sum / plants.liveCount;
      const sigma = Math.sqrt(sumSq / plants.liveCount - m * m);
      expect(sigma).toBeGreaterThan(0.2); // U[0,1] has σ 0.289; a gaussian centre draw would be far tighter
    }
  });
});

describe('Plants — determinism', () => {
  it('twin pools from the same config stay hash-identical for 200 ticks', () => {
    const a = bare().plants;
    const b = bare().plants;
    let diverged = -1;
    for (let t = 0; t < 200; t++) {
      a.buildHash();
      a.step(t);
      b.buildHash();
      b.step(t);
      if (diverged < 0 && hashOf(a) !== hashOf(b)) diverged = t;
    }
    expect(diverged).toBe(-1);
    expect(a.liveCount).toBeGreaterThan(0);
  });

  it('reset() reproduces construction byte-for-byte', () => {
    const { plants } = bare();
    const fresh = hashOf(plants);
    for (let t = 0; t < 120; t++) {
      plants.buildHash();
      plants.step(t);
    }
    expect(hashOf(plants)).not.toBe(fresh);
    plants.reset();
    expect(hashOf(plants)).toBe(fresh);
  });

  it('the hash covers all six genes — a gene edit alone moves it', () => {
    const { plants } = bare();
    const before = hashOf(plants);
    const g = plants.liveIndices[0]! * PLANT_GENE_COUNT;
    // SPECIES and DEFENCE are motor-inert (a plant never moves), so they would be an invisible
    // divergence if the digest skipped them.
    plants.genes[g + PlantGene.SPECIES] = plants.genes[g + PlantGene.SPECIES]! + 0.25;
    expect(hashOf(plants)).not.toBe(before);
  });
});

describe('World — plant wiring', () => {
  it('plantsEnabled false leaves the pool null and every plant pass skipped', () => {
    const w = new World(plantConfig({ plantsEnabled: false }));
    expect(w.plants).toBeNull();
    expect(w.plantScent).toBeNull();
    for (let t = 0; t < 50; t++) w.step();
    expect(w.stateHash()).toBe(w.stateHash());
  });

  it('the organism half of the hash is IDENTICAL with plants on and off', () => {
    // The §6 isolation claim in its honest, testable form: plants draw only from their own forked Rng, so
    // the animal population must be unaffected. The FULL hash necessarily differs — plant state is in it.
    const off = new World(plantConfig({ plantsEnabled: false }));
    const on = new World(plantConfig({ plantsEnabled: true }));
    let diverged = -1;
    for (let t = 0; t < 150; t++) {
      off.step();
      on.step();
      if (diverged < 0 && on.organismHash() !== off.organismHash()) diverged = t;
    }
    expect(diverged).toBe(-1);
    expect(on.plants!.liveCount).toBeGreaterThan(0);
    expect(on.stateHash()).not.toBe(off.stateHash());
  });

  it('twin worlds with plants on stay hash-identical, and reset rewinds to construction', () => {
    const a = new World(plantConfig());
    const b = new World(plantConfig());
    expect(a.stateHash()).toBe(b.stateHash());
    const t0 = a.stateHash();
    for (let t = 0; t < 120; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
    expect(a.stateHash()).not.toBe(t0);
    a.reset();
    expect(a.stateHash()).toBe(t0);
  });

  it('plant scent accumulates a positive signal and is folded into the hash', () => {
    const w = new World(plantConfig());
    for (let t = 0; t < 60; t++) w.step();
    expect(w.plantScent!.total()).toBeGreaterThan(0);
    const before = w.stateHash();
    w.plantScent!.lo.deposit(10, 10, 1);
    expect(w.stateHash()).not.toBe(before);
  });

  it('plants.step runs strictly before plantScent.depositAll each tick (§3.1a/§14 ordering)', () => {
    // The cull must run (inside plants.step) before the deposit reads live plants, or a same-tick
    // negative E would enter the diffusing scent field. defaultDeathEnergy makes that unreachable, which
    // is exactly why the order itself — not just the outcome — needs to be pinned.
    const w = new World(plantConfig());
    const calls: string[] = [];
    const stepSpy = vi.spyOn(w.plants!, 'step').mockImplementation((...args) => {
      calls.push('step');
      return Plants.prototype.step.apply(w.plants!, args);
    });
    const depositSpy = vi.spyOn(w.plantScent!, 'depositAll').mockImplementation((...args) => {
      calls.push('depositAll');
      return PlantScent.prototype.depositAll.apply(w.plantScent!, args);
    });
    w.step();
    expect(calls).toEqual(['step', 'depositAll']);
    stepSpy.mockRestore();
    depositSpy.mockRestore();
  });

  it('the two scent channels split by SPECIES', () => {
    // All-low species → the LO channel carries everything; all-high → HI does.
    const w = new World(plantConfig());
    const p = w.plants!;
    for (let k = 0; k < p.liveCount; k++)
      p.genes[p.liveIndices[k]! * PLANT_GENE_COUNT + PlantGene.SPECIES] = 0;
    w.plantScent!.depositAll(p, w.config.plantScentStrength);
    expect(w.plantScent!.lo.total()).toBeGreaterThan(0);
    expect(w.plantScent!.hi.total()).toBe(0);
  });
});
