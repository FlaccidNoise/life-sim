import { type Config } from './config';
import { Rng } from './rng';
import { OrganismStore } from './store';
import { Hasher } from './hash';

/** Wrap a coordinate into [0, size) on the torus. */
function wrap(v: number, size: number): number {
  const m = v % size;
  return m < 0 ? m + size : m;
}

/**
 * The simulation world — owns the config, the single RNG, and the organism store, and runs the tick.
 *
 * PHASE 0 tick is intentionally minimal: constant-velocity drift + toroidal wrap + age. There is NO
 * RNG in step() (entropy is consumed only in seedWorld, at construction/reset), so a tick is a pure
 * function of state and the determinism contract holds. Later phases insert real stages into the
 * documented order: SENSE → THINK → ACT → MOVE → METABOLIZE → REPRO/DIE → FIELDS.
 */
export class World {
  readonly config: Config;
  readonly rng: Rng;
  readonly store: OrganismStore;
  tick = 0;

  constructor(config: Config) {
    this.config = config;
    this.rng = new Rng(config.seed);
    this.store = new OrganismStore(config.maxOrganisms);
    this.seedWorld();
  }

  /** Populate the initial organisms. The ONLY place Phase 0 consumes the RNG. */
  private seedWorld(): void {
    const { worldWidth, worldHeight, initialPopulation, driftSpeed, maxOrganisms } = this.config;
    const s = this.store;
    const n = Math.min(initialPopulation, maxOrganisms);
    for (let k = 0; k < n; k++) {
      const i = s.alloc();
      if (i < 0) break;
      s.x[i] = this.rng.range(0, worldWidth);
      s.y[i] = this.rng.range(0, worldHeight);
      const angle = this.rng.range(0, Math.PI * 2);
      s.vx[i] = Math.cos(angle) * driftSpeed;
      s.vy[i] = Math.sin(angle) * driftSpeed;
      s.heading[i] = angle;
      s.energy[i] = 1;
    }
    s.rebuildLive();
  }

  /** Advance one tick. Deterministic; ascending live-slot order; no RNG. */
  step(): void {
    const { dt, worldWidth, worldHeight } = this.config;
    const s = this.store;
    const { liveIndices, liveCount, x, y, vx, vy, age } = s;
    for (let k = 0; k < liveCount; k++) {
      const i = liveIndices[k]!;
      x[i] = wrap(x[i]! + vx[i]! * dt, worldWidth);
      y[i] = wrap(y[i]! + vy[i]! * dt, worldHeight);
      age[i] = (age[i]! + 1) >>> 0;
    }
    this.tick++;
  }

  /** Reset to the seeded initial state (byte-identical to construction with the same config). */
  reset(): void {
    this.rng.state = this.config.seed;
    this.store.clear();
    this.tick = 0;
    this.seedWorld();
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
    return h.hex();
  }
}
