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
import { computeBondForces } from '../physics/bond-force';
import { computeAdhesion } from '../physics/adhesion';
import { breakStrainedBonds } from '../organism/breakage';
import { transferEnergy } from '../organism/transfer';
import { computeDigestBonus } from '../organism/digest-bonus';
import { orientSensors } from '../neural/orient';
import { BondNetwork } from '../organism/bonds';
import { OrganismTable, aggregateOrganisms } from '../organism/organisms';
import { SplitChecker } from '../organism/split';
import { makeMetrics, sampleMetrics, type Metrics } from './metrics';

/**
 * The simulation world. Each `tick()` runs the M5 pipeline:
 * rebuild the compact live set (canonical ascending order) + live-bond set → spatial
 * hash → SENSE (food gradient) → orientSensors (MOVER heading → SENSORs) → THINK
 * (neuron-cell forward pass, double-buffered) → ACT (reflex steer + neuron-driven
 * movers) → soft repulsion → apply thrust → bond springs + adhesion → semi-implicit
 * integrate → break over-stretched bonds (split organisms) → digest-bonus → metabolize
 * (basal + move + neural cost) → intra-organism energy transfer → age → lifecycle
 * (death/decay/division) → light step → re-derive live → persistent food-field update →
 * recompute organism aggregates → sample metrics. The M4 kinematic rigid grouping is
 * gone; cohesion is bond physics. Deterministic given (Config, seed); allocation-free
 * in the hot loop.
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
   * Advance one tick (§4.3 pipeline): rebuild live + live bonds → hash → SENSE (food
   * gradient) → orientSensors (MOVER heading → SENSORs) → THINK (neuron-cell forward
   * pass, double-buffered; swap) → ACT (reflex steer + driveMovers from neuron outputs)
   * → repulsion → apply thrust → bond springs + adhesion → integrate → break
   * over-stretched bonds (split organisms) → digest-bonus → metabolize (basal + move +
   * neural cost) → intra-organism energy transfer → age → lifecycle → light step →
   * re-derive live → persistent food-field update → recompute organism aggregates →
   * sample metrics. The M4 kinematic grouping is gone; cohesion is bond physics.
   */
  tick(): void {
    const f = this.cells.fields;
    const cfg = this.config;

    this.rebuildLive();
    const live = this.liveIndices;
    const n = this.liveCount;

    // M5: refresh the live-bond snapshot (prunes any bond with a dangling endpoint)
    // before the force/break/transfer kernels iterate it this tick.
    this.bonds.rebuildLive(this.cells);

    this.hash.build(live, n, f.posX, f.posY);

    // Step 2 SENSE → step 3 THINK (recurrent forward pass) → step 4 ACT.
    sense(live, n, f, this.food);

    // M5: orient SENSOR cells to their organism's MOVER heading before THINK projects
    // the gradient into the body frame (one-tick orientation lag, documented).
    orientSensors(this.net, f.organismId, this.organisms.mover, f.heading);

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

    // M5 bond springs (scatter) + minimal adhesion (gather), accumulating into the force
    // buffer alongside repulsion + thrust before integrate (§4.3 step 5 FORCES).
    computeBondForces(
      this.bonds.liveBonds,
      this.bonds.liveBondCount,
      this.bonds.cellA,
      this.bonds.cellB,
      this.bonds.restLen,
      this.bonds.stiffness,
      f.posX,
      f.posY,
      f.forceX,
      f.forceY,
      cfg.bondStiffness,
      cfg.worldWidth,
      cfg.worldHeight,
    );
    computeAdhesion(
      this.hash,
      f.posX,
      f.posY,
      f.radius,
      f.cellType,
      f.organismId,
      f.forceX,
      f.forceY,
      cfg.adhesionStrength,
      cfg.adhesionRange,
      cfg.worldWidth,
      cfg.worldHeight,
    );

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

    // M5: break over-stretched bonds (post-integrate strain) → split organisms.
    const broke = breakStrainedBonds(
      this.bonds,
      f.organismId,
      this.organisms,
      this.splitter,
      f.posX,
      f.posY,
      cfg.bondMaxStrain,
      cfg.maxSplitChecksPerTick,
      cfg.worldWidth,
      cfg.worldHeight,
    );
    if (broke > 0) this.bonds.rebuildLive(this.cells);

    // The digestion-clustering payoff input, read by METABOLIZE.
    computeDigestBonus(this.bonds, f.cellType, this.digestBonus);

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
      this.digestBonus,
      cfg.digestClusterBonus,
    );

    // M5: intra-organism energy transfer toward needier cells (§4.5).
    transferEnergy(
      this.bonds.liveBonds,
      this.bonds.liveBondCount,
      this.bonds.cellA,
      this.bonds.cellB,
      f.energy,
      cfg.transferRate,
      cfg.transferEfficiency,
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

    // M5: recompute per-organism aggregates over the post-lifecycle live set.
    aggregateOrganisms(
      this.liveIndices,
      this.liveCount,
      f.organismId,
      f.energy,
      f.posX,
      f.posY,
      this.organisms,
    );

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
