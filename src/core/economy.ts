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
import { type SpatialHash } from './spatial-hash';
import { type Rng } from './rng';
import { type Config } from './config';
import {
  mutateGenome,
  mutateScalarGenes,
  geneUpkeep,
  ScalarGene,
  SCALAR_GENE_COUNT,
  MIN_BAND,
} from './genome';

/**
 * A creature's effective "full" bar (where it stops eating and breeds): its SATIATED_THRESHOLD gene
 * scaled by body size — a bigger body holds a DEEPER energy reserve ((size/cellRadius)^sizeStoreExp) —
 * then floored to MIN_BAND above its repro bar. Shared by metabolize (eat-stop) and reproduce (breed
 * trigger) so the two never diverge. sizeStoreExp 0 → no size coupling (the pure gene bar).
 */
export function satiatedBar(scalarGenes: Float32Array, i: number, cfg: Config): number {
  const sg = i * SCALAR_GENE_COUNT;
  const repro = scalarGenes[sg + ScalarGene.REPRO_THRESHOLD]!;
  let satiated = scalarGenes[sg + ScalarGene.SATIATED_THRESHOLD]!;
  if (cfg.sizeStoreExp > 0) {
    const size = scalarGenes[sg + ScalarGene.SIZE]!;
    satiated *= (size / cfg.cellRadius) ** cfg.sizeStoreExp;
  }
  const floor = repro + MIN_BAND;
  return satiated < floor ? floor : satiated;
}

/** Shortest signed delta a→b on a torus of the given size (|result| ≤ size/2). */
function wrapDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}

/**
 * PREDATION — each creature with DIET > 0 bites the nearest EDIBLE creature within `biteRange`, draining
 * `DAMAGE · diet` energy (capped by prey energy), absorbed × predationGain. "Edible" requires the prey be
 * smaller by `huntSizeRatio` (big-eats-small — body size is a refuge + a weapon) and, with cannibalism
 * off, less carnivorous than the hunter. Prey driven to ≤ 0 die in the next cull. Ascending slot order +
 * the prev-built hash (scan radius sized to biteRange), so it's deterministic.
 */
export function hunt(store: OrganismStore, hash: SpatialHash, cfg: Config): void {
  const { biteRange, worldWidth, worldHeight, cannibalism, predationGain, huntSizeRatio } = cfg;
  const { liveIndices, liveCount, x, y, energy, scalarGenes } = store;
  const { cols, rows, bucketStart, sorted } = hash;
  const range2 = biteRange * biteRange;
  // Scan a hash neighborhood that actually covers biteRange (was a fixed 3×3 = ±1 cell, so any bite
  // reach beyond one cell was invisible). Capped by half the grid so the toroidal scan can't self-overlap.
  const cellSize = Math.min(worldWidth / cols, worldHeight / rows);
  const halfGrid = Math.floor((Math.min(cols, rows) - 1) / 2);
  const br = Math.min(halfGrid, Math.max(1, Math.ceil(biteRange / cellSize)));
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    const diet = scalarGenes[sg + ScalarGene.DIET]!;
    if (diet <= 0) continue; // pure grazer — never hunts
    const sizeI = scalarGenes[sg + ScalarGene.SIZE]!;
    const maxPreySize = sizeI / huntSizeRatio; // can only bite prey this small or smaller
    const xi = x[i]!;
    const yi = y[i]!;
    const cx = hash.colOf(xi);
    const cy = hash.rowOf(yi);
    // Find the nearest EDIBLE live creature within bite range. With cannibalism off, "edible" excludes
    // same-or-higher-diet peers — a predator eats prey (lower diet), not its guild.
    let best = -1;
    let bestD = range2;
    for (let dy = -br; dy <= br; dy++) {
      const by = (cy + dy + rows) % rows;
      for (let dx = -br; dx <= br; dx++) {
        const bx = (cx + dx + cols) % cols;
        const b = by * cols + bx;
        const end = bucketStart[b + 1]!;
        for (let idx = bucketStart[b]!; idx < end; idx++) {
          const j = sorted[idx]!;
          if (j === i) continue;
          const jg = j * SCALAR_GENE_COUNT;
          if (scalarGenes[jg + ScalarGene.SIZE]! > maxPreySize) continue; // too big to eat (size refuge)
          if (!cannibalism && scalarGenes[jg + ScalarGene.DIET]! >= diet) continue;
          const ddx = wrapDelta(xi - x[j]!, worldWidth);
          const ddy = wrapDelta(yi - y[j]!, worldHeight);
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < bestD) {
            bestD = d2;
            best = j;
          }
        }
      }
    }
    if (best < 0) continue; // nothing in reach
    const drain = Math.min(scalarGenes[sg + ScalarGene.DAMAGE]! * diet, energy[best]!);
    if (drain <= 0) continue; // toothless, or prey already drained to nothing this tick
    energy[best] = energy[best]! - drain;
    // Meat is concentrated energy: the predator absorbs the drain × predationGain. With gain > 1 this
    // deliberately CREATES energy (not strictly conserved) so hunting is a big payoff vs. grazing — the
    // incentive to seek prey instead of sitting on the food field.
    energy[i] = energy[i]! + drain * predationGain;
  }
}

