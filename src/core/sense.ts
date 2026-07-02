/**
 * SENSE step (Phase 3) — each organism samples the local FOOD GRADIENT (central difference of the
 * biomass field one `step` apart, toroidal) into its transient senseX/senseY (world frame). This is
 * the perception the steering controller acts on, and the first of the senses the spec calls for
 * (smell = a diffuse chemical gradient). Allocation-free, ascending order; reads the field as left by
 * the previous tick's FIELDS stage (the documented one-tick coupling).
 */
import { type OrganismStore } from './store';
import { type FoodField } from './food-field';
import { type SpatialHash } from './spatial-hash';
import { type Config } from './config';
import { type Walls } from './walls';
import { type FlowField } from './flow-field';
import { type ScentField, SCENT_CHANNELS } from './scent-field';
import { type PheroField } from './phero-field';
import { type Parcels } from './parcels';
import { ScalarGene, SCALAR_GENE_COUNT } from './genome';

function wrap(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}

/** Shortest signed delta a→b on a torus of the given size (|result| ≤ size/2). */
function wrapDelta(d: number, size: number): number {
  const h = size * 0.5;
  if (d > h) return d - size;
  if (d < -h) return d + size;
  return d;
}

/**
 * Each creature samples the food gradient over its OWN evolved SENSE_RANGE gene (the central-difference
 * half-step). A longer range smells biomass further off but blurs fine structure; a shorter range reads
 * the local gradient sharply — so the best range depends on the food's spatial scale (selection acts).
 */
export function senseFood(store: OrganismStore, food: FoodField, cfg: Config): void {
  const { liveIndices, liveCount, x, y, senseX, senseY, scalarGenes } = store;
  const { worldWidth, worldHeight } = cfg;
  const twoChannel = cfg.foodChannels === 2;
  const threeChannel = cfg.foodChannels === 3;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    const step = scalarGenes[sg + ScalarGene.SENSE_RANGE]!;
    const inv = 1 / (2 * step);
    const xi = x[i]!;
    const yi = y[i]!;
    if (threeChannel) {
      // THREE place-coupled channels: a barycentric preference over {A,B,C} from FORAGE_PREF + FORAGE_PREF_C
      // (wA+wB+wC=1), each channel smelled at its OWN evolved range (A=SENSE_RANGE, B=SENSE_RANGE_B,
      // C=SENSE_RANGE_C) so a C-specialist navigates up its own resource's gradient. grad = Σ w_ch·∇ch.
      const pref = scalarGenes[sg + ScalarGene.FORAGE_PREF]!;
      const prefC = scalarGenes[sg + ScalarGene.FORAGE_PREF_C]!;
      const wC = prefC;
      const wB = pref * (1 - prefC);
      const wA = (1 - pref) * (1 - prefC);
      const stepB = scalarGenes[sg + ScalarGene.SENSE_RANGE_B]!;
      const stepC = scalarGenes[sg + ScalarGene.SENSE_RANGE_C]!;
      const invB = 1 / (2 * stepB);
      const invC = 1 / (2 * stepC);
      // Channel A at SENSE_RANGE (step), B at SENSE_RANGE_B (stepB), C at SENSE_RANGE_C (stepC).
      const axp = wrap(xi + step, worldWidth);
      const axm = wrap(xi - step, worldWidth);
      const ayp = wrap(yi + step, worldHeight);
      const aym = wrap(yi - step, worldHeight);
      const bxp = wrap(xi + stepB, worldWidth);
      const bxm = wrap(xi - stepB, worldWidth);
      const byp = wrap(yi + stepB, worldHeight);
      const bym = wrap(yi - stepB, worldHeight);
      const cxp = wrap(xi + stepC, worldWidth);
      const cxm = wrap(xi - stepC, worldWidth);
      const cyp = wrap(yi + stepC, worldHeight);
      const cym = wrap(yi - stepC, worldHeight);
      senseX[i] =
        wA * (food.sampleAt(axp, yi) - food.sampleAt(axm, yi)) * inv +
        wB * (food.sampleAt2(bxp, yi) - food.sampleAt2(bxm, yi)) * invB +
        wC * (food.sampleAt3(cxp, yi) - food.sampleAt3(cxm, yi)) * invC;
      senseY[i] =
        wA * (food.sampleAt(xi, ayp) - food.sampleAt(xi, aym)) * inv +
        wB * (food.sampleAt2(xi, byp) - food.sampleAt2(xi, bym)) * invB +
        wC * (food.sampleAt3(xi, cyp) - food.sampleAt3(xi, cym)) * invC;
    } else if (twoChannel) {
      // Smell a PREFERENCE-BLENDED gradient (lever B): a B-specialist (FORAGE_PREF→1) is pulled toward
      // channel-B-rich cells, an A-specialist toward channel A — so each creature navigates to its own
      // niche instead of all chasing one resource. grad = (1−pref)·∇A + pref·∇B.
      const pref = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.FORAGE_PREF]!;
      const wA = 1 - pref;
      const wB = pref;
      const xp = wrap(xi + step, worldWidth);
      const xm = wrap(xi - step, worldWidth);
      const yp = wrap(yi + step, worldHeight);
      const ym = wrap(yi - step, worldHeight);
      senseX[i] =
        (wA * (food.sampleAt(xp, yi) - food.sampleAt(xm, yi)) +
          wB * (food.sampleAt2(xp, yi) - food.sampleAt2(xm, yi))) *
        inv;
      senseY[i] =
        (wA * (food.sampleAt(xi, yp) - food.sampleAt(xi, ym)) +
          wB * (food.sampleAt2(xi, yp) - food.sampleAt2(xi, ym))) *
        inv;
    } else {
      // Single channel (byte-identical original).
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
}

