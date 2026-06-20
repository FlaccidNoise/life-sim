import { BRAIN_GENES } from './genome';

/**
 * Organism store — data-oriented SoA (structure-of-arrays). No per-entity objects: parallel typed
 * arrays indexed by slot, with a free-list + generational ids for safe slot recycling (a stale
 * reference is detected by a genId mismatch). This is the carry-forward memory pattern from the old
 * engine.
 *
 * Determinism: live iteration is ALWAYS in ascending slot order (rebuildLive scans ascending), so
 * results never depend on allocation history. Phase 0 holds only kinematic + bookkeeping fields;
 * later phases append arrays (brain state, genome ref, sense gains, …).
 */
export class OrganismStore {
  readonly capacity: number;

  // Kinematics (Float64 throughout — no Float32 mixing, a determinism rule).
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly vx: Float64Array;
  readonly vy: Float64Array;
  readonly heading: Float64Array;
  readonly energy: Float64Array;

  // Transient per-tick force accumulator (zeroed each tick before force passes; not part of saved
  // state, so it is NOT hashed — x/y/vx/vy already capture the dynamic state it produces).
  readonly forceX: Float64Array;
  readonly forceY: Float64Array;

  // Transient per-tick sensed food gradient (world frame), recomputed each tick from positions+food.
  // Not hashed (derived). Surfaced in the inspector so you can see what an organism perceives.
  readonly senseX: Float64Array;
  readonly senseY: Float64Array;

  // Genome (heritable, mutated at birth): the brain weights (BRAIN_GENES per slot) + the hue gene.
  readonly brain: Float32Array;
  readonly hue: Float32Array;

  // Within-life (Baldwin) learning state — RUNTIME, NOT heritable. learnedBrain is what steer() reads;
  // it is reset to the genome `brain` at birth and drifts via reward-modulated Hebbian plasticity, so
  // learning dies with the individual (no Lamarckian leak — children copy `brain`, never learnedBrain).
  // Not hashed: derived, individual-lifetime-only state.
  readonly learnedBrain: Float32Array; // BRAIN_GENES per slot
  readonly elig: Float32Array; // BRAIN_GENES per slot — eligibility traces (pre·post, decayed)
  readonly rewardEma: Float64Array; // EMA of net energy/tick → the reward signal

  // Bookkeeping.
  readonly age: Uint32Array;
  readonly genId: Uint32Array;
  readonly alive: Uint8Array;

  /** Free slots available for allocation (LIFO). Reuse is genId-guarded. */
  private readonly freeStack: number[] = [];

  /** Ascending list of live slots, rebuilt by rebuildLive(). */
  readonly liveIndices: Uint32Array;
  liveCount = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float64Array(capacity);
    this.y = new Float64Array(capacity);
    this.vx = new Float64Array(capacity);
    this.vy = new Float64Array(capacity);
    this.heading = new Float64Array(capacity);
    this.energy = new Float64Array(capacity);
    this.forceX = new Float64Array(capacity);
    this.forceY = new Float64Array(capacity);
    this.senseX = new Float64Array(capacity);
    this.senseY = new Float64Array(capacity);
    this.brain = new Float32Array(capacity * BRAIN_GENES);
    this.hue = new Float32Array(capacity);
    this.learnedBrain = new Float32Array(capacity * BRAIN_GENES);
    this.elig = new Float32Array(capacity * BRAIN_GENES);
    this.rewardEma = new Float64Array(capacity);
    this.age = new Uint32Array(capacity);
    this.genId = new Uint32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.liveIndices = new Uint32Array(capacity);
    this.clear();
  }

  /**
   * Reset to empty. Free-list seeded descending so the first allocations come out 0,1,2,… ascending.
   * genId is reset too: a full clear() is a brand-new world, so generations start fresh and any
   * reference held across the reset is correctly invalidated (and reset() stays byte-identical to a
   * fresh construction — generations don't drift upward across resets).
   */
  clear(): void {
    this.alive.fill(0);
    this.age.fill(0);
    this.genId.fill(0);
    this.freeStack.length = 0;
    for (let i = this.capacity - 1; i >= 0; i--) this.freeStack.push(i);
    this.liveCount = 0;
  }

  /** Allocate a slot, or -1 if the store is full. Bumps the slot's generation. */
  alloc(): number {
    const slot = this.freeStack.pop();
    if (slot === undefined) return -1;
    this.alive[slot] = 1;
    this.genId[slot] = (this.genId[slot]! + 1) >>> 0;
    this.age[slot] = 0;
    return slot;
  }

  /**
   * Reset a slot's within-life learning state: copy its genome `brain` into the runtime `learnedBrain`
   * and zero the eligibility traces + reward EMA. Called at birth (after the genome is written) and at
   * seeding, so every individual starts learning from its inherited instinct — the no-Lamarck rule.
   */
  resetLearned(slot: number): void {
    const b = slot * BRAIN_GENES;
    for (let g = 0; g < BRAIN_GENES; g++) {
      this.learnedBrain[b + g] = this.brain[b + g]!;
      this.elig[b + g] = 0;
    }
    this.rewardEma[slot] = 0;
  }

  /** Free a slot (no-op if already free). */
  free(slot: number): void {
    if (this.alive[slot] === 0) return;
    this.alive[slot] = 0;
    this.freeStack.push(slot);
  }

  /** True if the slot is live (and matches gen, when supplied — the stale-reference guard). */
  isAlive(slot: number, gen?: number): boolean {
    if (this.alive[slot] !== 1) return false;
    return gen === undefined || this.genId[slot] === gen;
  }

  /** Rebuild the ascending live-slot list. Call after any births/deaths and before iterating/hashing. */
  rebuildLive(): void {
    let n = 0;
    const { alive, liveIndices, capacity } = this;
    for (let i = 0; i < capacity; i++) {
      if (alive[i] === 1) liveIndices[n++] = i;
    }
    this.liveCount = n;
  }
}
