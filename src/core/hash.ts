/**
 * Deterministic state hash (FNV-1a, 32-bit) — the fingerprint behind the determinism contract. Two
 * runs with the same (config, seed) must produce the same hash at every checkpoint; that equality is
 * the golden-master CI test from Phase 0 onward, and the ablation engine compares hashes to decide
 * whether a system is inert (byte-identical ON vs OFF).
 *
 * Floats are hashed by their raw IEEE-754 bytes (engine-stable for +,-,*,/ in fixed order). Hash by
 * LOGICAL live-iteration order, never raw slot layout, so it's robust to free-list divergence.
 */
export class Hasher {
  private h = 0x811c9dc5; // FNV-1a 32-bit offset basis
  private readonly buf = new ArrayBuffer(8);
  private readonly f64 = new Float64Array(this.buf);
  private readonly bytes = new Uint8Array(this.buf);

  private byte(b: number): void {
    this.h ^= b & 0xff;
    this.h = Math.imul(this.h, 0x01000193);
  }

  /** Mix in an unsigned 32-bit integer (little-endian). */
  u32(v: number): void {
    v >>>= 0;
    this.byte(v);
    this.byte(v >>> 8);
    this.byte(v >>> 16);
    this.byte(v >>> 24);
  }

  /** Mix in a float by its 8 raw bytes. */
  f(v: number): void {
    this.f64[0] = v;
    for (let i = 0; i < 8; i++) this.byte(this.bytes[i]!);
  }

  /** Final 8-hex-digit digest. */
  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}
