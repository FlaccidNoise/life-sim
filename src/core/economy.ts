/**
 * Phase 2 economy — pure-economic life cycle (no fitness function, ever). Each kernel iterates the
 * live set in ascending slot order for determinism. RNG is consumed ONLY at reproduction (a birth
 * event), in that ascending order, so the tick stays reproducible.
 *
 * The energy budget is the make-or-break the old engine got wrong (foragers that never bred): a fed
 * organism nets positive and reaches the repro bar; an unfed one nets negative and starves. That gives
 * real population turnover (births AND deaths), not a frozen or non-breeding population.
 */
import { type OrganismStore } from './store';
import { type FoodField } from './food-field';
import { type Rng } from './rng';
import { type Config } from './config';
import {
  mutateGenome,
  mutateScalarGenes,
  geneUpkeep,
  ScalarGene,
  SCALAR_GENE_COUNT,
} from './genome';

/**
 * Eat from the current food cell (capped by the creature's EAT_RATE gene and local biomass), pay basal
 * + per-gene upkeep + movement cost, and age. Basal is scaled by the metabolic-efficiency gene (the
 * other half of its tradeoff: thrifty bodies are cheap to run); geneUpkeep adds the cost of the
 * above-baseline "more-is-costly" genes — together the selection pressure on the traits. Ascending
 * order so depletion is deterministic when organisms share a cell. Mutates energy.
 */
export function metabolize(store: OrganismStore, food: FoodField, cfg: Config): void {
  const { liveIndices, liveCount, x, y, vx, vy, energy, age, scalarGenes } = store;
  const { basalCost, moveCost, satiatedThreshold } = cfg;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    const eatRate = scalarGenes[sg + ScalarGene.EAT_RATE]!;
    const efficiency = scalarGenes[sg + ScalarGene.METAB_EFF]!;
    // SATIATED creatures are "full" → they stop grazing, leaving the biomass in the cell for others.
    const gained = energy[i]! >= satiatedThreshold ? 0 : food.grazeAt(x[i]!, y[i]!, eatRate);
    const speed2 = vx[i]! * vx[i]! + vy[i]! * vy[i]!;
    const upkeep = basalCost * efficiency + geneUpkeep(scalarGenes, i, cfg);
    energy[i] = energy[i]! + gained - upkeep - moveCost * speed2;
    age[i] = (age[i]! + 1) >>> 0;
  }
}

/** Free every organism whose energy has run out (≤ 0). Returns the death count. */
export function cullDead(store: OrganismStore): number {
  const { liveIndices, liveCount, energy } = store;
  let deaths = 0;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    if (energy[i]! <= 0) {
      store.free(i);
      deaths++;
    }
  }
  return deaths;
}

/**
 * Asexual reproduction by energy split, "breed at the top": an organism that has climbed to the
 * SATIATED threshold spawns a child near it, pays reproCost (birthEnergy to the child, the rest lost),
 * which drops it back down into the reproductive band — so it must forage back up to breed again, and
 * the climb-time naturally rate-limits breeding. The child INHERITS the parent's genome (brain weights
 * + hue) with Gaussian mutation — the only source of heritable variation. Children allocated this tick
 * first act next tick (not in the iterated snapshot). RNG is drawn in ascending order. Returns births.
 */
export function reproduce(store: OrganismStore, rng: Rng, cfg: Config): number {
  const { satiatedThreshold, reproCost, birthEnergy, offspringOffset, worldWidth, worldHeight } =
    cfg;
  // Snapshot the parents up front: alloc() mutates liveIndices' backing only via rebuildLive (not
  // here), but children land in freed slots — iterating a fixed count avoids touching them anyway.
  const parents = store.liveIndices;
  const n = store.liveCount;
  const { x, y, vx, vy, heading, energy } = store;
  let births = 0;
  for (let k = 0; k < n; k++) {
    const p = parents[k]!;
    if (!store.isAlive(p)) continue; // died in the cull this tick
    if (energy[p]! < satiatedThreshold) continue; // breed only once full (the top of the climb)
    const child = store.alloc();
    if (child < 0) break; // store full — stop (population is buffer-capped)
    const angle = rng.range(0, Math.PI * 2);
    let cx = x[p]! + Math.cos(angle) * offspringOffset;
    let cy = y[p]! + Math.sin(angle) * offspringOffset;
    cx %= worldWidth;
    if (cx < 0) cx += worldWidth;
    cy %= worldHeight;
    if (cy < 0) cy += worldHeight;
    x[child] = cx;
    y[child] = cy;
    vx[child] = vx[p]!;
    vy[child] = vy[p]!;
    heading[child] = heading[p]!;
    energy[child] = birthEnergy;
    energy[p] = energy[p]! - reproCost;
    // Inherit the genome with mutation (the only source of heritable variation): brain weights + hue,
    // then the scalar genes. RNG drawn in a fixed order per child → deterministic.
    mutateGenome(store.brain, store.hue, child, p, rng, cfg.mutationSigma, cfg.hueMutationSigma);
    mutateScalarGenes(store.scalarGenes, child, p, rng, cfg);
    // No-Lamarck: the child's runtime brain starts from its freshly-mutated GENOME, not the parent's
    // learned weights. Learning never crosses the generation boundary.
    store.resetLearned(child);
    births++;
  }
  return births;
}
