/**
 * DRIFTING SIGHT-ONLY FOOD PARCELS — discrete, high-value, perishable food motes that emit NO smell (they
 * are NOT in the FoodField gradient) and are perceived ONLY by the sight system (sense.senseCreatures reads
 * them into the existing sightX/sightY vector). This gives the VISION_RANGE/FOV/ACUITY genes (+ the SIGHT
 * brain weights) a reason to exist: a creature with working eyes can spot + intercept a parcel for a big
 * energy payoff, where smell-only foraging would never find it. Parcels drift on the flow field.
 *
 * DETERMINISM: parcel spawning needs randomness, so it draws from a DEDICATED forked Rng created once at
 * construction (cfg.seed ^ SALT) and advanced ONLY on the spawn path — world.rng is NEVER touched here, so
 * the organism RNG stream (seeding + reproduction) stays byte-identical whether parcels are on or off. The
 * whole pool is allocated only when cfg.parcelsEnabled; when disabled the World holds null and nothing here
 * ever runs (the byte-identical OFF contract). step/advect/decay are RNG-free.
 *
 * Cardinal rule: parcel perception/eating reads only position/energy, never lineage/score.
 */
import { type Config } from './config';
import { type FlowField } from './flow-field';
import { Rng } from './rng';

/** Parcel substream salt — independent of world.rng, the flow SALT, and the wall SALT. */
const SALT = 0x27d4eb2f;

export class Parcels {
  readonly capacity: number;
  /** SoA pool: world-frame position, remaining energy, and a live flag. count = live parcels. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly energy: Float64Array;
  /** Remaining lifetime in ticks (decremented each step; ≤0 → expire). */
  readonly life: Float64Array;
  readonly alive: Uint8Array;
  count = 0;

  private readonly cfg: Config;
  /** The DEDICATED spawn RNG — forked off the seed, never world.rng. Advanced only by spawn(). */
  private readonly parcelRng: Rng;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  /** Static clustered-spawn hotspot centers (drawn once from parcelRng) — length 0 when clustering is off,
   *  so the off path never draws cluster RNG and the spawn stream is identical to uniform spawn. */
  private readonly clusterX: Float64Array;
  private readonly clusterY: Float64Array;
  private readonly clusterCount: number;

  constructor(cfg: Config) {
    this.cfg = cfg;
    this.capacity = cfg.parcelCapacity;
    this.worldWidth = cfg.worldWidth;
    this.worldHeight = cfg.worldHeight;
    this.x = new Float64Array(this.capacity);
    this.y = new Float64Array(this.capacity);
    this.energy = new Float64Array(this.capacity);
    this.life = new Float64Array(this.capacity);
    this.alive = new Uint8Array(this.capacity);
    this.parcelRng = new Rng((cfg.seed ^ SALT) >>> 0);
    // Clustered spawn (optional): allocate + draw the hotspot centers ONCE from the parcel forked RNG. When
    // clustering is off we allocate length 0 and never draw, so the spawn stream stays byte-identical to
    // the uniform path. Floor to an INTEGER ≥1 so the array length (Float64Array truncates) and the spawn
    // index range (parcelRng.int(clusterCount)) agree — a fractional count would otherwise read out of
    // bounds → NaN parcel positions that poison the determinism hash. 0/negative are saved by the ≥1 floor.
    this.clusterCount = Math.max(1, Math.floor(cfg.parcelClusterCount));
    const nClusters = cfg.parcelClustering ? this.clusterCount : 0;
    this.clusterX = new Float64Array(nClusters);
    this.clusterY = new Float64Array(nClusters);
    this.seedClusters();
  }

  /** (Re)generate the static cluster centers from the parcel forked RNG. No-op (no draw) when clustering is
   *  off. Called at construction and on reset(), each right AFTER parcelRng is (re)seeded, so the centers —
   *  and every spawn that follows — reproduce byte-for-byte. */
  private seedClusters(): void {
    for (let i = 0; i < this.clusterX.length; i++) {
      this.clusterX[i] = this.parcelRng.range(0, this.worldWidth);
      this.clusterY[i] = this.parcelRng.range(0, this.worldHeight);
    }
  }

  /** Reset to empty + re-seed the spawn RNG, so reset() reproduces construction byte-for-byte. */
  reset(): void {
    this.alive.fill(0);
    this.count = 0;
    this.parcelRng.state = (this.cfg.seed ^ SALT) >>> 0;
    this.seedClusters();
  }

  /** Find a free slot (first dead in ascending order) or -1 if the pool is full. */
  private freeSlot(): number {
    const { alive, capacity } = this;
    for (let i = 0; i < capacity; i++) if (alive[i] === 0) return i;
    return -1;
  }

