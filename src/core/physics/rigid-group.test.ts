import { describe, it, expect } from 'vitest';
import { repositionPassengers } from './rigid-group';

describe('repositionPassengers — kinematic rigid grouping', () => {
  it('places a passenger at body pos + rotated offset, copies heading, zeroes vel/force', () => {
    // body at slot 0, one passenger at slot 1 with offset (10, 0) in the body frame.
    const passenger = Uint32Array.from([1]);
    const body = Uint32Array.from([0]);
    const offX = Float32Array.from([10]);
    const offY = Float32Array.from([0]);
    const posX = Float64Array.from([100, 999]);
    const posY = Float64Array.from([200, 999]);
    const heading = Float32Array.from([Math.PI / 2, 0]); // body faces +y
    const velX = Float32Array.from([0, 5]);
    const velY = Float32Array.from([0, 5]);
    const forceX = Float32Array.from([0, 7]);
    const forceY = Float32Array.from([0, 7]);

    repositionPassengers(
      passenger,
      body,
      offX,
      offY,
      1,
      posX,
      posY,
      heading,
      velX,
      velY,
      forceX,
      forceY,
      1024,
      1024,
    );

    // offset (10,0) rotated by +90° → (0, 10); passenger at (100, 210).
    expect(posX[1]).toBeCloseTo(100, 4);
    expect(posY[1]).toBeCloseTo(210, 4);
    expect(heading[1]).toBeCloseTo(Math.PI / 2, 6);
    expect(velX[1]).toBe(0);
    expect(velY[1]).toBe(0);
    expect(forceX[1]).toBe(0);
    expect(forceY[1]).toBe(0);
  });

  it('wraps the passenger position toroidally', () => {
    const passenger = Uint32Array.from([1]);
    const body = Uint32Array.from([0]);
    const offX = Float32Array.from([20]);
    const offY = Float32Array.from([0]);
    const posX = Float64Array.from([1015, 0]);
    const posY = Float64Array.from([10, 0]);
    const heading = Float32Array.from([0, 0]); // faces +x → offset (20,0)
    const z = new Float32Array(2);
    repositionPassengers(
      passenger,
      body,
      offX,
      offY,
      1,
      posX,
      posY,
      heading,
      z,
      z,
      z,
      z,
      1024,
      1024,
    );
    // 1015 + 20 = 1035 → wraps to 11.
    expect(posX[1]).toBeCloseTo(11, 4);
  });
});
