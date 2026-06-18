import { type CurrentField } from '../environment/current-field';
import { type CellArrays } from '../memory/cell-store';

/**
 * Apply current drift force to each live cell. For each cell, sample the current
 * vector at its position and add `strength * (vx, vy)` to its force accumulator.
 * Allocation-free — iterates the compact live list and reads the field's `sample`
 * scratch (currentVx/currentVy) inline.
 *
 * Cells in a current get pushed; the integrator + drag turn the drift into a
 * net displacement. Down-current locomotion is cheaper, up-current harder.
 */
export function applyCurrent(
  current: CurrentField,
  f: CellArrays,
  live: Uint32Array,
  n: number,
  strength: number,
): void {
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const x = f.posX[i]!;
    const y = f.posY[i]!;
    current.sample(x, y);
    f.forceX[i] = f.forceX[i]! + strength * current.currentVx;
    f.forceY[i] = f.forceY[i]! + strength * current.currentVy;
  }
}
