import { describe, it, expect } from 'vitest';
import { applyThrust } from './thrust';

describe('applyThrust', () => {
  it('adds thrust force along heading onto the existing accumulator', () => {
    const heading = Float32Array.from([0, Math.PI / 2]);
    const thrust = Float32Array.from([4, 2]);
    const forceX = Float32Array.from([1, 0]); // pre-existing repulsion
    const forceY = Float32Array.from([0, 0]);
    applyThrust(Uint32Array.from([0, 1]), 2, heading, thrust, forceX, forceY);
    expect(forceX[0]).toBeCloseTo(1 + 4, 5); // +x thrust accumulates onto the 1
    expect(forceY[0]).toBeCloseTo(0, 5);
    expect(forceX[1]).toBeCloseTo(0, 5);
    expect(forceY[1]).toBeCloseTo(2, 5); // +y thrust
  });

  it('skips cells with zero thrust', () => {
    const heading = Float32Array.from([0]);
    const thrust = Float32Array.from([0]);
    const forceX = Float32Array.from([7]);
    const forceY = Float32Array.from([0]);
    applyThrust(Uint32Array.from([0]), 1, heading, thrust, forceX, forceY);
    expect(forceX[0]).toBe(7); // untouched
  });
});
