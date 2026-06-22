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

  it('different seeds → different hash (seed actually controls the world)', () => {
    const a = new World(defaultConfig({ seed: 3 }));
    const b = new World(defaultConfig({ seed: 4 }));
    for (let t = 0; t < 1000; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).not.toBe(b.stateHash());
  });

  it('counterBiteFraction OFF is byte-identical to default; ON perturbs the world (lever E1 wired + ablatable)', () => {
    const baseline = new World(defaultConfig({ seed: 1 }));
    const off = new World(defaultConfig({ seed: 1, counterBiteFraction: 0 }));
    const on = new World(defaultConfig({ seed: 1, counterBiteFraction: 0.15 }));
    for (let t = 0; t < 1000; t++) {
      baseline.step();
      off.step();
      on.step();
    }
    // explicit OFF == default → the ablation knob is genuinely off-by-default (safeguard #1)
    expect(off.stateHash()).toBe(baseline.stateHash());
    // ON diverges → the counter-bite is actually read by the hot loop, not dead config
    expect(on.stateHash()).not.toBe(baseline.stateHash());
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
