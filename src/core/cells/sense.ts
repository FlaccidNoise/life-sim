import { type CellArrays } from '../memory/cell-store';
import { type FoodField } from '../environment/food-field';
import { type NoiseField } from '../environment/noise-field';
import { type NeuralNetwork } from '../neural/network';
import { type SpatialHash } from '../spatial/spatial-hash';
import { CellType } from './types';
import { SenseSource } from './sense-source';
import { wrap } from '../math/vec2';

/**
 * SENSE step (§4.3 step 2). Generic scalar-field → gradient-vector sampler: for each sensor-capable
 * cell (MOTILE and SENSOR), central finite-difference of a smell field one patch-width apart
 * (toroidal), written to (senseX, senseY). Reads the field as updated at the END of the previous
 * tick (documented one-tick coupling). Allocation-free; scalar/array params only (§5.1 DAG).
 *
 * Diet routing (ecology pass): a SENSOR cell belonging to a CARNIVORE organism reads `preyField`
 * (the prey-scent gradient → it hunts foragers); every other sensor (herbivore foragers + free
 * MOTILE cells) reads the plant/food field. The carnivore lookup is structural (organismId →
 * organisms.carnivore), never lineage. Both fields share grid geometry, so the FD steps are identical.
 *
 * Prey fleeing (P4, two-way arms race): when `fleeWeight > 0`, a HERBIVORE organism's sensor also
 * subtracts `fleeWeight × ∇predScent` from its steering vector — it climbs the food gradient while
 * sliding DOWN the predator-scent gradient (away from hunters). `predScent` is deposited by carnivore
 * flesh (position/type based, never lineage). `fleeWeight === 0` (default) skips the term entirely →
 * the M2-M7 + Phase-3 economy stays byte-identical.
 *
 * Modality routing (Phase 2): the SMELL/flee path above runs for every MOTILE + SENSOR cell exactly
 * as before; THEN, ONLY when `loudnessGain > 0 || viewRange > 0`, a second pass over the sensor
 * BINDINGS (canonical `net.sensorCell` order, mirroring think.ts) OVERRIDES (senseX, senseY) for any
 * binding whose `net.sensorSource[k]` is HEARING (NoiseField gradient) or SIGHT (a ZERO vector —
 * Phase 3 fills the cone query). With both knobs 0 the override pass is skipped ENTIRELY →
 * byte-identical to the pre-hearing sim. Allocation-free.
 */
export function sense(
  live: Uint32Array,
  n: number,
  f: CellArrays,
  food: FoodField,
  preyField: FoodField,
  carnivore: Uint8Array,
  predField: FoodField,
  fleeWeight: number,
  net: NeuralNetwork,
  noise: NoiseField,
  loudnessGain: number,
  hash: SpatialHash,
  viewRange: number,
  viewHalfAngle: number,
  worldWidth: number,
  worldHeight: number,
): void {
  const hx = food.patchW;
  const hy = food.patchH;
  const w = food.worldWidth;
  const h = food.worldHeight;
  const flee = fleeWeight > 0;
  // ── SMELL/flee path (unchanged): fill (senseX, senseY) for every MOTILE + SENSOR cell. ──
  for (let k = 0; k < n; k++) {
    const i = live[k]!;
    const ct = f.cellType[i]!;
    if (ct !== CellType.MOTILE && ct !== CellType.SENSOR) continue;
    const org = f.organismId[i]!;
    const carnSensor = ct === CellType.SENSOR && org !== 0 && carnivore[org] === 1;
    const field = carnSensor ? preyField : food;
    const x = f.posX[i]!;
    const y = f.posY[i]!;
    let gx = field.sampleAt(wrap(x + hx, w), y) - field.sampleAt(wrap(x - hx, w), y);
    let gy = field.sampleAt(x, wrap(y + hy, h)) - field.sampleAt(x, wrap(y - hy, h));
    // FLEE: a herbivore organism's sensor steers away from predator scent (negative predScent gradient).
    if (flee && org !== 0 && carnivore[org] === 0) {
      gx -=
        fleeWeight *
        (predField.sampleAt(wrap(x + hx, w), y) - predField.sampleAt(wrap(x - hx, w), y));
      gy -=
        fleeWeight *
        (predField.sampleAt(x, wrap(y + hy, h)) - predField.sampleAt(x, wrap(y - hy, h)));
    }
    f.senseX[i] = gx;
    f.senseY[i] = gy;
  }

  // ── Modality override (HEARING/SIGHT): OFF-by-default, skipped when both knobs are 0. ──
  if (loudnessGain <= 0 && viewRange <= 0) return;
  const hearOn = loudnessGain > 0;
  const sightOn = viewRange > 0;
  const nhx = noise.patchW;
  const nhy = noise.patchH;
  const nw = noise.worldWidth;
  const nh = noise.worldHeight;
  const sc = net.sensorCell;
  const src = net.sensorSource;
  const sn = net.sensorCount;
  for (let k = 0; k < sn; k++) {
    const i = sc[k]!;
    if (f.cellType[i]! !== CellType.SENSOR) continue; // recycled slot guard (mirrors think.ts)
    const source = src[k]!;
    if (source === SenseSource.HEARING) {
      if (!hearOn) continue; // leave the SMELL-path value
      const x = f.posX[i]!;
      const y = f.posY[i]!;
      f.senseX[i] = noise.sampleAt(wrap(x + nhx, nw), y) - noise.sampleAt(wrap(x - nhx, nw), y);
      f.senseY[i] = noise.sampleAt(x, wrap(y + nhy, nh)) - noise.sampleAt(x, wrap(y - nhy, nh));
    } else if (source === SenseSource.SIGHT) {
      if (!sightOn) continue; // leave the SMELL-path value
      // Phase 3 wires the cone query (sightVector) here using hash/viewRange/viewHalfAngle/
      // worldWidth/worldHeight. Until then a SIGHT sensor sees nothing → zero vector. The `void`s
      // mark the Phase-3-only params as intentionally unused now (no-unused-vars, trailing args).
      void viewHalfAngle;
      void worldWidth;
      void worldHeight;
      f.senseX[i] = 0;
      f.senseY[i] = 0;
    }
    // SenseSource.SMELL: already filled by the SMELL path above; nothing to do.
  }
}
