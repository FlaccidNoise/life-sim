import { describe, it, expect } from 'vitest';
import { Rng } from './rng';

describe('Rng', () => {
  it('is deterministic: same seed → same sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 100 }, () => a.nextU32());
    const seqB = Array.from({ length: 100 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds → different sequences', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const seqA = Array.from({ length: 100 }, () => a.nextU32());
    const seqB = Array.from({ length: 100 }, () => b.nextU32());
    expect(seqA).not.toEqual(seqB);
  });

  it('float() stays in [0, 1)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(n) stays in [0, n)', () => {
    const r = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r.int(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('state save/restore reproduces the subsequent stream', () => {
    const r = new Rng(123);
    for (let i = 0; i < 50; i++) r.nextU32();
    const saved = r.state;
    const after = Array.from({ length: 20 }, () => r.nextU32());
    const restored = new Rng(0);
    restored.state = saved;
    const afterRestore = Array.from({ length: 20 }, () => restored.nextU32());
    expect(afterRestore).toEqual(after);
  });

  it('fork() is pure (does not consume parent state) and stream-dependent', () => {
    const parent = new Rng(99);
    const before = parent.state;
    const s1 = parent.fork(1);
    const s2 = parent.fork(2);
    expect(parent.state).toBe(before); // fork did not advance the parent
    const a = Array.from({ length: 10 }, () => s1.nextU32());
    const b = Array.from({ length: 10 }, () => s2.nextU32());
    expect(a).not.toEqual(b);
  });

  it('gaussian() is deterministic and roughly standard-normal', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    expect(a.gaussian()).toBe(b.gaussian());
    const r = new Rng(11);
    let sum = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) sum += r.gaussian();
    expect(Math.abs(sum / N)).toBeLessThan(0.05); // mean ≈ 0
  });
});
