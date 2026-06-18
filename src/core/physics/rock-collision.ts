import { type RockField } from '../environment/rock-field';
import { type CellArrays } from '../memory/cell-store';
import { wrapDelta } from '../math/vec2';

/**
 * Soft rock repulsion (gather formulation): each live cell queries nearby rocks
 * via the RockField's uniform grid and accumulates an outward force when it
 * overlaps a rock. Rocks are immovable (infinite mass) — only the cell is pushed.
 * Mirrors the 3×3 toroidal neighbour iteration of {@link computeRepulsion}.
 * Allocation-free.
 */
export function applyRockCollision(
  rockField: RockField,
  f: CellArrays,
  live: Uint32Array,
  n: number,
  repulsion: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const { gridCols, gridRows, bucketStart, sorted, cx, cy, radius: rockRadii } = rockField;

  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const xi = f.posX[i]!;
    const yi = f.posY[i]!;
    const ri = f.radius[i]!;
    let fx = f.forceX[i]!;
    let fy = f.forceY[i]!;

    const gx = rockField.colOf(xi);
    const gy = rockField.rowOf(yi);

    for (let dy = -1; dy <= 1; dy++) {
      const by = (gy + dy + gridRows) % gridRows;
      for (let dx = -1; dx <= 1; dx++) {
        const bx = (gx + dx + gridCols) % gridCols;
        const b = by * gridCols + bx;
        const end = bucketStart[b + 1]!;
        for (let idx = bucketStart[b]!; idx < end; idx++) {
          const j = sorted[idx]!;
          const ddx = wrapDelta(xi - cx[j]!, worldWidth);
          const ddy = wrapDelta(yi - cy[j]!, worldHeight);
          const rsum = ri + rockRadii[j]!;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 > 0 && d2 < rsum * rsum) {
            const d = Math.sqrt(d2);
            const fMag = (repulsion * (rsum - d)) / d;
            fx += ddx * fMag;
            fy += ddy * fMag;
          }
        }
      }
    }

    f.forceX[i] = fx;
    f.forceY[i] = fy;
  }
}