import { type Config } from './config';
import { Rng } from '../math/rng';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { computeRepulsion } from '../physics/forces';
import { integrate } from '../physics/integrator';
import { LightField } from '../environment/light-field';
import { metabolize } from '../cells/metabolism';
import { lifecycle, type LifecycleResult } from '../cells/lifecycle';
import { CellType } from '../cells/types';
import { makeMetrics, sampleMetrics, type Metrics } from './metrics';

/**
 * The simulation world. Each `tick()` runs the M2 pipeline:
 * rebuild the compact live set (canonical ascending order) → spatial hash →
 * soft repulsion → semi-implicit integrate → metabolize → age → lifecycle
 * (death/decay/division) → environment step → re-derive live → sample metrics.
 * Deterministic given (Config, seed); allocation-free in the hot loop.
 */
export class World {
  readonly config: Config;
  readonly rng: Rng;
  readonly cells: CellStore;
  readonly hash: SpatialHash;
  readonly light: LightField;
  readonly metrics: Metrics;
  /** Pre-allocated so lifecycle writes counts without a per-tick object (zero-alloc). */
  readonly lifecycleResult: LifecycleResult;
  lastBirths: number;
  lastDeaths: number;
  tickCount: number;

  /** Compact list of alive slot indices, ascending. Valid for [0, liveCount). */
  readonly liveIndices: Uint32Array;
  liveCount: number;

  constructor(config: Config, preferShared = true) {
    this.config = config;
    this.rng = new Rng(config.seed);
    this.cells = new CellStore(config.maxCells, preferShared);
    const cellSize = 2 * config.cellRadius;
    this.hash = new SpatialHash(config.worldWidth, config.worldHeight, cellSize, config.maxCells);
    this.liveIndices = new Uint32Array(config.maxCells);
    this.liveCount = 0;
    this.tickCount = 0;

    // The light field uses a dedicated RNG substream so adding draws elsewhere
    // (e.g. spawn jitter) can't shift its patchy layout.
    this.light = new LightField(
      config.lightGridCols,
      config.lightGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    this.light.init(
      this.rng.split(1 /* STREAM_LIGHT */),
      config.lightPatchCount,
      config.lightPatchRadius,
      config.lightMax,
    );
    this.metrics = makeMetrics();
    this.lifecycleResult = { births: 0, deaths: 0 };
    this.lastBirths = 0;
    this.lastDeaths = 0;
  }

  /** Spawn up to `n` cells of `type` at seeded random positions. Returns count spawned. */
  spawn(n: number, type: number = CellType.PHOTO): number {
    const f = this.cells.fields;
    let spawned = 0;
    for (let k = 0; k < n; k++) {
      const i = this.cells.alloc();
      if (i < 0) break;
      f.posX[i] = this.rng.range(0, this.config.worldWidth);
      f.posY[i] = this.rng.range(0, this.config.worldHeight);
      f.velX[i] = 0;
      f.velY[i] = 0;
      f.forceX[i] = 0;
      f.forceY[i] = 0;
      f.radius[i] = this.config.cellRadius;
      f.mass[i] = 1;
      f.energy[i] = 100;
      f.cellType[i] = type;
      f.organismId[i] = 0;
      f.genomeRef[i] = 0;
      f.brainRef[i] = 0;
      f.age[i] = 0;
      spawned++;
    }
    return spawned;
  }

  /** Seed an initial PHOTO/DIGESTIVE mix per `initialPhotoFraction`. */
  seedLife(n: number): void {
    const photo = Math.round(n * this.config.initialPhotoFraction);
    this.spawn(photo, CellType.PHOTO);
    this.spawn(n - photo, CellType.DIGESTIVE);
  }

  /**
   * Rebuild the compact live set in ascending slot order (canonical, deterministic).
   *
   * This scans full capacity each tick. Correct, and cheap in the dense regime
   * (forces dominate). Honest caveat: in the sparse post-crash regime M2 can
   * introduce (mass die-off), the O(maxCells) scan can invert and dominate when
   * few cells remain. The rebalanced economy keeps populations substantial so the
   * scan stays fine; if the empty-scan ever dominates, maintain `liveIndices`
   * incrementally in alloc/free — an M2/M3 follow-up, not done now.
   */
  private rebuildLive(): void {
    const capacity = this.cells.capacity;
    const live = this.liveIndices;
    let n = 0;
    for (let i = 0; i < capacity; i++) {
      if (this.cells.isAlive(i)) live[n++] = i;
    }
    this.liveCount = n;
  }

  /**
   * Advance one tick (§4.3 pipeline): rebuild live → hash → repulsion → integrate
   * → metabolize → age → lifecycle → environment → re-derive live → sample metrics.
   */
  tick(): void {
    const f = this.cells.fields;
    const cfg = this.config;

    this.rebuildLive();
    const live = this.liveIndices;
    const n = this.liveCount;

    this.hash.build(live, n, f.posX, f.posY);
    computeRepulsion(this.hash, f.posX, f.posY, f.radius, f.forceX, f.forceY, cfg.repulsion);
    integrate(
      live,
      n,
      f.posX,
      f.posY,
      f.velX,
      f.velY,
      f.forceX,
      f.forceY,
      f.mass,
      cfg.dt,
      cfg.damping,
      cfg.worldWidth,
      cfg.worldHeight,
    );

    metabolize(
      live,
      n,
      f,
      this.hash,
      this.light,
      cfg.photoGain,
      cfg.photoDepletion,
      cfg.digestRate,
      cfg.digestEfficiency,
      cfg.basalCost,
      cfg.meatDecay,
      0, // moveCost — wired to cfg.moveCost in Task 9
    );

    // Age the tick-start live set BEFORE lifecycle. The free-list is LIFO, so a
    // slot freed in lifecycle is reused for a division child the same tick;
    // ageing first keeps that child at the age 0 lifecycle sets (not 1).
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      f.age[i] = (f.age[i]! + 1) >>> 0;
    }

    lifecycle(
      live,
      n,
      this.cells,
      cfg.seed,
      cfg.worldWidth,
      cfg.worldHeight,
      cfg.meatEnergyOnDeath,
      cfg.divideThreshold,
      cfg.divideCost,
      cfg.divideJitter,
      this.tickCount,
      this.lifecycleResult,
    );
    this.lastBirths = this.lifecycleResult.births;
    this.lastDeaths = this.lifecycleResult.deaths;

    this.light.step(cfg.lightDiffuse, cfg.lightRegen);

    // Re-derive the live set so metrics exclude freed corpses (free() leaves
    // cellType=MEAT) and include fresh-slot newborns; population == aliveCount.
    this.rebuildLive();
    sampleMetrics(
      this.metrics,
      this.liveIndices,
      this.liveCount,
      f,
      this.tickCount,
      this.lifecycleResult.births,
      this.lifecycleResult.deaths,
    );

    this.tickCount++;
  }
}
