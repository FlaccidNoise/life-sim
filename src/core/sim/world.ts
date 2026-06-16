import { type Config } from './config';
import { Rng } from '../math/rng';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { computeRepulsion } from '../physics/forces';
import { integrate } from '../physics/integrator';
import { LightField } from '../environment/light-field';
import { FoodField } from '../environment/food-field';
import { metabolize } from '../cells/metabolism';
import { sense } from '../cells/sense';
import { act } from '../cells/act';
import { applyThrust } from '../physics/thrust';
import { lifecycle, type LifecycleResult } from '../cells/lifecycle';
import { CellType, isEdibleBy } from '../cells/types';
import { NeuralNetwork } from '../neural/network';
import { think } from '../neural/think';
import { driveMovers } from '../neural/motor';
import { repositionPassengers } from '../physics/rigid-group';
import { BondNetwork } from '../organism/bonds';
import { OrganismTable } from '../organism/organisms';
import { SplitChecker } from '../organism/split';
import { makeMetrics, sampleMetrics, type Metrics } from './metrics';

/**
 * The simulation world. Each `tick()` runs the M4 pipeline:
 * rebuild the compact live set (canonical ascending order) → spatial hash →
 * SENSE (food gradient) → THINK (neuron-cell forward pass, double-buffered) →
 * ACT (reflex steer + neuron-driven movers) →
 * soft repulsion → apply thrust → semi-implicit integrate → metabolize
 * (basal + move cost) → age → lifecycle (death/decay/division) → light step →
 * re-derive live → persistent food-field update → sample metrics.
 * Deterministic given (Config, seed); allocation-free in the hot loop.
 */
export class World {
  readonly config: Config;
  readonly rng: Rng;
  readonly cells: CellStore;
  readonly hash: SpatialHash;
  readonly light: LightField;
  readonly food: FoodField;
  readonly net: NeuralNetwork;
  readonly bonds: BondNetwork;
  readonly organisms: OrganismTable;
  readonly splitter: SplitChecker;
  /** Per-cell bonded-DIGESTIVE-neighbour count (the digestion-clustering payoff input). */
  readonly digestBonus: Uint8Array;
  /** Per-World deterministic organism-id allocator (M4 kinematic groups; M5 organisms). */
  nextOrganismId: number;
  // Kinematic rigid-group table (M4 critter cohesion; M5 replaces with bonds).
  readonly rigidPassenger: Uint32Array;
  readonly rigidBody: Uint32Array;
  readonly rigidOffX: Float32Array;
  readonly rigidOffY: Float32Array;
  rigidCount: number;
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
    this.food = new FoodField(
      config.foodGridCols,
      config.foodGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    this.net = new NeuralNetwork(config.maxCells, config.maxSynapses, config.maxCells);
    this.bonds = new BondNetwork(config.maxCells, config.maxBonds, config.bondDegreeCap);
    this.organisms = new OrganismTable(config.maxOrganisms);
    this.splitter = new SplitChecker(config.maxCells);
    this.digestBonus = new Uint8Array(config.maxCells);
    this.nextOrganismId = 1;
    this.rigidPassenger = new Uint32Array(config.maxCells);
    this.rigidBody = new Uint32Array(config.maxCells);
    this.rigidOffX = new Float32Array(config.maxCells);
    this.rigidOffY = new Float32Array(config.maxCells);
    this.rigidCount = 0;
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
      f.heading[i] = 0;
      f.senseX[i] = 0;
      f.senseY[i] = 0;
      f.thrust[i] = 0;
      spawned++;
    }
    return spawned;
  }

  /** Register a kinematic passenger at a fixed body-frame offset (M4 critter group). */
  addPassenger(passenger: number, body: number, offX: number, offY: number): void {
    const k = this.rigidCount++;
    this.rigidPassenger[k] = passenger;
    this.rigidBody[k] = body;
    this.rigidOffX[k] = offX;
    this.rigidOffY[k] = offY;
  }

  /** Seed an initial PHOTO/DIGESTIVE/MOTILE mix per the configured fractions. */
  seedLife(n: number): void {
    const photo = Math.round(n * this.config.initialPhotoFraction);
    const motile = Math.round(n * this.config.initialMotileFraction);
    const digestive = Math.max(0, n - photo - motile);
    this.spawn(photo, CellType.PHOTO);
    this.spawn(digestive, CellType.DIGESTIVE);
    this.spawn(motile, CellType.MOTILE);
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
   * Advance one tick (§4.3 pipeline): rebuild live → hash → SENSE (food gradient)
   * → THINK (neuron-cell forward pass, double-buffered; swap) → ACT (reflex steer +
   * driveMovers from neuron outputs) → repulsion → apply thrust → integrate →
   * reposition kinematic passengers → metabolize (basal + move + neural cost) → age
   * → lifecycle → light step → re-derive live → persistent food-field update →
   * sample metrics.
   */
  tick(): void {
    const f = this.cells.fields;
    const cfg = this.config;

    this.rebuildLive();
    const live = this.liveIndices;
    const n = this.liveCount;

    this.hash.build(live, n, f.posX, f.posY);

    // Step 2 SENSE → step 3 THINK (recurrent forward pass) → step 4 ACT.
    sense(live, n, f, this.food);

    think(this.net, f.cellType, f.senseX, f.senseY, f.heading);
    this.net.swap(); // actCur now holds a(t)

    act(
      live,
      n,
      f,
      cfg.turnRate,
      cfg.thrustGain,
      cfg.maxThrust,
      cfg.senseThreshold,
      cfg.cruiseThrust,
    );
    // MOVER cells are driven by their motor neurons (ACT for the neural critter).
    driveMovers(
      this.net,
      f.heading,
      f.thrust,
      cfg.turnScale,
      cfg.thrustScale,
      cfg.thrustBias,
      cfg.maxThrust,
    );

    computeRepulsion(this.hash, f.posX, f.posY, f.radius, f.forceX, f.forceY, cfg.repulsion);
    applyThrust(live, n, f.heading, f.thrust, f.forceX, f.forceY);
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

    // Step 6b: snap kinematic passengers to the rigid body-frame layout (after the
    // body integrated). Overrides any broad-phase nudge; only the MOVER body integrates.
    repositionPassengers(
      this.rigidPassenger,
      this.rigidBody,
      this.rigidOffX,
      this.rigidOffY,
      this.rigidCount,
      f.posX,
      f.posY,
      f.heading,
      f.velX,
      f.velY,
      f.forceX,
      f.forceY,
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
      cfg.moveCost,
      cfg.neuralCost,
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

    // Step 9 ENVIRONMENT (food): deposit smell from currently-alive edible cells onto
    // the PERSISTENT field (do NOT clear — like LightField), then diffuse + decay so
    // deposit balances decay into an equilibrium ∝ local food density. Deposit over the
    // post-lifecycle live set (only-alive) at post-integrate positions; SENSE reads this
    // field on the NEXT tick (one-tick coupling).
    const food = this.food;
    const dep = cfg.foodDeposit;
    for (let k = 0; k < this.liveCount; k++) {
      const idx = this.liveIndices[k]!;
      const t = f.cellType[idx]!;
      if (isEdibleBy(CellType.MOTILE, t)) food.depositAt(f.posX[idx]!, f.posY[idx]!, dep);
    }
    food.step(cfg.foodDiffuse, cfg.foodDecay);

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
