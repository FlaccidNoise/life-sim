/**
 * Phase-1 NAVIGATION BASELINE probe (the gate for the senses sub-project). Records TODAY's
 * forager behavior — BEFORE any new senses — so later phases can prove the ≥30% purposefulness
 * improvement from the design's success bar §4. Reports: path-straightness toward food,
 * time-to-food, and lifespan distribution. Pure measurement, no assertions.
 * Run: pnpm exec tsx src/headless/sense-feel-probe.ts
 *
 * NAVIGATION TARGET — the FOOD-SCENT field (what foragers actually sense):
 * Herbivore foragers steer by the FOOD-SCENT gradient (`world.food`), NOT light — a herbivore
 * sensor reads the `food` field (see src/core/cells/sense.ts: non-carnivore sensors sample `food`).
 * So the navigation landmark here is the PEAK of the food-scent field: the brightest cell of
 * `world.food.field` (the densest forage patch). Plants (PHOTO cells) deposit smell into this
 * field each tick, so its peak tracks where food actually accumulates.
 *  - the navigation target ("the zone") is the centre of the globally-strongest food-scent patch,
 *    captured ONCE after a warm-up so the persistent field has equilibrated into a stable gradient;
 *  - "reached food" = the forager centroid sits on a strong-scent cell (>0.6·current food-field max).
 * Both Phase-1 (no senses) and later senses-ON runs MUST use this identical food-scent target so the
 * ≥30% delta is measured against one fixed yardstick. (We use "reached a high-food-scent cell"
 * rather than "actually ate" because it is non-invasive — no metabolism instrumentation — and it is
 * exactly the gradient a herbivore sensor climbs, so it is the cleanest apples-to-apples signal.)
 *
 * VIABLE ECONOMY (so the metrics are FINITE): under raw defaults every forager starves by ~170
 * ticks → nobody navigates → straightness/time-to-food are n/a. This probe instead mirrors the
 * PROVEN-VIABLE longevity economy from src/headless/feel-probe.ts (cellRadius 4, basalCost 0.004,
 * FORAGER_INIT_E 45, scaled repro/division thresholds, crowdDivideCap, dense plant seed) so foragers
 * SURVIVE long enough to forage and the three metrics come out finite. This is the representative
 * world the senses will be measured in. Deterministic (seeded) and driftAmplitude 0 for the baseline.
 *
 * LIFETIME METRICS (not gated on surviving to the final tick): straightness and time-to-food are
 * recorded over each forager's WHOLE life — straightness from its last live position, the food
 * arrival kept even after it dies. Under any finite-lifespan economy nobody is alive at tick 6000,
 * so an "alive-at-end" gate (or clobbering the arrival on death) zeroes every metric → n/a.
 */
import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { instantiateBody } from '../core/organism/instantiate';
import { buildForagerGenome } from '../core/genome/critter-genome';

// Per-cell seed energy for a forager (matches feel-probe.ts FORAGER_INIT_E; scaled ~0.44 from the
// r6 value of 100 to the r4 cell area).
const FORAGER_INIT_E = 45;

// PROVEN-VIABLE longevity economy (mirrors src/headless/feel-probe.ts BASE + LOCKED): smaller cells
// (r4), low basalCost so creatures bleed ~3× slower and live long enough to traverse the field and
// forage, area-scaled repro/division thresholds, crowdDivideCap so plants have a carrying capacity.
// driftAmplitude 0 → the food zone is stationary for the baseline reading.
const BASE: Partial<Config> = {
  cellRadius: 4,
  worldWidth: 2048,
  worldHeight: 2048,
  basalCost: 0.004, // LONGEVITY: creatures survive long enough to navigate (defaults starve them ~170t)
  crowdDivideCap: 4, // plants get a carrying capacity → a dense, climbable food-scent field
  crowdGridSize: 32,
  divideThreshold: 70, // plant division threshold scaled from 150 (r6) by area ratio
  reproThreshold: 280, // organism repro scaled from 600 (r6) by area ratio
  reproParentFloor: 60,
  organismDeathFloor: 0,
  cruiseThrust: 1,
  maxThrust: 8,
  driftAmplitude: 0,
};

