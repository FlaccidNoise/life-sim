import { type Config } from './config';
import { Rng } from './rng';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { computeRepulsion, integrate } from './physics';
import { FoodField } from './food-field';
import { senseFood } from './sense';
import { steer } from './brain';
import { seedGenome } from './genome';
import { metabolize, cullDead, reproduce } from './economy';
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
    );
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
      );
    } else {
      this.food.reset();
    }
    this.seedWorld();
  }

  /** Populate the initial organisms — rejection-sampled onto fertile spots (the pockets). */
  private seedWorld(): void {
    const { worldWidth, worldHeight, initialPopulation, driftSpeed, maxOrganisms } = this.config;
    const s = this.store;
    const n = Math.min(initialPopulation, maxOrganisms);
    const fertileThreshold = 0.3 * this.food.capacity; // "in a pocket"
    for (let k = 0; k < n; k++) {
      const i = s.alloc();
      if (i < 0) break;
      // Try a few random spots; take the first in a pocket (else the last tried) so founders start on
      // food rather than starving in dead water.
      let bx = 0;
      let by = 0;
      let best = -1;
      for (let t = 0; t < 8; t++) {
        const tx = this.rng.range(0, worldWidth);
        const ty = this.rng.range(0, worldHeight);
        const f = this.food.sampleAt(tx, ty);
        if (f > best) {
          best = f;
          bx = tx;
          by = ty;
        }
        if (f >= fertileThreshold) break;
      }
      s.x[i] = bx;
      s.y[i] = by;
      const angle = this.rng.range(0, Math.PI * 2);
      s.vx[i] = Math.cos(angle) * driftSpeed;
      s.vy[i] = Math.sin(angle) * driftSpeed;
      s.heading[i] = angle;
      s.energy[i] = this.config.birthEnergy;
      seedGenome(s.brain, s.hue, i, this.rng, this.config.founderSigma);
    }
    s.rebuildLive();
  }

  /** Advance one tick. Deterministic; ascending live-slot order; RNG only at reproduction. */
  step(): void {
    const cfg = this.config;
    const s = this.store;
    s.rebuildLive();
    this.hash.build(s);
    // SENSE → THINK/ACT: perceive the food gradient, then steer (sets the thrust force).
    senseFood(s, this.food, cfg.senseStep, cfg.worldWidth, cfg.worldHeight);
    steer(s, cfg.maxTurn, cfg.maxThrust);
    // MOVE: repulsion adds onto the thrust force, then integrate.
    computeRepulsion(s, this.hash, cfg.cellRadius, cfg.repulsion, cfg.worldWidth, cfg.worldHeight);
    integrate(
      s,
      cfg.dt,
      cfg.damping,
      cfg.maxSpeed,
      cfg.stabilityClamp,
      cfg.worldWidth,
      cfg.worldHeight,
    );
    // METABOLIZE → REPRO/DIE
    metabolize(s, this.food, cfg.eatRate, cfg.basalCost, cfg.moveCost);
    this.lastDeaths = cullDead(s);
    this.lastBirths = reproduce(
      s,
      this.rng,
      cfg.reproThreshold,
      cfg.reproCost,
      cfg.birthEnergy,
      cfg.offspringOffset,
      cfg.mutationSigma,
      cfg.hueMutationSigma,
      cfg.worldWidth,
      cfg.worldHeight,
    );
    this.totalBirths += this.lastBirths;
    this.totalDeaths += this.lastDeaths;
    s.rebuildLive();
    // FIELDS
    this.food.step(cfg.foodRegen, cfg.foodDiffuse);
    this.tick++;
  }

  /** Reset to the seeded initial state (byte-identical to construction with the same config). */
  reset(): void {
    this.rng.state = this.config.seed;
    this.store.clear();
    this.tick = 0;
    this.lastBirths = this.lastDeaths = this.totalBirths = this.totalDeaths = 0;
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
    return h.hex();
  }
}
