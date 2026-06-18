import { type SpatialHash } from '../spatial/spatial-hash';
import { type LightField } from '../environment/light-field';
import { type CellArrays } from '../memory/cell-store';
import { CellType, isEdibleBy, isFlesh, isNeural } from './types';
import { wrapDelta } from '../math/vec2';
import { type TemperatureField } from '../environment/temperature-field';
import { type ToxinField } from '../environment/toxin-field';

/**
 * Environmental modifiers injected into metabolism each tick.
 * All effects are guarded on their enable flags so OFF = byte-identical to M7.
 */
export interface EnvEffects {
  /** Day/night + seasons light multiplier for photosynthesis (1 = no effect). */
  lightMultiplier: number;
  /** Temperature field or null if temp is disabled. */
  temp: TemperatureField | null;
  tempComfortLow: number;
  tempComfortHigh: number;
  tempColdPenalty: number;
  tempHeatPenalty: number;
  /** Toxin field or null. */
  toxin: ToxinField | null;
  /** Energy loss per unit toxin concentration per tick. 0 = OFF. */
  toxinDamage: number;
  /** Toxin deposited per tick at decaying MEAT cells. 0 = OFF. */
  toxinDepositOnMeatDecay: number;
}

/**
 * METABOLIZE step (§4.3). Allocation-free; the OUTER eater loop runs in canonical
 * ascending live-slot order. Takes scalar economy params (not Config) to keep the
 * cells/ layer off sim/ (§5.1 DAG), matching computeRepulsion/integrate.
 * - PHOTO: gain = photoGain · localLight · area; depletes the local patch.
 * - DIGESTIVE/MOTILE: extracts up to digestRate from the FIRST edible (PHOTO/MEAT)
 *   neighbour found within (ri+rj), scanned in fixed toroidal 3×3 bucket order
 *   (dy=-1..1, dx=-1..1) then ascending within-bucket order — deterministic, but
 *   NOT necessarily the lowest-slot prey. Keeps digestEfficiency of what it takes,
 *   scaled by the clustering multiplier 1 + digestClusterBonus·digestBonus[i] — a
 *   bonded digestive cluster out-harvests lone cells (the multicellular payoff, §4.5).
 *   With no bonds digestBonus is all-zero → multiplier 1 → identical pre-M5 behaviour.
 * - PREDATOR (ecology pass): same FIRST-neighbour 3×3 scan, but eats FLESH (living forager-body
 *   cells) of a DIFFERENT organism — never plants/corpses/other-predators, never its own body. Drains
 *   up to predDigestRate from the prey cell → the prey organism's aggregate falls → it dies atomically
 *   via the existing organism-death path (NO per-cell death; that's deferred). The "different organism"
 *   test is structural (organismId), not lineage. predDigestRate=0 keeps this branch a no-op.
 *   STRIKE-REACH: the bite range is predReach·(ri+rj), not just contact — a gradient-following
 *   predator perpetually lags equal-speed mobile prey by a cell or two, so contact-only predation
 *   nets ~zero bites; reach converts the near-miss into a kill. predReach MUST keep predReach·(ri+rj)
 *   within the 3×3 hash window (≤ ~1.5·cellSize) or distant prey are missed; default 1 = contact-only.
 * - All living cells pay basalCost · area + moveCost · thrust²; SENSOR/NEURON/MOVER
 *   additionally pay neuralCost per tick (the brain isn't free, §4.5; per-synapse cost
 *   deferred). MEAT loses meatDecay per tick.
 * Death and division happen later (lifecycle); this step only moves energy/light.
 */
