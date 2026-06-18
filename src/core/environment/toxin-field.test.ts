import { describe, it, expect } from 'vitest';
import { ToxinField } from './toxin-field';

describe('ToxinField', () => {
  it('starts empty and deposits into the patch under a position', () => {
    const toxin = new ToxinField(4, 4, 400, 400);
    expect(toxin.sampleAt(50, 50)).toBe(0);
    toxin.depositAt(50, 50, 2);
    expect(toxin.sampleAt(50, 50)).toBe(2);
    expect(toxin.sampleAt(150, 50)).toBe(0);
  });

  it('patchW/patchH are world units per patch', () => {
    const toxin = new ToxinField(4, 4, 400, 200);
    expect(toxin.patchW).toBe(100);
    expect(toxin.patchH).toBe(50);
  });

  it('step() decays and diffuses toward neighbours (toroidal); mass spreads, decays', () => {
    const toxin = new ToxinField(4, 4, 400, 400);
    toxin.depositAt(150, 150, 16);
    const before = toxin.sampleAt(150, 150);
    toxin.step(0.2, 0.1);
    expect(toxin.sampleAt(150, 150)).toBeLessThan(before);
    expect(toxin.sampleAt(50, 150)).toBeGreaterThan(0);
  });

  it('step() never goes negative', () => {
    const toxin = new ToxinField(4, 4, 400, 400);
    toxin.depositAt(50, 50, 5);
    for (let i = 0; i < 50; i++) toxin.step(0.2, 0.1);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        expect(toxin.sampleAt(c * 100 + 50, r * 100 + 50)).toBeGreaterThanOrEqual(0);
  });

  it('persistent deposits build a multi-patch gradient', () => {
    const toxin = new ToxinField(16, 16, 1600, 1600);
    for (let t = 0; t < 300; t++) {
      toxin.depositAt(800, 800, 4);
      toxin.step(0.22, 0.03);
    }
    const centre = toxin.sampleAt(800, 800);
    const oneOut = toxin.sampleAt(900, 800);
    const threeOut = toxin.sampleAt(1100, 800);
    expect(centre).toBeGreaterThan(oneOut);
    expect(oneOut).toBeGreaterThan(threeOut);
    expect(threeOut).toBeGreaterThan(0);
  });

  it('toroidal wrap: near-edge deposit diffuses across the wrap', () => {
    const toxin = new ToxinField(4, 4, 400, 400);
    toxin.depositAt(50, 50, 16); // patch (0, 0)
    toxin.step(0.25, 0);
    // wrapped left neighbour (patch 3, 0)
    expect(toxin.sampleAt(350, 50)).toBeGreaterThan(0);
    // wrapped top neighbour (patch 0, 3)
    expect(toxin.sampleAt(50, 350)).toBeGreaterThan(0);
  });
});