function spawnForager(w: World, cfg: Config, x: number, y: number, h: number): number {
  const g = buildForagerGenome(cfg.cellRadius, FORAGER_INIT_E);
  const ref = w.genomes.register(g);
  const body = develop(g, cfg.maxCellsPerOrganism, cfg.maxRecursionDepth);
  return instantiateBody(
    body,
    w.cells,
    w.net,
    w.bonds,
    w.organisms,
    ref,
    x,
    y,
    h,
    cfg.worldWidth,
    cfg.worldHeight,
    w.instantiateScratch,
    w.glowEffectors,
  );
}

interface Tracked {
  org: number;
  startX: number;
  startY: number;
  pathLen: number;
  prevX: number;
  prevY: number;
  lastX: number; // last live centroid (snapshot for straightness at death)
  lastY: number;
  bornTick: number;
  reachedFoodTick: number; // -1 until the centroid first sits on a high-food-scent cell; else its tick
  deathRecorded: boolean; // true once this forager's lifespan has been pushed
}

/** Centre (world coords) of the globally-strongest cell of the FOOD-SCENT field, plus that max value. */
function foodPeak(w: World): { x: number; y: number; max: number } {
  const ff = w.food;
  const buf = ff.field;
  const cols = ff.cols;
  const rows = ff.rows;
  let bestI = 0;
  let bestV = -1;
  for (let i = 0; i < buf.length; i++)
    if (buf[i]! > bestV) {
      bestV = buf[i]!;
      bestI = i;
    }
  const pc = bestI % cols;
  const pr = (bestI / cols) | 0;
  return {
    x: (pc + 0.5) * (w.config.worldWidth / cols),
    y: (pr + 0.5) * (w.config.worldHeight / rows),
    max: bestV,
  };
}

/** Toroidal delta from (x,y) to the captured food-scent target (tx,ty), and its magnitude. */
function toTarget(w: World, x: number, y: number, tx: number, ty: number): number {
  let dx = tx - x;
  let dy = ty - y;
  const ww = w.config.worldWidth;
  const wh = w.config.worldHeight;
  if (dx > ww / 2) dx -= ww;
  if (dx < -ww / 2) dx += ww;
  if (dy > wh / 2) dy -= wh;
  if (dy < -wh / 2) dy += wh;
  return Math.hypot(dx, dy);
}

function orgCentroid(w: World, org: number): { x: number; y: number; alive: boolean } {
  const f = w.cells.fields;
  let sx = 0,
    sy = 0,
    n = 0;
  for (let i = 0; i < w.cells.capacity; i++) {
    if (w.cells.isAlive(i) && f.organismId[i] === org) {
      sx += f.posX[i]!;
      sy += f.posY[i]!;
      n++;
    }
  }
  if (n === 0) return { x: 0, y: 0, alive: false };
  return { x: sx / n, y: sy / n, alive: true };
}

