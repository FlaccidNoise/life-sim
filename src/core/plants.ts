/**
 * PLANTS AS ENTITIES — a separate SoA pool of rooted, brainless, immobile organisms with their own
 * evolving genome, replacing the FoodField's scalar biomass channels as the world's producer layer.
 * Plan: plans/2026-09-plants-as-entities.md (increment 1: the pool runs in parallel; nothing eats it yet).
 *
 * Why a separate pool and not a `kind` flag on OrganismStore (§1.3): a creature slot is 2,659 bytes and
 * 83.5% of that is the brain triple, which is dead weight on a brainless entity — 32,768 plants cost
 * 1.9 MB here against 87 MB there — and a `kind` branch would land in ~15 hot loops already tuned to
 * byte-identical determinism. It also lets the plant spatial hash use its own 32u cell (sized to the
 * graze/shade reach) instead of the creature hash's 12u repulsion cell.
 *
 * LIFECYCLE, per tick, in this ORDER (§3.1a — the order is a correctness constraint, not style):
 *   grow (clamped) → upkeep → age → seed → cull
 * `plantUpkeep` is charged OUTSIDE the growth clamp and can drive E negative in the same tick, so the
 * cull must run after it and before anything downstream reads E — a negative E would emit a negative
 * deposit into the diffusing scent field, make √E NaN in the render size, and land in the state hash.
 *
 * DETERMINISM: all plant randomness is on a DEDICATED forked Rng (cfg.seed ^ SALT), never world.rng, so
 * the organism stream is byte-identical whether plants are on or off (the property that makes increment
 * 1 measurable in isolation). Live iteration is ascending slot order. The pool is allocated ONLY when
 * cfg.plantsEnabled; World holds null otherwise and nothing here ever runs.
 */
import { type Config } from './config';
import { type FoodField } from './food-field';
import { type Walls } from './walls';
import { lightAxis, lightAtAxis, type LightAxis } from './abiotic';
import { Rng } from './rng';
import { SpatialHash } from './spatial-hash';

/** Plant substream salt — distinct from the parcel (0x27d4eb2f), wall (0x9e3779b9) and flow (0x85ebca6b)
 *  salts, so no two forked streams shadow each other for any seed. */
const SALT = 0x6a09e667;

/**
 * The plant genome — its OWN enum and its OWN Float32Array. It does not touch ScalarGene,
 * SCALAR_GENE_COUNT or the animal gene layout, so the tail-gating rule is not engaged and every animal
 * gene offset is untouched.
 */
export enum PlantGene {
  /** Logistic growth rate r, 0.01–0.30. */
  GROWTH_RATE = 0,
  /** Ceiling scale: K = MAX_SIZE · fert · lightT · crowdK. 5–120. */
  MAX_SIZE = 1,
  /** Dispersal radius for a seed, in world units. 20–900. */
  SEED_RANGE = 2,
  /** Armour (NOT toxin): cuts the bite symmetrically — the plant loses less and the grazer gains less.
   *  Costs upkeep. Read by grazing in increment 2. 0–1. */
  DEFENCE = 3,
  /** How much of the ceiling rides on light: 0 = shade-tolerant flat yield, 1 = full sun-demander. 0–1. */
  LIGHT_NEED = 4,
  /** Position on the continuous resource axis animals match FORAGE_PREF against; also splits the plant
   *  scent between its two channels. 0–1. */
  SPECIES = 5,
}

export const PLANT_GENE_COUNT = 6;

/** Every PlantGene, so the seeding and mutation loops iterate a TYPED list rather than a bare index. */
const ALL_GENES: readonly PlantGene[] = [
  PlantGene.GROWTH_RATE,
  PlantGene.MAX_SIZE,
  PlantGene.SEED_RANGE,
  PlantGene.DEFENCE,
  PlantGene.LIGHT_NEED,
  PlantGene.SPECIES,
];

/** Hard gene bounds (§2). Mutation and founder draws clamp into these. */
const GENE_MIN = [0.01, 5, 20, 0, 0, 0] as const;
const GENE_MAX = [0.3, 120, 900, 1, 1, 1] as const;

/** Founder attempts per plant: a bounded rejection sample onto fertile, open, uncrowded ground. Bounded
 *  so the draw COUNT is a function of state alone (an unbounded retry loop would be too, but it lets one
 *  pathological config stall seeding). Mirrors world.seedWorld's 8-try founder scan. */
