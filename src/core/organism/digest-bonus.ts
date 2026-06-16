import { type BondNetwork } from './bonds';
import { CellType } from '../cells/types';

/**
 * The multicellular payoff input (§4.5): for each cell, count its bonded neighbours
 * that are also DIGESTIVE. METABOLIZE scales a digestive cell's gain by
 * `1 + digestClusterBonus · digestBonus[i]`, so a clustered digestive organism
 * out-harvests lone cells. Recomputed each tick from the live-bond list (reset, then
 * accumulate); bonded neighbours are the same organism by construction. Allocation-free.
 */
export function computeDigestBonus(
  bonds: BondNetwork,
  cellType: Uint8Array,
  digestBonus: Uint8Array,
): void {
  digestBonus.fill(0);
  const live = bonds.liveBonds;
  const count = bonds.liveBondCount;
  const cellA = bonds.cellA;
  const cellB = bonds.cellB;
  for (let k = 0; k < count; k++) {
    const s = live[k]!;
    const a = cellA[s]!;
    const b = cellB[s]!;
    if (cellType[a]! === CellType.DIGESTIVE && cellType[b]! === CellType.DIGESTIVE) {
      digestBonus[a] = (digestBonus[a]! + 1) & 0xff;
      digestBonus[b] = (digestBonus[b]! + 1) & 0xff;
    }
  }
}
