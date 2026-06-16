import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../spatial/spatial-hash';
import { computeAdhesion } from './adhesion';
import { CellType } from '../cells/types';

function hashOf(posX: Float64Array, posY: Float64Array, n: number): SpatialHash {
  const h = new SpatialHash(300, 300, 20, 16); // 15×15 buckets, cellSize 20
  h.build(Uint32Array.from(Array.from({ length: n }, (_, i) => i)), n, posX, posY);
  return h;
}

describe('computeAdhesion — minimal short-range attraction (gather)', () => {
  it('is a no-op when strength is 0 (default — ecosystem unperturbed)', () => {
    const px = Float64Array.from([100, 118]);
    const py = Float64Array.from([100, 100]);
    const fx = new Float32Array(2);
    const fy = new Float32Array(2);
    const ct = Uint8Array.from([CellType.PHOTO, CellType.PHOTO]);
    const org = new Uint32Array(2);
    const rad = Float32Array.from([6, 6]);
    computeAdhesion(hashOf(px, py, 2), px, py, rad, ct, org, fx, fy, 0, 18, 300, 300);
    expect(fx[0]).toBe(0);
    expect(fx[1]).toBe(0);
  });

  it('attracts two same-type cells in the (contact, range] band', () => {
    // contact = 6+6 = 12; cells 14 apart → inside (12, 18]. Attraction pulls them together.
    const px = Float64Array.from([100, 114]);
    const py = Float64Array.from([100, 100]);
    const fx = new Float32Array(2);
    const fy = new Float32Array(2);
    const ct = Uint8Array.from([CellType.PHOTO, CellType.PHOTO]);
    const org = new Uint32Array(2);
    const rad = Float32Array.from([6, 6]);
    computeAdhesion(hashOf(px, py, 2), px, py, rad, ct, org, fx, fy, 5, 18, 300, 300);
    expect(fx[0]).toBeGreaterThan(0); // cell 0 pulled +x toward cell 1
    expect(fx[1]).toBeLessThan(0); // cell 1 pulled -x toward cell 0
  });

  it('does not attract different types, overlapping pairs, or out-of-range pairs', () => {
    const px = Float64Array.from([100, 114, 100, 100]);
    const py = Float64Array.from([100, 100, 105 /*overlap*/, 140 /*far*/]);
    const fx = new Float32Array(4);
    const fy = new Float32Array(4);
    const ct = Uint8Array.from([
      CellType.PHOTO,
      CellType.DIGESTIVE,
      CellType.PHOTO,
      CellType.PHOTO,
    ]);
    const org = new Uint32Array(4);
    const rad = Float32Array.from([6, 6, 6, 6]);
    computeAdhesion(hashOf(px, py, 4), px, py, rad, ct, org, fx, fy, 5, 18, 300, 300);
    // 0↔1 different type (no), 0↔2 overlapping <contact (no), 0↔3 dist 40 > range (no).
    expect(fx[0]).toBe(0);
    expect(fy[0]).toBe(0);
  });

  it('skips pairs already in the same organism (bonds handle their cohesion)', () => {
    const px = Float64Array.from([100, 114]);
    const py = Float64Array.from([100, 100]);
    const fx = new Float32Array(2);
    const fy = new Float32Array(2);
    const ct = Uint8Array.from([CellType.PHOTO, CellType.PHOTO]);
    const org = Uint32Array.from([7, 7]); // same organism
    const rad = Float32Array.from([6, 6]);
    computeAdhesion(hashOf(px, py, 2), px, py, rad, ct, org, fx, fy, 5, 18, 300, 300);
    expect(fx[0]).toBe(0);
  });
});
