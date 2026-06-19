import { type CellStore } from '../memory/cell-store';
import { CellType, isLiving, isNeural } from './types';
import { hashFloat3 } from '../math/rng';
import { wrap } from '../math/vec2';

export interface LifecycleResult {
  births: number;
  deaths: number;
}

/**
 * LIVE/DIE/BREED step (§4.3). Single-threaded, canonical ascending-live-slot
 * order. Takes scalar params (not Config) and writes counts into `out` (no
 * per-tick allocation). Three in-order passes over the live set captured at tick
 * start:
 *   1. Death:  living energy<=0 → convert in place to MEAT (biomass→food energy).
 *   2. Decay:  MEAT energy<=0   → free the slot (bumps generation[]; exercises the free-list).
 *   3. Divide: living energy>=divideThreshold → clone same-type child into a free
 *              slot, 50/50 energy split minus divideCost; child placed at parent +
 *              seeded jitter (stateless hashFloat3 → reproducible, order-free).
 * Children are NOT added to `live`; they first act next tick.
 *
 * Neural cells (SENSOR/NEURON/MOVER) AND any bonded organism cell
 * (`organismId !== 0`) are exempt from passes 1 and 3: M5 organisms are
 * hand-built clusters whose cells must never die or divide at the cell level
 * (M6 owns organism-level lifecycle/reproduction). Their slots are stable for
 * the whole run, so bonds and synapses never dangle. Free cells (`organismId
 * === 0` — the M2/M3 ecosystem) are unaffected and still die/divide normally.
 */
export function lifecycle(
  live: Uint32Array,
  n: number,
  store: CellStore,
  seed: number,
  worldWidth: number,
  worldHeight: number,
  meatEnergyOnDeath: number,
  divideThreshold: number,
  divideCost: number,
  divideJitter: number,
  crowdDivideCap: number,
  sessilePlants: boolean,
  tick: number,
  out: LifecycleResult,
): void {
  const f = store.fields;
  let births = 0;
  let deaths = 0;

  // Pass 1 + 2: death and decay-removal.
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const type = f.cellType[i]!;
    if (isLiving(type)) {
      if (isNeural(type) || f.organismId[i]! !== 0) continue; // M5: organism cells managed by organism lifecycle (M6)
      if (f.energy[i]! <= 0) {
        f.cellType[i] = CellType.MEAT;
        f.energy[i] = f.mass[i]! * meatEnergyOnDeath;
        f.velX[i] = 0;
        f.velY[i] = 0;
        deaths++;
      }
    } else if (f.energy[i]! <= 0) {
      // MEAT fully decayed → recycle the slot.
      store.free(i);
    }
  }

  // Pass 3: division. (Slots freed in pass 2 are available for reuse.)
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const type = f.cellType[i]!;
    if (!isLiving(type)) continue;
    if (isNeural(type) || f.organismId[i]! !== 0) continue; // M5: organism cells don't divide (M6 reproduces organisms)
    // Sessile plants: free PHOTO cells are unsettled SPORES that must anchor (not free-clone), so the
    // legacy free-clone PHOTO path is skipped entirely. Heterotrophs (DIGESTIVE/MOTILE) still divide.
    if (sessilePlants && type === CellType.PHOTO) continue;
    // Density-dependent carrying capacity for the plant field: a PHOTO cell whose coarse
    // density-grid bucket is already full (localDensity > cap) skips division. localDensity is the
    // type-blind per-bucket cell count filled by World.fillDensity this tick (a grid measure, not an
    // overlap count — a repulsion-relaxed packed field has no strict overlaps but high grid density).
    // crowdDivideCap defaults to 65535 (OFF → density never filled → guard never fires). PHOTO only:
    // free DIGESTIVE predators are prey-limited not space-limited, and organism cells returned above.
    if (type === CellType.PHOTO && f.localDensity[i]! > crowdDivideCap) continue;
    if (f.energy[i]! < divideThreshold) continue;
    const child = store.alloc();
    if (child < 0) break; // at capacity — refuse-new
    const half = (f.energy[i]! - divideCost) * 0.5;
    f.energy[i] = half;
    f.energy[child] = half;
    const angle = hashFloat3(seed, tick, i) * Math.PI * 2;
    f.posX[child] = wrap(f.posX[i]! + Math.cos(angle) * divideJitter, worldWidth);
    f.posY[child] = wrap(f.posY[i]! + Math.sin(angle) * divideJitter, worldHeight);
    f.velX[child] = 0;
    f.velY[child] = 0;
    f.forceX[child] = 0;
    f.forceY[child] = 0;
    f.radius[child] = f.radius[i]!;
    f.mass[child] = f.mass[i]!;
    f.cellType[child] = f.cellType[i]!;
    f.organismId[child] = 0;
    f.genomeRef[child] = 0;
    f.brainRef[child] = 0;
    f.age[child] = 0;
    f.heading[child] = f.heading[i]!; // inherit parent heading (not a garbage recycled angle)
    f.senseX[child] = 0;
    f.senseY[child] = 0;
    f.thrust[child] = 0;
    f.anchored[child] = 0;
    f.localDensity[child] = 0; // clear the recycled slot's stale density (next fillDensity overwrites it; reset so no mid-tick reader ever sees a prior occupant's value)
    births++;
  }

  out.births = births;
  out.deaths = deaths;
}
