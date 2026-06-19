/**
 * Scaling benchmark: confirms per-tick cost tracks LIVE population, not buffer capacity.
 * After Phase A1 (CellStore.highWaterMark bounds rebuildLive), a big-capacity sparse world no longer
 * pays a full-capacity scan twice per tick. Run: pnpm exec tsx src/headless/scaling-bench.ts
 *
 * Result (2026-06-18): ~flat ms/tick across maxCells 50k→2M at a fixed ~10k live population.
 * Use this to re-validate Phase A1b / A2 / B3 as the cost model is pushed further toward O(live).
 *
 * Phase 3 (sight): the second section profiles the SIGHT cone-scan cost ceiling at R=3 and R=4
 * (viewRange 48 / 64 at cellSize = 2·cellRadius = 12) vs. a sight-OFF baseline over the SAME world,
 * per the predReach cost-discipline. The spec requires this ceiling recorded before later phases
 * raise viewRange. See the SIGHT CONE section below for how sensors are made to actually fire.
 */
import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { CellType } from '../core/cells/types';
import { SenseSource, SightTarget } from '../core/cells/sense-source';

// ── Section 1: capacity-vs-live scaling (unchanged) ───────────────────────────────────────────
for (const maxCells of [50_000, 500_000, 2_000_000]) {
  const w = new World(
    defaultConfig({ seed: 7, maxCells, worldWidth: 2048, worldHeight: 2048 }),
    false,
  );
  w.spawn(2000, CellType.PHOTO); // sparse: a small live population in a huge buffer
  for (let i = 0; i < 50; i++) w.tick(); // warm
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) w.tick();
  const t1 = process.hrtime.bigint();
  const msPerTick = Number(t1 - t0) / 1e6 / 300;
  console.log(
    `maxCells ${String(maxCells).padStart(9)}  live≈${w.cells.aliveCount}  ` +
      `highWaterMark ${w.cells.highWaterMark}  ${msPerTick.toFixed(3)} ms/tick`,
  );
}

// ── Section 2: SIGHT cone-scan cost ceiling (Phase 3) ─────────────────────────────────────────
// The `sightVector` cone runs ONLY for a SENSOR cell whose `net.sensorSource[k] === SIGHT`, and only
// when `viewRange > 0`. At defaultConfig NO cell is a SIGHT source (founder sight genomes are Phase 4),
// so toggling viewRange alone measures nothing. To make the cone ACTUALLY execute over a populated
// world we directly construct eyes: allocate SENSOR cells, give them a NON-ZERO organismId (so the
// own-organism exclusion `f.organismId[j] === orgI` does NOT skip the PHOTO food, which sits at org 0),
// vary their heading, then register each as a SIGHT/FOOD sensor via `net.addSensor`. The PHOTO field
// provides the FOOD targets the cone classifies (isEdibleBy(MOTILE, PHOTO) === true).
//
// `world.tick()` calls rebuildLive() each tick, so eyes allocated here join the live set automatically;
// `sense()` iterates `net.sensorCount` directly for the SIGHT branch, so the eyes fire every tick.
//
// NOTE on the R label: R = ceil(viewRange / cellSize) with cellSize = 2·cellRadius = 12. The spec
// names viewRange 48 / 64 as "R=3"/"R=4"; the scanned hash block is (2R+1)². With the ceil formula
// these compute to R=4 (48/12) and R=6 (64/12) respectively — the labels are the spec's nominal
// naming, the measured number below is the real per-tick cost at those viewRange values.

const SIGHT_WORLD = 2048;
const FOOD_COUNT = 8000; // PHOTO targets — dense enough that a 48–64u cone finds several per scan
const EYE_COUNT = 2000; // SIGHT eyes — each runs one (2R+1)² bucket scan per tick

/** Build a world with FOOD_COUNT PHOTO + EYE_COUNT SIGHT eyes; eyes share a non-zero organismId. */
function buildSightWorld(viewRange: number): World {
  const w = new World(
    defaultConfig({
      seed: 7,
      maxCells: 50_000,
      worldWidth: SIGHT_WORLD,
      worldHeight: SIGHT_WORLD,
      viewRange,
      viewHalfAngle: Math.PI / 4,
    }),
    false,
  );
  w.spawn(FOOD_COUNT, CellType.PHOTO);
  const f = w.cells.fields;
  for (let e = 0; e < EYE_COUNT; e++) {
    const i = w.cells.alloc();
    if (i < 0) break;
    // Deterministic placement/heading (RNG-free: bench must be reproducible).
    f.posX[i] = ((e * 257) % SIGHT_WORLD) + 0.5;
    f.posY[i] = ((e * 631) % SIGHT_WORLD) + 0.5;
    f.velX[i] = 0;
    f.velY[i] = 0;
    f.forceX[i] = 0;
    f.forceY[i] = 0;
    f.radius[i] = 6;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.SENSOR;
    f.organismId[i] = 1; // non-zero: distinct from PHOTO (org 0) so the cone doesn't self-exclude food
    f.genomeRef[i] = 0;
    f.brainRef[i] = 0;
    f.age[i] = 0;
    f.heading[i] = (e % 8) * (Math.PI / 4);
    f.senseX[i] = 0;
    f.senseY[i] = 0;
    f.thrust[i] = 0;
    w.net.addSensor(i, /* channel */ 0, SenseSource.SIGHT, SightTarget.FOOD);
  }
  return w;
}

function measureSight(label: string, viewRange: number): void {
  const w = buildSightWorld(viewRange);
  const R = viewRange > 0 ? Math.ceil(viewRange / 12) : 0;
  for (let i = 0; i < 50; i++) w.tick(); // warm
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) w.tick();
  const t1 = process.hrtime.bigint();
  const msPerTick = Number(t1 - t0) / 1e6 / 300;
  console.log(
    `${label.padEnd(16)} viewRange ${String(viewRange).padStart(3)} (R=${R})  ` +
      `live≈${w.cells.aliveCount}  eyes ${EYE_COUNT}  ${msPerTick.toFixed(3)} ms/tick`,
  );
}

console.log(
  `\nSIGHT cone-scan cost (${FOOD_COUNT} PHOTO food + ${EYE_COUNT} SIGHT eyes, world ${SIGHT_WORLD}²):`,
);
measureSight('sight-OFF', 0); // same world composition, cone never runs (viewRange 0 gate)
measureSight('sight-R3', 48); // spec R=3 (viewRange 48 @ cellSize 12)
measureSight('sight-R4', 64); // spec R=4 (viewRange 64 @ cellSize 12)
