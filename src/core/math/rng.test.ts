import { describe, it, expect } from 'vitest';
import { Rng, hash32, hashFloat, hashFloat3 } from './rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('differs for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('produces floats in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const f = r.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it('split produces an independent, deterministic substream', () => {
    expect(new Rng(99).split(1).next()).toBe(new Rng(99).split(1).next());
    expect(new Rng(99).split(1).next()).not.toBe(new Rng(99).split(2).next());
  });

  it('hash32 is deterministic and order-sensitive', () => {
    expect(hash32(1, 2, 3)).toBe(hash32(1, 2, 3));
    expect(hash32(1, 2, 3)).not.toBe(hash32(3, 2, 1));
    expect(hashFloat(5)).toBeGreaterThanOrEqual(0);
    expect(hashFloat(5)).toBeLessThan(1);
  });
});

describe('hashFloat3 (fixed-arity, allocation-free)', () => {
  it('is byte-identical to the variadic hashFloat for 3 args', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, 0],
      [1, 2, 3],
      [7, 150, 99999],
      [-5, 4096, 123],
    ];
    for (const [a, b, c] of cases) {
      expect(hashFloat3(a, b, c)).toBe(hashFloat(a, b, c));
    }
  });
});