/**
 * Eat from the current food cell (capped by the creature's EAT_RATE gene and local biomass), pay basal
 * + per-gene upkeep + movement cost, and age. Basal is scaled by the metabolic-efficiency gene (the
 * other half of its tradeoff: thrifty bodies are cheap to run); geneUpkeep adds the cost of the
 * above-baseline "more-is-costly" genes — together the selection pressure on the traits. Ascending
 * order so depletion is deterministic when organisms share a cell. Mutates energy.
 */
export function metabolize(store: OrganismStore, food: FoodField, cfg: Config): void {
  const { liveIndices, liveCount, x, y, vx, vy, energy, age, scalarGenes } = store;
  const { basalCost, moveCost } = cfg;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    const eatRate = scalarGenes[sg + ScalarGene.EAT_RATE]!;
    const efficiency = scalarGenes[sg + ScalarGene.METAB_EFF]!;
    const diet = scalarGenes[sg + ScalarGene.DIET]!; // 0 grazer … 1 hunter; graze income ×(1−diet)
    // SATIATED at the creature's OWN size-scaled satiated bar (bigger body = deeper reserve), kept above
    // its repro bar by MIN_BAND. SATIATED creatures are "full" → they stop grazing. Plant income falls off
    // as (1−diet)^herbivoryExp, so carnivores get less from the green field and lean on hunting — but exp=1
    // keeps a real fallback so predators survive the sparse stretches between kills (pure herbivore unaffected).
    const satiated = satiatedBar(scalarGenes, i, cfg);
    const herbivory = (1 - diet) ** cfg.herbivoryExp;
    let gained: number;
    if (energy[i]! >= satiated) {
      gained = 0; // full → stop grazing (leave biomass; peak learning + breed at the top)
    } else if (cfg.foodChannels === 2) {
      // TWO-CHANNEL niche split (lever B): spend the eat budget across the two resources by FORAGE_PREF
      // (a B-specialist puts ~all of it on channel B), then convert at the specialization rate. spec ∈
      // [1, 1+forageSpecBonus]: committing to one channel converts grazed biomass into MORE energy than a
      // generalist. No biomass is created — the field depletes by exactly (takeA+takeB); the bonus is a
      // conversion efficiency. This is the disruptive pressure that pulls FORAGE_PREF apart into two niches.
      const pref = scalarGenes[sg + ScalarGene.FORAGE_PREF]!;
      const spec = 1 + cfg.forageSpecBonus * (2 * Math.abs(pref - 0.5));
      const budget = eatRate * herbivory;
      const takeA = food.grazeAt(x[i]!, y[i]!, budget * (1 - pref));
      const takeB = food.grazeAt2(x[i]!, y[i]!, budget * pref);
      gained = (takeA + takeB) * spec;
    } else {
      gained = food.grazeAt(x[i]!, y[i]!, eatRate * herbivory); // single channel (byte-identical original)
    }
    const speed2 = vx[i]! * vx[i]! + vy[i]! * vy[i]!;
    // Bigger bodies are costlier to move (mass): the speed² cost scales by (size/cellRadius)^sizeMoveCostExp.
    let moveFactor = 1;
    if (cfg.sizeMoveCostExp > 0) {
      const size = scalarGenes[sg + ScalarGene.SIZE]!;
      moveFactor = (size / cfg.cellRadius) ** cfg.sizeMoveCostExp;
    }
    const upkeep = basalCost * efficiency + geneUpkeep(scalarGenes, i, cfg);
    energy[i] = energy[i]! + gained - upkeep - moveCost * moveFactor * speed2;
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
 * Asexual reproduction, "breed at the top": an organism that has climbed to ITS OWN satiated bar (a
 * life-history gene) spawns a child near it, provisions the child up to the child's BIRTH_ENERGY gene
 * (capped by what the parent can spare), and pays that provisioning + reproOverhead — which drops it
 * back into its reproductive band, so it must forage up again (climb-time rate-limits breeding). Energy
 * is conserved (provisioning moves parent→child; only reproOverhead is lost). The child INHERITS the
 * parent's genome with Gaussian mutation. Children allocated this tick first act next tick. RNG drawn
 * in ascending order. Returns births. r/K strategies emerge from the satiated + birthEnergy genes.
 */
export function reproduce(store: OrganismStore, rng: Rng, cfg: Config): number {
  const { reproOverhead, offspringOffset, worldWidth, worldHeight } = cfg;
  // Snapshot the parents up front: alloc() mutates liveIndices' backing only via rebuildLive (not
  // here), but children land in freed slots — iterating a fixed count avoids touching them anyway.
  const parents = store.liveIndices;
  const n = store.liveCount;
  const { x, y, vx, vy, heading, energy, scalarGenes } = store;
  let births = 0;
  for (let k = 0; k < n; k++) {
    const p = parents[k]!;
    if (!store.isAlive(p)) continue; // died in the cull this tick
    // Breed at the parent's OWN size-scaled satiated bar (bigger body = deeper reserve to fill first).
    if (energy[p]! < satiatedBar(scalarGenes, p, cfg)) continue; // not full yet → keep foraging
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
    // Inherit the genome with mutation FIRST (brain + hue, then scalar genes) so the child's
    // BIRTH_ENERGY gene is known before we provision it. RNG drawn in a fixed order per child.
    mutateGenome(store.brain, store.hue, child, p, rng, cfg.mutationSigma, cfg.hueMutationSigma);
    mutateScalarGenes(store.scalarGenes, child, p, rng, cfg);
    // No-Lamarck: the child's runtime brain starts from its freshly-mutated GENOME, not the parent's
    // learned weights. Learning never crosses the generation boundary.
    store.resetLearned(child);
    // Provision the child up to its BIRTH_ENERGY gene, capped by the parent's spare energy (energy-
    // conserving; parent stays ≥ 0 since the satiated bar it just cleared > reproOverhead).
    const childBirth = scalarGenes[child * SCALAR_GENE_COUNT + ScalarGene.BIRTH_ENERGY]!;
    const childEnergy = Math.min(childBirth, energy[p]! - reproOverhead);
    energy[child] = childEnergy;
    store.prevEnergy[child] = childEnergy; // first-tick learning reward = 0 for the newborn
    energy[p] = energy[p]! - childEnergy - reproOverhead;
    births++;
    // Optional observation hook (off by default): hand the harness exact child→parent identity. Read-
    // only by contract — no store/RNG/order effect — so the determinism hash is unchanged (see Config).
    cfg.onBirth?.(p, store.genId[p]!, child, store.genId[child]!);
  }
  return births;
}
