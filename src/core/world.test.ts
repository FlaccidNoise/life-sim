import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { ScalarGene, SCALAR_GENE_COUNT } from './genome';

describe('World — Phase 0 determinism contract', () => {
  it('same (config, seed) → byte-identical hash after N ticks', () => {
    const a = new World(defaultConfig({ seed: 3 }));
    const b = new World(defaultConfig({ seed: 3 }));
    for (let t = 0; t < 1000; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('OFF-state golden hash: default config is byte-identical to the pre-feature engine', () => {
    // Pins the load-bearing invariant: every new knob (per-pocket richness, deadWaterCost, founding-
    // protection, food channels, …) defaults OFF → the seeded world is byte-identical to legacy. The
    // comparative tests above would silently pass if a future edit reordered an RNG draw at the default;
    // this one fails LOUDLY. Constant verified against the engine before these features (commit 55f899e).
    const w = new World(defaultConfig({ seed: 3 }));
    for (let t = 0; t < 1000; t++) w.step();
    expect(w.stateHash()).toBe('a32e9375');
  });

  it('different seeds → different hash (seed actually controls the world)', () => {
    const a = new World(defaultConfig({ seed: 3 }));
    const b = new World(defaultConfig({ seed: 4 }));
    for (let t = 0; t < 1000; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).not.toBe(b.stateHash());
  });

  it('reset() reproduces the seeded run byte-for-byte', () => {
    const w = new World(defaultConfig({ seed: 7 }));
    for (let t = 0; t < 500; t++) w.step();
    const hashRun1 = w.stateHash();
    w.reset();
    for (let t = 0; t < 500; t++) w.step();
    expect(w.stateHash()).toBe(hashRun1);
  });

  it('positions stay within the toroidal bounds', () => {
    const cfg = defaultConfig({ seed: 2 });
    const w = new World(cfg);
    for (let t = 0; t < 2000; t++) w.step();
    const s = w.store;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      expect(s.x[i]!).toBeGreaterThanOrEqual(0);
      expect(s.x[i]!).toBeLessThan(cfg.worldWidth);
      expect(s.y[i]!).toBeGreaterThanOrEqual(0);
      expect(s.y[i]!).toBeLessThan(cfg.worldHeight);
    }
  });

  it('population matches the configured initial count', () => {
    const w = new World(defaultConfig({ seed: 1, initialPopulation: 123 }));
    expect(w.population).toBe(123);
  });

  it('no explosion: over a long run everything stays finite and within the speed ceiling', () => {
    const cfg = defaultConfig({ seed: 5, initialPopulation: 600 }); // crowded → lots of repulsion
    const w = new World(cfg);
    for (let t = 0; t < 5000; t++) w.step();
    const s = w.store;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      expect(Number.isFinite(s.x[i]!)).toBe(true);
      expect(Number.isFinite(s.vx[i]!)).toBe(true);
      // clamp ON ⇒ speed never exceeds this creature's OWN evolved maxSpeed gene (+tiny FP slack)
      const maxSpeed = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED]!;
      expect(Math.hypot(s.vx[i]!, s.vy[i]!)).toBeLessThanOrEqual(maxSpeed + 1e-6);
    }
  }, 60000); // 5000 ticks at the richer foodCap 40 sustains ~1600 creatures → ~22s; 60s leaves CI headroom

  it('alive-guardrail (CI proxy): population sustains BOTH births and deaths without extinction', () => {
    // The playground spec's ONE automated guardrail (§10): the world must stay alive — no extinction,
    // no zero-births. (CI runs a short proxy; the full 100k×multi-seed check lives in headless/.)
    const cfg = defaultConfig({ seed: 1 });
    const w = new World(cfg);
    for (let t = 0; t < 3000; t++) w.step(); // fast proxy; the full 100k×seeds check is headless/guardrail
    expect(w.totalBirths).toBeGreaterThan(0);
    expect(w.totalDeaths).toBeGreaterThan(0);
    expect(w.population).toBeGreaterThan(0); // not extinct
    expect(w.population).toBeLessThan(cfg.maxOrganisms); // food-limited, not buffer-pegged
  });
});

describe('World — founding-protection (predator cluster-seeding)', () => {
  // Pockets that differ in depth (richnessVar>0 → a clear "deepest" nursery), a healthy predator fraction,
  // on a small fast world.
  const cfg = (overrides = {}): ReturnType<typeof defaultConfig> =>
    defaultConfig({
      seed: 3,
      worldWidth: 2048,
      worldHeight: 2048,
      foodCols: 64,
      foodRows: 64,
      initialPopulation: 200,
      predatorFraction: 0.2, // ~40 predators
      foodPatchRichness: 2,
      foodPatchRichnessVar: 0.6,
      foodMaxFertility: 4,
      ...overrides,
    });

  it('clusters every predator founder into the deepest pocket (vs scattered grazers)', () => {
    const c = cfg({ predatorSeedClusters: 1 }); // single nursery = THE deepest pocket
    const w = new World(c);
    const s = w.store;
    const deepest = [...w.food.patchCenters].sort(
      (a, b) => w.food.fertilityAt(b.x, b.y) - w.food.fertilityAt(a.x, a.y),
    )[0]!;
    const tdist = (ax: number, ay: number, bx: number, by: number): number => {
      let dx = Math.abs(ax - bx);
      if (dx > c.worldWidth / 2) dx = c.worldWidth - dx;
      let dy = Math.abs(ay - by);
      if (dy > c.worldHeight / 2) dy = c.worldHeight - dy;
      return Math.hypot(dx, dy);
    };
    // Jitter is uniform in ±(pocket radius in world units) per axis → max distance is the diagonal.
    const bound = Math.hypot(
      (c.foodPatchRadius * c.worldWidth) / c.foodCols,
      (c.foodPatchRadius * c.worldHeight) / c.foodRows,
    );
    let predCount = 0;
    let predInNursery = 0;
    let grazerCount = 0;
    let grazerOutside = 0;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      const diet = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET]!;
      const d = tdist(s.x[i]!, s.y[i]!, deepest.x, deepest.y);
      if (diet > 0.5) {
        predCount++;
        if (d <= bound + 1e-6) predInNursery++;
      } else {
        grazerCount++;
        if (d > bound) grazerOutside++;
      }
    }
    expect(predCount).toBeGreaterThan(10); // ~40 predators seeded
    expect(predInNursery).toBe(predCount); // EVERY predator landed in the one nursery pocket
    expect(grazerOutside).toBeGreaterThan(grazerCount * 0.5); // grazers scattered across the other pockets
  });

  it('the ON path stays deterministic (same seed → byte-identical)', () => {
    const a = new World(cfg({ predatorSeedClusters: 2 }));
    const b = new World(cfg({ predatorSeedClusters: 2 }));
    for (let t = 0; t < 300; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });
});
