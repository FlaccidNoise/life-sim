import { type Config } from './config';
import { Rng } from './rng';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { applyFlowForce, computeRepulsion, integrate } from './physics';
import { FoodField } from './food-field';
import { Walls } from './walls';
import { FlowField } from './flow-field';
import { PheroField } from './phero-field';
import { senseFood, senseCreatures, senseEnv } from './sense';
import { steer, learn } from './brain';
import {
  seedGenome,
  seedScalarGenes,
  ScalarGene,
  SCALAR_GENE_COUNT,
  SCALAR_GENE_SPECS,
} from './genome';
import { metabolize, hunt, cullDead, reproduce } from './economy';
import { Hasher } from './hash';

/**
 * The simulation world — owns the config, the single RNG, the organism store, and the spatial hash,
 * and runs the tick.
 *
 * PHASE 3 tick: SENSE (food gradient) → THINK/ACT (steer: turn + thrust toward food) → MOVE
 * (repulsion + integrate) → METABOLIZE (eat + costs + age) → REPRO/DIE → FIELDS (food regrow +
 * diffuse). RNG is consumed only at reproduction (birth events, ascending order) and at seeding —
 * never in the hot loops — so a tick is a pure function of state and the determinism contract holds.
 */
export class World {
  readonly config: Config;
  readonly rng: Rng;
  readonly store: OrganismStore;
  readonly hash: SpatialHash;
  readonly food: FoodField;
  readonly walls: Walls;
  readonly flow: FlowField;
  /** The pheromone field — a diffusing deposit-and-sense scalar grid. Allocated ONLY when
   *  cfg.pheromoneEnabled; null otherwise, so the OFF path never deposits/senses/steps/hashes and stays
   *  byte-identical. */
  readonly phero: PheroField | null;
  /** Whether the env-sense brain genes are LIVE this run — captured at construction (from the presence
   *  of walls / flow), so live-tuning a strength to 0 mid-run never changes the genome draw COUNT and the
   *  determinism contract holds. With both false the organism RNG stream is byte-identical to a pre-env world. */
  readonly wallSenseGenes: boolean;
  readonly flowSenseGenes: boolean;
  readonly pheroSenseGenes: boolean;
  tick = 0;
  /** Per-tick + cumulative vital rates (telemetry — drives the population graph and the gate). */
  lastBirths = 0;
  lastDeaths = 0;
  totalBirths = 0;
  totalDeaths = 0;

  constructor(config: Config) {
    this.config = config;
    this.rng = new Rng(config.seed);
    this.store = new OrganismStore(config.maxOrganisms);
    this.hash = new SpatialHash(
      config.worldWidth,
      config.worldHeight,
      2 * config.cellRadius,
      config.maxOrganisms,
    );
    this.food = new FoodField(
      config.worldWidth,
      config.worldHeight,
      config.foodCols,
      config.foodRows,
      config.foodCap,
      config.foodInit,
      config.foodChannels,
      config.foodChannelRatio,
      config.foodPocketChannelMode,
      config.foodChannelAWallTied,
      config.foodChannelBDriftMult,
    );
    this.walls = new Walls(
      config.worldWidth,
      config.worldHeight,
      config.wallCols,
      config.wallRows,
      config,
    );
    this.flow = new FlowField(
      config.worldWidth,
      config.worldHeight,
      config.foodCols,
      config.foodRows,
      config,
    );
    // Pheromone field sized to the food grid. Built ONLY when enabled → null is the byte-identical OFF path.
    this.phero = config.pheromoneEnabled
      ? new PheroField(config.worldWidth, config.worldHeight, config.foodCols, config.foodRows)
      : null;
    // Capture once: env-sense genes are live iff the world has walls / flow. Fixed for the run's lifetime
    // so the genome draw count can't shift if a strength is live-tuned to 0 mid-run.
    this.wallSenseGenes = config.wallRegionCount > 0;
    this.flowSenseGenes = config.flowStrength > 0 || config.flowPushStrength > 0;
    this.pheroSenseGenes = config.pheromoneEnabled;
    this.setup();
  }

  /**
   * Seed the food field + organisms. Called from the constructor AND reset() so the RNG is consumed
   * identically both times (→ reset reproduces construction). Patches first (if any), then creatures.
   */
  private setup(): void {
    const cfg = this.config;
    if (cfg.foodPatchCount > 0) {
      this.food.seedPatches(
        cfg.foodPatchCount,
        cfg.foodPatchRadius,
        cfg.foodBaseFertility,
        this.rng,
        cfg.foodPatchRichness,
        cfg.foodPatchRichnessVar,
        cfg.foodMaxFertility,
        cfg.pocketCapVariance,
        // Lever C draws per-pocket K scales from a FORKED substream (does NOT consume this.rng), so the
        // archipelago LAYOUT — pocket centres + the main-RNG draws here — is identical across variance;
        // only each island's K changes (founders then rejection-sample onto the re-weighted biomass).
        this.rng.fork(0xc),
        // ch2-diff wall-tied placement: a pure read of the wall proximity field (built before setup) so
        // near-wall pockets get channel A. Only consulted when foodChannelAWallTied is ON; passing it
        // unconditionally is harmless (the food field ignores it on the legacy path → byte-identical).
        (x, y) => this.walls.proximityAt(x, y),
      );
    } else {
      this.food.reset();
    }
    this.seedWorld();
  }

