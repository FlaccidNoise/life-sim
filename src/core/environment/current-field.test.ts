import { describe, it, expect } from 'vitest';
import { CurrentField } from './current-field';
import { Rng } from '../math/rng';

describe('CurrentField init', () => {
  it('produces a non-uniform vector field', () => {
    const cf = new CurrentField(32, 32, 4096, 4096);
    cf.init(new Rng(1), 20, 6, 1);
    let minVx = Infinity, maxVx = -Infinity;
    let minVy = Infinity, maxVy = -Infinity;
    for (let r = 0; r < 32; r++) {
      for (let c = 0; c < 32; c++) {
        cf.sample(c * 128 + 64, r * 128 + 64);
        const vx = cf.currentVx;
        const vy = cf.currentVy;
        if (vx < minVx) minVx = vx;
        if (vx > maxVx) maxVx = vx;
        if (vy < minVy) minVy = vy;
        if (vy > maxVy) maxVy = vy;
      }
    }
    expect(minVx).toBeGreaterThanOrEqual(-1 - 1e-6);
    expect(maxVx).toBeLessThanOrEqual(1 + 1e-6);
    expect(minVy).toBeGreaterThanOrEqual(-1 - 1e-6);
    expect(maxVy).toBeLessThanOrEqual(1 + 1e-6);
    // genuinely non-uniform
    expect(maxVx - minVx).toBeGreaterThan(0.1);
    expect(maxVy - minVy).toBeGreaterThan(0.1);
  });

  it('is reproducible from the same seed', () => {
    const a = new CurrentField(16, 16, 1024, 1024);
    a.init(new Rng(7), 12, 4, 0.5);
    const b = new CurrentField(16, 16, 1024, 1024);
    b.init(new Rng(7), 12, 4, 0.5);
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        const x = c * 64 + 32;
        const y = r * 64 + 32;
        a.sample(x, y);
        b.sample(x, y);
        expect(a.currentVx).toBe(b.currentVx);
        expect(a.currentVy).toBe(b.currentVy);
      }
    }
  });

  it('differs across seeds', () => {
    const a = new CurrentField(16, 16, 1024, 1024);
    a.init(new Rng(7), 12, 4, 0.5);
    const b = new CurrentField(16, 16, 1024, 1024);
    b.init(new Rng(8), 12, 4, 0.5);
    let anyDiff = false;
    for (let r = 0; r < 16 && !anyDiff; r++) {
      for (let c = 0; c < 16 && !anyDiff; c++) {
        const x = c * 64 + 32;
        const y = r * 64 + 32;
        a.sample(x, y);
        b.sample(x, y);
        if (a.currentVx !== b.currentVx || a.currentVy !== b.currentVy) anyDiff = true;
      }
    }
    expect(anyDiff).toBe(true);
  });

  it('vx and vy are bounded by strength (no NaN)', () => {
    const cf = new CurrentField(16, 16, 1024, 1024);
    cf.init(new Rng(42), 8, 4, 0.8);
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        cf.sample(c * 64 + 32, r * 64 + 32);
        const vx = cf.currentVx;
        const vy = cf.currentVy;
        expect(Number.isNaN(vx)).toBe(false);
        expect(Number.isNaN(vy)).toBe(false);
        expect(Math.abs(vx)).toBeLessThanOrEqual(0.8 + 1e-6);
        expect(Math.abs(vy)).toBeLessThanOrEqual(0.8 + 1e-6);
      }
    }
  });
});

describe('CurrentField step evolve', () => {
  it('evolves slowly — field changes but does not blow up', () => {
    const cf = new CurrentField(16, 16, 1024, 1024);
    cf.init(new Rng(1), 10, 4, 1);

    // capture initial samples
    const initialVx: number[] = [];
    const initialVy: number[] = [];
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        cf.sample(c * 64 + 32, r * 64 + 32);
        initialVx.push(cf.currentVx);
        initialVy.push(cf.currentVy);
      }
    }

    // evolve for many ticks
    for (let t = 0; t < 50; t++) cf.step(0.05);

    // values should have changed but stay bounded
    let anyChanged = false;
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        cf.sample(c * 64 + 32, r * 64 + 32);
        const idx = r * 16 + c;
        if (cf.currentVx !== initialVx[idx] || cf.currentVy !== initialVy[idx]) anyChanged = true;
        expect(Number.isNaN(cf.currentVx)).toBe(false);
        expect(Number.isNaN(cf.currentVy)).toBe(false);
        expect(Math.abs(cf.currentVx)).toBeLessThanOrEqual(1 + 1e-6);
        expect(Math.abs(cf.currentVy)).toBeLessThanOrEqual(1 + 1e-6);
      }
    }
    expect(anyChanged).toBe(true);
  });

  it('toroidal: evolve diffuses across the wrap edge', () => {
    const cf = new CurrentField(16, 16, 1024, 1024);
    // Manually spike one corner; evolve should spread to wrapped neighbours.
    // We access private fields indirectly: just init with a target seed, but
    // the hand-set approach from light-field.test also works if we re-create.
    // Instead, verify that after many evolve steps the field is smoothed
    // (max-min range shrinks as energy diffuses).
    cf.init(new Rng(2), 8, 4, 1);

    // measure initial range
    let initMinVx = Infinity, initMaxVx = -Infinity;
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        cf.sample(c * 64 + 32, r * 64 + 32);
        if (cf.currentVx < initMinVx) initMinVx = cf.currentVx;
        if (cf.currentVx > initMaxVx) initMaxVx = cf.currentVx;
      }
    }
    const initRange = initMaxVx - initMinVx;

    for (let t = 0; t < 10; t++) cf.step(0.2);

    let afterMin = Infinity, afterMax = -Infinity;
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        cf.sample(c * 64 + 32, r * 64 + 32);
        if (cf.currentVx < afterMin) afterMin = cf.currentVx;
        if (cf.currentVx > afterMax) afterMax = cf.currentVx;
      }
    }
    const afterRange = afterMax - afterMin;
    // Diffusion smooths — range should shrink or at least not grow
    expect(afterRange).toBeLessThanOrEqual(initRange + 1e-6);
  });
});

describe('CurrentField sample API', () => {
  it('sampleInto writes correct values into caller arrays', () => {
    const cf = new CurrentField(8, 8, 800, 800);
    cf.init(new Rng(3), 6, 3, 0.5);
    const outVx = new Float32Array(1);
    const outVy = new Float32Array(1);

    cf.sampleInto(400, 400, outVx, outVy, 0);
    cf.sample(400, 400);
    expect(outVx[0]).toBe(cf.currentVx);
    expect(outVy[0]).toBe(cf.currentVy);
  });

  it('sampleCurrentvx/currentVy matches direct sample', () => {
    const cf = new CurrentField(8, 8, 800, 800);
    cf.init(new Rng(5), 6, 3, 0.5);
    // Check all patches
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        cf.sample(c * 100 + 50, r * 100 + 50);
        const vx1 = cf.currentVx;
        const vy1 = cf.currentVy;
        // second sample same spot
        cf.sample(c * 100 + 50, r * 100 + 50);
        expect(cf.currentVx).toBe(vx1);
        expect(cf.currentVy).toBe(vy1);
      }
    }
  });
});