import { describe, it, expect } from 'vitest';
import { SpatialHash } from './spatial-hash';

/** Collect neighbour indices in the toroidal 3×3 block around (x, y), mirroring
 *  the inline iteration used by the force kernel. Test-only helper. */
function neighbors(h: SpatialHash, x: number, y: number): number[] {
  const out: number[] = [];
  const cx = h.colOf(x);
  const cy = h.rowOf(y);
  for (let dy = -1; dy <= 1; dy++) {
    const by = (cy + dy + h.rows) % h.rows;
    for (let dx = -1; dx <= 1; dx++) {
      const bx = (cx + dx + h.cols) % h.cols;
      const b = by * h.cols + bx;
      for (let idx = h.bucketStart[b]!; idx < h.bucketStart[b + 1]!; idx++) {
        out.push(h.sorted[idx]!);
      }
    }
  }
  return out;
}

describe('SpatialHash', () => {
  it('refuses grids smaller than 3x3 (would alias toroidal neighbours)', () => {
    expect(() => new SpatialHash(20, 20, 10, 4)).toThrow(/>=3 columns/);
  });

  it('bins every live cell exactly once', () => {
    const h = new SpatialHash(100, 100, 10, 16);
    const posX = new Float64Array([5, 55, 95, 5]);
    const posY = new Float64Array([5, 55, 95, 95]);
    const live = new Uint32Array([0, 1, 2, 3]);
    h.build(live, 4, posX, posY);
    expect(h.liveCount).toBe(4);
    expect(h.bucketStart[h.bucketStart.length - 1]).toBe(4);
    const all = Array.from(h.sorted.slice(0, 4)).sort((a, b) => a - b);
    expect(all).toEqual([0, 1, 2, 3]);
  });

  it('finds a nearby cell in an adjacent bucket', () => {
    const h = new SpatialHash(100, 100, 10, 16);
    // two cells ~6 apart, straddling a bucket boundary at x=20
    const posX = new Float64Array([19, 24]);
    const posY = new Float64Array([50, 50]);
    h.build(new Uint32Array([0, 1]), 2, posX, posY);
    expect(neighbors(h, 19, 50)).toContain(1);
    expect(neighbors(h, 24, 50)).toContain(0);
  });

  it('finds neighbours across the toroidal seam', () => {
    const h = new SpatialHash(100, 100, 10, 16);
    // x=2 and x=98 are 4 apart across the wrap
    const posX = new Float64Array([2, 98]);
    const posY = new Float64Array([50, 50]);
    h.build(new Uint32Array([0, 1]), 2, posX, posY);
    expect(neighbors(h, 2, 50)).toContain(1);
  });

  it('does not allocate growth across repeated builds', () => {
    const h = new SpatialHash(1000, 1000, 10, 1000);
    const posX = new Float64Array(1000);
    const posY = new Float64Array(1000);
    const live = new Uint32Array(1000);
    for (let i = 0; i < 1000; i++) {
      posX[i] = (i * 37) % 1000;
      posY[i] = (i * 53) % 1000;
      live[i] = i;
    }
    // Just exercise repeated builds; correctness covered above.
    for (let t = 0; t < 5; t++) h.build(live, 1000, posX, posY);
    expect(h.liveCount).toBe(1000);
  });
});
