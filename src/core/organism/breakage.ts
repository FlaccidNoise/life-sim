import { type BondNetwork } from './bonds';
import { type OrganismTable } from './organisms';
import { type SplitChecker } from './split';
import { CellType } from '../cells/types';
import { wrapDelta } from '../math/vec2';

/**
 * Break over-stretched bonds and split organisms (§4.8). Iterates the live-bond
 * snapshot; a bond whose strain (dist − restLen)/restLen exceeds `maxStrain` is removed
 * and a `SplitChecker.check` runs from its endpoints. The per-tick guard `maxChecks`
 * bounds the split-checks: once reached we stop scanning this tick; remaining strained
 * bonds are still over-stretched (large restoring force) and re-detected next tick.
 * Reads POST-integrate positions. Returns the number of bonds broken so the caller can
 * rebuild the live-bond list + aggregates. Allocation-free.
 *
 * Sessile plants (sessilePlants=true): a broken PLANT chain bond (a PHOTO organism cell)
 * is NOT split-relabelled. Split-on-break would relabel the detached part — or the base
 * itself — to a fresh organism id, producing a baseless immortal plant fragment (org-id
 * leak + runaway PHOTO field) or a base whose chain no longer shares its org (growth/spore
 * break). Instead the bond is just removed and the World's per-tick base-reachability reap
 * (severEatenChainCells, forced when any bond broke) converts the now-unreachable part to
 * MEAT — identical to grazing semantics: a snapped chain drifts off as food, never a new
 * organism. Creatures (non-PHOTO / free cells) still split normally → byte-identical when OFF.
 */
export function breakStrainedBonds(
  bonds: BondNetwork,
  organismId: Uint32Array,
  organisms: OrganismTable,
  splitter: SplitChecker,
  posX: Float64Array,
  posY: Float64Array,
  cellType: Uint8Array,
  maxStrain: number,
  maxChecks: number,
  width: number,
  height: number,
  sessilePlants: boolean,
): number {
  const live = bonds.liveBonds;
  const count = bonds.liveBondCount;
  const cellA = bonds.cellA;
  const cellB = bonds.cellB;
  const restLen = bonds.restLen;
  let broke = 0;
  for (let k = 0; k < count; k++) {
    if (broke >= maxChecks) break;
    const s = live[k]!;
    if (bonds.isAlive(s) === false) continue;
    const a = cellA[s]!;
    const b = cellB[s]!;
    const ddx = wrapDelta(posX[a]! - posX[b]!, width);
    const ddy = wrapDelta(posY[a]! - posY[b]!, height);
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    const rl = restLen[s]!;
    if (rl > 0 && (d - rl) / rl > maxStrain) {
      bonds.removeBond(s);
      // Plant bonds skip split-relabel (the reap handles the freed part); creatures split.
      if (!(sessilePlants && cellType[a]! === CellType.PHOTO)) {
        splitter.check(bonds, organismId, organisms, a, b);
      }
      broke++;
    }
  }
  return broke;
}