const FOUNDER_TRIES = 16;

export class Plants {
  readonly capacity: number;
  /** SoA pool. Position is fixed for a plant's whole life (rooted). */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly energy: Float64Array;
  readonly age: Uint16Array;
  readonly seedCooldownLeft: Uint16Array;
  /** capacity × PLANT_GENE_COUNT, PlantGene-indexed. */
  readonly genes: Float32Array;
  readonly alive: Uint8Array;
  /** Ascending list of live slots, rebuilt by rebuildLive(). Named to match OrganismStore so SpatialHash
   *  builds from either. */
  readonly liveIndices: Uint32Array;
  liveCount = 0;
  /** The plant hash — its own cell size, sized to the larger of the shade and graze reaches so a 3×3
   *  neighbourhood is guaranteed to cover both (the rule spatial-hash.ts documents). */
  readonly hash: SpatialHash;

  private readonly cfg: Config;
  private readonly food: FoodField;
  private readonly walls: Walls;
  private readonly light: LightAxis;
  /** The DEDICATED plant Rng — forked off the seed, never world.rng. */
  private readonly plantRng: Rng;
  /** LIFO free stack (store.ts's discipline, NOT Parcels' O(capacity) linear scan — that is fine at 120
   *  slots and disqualifying at 32,768). */
  private readonly freeStack: number[] = [];
  /** Live plants per hash bucket, maintained on alloc/free. Makes §3.3's germination cell cap an O(1)
   *  read instead of a neighbourhood scan. Exact because a plant never moves. */
  private readonly cellCount: Uint16Array;
  /** Per-live-plant neighbour count for this tick's crowd terms — ONE scan feeds BOTH crowdK and shadeL.
   *  Parallel to liveIndices, not to slots. */
  private readonly shadeCount: Uint16Array;

  constructor(cfg: Config, food: FoodField, walls: Walls) {
    this.cfg = cfg;
    this.food = food;
    this.walls = walls;
    this.capacity = cfg.plantCapacity;
    this.x = new Float64Array(this.capacity);
    this.y = new Float64Array(this.capacity);
    this.energy = new Float64Array(this.capacity);
    this.age = new Uint16Array(this.capacity);
    this.seedCooldownLeft = new Uint16Array(this.capacity);
    this.genes = new Float32Array(this.capacity * PLANT_GENE_COUNT);
    this.alive = new Uint8Array(this.capacity);
    this.liveIndices = new Uint32Array(this.capacity);
    this.shadeCount = new Uint16Array(this.capacity);
    this.light = lightAxis(cfg);
    this.hash = new SpatialHash(
      cfg.worldWidth,
      cfg.worldHeight,
      Math.max(cfg.plantShadeRange, cfg.plantGrazeRange),
      this.capacity,
    );
    this.cellCount = new Uint16Array(this.hash.cols * this.hash.rows);
    this.plantRng = new Rng((cfg.seed ^ SALT) >>> 0);
    this.clear();
    this.seedFounders();
    this.rebuildLive();
  }

  /** Empty the pool. Free stack seeded descending so the first allocations come out 0,1,2,… ascending. */
  private clear(): void {
    this.alive.fill(0);
    this.energy.fill(0);
    this.age.fill(0);
    this.seedCooldownLeft.fill(0);
    this.genes.fill(0);
    this.cellCount.fill(0);
    this.freeStack.length = 0;
    for (let i = this.capacity - 1; i >= 0; i--) this.freeStack.push(i);
    this.liveCount = 0;
  }

  /** Reset to the seeded initial state + re-seed the plant Rng, so World.reset() reproduces construction
   *  byte-for-byte (the property Parcels.reset maintains and world.test.ts asserts). */
  reset(): void {
    this.clear();
    this.plantRng.state = (this.cfg.seed ^ SALT) >>> 0;
    this.seedFounders();
    this.rebuildLive();
  }

  /** Rebuild the ascending live list. Call after any birth/death pass, before the next hash build. */
  rebuildLive(): void {
    const { alive, liveIndices, capacity } = this;
    let n = 0;
    for (let i = 0; i < capacity; i++) if (alive[i] === 1) liveIndices[n++] = i;
    this.liveCount = n;
  }

