import { type CellArrays } from '../memory/cell-store';
import { type FoodField } from '../environment/food-field';
import { CellType } from './types';
import { wrap } from '../math/vec2';

/**
 * SENSE step (§4.3 step 2). Generic scalar-field → gradient-vector sampler: for
 * each sensor-capable cell (MOTILE), central finite-difference of the food field
 * one patch-width apart (toroidal), written to (senseX, senseY). Reads the food
 * field as updated at the END of the previous tick (documented one-tick coupling).
 * Allocation-free; scalar/array params only (§5.1 DAG); MOTILE-only so it is cheap.
 */
export function sense(live: Uint32Array, n: number, f: CellArrays, food: FoodField): void {
  const hx = food.patchW;
  const hy = food.patchH;
  const w = food.worldWidth;
  const h = food.worldHeight;
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    if (f.cellType[i]! !== CellType.MOTILE) continue;
    const x = f.posX[i]!;
    const y = f.posY[i]!;
    const gx = food.sampleAt(wrap(x + hx, w), y) - food.sampleAt(wrap(x - hx, w), y);
    const gy = food.sampleAt(x, wrap(y + hy, h)) - food.sampleAt(x, wrap(y - hy, h));
    f.senseX[i] = gx;
    f.senseY[i] = gy;
  }
}
