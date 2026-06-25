import { BRAIN_GENES, SCALAR_GENE_COUNT } from './genome';
import { SCENT_CHANNELS } from './scent-field';

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

  // Transient per-tick EAT-GATE actuator (0..1): the brain's grazing throttle (slice B). Recomputed each
  // tick in steer(); read by metabolize (intake) and applied as a thrust penalty (eating slows the body).
  // Not hashed (derived). Defaults to 1 (full eating) on alloc for the edge-case pre-steer read.
  readonly eatGate: Float64Array;

  // Transient per-tick BITE-GATE actuator (0..1): the brain's predation decision (A2a). Recomputed each tick
  // in steer(); read by hunt() to scale the bite drain. Not hashed (derived). Defaults to 1 (bite-open) on
  // alloc for the edge-case pre-steer read.
  readonly biteGate: Float64Array;

  // Transient per-tick SCENT-GATE actuator (0..1): the brain's broadcast decision (A2b). Recomputed each tick
  // in steer(); read by depositScent() to scale the deposit amount. Not hashed (derived). Defaults to 1
  // (broadcast-open) on alloc for the edge-case pre-steer read.
  readonly scentGate: Float64Array;

  // Transient per-tick MOOD-GLOW actuator (0..1): the brain's bioluminescence output (slice F). Recomputed
  // each tick in steer() from the hidden "mood" layer; read by the renderer (biolum brightness) and, when
  // the glow-sense channel is on, deposited into the glow field. Not hashed (derived).
  readonly glow: Float64Array;

  // Transient per-tick sensed food gradient (world frame), recomputed each tick from positions+food.
  // Not hashed (derived). Surfaced in the inspector so you can see what an organism perceives.
  readonly senseX: Float64Array;
  readonly senseY: Float64Array;

  // Transient per-tick SIGHT vector (world frame): appeal-signed pull toward edible creatures / away
  // from threats, within the creature's vision cone+range. Recomputed each tick; not hashed (derived).
  readonly sightX: Float64Array;
  readonly sightY: Float64Array;

  // Transient per-tick ENVIRONMENT senses (world frame): the wall-proximity gradient (points away from
  // walls) and the local flow vector. Recomputed each tick by senseEnv; not hashed (derived).
  readonly wallSenseX: Float64Array;
  readonly wallSenseY: Float64Array;
  readonly flowSenseX: Float64Array;
  readonly flowSenseY: Float64Array;
  // Transient per-tick SCENT sense (world frame): the local ∇P gradient PER CHANNEL, laid out
  // [i·SCENT_CHANNELS + c]. Recomputed each tick by senseEnv when the field is active (else left 0); not
  // hashed (derived). Wired into steer via the 16 PHERO brain genes (4 channels × lat/fwd × turn/thrust).
  readonly scentSenseX: Float64Array;
  readonly scentSenseY: Float64Array;
  // Transient per-tick GLOW sense (world frame): the local ∇G gradient of the glow field. Recomputed each
  // tick by senseEnv when the field is active (else left 0); not hashed (derived). Wired into steer via the
  // 4 GLOW_SENSE brain genes (slice F3 — the receiver side of the glow communication channel).
  readonly glowSenseX: Float64Array;
  readonly glowSenseY: Float64Array;

  // Transient per-tick LOCAL-CROWDING count (A1b): live neighbors within cfg.crowdSenseRange, written by
  // senseCrowding each tick (0 when bodySense off). Recomputed each tick; not hashed (derived).
  readonly crowding: Float64Array;

  // Transient per-tick FERTILITY-UNDER-FOOT (A1c): total food biomass at the body (summed over active
  // channels), written by senseFertility each tick (0 when bodySense off). Recomputed each tick; not hashed.
  readonly fertHere: Float64Array;

  // Genome (heritable, mutated at birth): the brain weights (BRAIN_GENES per slot) + the hue gene
  // + the scalar genes (SCALAR_GENE_COUNT per slot — see genome.ScalarGene).
  readonly brain: Float32Array;
  readonly hue: Float32Array;
  readonly scalarGenes: Float32Array; // SCALAR_GENE_COUNT per slot

  // Within-life (Baldwin) learning state — RUNTIME, NOT heritable. learnedBrain is what steer() reads;
  // it is reset to the genome `brain` at birth and drifts via energy-gated Hebbian consolidation, so
  // learning dies with the individual (no Lamarckian leak — children copy `brain`, never learnedBrain).
  // Not hashed: derived, individual-lifetime-only state.
  readonly learnedBrain: Float32Array; // BRAIN_GENES per slot
  readonly elig: Float32Array; // BRAIN_GENES per slot — eligibility traces (pre·post, decayed)
  // Energy at the end of the previous tick, per slot — the baseline for the learning REWARD (Δenergy =
  // energy − prevEnergy). Runtime/derived (not hashed). Set at birth/seed so a newborn's first reward is 0.
  readonly prevEnergy: Float64Array;

  // Bookkeeping.
  readonly age: Uint32Array;
  readonly genId: Uint32Array;
  readonly alive: Uint8Array;
  // Breeding refractory countdown (ticks until this slot may breed again; 0 = ready). Only touched when
  // cfg.breedCooldown > 0, so the OFF path never reads/writes it. Auxiliary runtime state — NOT hashed
  // (the determinism golden hash stays byte-identical when the cooldown feature is off).
  readonly breedCooldownLeft: Uint32Array;

  /** Mate-seeking state (life-sim-xa90): 1 while actively looking for a mate; seekTicksLeft counts the
   *  current search window down. Hashed (part of the determinism contract — they steer future behaviour). */
  readonly seeking: Uint8Array;
  readonly seekTicksLeft: Uint32Array;

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
    this.eatGate = new Float64Array(capacity);
    this.biteGate = new Float64Array(capacity);
    this.scentGate = new Float64Array(capacity);
    this.glow = new Float64Array(capacity);
    this.senseX = new Float64Array(capacity);
    this.senseY = new Float64Array(capacity);
    this.sightX = new Float64Array(capacity);
    this.sightY = new Float64Array(capacity);
    this.wallSenseX = new Float64Array(capacity);
    this.wallSenseY = new Float64Array(capacity);
    this.flowSenseX = new Float64Array(capacity);
    this.flowSenseY = new Float64Array(capacity);
    this.scentSenseX = new Float64Array(capacity * SCENT_CHANNELS);
    this.scentSenseY = new Float64Array(capacity * SCENT_CHANNELS);
    this.glowSenseX = new Float64Array(capacity);
    this.glowSenseY = new Float64Array(capacity);
    this.crowding = new Float64Array(capacity);
    this.fertHere = new Float64Array(capacity);
    this.brain = new Float32Array(capacity * BRAIN_GENES);
    this.hue = new Float32Array(capacity);
    this.scalarGenes = new Float32Array(capacity * SCALAR_GENE_COUNT);
    this.learnedBrain = new Float32Array(capacity * BRAIN_GENES);
    this.elig = new Float32Array(capacity * BRAIN_GENES);
    this.prevEnergy = new Float64Array(capacity);
    this.age = new Uint32Array(capacity);
    this.genId = new Uint32Array(capacity);
    this.alive = new Uint8Array(capacity);
    this.breedCooldownLeft = new Uint32Array(capacity);
    this.seeking = new Uint8Array(capacity);
    this.seekTicksLeft = new Uint32Array(capacity);
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
    this.breedCooldownLeft.fill(0);
    this.seeking.fill(0);
    this.seekTicksLeft.fill(0);
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
    this.breedCooldownLeft[slot] = 0; // a newborn is breeding-ready (first breed is never gated)
    this.seeking[slot] = 0;
    this.seekTicksLeft[slot] = 0;
    this.eatGate[slot] = 1; // default full eating until steer() recomputes (avoids a stale pre-steer read)
    this.biteGate[slot] = 1; // default bite-open until steer() recomputes (A2a; avoids a stale pre-steer read)
    this.scentGate[slot] = 1; // default broadcast-open until steer() recomputes (A2b; avoids a stale pre-steer read)
    return slot;
  }

  /**
   * Reset a slot's within-life learning state: copy its genome `brain` into the runtime `learnedBrain`
   * and zero the eligibility traces. Called at birth (after the genome is written) and at seeding, so
   * every individual starts learning from its inherited instinct — the no-Lamarck rule.
   */
  resetLearned(slot: number): void {
    const b = slot * BRAIN_GENES;
    for (let g = 0; g < BRAIN_GENES; g++) {
      this.learnedBrain[b + g] = this.brain[b + g]!;
      this.elig[b + g] = 0;
    }
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
