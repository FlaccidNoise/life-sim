/**
 * PLANT PROBE — increment 1's acceptance instrument for plans/2026-09-plants-as-entities.md.
 *
 * Every number in the plan's §3.2 sizing (standing crop ~700,000, mean fertility 3.28, mean light 0.658,
 * 1.62 plants per 32 u cell, NND 12.56 u, mean n 14.6 in a 3×3) is a PREDICTION derived from measurements
 * taken outside this system. This prints the realised value beside each prediction so the derivation can
 * be re-run against reality rather than assumed.
 *
 * Run: npx tsx src/headless/plant-probe.ts [seeds] [tickList] [k=v overrides…]
 *   npx tsx src/headless/plant-probe.ts 1-3 0,2000,8000
 *   npx tsx src/headless/plant-probe.ts 1-5 0,2000,8000,20000 plantCellCap=2
 */
import { World } from '../core/world';
import { defaultConfig, type Config } from '../core/config';
import { PLANT_GENE_COUNT, PlantGene } from '../core/plants';
import { lightAxis, lightAtAxis } from '../core/abiotic';
import { Rng } from '../core/rng';
import { livingWorldOverrides } from '../app/living-world-config';

/** "1-5" or "3" → the list of seeds. */
function parseSeeds(spec: string): number[] {
  const m = /^(\d+)-(\d+)$/.exec(spec);
  if (m) {
    const out: number[] = [];
    for (let s = Number(m[1]); s <= Number(m[2]); s++) out.push(s);
    return out;
  }
  return spec.split(',').map(Number);
}

