/**
 * Scaling benchmark: confirms per-tick cost tracks LIVE population, not buffer capacity.
 * After Phase A1 (CellStore.highWaterMark bounds rebuildLive), a big-capacity sparse world no longer
 * pays a full-capacity scan twice per tick.
 * After Phase A1b + A2 (bond highWaterMark + spatial-hash generation stamps), the hash no longer
 * clears every bucket (the O(area) counts.fill(0) memset is gone). Per-tick cost is ~area-independent
 * at the live-count scale tested (up to 8192²); note the prefix-sum loop still scans all buckets, so
 * a residual ~O(buckets) term remains at very large world areas.
 *
 * Run: pnpm tsx src/headless/scaling-bench.ts
 */
import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { CellType } from '../core/cells/types';

console.log('=== A1: capacity sweep (fixed live count, varying maxCells) ===');
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
    `  maxCells ${String(maxCells).padStart(9)}  live≈${w.cells.aliveCount}  ` +
      `highWaterMark ${String(w.cells.highWaterMark).padStart(7)}  bondHwm ${String(w.bonds.bondHighWaterMark).padStart(7)}  ` +
      `${msPerTick.toFixed(3)} ms/tick`,
  );
}

console.log('\n=== A2: area sweep (fixed live count, varying world area) ===');
for (const dim of [2048, 4096, 8192]) {
  const w = new World(
    defaultConfig({ seed: 7, maxCells: 100_000, worldWidth: dim, worldHeight: dim }),
    false,
  );
  w.spawn(2000, CellType.PHOTO); // sparse across increasing area
  for (let i = 0; i < 50; i++) w.tick(); // warm
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) w.tick();
  const t1 = process.hrtime.bigint();
  const msPerTick = Number(t1 - t0) / 1e6 / 300;
  const areaKBuckets = ((dim / 10) | 0) * ((dim / 10) | 0); // SpatialHash bucket count (approx)
  console.log(
    `  world ${dim}x${dim}  ` +
      `buckets≈${String(areaKBuckets).padStart(7)}  live≈${w.cells.aliveCount}  ` +
      `${msPerTick.toFixed(3)} ms/tick`,
  );
}

console.log('\n=== combined: capacity + area stress (large world at high capacity) ===');
{
  const w = new World(
    defaultConfig({ seed: 7, maxCells: 1_000_000, worldWidth: 8192, worldHeight: 8192 }),
    false,
  );
  w.spawn(2000, CellType.PHOTO);
  for (let i = 0; i < 50; i++) w.tick();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) w.tick();
  const t1 = process.hrtime.bigint();
  const msPerTick = Number(t1 - t0) / 1e6 / 300;
  console.log(
    `  maxCells 1M  world 8192x8192  live≈${w.cells.aliveCount}  ` +
      `${msPerTick.toFixed(3)} ms/tick`,
  );
}
