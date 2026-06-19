import { describe, it, expect } from 'vitest';
import { RockField } from '../environment/rock-field';
import { isOccluded } from './sight-occlusion';

function rocksWith(centers: Array<[number, number, number]>, w = 800, h = 800): RockField {
  const rf = new RockField(
    8,
    Math.max(3, Math.round(w / 64)),
    Math.max(3, Math.round(h / 64)),
    w,
    h,
  );
  for (let i = 0; i < centers.length; i++) {
    rf.cx[i] = centers[i]![0];
    rf.cy[i] = centers[i]![1];
    rf.radius[i] = centers[i]![2];
  }
  rf.rockCount = centers.length;
  rf.buildGrid();
  return rf;
}

describe('isOccluded — segment vs rock circle', () => {
  it('reports occluded when a rock sits on the sight line', () => {
    // eye at (400,400) looking +x toward a target 100 ahead; rock at (450,400) r=10 blocks it.
    const rocks = rocksWith([[450, 400, 10]]);
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(true);
  });

  it('reports clear when the rock is off to the side beyond its radius', () => {
    const rocks = rocksWith([[450, 430, 10]]); // 30 units off the line, r=10 → no block
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(false);
  });

  it('reports clear when the rock is behind the eye (s < 0)', () => {
    const rocks = rocksWith([[350, 400, 10]]); // behind the eye on the −x side
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(false);
  });

  it('reports clear when the rock is past the target (s > 1)', () => {
    const rocks = rocksWith([[520, 400, 10]]); // beyond the 100-unit target
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(false);
  });

  it('reports occluded when the rock straddles the toroidal seam', () => {
    // eye near the right edge looking +x across the wrap to a target on the left edge.
    // delta = +30 wraps from x=790 to x=20 (790+30=820 → 20). A rock at x=10 (wrapped pos 10),
    // y=400 r=8 sits at s≈0.67 on the wrapped segment and should occlude.
    const rocks = rocksWith([[10, 400, 8]]);
    expect(isOccluded(790, 400, 30, 0, rocks, 800, 800)).toBe(true);
  });

  it('reports clear across the seam when the rock is off the corridor', () => {
    const rocks = rocksWith([[10, 460, 8]]); // 60 units off the y of the seam-crossing line
    expect(isOccluded(790, 400, 30, 0, rocks, 800, 800)).toBe(false);
  });

  it('reports clear when rockCount is 0 (occlusion OFF)', () => {
    const rocks = rocksWith([]);
    expect(rocks.rockCount).toBe(0);
    expect(isOccluded(400, 400, 100, 0, rocks, 800, 800)).toBe(false);
  });

  it('returns false for a zero-length sight delta', () => {
    const rocks = rocksWith([[400, 400, 50]]);
    expect(isOccluded(400, 400, 0, 0, rocks, 800, 800)).toBe(false);
  });
});