export function metabolize(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  hash: SpatialHash,
  light: LightField,
  photoGain: number,
  photoDepletion: number,
  digestRate: number,
  digestEfficiency: number,
  basalCost: number,
  meatDecay: number,
  moveCost: number,
  neuralCost: number,
  digestBonus: Uint8Array,
  digestClusterBonus: number,
  env: EnvEffects,
  predDigestRate: number,
  predDigestEfficiency: number,
  predReach: number,
  latchPrey: Uint32Array,
  latchCell: Uint32Array,
  organismCellCount: Uint32Array,
  predLatchRange: number,
): void {
  const { cols, rows, width, height, sorted, bucketStart } = hash;

  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const type = f.cellType[i]!;

    if (type === CellType.MEAT) {
      f.energy[i] = f.energy[i]! - meatDecay;
      if (env.toxinDepositOnMeatDecay > 0 && env.toxin) {
        env.toxin.depositAt(f.posX[i]!, f.posY[i]!, env.toxinDepositOnMeatDecay);
      }
      continue;
    }

    const ri = f.radius[i]!;
    const area = ri * ri;

    if (type === CellType.PHOTO) {
      const xi = f.posX[i]!;
      const yi = f.posY[i]!;
      let gain = photoGain * light.sampleAt(xi, yi) * area;
      if (gain > 0) {
        if (env.lightMultiplier !== 1) gain *= env.lightMultiplier;
        f.energy[i] = f.energy[i]! + gain;
        light.depleteAt(xi, yi, gain * photoDepletion);
      }
    } else if (type === CellType.DIGESTIVE || type === CellType.MOTILE) {
      const xi = f.posX[i]!;
      const yi = f.posY[i]!;
      const cx = hash.colOf(xi);
      const cy = hash.rowOf(yi);
      let eaten = false;
      for (let dy = -1; dy <= 1 && !eaten; dy++) {
        const by = (cy + dy + rows) % rows;
        for (let dx = -1; dx <= 1 && !eaten; dx++) {
          const bx = (cx + dx + cols) % cols;
          const b = by * cols + bx;
          const end = bucketStart[b + 1]!;
          for (let idx = bucketStart[b]!; idx < end; idx++) {
            const j = sorted[idx]!;
            if (j === i) continue;
            if (!isEdibleBy(type, f.cellType[j]!)) continue;
            const ddx = wrapDelta(xi - f.posX[j]!, width);
            const ddy = wrapDelta(yi - f.posY[j]!, height);
            const rsum = ri + f.radius[j]!;
            if (ddx * ddx + ddy * ddy < rsum * rsum) {
              const avail = f.energy[j]!;
              const extracted = avail < digestRate ? avail : digestRate;
              if (extracted > 0) {
                f.energy[j] = avail - extracted;
                const mult = 1 + digestClusterBonus * digestBonus[i]!;
                f.energy[i] = f.energy[i]! + extracted * digestEfficiency * mult;
                eaten = true;
                break;
              }
            }
          }
        }
      }
    } else if (type === CellType.PREDATOR && predDigestRate > 0) {
      // PREDATION with a LATCH. A predator drains ≤1 prey cell/tick, so killing a multi-cell forager
      // takes many ticks; a gradient predator loses a mobile prey after 1-2 bites and never finishes.
      // The latch fixes this: once a predator strikes a prey ORGANISM it stays latched (latchPrey) and
      // keeps draining THAT organism each tick — via whichever of its flesh cells is in the wider HOLD
      // range — until the prey is dead or has escaped the hold. The companion tether (applyLatchTether)
      // physically drags the predator along so a mobile prey can't simply outswim the drain. With
      // predLatchRange=0 the hold is disabled → this degenerates to the old single-strike behaviour.
      const xi = f.posX[i]!;
      const yi = f.posY[i]!;
      const myOrg = f.organismId[i]!;
      const cx = hash.colOf(xi);
      const cy = hash.rowOf(yi);
      const held = predLatchRange > 0 ? latchPrey[i]! : 0;
      const heldAlive = held !== 0 && organismCellCount[held]! > 0;
      let holdJ = -1; // first flesh cell of the HELD organism within HOLD range (keep draining it)
      let strikeJ = -1; // first flesh cell of ANY other organism within STRIKE range (fresh latch)
      for (let dy = -1; dy <= 1; dy++) {
        const by = (cy + dy + rows) % rows;
        for (let dx = -1; dx <= 1; dx++) {
          const bx = (cx + dx + cols) % cols;
          const b = by * cols + bx;
          const end = bucketStart[b + 1]!;
          for (let idx = bucketStart[b]!; idx < end; idx++) {
            const j = sorted[idx]!;
            if (j === i) continue;
            const jOrg = f.organismId[j]!;
            if (jOrg === myOrg) continue; // never eat own body
            if (!isFlesh(f.cellType[j]!)) continue; // flesh only: not plants/corpses/other predators
            if (f.energy[j]! <= 0) continue; // drained-empty cell: nothing to take this tick
            const rsum = ri + f.radius[j]!;
            const ddx = wrapDelta(xi - f.posX[j]!, width);
            const ddy = wrapDelta(yi - f.posY[j]!, height);
            const d2 = ddx * ddx + ddy * ddy;
            if (heldAlive && holdJ < 0 && jOrg === held) {
              const hold = predLatchRange * rsum;
              if (d2 < hold * hold) holdJ = j;
            }
            if (strikeJ < 0) {
              const reach = predReach * rsum; // strike-reach: bite from beyond contact
              if (d2 < reach * reach) strikeJ = j;
            }
          }
        }
      }
      // Prefer keeping the latched prey (sustained kill); otherwise strike a fresh one.
      let prey = -1;
      let newLatch = 0;
      if (holdJ >= 0) {
        prey = holdJ;
        newLatch = held;
      } else if (strikeJ >= 0) {
        prey = strikeJ;
        newLatch = f.organismId[strikeJ]!;
      }
      if (prey >= 0) {
        const avail = f.energy[prey]!;
        const extracted = avail < predDigestRate ? avail : predDigestRate;
        f.energy[prey] = avail - extracted;
        f.energy[i] = f.energy[i]! + extracted * predDigestEfficiency;
        if (predLatchRange > 0) {
          latchPrey[i] = newLatch;
          latchCell[i] = prey + 1; // (cell+1) handle for the tether; 0 = none
        }
      } else if (predLatchRange > 0) {
        latchPrey[i] = 0; // prey dead or escaped the hold → release
        latchCell[i] = 0;
      }
    }

    // basal (all living) + movement (∝ thrust²; 0 for non-movers) + neural (SENSOR/NEURON/MOVER)
    const th = f.thrust[i]!;
    const neural = isNeural(type) ? neuralCost : 0;
    let basal = basalCost * area;
    if (env.temp && (env.tempColdPenalty > 0 || env.tempHeatPenalty > 0)) {
      const t = env.temp.sampleAt(f.posX[i]!, f.posY[i]!);
      let mult = 1;
      if (t < env.tempComfortLow) mult = 1 + env.tempColdPenalty * (env.tempComfortLow - t);
      else if (t > env.tempComfortHigh) mult = 1 + env.tempHeatPenalty * (t - env.tempComfortHigh);
      if (mult !== 1) basal *= mult;
    }
    f.energy[i] = f.energy[i]! - basal - moveCost * th * th - neural;

    // Toxin damage (living cells only).
    if (env.toxinDamage > 0 && env.toxin) {
      f.energy[i] = Math.max(
        0,
        f.energy[i] - env.toxinDamage * env.toxin.sampleAt(f.posX[i]!, f.posY[i]!),
      );
    }
  }
}
