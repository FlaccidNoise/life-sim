import { Rng } from '../rng';

/**
 * Wall-gen contract: write 0/1 into `solid` (full grid, row-major, TOROIDAL) hitting ~`density` solid
 * fraction, deterministic from `rng`. Matches carveNoise's signature so the generators are
 * interchangeable behind one interface.
 *
 * This generator: random-fill each cell solid with probability `density`, then run 4 smoothing passes
 * of the classic 4-5 cave rule — a cell becomes solid when ≥5 of its 8 toroidal neighbours are solid,
 * open when ≤3, and keeps its state on a 4-tie. The smoothing erodes specks and grows connected caverns,
 * which shifts the final solid fraction away from the input `density`.
 */
export function carveCA(
  solid: Uint8Array,
  cols: number,
  rows: number,
  density: number,
  rng: Rng,
): void {
  for (let i = 0; i < solid.length; i++) solid[i] = rng.float() < density ? 1 : 0;
  let cur: Uint8Array = solid;
  let next: Uint8Array = new Uint8Array(solid.length);
  for (let pass = 0; pass < 4; pass++) {
    for (let r = 0; r < rows; r++) {
      const rUp = ((r - 1 + rows) % rows) * cols;
      const rMid = r * cols;
      const rDn = ((r + 1) % rows) * cols;
      for (let c = 0; c < cols; c++) {
        const cL = (c - 1 + cols) % cols;
        const cR = (c + 1) % cols;
        const n =
          cur[rUp + cL]! +
          cur[rUp + c]! +
          cur[rUp + cR]! +
          cur[rMid + cL]! +
          cur[rMid + cR]! +
          cur[rDn + cL]! +
          cur[rDn + c]! +
          cur[rDn + cR]!;
        next[rMid + c] = n >= 5 ? 1 : n <= 3 ? 0 : cur[rMid + c]!;
      }
    }
    const swap = cur;
    cur = next;
    next = swap;
  }
  if (cur !== solid) solid.set(cur);
}
