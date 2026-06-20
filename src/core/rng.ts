/**
 * Seeded PRNG — the SINGLE source of randomness in the simulation. Determinism contract: the whole
 * sim is a pure function of (initial state, config); the only entropy enters here, and the RNG state
 * is part of the saved state. Drawn ONLY at seeding / birth / mutation — NEVER inside the per-tick
 * hot loop (see World.step), so a tick is a pure function of state.
 *
 * Algorithm: mulberry32 — a 32-bit-state generator using Math.imul for engine-independent integer
 * math (no BigInt, no float-order hazards). Fast, deterministic, adequate statistical quality for a
 * simulation (it is not, and need not be, cryptographic).
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** The full internal state (serialize this to checkpoint a run). */
  get state(): number {
    return this.s;
  }
  set state(v: number) {
    this.s = v >>> 0;
  }

  /** Next unsigned 32-bit integer. */
  nextU32(): number {
    let a = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    a = Math.imul(a ^ (a >>> 15), 1 | a);
    a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
    return (a ^ (a >>> 14)) >>> 0;
  }

  /** Float in [0, 1). */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  /** Float in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + this.float() * (hi - lo);
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  /**
   * Standard-normal sample (Box–Muller). Stateless across calls (no cached spare) so the RNG state
   * stays a single number and serialization is trivial; the discarded second variate is acceptable.
   */
  gaussian(mean = 0, std = 1): number {
    let u = 0;
    while (u === 0) u = this.float(); // avoid log(0)
    const v = this.float();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Derive an INDEPENDENT sub-stream deterministically (for later phases that want, e.g., a mutation
   * stream separate from a placement stream so adding draws to one doesn't perturb the other). Pure:
   * does not consume this generator's state.
   */
  fork(streamId: number): Rng {
    let h = (this.s ^ Math.imul(streamId + 1, 0x9e3779b1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    return new Rng(h);
  }
}