const seeds = parseSeeds(process.argv[2] ?? '1-3');
const sampleTicks = (process.argv[3] ?? '0,2000,8000,20000').split(',').map(Number);
const extra: Record<string, unknown> = {};
for (const a of process.argv.slice(4)) {
  const [k, v] = a.split('=');
  if (!k || v === undefined) continue;
  extra[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
}
const lastTick = Math.max(...sampleTicks);

/** Cells at or above plantGermFertility, and the mean fertility over them — the germination footprint the
 *  whole §3.2 derivation is taken over. Independent of the plants, so it is measured once per seed. */
function footprint(
  world: World,
  cfg: Config,
): { cells: number; meanFert: number; meanLight: number } {
  const map = world.food.fertilityMap();
  const axis = lightAxis(cfg);
  const cw = cfg.worldWidth / cfg.foodCols;
  const ch = cfg.worldHeight / cfg.foodRows;
  let cells = 0;
  let fert = 0;
  let light = 0;
  for (let r = 0; r < cfg.foodRows; r++) {
    for (let c = 0; c < cfg.foodCols; c++) {
      const f = map[r * cfg.foodCols + c]!;
      if (f < cfg.plantGermFertility) continue;
      cells++;
      fert += f;
      light += lightAtAxis((c + 0.5) * cw, (r + 0.5) * ch, axis);
    }
  }
  return { cells, meanFert: cells ? fert / cells : 0, meanLight: cells ? light / cells : 0 };
}

interface Row {
  tick: number;
  count: number;
  biomass: number;
  saturation: number;
  meanN: number;
  nnd: number;
  inReach: number;
  pocketsOccupied: number;
  speciesSigma: number;
  msPerTick: number;
}

/**
 * Realised local density, sampled at RANDOM POINTS INSIDE THE FOOTPRINT rather than over the whole world:
 *  - `nnd`  mean nearest-plant distance — must be under biteRange or a grazer standing on food still
 *           cannot reach any of it (the recorded NND ~75 u ≫ biteRange 16 density wall).
 *  - `inReach` mean plants within plantGrazeRange — the areal input §3.2a sizes GROWTH_RATE on, and the
 *           early warning for §11 risk 7. The footprint AVERAGE can pass while this fails.
 * Sampling uses its own Rng so it never touches any simulation stream.
 */
function densitySample(
  world: World,
  cfg: Config,
  samples: number,
): { nnd: number; inReach: number } {
  const p = world.plants;
  if (p === null || p.liveCount === 0) return { nnd: NaN, inReach: 0 };
  const rng = new Rng(0xd0d0);
  const map = world.food.fertilityMap();
  const cw = cfg.worldWidth / cfg.foodCols;
  const ch = cfg.worldHeight / cfg.foodRows;
  const reach2 = cfg.plantGrazeRange * cfg.plantGrazeRange;
  let nndSum = 0;
  let nndN = 0;
  let reachSum = 0;
  let taken = 0;
  for (let attempt = 0; attempt < samples * 200 && taken < samples; attempt++) {
    const px = rng.range(0, cfg.worldWidth);
    const py = rng.range(0, cfg.worldHeight);
    const ci = Math.min(cfg.foodCols - 1, Math.floor(px / cw));
    const ri = Math.min(cfg.foodRows - 1, Math.floor(py / ch));
    if (map[ri * cfg.foodCols + ci]! < cfg.plantGermFertility) continue;
    taken++;
    let best = Infinity;
    let inReach = 0;
    p.hash.forEachNeighbor(px, py, (j) => {
      let dx = p.x[j]! - px;
      let dy = p.y[j]! - py;
      if (dx > cfg.worldWidth * 0.5) dx -= cfg.worldWidth;
      else if (dx < -cfg.worldWidth * 0.5) dx += cfg.worldWidth;
      if (dy > cfg.worldHeight * 0.5) dy -= cfg.worldHeight;
      else if (dy < -cfg.worldHeight * 0.5) dy += cfg.worldHeight;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
      if (d2 <= reach2) inReach++;
    });
    if (best < Infinity) {
      nndSum += Math.sqrt(best);
      nndN++;
    }
    reachSum += inReach;
  }
  return { nnd: nndN ? nndSum / nndN : NaN, inReach: taken ? reachSum / taken : 0 };
}

/** Mean live plants in a 3×3 plant-hash neighbourhood — the `n` both crowd terms read. */
function meanNeighbourCount(world: World, cfg: Config): number {
  const p = world.plants;
  if (p === null || p.liveCount === 0) return 0;
  const r2 = cfg.plantShadeRange * cfg.plantShadeRange;
  const stride = Math.max(1, Math.floor(p.liveCount / 2000)); // sample: this is an O(n·k) scan
  let sum = 0;
  let n = 0;
  for (let k = 0; k < p.liveCount; k += stride) {
    const i = p.liveIndices[k]!;
    const px = p.x[i]!;
    const py = p.y[i]!;
    let c = 0;
    p.hash.forEachNeighbor(px, py, (j) => {
      if (j === i) return;
      let dx = p.x[j]! - px;
      let dy = p.y[j]! - py;
      if (dx > cfg.worldWidth * 0.5) dx -= cfg.worldWidth;
      else if (dx < -cfg.worldWidth * 0.5) dx += cfg.worldWidth;
      if (dy > cfg.worldHeight * 0.5) dy -= cfg.worldHeight;
      else if (dy < -cfg.worldHeight * 0.5) dy += cfg.worldHeight;
      if (dx * dx + dy * dy <= r2) c++;
    });
    sum += c;
    n++;
  }
  return n ? sum / n : 0;
}

/**
 * Per-pocket occupancy, split by whether a pocket CAN hold plants at all — increment 2's extinction gate
 * needs this baseline, and it is only interpretable against the eligible count.
 * A pocket whose peak fertility is below plantGermFertility has ZERO eligible cells, so it is
 * structurally plant-free rather than extinct. At the demo's foodPatchRichness 3 with RichnessVar 0.8,
 * per-pocket peaks span ~1.0 to 5.0 and MEASURABLY some fall under the 2.0 threshold: 3/20 pockets on
 * seed 1, 1/20 on seed 2, 0/20 on seed 3. So "all 20 occupied" is unreachable at this threshold, and the
 * meaningful baseline is occupied-of-eligible.
 */
function pocketEligibility(world: World, cfg: Config): number {
  const map = world.food.fertilityMap();
  const cw = cfg.worldWidth / cfg.foodCols;
  const ch = cfg.worldHeight / cfg.foodRows;
  const radius = (cfg.foodPatchRadius * cfg.worldWidth) / cfg.foodCols;
  const r2 = radius * radius;
  let eligible = 0;
  for (const c of world.food.pocketCentres()) {
    let any = false;
    for (let r = 0; r < cfg.foodRows && !any; r++) {
      for (let col = 0; col < cfg.foodCols && !any; col++) {
        let dx = (col + 0.5) * cw - c.x;
        let dy = (r + 0.5) * ch - c.y;
        if (dx > cfg.worldWidth * 0.5) dx -= cfg.worldWidth;
        else if (dx < -cfg.worldWidth * 0.5) dx += cfg.worldWidth;
        if (dy > cfg.worldHeight * 0.5) dy -= cfg.worldHeight;
        else if (dy < -cfg.worldHeight * 0.5) dy += cfg.worldHeight;
        if (dx * dx + dy * dy > r2) continue;
        if (map[r * cfg.foodCols + col]! >= cfg.plantGermFertility) any = true;
      }
    }
    if (any) eligible++;
  }
  return eligible;
}

function pocketsOccupied(world: World, cfg: Config): number {
  const p = world.plants;
  if (p === null) return 0;
  const centres = world.food.pocketCentres();
  const radius = (cfg.foodPatchRadius * cfg.worldWidth) / cfg.foodCols;
  const r2 = radius * radius;
  let occupied = 0;
  for (const c of centres) {
    let found = false;
    for (let k = 0; k < p.liveCount && !found; k++) {
      const i = p.liveIndices[k]!;
      let dx = p.x[i]! - c.x;
      let dy = p.y[i]! - c.y;
      if (dx > cfg.worldWidth * 0.5) dx -= cfg.worldWidth;
      else if (dx < -cfg.worldWidth * 0.5) dx += cfg.worldWidth;
      if (dy > cfg.worldHeight * 0.5) dy -= cfg.worldHeight;
      else if (dy < -cfg.worldHeight * 0.5) dy += cfg.worldHeight;
      if (dx * dx + dy * dy <= r2) found = true;
    }
    if (found) occupied++;
  }
  return occupied;
}

/**
 * Σ Kcell over the whole grid — the food field's integrated standing crop, which is the quantity §3.2's
 * single sizing equation N·K_p = 700,000 was fitted to. It differs per seed (658,315 / 701,453 / 739,482
 * on seeds 1/2/3, all three reproduced exactly here), so gating plant biomass against a cross-seed
 * constant would charge a seed for its own map. This is the honest reference.
 */
function standingCropReference(world: World, cfg: Config): number {
  const cw = cfg.worldWidth / cfg.foodCols;
  const ch = cfg.worldHeight / cfg.foodRows;
  let sum = 0;
  for (let r = 0; r < cfg.foodRows; r++)
    for (let c = 0; c < cfg.foodCols; c++) sum += world.food.capacityAt((c + 0.5) * cw, (r + 0.5) * ch);
  return sum;
}

function speciesSigma(world: World): number {
  const p = world.plants;
  if (p === null || p.liveCount === 0) return 0;
  let sum = 0;
  let sumSq = 0;
  for (let k = 0; k < p.liveCount; k++) {
    const v = p.genes[p.liveIndices[k]! * PLANT_GENE_COUNT + PlantGene.SPECIES]!;
    sum += v;
    sumSq += v * v;
  }
  const m = sum / p.liveCount;
  return Math.sqrt(Math.max(0, sumSq / p.liveCount - m * m));
}

const pad = (s: string | number, w: number): string => String(s).padStart(w);

for (const seed of seeds) {
  const cfg: Config = defaultConfig({
    seed,
    ...livingWorldOverrides,
    plantsEnabled: true,
    ...extra,
  });
  const world = new World(cfg);
  const fp = footprint(world, cfg);
  const eligiblePockets = pocketEligibility(world, cfg);
  const cropRef = standingCropReference(world, cfg);
  process.stdout.write(
    `\nseed ${seed} · footprint ${fp.cells} cells (${((100 * fp.cells) / (cfg.foodCols * cfg.foodRows)).toFixed(1)}% of world, prediction 2,904)` +
      ` · mean fertility ${fp.meanFert.toFixed(2)} (3.28) · mean light ${fp.meanLight.toFixed(3)} (0.658)\n` +
      `  pockets able to hold plants at plantGermFertility ${cfg.plantGermFertility}: ${eligiblePockets}/${cfg.foodPatchCount}` +
      ` (the rest have no cell above the threshold — structurally plant-free, not extinct)\n` +
      `  Σ Kcell (this seed's own standing-crop reference, the §3.2 sizing target): ${Math.round(cropRef).toLocaleString('en-US')}\n`,
  );
  process.stdout.write(
    `${pad('tick', 7)}${pad('plants', 8)}${pad('Σenergy', 11)}${pad('pool%', 7)}${pad('meanN', 7)}` +
      `${pad('NND', 7)}${pad('inReach', 9)}${pad('pockets', 9)}${pad('specσ', 7)}${pad('ms/tick', 9)}\n`,
  );
  const rows: Row[] = [];
  let t = 0;
  let winStart = performance.now();
  let winTicks = 0;
  for (const target of sampleTicks) {
    while (t < target) {
      world.step();
      t++;
      winTicks++;
    }
    const msPerTick = winTicks > 0 ? (performance.now() - winStart) / winTicks : NaN;
    const p = world.plants!;
    const d = densitySample(world, cfg, 400);
    const row: Row = {
      tick: t,
      count: p.liveCount,
      biomass: p.totalBiomass(),
      saturation: p.liveCount / cfg.plantCapacity,
      meanN: meanNeighbourCount(world, cfg),
      nnd: d.nnd,
      inReach: d.inReach,
      pocketsOccupied: pocketsOccupied(world, cfg),
      speciesSigma: speciesSigma(world),
      msPerTick,
    };
    rows.push(row);
    process.stdout.write(
      `${pad(row.tick, 7)}${pad(row.count, 8)}${pad(Math.round(row.biomass).toLocaleString('en-US'), 11)}` +
        `${pad((100 * row.saturation).toFixed(0) + '%', 7)}${pad(row.meanN.toFixed(1), 7)}` +
        `${pad(row.nnd.toFixed(1), 7)}${pad(row.inReach.toFixed(2), 9)}` +
        `${pad(`${row.pocketsOccupied}/${cfg.foodPatchCount}`, 9)}${pad(row.speciesSigma.toFixed(3), 7)}` +
        `${pad(Number.isNaN(row.msPerTick) ? '-' : row.msPerTick.toFixed(3), 9)}\n`,
    );
    winStart = performance.now();
    winTicks = 0;
  }
  // Increment-1 gates, evaluated at the last sampled tick.
  const last = rows[rows.length - 1]!;
  const gates: [string, boolean, string][] = [
    ['count 14,000-28,000', last.count >= 14000 && last.count <= 28000, `${last.count}`],
    [
      `Σenergy within ±30% of this seed's Σ Kcell ${Math.round(cropRef).toLocaleString('en-US')}`,
      last.biomass >= 0.7 * cropRef && last.biomass <= 1.3 * cropRef,
      `${Math.round(last.biomass).toLocaleString('en-US')} (${(last.biomass / cropRef).toFixed(2)}x)`,
    ],
    ['pool saturation < 90%', last.saturation < 0.9, `${(100 * last.saturation).toFixed(0)}%`],
    ['NND < 16 u (biteRange)', last.nnd < 16, last.nnd.toFixed(1)],
    ['plants in reach ≥ 3.5', last.inReach >= 3.5, last.inReach.toFixed(2)],
    [
      'every ELIGIBLE pocket occupied',
      last.pocketsOccupied === eligiblePockets,
      `${last.pocketsOccupied}/${eligiblePockets}`,
    ],
    ['no extinction', last.count > 0, `${last.count}`],
  ];
  for (const [name, ok, value] of gates)
    process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${name} — ${value}\n`);
}
process.stdout.write(
  `\n(ms/tick is wall clock over each window; run with the machine otherwise idle)\n`,
);
process.stdout.write(`last tick sampled: ${lastTick}\n`);
