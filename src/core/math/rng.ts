const GOLDEN = 0x9e3779b9;

/** splitmix32 finalizer — maps a 32-bit integer to a well-mixed 32-bit integer. */
export function mix32(z: number): number {
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return (z ^ (z >>> 15)) >>> 0;
}

/** Stateless, order-sensitive hash of integer keys → uint32. */
export function hash32(...ints: number[]): number {
  let h = 0;
  for (const v of ints) h = mix32((h + GOLDEN) ^ (v | 0));
  return h >>> 0;
}

/** Stateless hash → float in [0, 1). */
export function hashFloat(...ints: number[]): number {
  return hash32(...ints) / 4294967296;
}

/**
 * Counter-based seedable PRNG. Deterministic from its seed; `split(streamId)`
 * derives an independent substream so adding draws in one subsystem does not
 * perturb another's stream (spec §6).
 */
export class Rng {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    this.seed = seed | 0;
    this.state = seed | 0;
  }

  /** Next uint32. */
  next(): number {
    this.state = (this.state + GOLDEN) | 0;
    return mix32(this.state);
  }

  /** Next float in [0, 1). */
  float(): number {
    return this.next() / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return this.next() % maxExclusive;
  }

  /** Derive an independent substream keyed by streamId. */
  split(streamId: number): Rng {
    return new Rng(hash32(this.seed, streamId));
  }
}
