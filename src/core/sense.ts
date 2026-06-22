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
export function senseFood(
  store: OrganismStore,
  food: FoodField,
  worldWidth: number,
  worldHeight: number,
): void {
  const { liveIndices, liveCount, x, y, senseX, senseY, scalarGenes } = store;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const step = scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SENSE_RANGE]!;
    const inv = 1 / (2 * step);
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
 *  unbounded. 24 cells ≈ 288u reach at the default cell size — generous for the long-sight experiment. */
const MAX_VISION_CELLS = 24;

export function senseCreatures(store: OrganismStore, hash: SpatialHash, cfg: Config): void {
  const { liveIndices, liveCount, x, y, heading, sightX, sightY, scalarGenes } = store;
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
          const w = pull * (1 - d / range) * acuity;
          sx += ux * w;
          sy += uy * w;
        }
      }
    }
    sightX[i] = sx;
    sightY[i] = sy;
  }
}