  /**
   * Spawn one parcel using ONLY the dedicated parcelRng. Uniform spawn (clustering off) draws 2 values
   * (x, y); clustered spawn draws 3 (cluster index, angle, radius) to place the parcel in a disk about a
   * hotspot. No-op (no RNG draw) when the pool is full, so a full pool can't silently shift the parcel
   * stream. Returns the slot used, or -1 if full.
   */
  spawn(): number {
    const slot = this.freeSlot();
    if (slot < 0) return -1;
    if (this.clusterX.length > 0) {
      // Clustered: pick a hotspot, then a uniform point in a disk of parcelClusterRadius about it.
      const ci = this.parcelRng.int(this.clusterCount);
      const ang = this.parcelRng.range(0, 2 * Math.PI);
      const rad = this.cfg.parcelClusterRadius * Math.sqrt(this.parcelRng.float());
      let px = this.clusterX[ci]! + rad * Math.cos(ang);
      let py = this.clusterY[ci]! + rad * Math.sin(ang);
      px %= this.worldWidth;
      if (px < 0) px += this.worldWidth;
      py %= this.worldHeight;
      if (py < 0) py += this.worldHeight;
      this.x[slot] = px;
      this.y[slot] = py;
    } else {
      this.x[slot] = this.parcelRng.range(0, this.worldWidth);
      this.y[slot] = this.parcelRng.range(0, this.worldHeight);
    }
    this.energy[slot] = this.cfg.parcelEnergy;
    this.life[slot] = this.cfg.parcelLifetime;
    this.alive[slot] = 1;
    this.count++;
    return slot;
  }

  /**
   * Spawn on a fixed interval up to capacity. Called once per tick from world.step; deterministic (tick is
   * the only input). Only draws from parcelRng when it actually spawns.
   */
  maybeSpawn(tick: number): void {
    const interval = this.cfg.parcelSpawnInterval;
    if (interval <= 0) return;
    if (tick % interval !== 0) return;
    if (this.count >= this.capacity) return;
    this.spawn();
  }

  /**
   * Advance every live parcel one tick: advect by the local flow velocity (× parcelDriftMult, toroidal
   * wrap), decay its energy, and age its lifetime. A parcel whose energy or lifetime runs out frees its
   * slot. RNG-free → deterministic. flow may be null (no current) → parcels only decay/age in place.
   */
  step(flow: FlowField | null, dt: number): void {
    const { alive, x, y, energy, life, capacity } = this;
    const drift = this.cfg.parcelDriftMult;
    const decay = this.cfg.parcelDecay;
    const ww = this.worldWidth;
    const wh = this.worldHeight;
    for (let i = 0; i < capacity; i++) {
      if (alive[i] === 0) continue;
      if (flow !== null && drift !== 0) {
        let nx = x[i]! + flow.sampleX(x[i]!, y[i]!) * drift * dt;
        let ny = y[i]! + flow.sampleY(x[i]!, y[i]!) * drift * dt;
        nx %= ww;
        if (nx < 0) nx += ww;
        ny %= wh;
        if (ny < 0) ny += wh;
        x[i] = nx;
        y[i] = ny;
      }
      energy[i] = energy[i]! - decay;
      life[i] = life[i]! - dt;
      if (energy[i]! <= 0 || life[i]! <= 0) {
        alive[i] = 0;
        this.count--;
      }
    }
  }

  /**
   * Free a live parcel slot (when a creature eats it). No-op if already dead. RNG-free.
   */
  consume(slot: number): void {
    if (this.alive[slot] === 0) return;
    this.alive[slot] = 0;
    this.count--;
  }

  /**
   * Nearest live parcel to (x,y) within `range` (world units, toroidal). Returns its slot, or -1 if none.
   * Reads only position — never lineage/score. Used by the eat pass. A simple ascending linear scan (the
   * pool is small); deterministic.
   */
  nearestTo(px: number, py: number, range: number): number {
    const { alive, x, y, capacity } = this;
    const ww = this.worldWidth;
    const wh = this.worldHeight;
    const r2 = range * range;
    let best = -1;
    let bestD = r2;
    for (let i = 0; i < capacity; i++) {
      if (alive[i] === 0) continue;
      let ddx = x[i]! - px;
      let ddy = y[i]! - py;
      // toroidal shortest delta
      if (ddx > ww * 0.5) ddx -= ww;
      else if (ddx < -ww * 0.5) ddx += ww;
      if (ddy > wh * 0.5) ddy -= wh;
      else if (ddy < -wh * 0.5) ddy += wh;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < bestD) {
        bestD = d2;
        best = i;
      }
    }
    return best;
  }

  /** Mix the live parcels (slot order) into the determinism hash — gated by the caller so OFF is no-op. */
  hashInto(h: { f: (v: number) => void; u32: (v: number) => void }): void {
    const { alive, x, y, energy, life, capacity } = this;
    h.u32(this.count);
    for (let i = 0; i < capacity; i++) {
      if (alive[i] === 0) continue;
      h.f(x[i]!);
      h.f(y[i]!);
      h.f(energy[i]!);
      h.f(life[i]!);
    }
  }
}