/** Fill the per-creature environment senses (world frame): the wall-proximity gradient (points away from
 *  walls) and the local flow vector. Gated — each writes 0 when its feature is absent (so the brain inputs
 *  are inert and the all-off state is byte-identical). Allocation-free, ascending order. */
export function senseEnv(
  store: OrganismStore,
  walls: Walls | null,
  flow: FlowField | null,
  scent: ScentField | null,
  glowField: PheroField | null,
  cfg: Config,
): void {
  const { liveIndices, liveCount, x, y, wallSenseX, wallSenseY, flowSenseX, flowSenseY } = store;
  const { scentSenseX, scentSenseY, glowSenseX, glowSenseY, scalarGenes } = store;
  const wallsOn = walls !== null && walls.active;
  const flowOn = flow !== null && cfg.flowStrength > 0;
  // Scent sense is live only when the field is allocated (cfg.pheromoneEnabled). Each of the N channels'
  // ∇P is sampled at the creature's own SENSE_RANGE gene (the same smell half-step as the food gradient),
  // so the perception is at the creature's evolved scale. When off, all channels stay 0 → PHERO inputs inert.
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    if (wallsOn) {
      const g = walls.proxGradAt(x[i]!, y[i]!, cfg.wallSenseRange);
      wallSenseX[i] = g.gx;
      wallSenseY[i] = g.gy;
    } else {
      wallSenseX[i] = 0;
      wallSenseY[i] = 0;
    }
    if (flowOn) {
      flowSenseX[i] = flow.sampleX(x[i]!, y[i]!);
      flowSenseY[i] = flow.sampleY(x[i]!, y[i]!);
    } else {
      flowSenseX[i] = 0;
      flowSenseY[i] = 0;
    }
    if (scent !== null) {
      const step = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SENSE_RANGE]!;
      scent.gradientsInto(x[i]!, y[i]!, step, scentSenseX, scentSenseY, i * SCENT_CHANNELS);
    } else {
      const b = i * SCENT_CHANNELS;
      for (let c = 0; c < SCENT_CHANNELS; c++) {
        scentSenseX[b + c] = 0;
        scentSenseY[b + c] = 0;
      }
    }
    // Glow sense (slice F3): the ∇G gradient of the glow field, sampled at the creature's own SENSE_RANGE
    // (same half-step as food/phero). Live only when the field is allocated (cfg.glowSense); else 0 → the
    // GLOW_SENSE brain inputs are inert. This is the receiver side of the glow communication channel.
    if (glowField !== null) {
      const step = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SENSE_RANGE]!;
      const g = glowField.gradientAt(x[i]!, y[i]!, step);
      glowSenseX[i] = g.gx;
      glowSenseY[i] = g.gy;
    } else {
      glowSenseX[i] = 0;
      glowSenseY[i] = 0;
    }
  }
}

