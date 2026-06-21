/**
 * Phase 1 physics kernels — soft repulsion + symplectic-Euler integration. Allocation-free hot loops
 * (inline the spatial-hash 3×3 scan, no per-call closures), ascending live-slot order for determinism.
 */
import { type OrganismStore } from './store';
import { type SpatialHash } from './spatial-hash';
import { ScalarGene, SCALAR_GENE_COUNT } from './genome';

/** Shortest signed delta a→b on a torus of the given size (|result| ≤ size/2). */
function wrapDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}

/**
 * Soft repulsion: each organism is pushed away from neighbors it overlaps (center distance <
 * 2·cellRadius), force = repulsion · overlap along the separation axis. ACCUMULATES (+=) into the
 * force buffer on top of whatever the steering thrust already set. Toroidal-correct via wrapDelta.
 */
export function computeRepulsion(
  store: OrganismStore,
  hash: SpatialHash,
  cellRadius: number,
  repulsion: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const { liveIndices, liveCount, x, y, forceX, forceY } = store;
  const { cols, rows, bucketStart, sorted } = hash;
  const cutoff = 2 * cellRadius;
  const cutoff2 = cutoff * cutoff;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const xi = x[i]!;
    const yi = y[i]!;
    const cx = hash.colOf(xi);
    const cy = hash.rowOf(yi);
    let fx = 0;
    let fy = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const by = (cy + dy + rows) % rows;
      for (let dx = -1; dx <= 1; dx++) {
        const bx = (cx + dx + cols) % cols;
        const b = by * cols + bx;
        const end = bucketStart[b + 1]!;
        for (let idx = bucketStart[b]!; idx < end; idx++) {
          const j = sorted[idx]!;
          if (j === i) continue;
          const ddx = wrapDelta(xi - x[j]!, worldWidth);
          const ddy = wrapDelta(yi - y[j]!, worldHeight);
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= cutoff2 || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const overlap = cutoff - d;
          const inv = 1 / d;
          fx += repulsion * overlap * ddx * inv;
          fy += repulsion * overlap * ddy * inv;
        }
      }
    }
    forceX[i] = forceX[i]! + fx;
    forceY[i] = forceY[i]! + fy;
  }
}

/**
 * Symplectic-Euler integration: v ← (v + force·dt)·damping, optionally clamped to each creature's OWN
 * maxSpeed GENE (its evolved speed ceiling), then x ← wrap(x + v·dt). Mass is unit in Phase 1.
 * Ascending live-slot order. The per-creature ceiling is bounded by the gene's clamp range, so it still
 * caps repulsion blow-ups (stability) while letting a fast lineage outrun a slow one.
 */
export function integrate(
  store: OrganismStore,
  dt: number,
  damping: number,
  stabilityClamp: boolean,
  worldWidth: number,
  worldHeight: number,
): void {
  const { liveIndices, liveCount, x, y, vx, vy, forceX, forceY, scalarGenes } = store;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    let nvx = (vx[i]! + forceX[i]! * dt) * damping;
    let nvy = (vy[i]! + forceY[i]! * dt) * damping;
    if (stabilityClamp) {
      const maxSpeed = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED]!;
      const s2 = nvx * nvx + nvy * nvy;
      if (s2 > maxSpeed * maxSpeed) {
        const scale = maxSpeed / Math.sqrt(s2);
        nvx *= scale;
        nvy *= scale;
      }
    }
    vx[i] = nvx;
    vy[i] = nvy;
    let px = x[i]! + nvx * dt;
    let py = y[i]! + nvy * dt;
    px %= worldWidth;
    if (px < 0) px += worldWidth;
    py %= worldHeight;
    if (py < 0) py += worldHeight;
    x[i] = px;
    y[i] = py;
  }
}
