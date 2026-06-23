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
import { type PheroField } from './phero-field';
import { type SpatialHash } from './spatial-hash';
import { type Parcels } from './parcels';
import { type Rng } from './rng';
import { type Config } from './config';
import { type Walls } from './walls';
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
export function hunt(
  store: OrganismStore,
  hash: SpatialHash,
  cfg: Config,
  phero: PheroField | null,
): void {
  const { biteRange, worldWidth, worldHeight, cannibalism, predationGain, huntSizeRatio } = cfg;
  const { counterBiteFraction } = cfg;
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
    // Alarm-on-bite (secondary pheromone source, default OFF since bites are rare at 8192² scale): the
    // BITTEN prey broadcasts an alarm into the field at its own cell, scaled by its own PHERO_DEPOSIT gene.
    // Gated on the field being allocated AND pheroAlarmStrength>0 → byte-identical when off. RNG-free.
    if (phero !== null && cfg.pheroAlarmStrength > 0) {
      const dep =
        scalarGenes[best * SCALAR_GENE_COUNT + ScalarGene.PHERO_DEPOSIT]! * cfg.pheroAlarmStrength;
      if (dep > 0) phero.deposit(x[best]!, y[best]!, dep);
    }
    // Meat is concentrated energy: the predator absorbs the drain × predationGain. With gain > 1 this
    // deliberately CREATES energy (not strictly conserved) so hunting is a big payoff vs. grazing — the
    // incentive to seek prey instead of sitting on the food field.
    energy[i] = energy[i]! + drain * predationGain;
    // Red Queen counter-bite (lever E1): the prey bites back — the predator pays back counterBiteFraction
    // of the prey's DAMAGE gene. The drain already landed (a costly bite is still a bite) and the prey is
    // NOT spared, so this is purely a predator-side tax: biting high-DAMAGE prey hurts the attacker. Whether
    // prey actually evolve teeth in response is unverified (DAMAGE is upkeep-costed and gives diet-0 prey no
    // individual benefit — see the config doc). Gated so the OFF path is byte-identical; no RNG.
    if (counterBiteFraction > 0)
      energy[i] =
        energy[i]! -
        counterBiteFraction * scalarGenes[best * SCALAR_GENE_COUNT + ScalarGene.DAMAGE]!;
  }
}

/**
 * Eat from the current food cell (capped by the creature's EAT_RATE gene and local biomass), pay basal
 * + per-gene upkeep + movement cost, and age. Basal is scaled by the metabolic-efficiency gene (the
 * other half of its tradeoff: thrifty bodies are cheap to run); geneUpkeep adds the cost of the
 * above-baseline "more-is-costly" genes — together the selection pressure on the traits. Ascending
 * order so depletion is deterministic when organisms share a cell. Mutates energy.
 */
