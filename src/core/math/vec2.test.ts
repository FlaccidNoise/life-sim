import { describe, it, expect } from 'vitest';
import { len, lenSq, wrap, wrapDelta, torusDist, lerpWrapped } from './vec2';

describe('vec2', () => {
  it('computes length', () => {
    expect(lenSq(3, 4)).toBe(25);
    expect(len(3, 4)).toBe(5);
  });

  it('wraps a coordinate into [0, span)', () => {
    expect(wrap(5, 4)).toBe(1);
    expect(wrap(-1, 4)).toBe(3);
    expect(wrap(0, 4)).toBe(0);
  });

  it('computes the shortest signed delta on a torus', () => {
    expect(wrapDelta(1, 10)).toBe(1);
    expect(wrapDelta(9, 10)).toBe(-1);
    expect(wrapDelta(-9, 10)).toBe(1);
  });

  it('computes toroidal distance across the wrap seam', () => {
    // points at x=1 and x=9 on a width-10 torus are 2 apart, not 8
    expect(torusDist(1, 0, 9, 0, 10, 10)).toBeCloseTo(2);
  });

  it('interpolates along the shortest toroidal path', () => {
    expect(lerpWrapped(2, 6, 0.5, 10)).toBeCloseTo(4); // direct midpoint
    expect(lerpWrapped(1, 9, 0.5, 10)).toBeCloseTo(0); // short path 1->0->9, midpoint at 0
    expect(lerpWrapped(8, 2, 0.25, 10)).toBeCloseTo(9); // wraps forward through the seam
  });
});
