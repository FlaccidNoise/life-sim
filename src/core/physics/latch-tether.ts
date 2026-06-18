import { isFlesh } from '../cells/types';
import { wrapDelta } from '../math/vec2';

/**
 * Latch tether (predation "attachment"). A PREDATOR that latched onto a prey last tick (metabolize
 * wrote `latchCell[i] = preyCell + 1`) is sprung toward that prey cell here, in the force pass, so a
 * mobile prey can't simply outswim the multi-tick drain — the predator is physically dragged along.
 * Scatter / Newton's 3rd (equal & opposite, like the bond springs), so a strong predator also drags
 * its prey and resists its escape (prey shake-off is a later phase). One-tick lag: latchCell is set
 * in metabolize (post-integrate) and consumed at the next tick's force pass — the same documented lag
 * as orientSensors. The prey handle is validated FLESH (a prey that died→MEAT or whose slot was
 * recycled drops the tether harmlessly until metabolize releases the latch). Allocation-free;
 * `predLatchStiffness = 0` → caller skips this kernel, so the M2-M7 economy is untouched.
 */
export function applyLatchTether(
  live: Uint32Array,
  n: number,
  latchCell: Uint32Array,
  cellType: Uint8Array,
  posX: Float64Array,
  posY: Float64Array,
  forceX: Float32Array,
  forceY: Float32Array,
  width: number,
  height: number,
  stiffness: number,
): void {
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const h = latchCell[i]!;
    if (h === 0) continue;
    const j = h - 1;
    if (!isFlesh(cellType[j]!)) continue; // prey died/decayed/recycled → no tether this tick
    const dx = wrapDelta(posX[j]! - posX[i]!, width);
    const dy = wrapDelta(posY[j]! - posY[i]!, height);
    const fx = stiffness * dx;
    const fy = stiffness * dy;
    forceX[i] = forceX[i]! + fx;
    forceY[i] = forceY[i]! + fy;
    forceX[j] = forceX[j]! - fx;
    forceY[j] = forceY[j]! - fy;
  }
}
