/**
 * Phase-1 NAVIGATION BASELINE probe (the gate for the senses sub-project). Records TODAY's
 * forager behavior — BEFORE any new senses — so later phases can prove the ≥30% purposefulness
 * improvement from the design's success bar §4. Reports: path-straightness toward food,
 * time-to-food, and lifespan distribution. Pure measurement, no assertions.
 * Run: pnpm exec tsx src/headless/sense-feel-probe.ts
 *
 * FOOD-ZONE PROXY (a deliberate modelling choice — documented so the delta is apples-to-apples):
 * There is no explicit "food zone" object; food accrues where light is brightest (light drives
 * photosynthesis → plants → forager food). So this probe treats the LIGHT FIELD as the food proxy:
 *  - the navigation target ("the zone") is the centre of the globally-brightest light patch;
 *  - "reached food" = the forager centroid sits on a bright (>0.6·lightMax) light cell.
 * Both Phase-1 (no senses) and Phase-4/5 (senses ON) runs use this identical proxy, so the
 * ≥30% delta is measured against a fixed yardstick. CONCERN: the brightest-patch target is a
 * single global zone; today's senseless foragers cannot perceive it, so the baseline straightness
 * is expected to be near-random (drift/diffusion only) — which is exactly the point of the gate.
 */
import { World } from '../core/sim/world';
import { defaultConfig, type Config } from '../core/sim/config';
import { develop } from '../core/genome/develop';
import { instantiateBody } from '../core/organism/instantiate';
import { buildForagerGenome } from '../core/genome/critter-genome';

const BASE: Partial<Config> = {
  worldWidth: 2048,
  worldHeight: 2048,
  // TODAY's economy/movement (defaults) — record the pre-tune baseline. Drift OFF for the
  // baseline reading (driftAmplitude 0). Later phases re-run with drift/senses ON to compare.
  driftAmplitude: 0,
};

function spawnForager(w: World, cfg: Config, x: number, y: number, h: number): number {
  const g = buildForagerGenome(cfg.cellRadius, 100);
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
  bornTick: number;
  reachedFoodTick: number; // -1 until it reaches a high-light cell; -2 once death is recorded
}

function nearestLightPeak(
  w: World,
  x: number,
  y: number,
): { dx: number; dy: number; light: number } {
  // Use the live light field as the food proxy (light drives food). The "zone" target is the
  // centre of the globally-brightest light patch; return the toroidal delta from (x,y) to it.
  const lf = w.light;
  const cols = lf.cols;
  const rows = lf.rows;
  const buf = lf.light;
  let bestI = 0;
  let bestV = -1;
  for (let i = 0; i < buf.length; i++)
    if (buf[i]! > bestV) {
      bestV = buf[i]!;
      bestI = i;
    }
  const pc = bestI % cols;
  const pr = (bestI / cols) | 0;
  const tx = (pc + 0.5) * (w.config.worldWidth / cols);
  const ty = (pr + 0.5) * (w.config.worldHeight / rows);
  let dx = tx - x;
  let dy = ty - y;
  // toroidal wrap
  if (dx > w.config.worldWidth / 2) dx -= w.config.worldWidth;
  if (dx < -w.config.worldWidth / 2) dx += w.config.worldWidth;
  if (dy > w.config.worldHeight / 2) dy -= w.config.worldHeight;
  if (dy < -w.config.worldHeight / 2) dy += w.config.worldHeight;
  return { dx, dy, light: lf.sampleAt(x, y) };
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
  const cfg = defaultConfig({ ...BASE, seed, maxCells: 4000 });
  const w = new World(cfg, false);
  w.seedLife(1500);
  // Drop a handful of foragers at fixed positions away from the brightest zone so they must navigate.
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
      bornTick: 0,
      reachedFoodTick: -1,
    });
  }
  const TICKS = 6000;
  const lifespans: number[] = [];
  for (let t = 0; t < TICKS; t++) {
    w.tick();
    for (const tr of tracked) {
      const c = orgCentroid(w, tr.org);
      if (!c.alive) {
        if (tr.reachedFoodTick === -2) continue; // already recorded death
        lifespans.push(t - tr.bornTick);
        tr.reachedFoodTick = -2; // mark recorded (sentinel)
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
      // time-to-food: first tick the centroid sits on a bright (>0.6·lightMax) cell
      if (tr.reachedFoodTick === -1 && w.light.sampleAt(c.x, c.y) > 0.6 * cfg.lightMax) {
        tr.reachedFoodTick = t;
      }
    }
  }
  // Straightness = net displacement toward the brightest zone / path length (per still-alive tracked).
  let straightSum = 0,
    straightN = 0,
    ttfSum = 0,
    ttfN = 0;
  for (const tr of tracked) {
    const c = orgCentroid(w, tr.org);
    if (c.alive && tr.pathLen > 1) {
      const { dx, dy } = nearestLightPeak(w, tr.startX, tr.startY);
      const goal = Math.hypot(dx, dy);
      // net progress toward the zone vs how far it actually travelled
      const end = nearestLightPeak(w, c.x, c.y);
      const endProgress = goal - Math.hypot(end.dx, end.dy);
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
    `  path-straightness (toward brightest zone): ${straightN ? (straightSum / straightN).toFixed(3) : 'n/a'} (n=${straightN})`,
  );
  console.log(
    `  time-to-food (ticks): mean=${ttfN ? (ttfSum / ttfN).toFixed(0) : 'n/a'} (reached=${ttfN}/${tracked.length})`,
  );
  console.log(
    `  lifespan (ticks): mean=${mean(lifespans).toFixed(0)} median=${pct(lifespans, 0.5)} p90=${pct(lifespans, 0.9)} (deaths=${lifespans.length})`,
  );
}

for (const seed of [3, 7, 42, 99, 123]) run(seed);
