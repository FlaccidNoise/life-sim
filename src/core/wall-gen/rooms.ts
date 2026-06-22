import { Rng } from '../rng';

/**
 * Wall-gen contract: write 0/1 into `solid` (full grid, row-major, TOROIDAL) hitting ~`density` solid
 * fraction, deterministic from `rng`. Matches carveNoise's signature so the generators are
 * interchangeable behind one interface.
 *
 * This generator: start fully SOLID, then stamp random axis-aligned rectangular rooms (carved OPEN) and
 * connect each room's centre to the previous one with an L-shaped open corridor. Rooms, corridors and
 * the join all wrap toroidally (modulo cols/rows). Stamping continues until the OPEN fraction reaches
 * ≈(1 − density), so denser inputs leave fewer/smaller rooms. Room and corridor cells overlap freely;
 * the loop re-checks the open fraction each room, so the final fraction lands a touch past the target.
 */
export function carveRooms(
  solid: Uint8Array,
  cols: number,
  rows: number,
  density: number,
  rng: Rng,
): void {
  solid.fill(1);
  const total = cols * rows;
  // Clamp to [0,total]: a no-op for density∈[0,1], but guards the loop against an out-of-range density
  // (density<0 would make targetOpen>total → the open<target loop could never terminate).
  const targetOpen = Math.max(0, Math.min(total, Math.round((1 - density) * total)));
  let open = 0;

  const carve = (x: number, y: number): void => {
    const i = (((y % rows) + rows) % rows) * cols + (((x % cols) + cols) % cols);
    if (solid[i]) {
      solid[i] = 0;
      open++;
    }
  };

  const maxRoom = Math.max(2, Math.round(Math.min(cols, rows) / 4));
  let prevX = -1;
  let prevY = -1;
  while (open < targetOpen) {
    const w = 1 + rng.int(maxRoom);
    const h = 1 + rng.int(maxRoom);
    const x0 = rng.int(cols);
    const y0 = rng.int(rows);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) carve(x0 + dx, y0 + dy);
    }
    const cx = x0 + (w >> 1);
    const cy = y0 + (h >> 1);
    if (prevX >= 0) {
      for (let x = Math.min(prevX, cx); x <= Math.max(prevX, cx); x++) carve(x, prevY);
      for (let y = Math.min(prevY, cy); y <= Math.max(prevY, cy); y++) carve(cx, y);
    }
    prevX = cx;
    prevY = cy;
  }
}
