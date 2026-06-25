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
import { type ScentField } from './scent-field';
import { type SpatialHash } from './spatial-hash';
import { type Parcels } from './parcels';
import { type Rng } from './rng';
import { type Config } from './config';
import { type Walls } from './walls';
import {
  mutateGenome,
  mutateScalarGenes,
  crossoverScalarGenes,
  crossoverBrain,
  geneticDistance,
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
  const { counterBiteFraction } = cfg;
  const { liveIndices, liveCount, x, y, energy, scalarGenes, biteGate } = store;
  const brainGatedBiting = cfg.brainGatedBiting;
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
    let drain = Math.min(scalarGenes[sg + ScalarGene.DAMAGE]! * diet, energy[best]!);
    if (brainGatedBiting) drain *= biteGate[i]!; // brain decides the strike (×1 when off = byte-identical)
    if (drain <= 0) continue; // toothless, gate shut, or prey already drained to nothing this tick
    energy[best] = energy[best]! - drain;
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
/**
 * Per-tick passive scent deposit: every live creature broadcasts its signature (a projection of its DIET
 * gene + hue) into the field, scaled by its PHERO_DEPOSIT gene × pheroDepositStrength. Ascending live-slot,
 * RNG-free. The continuous trail (vs on-graze) so predators — who gain via hunt, not graze — also lay scent.
 * When cfg.scentIdentity is false the deposit is identity-blind (equal into all channels) — the ablation.
 */
export function depositScent(store: OrganismStore, scent: ScentField, cfg: Config): void {
  const { liveIndices, liveCount, x, y, hue, scalarGenes, scentGate } = store;
  const strength = cfg.pheroDepositStrength;
  const identity = cfg.scentIdentity;
  const brainGatedScent = cfg.brainGatedScent;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    let amount = scalarGenes[sg + ScalarGene.PHERO_DEPOSIT]! * strength;
    if (brainGatedScent) amount *= scentGate[i]!; // brain decides whether to broadcast (×1 when off)
    if (amount <= 0) continue;
    const diet = scalarGenes[sg + ScalarGene.DIET]!;
    scent.deposit(x[i]!, y[i]!, diet, hue[i]!, amount, identity);
  }
}

export function metabolize(store: OrganismStore, food: FoodField, hash: SpatialHash, cfg: Config): void {
  const { liveIndices, liveCount, x, y, vx, vy, energy, age, scalarGenes, eatGate } = store;
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
    // Brain-gated eating (slice B): throttle the eat budget by the creature's eatGate (0..1), so a creature
    // that lifts its head grazes/absorbs less. Off → unconditional eating (effEatRate === eatRate).
    const effEatRate = cfg.brainGatedEating ? eatRate * eatGate[i]! : eatRate;
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
      // spec ramps from the generalist floor (s01=0, indifferent) to 1+bonus (s01=1, committed specialist),
      // so a generalist earns LESS per grazed unit than a specialist eating its own channel — the penalty
      // that pulls FORAGE_PREF off 0.5 into two niches.
      const s01 = 2 * Math.abs(pref - 0.5);
      const spec = cfg.forageGeneralistFloor + (1 + cfg.forageSpecBonus - cfg.forageGeneralistFloor) * s01;
      const budget = effEatRate * herbivory;
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
      const s01 = (maxW - 1 / 3) / (2 / 3); // 0 = even (generalist) … 1 = all-in on one channel
      const spec = cfg.forageGeneralistFloor + (1 + cfg.forageSpecBonus - cfg.forageGeneralistFloor) * s01;
      const budget = effEatRate * herbivory;
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
      gained = food.grazeAt(x[i]!, y[i]!, effEatRate * herbivory); // single channel (eatGate-throttled)
    }
    const speed2 = vx[i]! * vx[i]! + vy[i]! * vy[i]!;
    // Bigger bodies are costlier to move (mass): the speed² cost scales by (size/cellRadius)^sizeMoveCostExp.
    let moveFactor = 1;
    if (cfg.sizeMoveCostExp > 0) {
      const size = scalarGenes[sg + ScalarGene.SIZE]!;
      moveFactor = (size / cfg.cellRadius) ** cfg.sizeMoveCostExp;
    }
    // Senescence (death-of-old-age): past its SENESCENCE_AGE gene a creature's basal cost climbs with age,
    // so an elder eventually can't break even and starves → the EXISTING cull reaps it (no new death path).
    // Gated on ageStages && senescenceRate>0 so the OFF path leaves basal exactly basalCost → byte-identical.
    let basal = basalCost;
    if (cfg.ageStages && cfg.senescenceRate > 0) {
      const over = age[i]! - scalarGenes[sg + ScalarGene.SENESCENCE_AGE]!;
      if (over > 0) basal = basalCost * (1 + cfg.senescenceRate * over);
    }
    const upkeep = basal * efficiency + geneUpkeep(scalarGenes, i, cfg);
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

