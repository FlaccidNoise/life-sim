import { describe, it, expect } from 'vitest';
import { LightField } from './light-field';
import { Rng } from '../math/rng';

describe('LightField init', () => {
  it('produces a NON-uniform (patchy) field — the anti-monoculture gradient', () => {
    const lf = new LightField(64, 64, 4096, 4096);
    lf.init(new Rng(1), 32, 6, 1);
    let min = Infinity;
    let max = -Infinity;
    for (const v of lf.light) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1 + 1e-6);
    expect(max - min).toBeGreaterThan(0.1); // genuinely patchy, not flat
  });

  it('is reproducible from the same seed and differs across seeds', () => {
    const a = new LightField(32, 32, 4096, 4096);
    a.init(new Rng(7), 16, 4, 1);
    const b = new LightField(32, 32, 4096, 4096);
    b.init(new Rng(7), 16, 4, 1);
    const c = new LightField(32, 32, 4096, 4096);
    c.init(new Rng(8), 16, 4, 1);
    expect(Array.from(a.light)).toEqual(Array.from(b.light));
    expect(Array.from(a.light)).not.toEqual(Array.from(c.light));
  });

  it('seeds capacity equal to the initial light (patches regen back to their shape)', () => {
    const lf = new LightField(16, 16, 1024, 1024);
    lf.init(new Rng(3), 8, 3, 1);
    expect(Array.from(lf.cap)).toEqual(Array.from(lf.light));
  });
});

describe('LightField dynamics', () => {
  it('deplete reduces a patch and clamps at zero', () => {
    const lf = new LightField(8, 8, 800, 800);
    lf.init(new Rng(1), 4, 2, 1);
    const i = lf.patchIndex(400, 400);
    const before = lf.light[i]!;
    lf.depleteAt(400, 400, before + 5); // over-deplete
    expect(lf.light[i]).toBe(0);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it('regen pushes a depleted patch back toward capacity', () => {
    const lf = new LightField(8, 8, 800, 800);
    lf.init(new Rng(1), 4, 2, 1);
    const i = lf.patchIndex(400, 400);
    lf.depleteAt(400, 400, lf.light[i]!); // empty it
    const cap = lf.cap[i]!;
    lf.step(0, 0.5); // no diffusion, strong regen
    expect(lf.light[i]).toBeGreaterThan(0);
    expect(lf.light[i]).toBeLessThanOrEqual(cap + 1e-6);
  });

  it('pure diffusion (regen=0) conserves total light', () => {
    const lf = new LightField(8, 8, 800, 800);
    lf.init(new Rng(2), 4, 2, 1);
    const sum = (a: Float32Array): number => a.reduce((s, v) => s + v, 0);
    const before = sum(lf.light);
    lf.step(0.2, 0);
    expect(sum(lf.light)).toBeCloseTo(before, 3);
  });

  it('diffusion spreads toroidally across the wrap edge', () => {
    const lf = new LightField(8, 8, 800, 800);
    // hand-set a single spike at column 0, then check column 7 (wrapped neighbour)
    lf.cap.fill(0);
    lf.light.fill(0);
    lf.light[0] = 1; // row 0, col 0
    lf.step(0.2, 0);
    expect(lf.light[7]!).toBeGreaterThan(0); // wrapped left neighbour received light
  });
});
