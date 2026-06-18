import { describe, it, expect } from 'vitest';
import { GlowField } from './glow-field';

describe('GlowField', () => {
  it('starts empty and deposits into the patch under a position', () => {
    const glow = new GlowField(4, 4, 400, 400); // 100-unit patches
    expect(glow.sampleAt(50, 50)).toBe(0);
    glow.depositAt(50, 50, 2);
    expect(glow.sampleAt(50, 50)).toBe(2);
    expect(glow.sampleAt(150, 50)).toBe(0); // different patch untouched
  });

  it('patchW/patchH are world units per patch', () => {
    const glow = new GlowField(4, 4, 400, 200);
    expect(glow.patchW).toBe(100);
    expect(glow.patchH).toBe(50);
  });

  it('step() decays and diffuses toward neighbours (toroidal); mass spreads, decays', () => {
    const glow = new GlowField(4, 4, 400, 400);
    glow.depositAt(150, 150, 16); // single spike at patch (1,1)
    const before = glow.sampleAt(150, 150);
    glow.step(0.2, 0.1);
    expect(glow.sampleAt(150, 150)).toBeLessThan(before);
    expect(glow.sampleAt(50, 150)).toBeGreaterThan(0); // left neighbour received flux
  });

  it('step() conserves nothing exactly but never goes negative', () => {
    const glow = new GlowField(4, 4, 400, 400);
    glow.depositAt(50, 50, 5);
    for (let i = 0; i < 50; i++) glow.step(0.2, 0.1);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        expect(glow.sampleAt(c * 100 + 50, r * 100 + 50)).toBeGreaterThanOrEqual(0);
  });

  it('a PERSISTENT source builds a multi-patch gradient (field is NOT cleared per tick)', () => {
    const glow = new GlowField(16, 16, 1600, 1600); // 100-unit patches
    for (let t = 0; t < 300; t++) {
      glow.depositAt(800, 800, 4); // centre patch
      glow.step(0.22, 0.03);
    }
    const centre = glow.sampleAt(800, 800);
    const oneOut = glow.sampleAt(900, 800);
    const threeOut = glow.sampleAt(1100, 800);
    expect(centre).toBeGreaterThan(oneOut);
    expect(oneOut).toBeGreaterThan(threeOut);
    expect(threeOut).toBeGreaterThan(0);
  });

  it('is reproducible — same inputs produce identical field values', () => {
    const a = new GlowField(8, 8, 800, 800);
    const b = new GlowField(8, 8, 800, 800);
    a.depositAt(100, 100, 10);
    b.depositAt(100, 100, 10);
    for (let t = 0; t < 20; t++) {
      a.step(0.15, 0.05);
      b.step(0.15, 0.05);
    }
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        expect(a.sampleAt(c * 100 + 50, r * 100 + 50)).toBe(
          b.sampleAt(c * 100 + 50, r * 100 + 50),
        );
  });
});