/** Find the best compatible mate for mother `p` within mateContactRange (RNG-free, deterministic). Scans
 *  the post-MOVE hash 3×3 neighbourhood (cell ≥ contact range). A candidate is alive, mature, within range,
 *  and genetically compatible (distance < threshold). Among candidates, picks the one best matching the
 *  mother's PREFERENCE (min |display − preference|), tie-broken by lowest slot. Returns the slot or -1. */
function findMate(store: OrganismStore, p: number, cfg: Config, hash: SpatialHash): number {
  const { x, y, scalarGenes, age } = store;
  const N = SCALAR_GENE_COUNT;
  const range2 = cfg.mateContactRange * cfg.mateContactRange;
  const pref = scalarGenes[p * N + ScalarGene.PREFERENCE]!;
  const ww = cfg.worldWidth;
  const wh = cfg.worldHeight;
  let best = -1;
  let bestScore = Infinity;
  hash.forEachNeighbor(x[p]!, y[p]!, (j) => {
    if (j === p || !store.isAlive(j)) return;
    if (cfg.ageStages && age[j]! < scalarGenes[j * N + ScalarGene.MATURITY_AGE]!) return; // juvenile
    const dx = wrapDelta(x[j]! - x[p]!, ww);
    const dy = wrapDelta(y[j]! - y[p]!, wh);
    if (dx * dx + dy * dy > range2) return; // out of contact range
    if (geneticDistance(scalarGenes, p, j, cfg) >= cfg.mateCompatThreshold) return; // incompatible
    const score = Math.abs(scalarGenes[j * N + ScalarGene.DISPLAY]! - pref);
    if (score < bestScore || (score === bestScore && j < best)) { bestScore = score; best = j; }
  });
  return best;
}

/** Allocate + place a child near its mother (spawn-angle RNG, toroidal wrap, wall fallback, inherit
 *  kinematics). Returns the child slot, or -1 if the store is full. The ONLY RNG draw here is the angle —
 *  drawn first, matching the legacy asexual order so the determinism stream is unchanged. */
function spawnChildSlot(
  store: OrganismStore,
  mom: number,
  rng: Rng,
  cfg: Config,
  walls: Walls | null,
): number {
  const child = store.alloc();
  if (child < 0) return -1;
  const { x, y, vx, vy, heading } = store;
  const angle = rng.range(0, Math.PI * 2);
  let cx = x[mom]! + Math.cos(angle) * cfg.offspringOffset;
  let cy = y[mom]! + Math.sin(angle) * cfg.offspringOffset;
  cx %= cfg.worldWidth; if (cx < 0) cx += cfg.worldWidth;
  cy %= cfg.worldHeight; if (cy < 0) cy += cfg.worldHeight;
  if (walls !== null && walls.active && walls.isSolidAt(cx, cy)) { cx = x[mom]!; cy = y[mom]!; }
  x[child] = cx; y[child] = cy; vx[child] = vx[mom]!; vy[child] = vy[mom]!; heading[child] = heading[mom]!;
  return child;
}

