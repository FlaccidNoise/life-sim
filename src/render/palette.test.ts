import { describe, it, expect } from 'vitest';
import { PALETTE, PALETTE_VEC3, hexToVec3 } from './palette';

describe('palette', () => {
  it('every PALETTE entry is a 6-digit hex colour', () => {
    for (const [key, hex] of Object.entries(PALETTE)) {
      expect(hex).toMatch(/^#[0-9a-fA-F]{6}$/);
      void key;
    }
  });

  it('hexToVec3 converts hex to normalized [0,1] vec3', () => {
    expect(hexToVec3('#000000')).toEqual([0, 0, 0]);
    expect(hexToVec3('#ffffff')).toEqual([1, 1, 1]);
    expect(hexToVec3('#ff0080')).toEqual([1, 0, 128 / 255]);
  });

  it('PALETTE_VEC3 entries are valid vec3 literals matching PALETTE', () => {
    for (const key of Object.keys(PALETTE) as (keyof typeof PALETTE)[]) {
      const lit = PALETTE_VEC3[key];
      expect(lit).toMatch(/^vec3\(/);
      expect(lit.endsWith(')')).toBe(true);
      // The three numbers inside should round-trip to the palette hex.
      const nums = lit.match(/vec3\(([^)]+)\)/)![1]!.split(',').map(Number);
      const [r, g, b] = hexToVec3(PALETTE[key]);
      expect(nums[0]).toBeCloseTo(r, 4);
      expect(nums[1]).toBeCloseTo(g, 4);
      expect(nums[2]).toBeCloseTo(b, 4);
    }
  });

  it('MOTILE is distinct from the UI accent cyan (#5fd9ff)', () => {
    // The whole point of the palette split: swimming cells must not read as UI chrome.
    expect(PALETTE.motile).not.toBe('#5fd9ff');
    const [mr, mg, mb] = hexToVec3(PALETTE.motile);
    const [ar, ag, ab] = hexToVec3('#5fd9ff');
    // A meaningful perceptual gap, not an off-by-one.
    const dist = Math.hypot(mr - ar, mg - ag, mb - ab);
    expect(dist).toBeGreaterThan(0.05);
  });
});
