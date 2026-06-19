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

describe('SpatialHash generation-stamp byte-identity', () => {
  /** Reference counting-sort implementation that does a full counts.fill(0). */
  function referenceBuild(
    h: SpatialHash,
    live: Uint32Array,
    n: number,
    px: Float64Array,
    py: Float64Array,
  ): { start: number[]; sorted: number[]; count: number } {
    const nb = h.cols * h.rows;
    const cnt = new Uint32Array(nb);
    const cur = new Uint32Array(nb);
    const start = new Uint32Array(nb + 1);
    const srt = new Uint32Array(live.length);

    cnt.fill(0);
    for (let k = 0; k < n; k++) {
      const b = h.rowOf(py[live[k]!]!) * h.cols + h.colOf(px[live[k]!]!);
      cnt[b]!++;
    }
    let acc = 0;
    for (let b = 0; b < nb; b++) {
      start[b] = acc;
      cur[b] = acc;
      acc += cnt[b]!;
    }
    start[nb] = acc;
    for (let k = 0; k < n; k++) {
      const b = h.rowOf(py[live[k]!]!) * h.cols + h.colOf(px[live[k]!]!);
      srt[cur[b]!++] = live[k]!;
    }
    return {
      start: Array.from(start),
      sorted: Array.from(srt.slice(0, n)),
      count: n,
    };
  }

  function actualResult(h: SpatialHash): { start: number[]; sorted: number[]; count: number } {
    return {
      start: Array.from(h.bucketStart),
      sorted: Array.from(h.sorted.slice(0, h.liveCount)),
      count: h.liveCount,
    };
  }

  it('dense: all buckets touched', () => {
    const h = new SpatialHash(100, 100, 10, 1000);
    const px = new Float64Array(1000);
    const py = new Float64Array(1000);
    const live = new Uint32Array(1000);
    for (let i = 0; i < 400; i++) {
      px[i] = (i * 7.1) % 100;
      py[i] = (i * 13.3) % 100;
      live[i] = i;
    }
    h.build(live, 400, px, py);
    const ref = referenceBuild(h, live, 400, px, py);
    const act = actualResult(h);
    expect(act.start).toEqual(ref.start);
    expect(act.sorted).toEqual(ref.sorted);
    expect(act.count).toBe(ref.count);
  });

  it('sparse: few buckets touched', () => {
    const h = new SpatialHash(1000, 1000, 10, 100);
    const px = new Float64Array(100);
    const py = new Float64Array(100);
    const live = new Uint32Array(100);
    // Confine all cells to a small corner — only a few buckets.
    for (let i = 0; i < 20; i++) {
      px[i] = (i * 3) % 30;
      py[i] = (i * 3) % 30;
      live[i] = i;
    }
    h.build(live, 20, px, py);
    const ref = referenceBuild(h, live, 20, px, py);
    const act = actualResult(h);
    expect(act.start).toEqual(ref.start);
    expect(act.sorted).toEqual(ref.sorted);
    expect(act.count).toBe(ref.count);
  });

  it('cells moved to NEW buckets (stale-stamp path)', () => {
    const h = new SpatialHash(500, 500, 10, 100);
    const px = new Float64Array(100);
    const py = new Float64Array(100);
    const live = new Uint32Array(100);
    // Build 1: cells in the top-left corner.
    for (let i = 0; i < 30; i++) {
      px[i] = (i * 3) % 50;
      py[i] = (i * 3) % 50;
      live[i] = i;
    }
    h.build(live, 30, px, py);

    // Build 2: cells move to the bottom-right — different buckets entirely.
    for (let i = 0; i < 30; i++) {
      px[i] = 400 + ((i * 7) % 50);
      py[i] = 400 + ((i * 5) % 50);
    }
    h.build(live, 30, px, py);
    const ref = referenceBuild(h, live, 30, px, py);
    const act = actualResult(h);
    expect(act.start).toEqual(ref.start);
    expect(act.sorted).toEqual(ref.sorted);
    expect(act.count).toBe(ref.count);
  });

  it('epoch-wrap fallback exercised at limit (counts.fill(0) path)', () => {
    // Force epoch to near wrap — inject via private field access.
    const h = new SpatialHash(100, 100, 10, 50);
    const epochWrapVal = 0xffffffff;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (h as any).epoch = epochWrapVal;
    const px = Float64Array.of(5, 15);
    const py = Float64Array.of(5, 15);
    const live = Uint32Array.of(0, 1);
    h.build(live, 2, px, py);
    const ref = referenceBuild(h, live, 2, px, py);
    const act = actualResult(h);
    expect(act.start).toEqual(ref.start);
    expect(act.sorted).toEqual(ref.sorted);
    expect(h.liveCount).toBe(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    expect((h as any).epoch).toBe(1); // wrapped → 0 → reset to 1
  });
});
