import { isFlesh } from '../cells/types';
import { wrapDelta } from '../math/vec2';

/**
 * Latch tether (predation "attachment"). A PREDATOR that latched onto a prey last tick (metabolize
 * wrote `latchCell[i] = preyCell + 1`) is sprung toward that prey cell here, in the force pass, so a
 * mobile prey can't simply outswim the multi-tick drain — the predator is physically dragged along.
 * Scatter / Newton's 3rd (equal & opposite, like the bond springs), so a strong predator also drags
 * its prey and resists its escape (prey shake-off is a later phase). One-tick lag: latchCell is set
 * in metabolize (post-integrate) and consumed at the next tick's force pass — the same documented lag
 * as orientSensors. The handle is validated two ways before springing: the cell must still be FLESH,
 * AND still belong to the latched prey organism (`organismId[j] === latchPrey[i]`). The org check
 * closes a one-tick recycle window — a prey cell that died and had its slot reused by an unrelated
 * newborn's flesh cell between metabolize and this pass would otherwise mis-tether the predator to a
 * stranger. Either check failing drops the tether harmlessly until metabolize releases the latch.
 * Allocation-free; `predLatchStiffness = 0` → caller skips this kernel, so the M2-M7 economy is
 * untouched. The identity check is structural (organismId, like bonds), never lineage/fitness.
 */
export function applyLatchTether(
  live: Uint32Array,
  n: number,
  latchCell: Uint32Array,
  latchPrey: Uint32Array,
  cellType: Uint8Array,
  organismId: Uint32Array,
  radius: Float32Array,
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
    if (organismId[j]! !== latchPrey[i]!) continue; // slot recycled to a different org → stale handle
    const dx = wrapDelta(posX[j]! - posX[i]!, width);
    const dy = wrapDelta(posY[j]! - posY[i]!, height);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= 0) continue;
    // Spring with REST LENGTH at contact (ri+rj) — like a bond, NOT a pull-to-zero (which fought
    // repulsion and shook both bodies apart). Holds the predator at the prey's surface so the drain
    // continues; when overlapping (dist<rest) the term goes negative and merely reinforces repulsion.
    const rest = radius[i]! + radius[j]!;
    const f = (stiffness * (dist - rest)) / dist; // /dist normalises (dx,dy) to a unit direction
    const fx = f * dx;
    const fy = f * dy;
    forceX[i] = forceX[i]! + fx;
    forceY[i] = forceY[i]! + fy;
    forceX[j] = forceX[j]! - fx;
    forceY[j] = forceY[j]! - fy;
  }
}
