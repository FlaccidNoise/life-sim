import { type SpatialHash } from '../spatial/spatial-hash';
import { type LightField } from '../environment/light-field';
import { type CellArrays } from '../memory/cell-store';
import { CellType, isEdibleBy } from './types';
import { wrapDelta } from '../math/vec2';

/**
 * METABOLIZE step (§4.3). Allocation-free; the OUTER eater loop runs in canonical
 * ascending live-slot order. Takes scalar economy params (not Config) to keep the
 * cells/ layer off sim/ (§5.1 DAG), matching computeRepulsion/integrate.
 * - PHOTO: gain = photoGain · localLight · area; depletes the local patch.
 * - DIGESTIVE/MOTILE: extracts up to digestRate from the FIRST edible (PHOTO/MEAT)
 *   neighbour found within (ri+rj), scanned in fixed toroidal 3×3 bucket order
 *   (dy=-1..1, dx=-1..1) then ascending within-bucket order — deterministic, but
 *   NOT necessarily the lowest-slot prey. Keeps digestEfficiency of what it takes.
 * - All living cells pay basalCost · area + moveCost · thrust². MEAT loses meatDecay per tick.
 * Death and division happen later (lifecycle); this step only moves energy/light.
 */
export function metabolize(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  hash: SpatialHash,
  light: LightField,
  photoGain: number,
  photoDepletion: number,
  digestRate: number,
  digestEfficiency: number,
  basalCost: number,
  meatDecay: number,
  moveCost: number,
): void {
  const { cols, rows, width, height, sorted, bucketStart } = hash;

  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const type = f.cellType[i]!;

    if (type === CellType.MEAT) {
      f.energy[i] = f.energy[i]! - meatDecay;
      continue;
    }

    const ri = f.radius[i]!;
    const area = ri * ri;

    if (type === CellType.PHOTO) {
      const xi = f.posX[i]!;
      const yi = f.posY[i]!;
      const gain = photoGain * light.sampleAt(xi, yi) * area;
      if (gain > 0) {
        f.energy[i] = f.energy[i]! + gain;
        light.depleteAt(xi, yi, gain * photoDepletion);
      }
    } else if (type === CellType.DIGESTIVE || type === CellType.MOTILE) {
      const xi = f.posX[i]!;
      const yi = f.posY[i]!;
      const cx = hash.colOf(xi);
      const cy = hash.rowOf(yi);
      let eaten = false;
      for (let dy = -1; dy <= 1 && !eaten; dy++) {
        const by = (cy + dy + rows) % rows;
        for (let dx = -1; dx <= 1 && !eaten; dx++) {
          const bx = (cx + dx + cols) % cols;
          const b = by * cols + bx;
          const end = bucketStart[b + 1]!;
          for (let idx = bucketStart[b]!; idx < end; idx++) {
            const j = sorted[idx]!;
            if (j === i) continue;
            if (!isEdibleBy(type, f.cellType[j]!)) continue;
            const ddx = wrapDelta(xi - f.posX[j]!, width);
            const ddy = wrapDelta(yi - f.posY[j]!, height);
            const rsum = ri + f.radius[j]!;
            if (ddx * ddx + ddy * ddy < rsum * rsum) {
              const avail = f.energy[j]!;
              const extracted = avail < digestRate ? avail : digestRate;
              if (extracted > 0) {
                f.energy[j] = avail - extracted;
                f.energy[i] = f.energy[i]! + extracted * digestEfficiency;
                eaten = true;
                break;
              }
            }
          }
        }
      }
    }

    // basal cost for all living cells, plus movement cost ∝ thrust² (0 for non-movers)
    const th = f.thrust[i]!;
    f.energy[i] = f.energy[i]! - basalCost * area - moveCost * th * th;
  }
}
