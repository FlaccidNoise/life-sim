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
import { makeMetrics, sampleMetrics, sampleEvolutionMetrics, type Metrics } from './metrics';
import { sampleLineages, type LineageSummary, type LineageStat } from './lineage-board';
import { GenomeStore } from '../genome/genome';
import { LineageLog } from '../genome/lineage-log';
import { reproduceOrganisms, type ReproParams } from '../organism/reproduction';
import { killStarvedOrganisms } from '../organism/organism-death';
import { type MutationRates } from '../genome/mutate';

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
  private readonly mutationRates: MutationRates;
  private readonly reproParams: ReproParams;
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
    this.genomes = new GenomeStore();
    this.lineage = new LineageLog(this.genomes);
    this.mutationRng = this.rng.split(2 /* STREAM_MUTATION */);
    this.dyingScratch = new Uint8Array(config.maxOrganisms);
    this.instantiateScratch = new Int32Array(config.maxCellsPerOrganism);
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
    this.reproOut = { births: 0, bornRefs: [] };
    this.deathOut = { deaths: 0, deadRefs: [] };
    this.birthsReachedAdulthood = 0;
    this.lastOrganismBirths = 0;
    this.lastOrganismDeaths = 0;
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
    mr.duplicateSubgraphRate = cfg.mutationDuplicateSubgraphRate;
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

    // 11d M6: atomic organism death (starved) — BEFORE reproduction so a dead organism
    // cannot reproduce the same tick. Reaps bonds + frees ids/genomes; rebuild nets if any died.
    this.deathOut.deadRefs.length = 0;
    const orgDied = killStarvedOrganisms(
      this.cells,
      this.net,
      this.bonds,
      this.organisms,
      this.genomes,
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
    }

    this.tickCount++;
  }
}
