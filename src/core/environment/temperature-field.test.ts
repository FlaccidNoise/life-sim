import { describe, it, expect } from 'vitest';
import { TemperatureField } from './temperature-field';
import { Rng } from '../math/rng';

describe('TemperatureField init', () => {
  it('produces a NON-uniform (patchy) field — the spatial-divergence gradient', () => {
    const tf = new TemperatureField(64, 64, 4096, 4096);
    tf.init(new Rng(42), 32, 6, 10, 35);
    let min = Infinity;
    let max = -Infinity;
    for (const v of tf.temp) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(10 - 1e-6);
    expect(max).toBeLessThanOrEqual(35 + 1e-6);
    expect(max - min).toBeGreaterThan(5); // genuinely patchy, not flat
  });

  it('is reproducible from the same seed and differs across seeds', () => {
    const a = new TemperatureField(32, 32, 4096, 4096);
    a.init(new Rng(7), 16, 4, 5, 40);
    const b = new TemperatureField(32, 32, 4096, 4096);
    b.init(new Rng(7), 16, 4, 5, 40);
    const c = new TemperatureField(32, 32, 4096, 4096);
    c.init(new Rng(8), 16, 4, 5, 40);
    expect(Array.from(a.temp)).toEqual(Array.from(b.temp));
    expect(Array.from(a.temp)).not.toEqual(Array.from(c.temp));
  });

  it('seeds capacity equal to the initial temperature after init', () => {
    const tf = new TemperatureField(16, 16, 1024, 1024);
    tf.init(new Rng(3), 8, 3, 0, 100);
    expect(Array.from(tf.cap)).toEqual(Array.from(tf.temp));
  });

  it('clamps to [tempMin, tempMax] inclusive', () => {
    const tf = new TemperatureField(16, 16, 1024, 1024);
    const tempMin = -20;
    const tempMax = 50;
    tf.init(new Rng(99), 20, 5, tempMin, tempMax);
    for (const v of tf.temp) {
      expect(v).toBeGreaterThanOrEqual(tempMin - 1e-6);
      expect(v).toBeLessThanOrEqual(tempMax + 1e-6);
    }
  });
});

describe('TemperatureField dynamics', () => {
  it('regen pulls a perturbed patch back toward its climate capacity', () => {
    const tf = new TemperatureField(8, 8, 800, 800);
    tf.init(new Rng(1), 4, 2, 10, 40);
    const i = tf.patchIndex(400, 400);
    const orig = tf.temp[i]!;
    // manually perturb the patch away from its cap
    tf.temp[i] = tf.cap[i]! + 20;
    const cap = tf.cap[i]!;
    tf.step(0, 0.5); // no diffusion, strong regen
    expect(Math.abs(tf.temp[i]! - cap)).toBeLessThan(Math.abs(orig + 20 - cap));
    expect(tf.temp[i]! - cap).toBeLessThan(20); // moved closer to cap
  });

  it('pure diffusion (regen=0) conserves total heat', () => {
    const tf = new TemperatureField(8, 8, 800, 800);
    tf.init(new Rng(2), 4, 2, 0, 100);
    const sum = (a: Float32Array): number => a.reduce((s, v) => s + v, 0);
    const before = sum(tf.temp);
    tf.step(0.2, 0);
    expect(sum(tf.temp)).toBeCloseTo(before, 3);
  });

  it('diffusion spreads toroidally across the wrap edge', () => {
    const tf = new TemperatureField(8, 8, 800, 800);
    // hand-set a single spike at column 0, then check column 7 (wrapped neighbour)
    tf.cap.fill(0);
    tf.temp.fill(0);
    tf.temp[0] = 1; // row 0, col 0
    tf.step(0.2, 0);
    expect(tf.temp[7]!).toBeGreaterThan(0); // wrapped left neighbour received heat
  });

  it('never produces NaN from toroidal diffusion', () => {
    const tf = new TemperatureField(64, 64, 4096, 4096);
    tf.init(new Rng(123), 32, 6, -10, 100);
    for (let t = 0; t < 100; t++) {
      tf.step(0.2, 0.1);
    }
    for (const v of tf.temp) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });
});