/**
 * SIGHT — each creature looks for other creatures within its VISION cone (half-angle VISION_FOV) out to
 * VISION_RANGE, and builds an APPEAL-SIGNED pull vector (world frame) into sightX/sightY: each seen
 * creature contributes `unit(self→other) · (myDiet − itsDiet) · closeness · acuity`. So a more-
 * carnivorous viewer is pulled TOWARD less-carnivorous creatures (prey) and a less-carnivorous viewer
 * is pushed AWAY from more-carnivorous ones (threats) — chase and flee fall out of the same sign, and
 * the brain just steers along this vector (its sight weights evolve how strongly). Scans a fixed 5×5
 * hash neighborhood (±2 cells ≈ the 24u range cap); ascending order; toroidal-correct.
 */
/** Hard cap on the sight-scan half-width in hash cells, so a runaway vision gene can't make the scan
 *  unbounded. Raised 24→96 (diversity pass) to match the TRIPLED VISION_RANGE cap (1152u / ~12u cell ≈ 96
 *  cells) so the long-sight gene is REAL, not shadowed by this cap. Scan area is (2·cr+1)² ≈ range²: a
 *  max-range creature now scans ~96² vs ~24² cells (~15× more). The per-creature cr still derives from each
 *  creature's own range, so only creatures that evolve big eyes pay it — visionRangeCost gates how many do. */
const MAX_VISION_CELLS = 96;