  /** Rebuild the plant spatial hash at the current live positions. Called from world.step beside the
   *  pre-hunt creature hash build, so grazing (increment 2) sees post-move creature positions against
   *  current plants. Plants never move, so this is pure bookkeeping over births/deaths. */
  buildHash(): void {
    this.hash.build(this);
  }

  /** THE single light seam (§13.2). `tick` is unused today and is the hook the day/night arc fills in;
   *  every light consumer must route through one function so that arc is a change to one body. Caching
   *  light per plant at germination is explicitly excluded for the same reason — pay the sine. */
  private lightAt(x: number, y: number, tick: number): number {
    void tick;
    return lightAtAxis(x, y, this.light);
  }

  private bucketOf(x: number, y: number): number {
    return this.hash.rowOf(y) * this.hash.cols + this.hash.colOf(x);
  }

  /** Take a free slot and place a live plant at (x,y). Returns the slot, or -1 when the pool is full —
   *  which IS the global roof on plant count (§3.4a: the cell cap is a local constraint, not the roof). */
  private alloc(x: number, y: number): number {
    const slot = this.freeStack.pop();
    if (slot === undefined) return -1;
    this.alive[slot] = 1;
    this.x[slot] = x;
    this.y[slot] = y;
    this.age[slot] = 0;
    this.seedCooldownLeft[slot] = 0;
    const b = this.bucketOf(x, y);
    this.cellCount[b] = this.cellCount[b]! + 1;
    return slot;
  }

  private free(slot: number): void {
    if (this.alive[slot] === 0) return;
    this.alive[slot] = 0;
    const b = this.bucketOf(this.x[slot]!, this.y[slot]!);
    this.cellCount[b] = this.cellCount[b]! - 1;
    this.freeStack.push(slot);
  }

  /** Is this position a legal germination site? Open ground, fertile enough to grow on, and not already
   *  at the local clump cap. Shared by founder seeding and germination so the two can never disagree. */
  private siteOk(x: number, y: number): boolean {
    if (this.walls.active && this.walls.isSolidAt(x, y)) return false;
    if (this.food.fertilityAt(x, y) < this.cfg.plantGermFertility) return false;
    return this.cellCount[this.bucketOf(x, y)]! < this.cfg.plantCellCap;
  }

  /** Draw one gene value for a founder: gaussian about the config centre for the three sized genes,
   *  UNIFORM over the full range for DEFENCE / LIGHT_NEED / SPECIES. The uniform three seed uniform for
   *  the same reason FORAGE_PREF and the morph genes do — a founding pool clustered at a centre has no
   *  raw material and selection would have to build the range by slow mutation. */
  private founderGene(g: PlantGene, centre: number): number {
    const v =
      g >= PlantGene.DEFENCE
        ? this.plantRng.float()
        : this.plantRng.gaussian(centre, this.cfg.plantFounderSigma * centre);
    return clamp(v, GENE_MIN[g]!, GENE_MAX[g]!);
  }

  private centreOf(g: PlantGene): number {
    const cfg = this.cfg;
    return g === PlantGene.GROWTH_RATE
      ? cfg.plantGrowthRate
      : g === PlantGene.MAX_SIZE
        ? cfg.plantMaxSize
        : g === PlantGene.SEED_RANGE
          ? cfg.plantSeedRange
          : 1; // the uniform three: the centre only scales their mutation step
  }

  /** Scatter the founding generation onto fertile open ground by bounded rejection sampling. */
  private seedFounders(): void {
    const cfg = this.cfg;
    const n = Math.min(cfg.plantFounderCount, this.capacity);
    for (let k = 0; k < n; k++) {
      if (this.freeStack.length === 0) break;
      let px = -1;
      let py = -1;
      for (let t = 0; t < FOUNDER_TRIES; t++) {
        const tx = this.plantRng.range(0, cfg.worldWidth);
        const ty = this.plantRng.range(0, cfg.worldHeight);
        if (this.siteOk(tx, ty)) {
          px = tx;
          py = ty;
          break;
        }
      }
      if (px < 0) continue; // no legal site in this founder's tries — it simply doesn't establish
      const slot = this.alloc(px, py);
      if (slot < 0) break;
      const g = slot * PLANT_GENE_COUNT;
      for (let j = 0; j < PLANT_GENE_COUNT; j++)
        this.genes[g + j] = this.founderGene(j, this.centreOf(j));
      this.energy[slot] = cfg.plantSeedEnergy;
    }
  }