  /** Populate the initial organisms — rejection-sampled onto fertile spots (the pockets). Predators are
   *  optionally cluster-seeded into the deepest pockets (founding-protection) so a hunter lineage starts
   *  together on a dense prey reservoir rather than scattered into the sparse bootstrap. */
  private seedWorld(): void {
    const {
      worldWidth,
      worldHeight,
      initialPopulation,
      driftSpeed,
      maxOrganisms,
      predatorSeedClusters,
    } = this.config;
    const s = this.store;
    const n = Math.min(initialPopulation, maxOrganisms);
    const fertileThreshold = 0.3 * this.food.capacity; // "in a pocket"
    // Founding-protection: pick the N deepest pockets as predator NURSERIES (sorted by fertility depth) so
    // the hunter founders start together in a prey-rich reservoir — the founding lottery is the real gate
    // on big-world predation. Empty when the knob is OFF or there are no pockets → predators fall back to
    // the same rejection-sample as grazers (the byte-identical OFF state). Sort reads fertility, no RNG.
    const nurseries: { x: number; y: number }[] = [];
    if (predatorSeedClusters > 0 && this.food.patchCenters.length > 0) {
      const sorted = [...this.food.patchCenters].sort(
        (a, b) => this.food.fertilityAt(b.x, b.y) - this.food.fertilityAt(a.x, a.y),
      );
      for (let p = 0; p < Math.min(predatorSeedClusters, sorted.length); p++)
        nurseries.push(sorted[p]!);
    }
    const jx = (this.config.foodPatchRadius * worldWidth) / this.config.foodCols; // pocket radius (world u)
    const jy = (this.config.foodPatchRadius * worldHeight) / this.config.foodRows;
    for (let k = 0; k < n; k++) {
      const i = s.alloc();
      if (i < 0) break;
      // Bimodal DIET seed: the first predatorFraction of founders are hunters, rest grazers (diet 0). This
      // expresses the predator niche from t0 (it won't bootstrap from an all-grazer start).
      const isPredator = k < this.config.predatorFraction * n;
      let bx = 0;
      let by = 0;
      if (isPredator && nurseries.length > 0) {
        // Cluster this predator into one of the deepest pockets (round-robin), jittered within the pocket,
        // so the hunter lineage starts together on a dense prey reservoir. 2 RNG draws (vs the scan below).
        const nur = nurseries[k % nurseries.length]!;
        bx = (((nur.x + this.rng.range(-jx, jx)) % worldWidth) + worldWidth) % worldWidth;
        by = (((nur.y + this.rng.range(-jy, jy)) % worldHeight) + worldHeight) % worldHeight;
      } else {
        // Try a few random spots; take the first in a pocket (else the last tried) so founders start on
        // food rather than starving in dead water.
        let best = -1;
        for (let t = 0; t < 8; t++) {
          const tx = this.rng.range(0, worldWidth);
          const ty = this.rng.range(0, worldHeight);
          // Reject spawns inside walls (gated: with walls off this is byte-identical — same draws, same
          // sampleAt). A solid candidate scores -1 so an open fertile pocket always wins over it.
          const f =
            this.walls.active && this.walls.isSolidAt(tx, ty) ? -1 : this.food.sampleAt(tx, ty);
          if (f > best) {
            best = f;
            bx = tx;
            by = ty;
          }
          if (f >= fertileThreshold) break;
        }
      }
      s.x[i] = bx;
      s.y[i] = by;
      const angle = this.rng.range(0, Math.PI * 2);
      s.vx[i] = Math.cos(angle) * driftSpeed;
      s.vy[i] = Math.sin(angle) * driftSpeed;
      s.heading[i] = angle;
      seedGenome(
        s.brain,
        s.hue,
        i,
        this.rng,
        this.config.founderSigma,
        this.wallSenseGenes,
        this.flowSenseGenes,
        this.config.hungerSense,
        this.pheroSenseGenes,
      );
      seedScalarGenes(s.scalarGenes, i, this.rng, this.config); // incl. life-history + trophic genes
      // Seed predators as OMNIVORES (diet 0.6): they survive on plants through the sparse early phase
      // AND hunt opportunistically, so the trait isn't wiped before prey density builds (without
      // prey-sensing a pure hunter starves first). Diet then evolves up where hunting pays.
      s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.DIET] = isPredator ? 0.7 : 0;
      // Wide UNIFORM SIZE seed: spread founders across a flat body-size band so distinct size niches (and
      // the predation refuge + shelter pulls they drive) exist from t0, instead of all clustering at the
      // center. spread 0 → all at center (the ablation). Clamped to the SIZE gene range [2,32].
      const spread = this.config.founderSizeSpread;
      if (spread > 0) {
        const c = this.config.cellRadius;
        const sizeSpec = SCALAR_GENE_SPECS[ScalarGene.SIZE]!;
        const lo = Math.max(sizeSpec.min, c * (1 - spread));
        const hi = Math.min(sizeSpec.max, c * (1 + spread));
        s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE] = this.rng.range(lo, hi);
      }
      // Founder starts at its own (seeded) BIRTH_ENERGY gene — consistent with how offspring are provisioned.
      s.energy[i] = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.BIRTH_ENERGY]!;
      s.prevEnergy[i] = s.energy[i]!; // first-tick learning reward = 0 (no spurious jump)
      s.resetLearned(i); // runtime brain starts at the founder's instinct
    }
    s.rebuildLive();
  }

  /** Advance one tick. Deterministic; ascending live-slot order; RNG only at reproduction. */
  step(): void {
    const cfg = this.config;
    const s = this.store;
    s.rebuildLive();
    this.hash.build(s);
    // SENSE → THINK/ACT: perceive the food gradient (per-creature sense range) + SIGHT (nearby creatures
    // within the vision cone; uses the start-of-tick hash), then steer (per-creature genes; sets thrust).
    senseFood(s, this.food, cfg);
    senseEnv(s, this.walls, cfg.flowStrength > 0 ? this.flow : null, this.phero, cfg);
    senseCreatures(s, this.hash, cfg, this.walls);
    steer(s, cfg.learningEnabled, cfg.eligLambda, cfg.motorSquash, cfg);
    // MOVE: flow push (size-scaled current) then repulsion add onto the thrust force, then integrate.
    if (cfg.flowPushStrength > 0) applyFlowForce(s, this.flow, cfg);
    computeRepulsion(s, this.hash, cfg.cellRadius, cfg.repulsion, cfg.worldWidth, cfg.worldHeight);
    integrate(
      s,
      cfg.dt,
      cfg.damping,
      cfg.stabilityClamp,
      cfg.worldWidth,
      cfg.worldHeight,
      cfg.cellRadius,
      cfg.sizeSpeedExp,
      this.walls,
    );
    // HUNT: predators (diet>0) bite nearby creatures. Rebuild the hash at post-MOVE positions first so
    // bites use where creatures actually are this tick.
    this.hash.build(s);
    hunt(s, this.hash, cfg, this.phero);
    // METABOLIZE → LEARN → REPRO/DIE. Energy (the band the creature is in) is known after metabolize,
    // so the energy-gated within-life consolidation runs here (eligibility traces were laid in steer).
    metabolize(s, this.food, this.hash, cfg, this.phero);
    if (cfg.learningEnabled)
      learn(s, cfg.learningRate, cfg.weightDecay, cfg.maxLearnDeviation, cfg.learnRewardClamp);
    this.lastDeaths = cullDead(s);
    this.lastBirths = reproduce(
      s,
      this.rng,
      cfg,
      this.wallSenseGenes,
      this.flowSenseGenes,
      this.walls,
    );
    this.totalBirths += this.lastBirths;
    this.totalDeaths += this.lastDeaths;
    s.rebuildLive();
    // FIELDS
    this.food.step(
      cfg.foodRegen,
      cfg.foodDiffuse,
      cfg.flowStrength > 0 ? this.flow : null,
      this.walls.active ? this.walls.foodBlockedMask() : null,
    );
    // Pheromone diffuse + decay, IMMEDIATELY after the food field (this tick's deposits, laid in
    // metabolize/hunt, now spread + forget). Null when disabled → skipped entirely (byte-identical OFF).
    if (this.phero !== null)
      this.phero.step(
        cfg.pheroDiffuse,
        cfg.pheroDecay,
        this.walls.active ? this.walls.foodBlockedMask() : null,
      );
    this.tick++;
  }

  /** Reset to the seeded initial state (byte-identical to construction with the same config). */
  reset(): void {
    this.rng.state = this.config.seed;
    this.store.clear();
    this.tick = 0;
    this.lastBirths = this.lastDeaths = this.totalBirths = this.totalDeaths = 0;
    if (this.phero !== null) this.phero.reset();
    this.setup();
  }

  get population(): number {
    return this.store.liveCount;
  }

  /** Deterministic fingerprint of the full dynamic state (the determinism-contract digest). */
  stateHash(): string {
    const h = new Hasher();
    const s = this.store;
    h.u32(this.tick);
    h.u32(this.rng.state);
    h.u32(s.liveCount);
    const { liveIndices, liveCount, x, y, vx, vy, heading, energy, age, genId } = s;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      h.f(x[i]!);
      h.f(y[i]!);
      h.f(vx[i]!);
      h.f(vy[i]!);
      h.f(heading[i]!);
      h.f(energy[i]!);
      h.u32(age[i]!);
      h.u32(genId[i]!);
    }
    this.food.hashInto(h); // food is part of the sim state
    // The pheromone field is part of sim state ONLY when active (after food, gated) → byte-identical when off.
    if (this.phero !== null) this.phero.hashInto(h);
    return h.hex();
  }
}