export function senseCreatures(
  store: OrganismStore,
  hash: SpatialHash,
  cfg: Config,
  walls: Walls | null,
  parcels: Parcels | null,
): void {
  const { liveIndices, liveCount, x, y, heading, hue, sightX, sightY, scalarGenes } = store;
  const occludes = walls !== null && walls.active && cfg.wallOccludesVision;
  const { cols, rows, bucketStart, sorted } = hash;
  const ww = cfg.worldWidth;
  const wh = cfg.worldHeight;
  const cellW = ww / cols;
  const cellH = wh / rows;
  const cellSize = Math.min(cellW, cellH);
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const sg = i * SCALAR_GENE_COUNT;
    sightX[i] = 0;
    sightY[i] = 0;
    const range = scalarGenes[sg + ScalarGene.VISION_RANGE]!;
    const acuity = scalarGenes[sg + ScalarGene.VISION_ACUITY]!;
    if (range <= 0 || acuity <= 0) continue; // blind
    const range2 = range * range;
    const cosFov = Math.cos(scalarGenes[sg + ScalarGene.VISION_FOV]!);
    const myDiet = scalarGenes[sg + ScalarGene.DIET]!;
    const mySize = scalarGenes[sg + ScalarGene.SIZE]!;
    // Shelter-seeking strength (gene × global ablation/tuning gain). Pulls toward LARGER, similar-diet
    // creatures so small prey cluster around big grazers; diet-similarity gates it so prey still flee
    // big predators (the chase/flee appeal dominates there). 0 → no shelter pull (the ablation).
    const shelter = scalarGenes[sg + ScalarGene.SHELTER_DRIVE]! * cfg.shelterGain;
    // Schooling strength (gene × global ablation/tuning gain). Pulls toward neighbors so creatures herd
    // into schools — hue-blind by default (all neighbors), or same-hue-only when cohesionHueBlind is off
    // (kin-clumps). 0 → no cohesion pull (the ablation). See the hue-blind branch below.
    const cohesion = scalarGenes[sg + ScalarGene.COHESION_DRIVE]! * cfg.cohesionGain;
    const myHue = hue[i]!;
    const xi = x[i]!;
    const yi = y[i]!;
    const hx = Math.cos(heading[i]!);
    const hy = Math.sin(heading[i]!);
    const cx = hash.colOf(xi);
    const cy = hash.rowOf(yi);
    // Scan a neighborhood sized to THIS creature's vision range (so big eyes see far, small eyes cheap).
    // Capped both by MAX_VISION_CELLS and by half the grid, so the toroidal scan never wraps onto itself
    // and double-counts. A 0-range creature was already skipped above.
    const halfGrid = Math.floor((Math.min(cols, rows) - 1) / 2);
    const cr = Math.min(MAX_VISION_CELLS, halfGrid, Math.max(1, Math.ceil(range / cellSize)));
    let sx = 0;
    let sy = 0;
    for (let dyc = -cr; dyc <= cr; dyc++) {
      const by = (cy + dyc + rows) % rows;
      for (let dxc = -cr; dxc <= cr; dxc++) {
        const bx = (cx + dxc + cols) % cols;
        const bkt = by * cols + bx;
        const end = bucketStart[bkt + 1]!;
        for (let idx = bucketStart[bkt]!; idx < end; idx++) {
          const j = sorted[idx]!;
          if (j === i) continue;
          const ddx = wrapDelta(x[j]! - xi, ww); // self → other
          const ddy = wrapDelta(y[j]! - yi, wh);
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 >= range2 || d2 === 0) continue;
          const d = Math.sqrt(d2);
          const inv = 1 / d;
          const ux = ddx * inv;
          const uy = ddy * inv;
          if (ux * hx + uy * hy < cosFov) continue; // outside the vision cone
          if (occludes && walls.losBlocked(xi, yi, x[j]!, y[j]!)) continue; // hidden behind a wall
          const jg = j * SCALAR_GENE_COUNT;
          const itsDiet = scalarGenes[jg + ScalarGene.DIET]!;
          const appeal = myDiet - itsDiet; // sign: +toward prey, −away from threats
          // Shelter pull: toward creatures BIGGER than me (sizeDiff>0), weighted by diet-similarity so it
          // only draws me to my own guild's big bodies — a big predator (dissimilar diet) gets ~no shelter
          // pull and the negative appeal makes me flee it instead.
          const sizeDiff = scalarGenes[jg + ScalarGene.SIZE]! - mySize;
          let pull = appeal;
          if (shelter > 0 && sizeDiff > 0) {
            const dietSim = 1 - Math.abs(appeal); // |myDiet − itsDiet| ∈ [0,1]; 1 = same role
            pull += shelter * sizeDiff * dietSim;
          }
          // Schooling: hue-blind (default) pulls toward ALL neighbors equally so diverse-lineage prey
          // co-school; same-hue mode (cohesionHueBlind:false) scales by hue similarity ∈ [0,1] so only
          // kin attract. The default is hue-blind because it keeps predators fed (see config.ts).
          if (cohesion > 0) {
            if (cfg.cohesionHueBlind) {
              pull += cohesion; // hue-blind: full schooling pull regardless of lineage
            } else {
              let hd = Math.abs(myHue - hue[j]!);
              if (hd > 0.5) hd = 1 - hd; // hue wraps [0,1) → shortest distance ∈ [0,0.5]
              pull += cohesion * (1 - 2 * hd); // identical hue → +cohesion, opposite → 0
            }
          }
          // Mate-seeking pull (life-sim-xa90): while SEEKING, add attraction toward creatures that LOOK
          // like compatible mates — same diet class + similar hue (cheap kin-by-appearance proxy; true
          // compatibility is decided at the contact gate in reproduce). Modular seam: replaced by the
          // kin-scent gradient when that field lands. Bounded by mateSenseAttraction so it can't swamp flee.
          if (store.seeking[i] === 1 && cfg.mateSenseAttraction > 0) {
            const sameClass = myDiet < 0.5 === itsDiet < 0.5 ? 1 : 0;
            if (sameClass) {
              let hd = Math.abs(myHue - hue[j]!);
              if (hd > 0.5) hd = 1 - hd;
              pull += cfg.mateSenseAttraction * (1 - 2 * hd);
            }
          }
          const w = pull * (1 - d / range) * acuity;
          sx += ux * w;
          sy += uy * w;
        }
      }
    }
    // SIGHT-ONLY DRIFTING PARCELS: discrete, smell-less, high-value food motes — perceived ONLY here (the
    // FoodField gradient never carries them), so working eyes are what find them. Each live parcel within
    // this creature's VISION_RANGE (+ FOV cone, + wall LOS when occlusion is on) adds an attractive pull
    // unit(self→parcel)·parcelAppeal·(1−d/range)·acuity into the SAME sight vector the brain already steers
    // along — so the existing VISION_*/SIGHT_* genes drive the chase. Reads only parcel position (never
    // lineage/score). Gated: parcels===null (disabled) skips this entirely → byte-identical OFF. A simple
    // ascending linear scan over the small pool; deterministic. The blind early-continue above already
    // excludes range<=0 / acuity<=0 creatures, so a blind creature can't perceive a parcel.
    if (parcels !== null) {
      const appeal = cfg.parcelAppeal;
      const { alive: pAlive, x: px, y: py, capacity: pCap } = parcels;
      for (let pi = 0; pi < pCap; pi++) {
        if (pAlive[pi] === 0) continue;
        const ddx = wrapDelta(px[pi]! - xi, ww); // self → parcel
        const ddy = wrapDelta(py[pi]! - yi, wh);
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 >= range2 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const inv = 1 / d;
        const ux = ddx * inv;
        const uy = ddy * inv;
        if (ux * hx + uy * hy < cosFov) continue; // outside the vision cone
        if (occludes && walls.losBlocked(xi, yi, px[pi]!, py[pi]!)) continue; // hidden behind a wall
        const w = appeal * (1 - d / range) * acuity;
        sx += ux * w;
        sy += uy * w;
      }
    }
    sightX[i] = sx;
    sightY[i] = sy;
  }
}

