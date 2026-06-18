import { type CellStore } from '../memory/cell-store';
import { type NeuralNetwork } from '../neural/network';
import { type BondNetwork } from './bonds';
import { type OrganismTable } from './organisms';
import { type GenomeStore } from '../genome/genome';
import { CellType } from '../cells/types';
import { type GlowEffectors } from '../neural/glow';

/**
 * Atomic organism death (§4.8, the M5-deferred death cascade). An organism whose aggregate
 * energy ≤ `deathFloor` dies as a WHOLE: each of its cells becomes free MEAT (`organismId`
 * → 0, energy = mass·`meatEnergyOnDeath`, velocity zeroed), all its bonds are reaped
 * (death-driven bond reaping), its neural activations are zeroed (the caller's
 * `net.rebuildLive` then de-lists the now-non-neural synapses, and motor/sensor bindings are
 * reclaimed via removeMotorsFor/removeSensorsFor), and its organism id + genome
 * are freed. The MEAT cells decay + free normally via the cell-level lifecycle next tick.
 * Returns true if any organism died (→ caller rebuilds the nets). Allocation-free: `dying`
 * is a pre-allocated per-organism flag buffer (length ≥ maxOrganisms).
 */
export function killStarvedOrganisms(
  cells: CellStore,
  net: NeuralNetwork,
  bonds: BondNetwork,
  organisms: OrganismTable,
  store: GenomeStore,
  glowEffectors: GlowEffectors,
  liveIndices: Uint32Array,
  liveCount: number,
  deathFloor: number,
  meatEnergyOnDeath: number,
  dying: Uint8Array,
  out: { deaths: number; deadRefs?: number[] },
): boolean {
  const maxOrg = organisms.maxOrganisms;
  let deaths = 0;
  for (let org = 1; org < maxOrg; org++) {
    // genomeRef guard: genome-less organisms (M5 hand-built clusters, strain-split fragments)
    // are M5-immortal (lifecycle-exempt) — only genome-bearing M6 organisms die atomically.
    if (
      organisms.isAlive(org) &&
      organisms.genomeRef[org]! >= 0 &&
      organisms.cellCount[org]! > 0 &&
      organisms.energy[org]! <= deathFloor
    ) {
      dying[org] = 1;
      deaths++;
    } else {
      dying[org] = 0;
    }
  }
  if (deaths === 0) {
    out.deaths = 0;
    return false;
  }

  const f = cells.fields;
  const cap = bonds.degreeCap;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const org = f.organismId[i]!;
    if (org === 0 || dying[org] === 0) continue;
    // Reap every bond on this cell (swap-remove keeps adj[off+0] valid each iteration).
    while (bonds.degree[i]! > 0) bonds.removeBond(bonds.adj[i * cap]!);
    // Convert to free MEAT carrying biomass energy.
    f.cellType[i] = CellType.MEAT;
    f.energy[i] = f.mass[i]! * meatEnergyOnDeath;
    f.organismId[i] = 0;
    f.velX[i] = 0;
    f.velY[i] = 0;
    f.thrust[i] = 0; // kill stale motor drive BEFORE the binding is gone (no corpse self-propulsion)
    // Reclaim this cell's motor/sensor bindings (driveMovers has no per-tick liveness guard, so a
    // lingering MOVER binding would drive ghost thrust onto this MEAT slot — and onto whatever the
    // slot recycles into) + zero severed activations (the slot may recycle into a new neuron).
    net.removeMotorsFor(i);
    net.removeSensorsFor(i);
    glowEffectors.removeFor(i);
    net.actCur[i] = 0;
    net.actNxt[i] = 0;
  }

  // Free the dead organisms' ids + genomes.
  for (let org = 1; org < maxOrg; org++) {
    if (dying[org] === 1) {
      const ref = organisms.genomeRef[org]!;
      if (ref >= 0) {
        store.free(ref);
        if (out.deadRefs !== undefined) out.deadRefs.push(ref);
      }
      organisms.free(org);
    }
  }

  out.deaths = deaths;
  return true;
}
