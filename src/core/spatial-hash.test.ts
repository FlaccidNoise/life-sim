import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { Rng } from './rng';

const W = 256;
const H = 256;
const CUTOFF = 24; // = 2·cellRadius

function wrapDelta(d: number, size: number): number {
  const h = size / 2;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}

function bruteNeighbors(store: OrganismStore, i: number): Set<number> {
  const out = new Set<number>();
  const { liveIndices, liveCount, x, y } = store;
  for (let k = 0; k < liveCount; k++) {
    const j = liveIndices[k]!;
    if (j === i) continue;
    const dx = wrapDelta(x[i]! - x[j]!, W);
    const dy = wrapDelta(y[i]! - y[j]!, H);
    if (dx * dx + dy * dy < CUTOFF * CUTOFF) out.add(j);
  }
  return out;
}

function hashNeighbors(hash: SpatialHash, store: OrganismStore, i: number): Set<number> {
  const out = new Set<number>();
  const xi = store.x[i]!;
  const yi = store.y[i]!;
  hash.forEachNeighbor(xi, yi, (j) => {
    if (j === i) return;
    const dx = wrapDelta(xi - store.x[j]!, W);
    const dy = wrapDelta(yi - store.y[j]!, H);
    if (dx * dx + dy * dy < CUTOFF * CUTOFF) out.add(j);
  });
  return out;
}

describe('SpatialHash', () => {
  it('3×3 query equals brute-force O(n²) for every organism (the gate)', () => {
    const store = new OrganismStore(500);
    const rng = new Rng(13);
    for (let k = 0; k < 400; k++) {
      const i = store.alloc();
      store.x[i] = rng.range(0, W);
      store.y[i] = rng.range(0, H);
    }
    store.rebuildLive();
    const hash = new SpatialHash(W, H, CUTOFF, 500);
    hash.build(store);
    for (let k = 0; k < store.liveCount; k++) {
      const i = store.liveIndices[k]!;
      expect(hashNeighbors(hash, store, i)).toEqual(bruteNeighbors(store, i));
    }
  });

  it('finds neighbors across the toroidal seam', () => {
    const store = new OrganismStore(8);
    const a = store.alloc(); // near the right/bottom edge
    store.x[a] = W - 2;
    store.y[a] = H - 2;
    const b = store.alloc(); // near the origin — a wrap-neighbor of a
    store.x[b] = 2;
    store.y[b] = 2;
    store.rebuildLive();
    const hash = new SpatialHash(W, H, CUTOFF, 8);
    hash.build(store);
    expect(hashNeighbors(hash, store, a).has(b)).toBe(true);
    expect(hashNeighbors(hash, store, b).has(a)).toBe(true);
  });

  it('reports occupancy stats matching the built population', () => {
    const store = new OrganismStore(16);
    // 3 creatures in one cell, 1 in another → 2 occupied buckets, maxBucket 3.
    for (let k = 0; k < 3; k++) {
      const i = store.alloc();
      store.x[i] = 10 + k;
      store.y[i] = 10;
    }
    const far = store.alloc();
    store.x[far] = 200;
    store.y[far] = 200;
    store.rebuildLive();
    const hash = new SpatialHash(W, H, CUTOFF, 16);
    hash.build(store);
    const st = hash.stats();
    expect(st.buckets).toBe(Math.floor(W / CUTOFF) * Math.floor(H / CUTOFF));
    expect(st.occupied).toBe(2);
    expect(st.maxBucket).toBe(3);
    expect(st.meanOccupied).toBeCloseTo(2, 6); // (3 + 1) / 2 occupied buckets
  });

  it('iterates neighbors in deterministic ascending-slot order within a cell', () => {
    const store = new OrganismStore(8);
    for (let k = 0; k < 5; k++) {
      const i = store.alloc();
      store.x[i] = 10 + k; // all in the same cell
      store.y[i] = 10;
    }
    store.rebuildLive();
    const hash = new SpatialHash(W, H, CUTOFF, 8);
    hash.build(store);
    const seen: number[] = [];
    hash.forEachNeighbor(12, 10, (j) => seen.push(j));
    const sortedCopy = [...seen].sort((p, q) => p - q);
    expect(seen).toEqual(sortedCopy);
  });
});