export function metabolize(
  store: OrganismStore,
  food: FoodField,
  hash: SpatialHash,
  cfg: Config,
  phero: PheroField | null,
): void {
  const { liveIndices, liveCount, x, y, vx, vy, energy, age, scalarGenes } = store;
  const { basalCost, moveCost, deadWaterCost } = cfg;
  const { crowdingMortality, crowdThreshold, crowdRadius, worldWidth, worldHeight } = cfg;
  // Lever D (density-dependent mortality): when crowdingMortality>0 each creature pays an energy drain
  // per local neighbor above crowdThreshold, counted in the post-MOVE hash (the same one hunt uses). The
  // scan covers crowdRadius; loop-invariant scan params are precomputed here, and the whole per-creature
  // block below is SKIPPED when OFF so the energy arithmetic stays byte-identical. RNG-free → deterministic.
  const { cols, rows, bucketStart, sorted } = hash;
  const crowdR2 = crowdRadius * crowdRadius;
  let crowdR = 1;
  if (crowdingMortality > 0) {
    const cellSize = Math.min(worldWidth / cols, worldHeight / rows);
    const halfGrid = Math.floor((Math.min(cols, rows) - 1) / 2);
    crowdR = Math.min(halfGrid, Math.max(1, Math.ceil(crowdRadius / cellSize)));
  }
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
    } else if (cfg.foodChannels === 3) {
      // THREE place-coupled channels {A,B,C} with per-pocket segregation. Preference is a barycentric weight
      // (same wA/wB/wC as sense.ts), but the eat budget is allocated by preference WEIGHTED BY LOCAL
      // AVAILABILITY (pref·biomass, renormalized) so a creature spends its FULL budget on whatever resource is
      // actually present rather than wasting the share aimed at an absent channel: a generalist in a mono-A
      // pocket grazes A at full rate (no starvation), while a mismatched specialist (e.g. a B-eater in an
      // A-pocket) finds little of its resource and goes hungry — the pressure to specialize AND settle in the
      // matching island. spec ∈ [1, 1+forageSpecBonus] rewards commitment. No biomass is created.
      const pref = scalarGenes[sg + ScalarGene.FORAGE_PREF]!;
      const prefC = scalarGenes[sg + ScalarGene.FORAGE_PREF_C]!;
      const wC = prefC;
      const wB = pref * (1 - prefC);
      const wA = (1 - pref) * (1 - prefC);
      const maxW = wA > wB ? (wA > wC ? wA : wC) : wB > wC ? wB : wC;
      const spec = 1 + cfg.forageSpecBonus * ((maxW - 1 / 3) / (2 / 3));
      const budget = eatRate * herbivory;
      // Availability-weighted split: e_ch = w_ch · localBiomass_ch, renormalized so Σ = budget. The budget
      // flows to present-and-preferred resources; nothing is wasted on an empty channel.
      const avA = food.sampleAt(x[i]!, y[i]!);
      const avB = food.sampleAt2(x[i]!, y[i]!);
      const avC = food.sampleAt3(x[i]!, y[i]!);
      const eA = wA * avA;
      const eB = wB * avB;
      const eC = wC * avC;
      const eSum = eA + eB + eC;
      if (eSum > 0) {
        const takeA = food.grazeAt(x[i]!, y[i]!, (budget * eA) / eSum);
        const takeB = food.grazeAt2(x[i]!, y[i]!, (budget * eB) / eSum);
        const takeC = food.grazeAt3(x[i]!, y[i]!, (budget * eC) / eSum);
        gained = (takeA + takeB + takeC) * spec;
      } else {
        gained = 0; // no preferred resource present here
      }
    } else {
      gained = food.grazeAt(x[i]!, y[i]!, eatRate * herbivory); // single channel (byte-identical original)
    }
    // DEPOSIT (default pheromone source = on-graze): a creature that actually ate broadcasts into the
    // field at its own cell, scaled by its PHERO_DEPOSIT gene × pheroGrazeStrength. This is the ubiquitous
    // source so the field populates at 8192² where bites are rare. Gated on the field being allocated AND
    // pheroDepositOnGraze AND gained>0 → byte-identical when off. Ascending live-slot (this loop), RNG-free.
    if (phero !== null && cfg.pheroDepositOnGraze && gained > 0) {
      const dep = scalarGenes[sg + ScalarGene.PHERO_DEPOSIT]! * cfg.pheroGrazeStrength;
      if (dep > 0) phero.deposit(x[i]!, y[i]!, dep);
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
    // Dead-water tax (isolation lever): extra drain where fertility is low — max in the dead gaps, 0 inside
    // a pocket — so crossing the open water is risky and residents stay home. Gated so OFF (0) skips the
    // fertility lookup entirely and the energy line above stays byte-identical.
    if (deadWaterCost > 0) {
      const fert = food.fertilityAt(x[i]!, y[i]!);
      if (fert < 1) energy[i] = energy[i] - deadWaterCost * (1 - fert);
    }
    // Lever D: pay the local-crowding drain ON TOP (skipped entirely when OFF → byte-identical). Count
    // live neighbors within crowdRadius via the post-MOVE hash, then drain crowdingMortality per neighbor
    // above the free band. Ascending order + integer count + RNG-free, so the tick stays reproducible.
    if (crowdingMortality > 0) {
      const xi = x[i]!;
      const yi = y[i]!;
      const ci = hash.colOf(xi);
      const cj = hash.rowOf(yi);
      let neighbors = 0;
      for (let dy = -crowdR; dy <= crowdR; dy++) {
        const by = (cj + dy + rows) % rows;
        for (let dx = -crowdR; dx <= crowdR; dx++) {
          const bx = (ci + dx + cols) % cols;
          const b = by * cols + bx;
          const end = bucketStart[b + 1]!;
          for (let idx = bucketStart[b]!; idx < end; idx++) {
            const j = sorted[idx]!;
            if (j === i) continue;
            const ddx = wrapDelta(xi - x[j]!, worldWidth);
            const ddy = wrapDelta(yi - y[j]!, worldHeight);
            if (ddx * ddx + ddy * ddy <= crowdR2) neighbors++;
          }
        }
      }
      const over = neighbors - crowdThreshold;
      if (over > 0) energy[i] = energy[i]! - crowdingMortality * over;
    }
    age[i] = (age[i]! + 1) >>> 0;
  }
}