function run(seed: number): void {
  // Generous cell/bond/organism budget (matches feel-probe.ts): under the longevity economy the
  // seeded plants bloom to their crowd-capped carrying capacity, so a small cap (e.g. 4000) pins out
  // and leaves NO room to instantiate foragers (instantiateBody → -1 → they "die" at tick 0).
  const cfg = defaultConfig({
    ...BASE,
    seed,
    maxCells: 300_000,
    maxBonds: 131_072,
    maxOrganisms: 65_536,
  });
  const w = new World(cfg, false);
  w.seedLife(1500);
  // Warm up so the persistent food-scent field equilibrates into a stable, climbable gradient before
  // we (a) capture the navigation target and (b) drop the foragers. driftAmplitude 0 → the zone is
  // stationary, so the target captured here is the same landmark the foragers face for the whole run.
  const WARMUP = 200;
  for (let t = 0; t < WARMUP; t++) w.tick();
  const target = foodPeak(w); // captured ONCE — the fixed yardstick for straightness + arrival

  // Drop foragers at fixed positions spread across the world so they must navigate toward the zone.
  const tracked: Tracked[] = [];
  for (let k = 0; k < 12; k++) {
    const x = cfg.worldWidth * (0.1 + 0.8 * (k / 12));
    const y = cfg.worldHeight * 0.5;
    const org = spawnForager(w, cfg, x, y, (k * 2.39996) % (Math.PI * 2));
    tracked.push({
      org,
      startX: x,
      startY: y,
      pathLen: 0,
      prevX: x,
      prevY: y,
      lastX: x,
      lastY: y,
      bornTick: WARMUP,
      reachedFoodTick: -1,
      deathRecorded: false,
    });
  }
  const TICKS = 6000;
  const lifespans: number[] = [];
  for (let t = WARMUP; t < WARMUP + TICKS; t++) {
    w.tick();
    const foodMax = foodPeak(w).max;
    for (const tr of tracked) {
      const c = orgCentroid(w, tr.org);
      if (!c.alive) {
        // Record lifespan once, on the first tick we observe the body gone. Do NOT touch
        // reachedFoodTick here — a forager that reached food THEN died must keep its arrival
        // timestamp (the old probe clobbered it on death → every metric read back as n/a).
        if (!tr.deathRecorded) {
          lifespans.push(t - tr.bornTick);
          tr.deathRecorded = true;
        }
        continue;
      }
      // accumulate path length (toroidal step)
      let dpx = c.x - tr.prevX;
      let dpy = c.y - tr.prevY;
      if (dpx > cfg.worldWidth / 2) dpx -= cfg.worldWidth;
      if (dpx < -cfg.worldWidth / 2) dpx += cfg.worldWidth;
      if (dpy > cfg.worldHeight / 2) dpy -= cfg.worldHeight;
      if (dpy < -cfg.worldHeight / 2) dpy += cfg.worldHeight;
      tr.pathLen += Math.hypot(dpx, dpy);
      tr.prevX = c.x;
      tr.prevY = c.y;
      tr.lastX = c.x; // snapshot last LIVE position → straightness is measured even after it dies
      tr.lastY = c.y;
      // time-to-food: first tick the centroid sits on a strong food-scent cell (>0.6·current max).
      if (tr.reachedFoodTick === -1 && foodMax > 0 && w.food.sampleAt(c.x, c.y) > 0.6 * foodMax) {
        tr.reachedFoodTick = t;
      }
    }
  }
  // Straightness = net displacement toward the food-scent zone / path length, over each forager's
  // LIFETIME path (using its last live position). Measured for ALL foragers that moved — not gated on
  // surviving to the final tick, since under any finite-lifespan economy nobody is alive at tick 6000.
  let straightSum = 0,
    straightN = 0,
    ttfSum = 0,
    ttfN = 0;
  for (const tr of tracked) {
    if (tr.pathLen > 1) {
      const goal = toTarget(w, tr.startX, tr.startY, target.x, target.y);
      const remaining = toTarget(w, tr.lastX, tr.lastY, target.x, target.y);
      const endProgress = goal - remaining; // net progress toward the zone
      straightSum += Math.max(0, endProgress) / tr.pathLen;
      straightN++;
    }
    if (tr.reachedFoodTick >= 0) {
      ttfSum += tr.reachedFoodTick - tr.bornTick;
      ttfN++;
    }
  }
  lifespans.sort((a, b) => a - b);
  const mean = (xs: number[]): number =>
    xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
  const pct = (xs: number[], p: number): number =>
    xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]! : 0;
  console.log(`seed=${seed}`);
  console.log(
    `  path-straightness (toward food-scent zone): ${straightN ? (straightSum / straightN).toFixed(3) : 'n/a'} (n=${straightN})`,
  );
  console.log(
    `  time-to-food (ticks): mean=${ttfN ? (ttfSum / ttfN).toFixed(0) : 'n/a'} (reached=${ttfN}/${tracked.length})`,
  );
  console.log(
    `  lifespan (ticks): mean=${mean(lifespans).toFixed(0)} median=${pct(lifespans, 0.5)} p90=${pct(lifespans, 0.9)} (deaths=${lifespans.length})`,
  );
}

for (const seed of [3, 7, 42, 99, 123]) run(seed);
