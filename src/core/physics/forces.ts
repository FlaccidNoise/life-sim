import { type SpatialHash } from '../spatial/spatial-hash';
import { wrapDelta } from '../math/vec2';

/**
 * Soft-repulsion forces (gather formulation): each live cell sums outward forces
 * from neighbours it overlaps. No closures, no allocation — iterates the hash's
 * toroidal 3×3 buckets inline. Requires the hash to have ≥3 columns/rows so the
 * 3×3 block does not alias a bucket onto itself (true for any real world size).
 */
export function computeRepulsion(
  hash: SpatialHash,
  posX: Float64Array,
  posY: Float64Array,
  radius: Float32Array,
  forceX: Float32Array,
  forceY: Float32Array,
  stiffness: number,
): void {
  const { cols, rows, width, height, sorted, bucketStart } = hash;
  const liveCount = hash.liveCount;

  for (let k = 0; k < liveCount; k++) {
    const i = sorted[k]!;
    const xi = posX[i]!;
    const yi = posY[i]!;
    const ri = radius[i]!;
    const cx = hash.colOf(xi);
    const cy = hash.rowOf(yi);
    let fx = forceX[i]!;
    let fy = forceY[i]!;

    for (let dy = -1; dy <= 1; dy++) {
      const by = (cy + dy + rows) % rows;
      for (let dx = -1; dx <= 1; dx++) {
        const bx = (cx + dx + cols) % cols;
        const b = by * cols + bx;
        const end = bucketStart[b + 1]!;
        for (let idx = bucketStart[b]!; idx < end; idx++) {
          const j = sorted[idx]!;
          if (j === i) continue;
          const ddx = wrapDelta(xi - posX[j]!, width);
          const ddy = wrapDelta(yi - posY[j]!, height);
          const rsum = ri + radius[j]!;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > 0 && d2 < rsum * rsum) {
            const d = Math.sqrt(d2);
            const f = (stiffness * (rsum - d)) / d;
            fx += ddx * f;
            fy += ddy * f;
          }
        }
      }
    }

    forceX[i] = fx;
    forceY[i] = fy;
  }
}
