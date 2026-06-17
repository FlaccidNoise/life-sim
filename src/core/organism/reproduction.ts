import { type CellStore } from '../memory/cell-store';
import { type NeuralNetwork } from '../neural/network';
import { type BondNetwork } from './bonds';
import { type OrganismTable } from './organisms';
import { type GenomeStore } from '../genome/genome';
import { type Rng } from '../math/rng';
import { type MutationRates, mutateGenome } from '../genome/mutate';
import { develop } from '../genome/develop';
import { instantiateBody } from './instantiate';
import { wrap } from '../math/vec2';

/** Scalar parameters for one reproduction pass (plain data — NOT Config). */
export interface ReproParams {
  reproThreshold: number;
  parentFloor: number;
  offspringOffset: number;
  maxCellsPerOrganism: number;
  maxRecursionDepth: number;
  maxBirthsPerTick: number;
  worldWidth: number;
  worldHeight: number;
  tick: number;
}

/**
 * Asexual reproduction (§4.5). Scans organisms in ascending id (canonical → deterministic
 * mutation draws). An organism with aggregate energy ≥ `reproThreshold` and a genome
 * copy+mutates (draws from `mutationRng`, the rng.split(2) substream) + develops an
 * offspring; if it can afford `body.totalEnergy` while retaining `parentFloor`, it
 * instantiates the offspring near its centroid and deducts the provision from its cells
 * (MATERNAL PROVISIONING). Under-provisioned / over-capacity / degenerate(truncated)
 * development → clean abort (no allocation). Bounded by `maxBirthsPerTick`. STRUCTURAL — runs
 * once per tick in the §4.3 step-8 phase; allocates on an actual birth, not on the scan.
 */
export function reproduceOrganisms(
  cells: CellStore,
  net: NeuralNetwork,
  bonds: BondNetwork,
  organisms: OrganismTable,
  store: GenomeStore,
  liveIndices: Uint32Array,
  liveCount: number,
  mutationRng: Rng,
  rates: MutationRates,
  params: ReproParams,
  slotScratch: Int32Array,
  out: { births: number },
): void {
  const f = cells.fields;
  let births = 0;
  const maxOrg = organisms.maxOrganisms;

  for (let org = 1; org < maxOrg; org++) {
    if (births >= params.maxBirthsPerTick) break;
    if (!organisms.isAlive(org)) continue;
    if (organisms.cellCount[org]! === 0) continue;
    if (organisms.energy[org]! < params.reproThreshold) continue;
    const parentRef = organisms.genomeRef[org]!;
    if (parentRef < 0) continue;
    const parentGenome = store.get(parentRef);
    if (parentGenome === undefined) continue;

    const childGenome = mutateGenome(parentGenome, mutationRng, rates, store);
    childGenome.parentRef = parentRef;
    childGenome.generation = parentGenome.generation + 1;

    const body = develop(childGenome, params.maxCellsPerOrganism, params.maxRecursionDepth);
    if (body.count === 0 || body.truncated) continue; // degenerate → clean skip

    const orgEnergy = organisms.energy[org]!;
    if (orgEnergy - body.totalEnergy < params.parentFloor) continue; // under-provisioned → clean abort

    const cx = wrap(organisms.centroidX[org]! + params.offspringOffset, params.worldWidth);
    const cy = organisms.centroidY[org]!;
    const mover = organisms.mover[org]!;
    const heading = mover >= 0 ? f.heading[mover]! : 0;

    const childRef = store.register(childGenome);
    const newOrg = instantiateBody(
      body,
      cells,
      net,
      bonds,
      organisms,
      childRef,
      cx,
      cy,
      heading,
      params.worldWidth,
      params.worldHeight,
      slotScratch,
    );
    if (newOrg < 0) {
      store.free(childRef); // capacity → clean abort, undo the registration
      continue;
    }
    organisms.birthTick[newOrg] = params.tick;

    // Maternal provisioning: deduct body.totalEnergy from the parent's cells proportionally.
    const scale = orgEnergy > 0 ? (orgEnergy - body.totalEnergy) / orgEnergy : 0;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      if (f.organismId[i]! === org) f.energy[i] = f.energy[i]! * scale;
    }
    births++;
  }

  out.births = births;
}
