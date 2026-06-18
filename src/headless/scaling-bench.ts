/**
 * Scaling benchmark: confirms per-tick cost tracks LIVE population, not buffer capacity.
 * After Phase A1 (CellStore.highWaterMark bounds rebuildLive), a big-capacity sparse world no longer
 * pays a full-capacity scan twice per tick. Run: pnpm exec tsx src/headless/scaling-bench.ts
 *
 * Result (2026-06-18): ~flat ms/tick across maxCells 50k→2M at a fixed ~10k live population.
 * Use this to re-validate Phase A1b / A2 / B3 as the cost model is pushed further toward O(live).
 */
import { World } from '../core/sim/world';
import { defaultConfig } from '../core/sim/config';
import { CellType } from '../core/cells/types';

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
