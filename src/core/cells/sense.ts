import { type CellArrays } from '../memory/cell-store';
import { type FoodField } from '../environment/food-field';
import { CellType } from './types';
import { wrap } from '../math/vec2';

/**
 * SENSE step (§4.3 step 2). Generic scalar-field → gradient-vector sampler: for each sensor-capable
 * cell (MOTILE and SENSOR), central finite-difference of a smell field one patch-width apart
 * (toroidal), written to (senseX, senseY). Reads the field as updated at the END of the previous
 * tick (documented one-tick coupling). Allocation-free; scalar/array params only (§5.1 DAG).
 *
 * Diet routing (ecology pass): a SENSOR cell belonging to a CARNIVORE organism reads `preyField`
 * (the prey-scent gradient → it hunts foragers); every other sensor (herbivore foragers + free
 * MOTILE cells) reads the plant/food field. The carnivore lookup is structural (organismId →
 * organisms.carnivore), never lineage. Both fields share grid geometry, so the FD steps are identical.
 */
export function sense(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  food: FoodField,
  preyField: FoodField,
  carnivore: Uint8Array,
): void {
  const hx = food.patchW;
  const hy = food.patchH;
  const w = food.worldWidth;
  const h = food.worldHeight;
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const ct = f.cellType[i]!;
    if (ct !== CellType.MOTILE && ct !== CellType.SENSOR) continue;
    const org = f.organismId[i]!;
    const field = ct === CellType.SENSOR && org !== 0 && carnivore[org] === 1 ? preyField : food;
    const x = f.posX[i]!;
    const y = f.posY[i]!;
    const gx = field.sampleAt(wrap(x + hx, w), y) - field.sampleAt(wrap(x - hx, w), y);
    const gy = field.sampleAt(x, wrap(y + hy, h)) - field.sampleAt(x, wrap(y - hy, h));
    f.senseX[i] = gx;
    f.senseY[i] = gy;
  }
}
