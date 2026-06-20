import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

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

  it('reset() reproduces the seeded run byte-for-byte', () => {
    const w = new World(defaultConfig({ seed: 7 }));
    for (let t = 0; t < 500; t++) w.step();
    const hashRun1 = w.stateHash();
    w.reset();
    for (let t = 0; t < 500; t++) w.step();
    expect(w.stateHash()).toBe(hashRun1);
  });

  it('golden hash is stable (pins the trajectory; update only on an intentional change)', () => {
    const w = new World(defaultConfig({ seed: 1 }));
    for (let t = 0; t < 1000; t++) w.step();
    // Pinned fingerprint — a change here means the deterministic trajectory moved. That must be a
    // deliberate, reviewed change, never an accident.
    expect(w.stateHash()).toMatchInlineSnapshot(`"371a1819"`);
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
      // clamp ON ⇒ speed never exceeds maxSpeed (+tiny FP slack)
      expect(Math.hypot(s.vx[i]!, s.vy[i]!)).toBeLessThanOrEqual(cfg.maxSpeed + 1e-6);
    }
  });

  it('stability clamp is non-vacuous: OFF + stiff repulsion exceeds the speed ceiling (ablation)', () => {
    const base = { seed: 5, initialPopulation: 600, repulsion: 40, maxSpeed: 6, damping: 0.99 };
    const maxSpeedOf = (clamp: boolean): number => {
      const w = new World(defaultConfig({ ...base, stabilityClamp: clamp }));
      let mx = 0;
      for (let t = 0; t < 300; t++) {
        w.step();
        const s = w.store;
        for (let k = 0; k < s.liveCount; k++) {
          const i = s.liveIndices[k]!;
          mx = Math.max(mx, Math.hypot(s.vx[i]!, s.vy[i]!));
        }
      }
      return mx;
    };
    expect(maxSpeedOf(true)).toBeLessThanOrEqual(6 + 1e-6); // ON: bounded
    expect(maxSpeedOf(false)).toBeGreaterThan(6); // OFF: blows past the ceiling
  });
});
