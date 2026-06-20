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

/**
 * Eat from the current food cell (capped by eatRate and local biomass), pay basal + movement cost,
 * and age. Ascending order so depletion is deterministic when organisms share a cell. Mutates energy.
 */
export function metabolize(
  store: OrganismStore,
  food: FoodField,
  eatRate: number,
  basalCost: number,
  moveCost: number,
): void {
  const { liveIndices, liveCount, x, y, vx, vy, energy, age } = store;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const gained = food.grazeAt(x[i]!, y[i]!, eatRate);
    const speed2 = vx[i]! * vx[i]! + vy[i]! * vy[i]!;
    energy[i] = energy[i]! + gained - basalCost - moveCost * speed2;
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
 * Asexual reproduction by energy split: an organism at/above reproThreshold spawns a child near it,
 * pays reproCost (birthEnergy to the child, the rest lost), and the child starts at birthEnergy. No
 * genome yet (Phase 5) — offspring are kinematic copies. Children allocated this tick first act next
 * tick (they are not in the iterated snapshot). RNG (placement angle) is drawn in ascending order.
 * Returns the birth count.
 */
export function reproduce(
  store: OrganismStore,
  rng: Rng,
  reproThreshold: number,
  reproCost: number,
  birthEnergy: number,
  offspringOffset: number,
  worldWidth: number,
  worldHeight: number,
): number {
  // Snapshot the parents up front: alloc() mutates liveIndices' backing only via rebuildLive (not
  // here), but children land in freed slots — iterating a fixed count avoids touching them anyway.
  const parents = store.liveIndices;
  const n = store.liveCount;
  const { x, y, vx, vy, heading, energy } = store;
  let births = 0;
  for (let k = 0; k < n; k++) {
    const p = parents[k]!;
    if (!store.isAlive(p)) continue; // died in the cull this tick
    if (energy[p]! < reproThreshold) continue;
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
    births++;
  }
  return births;
}
