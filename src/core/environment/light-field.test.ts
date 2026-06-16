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
