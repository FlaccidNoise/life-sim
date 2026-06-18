import { describe, it, expect } from 'vitest';
import { NoiseField } from './noise-field';

describe('NoiseField', () => {
  it('starts empty and deposits into the patch under a position', () => {
    const noise = new NoiseField(4, 4, 400, 400); // 100-unit patches
    expect(noise.sampleAt(50, 50)).toBe(0);
    noise.depositAt(50, 50, 2);
    expect(noise.sampleAt(50, 50)).toBe(2);
    expect(noise.sampleAt(150, 50)).toBe(0); // different patch untouched
  });

  it('deposit equals loudnessGain·speed (caller computes the amount)', () => {
    const noise = new NoiseField(4, 4, 400, 400);
    const loudnessGain = 0.5;
    const speed = Math.hypot(3, 4); // 5
    noise.depositAt(50, 50, loudnessGain * speed);
    expect(noise.sampleAt(50, 50)).toBeCloseTo(2.5, 6);
  });

  it('step() diffuses to neighbours (toroidal) and decays; never negative', () => {
    const noise = new NoiseField(4, 4, 400, 400);
    noise.depositAt(150, 150, 16); // spike at patch (1,1)
    const before = noise.sampleAt(150, 150);
    noise.step(0.2, 0.1);
    expect(noise.sampleAt(150, 150)).toBeLessThan(before);
    expect(noise.sampleAt(50, 150)).toBeGreaterThan(0); // left neighbour got flux
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        expect(noise.sampleAt(c * 100 + 50, r * 100 + 50)).toBeGreaterThanOrEqual(0);
  });

  it('a moving source builds a readable gradient over ticks', () => {
    const noise = new NoiseField(16, 16, 1600, 1600);
    for (let t = 0; t < 200; t++) {
      noise.depositAt(800, 800, 3);
      noise.step(0.22, 0.05);
    }
    const centre = noise.sampleAt(800, 800);
    const oneOut = noise.sampleAt(900, 800);
    const threeOut = noise.sampleAt(1100, 800);
    expect(centre).toBeGreaterThan(oneOut);
    expect(oneOut).toBeGreaterThan(threeOut);
  });

  it('is reproducible — same inputs produce identical field values', () => {
    const a = new NoiseField(8, 8, 800, 800);
    const b = new NoiseField(8, 8, 800, 800);
    a.depositAt(100, 100, 10);
    b.depositAt(100, 100, 10);
    for (let t = 0; t < 20; t++) {
      a.step(0.15, 0.05);
      b.step(0.15, 0.05);
    }
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        expect(a.sampleAt(c * 100 + 50, r * 100 + 50)).toBe(b.sampleAt(c * 100 + 50, r * 100 + 50));
  });
});