/** After the child's genome is written: reset its learning state, provision it to its BIRTH_ENERGY gene
 *  (capped by the mother's spare energy above her reserved REPRO_THRESHOLD survival floor — energy-conserving),
 *  debit the mother (provisioning + reproOverhead), start the mother's breed cooldown, and fire the onBirth
 *  hook. RNG-free. Called once the genome (mutate or crossover) has set the child's genes. */
function provisionAndFinalize(store: OrganismStore, mom: number, child: number, cfg: Config): void {
  store.resetLearned(child);
  const { energy, scalarGenes } = store;
  const childBirth = scalarGenes[child * SCALAR_GENE_COUNT + ScalarGene.BIRTH_ENERGY]!;
  // Reserve the mother's REPRO_THRESHOLD survival floor: breeding returns her to her reproductive band,
  // never below it (and never to ≤ 0). The viability gate guarantees energy[mom] > reproOverhead + reproFloor,
  // so childEnergy > 0 and the mother ends at ≥ reproFloor. Energy stays conserved (only reproOverhead is lost).
  const reproFloor = scalarGenes[mom * SCALAR_GENE_COUNT + ScalarGene.REPRO_THRESHOLD]!;
  const childEnergy = Math.min(childBirth, energy[mom]! - cfg.reproOverhead - reproFloor);
  energy[child] = childEnergy;
  store.prevEnergy[child] = childEnergy;
  energy[mom] = energy[mom]! - childEnergy - cfg.reproOverhead;
  if (cfg.breedCooldown > 0) store.breedCooldownLeft[mom] = cfg.breedCooldown;
  cfg.onBirth?.(mom, store.genId[mom]!, child, store.genId[child]!);
}

/**
 * Reproduction, "breed at the top": an organism that has climbed to ITS OWN satiated bar (a life-history
 * gene) breeds. Asexual (sexualReproduction off): it clones itself with Gaussian mutation. Sexual (on): it
 * enters a mate-seeking window and, when a compatible neighbour is in contact range, produces a crossover
 * child (mother = p, father = mate). Either way the child is provisioned up to its BIRTH_ENERGY gene (capped
 * by what the mother can spare) and the mother pays that + reproOverhead, dropping back into its reproductive
 * band. Energy is conserved (provisioning moves mother→child; only reproOverhead is lost). Children allocated
 * this tick first act next tick. RNG drawn in ascending order. Returns births.
 */
