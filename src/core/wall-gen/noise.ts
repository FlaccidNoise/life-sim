import { Rng } from '../rng';

/**
 * Wall-gen contract: write 0/1 into `solid` (full grid, row-major, TOROIDAL) hitting ~`density` solid
 * fraction, deterministic from `rng`. The CA + rooms generators (and the Inc-7 region composite) match
 * this exact signature so they are interchangeable behind one interface.
 *
 * This generator: periodic value noise thresholded at the density-th quantile so exactly ~density of
 * cells become solid. The lattice wavelength is baked (≈12 cells) so the contract has no config coupling.
 */
export function carveNoise(
  solid: Uint8Array,
  cols: number,
  rows: number,
  density: number,
  rng: Rng,
): void {
  const latW = Math.max(2, Math.round(cols / 12));
  const latH = Math.max(2, Math.round(rows / 12));
  const lat = new Float32Array(latW * latH);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.float();
  const field = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const fy = (r / rows) * latH;
    const r0 = Math.floor(fy) % latH;
    const r1 = (r0 + 1) % latH;
    const ty = fy - Math.floor(fy);
    for (let c = 0; c < cols; c++) {
      const fx = (c / cols) * latW;
      const c0 = Math.floor(fx) % latW;
      const c1 = (c0 + 1) % latW;
      const tx = fx - Math.floor(fx);
      const v00 = lat[r0 * latW + c0]!;
      const v10 = lat[r0 * latW + c1]!;
      const v01 = lat[r1 * latW + c0]!;
      const v11 = lat[r1 * latW + c1]!;
      const top = v00 + (v10 - v00) * tx;
      const bot = v01 + (v11 - v01) * tx;
      field[r * cols + c] = top + (bot - top) * ty;
    }
  }
  const sortedCopy = Float32Array.from(field).sort();
  const threshold =
    sortedCopy[Math.min(sortedCopy.length - 1, Math.floor(density * sortedCopy.length))]!;
  for (let i = 0; i < field.length; i++) solid[i] = field[i]! < threshold ? 1 : 0;
}
