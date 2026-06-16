import { describe, it, expect } from 'vitest';
import { computeBondForces } from './bond-force';

function run(
  posX: number[],
  posY: number[],
  restLen: number,
  scale = 1,
): { fx: number[]; fy: number[] } {
  const liveBonds = Uint32Array.from([0]);
  const cellA = Uint32Array.from([0]);
  const cellB = Uint32Array.from([1]);
  const rl = Float32Array.from([restLen]);
  const stiff = Float32Array.from([1]);
  const px = Float64Array.from(posX);
  const py = Float64Array.from(posY);
  const fx = new Float32Array(2);
  const fy = new Float32Array(2);
  computeBondForces(liveBonds, 1, cellA, cellB, rl, stiff, px, py, fx, fy, scale, 1024, 1024);
  return { fx: Array.from(fx), fy: Array.from(fy) };
}

describe('computeBondForces — Hookean spring (scatter, toroidal)', () => {
  it('zero force at rest length', () => {
    const { fx, fy } = run([100, 110], [200, 200], 10);
    expect(fx[0]).toBeCloseTo(0, 5);
    expect(fx[1]).toBeCloseTo(0, 5);
    expect(fy[0]).toBeCloseTo(0, 5);
  });

  it('a stretched bond pulls the endpoints together (equal and opposite)', () => {
    // a at 100, b at 120 → dist 20, restLen 10 → stretched by 10. f = -1·(20-10)/20 = -0.5.
    // ddx = a-b = -20 → fx[a] = ddx·f = (-20)(-0.5) = +10 → a pulled toward b (+x). fx[b] = -10.
    const { fx, fy } = run([100, 120], [200, 200], 10);
    expect(fx[0]).toBeCloseTo(10, 4); // a pulled +x toward b
    expect(fx[1]).toBeCloseTo(-10, 4); // b pulled -x toward a (Newton's 3rd)
    expect(fy[0]).toBeCloseTo(0, 5);
  });

  it('a compressed bond pushes the endpoints apart', () => {
    // a at 100, b at 105 → dist 5, restLen 10 → compressed. f = -1·(5-10)/5 = +1.
    // ddx = a-b = -5 → fx[a] = (-5)(1) = -5 → a pushed -x away from b.
    const { fx } = run([100, 105], [200, 200], 10);
    expect(fx[0]).toBeCloseTo(-5, 4);
    expect(fx[1]).toBeCloseTo(5, 4);
  });

  it('stiffnessScale multiplies the force', () => {
    const a = run([100, 120], [200, 200], 10, 1);
    const b = run([100, 120], [200, 200], 10, 3);
    expect(b.fx[0]).toBeCloseTo(a.fx[0]! * 3, 4);
  });

  it('uses the shortest toroidal separation (wraps across the seam)', () => {
    // a at 5, b at 1019 on a 1024 torus → shortest delta = 5 - 1019 wrapped = +10 (a is 10 right of b across the seam).
    const { fx } = run([5, 1019], [200, 200], 10); // dist 10 == restLen → ~0 force
    expect(fx[0]).toBeCloseTo(0, 4);
  });
});
