import { type RockField } from '../environment/rock-field';
import { wrapDelta } from '../math/vec2';

/**
 * True if any rock occludes the sight segment from the eye to a target at toroidal delta (dx,dy).
 * Closest-point-on-segment-to-rock-center test: a rock of radius rr occludes iff the segment passes
 * within rr of its center. Toroidal; allocation-free; scans rocks in the corridor via the rock grid
 * (canonical bucket order with the same half-grid seam guard as the sight cone). OFF when rockCount 0.
 *
 * Geometry: the sight segment is P(s) = (eyeX,eyeY) + s·(dx,dy), s ∈ [0,1]. The rock center relative
 * to the eye is taken in the eye's local frame via wrapDelta (same frame as (dx,dy)). The closest
 * point on the segment is at s = clamp((rcx·dx + rcy·dy)/|d|², 0, 1); clamping to [0,1] means a rock
 * BEHIND the eye (s→0) or PAST the target (s→1) only blocks if the corresponding endpoint is itself
 * within rr. gap² = (rcx − s·dx)² + (rcy − s·dy)²; occluded iff gap² < rr².
 */
export function isOccluded(
  eyeX: number,
  eyeY: number,
  dx: number,
  dy: number,
  rocks: RockField,
  worldWidth: number,
  worldHeight: number,
): boolean {
  if (rocks.rockCount === 0) return false;
  const seg2 = dx * dx + dy * dy;
  if (seg2 === 0) return false;

  // Corridor bbox in world coords: eye and eye+delta (delta is in the eye's local frame; recover the
  // target's wrapped world position for grid lookup).
  const tgtX = (((eyeX + dx) % worldWidth) + worldWidth) % worldWidth;
  const tgtY = (((eyeY + dy) % worldHeight) + worldHeight) % worldHeight;

  const cols = rocks.gridCols;
  const rows = rocks.gridRows;
  const halfCols = (cols - 1) / 2;
  const halfRows = (rows - 1) / 2;
  const cellW = worldWidth / cols;
  const cellH = worldHeight / rows;

  const ce = rocks.colOf(eyeX);
  const re = rocks.rowOf(eyeY);
  const ct = rocks.colOf(tgtX);
  const rt = rocks.rowOf(tgtY);

  // Bucket offset span covering both endpoints (+1 ring for rocks straddling a boundary). Use the
  // signed wrapped column/row difference so a seam-crossing corridor still spans the right buckets.
  const colSpan = Math.abs(wrapDelta((ct - ce) * cellW, worldWidth)) / cellW;
  const rowSpan = Math.abs(wrapDelta((rt - re) * cellH, worldHeight)) / cellH;
  const Rc = Math.ceil(colSpan) + 1;
  const Rr = Math.ceil(rowSpan) + 1;

  for (let dyOff = -Rr; dyOff <= Rr; dyOff++) {
    if (dyOff > halfRows || dyOff < -halfRows) continue; // seam guard (row): bucket already visited
    const by = (((re + dyOff) % rows) + rows) % rows;
    for (let dxOff = -Rc; dxOff <= Rc; dxOff++) {
      if (dxOff > halfCols || dxOff < -halfCols) continue; // seam guard (col): bucket already visited
      const bx = (((ce + dxOff) % cols) + cols) % cols;
      const b = by * cols + bx;
      const end = rocks.bucketStart[b + 1]!;
      for (let idx = rocks.bucketStart[b]!; idx < end; idx++) {
        const rk = rocks.sorted[idx]!;
        const rcx = wrapDelta(rocks.cx[rk]! - eyeX, worldWidth);
        const rcy = wrapDelta(rocks.cy[rk]! - eyeY, worldHeight);
        let s = (rcx * dx + rcy * dy) / seg2;
        if (s < 0) s = 0;
        else if (s > 1) s = 1;
        const gx = rcx - s * dx;
        const gy = rcy - s * dy;
        const rr = rocks.radius[rk]!;
        if (gx * gx + gy * gy < rr * rr) return true;
      }
    }
  }
  return false;
}
