import { type SpatialHash } from '../spatial/spatial-hash';
import { wrapDelta } from '../math/vec2';

/**
 * Minimal short-range adhesion (§4.4) — gather form, mirrors computeRepulsion. Each
 * cell sums an attractive pull toward same-type cells of a DIFFERENT organism within
 * the band (ri+rj, range]. A no-op when `strength <= 0` (the default), so the verified
 * M2/M3 ecosystem is unperturbed. M5 has no bond FORMATION; this only nudges compatible
 * cells together (genome-gated formation-on-contact is M6). `range` must be ≤ ~2·hash
 * cellSize so the toroidal 3×3 query can see the partner. Allocation-free.
 */
export function computeAdhesion(
  hash: SpatialHash,
  posX: Float64Array,
  posY: Float64Array,
  radius: Float32Array,
  cellType: Uint8Array,
  organismId: Uint32Array,
  forceX: Float32Array,
  forceY: Float32Array,
  strength: number,
  range: number,
  width: number,
  height: number,
): void {
  if (strength <= 0) return;
  const { cols, rows, sorted, bucketStart } = hash;
  const liveCount = hash.liveCount;
  const range2 = range * range;

  for (let k = 0; k < liveCount; k++) {
    const i = sorted[k]!;
    const ti = cellType[i]!;
    const oi = organismId[i]!;
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
          if (cellType[j]! !== ti) continue; // minimal compatibility = same type
          const oj = organismId[j]!;
          if (oi !== 0 && oi === oj) continue; // already one organism → bonds cohere them
          const ddx = wrapDelta(xi - posX[j]!, width);
          const ddy = wrapDelta(yi - posY[j]!, height);
          const d2 = ddx * ddx + ddy * ddy;
          const rsum = ri + radius[j]!;
          if (d2 > rsum * rsum && d2 < range2) {
            const d = Math.sqrt(d2);
            const f = -strength / d; // attractive: pull i toward j
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