/**
 * EAT DRIFTING PARCELS — each creature within `parcelEatRange` of a live, sight-only food parcel consumes
 * the nearest one for a big `parcelEnergy` payoff and frees it. This is the reward that makes vision pay:
 * eyes steer the creature onto the parcel (sense.senseCreatures), and this pass cashes the intercept. Reads
 * only parcel position/energy — never lineage/score (the cardinal rule). Ascending live-slot order so the
 * claim on a contested parcel is deterministic (the lowest-slot creature in reach wins it); RNG-free. Gated
 * by the caller passing a non-null pool → byte-identical OFF.
 */
export function eatParcels(store: OrganismStore, parcels: Parcels, cfg: Config): void {
  const { liveIndices, liveCount, x, y, energy } = store;
  const range = cfg.parcelEatRange;
  const payoff = cfg.parcelEnergy;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const slot = parcels.nearestTo(x[i]!, y[i]!, range);
    if (slot < 0) continue; // none in reach
    parcels.consume(slot);
    energy[i] = energy[i]! + payoff;
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
export function reproduce(
  store: OrganismStore,
  rng: Rng,
  cfg: Config,
  wallSenseGenes: boolean,
  flowSenseGenes: boolean,
  walls: Walls | null,
): number {
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
    // Breeding refractory (the satiation-dwell lever): a creature still cooling from a recent birth ticks
    // its counter down and skips — it can be FULL yet NOT breed, which is exactly the "well-fed but idle"
    // state the hunger-gate turns into wandering. Gated on breedCooldown>0 so the OFF path never touches the
    // counter and stays byte-identical. First breed is never gated (newborns start at 0 = ready).
    if (cfg.breedCooldown > 0 && store.breedCooldownLeft[p]! > 0) {
      store.breedCooldownLeft[p] = store.breedCooldownLeft[p]! - 1;
      continue;
    }
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
    // Never spawn a child inside solid terrain (the parent's pos is already a valid open cell, so fall
    // back to it; soft-repulsion then separates them). RNG-free, so the per-child draw count is fixed —
    // with walls off (null / inactive) this never fires and the run stays byte-identical.
    if (walls !== null && walls.active && walls.isSolidAt(cx, cy)) {
      cx = x[p]!;
      cy = y[p]!;
    }
    x[child] = cx;
    y[child] = cy;
    vx[child] = vx[p]!;
    vy[child] = vy[p]!;
    heading[child] = heading[p]!;
    // Inherit the genome with mutation FIRST (brain + hue, then scalar genes) so the child's
    // BIRTH_ENERGY gene is known before we provision it. RNG drawn in a fixed order per child.
    mutateGenome(
      store.brain,
      store.hue,
      child,
      p,
      rng,
      cfg.mutationSigma,
      cfg.hueMutationSigma,
      wallSenseGenes,
      flowSenseGenes,
      cfg.hungerSense,
      cfg.pheromoneEnabled,
    );
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
    // Start this parent's breeding refractory (gated → no-op + byte-identical when off).
    if (cfg.breedCooldown > 0) store.breedCooldownLeft[p] = cfg.breedCooldown;
    // Optional observation hook (off by default): hand the harness exact child→parent identity. Read-
    // only by contract — no store/RNG/order effect — so the determinism hash is unchanged (see Config).
    cfg.onBirth?.(p, store.genId[p]!, child, store.genId[child]!);
  }
  return births;
}
