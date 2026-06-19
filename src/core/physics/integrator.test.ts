import { describe, it, expect } from 'vitest';
import { integrate } from './integrator';

function single(opts: {
  x: number;
  vx?: number;
  fx?: number;
  damping?: number;
  width?: number;
  anchored?: number;
}) {
  const posX = new Float64Array([opts.x]);
  const posY = new Float64Array([0]);
  const velX = new Float32Array([opts.vx ?? 0]);
  const velY = new Float32Array([0]);
  const forceX = new Float32Array([opts.fx ?? 0]);
  const forceY = new Float32Array([0]);
  const mass = new Float32Array([1]);
  const anchored = new Uint8Array([opts.anchored ?? 0]);
  const live = new Uint32Array([0]);
  integrate(
    live,
    1,
    posX,
    posY,
    velX,
    velY,
    forceX,
    forceY,
    mass,
    anchored,
    1,
    opts.damping ?? 1,
    opts.width ?? 1000,
    1000,
  );
  return { posX, velX, forceX };
}

describe('integrate', () => {
  it('accelerates a cell along an applied force', () => {
    const { posX, velX } = single({ x: 100, fx: 5 });
    expect(velX[0]).toBeCloseTo(5);
    expect(posX[0]).toBeCloseTo(105);
  });

  it('bleeds velocity via damping when no force is applied', () => {
    const { velX } = single({ x: 100, vx: 10, damping: 0.5 });
    expect(velX[0]).toBeCloseTo(5);
  });

  it('wraps position toroidally', () => {
    const { posX } = single({ x: 995, vx: 10, width: 1000 });
    expect(posX[0]).toBeCloseTo(5); // 995 + 10 = 1005 -> 5
  });

  it('resets forces to zero after integrating', () => {
    const { forceX } = single({ x: 100, fx: 5 });
    expect(forceX[0]).toBe(0);
  });

  it('still moves a slow cell at a large coordinate (Float64 precision)', () => {
    // In Float32 a 1e-3 step at x=1e5 would round away (ulp ~0.0078). Float64 keeps it.
    const posX = new Float64Array([1e5]);
    const posY = new Float64Array([0]);
    const velX = new Float32Array([0]);
    const velY = new Float32Array([0]);
    const forceX = new Float32Array([1e-3]);
    const forceY = new Float32Array([0]);
    const mass = new Float32Array([1]);
    integrate(
      new Uint32Array([0]),
      1,
      posX,
      posY,
      velX,
      velY,
      forceX,
      forceY,
      mass,
      new Uint8Array([0]),
      1,
      1,
      1e6,
      1e6,
    );
    expect(posX[0]).not.toBe(1e5);
    expect(posX[0]).toBeCloseTo(1e5 + 1e-3, 6);
  });

  it('pins an anchored cell: zeroes its velocity/force and never moves it', () => {
    const { posX, velX, forceX } = single({ x: 100, vx: 10, fx: 5, anchored: 1 });
    expect(posX[0]).toBe(100);
    expect(velX[0]).toBe(0);
    expect(forceX[0]).toBe(0);
  });
});