  /**
   * ONE 3×3 plant-hash scan per live plant → the neighbour count that feeds BOTH crowd terms. Run as its
   * own pass BEFORE growth so the count every plant sees is start-of-tick state: a mid-pass cull would
   * otherwise stop shading later plants, and a germination into that freed slot would be counted at the
   * dead plant's stale hash position. Excludes self.
   */
  private countNeighbours(): void {
    const { liveIndices, liveCount, x, y, hash, shadeCount } = this;
    const r2 = this.cfg.plantShadeRange * this.cfg.plantShadeRange;
    const ww = this.cfg.worldWidth;
    const wh = this.cfg.worldHeight;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const px = x[i]!;
      const py = y[i]!;
      let n = 0;
      // 3×3 scan inlined off bucketStart/sorted (public "so kernels inline the scan") rather than through
      // forEachNeighbor — the callback form would allocate one closure per plant per tick, 20k/tick at the
      // target density, and this is already the largest new pass in the budget.
      const cx = hash.colOf(px);
      const cy = hash.rowOf(py);
      for (let dyc = -1; dyc <= 1; dyc++) {
        const by = (cy + dyc + hash.rows) % hash.rows;
        for (let dxc = -1; dxc <= 1; dxc++) {
          const bx = (cx + dxc + hash.cols) % hash.cols;
          const b = by * hash.cols + bx;
          const end = hash.bucketStart[b + 1]!;
          for (let idx = hash.bucketStart[b]!; idx < end; idx++) {
            const j = hash.sorted[idx]!;
            if (j === i) continue;
            let dx = x[j]! - px;
            let dy = y[j]! - py;
            if (dx > ww * 0.5) dx -= ww;
            else if (dx < -ww * 0.5) dx += ww;
            if (dy > wh * 0.5) dy -= wh;
            else if (dy < -wh * 0.5) dy += wh;
            if (dx * dx + dy * dy <= r2) n++;
          }
        }
      }
      shadeCount[k] = n;
    }
  }

  /**
   * Advance every live plant one tick: grow (clamped) → upkeep → age → seed → cull, in that order (§3.1a).
   * RNG is drawn ONLY on the germination path, and only from the plant substream. Iterates the ascending
   * live snapshot, so a plant germinated this tick does not grow or seed in the same tick.
   */
  step(tick: number): void {
    const cfg = this.cfg;
    const { liveIndices, liveCount, x, y, energy, age, seedCooldownLeft, genes, shadeCount } = this;
    this.countNeighbours();
    const low = cfg.plantLowLightYield;
    const upkeep = cfg.plantUpkeep;
    const defUpkeep = cfg.plantDefenceUpkeep;
    const minK = cfg.plantMinK;
    const starve = cfg.plantStarveRate;
    const e0 = cfg.plantSeedEnergy;
    const deathE = cfg.plantDeathEnergy;
    const maxAge = cfg.plantMaxAge;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      const g = i * PLANT_GENE_COUNT;
      const px = x[i]!;
      const py = y[i]!;
      const n = shadeCount[k]!;
      // TWO crowd terms from ONE scan. crowdK is UNIVERSAL (space + soil) so no gene combination escapes
      // density feedback; shadeL is light-specific, so shade-tolerance buys immunity to the light half
      // only. Without the universal term a LIGHT_NEED-0 plant has no ceiling at all.
      const crowdK = 1 / (1 + cfg.plantCrowdK * n);
      const shadeL = 1 / (1 + cfg.plantShadeK * n);
      const lightEff = this.lightAt(px, py, tick) * shadeL;
      const lightT = low + (lightEff - low) * genes[g + PlantGene.LIGHT_NEED]!;
      const K = genes[g + PlantGene.MAX_SIZE]! * this.food.fertilityAt(px, py) * lightT * crowdK;
      // GUARD (§3.1a): K reaches EXACTLY zero by two routes — fertility 0 on the dead water a drifting
      // pocket can vacate under a living plant, and lightT 0 for a committed sun-demander germinated in a
      // trough of the light field. Unguarded, 1 − E/0 is −Infinity and the NaN propagates into the scent
      // deposit, the render buffer and the determinism hash.
      const Kc = K > minK ? K : minK;
      let e = energy[i]!;
      const growth = genes[g + PlantGene.GROWTH_RATE]! * (e + e0) * (1 - e / Kc);
      // The second clamp bounds collapse: at K 0.5 and E 35 the raw term is −242/tick, arithmetically
      // correct (70× over the ceiling) but a large negative into a hashed Float64 in one tick. Both clamps
      // are no-ops in the healthy regime.
      e += growth > -starve * e ? growth : -starve * e;
      // Upkeep is charged OUTSIDE the clamp and can take E negative — hence the cull below, same pass.
      e -= upkeep * (1 + defUpkeep * genes[g + PlantGene.DEFENCE]!);
      energy[i] = e;
      if (age[i]! < 65535) age[i] = age[i]! + 1;
      if (seedCooldownLeft[i]! > 0) seedCooldownLeft[i] = seedCooldownLeft[i]! - 1;
      else if (e >= cfg.plantSeedThreshold * K && K > minK) this.trySeed(i, g, px, py, e);
      const eNow = energy[i]!;
      if (eNow <= deathE || age[i]! >= maxAge) this.free(i);
    }
    this.rebuildLive();
  }

  /**
   * One dispersal attempt. Draw discipline (§3.3): a FULL POOL draws nothing, so a full pool cannot
   * silently shift the plant stream; past that check the two placement values are drawn and the cost and
   * the cooldown are paid whether or not the site turns out to be legal — a failed dispersal is still a
   * dispersal. Mutation draws happen only on a successful germination.
   */
  private trySeed(parent: number, g: number, px: number, py: number, e: number): void {
    if (this.freeStack.length === 0) return;
    const cfg = this.cfg;
    const ang = this.plantRng.range(0, 2 * Math.PI);
    const rad = this.genes[g + PlantGene.SEED_RANGE]! * Math.sqrt(this.plantRng.float());
    const tx = wrap(px + rad * Math.cos(ang), cfg.worldWidth);
    const ty = wrap(py + rad * Math.sin(ang), cfg.worldHeight);
    if (this.siteOk(tx, ty)) {
      const child = this.alloc(tx, ty);
      if (child >= 0) {
        const cg = child * PLANT_GENE_COUNT;
        for (const j of ALL_GENES) {
          const mutated = this.plantRng.gaussian(
            this.genes[g + j]!,
            cfg.plantMutationSigma * this.centreOf(j),
          );
          this.genes[cg + j] = clamp(mutated, GENE_MIN[j]!, GENE_MAX[j]!);
        }
        this.energy[child] = cfg.plantSeedEnergy;
      }
    }
    this.energy[parent] = e - cfg.plantSeedCost;
    this.seedCooldownLeft[parent] = cfg.plantSeedCooldown;
  }

  /** Σ energy over live plants — the standing crop (probe / history / HUD). */
  totalBiomass(): number {
    const { liveIndices, liveCount, energy } = this;
    let s = 0;
    for (let k = 0; k < liveCount; k++) s += energy[liveIndices[k]!]!;
    return s;
  }

  /**
   * Mix the live plants (ascending slot order) into the determinism hash — gated by the caller so the OFF
   * path is byte-identical. ALL SIX GENES ARE HASHED: the world.stateHash comment folds scalarGenes in
   * precisely because motor-inert genes would be an invisible divergence, and a plant never moves, so
   * every plant gene is motor-inert. SPECIES and DEFENCE surface only through the scent split and through
   * which animals choose to eat a plant — both indirect, both able to cancel.
   */
  hashInto(h: { f: (v: number) => void; u32: (v: number) => void }): void {
    const { liveIndices, liveCount, x, y, energy, age, seedCooldownLeft, genes } = this;
    h.u32(liveCount);
    h.u32(this.plantRng.state); // the forked stream is dynamic state: catches a draw-count divergence
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      h.f(x[i]!);
      h.f(y[i]!);
      h.f(energy[i]!);
      h.u32(age[i]!);
      h.u32(seedCooldownLeft[i]!);
      const g = i * PLANT_GENE_COUNT;
      for (let j = 0; j < PLANT_GENE_COUNT; j++) h.f(genes[g + j]!);
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function wrap(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}
