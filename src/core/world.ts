import { type Config } from './config';
import { Rng } from './rng';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { applyFlowForce, computeRepulsion, integrate } from './physics';
import { FoodField } from './food-field';
import { Walls } from './walls';
import { FlowField } from './flow-field';
import { ScentField } from './scent-field';
import { PheroField } from './phero-field';
import { Parcels } from './parcels';
import { senseFood, senseCreatures, senseEnv, senseCrowding, senseFertility } from './sense';
import { steer, learn } from './brain';
import {
  seedGenome,
  seedScalarGenes,
  ScalarGene,
  SCALAR_GENE_COUNT,
  SCALAR_GENE_SPECS,
  BRAIN_GENES,
} from './genome';
import {
  metabolize,
  hunt,
  eatParcels,
  cullDead,
  reproduce,
  depositScent,
  parasiteStep,
  scavenge,
} from './economy';
import { Hasher } from './hash';
import { biomeAt } from './biomes';

/** Sync attached parasites to their host's post-move position (parasite rides the host; no own
 *  locomotion while attached). Gated on parasiteEnabled so OFF is a no-op → byte-identical. */
function syncParasites(store: OrganismStore, cfg: Config): void {
  if (!cfg.parasiteEnabled) return;
  const { liveIndices, liveCount, x, y, vx, vy, hostSlot, parasiteCount } = store;
  for (let k = 0; k < liveCount; k++) {
    const i = liveIndices[k]!;
    const host = hostSlot[i]!;
    if (host < 0) continue;
    if (!store.alive[host]!) {
      // Host died → detach. Decrement the host's parasite count (it may be mid-free in cullDead; the
      // count is stale but harmless — the slot's parasiteCount is cleared to 0 in alloc/free).
      if (parasiteCount[host]! > 0) parasiteCount[host] = parasiteCount[host]! - 1;
      hostSlot[i] = -1;
      continue;
    }
    if (store.genId[host]! !== store.hostGen[i]!) {
      // The host's slot was recycled into a NEWBORN (cullDead frees, reproduce reallocs, same tick), so
      // `alive[host]` is true again for an unrelated creature. Detach instead of riding the stranger — and
      // do NOT decrement its parasiteCount, which belongs to the new occupant.
      hostSlot[i] = -1;
      continue;
    }
    x[i] = x[host]!; // ride the host
    y[i] = y[host]!;
    vx[i] = vx[host]!; // match velocity (so the renderer doesn't smear)
    vy[i] = vy[host]!;
  }
}

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
  /** Transient per-tick death positions (x,y pairs) collected by cullDead for the scavenger step.
   *  Sized to maxOrganisms × 2 (every creature could die in one tick). Reused each tick (overwritten). */
  private readonly deathPositions: Float64Array;
  readonly food: FoodField;
  readonly walls: Walls;
  readonly flow: FlowField;
  /** The identity-bearing scent field — a 4-channel diffusing deposit-and-sense grid (role + hue
   *  signature). Allocated ONLY when cfg.pheromoneEnabled; null otherwise, so the OFF path never
   *  deposits/senses/steps/hashes and stays byte-identical. */
  readonly scent: ScentField | null;
  /** The glow field (slice F3) — a diffusing deposit-and-sense scalar grid whose deposit SOURCE is each
   *  creature's store.glow (every tick), so glow becomes a SELECTED communication signal others steer on.
   *  Reuses PheroField (a generic diffusing scalar grid). Allocated ONLY when cfg.glowSense; null otherwise,
   *  so the OFF path never deposits/senses/steps/hashes it. The 4 GLOW_SENSE genes are always drawn either
   *  way, so the draw stream — hence determinism — is identical regardless of this toggle. */
  readonly glowField: PheroField | null;
  /** Drifting SIGHT-ONLY food parcels — discrete, smell-less, high-value motes that only the sight system
   *  perceives (giving the VISION genes a payoff). Allocated ONLY when cfg.parcelsEnabled; null otherwise,
   *  so the OFF path never spawns/drifts/senses/eats/hashes parcels and stays byte-identical. All parcel
   *  randomness is on the pool's own forked Rng — world.rng is never touched on the parcel path. */
  readonly parcels: Parcels | null;
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
    this.deathPositions = new Float64Array(config.maxOrganisms * 2);
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
    // Scent field sized to the food grid. Built ONLY when enabled → null is the byte-identical OFF path.
    this.scent = config.pheromoneEnabled
      ? new ScentField(config.worldWidth, config.worldHeight, config.foodCols, config.foodRows)
      : null;
    // Glow field (slice F3) sized to the food grid like phero. Built ONLY when enabled → null is OFF.
    this.glowField = config.glowSense
      ? new PheroField(config.worldWidth, config.worldHeight, config.foodCols, config.foodRows)
      : null;
    // Parcels built ONLY when enabled → null is the byte-identical OFF path. Its forked spawn RNG is
    // created here (cfg.seed ^ SALT), independent of world.rng.
    this.parcels = config.parcelsEnabled ? new Parcels(config) : null;
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
        // Migrating pockets: drift params + a FORKED velocity rng (stream 0x5eed, distinct from lever-C's
        // 0xc) for the two per-channel directions. With fertilityDriftRate 0 the field draws NO velocity rng
        // and never moves → byte-identical. The fork never advances this.rng → the organism stream is untouched.
        cfg.fertilityDriftRate,
        cfg.fertilityDriftInterval,
        cfg.foodPocketDriftRateA,
        cfg.foodPocketDriftRateB,
        cfg.pocketDriftSpeed,
        this.rng.fork(0x5eed),
        // B-food-1: per-pocket drift directions (drawn from the SAME forked velocity rng above). On → each
        // pocket wanders independently; off → the legacy two per-channel global dirs (byte-identical).
        cfg.perPocketDrift,
        // Biome-aware food channel assignment: each pocket gets its biome's preferredChannel instead of
        // round-robin. Pure read of (position → walls → biome → preferredChannel), no RNG → determinism holds.
        // Returns -1 when walls are inactive or the position isn't in a biome → falls back to round-robin.
        (x, y) => {
          const b = biomeAt(this.walls, x, y);
          return b ? b.preferredChannel : -1;
        },
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
      // Seed predators as OMNIVORES (diet 0.7): they survive on plants through the sparse early phase
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
        // Predators seed in the UPPER band (lo lifted by predatorSizeBoost·range) so they have the size
        // weapon to hunt from t0; prey use the full band. Same rng.range draw COUNT either way, and
        // boost 0 leaves the predator floor at lo → byte-identical to the un-boosted seed.
        const plo = isPredator ? lo + this.config.predatorSizeBoost * (hi - lo) : lo;
        s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE] = this.rng.range(plo, hi);
      }
      // Apply biome-specific presets based on spawn position (deterministic: position → region → biome →
      // fixed overrides; no RNG draw, so the determinism contract holds). Gives founders in different
      // wall-biomes different starting brains + scalar genes → regional differentiation from t0. Runs LAST
      // of the gene seeds so a biome override is the final writer — the DIET/SIZE seeds above used to
      // silently overwrite it (the Abyss biome's SIZE 9 never survived on any founder).
      const biome = biomeAt(this.walls, bx, by);
      if (biome) {
        const sg0 = i * SCALAR_GENE_COUNT;
        for (const key in biome.scalarOverrides) {
          const gi = Number(key);
          s.scalarGenes[sg0 + gi] = biome.scalarOverrides[gi]!;
        }
        const bg0 = i * BRAIN_GENES;
        for (const key in biome.brainOverrides) {
          const wi = Number(key);
          s.brain[bg0 + wi] = biome.brainOverrides[wi]!;
        }
        // Seed THERMAL_PREF to the region's temperature optimum so founders start adapted to where they
        // spawned (no temperature-mismatch death spiral at t0). Evolution then tunes it further.
        if (this.config.temperatureMetabCost > 0)
          s.scalarGenes[sg0 + ScalarGene.THERMAL_PREF] = this.walls.regionTempAt(bx, by);
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
    // MIGRATING POCKETS: advance the food-pocket centres (channel A slow along dirA, channel B normal along
    // dirB) + periodically recarve the fertility map, BEFORE sense/metabolize so this tick perceives + eats
    // the moved food. Gated: fertilityDriftRate 0 → no-op (byte-identical OFF). All velocity randomness was
    // drawn from a forked rng at seed time, so this hot-loop call is RNG-free (the determinism contract).
    if (cfg.fertilityDriftRate > 0) this.food.driftPockets(this.tick);
    // SENSE → THINK/ACT: perceive the food gradient (per-creature sense range) + SIGHT (nearby creatures
    // within the vision cone; uses the start-of-tick hash), then steer (per-creature genes; sets thrust).
    // Drifting sight-only parcels: spawn (forked RNG) + advect on the flow BEFORE the sight scan, so the
    // perception below reads this tick's parcel positions. Gated (null = OFF, no-op, byte-identical).
    if (this.parcels !== null) {
      this.parcels.maybeSpawn(this.tick);
      this.parcels.step(cfg.flowStrength > 0 ? this.flow : null, cfg.dt);
    }
    senseFood(s, this.food, cfg);
    senseFertility(s, this.food, cfg);
    senseEnv(
      s,
      this.walls,
      cfg.flowStrength > 0 ? this.flow : null,
      this.scent,
      this.glowField,
      cfg,
    );
    senseCreatures(s, this.hash, cfg, this.walls, this.parcels);
    senseCrowding(s, this.hash, cfg);
    steer(s, cfg.learningEnabled, cfg.eligLambda, cfg.motorSquash, cfg);
    // GLOW DEPOSIT (slice F3): every live creature broadcasts this tick's store.glow (set by steer) into the
    // glow field, so the gradient others sense reflects who is lit up. RNG-free; ascending order. Gated (null
    // = OFF, no-op). diffuse+decay happens in the FIELDS stage below, mirroring the pheromone field exactly.
    if (this.glowField !== null) {
      const { liveIndices, liveCount, x, y, glow } = s;
      const strength = cfg.glowDepositStrength;
      for (let k = 0; k < liveCount; k++) {
        const i = liveIndices[k]!;
        this.glowField.deposit(x[i]!, y[i]!, glow[i]! * strength);
      }
    }
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
      cfg.evolvableDamping,
    );
    // HUNT: predators (diet>0) bite nearby creatures. Rebuild the hash at post-MOVE positions first so
    // bites use where creatures actually are this tick.
    this.hash.build(s);
    hunt(s, this.hash, cfg);
    // PARASITES: attach to / drain hosts (post-MOVE positions, post-hunt so a host drained this tick is
    // weaker). Gated (no-op when off → byte-identical). Attached parasites then ride their host's position.
    parasiteStep(s, this.hash, cfg);
    syncParasites(s, cfg);
    // EAT PARCELS: a creature that its sight steered onto a parcel now cashes the intercept (post-MOVE
    // positions, ascending live-slot order, RNG-free). Gated (null = OFF, byte-identical).
    if (this.parcels !== null) eatParcels(s, this.parcels, cfg);
    // METABOLIZE → LEARN → REPRO/DIE. Energy (the band the creature is in) is known after metabolize,
    // so the energy-gated within-life consolidation runs here (eligibility traces were laid in steer).
    metabolize(s, this.food, this.hash, cfg, this.walls);
    if (cfg.learningEnabled)
      learn(s, cfg.learningRate, cfg.weightDecay, cfg.maxLearnDeviation, cfg.learnRewardClamp);
    this.lastDeaths = cullDead(s, this.deathPositions);
    // SCAVENGE: scavengers absorb energy from this tick's death events (transient corpse biomass).
    // Gated (no-op when off → byte-identical). Runs AFTER cull so dead creatures don't scavenge themselves.
    if (cfg.scavengerEnabled) scavenge(s, this.hash, cfg, this.deathPositions, this.lastDeaths);
    this.lastBirths = reproduce(
      s,
      this.rng,
      cfg,
      this.wallSenseGenes,
      this.flowSenseGenes,
      this.walls,
      this.hash,
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
    // SCENT: every live creature lays its signature at its post-move position (ascending live-slot,
    // RNG-free), then each channel diffuses + forgets. Null when disabled → skipped (byte-identical OFF).
    if (this.scent !== null) {
      depositScent(s, this.scent, cfg);
      this.scent.stepAll(
        cfg.pheroDiffuse,
        cfg.pheroDecay,
        this.walls.active ? this.walls.foodBlockedMask() : null,
      );
    }
    // Glow field diffuse + decay (slice F3), after scent (this tick's glow deposits now spread + forget).
    // Null when disabled → skipped entirely.
    if (this.glowField !== null)
      this.glowField.step(
        cfg.glowDiffuse,
        cfg.glowDecay,
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
    if (this.scent !== null) this.scent.reset();
    if (this.glowField !== null) this.glowField.reset();
    if (this.parcels !== null) this.parcels.reset();
    this.setup();
  }

  get population(): number {
    return this.store.liveCount;
  }

  /** Deterministic fingerprint of the dynamic state (the determinism-contract digest). Covers kinematics,
   *  energy, age, genId, the mate-seeking counters, ALL heritable scalar genes + hue, and the active fields.
   *  The brain weights are intentionally excluded: they drive steer→motion, so a divergence surfaces in
   *  x/y/v transitively, and a full per-creature brain hash on every frame would be prohibitively costly. */
  stateHash(): string {
    const h = new Hasher();
    const s = this.store;
    h.u32(this.tick);
    h.u32(this.rng.state);
    h.u32(s.liveCount);
    const {
      liveIndices,
      liveCount,
      x,
      y,
      vx,
      vy,
      heading,
      energy,
      age,
      genId,
      seeking,
      seekTicksLeft,
      scalarGenes,
      hue,
    } = s;
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
      h.u32(seeking[i]!);
      h.u32(seekTicksLeft[i]!);
      // Heritable genome: motor genes are caught transitively via motion, but motor-inert genes (DISPLAY/
      // PREFERENCE; hue when scent is off) would otherwise be an invisible divergence — fold them in here.
      const g = i * SCALAR_GENE_COUNT;
      for (let j = 0; j < SCALAR_GENE_COUNT; j++) h.f(scalarGenes[g + j]!);
      h.f(hue[i]!);
    }
    this.food.hashInto(h); // food is part of the sim state
    // The scent field is part of sim state ONLY when active (after food, gated) → byte-identical when off.
    if (this.scent !== null) this.scent.hashInto(h);
    // The glow field is part of sim state ONLY when active (after scent, gated) → byte-identical when off.
    if (this.glowField !== null) this.glowField.hashInto(h);
    // Parcels are part of sim state ONLY when active (after the field hashes, gated) → byte-identical OFF.
    if (this.parcels !== null) this.parcels.hashInto(h);
    return h.hex();
  }
}
