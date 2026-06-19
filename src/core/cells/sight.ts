import { type CellArrays } from '../memory/cell-store';
import { type SpatialHash } from '../spatial/spatial-hash';
import { wrapDelta } from '../math/vec2';
import { CellType, isEdibleBy, isFlesh } from './types';
import { SightTarget } from './sense-source';

/**
 * SIGHT cone query (§ "Senses & Smarter Creatures" Phase 3). Looks along eye cell `i`'s heading
 * and writes (senseX[i], senseY[i]) = unitDirToTarget × proximity for the NEAREST cell of the
 * eye's `sightTarget` class within `viewRange` and `viewHalfAngle`; zero vector when the cone is
 * empty. Allocation-free; reads ONLY f.cellType[j] + carnivore[organismId[j]] (cardinal-safe),
 * excludes the eye's own organism (f.organismId[j] !== f.organismId[i]).
 *
 * Scans a (2R+1)×(2R+1) hash block, R = ceil(viewRange/cellSize) — NOT the shared 3×3 loop. The
 * canonical scan order is ascending bucket index (row-major: dyOff outer, dxOff inner), then
 * ascending sorted slot. Nearest is chosen by strict `<` on the SQUARED toroidal distance, so two
 * exactly-equidistant candidates keep the first-seen (canonical) winner — making the result
 * byte-deterministic.
 *
 * Classification (cardinal-safe — type + organisms.carnivore only, never id-as-identity):
 *   FOOD     → isEdibleBy(MOTILE, type) (PHOTO or MEAT — a heterotroph's food).
 *   PREY     → isFlesh(type) && carnivore[organismId] === 0 (living non-carnivore forager body).
 *   PREDATOR → isFlesh(type) && carnivore[organismId] === 1 (living carnivore body).
 *
 * Toroidal-seam double-count guard (re-derived for the wider window): the shared 3×3 loop is safe
 * only because SpatialHash guarantees cols,rows >= 3, so a 3×3 block never aliases a bucket onto
 * itself. A (2R+1)-wide window with R up to 3–4 spans up to 9 buckets; when `2R+1 >= cols` (or rows)
 * the modulo wrap maps two distinct offsets onto the SAME column/row, re-visiting the same bucket —
 * and thus the same candidate `j` — twice. A duplicate of the *winning* bucket is harmless (its `j`
 * re-tests at equal d2 and strict-`<` rejects it), but a duplicate of a DIFFERENT bucket scanned in
 * the wrong relative order can flip which of two equal-distance candidates wins. The robust,
 * allocation-free guard: visit each (bx,by) bucket AT MOST ONCE by skipping any offset beyond the
 * half-grid — `|dxOff| > (cols-1)/2` or `|dyOff| > (rows-1)/2` — because such an offset's wrapped
 * column/row always aliases a nearer offset already scanned this pass. With the spec's R <= 3–4 and
 * worlds >= ~32 buckets wide this is a no-op in production; it only matters on tiny unit-test grids.
 */
export function sightVector(
  i: number,
  f: CellArrays,
  hash: SpatialHash,
  carnivore: Uint8Array,
  sightTarget: number,
  viewRange: number,
  viewHalfAngle: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const cols = hash.cols;
  const rows = hash.rows;
  const cellSize = hash.width / cols;
  const R = Math.ceil(viewRange / cellSize);

  const xi = f.posX[i]!;
  const yi = f.posY[i]!;
  const orgI = f.organismId[i]!;
  const h = f.heading[i]!;
  const cosH = Math.cos(h);
  const sinH = Math.sin(h);
  const cosHalf = Math.cos(viewHalfAngle);
  const range2 = viewRange * viewRange;

  const cx = hash.colOf(xi);
  const cy = hash.rowOf(yi);
  // Half-grid cutoff (seam guard): offsets beyond this alias a nearer offset already scanned.
  const halfCols = (cols - 1) / 2;
  const halfRows = (rows - 1) / 2;

  let bestD2 = Infinity;
  let bestDx = 0;
  let bestDy = 0;
  let found = false;

  for (let dyOff = -R; dyOff <= R; dyOff++) {
    if (dyOff > halfRows || dyOff < -halfRows) continue; // seam guard (row): bucket already visited
    const by = (((cy + dyOff) % rows) + rows) % rows;
    for (let dxOff = -R; dxOff <= R; dxOff++) {
      if (dxOff > halfCols || dxOff < -halfCols) continue; // seam guard (col): bucket already visited
      const bx = (((cx + dxOff) % cols) + cols) % cols;
      const b = by * cols + bx;
      const end = hash.bucketStart[b + 1]!;
      for (let idx = hash.bucketStart[b]!; idx < end; idx++) {
        const j = hash.sorted[idx]!;
        if (j === i) continue;
        if (f.organismId[j]! === orgI) continue; // own organism (structural, cardinal-safe)
        const t = f.cellType[j]!;
        let match: boolean;
        if (sightTarget === SightTarget.FOOD) {
          match = isEdibleBy(CellType.MOTILE, t);
        } else if (sightTarget === SightTarget.PREY) {
          match = isFlesh(t) && carnivore[f.organismId[j]!]! === 0;
        } else {
          // SightTarget.PREDATOR
          match = isFlesh(t) && carnivore[f.organismId[j]!]! === 1;
        }
        if (!match) continue;
        const dx = wrapDelta(f.posX[j]! - xi, worldWidth);
        const dy = wrapDelta(f.posY[j]! - yi, worldHeight);
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 > range2) continue; // coincident or out of range
        const dist = Math.sqrt(d2);
        const dot = dx * cosH + dy * sinH;
        if (dot < dist * cosHalf) continue; // outside the cone half-angle (also rejects behind-eye)
        if (d2 < bestD2) {
          // strict `<`: an equal-d2 tie keeps the earlier (canonical-first) candidate.
          bestD2 = d2;
          bestDx = dx;
          bestDy = dy;
          found = true;
        }
      }
    }
  }

  if (!found) {
    f.senseX[i] = 0;
    f.senseY[i] = 0;
    return;
  }
  const dist = Math.sqrt(bestD2);
  let proximity = (viewRange - dist) / viewRange;
  if (proximity < 0) proximity = 0;
  else if (proximity > 1) proximity = 1;
  const inv = proximity / dist;
  f.senseX[i] = bestDx * inv;
  f.senseY[i] = bestDy * inv;
}