export function reproduce(
  store: OrganismStore,
  rng: Rng,
  cfg: Config,
  wallSenseGenes: boolean,
  flowSenseGenes: boolean,
  walls: Walls | null,
  hash: SpatialHash,
): number {
  // Snapshot the parents up front: alloc() mutates liveIndices' backing only via rebuildLive (not
  // here), but children land in freed slots — iterating a fixed count avoids touching them anyway.
  const parents = store.liveIndices;
  const n = store.liveCount;
  const { energy, scalarGenes, age } = store;
  let births = 0;
  for (let k = 0; k < n; k++) {
    const p = parents[k]!;
    if (!store.isAlive(p)) continue; // died in the cull this tick
    // Maturity gate (age stages): a juvenile (younger than its MATURITY_AGE gene) cannot breed yet. The skip
    // is BEFORE alloc/RNG (like the cooldown/satiated checks below), so it consumes no RNG; gated on ageStages
    // so the OFF path never reads age/gene and stays byte-identical. A juvenile's breedCooldownLeft is 0, so
    // sitting ahead of the cooldown decrement is harmless (a not-yet-bred creature has nothing to cool down).
    if (cfg.ageStages && age[p]! < scalarGenes[p * SCALAR_GENE_COUNT + ScalarGene.MATURITY_AGE]!) continue;
    // Breeding refractory (the satiation-dwell lever): a creature still cooling from a recent birth ticks
    // its counter down and skips — it can be FULL yet NOT breed, which is exactly the "well-fed but idle"
    // state the hunger-gate turns into wandering. Gated on breedCooldown>0 so the OFF path never touches the
    // counter and stays byte-identical. First breed is never gated (newborns start at 0 = ready).
    if (cfg.breedCooldown > 0 && store.breedCooldownLeft[p]! > 0) {
      store.breedCooldownLeft[p] = store.breedCooldownLeft[p]! - 1;
      continue;
    }
    // Reproductive-viability gate (owner directive 2026-06-23): a creature breeds only when it can pay the
    // reproduction cost AND stay in its reproductive band — it never breeds itself low enough to die. It must
    // afford reproOverhead and keep its REPRO_THRESHOLD survival floor; provisionAndFinalize reserves that
    // floor, so the mother ends at ≥ REPRO_THRESHOLD (> 0) and the child gets a strictly positive share. RNG-
    // free, before any alloc → consumes no RNG. Airtight (no child-gene dependency): a too-poor creature
    // forages instead of breeding into death. In normal regimes satiatedBar ≫ this cost so it rarely bites.
    if (
      energy[p]! <=
      cfg.reproOverhead + scalarGenes[p * SCALAR_GENE_COUNT + ScalarGene.REPRO_THRESHOLD]!
    ) {
      continue;
    }

    if (!cfg.sexualReproduction) {
      if (energy[p]! < satiatedBar(scalarGenes, p, cfg)) continue; // not full yet
      const child = spawnChildSlot(store, p, rng, cfg, walls);
      if (child < 0) break; // store full
      mutateGenome(
        store.brain, store.hue, child, p, rng, cfg.mutationSigma, cfg.hueMutationSigma,
        wallSenseGenes, flowSenseGenes, cfg.hungerSense, cfg.pheromoneEnabled,
      );
      mutateScalarGenes(store.scalarGenes, child, p, rng, cfg);
      provisionAndFinalize(store, p, child, cfg);
      births++;
      continue;
    }

    // ── Sexual path ──
    const ready = energy[p]! >= satiatedBar(scalarGenes, p, cfg);
    if (store.seeking[p]! === 1) {
      if (!ready) { store.seeking[p] = 0; continue; } // dropped below the bar → abandon the search
      const mate = findMate(store, p, cfg, hash);
      if (mate < 0) {
        store.seekTicksLeft[p] = store.seekTicksLeft[p]! - 1;
        if (store.seekTicksLeft[p]! === 0) {
          store.seeking[p] = 0;
          if (cfg.breedCooldown > 0) store.breedCooldownLeft[p] = cfg.breedCooldown; // forage before retry
        }
        continue;
      }
      // Compatible mate found → crossover birth. Mother = p, father = mate. spawnChildSlot draws the
      // angle FIRST, then crossover draws — same order as the asexual path above.
      const child = spawnChildSlot(store, p, rng, cfg, walls);
      if (child < 0) break;
      crossoverBrain(
        store.brain, store.hue, child, p, mate, rng, cfg.mutationSigma, cfg.hueMutationSigma,
        wallSenseGenes, flowSenseGenes, cfg.hungerSense, cfg.pheromoneEnabled,
      );
      crossoverScalarGenes(store.scalarGenes, child, p, mate, rng, cfg);
      provisionAndFinalize(store, p, child, cfg);
      births++;
      store.seeking[p] = 0;
      // The father is consumed by this pairing too: clear its search so it doesn't independently spawn a
      // second child the same tick (one birth per pair) and re-enters seeking fresh next tick. RNG-free.
      store.seeking[mate] = 0;
      store.seekTicksLeft[mate] = 0;
    } else if (ready) {
      store.seeking[p] = 1; // become a seeker; the steer picks it up next tick, mate attempt starts then
      store.seekTicksLeft[p] = cfg.mateSeekWindow;
    }
  }
  return births;
}
