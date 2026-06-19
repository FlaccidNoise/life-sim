import { type Config } from './config';
import { Rng } from '../math/rng';
import { CellStore } from '../memory/cell-store';
import { SpatialHash } from '../spatial/spatial-hash';
import { computeRepulsion } from '../physics/forces';
import { integrate } from '../physics/integrator';
import { LightField } from '../environment/light-field';
import { FoodField } from '../environment/food-field';
import { NoiseField } from '../environment/noise-field';
import { RockField } from '../environment/rock-field';
import { TemperatureField } from '../environment/temperature-field';
import { CurrentField } from '../environment/current-field';
import { GlowField } from '../environment/glow-field';
import { ToxinField } from '../environment/toxin-field';
import { applyRockCollision } from '../physics/rock-collision';
import { applyCurrent } from '../physics/current-force';
import { metabolize, type EnvEffects, type EconomyParams, type PredationParams, type GrazeParams, type LatchArrays } from '../cells/metabolism';
import { sense } from '../cells/sense';
import { act } from '../cells/act';
import { applyThrust } from '../physics/thrust';
import { lifecycle, type LifecycleResult } from '../cells/lifecycle';
import { CellType, isEdibleBy, isFlesh } from '../cells/types';
import { NeuralNetwork } from '../neural/network';
import { think } from '../neural/think';
import { driveMovers } from '../neural/motor';
import { computeBondForces } from '../physics/bond-force';
import { applyLatchTether } from '../physics/latch-tether';
import { computeAdhesion } from '../physics/adhesion';
import { breakStrainedBonds } from '../organism/breakage';
import { transferEnergy } from '../organism/transfer';
import { computeDigestBonus } from '../organism/digest-bonus';
import { orientSensors } from '../neural/orient';
import { BondNetwork } from '../organism/bonds';
import { OrganismTable, aggregateOrganisms } from '../organism/organisms';
import { SplitChecker } from '../organism/split';
import { PlantSystem } from '../organism/plant';
import { makeMetrics, sampleMetrics, sampleEvolutionMetrics, type Metrics } from './metrics';
import { sampleLineages, type LineageSummary, type LineageStat } from './lineage-board';
import { sampleSpecies, type SpeciesSummary } from './species-board';
import { GenomeStore, type Genome } from '../genome/genome';
import { LineageLog } from '../genome/lineage-log';
import { reproduceOrganisms, type ReproParams } from '../organism/reproduction';
import { instantiateBody } from '../organism/instantiate';
import { killStarvedOrganisms } from '../organism/organism-death';
import { type MutationRates } from '../genome/mutate';
import { lightMultiplier } from '../environment/cycle';
import { senseScalars } from '../neural/env-sense';
import { GlowEffectors, computeGlow } from '../neural/glow';
import { develop } from '../genome/develop';

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
  /** Prey-scent field (ecology pass): forager flesh deposits, predator sensors chemotax on it. Same
   *  grid geometry as `food`. Derived environment state, recomputed each tick (not on the contract). */
  readonly preyField: FoodField;
  /** Predator-scent field (P4 fleeing): carnivore flesh deposits, herbivore sensors flee down its
   *  gradient. Same grid geometry as `food`. Derived environment state (not on the contract). */
  readonly predScent: FoodField;
  /** Motion/loudness field (Phase 2 HEARING): live cells deposit `loudnessGain·speed`, HEARING sensors
   *  read its gradient. Same grid geometry as `food`. OFF by default (`loudnessGain === 0` ⇒ deposit+step
   *  skipped, no HEARING override) → byte-identical. Deposit/step lands in Task 10; the field exists now
   *  so sense() can route HEARING sensors. Derived environment state (not on the contract). */
  readonly noise: NoiseField;
  readonly net: NeuralNetwork;
  readonly bonds: BondNetwork;
  readonly organisms: OrganismTable;
  readonly splitter: SplitChecker;
  /** Sessile chain-plant lifecycle (grow/spore/settle/sever). Only ticked when config.sessilePlants. */
  readonly plants: PlantSystem;
  /** Genome store (developmental recipes by ref). */
  readonly genomes: GenomeStore;
  /** M7 phylogeny: births/deaths recorded by genome ref; pruned at metrics cadence. Part of the
   * determinism contract (canonical-order recording, no RNG — the reproducibility test hashes it). */
  readonly lineage: LineageLog;
  /** Dedicated RNG substream for mutation (rng.split(2)); keeps mutation independent. */
  readonly mutationRng: Rng;
  /** Pre-allocated per-organism death flags (zero-alloc death scan). */
  readonly dyingScratch: Uint8Array;
  /** Pre-allocated local→slot scratch for instantiateBody (zero-alloc births). */
  readonly instantiateScratch: Int32Array;

  // ──── Environmental features (M9-early) ────
  /** Static rock obstacles. */
  readonly rocks: RockField;
  /** Temperature gradient field. */
  readonly temperature: TemperatureField;
  /** Water current vector field. */
  readonly current: CurrentField;
  /** Bioluminescent glow field. */
  readonly glow: GlowField;
  /** Glow effector bindings pool. */
  readonly glowEffectors: GlowEffectors;
  /** Toxin field. */
  readonly toxin: ToxinField;
  /** Coarse density grid (cells per bucket) for the crowdDivideCap carrying capacity. Reused each
   *  tick; only filled when the cap is enabled. Not on the determinism contract (derived). */
  private readonly densityGrid: Int32Array;
  private readonly densityCols: number;
  private readonly densityRows: number;
  private readonly mutationRates: MutationRates;
  /** Reused env-effects bundle for metabolize (mutated each tick; pre-allocated to keep the hot loop
   *  allocation-free, mirroring reproParams). Holds stable temp/toxin refs; scalars synced per tick. */
  private readonly env: EnvEffects;
  private readonly reproParams: ReproParams;
  private readonly economy: EconomyParams;
  private readonly predParams: PredationParams;
  private readonly grazeParams: GrazeParams;
  private readonly latchArrays: LatchArrays;
  private readonly reproOut: { births: number; bornRefs: number[] };
  private readonly deathOut: { deaths: number; deadRefs: number[] };
  /** Cumulative organisms that ever reached reproThreshold (births-reaching-adulthood). */
  birthsReachedAdulthood: number;
  lastOrganismBirths: number;
  lastOrganismDeaths: number;
  /** Per-cell bonded-DIGESTIVE-neighbour count (the digestion-clustering payoff input). */
  readonly digestBonus: Uint8Array;
  readonly metrics: Metrics;
  /** M7 champion board: top live founding lineages by member count (sampled telemetry, not the
   * SoA determinism contract). Refreshed at metricsEvolutionInterval cadence. */
  lineageBoard: readonly LineageSummary[] = [];
  /** M7 species board: live genome population greedily clustered by genomeDistance (sampled
   * telemetry, not the SoA determinism contract). Refreshed at metricsEvolutionInterval cadence. */
  speciesBoard: readonly SpeciesSummary[] = [];
  /** Persistent per-lineage peak + first-seen accumulator backing lineageBoard. */
  private readonly lineageStats = new Map<number, LineageStat>();
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
    // Sessile-plant demo: SPREAD the light pockets on a jittered macro-grid (distinct pockets with
    // dark gaps) so plants form separate clusters instead of one merged central blob. initSpread
    // rescales to the SAME total integrated light as the legacy patchy init (food-neutral — no extra
    // standing food). The default (sessilePlants=false) path is byte-identical.
    // MERGE NOTE (senses): the non-sessile path also seeds the dedicated STREAM_DRIFT (split 6)
    // phase/freq records for the drifting-light-zones feature. split(6) is an independent substream
    // so it cannot perturb STREAM_LIGHT — the light seed stays byte-identical. initSpread does NOT
    // drift (sessile plants anchor to fixed pockets, so drifting the light under them is a no-op).
    const lightRng = this.rng.split(1 /* STREAM_LIGHT */);
    if (config.sessilePlants) {
      this.light.initSpread(
        lightRng.seed,
        config.lightPatchCount,
        config.lightPatchRadius,
        config.lightMax,
      );
    } else {
      this.light.init(
        lightRng,
        config.lightPatchCount,
        config.lightPatchRadius,
        config.lightMax,
        this.rng.split(6 /* STREAM_DRIFT */),
      );
    }
    this.food = new FoodField(
      config.foodGridCols,
      config.foodGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    this.preyField = new FoodField(
      config.foodGridCols,
      config.foodGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    this.predScent = new FoodField(
      config.foodGridCols,
      config.foodGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    this.noise = new NoiseField(
      config.foodGridCols,
      config.foodGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    this.net = new NeuralNetwork(config.maxCells, config.maxSynapses, config.maxCells);
    this.bonds = new BondNetwork(config.maxCells, config.maxBonds, config.bondDegreeCap);
    this.organisms = new OrganismTable(config.maxOrganisms);
    this.splitter = new SplitChecker(config.maxCells);
    this.plants = new PlantSystem(config.maxCells);
    this.genomes = new GenomeStore();
    this.lineage = new LineageLog(this.genomes);
    this.mutationRng = this.rng.split(2 /* STREAM_MUTATION */);
    this.dyingScratch = new Uint8Array(config.maxOrganisms);
    this.instantiateScratch = new Int32Array(config.maxCellsPerOrganism);
    this.densityCols = Math.max(3, Math.round(config.worldWidth / config.crowdGridSize));
    this.densityRows = Math.max(3, Math.round(config.worldHeight / config.crowdGridSize));
    this.densityGrid = new Int32Array(this.densityCols * this.densityRows);
    this.mutationRates = {
      paramSigma: 0,
      paramRate: 0,
      weightSigma: 0,
      weightRate: 0,
      addGeneRate: 0,
      deleteGeneRate: 0,
      duplicateGeneRate: 0,
      rewireRate: 0,
      changeTypeRate: 0,
      duplicateSubgraphRate: 0,
      sensorChannelRate: 0,
      senseSourceRate: 0,
    };

    // Environmental features (M9-early)
    this.rocks = new RockField(
      config.maxRocks,
      Math.max(3, Math.round(config.worldWidth / config.rockGridSize)),
      Math.max(3, Math.round(config.worldHeight / config.rockGridSize)),
      config.worldWidth,
      config.worldHeight,
    );
    if (config.rockCount > 0) {
      this.rocks.init(
        this.rng.split(3 /* STREAM_ROCKS */),
        config.rockCount,
        config.worldWidth,
        config.worldHeight,
        config.rockRadiusMin,
        config.rockRadiusMax,
      );
    }
    this.temperature = new TemperatureField(
      config.tempGridCols,
      config.tempGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    this.temperature.init(
      this.rng.split(4 /* STREAM_TEMP */),
      config.tempPatchCount,
      config.tempPatchRadius,
      config.tempMin,
      config.tempMax,
    );
    this.current = new CurrentField(
      config.currentGridCols,
      config.currentGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    if (config.currentStrength > 0) {
      this.current.init(
        this.rng.split(5 /* STREAM_CURRENT */),
        config.currentPatchCount,
        config.currentPatchRadius,
        config.currentStrength,
      );
    }
    this.glow = new GlowField(
      config.glowGridCols,
      config.glowGridRows,
      config.worldWidth,
      config.worldHeight,
    );
    this.glowEffectors = new GlowEffectors(config.maxGlowEffectors);
    this.toxin = new ToxinField(
      config.toxinGridCols,
      config.toxinGridRows,
      config.worldWidth,
      config.worldHeight,
    );

    this.env = {
      lightMultiplier: 1,
      temp: this.temperature,
      tempComfortLow: 0,
      tempComfortHigh: 0,
      tempColdPenalty: 0,
      tempHeatPenalty: 0,
      toxin: this.toxin,
      toxinDamage: 0,
      toxinDepositOnMeatDecay: 0,
    };

    this.reproParams = {
      reproThreshold: 0,
      parentFloor: 0,
      offspringOffset: 0,
      maxCellsPerOrganism: 0,
      maxRecursionDepth: 0,
      maxBirthsPerTick: 0,
      worldWidth: config.worldWidth,
      worldHeight: config.worldHeight,
      tick: 0,
    };
    this.economy = {
      photoGain: 0,
      photoDepletion: 0,
      digestRate: 0,
      digestEfficiency: 0,
      baseToughness: 0,
      basalCost: 0,
      meatDecay: 0,
      moveCost: 0,
      neuralCost: 0,
      digestClusterBonus: 0,
    };
    this.predParams = {
      predDigestRate: 0,
      predDigestEfficiency: 0,
      predReach: 0,
      predLatchRange: 0,
    };
    this.grazeParams = {
      herbivoreLatch: false,
      grazeRate: 0,
      grazeLatchRange: 0,
      grazeSatiation: 0,
    };
    this.digestBonus = new Uint8Array(config.maxCells);
    this.latchArrays = {
      digestBonus: this.digestBonus,
      latchPrey: new Uint32Array(0),
      latchCell: new Uint32Array(0),
      organismCellCount: new Uint32Array(0),
    };
    this.reproOut = { births: 0, bornRefs: [] };
    this.deathOut = { deaths: 0, deadRefs: [] };
    this.birthsReachedAdulthood = 0;
    this.lastOrganismBirths = 0;
    this.lastOrganismDeaths = 0;
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
      f.anchored[i] = 0;
      spawned++;
    }
    return spawned;
  }

  /** Seed one anchored, tough plant BASE (a 1-cell plant organism) at (x, y). Mirrors `spawn` field
   *  init but sets anchored=1 and a fresh organism id; the plant grows a chain on subsequent ticks.
   *  Returns the cell slot, or -1 at capacity / organism-pool exhaustion. */
  seedPlantBase(x: number, y: number, energy = 15): number {
    const f = this.cells.fields;
    const i = this.cells.alloc();
    if (i < 0) return -1;
    const org = this.organisms.alloc();
    if (org < 0) {
      this.cells.free(i);
      return -1;
    }
    f.posX[i] = x;
    f.posY[i] = y;
    f.velX[i] = 0;
    f.velY[i] = 0;
    f.forceX[i] = 0;
    f.forceY[i] = 0;
    f.radius[i] = this.config.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = energy;
    f.cellType[i] = CellType.PHOTO;
    f.organismId[i] = org;
    f.genomeRef[i] = 0;
    f.brainRef[i] = 0;
    f.age[i] = 0;
    f.heading[i] = 0;
    f.senseX[i] = 0;
    f.senseY[i] = 0;
    f.thrust[i] = 0;
    f.anchored[i] = 1;
    return i;
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

  /** Centralised develop+instantiate: registers the genome, develops + places the organism.
   * Returns the new organism id, or -1 on failure. */
  spawnOrganism(genome: Genome, x: number, y: number, heading: number): number {
    const ref = this.genomes.register(genome);
    const body = develop(genome, this.config.maxCellsPerOrganism, this.config.maxRecursionDepth);
    return instantiateBody(
      body,
      this.cells,
      this.net,
      this.bonds,
      this.organisms,
      ref,
      x,
      y,
      heading,
      this.config.worldWidth,
      this.config.worldHeight,
      this.instantiateScratch,
      this.glowEffectors,
    );
  }

  /**
   * Rebuild the compact live set in ascending slot order (canonical, deterministic).
   *
   * Scans only `[0, highWaterMark)` — the LIFO free-list keeps live slots packed low, so the mark
   * tracks ~the peak live count, not `maxCells`. This keeps the scan ~O(live) instead of O(capacity),
   * so a big/sparse world (large `maxCells`, few live cells) no longer pays a full-capacity scan
   * twice per tick. The skipped tail `[highWaterMark, capacity)` is dead by the mark's invariant, so
   * the live set is byte-identical to a full-capacity scan (ascending order preserved).
   */
  private rebuildLive(): void {
    const hwm = this.cells.highWaterMark;
    const live = this.liveIndices;
    let n = 0;
    for (let i = 0; i < hwm; i++) {
      if (this.cells.isAlive(i)) live[n++] = i;
    }
    this.liveCount = n;
  }

  /**
   * Fill `localDensity[i]` = number of live cells sharing cell i's coarse density-grid bucket,
   * for the crowdDivideCap carrying capacity. Two O(live) passes (count into grid, then read back),
   * allocation-free (reused `densityGrid`), deterministic (integer counts over the canonical live
   * order, no RNG). Type-blind and position-only — a uniform environmental constraint, never a
   * fitness/lineage branch. Only called when the cap is enabled.
   */
  private fillDensity(live: Uint32Array, n: number): void {
    const f = this.cells.fields;
    const grid = this.densityGrid;
    const cols = this.densityCols;
    const rows = this.densityRows;
    const cellW = this.config.worldWidth / cols;
    const cellH = this.config.worldHeight / rows;
    grid.fill(0);
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      let col = Math.floor(f.posX[i]! / cellW);
      let row = Math.floor(f.posY[i]! / cellH);
      col = ((col % cols) + cols) % cols; // toroidal-safe (cells live in [0,W) but be defensive)
      row = ((row % rows) + rows) % rows;
      grid[row * cols + col]!++;
    }
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      let col = Math.floor(f.posX[i]! / cellW);
      let row = Math.floor(f.posY[i]! / cellH);
      col = ((col % cols) + cols) % cols;
      row = ((row % rows) + rows) % rows;
      const d = grid[row * cols + col]!;
      f.localDensity[i] = d < 65535 ? d : 65535;
    }
  }

  /** Copy the live M6 knobs into the reused param objects (avoids a per-tick allocation). */
  private syncReproParams(): void {
    const cfg = this.config;
    const rp = this.reproParams;
    rp.reproThreshold = cfg.reproThreshold;
    rp.parentFloor = cfg.reproParentFloor;
    rp.offspringOffset = cfg.offspringOffset;
    rp.maxCellsPerOrganism = cfg.maxCellsPerOrganism;
    rp.maxRecursionDepth = cfg.maxRecursionDepth;
    rp.maxBirthsPerTick = cfg.maxBirthsPerTick;
    rp.worldWidth = cfg.worldWidth;
    rp.worldHeight = cfg.worldHeight;
    rp.tick = this.tickCount;
    const mr = this.mutationRates;
    mr.paramSigma = cfg.mutationParamSigma;
    mr.paramRate = cfg.mutationParamRate;
    mr.weightSigma = cfg.mutationWeightSigma;
    mr.weightRate = cfg.mutationWeightRate;
    mr.addGeneRate = cfg.mutationAddGeneRate;
    mr.deleteGeneRate = cfg.mutationDeleteGeneRate;
    mr.duplicateGeneRate = cfg.mutationDuplicateGeneRate;
    mr.rewireRate = cfg.mutationRewireRate;
    mr.changeTypeRate = cfg.mutationChangeTypeRate;
    mr.changeTypeRate = cfg.mutationChangeTypeRate;
    mr.duplicateSubgraphRate = cfg.mutationDuplicateSubgraphRate;
    mr.sensorChannelRate = cfg.mutationSensorChannelRate;
    mr.senseSourceRate = cfg.mutationSenseSourceRate;
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
    sense(
      live,
      n,
      f,
      this.food,
      this.preyField,
      this.organisms.carnivore,
      this.predScent,
      cfg.predFleeWeight,
      this.net,
      this.noise,
      cfg.loudnessGain,
      this.hash,
      cfg.viewRange,
      cfg.viewHalfAngle,
      cfg.worldWidth,
      cfg.worldHeight,
      this.rocks,
    );

    // M9-early: precompute scalar sensor values (AMBIENT_LIGHT / TEMP / TOXIN / GLOW).
    // No-op when no scalar-channel sensors exist.
    senseScalars(
      this.net,
      f,
      this.tickCount,
      cfg.dayLength,
      cfg.dayNightDepth,
      this.temperature,
      this.toxin,
      this.glow,
    );

    // M5: orient SENSOR cells to their organism's MOVER heading before THINK projects
    // the gradient into the body frame (one-tick orientation lag, documented).
    orientSensors(this.net, f.organismId, this.organisms.mover, f.heading);

    think(this.net, f.cellType, f.senseX, f.senseY, f.heading);
    this.net.swap(); // actCur now holds a(t)

    // M9-early: glow effector emission (post-swap so actCur holds a(t)).
    if (this.glowEffectors.effectorCount > 0) {
      computeGlow(this.net, this.glow, this.glowEffectors, f, cfg.glowGain, cfg.glowCost);
    }

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
      f.organismId,
      this.organisms.carnivore,
      cfg.carnivoreThrustMult,
      f.energy,
      cfg.grazeSatiation,
      cfg.exploreWander,
      cfg.seed,
      this.tickCount,
      cfg.patrolCruise,
    );

    computeRepulsion(this.hash, f.posX, f.posY, f.radius, f.forceX, f.forceY, cfg.repulsion);

    // M9-early: rock collision (immovable terrain obstacles).
    if (cfg.rockCount > 0 && this.rocks.rockCount > 0) {
      applyRockCollision(
        this.rocks,
        f,
        live,
        n,
        cfg.rockRepulsion,
        cfg.worldWidth,
        cfg.worldHeight,
      );
    }

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
    // Predation tether: drag each latched predator toward its prey (set by last tick's metabolize).
    if (cfg.predLatchStiffness > 0) {
      applyLatchTether(
        live,
        n,
        f.latchCell,
        f.latchPrey,
        f.cellType,
        f.organismId,
        f.radius,
        f.posX,
        f.posY,
        f.forceX,
        f.forceY,
        cfg.worldWidth,
        cfg.worldHeight,
        cfg.predLatchStiffness,
        false,
      );
    }
    // Herbivore graze tether: drag each latched forager mouth toward its grazed PHOTO cell. Shares
    // latchCell/latchPrey with the predator tether (mouth sets are disjoint); grazePhoto=true selects
    // the PHOTO validity check (a grazed plant cell is PHOTO, not flesh).
    if (cfg.herbivoreLatch && cfg.grazeLatchStiffness > 0) {
      applyLatchTether(
        live,
        n,
        f.latchCell,
        f.latchPrey,
        f.cellType,
        f.organismId,
        f.radius,
        f.posX,
        f.posY,
        f.forceX,
        f.forceY,
        cfg.worldWidth,
        cfg.worldHeight,
        cfg.grazeLatchStiffness,
        true,
      );
    }

    // M9-early: water current drift force (post adhesion, pre integrate).
    if (cfg.currentStrength > 0) {
      applyCurrent(this.current, f, live, n, cfg.currentStrength);
    }

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
      f.anchored,
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
      f.cellType,
      cfg.bondMaxStrain,
      cfg.maxSplitChecksPerTick,
      cfg.worldWidth,
      cfg.worldHeight,
      cfg.sessilePlants,
    );
    if (broke > 0) this.bonds.rebuildLive(this.cells);

    // The digestion-clustering payoff input, read by METABOLIZE.
    computeDigestBonus(this.bonds, f.cellType, this.digestBonus);

    // M9-early: refresh the reused env-effects bundle for metabolism (no per-tick allocation;
    // temp/toxin refs are stable, only the scalars change — kept in sync so live knob-tuning works).
    const env = this.env;
    env.lightMultiplier = lightMultiplier(
      this.tickCount,
      cfg.dayLength,
      cfg.dayNightDepth,
      cfg.seasonLength,
      cfg.seasonDepth,
    );
    env.tempComfortLow = cfg.tempComfortLow;
    env.tempComfortHigh = cfg.tempComfortHigh;
    env.tempColdPenalty = cfg.tempColdPenalty;
    env.tempHeatPenalty = cfg.tempHeatPenalty;
    env.toxinDamage = cfg.toxinDamage;
    env.toxinDepositOnMeatDecay = cfg.toxinDepositOnMeatDecay;

    // Sync economy + latch knobs into reused scratch structs (no per-tick allocation).
    const economy = this.economy;
    economy.photoGain = cfg.photoGain;
    economy.photoDepletion = cfg.photoDepletion;
    economy.digestRate = cfg.digestRate;
    economy.digestEfficiency = cfg.digestEfficiency;
    economy.baseToughness = cfg.baseToughness;
    economy.basalCost = cfg.basalCost;
    economy.meatDecay = cfg.meatDecay;
    economy.moveCost = cfg.moveCost;
    economy.neuralCost = cfg.neuralCost;
    economy.digestClusterBonus = cfg.digestClusterBonus;

    const pred = this.predParams;
    pred.predDigestRate = cfg.predDigestRate;
    pred.predDigestEfficiency = cfg.predDigestEfficiency;
    pred.predReach = cfg.predReach;
    pred.predLatchRange = cfg.predLatchRange;

    const graze = this.grazeParams;
    graze.herbivoreLatch = cfg.herbivoreLatch;
    graze.grazeRate = cfg.grazeRate;
    graze.grazeLatchRange = cfg.grazeLatchRange;
    graze.grazeSatiation = cfg.grazeSatiation;

    const arrays = this.latchArrays;
    arrays.digestBonus = this.digestBonus;
    arrays.latchPrey = f.latchPrey;
    arrays.latchCell = f.latchCell;
    arrays.organismCellCount = this.organisms.cellCount;

    metabolize(live, n, f, this.hash, this.light, economy, env, pred, graze, arrays);

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

    // Sessile plants: sever drained chain/base PHOTO cells and free cells cut off from a base to
    // MEAT (the only per-cell plant death path). Runs on post-drain energies, before lifecycle; the
    // freed cells stay ALIVE slots (now MEAT) so the tick-start live set is unchanged for ageing
    // and lifecycle. rebuildLive happens inside when anything severed. `broke > 0` forces the
    // reachability reap so a strain-broken chain fragment (relabelled to a fresh org by split-on-break,
    // baseless and immortal) is collapsed to MEAT instead of leaking org ids + inflating the field.
    if (cfg.sessilePlants) {
      this.plants.severEatenChainCells(
        this.cells,
        this.bonds,
        live,
        n,
        cfg.meatEnergyOnDeath,
        broke > 0,
      );
    }

    // Age the tick-start live set BEFORE lifecycle. The free-list is LIFO, so a
    // slot freed in lifecycle is reused for a division child the same tick;
    // ageing first keeps that child at the age 0 lifecycle sets (not 1).
    for (let k = 0; k < n; k++) {
      const i = live[k]!;
      f.age[i] = (f.age[i]! + 1) >>> 0;
    }

    // Density-dependent carrying capacity (crowdDivideCap): count cells per coarse grid bucket
    // at post-integrate positions so lifecycle can cap PHOTO division where the plant field is
    // already dense. Skipped entirely when the cap is OFF (byte-identical to the un-capped sim).
    if (cfg.crowdDivideCap < 65535) this.fillDensity(live, n);

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
      cfg.crowdDivideCap,
      cfg.sessilePlants,
      this.tickCount,
      this.lifecycleResult,
    );
    this.lastBirths = this.lifecycleResult.births;
    this.lastDeaths = this.lifecycleResult.deaths;

    // Phase-1 drifting zones: recompute the light cap at the drifted patch centers BEFORE the
    // field relaxes toward it. Hard-skipped at amplitude 0 → cap[] is never touched (byte-identical).
    if (cfg.driftAmplitude > 0) this.light.driftCap(this.tickCount, cfg.driftAmplitude);
    this.light.step(cfg.lightDiffuse, cfg.lightRegen);

    // M9-early: environment field steps (all allocation-free). Guarded on enable flags
    // so a default (all-OFF) config pays zero per-tick cost — byte-identical AND no perf hit.
    if (cfg.tempColdPenalty > 0 || cfg.tempHeatPenalty > 0) {
      this.temperature.step(cfg.tempDiffuse, cfg.tempRegen);
    }
    if (this.glowEffectors.effectorCount > 0) this.glow.step(cfg.glowDiffuse, cfg.glowDecay);
    if (cfg.toxinDamage > 0 || cfg.toxinDepositOnMeatDecay > 0) {
      this.toxin.step(cfg.toxinDiffuse, cfg.toxinDecay);
    }
    if (cfg.currentStrength > 0) this.current.step(cfg.currentEvolveRate);

    // Re-derive the live set so metrics exclude freed corpses (free() leaves
    // cellType=MEAT) and include fresh-slot newborns; population == aliveCount.
    this.rebuildLive();

    // Step 9 ENVIRONMENT (food): deposit smell from currently-alive edible cells onto
    // the PERSISTENT field (do NOT clear — like LightField), then diffuse + decay so
    // deposit balances decay into an equilibrium ∝ local food density. Deposit over the
    // post-lifecycle live set (only-alive) at post-integrate positions; SENSE reads this
    // field on the NEXT tick (one-tick coupling).
    const food = this.food;
    const preyField = this.preyField;
    const predScent = this.predScent;
    const dep = cfg.foodDeposit;
    const preyDep = cfg.preyDeposit;
    const predScentDep = cfg.predScentDeposit;
    const predationOn = preyDep > 0; // predation OFF (default) → skip ALL prey-field work (zero added cost)
    const fleeOn = predScentDep > 0; // fleeing OFF (default) → skip ALL pred-scent field work (byte-identical)
    const carn = this.organisms.carnivore;
    for (let k = 0; k < this.liveCount; k++) {
      const idx = this.liveIndices[k]!;
      const t = f.cellType[idx]!;
      if (isEdibleBy(CellType.MOTILE, t)) food.depositAt(f.posX[idx]!, f.posY[idx]!, dep);
      // Prey-scent: living forager (NON-carnivore organism) flesh emits the gradient predators hunt.
      // Pred-scent: carnivore flesh emits the gradient foragers flee. Mirror images, same grid.
      if (predationOn || fleeOn) {
        const org = f.organismId[idx]!;
        if (org !== 0 && isFlesh(t)) {
          if (predationOn && carn[org] === 0)
            preyField.depositAt(f.posX[idx]!, f.posY[idx]!, preyDep);
          if (fleeOn && carn[org] === 1)
            predScent.depositAt(f.posX[idx]!, f.posY[idx]!, predScentDep);
        }
      }
    }
    food.step(cfg.foodDiffuse, cfg.foodDecay);
    if (predationOn) preyField.step(cfg.foodDiffuse, cfg.foodDecay);
    if (fleeOn) predScent.step(cfg.foodDiffuse, cfg.foodDecay);

    // Step 11b HEARING: deposit `loudnessGain·speed` (speed = hypot(velX, velY)) per live cell over
    // the post-lifecycle live set, then step (same diffuse/decay as the smell fields). SENSE reads the
    // gradient NEXT tick (one-tick coupling, like smell). OFF (loudnessGain===0, default) → both the
    // deposit loop AND the step are skipped entirely: zero added cost, NoiseField stays all-zero,
    // byte-identical (mirrors the predationOn/fleeOn guards above).
    if (cfg.loudnessGain > 0) {
      const noise = this.noise;
      const gain = cfg.loudnessGain;
      for (let k = 0; k < this.liveCount; k++) {
        const idx = this.liveIndices[k]!;
        const vx = f.velX[idx]!;
        const vy = f.velY[idx]!;
        noise.depositAt(f.posX[idx]!, f.posY[idx]!, gain * Math.hypot(vx, vy));
      }
      noise.step(cfg.foodDiffuse, cfg.foodDecay);
    }

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

    // Sessile plants: settle slowed spores into fresh bases (reads post-integrate velocity + the
    // just-aggregated organism numbers) and grow each plant one tip cell when it can afford one.
    // Both iterate the post-lifecycle live set ascending; growth/settle alloc cells deterministically.
    if (cfg.sessilePlants) {
      this.plants.settleSpores(
        this.cells,
        this.organisms,
        this.liveIndices,
        this.liveCount,
        cfg.plantSettleSpeed,
        cfg.plantBaseDensityCap,
      );
      this.plants.growPlants(
        this.cells,
        this.bonds,
        this.organisms,
        this.liveIndices,
        this.liveCount,
        cfg.seed,
        this.tickCount,
        cfg.worldWidth,
        cfg.worldHeight,
        cfg.plantMaxChain,
        cfg.plantGrowthThreshold,
        cfg.plantGrowthCost,
        cfg.plantBondLen,
      );
    }

    // 11d M6: atomic organism death (starved) — BEFORE reproduction so a dead organism
    // cannot reproduce the same tick. Reaps bonds + frees ids/genomes; rebuild nets if any died.
    this.deathOut.deadRefs.length = 0;
    const orgDied = killStarvedOrganisms(
      this.cells,
      this.net,
      this.bonds,
      this.organisms,
      this.genomes,
      this.glowEffectors,
      this.liveIndices,
      this.liveCount,
      cfg.organismDeathFloor,
      cfg.meatEnergyOnDeath,
      this.dyingScratch,
      this.deathOut,
    );
    if (orgDied) {
      this.net.rebuildLive(this.cells);
      this.bonds.rebuildLive(this.cells);
    }
    this.lastOrganismDeaths = this.deathOut.deaths;
    // M7: record deaths for the just-freed orgs (recordDeath only stamps an existing node's
    // deathTick — it never reads the store, so draining after store.free is safe).
    for (const ref of this.deathOut.deadRefs) this.lineage.recordDeath(ref, this.tickCount);

    // 11e M6: asexual reproduction (threshold + maternal provisioning). Structural; allocates
    // only on an actual birth (the scan is allocation-free).
    this.syncReproParams();
    this.reproOut.bornRefs.length = 0;
    reproduceOrganisms(
      this.cells,
      this.net,
      this.bonds,
      this.organisms,
      this.genomes,
      this.glowEffectors,
      this.liveIndices,
      this.liveCount,
      this.mutationRng,
      this.mutationRates,
      this.reproParams,
      this.instantiateScratch,
      this.reproOut,
    );
    this.lastOrganismBirths = this.reproOut.births;
    // M7: record births for the just-committed children (recordBirth reads the store; the
    // children are registered — not freed — during reproduce, so present at drain time).
    for (const ref of this.reproOut.bornRefs) this.lineage.recordBirth(ref, this.tickCount);

    // Sessile plants: a mature plant ejects ONE free PHOTO spore (organismId=0, anchored=0) with a
    // deterministic impulse; it drifts and settles into a new base on a later tick. Iterates the
    // post-lifecycle live set ascending; the new spore acts (settles/photosynthesizes) next tick.
    if (cfg.sessilePlants) {
      this.plants.producePlantSpores(
        this.cells,
        this.organisms,
        this.liveIndices,
        this.liveCount,
        cfg.seed,
        this.tickCount,
        cfg.worldWidth,
        cfg.worldHeight,
        cfg.plantMaturityChain,
        cfg.plantSporeThreshold,
        cfg.plantSporeCost,
        cfg.plantSporeImpulse,
      );
    }

    // 11f M6: adulthood tracking + live-organism count (one O(maxOrganisms) scan).
    let liveOrgs = 0;
    let newlyAdult = 0;
    for (let org = 1; org < this.organisms.maxOrganisms; org++) {
      if (!this.organisms.isAlive(org) || this.organisms.cellCount[org]! === 0) continue;
      liveOrgs++;
      if (
        this.organisms.reachedAdulthood[org]! === 0 &&
        this.organisms.energy[org]! >= cfg.reproThreshold
      ) {
        this.organisms.reachedAdulthood[org] = 1;
        newlyAdult++;
      }
    }
    this.birthsReachedAdulthood += newlyAdult;

    sampleMetrics(
      this.metrics,
      this.liveIndices,
      this.liveCount,
      f,
      this.tickCount,
      this.lifecycleResult.births,
      this.lifecycleResult.deaths,
      liveOrgs,
      this.lastOrganismBirths,
      this.lastOrganismDeaths,
      this.birthsReachedAdulthood,
    );

    // M7: evolution telemetry at reduced cadence (allocates a Map → kept off the per-tick
    // hot loop). Read-only; not part of the SoA determinism contract.
    if (this.tickCount % cfg.metricsEvolutionInterval === 0) {
      sampleEvolutionMetrics(this.metrics, this.organisms, this.genomes);
      this.lineageBoard = sampleLineages(
        this.organisms,
        this.genomes,
        this.lineageStats,
        this.tickCount,
        8,
      );
      this.lineage.prune(cfg.maxLineageNodes);
      this.speciesBoard = sampleSpecies(this.organisms, this.genomes);
    }

    this.tickCount++;
  }
}
