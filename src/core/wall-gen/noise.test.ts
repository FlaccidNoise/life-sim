import { describe, it, expect } from 'vitest';
import { carveNoise } from './noise';
import { Rng } from '../rng';

const fraction = (solid: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < solid.length; i++) if (solid[i]) n++;
  return n / solid.length;
};

describe('carveNoise', () => {
  it('hits roughly the target solid fraction', () => {
    const solid = new Uint8Array(64 * 64);
    carveNoise(solid, 64, 64, 0.35, new Rng(1));
    const f = fraction(solid);
    expect(f).toBeGreaterThan(0.2);
    expect(f).toBeLessThan(0.5);
  });

  it('is deterministic from the same Rng seed', () => {
    const a = new Uint8Array(64 * 64);
    const b = new Uint8Array(64 * 64);
    carveNoise(a, 64, 64, 0.35, new Rng(7));
    carveNoise(b, 64, 64, 0.35, new Rng(7));
    expect(a).toEqual(b);
  });
});