/** Count each creature's live neighbors within cfg.crowdSenseRange via the start-of-tick hash — the A1b
 *  interoceptive density sense, written into store.crowding. Independent of vision (a blind creature still
 *  feels its crowd) and of the dead lever-D crowdingMortality scan. Gated on bodySense (skipped → crowding
 *  stays 0). Integer count, ascending live-slot order, RNG-free → deterministic. */
export function senseCrowding(store: OrganismStore, hash: SpatialHash, cfg: Config): void {
  const { liveIndices, liveCount, x, y, crowding } = store;
  if (!cfg.bodySense) return; // steer gates crowdN on bodySense too, so leaving crowding stale is harmless
  const { cols, rows, bucketStart, sorted } = hash;
  const { worldWidth, worldHeight, crowdSenseRange } = cfg;
  const r2 = crowdSenseRange * crowdSenseRange;
  const cellSize = Math.min(worldWidth / cols, worldHeight / rows);
  const halfGrid = Math.floor((Math.min(cols, rows) - 1) / 2);
  const cr = Math.min(halfGrid, Math.max(1, Math.ceil(crowdSenseRange / cellSize)));
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const xi = x[i]!;
    const yi = y[i]!;
    const ci = hash.colOf(xi);
    const cj = hash.rowOf(yi);
    let n = 0;
    for (let dy = -cr; dy <= cr; dy++) {
      const by = (cj + dy + rows) % rows;
      for (let dx = -cr; dx <= cr; dx++) {
        const bx = (ci + dx + cols) % cols;
        const b = by * cols + bx;
        const end = bucketStart[b + 1]!;
        for (let idx = bucketStart[b]!; idx < end; idx++) {
          const j = sorted[idx]!;
          if (j === i) continue;
          const ddx = wrapDelta(xi - x[j]!, worldWidth);
          const ddy = wrapDelta(yi - y[j]!, worldHeight);
          if (ddx * ddx + ddy * ddy <= r2) n++;
        }
      }
    }
    crowding[i] = n;
  }
}

/** Sum the food-field biomass at each creature's body across the active channels into store.fertHere — the
 *  A1c interoceptive "how much food is right here" sense (distinct from the food GRADIENT, which is ~0 at a
 *  pocket's peak). Gated on bodySense (skipped → fertHere stays 0). Field sampling only, ascending live-slot
 *  order, RNG-free → deterministic. steer normalizes by cfg.foodCap. */
export function senseFertility(store: OrganismStore, food: FoodField, cfg: Config): void {
  const { liveIndices, liveCount, x, y, fertHere } = store;
  if (!cfg.bodySense) return; // steer gates fertN on bodySense too, so leaving fertHere stale is harmless
  const channels = cfg.foodChannels;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const xi = x[i]!;
    const yi = y[i]!;
    let b = food.sampleAt(xi, yi);
    if (channels >= 2) b += food.sampleAt2(xi, yi);
    if (channels >= 3) b += food.sampleAt3(xi, yi);
    fertHere[i] = b;
  }
}
