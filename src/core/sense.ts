/**
 * SENSE step (Phase 3) — each organism samples the local FOOD GRADIENT (central difference of the
 * biomass field one `step` apart, toroidal) into its transient senseX/senseY (world frame). This is
 * the perception the steering controller acts on, and the first of the senses the spec calls for
 * (smell = a diffuse chemical gradient). Allocation-free, ascending order; reads the field as left by
 * the previous tick's FIELDS stage (the documented one-tick coupling).
 */
import { type OrganismStore } from './store';
import { type FoodField } from './food-field';

function wrap(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}

export function senseFood(
  store: OrganismStore,
  food: FoodField,
  step: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const { liveIndices, liveCount, x, y, senseX, senseY } = store;
  const inv = 1 / (2 * step);
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const xi = x[i]!;
    const yi = y[i]!;
    senseX[i] =
      (food.sampleAt(wrap(xi + step, worldWidth), yi) -
        food.sampleAt(wrap(xi - step, worldWidth), yi)) *
      inv;
    senseY[i] =
      (food.sampleAt(xi, wrap(yi + step, worldHeight)) -
        food.sampleAt(xi, wrap(yi - step, worldHeight))) *
      inv;
  }
}
