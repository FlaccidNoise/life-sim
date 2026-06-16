import { describe, it, expect } from 'vitest';
import { SpatialHash } from '../spatial/spatial-hash';
import { computeRepulsion } from './forces';

function setup(positions: [number, number][], r: number) {
  const n = positions.length;
  const posX = new Float64Array(n);
  const posY = new Float64Array(n);
  const radius = new Float32Array(n).fill(r);
  positions.forEach(([x, y], i) => {
    posX[i] = x;
    posY[i] = y;
  });
  const fX = new Float32Array(n);
  const fY = new Float32Array(n);
  const live = new Uint32Array(n);
  for (let i = 0; i < n; i++) live[i] = i;
  const hash = new SpatialHash(100, 100, 10, n);
  hash.build(live, n, posX, posY);
  return { posX, posY, radius, fX, fY, hash };
}

describe('computeRepulsion', () => {
  it('pushes two overlapping cells apart with equal and opposite force', () => {
    const { posX, posY, radius, fX, fY, hash } = setup(
      [
        [50, 50],
        [54, 50],
      ],
      3,
    );
    computeRepulsion(hash, posX, posY, radius, fX, fY, 1);
    // overlap = 6 - 4 = 2; f per unit = 1*2/4 = 0.5; fx = ±4*0.5 = ±2
    expect(fX[0]).toBeCloseTo(-2, 5);
    expect(fX[1]).toBeCloseTo(2, 5);
    expect(fY[0]).toBeCloseTo(0, 5);
  });

  it('applies no force to cells that do not overlap', () => {
    const { posX, posY, radius, fX, fY, hash } = setup(
      [
        [50, 50],
        [80, 50],
      ],
      3,
    );
    computeRepulsion(hash, posX, posY, radius, fX, fY, 1);
    expect(fX[0]).toBe(0);
    expect(fX[1]).toBe(0);
  });

  it('never self-repels', () => {
    const { posX, posY, radius, fX, fY, hash } = setup([[50, 50]], 3);
    computeRepulsion(hash, posX, posY, radius, fX, fY, 1);
    expect(fX[0]).toBe(0);
    expect(fY[0]).toBe(0);
  });
});
