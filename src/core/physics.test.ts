import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { computeRepulsion, integrate } from './physics';

const W = 512;
const H = 512;

describe('integrate', () => {
  it('symplectic-Euler with no force or damping just advances by velocity', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 100;
    s.y[i] = 100;
    s.vx[i] = 2;
    s.vy[i] = -3;
    s.rebuildLive();
    integrate(s, 1, 1, 1e9, true, W, H);
    expect(s.x[i]).toBeCloseTo(102);
    expect(s.y[i]).toBeCloseTo(97);
  });

  it('damping multiplies velocity each tick', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.vx[i] = 10;
    s.vy[i] = 0;
    s.rebuildLive();
    integrate(s, 1, 0.5, 1e9, true, W, H);
    expect(s.vx[i]).toBeCloseTo(5);
  });

  it('stability clamp caps speed at maxSpeed; OFF lets it through (the ablation)', () => {
    const make = (): OrganismStore => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.vx[i] = 100;
      s.vy[i] = 0;
      s.rebuildLive();
      return s;
    };
    const clamped = make();
    integrate(clamped, 1, 1, 6, true, W, H);
    expect(Math.hypot(clamped.vx[0]!, clamped.vy[0]!)).toBeCloseTo(6);

    const unclamped = make();
    integrate(unclamped, 1, 1, 6, false, W, H);
    expect(Math.hypot(unclamped.vx[0]!, unclamped.vy[0]!)).toBeCloseTo(100);
  });

  it('wraps position toroidally', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = W - 1;
    s.y[i] = 1;
    s.vx[i] = 3;
    s.vy[i] = -3;
    s.rebuildLive();
    integrate(s, 1, 1, 1e9, true, W, H);
    expect(s.x[i]).toBeCloseTo(2); // wrapped past the right edge
    expect(s.y[i]).toBeCloseTo(H - 2); // wrapped past the top
  });
});

describe('computeRepulsion', () => {
  it('pushes two overlapping organisms apart with equal-and-opposite force', () => {
    const s = new OrganismStore(4);
    const a = s.alloc();
    const b = s.alloc();
    s.x[a] = 100;
    s.y[a] = 100;
    s.x[b] = 104; // distance 4 < cutoff 12 (cellRadius 6) → overlapping
    s.y[b] = 100;
    s.rebuildLive();
    const hash = new SpatialHash(W, H, 12, 4);
    hash.build(s);
    computeRepulsion(s, hash, 6, 2, W, H);
    expect(s.forceX[a]!).toBeLessThan(0); // a pushed left (away from b)
    expect(s.forceX[b]!).toBeGreaterThan(0); // b pushed right (away from a)
    expect(s.forceX[a]!).toBeCloseTo(-s.forceX[b]!); // Newton's 3rd
  });

  it('no force between organisms beyond the cutoff', () => {
    const s = new OrganismStore(4);
    const a = s.alloc();
    const b = s.alloc();
    s.x[a] = 100;
    s.y[a] = 100;
    s.x[b] = 200; // far apart
    s.y[b] = 200;
    s.rebuildLive();
    const hash = new SpatialHash(W, H, 12, 4);
    hash.build(s);
    computeRepulsion(s, hash, 6, 2, W, H);
    expect(s.forceX[a]!).toBe(0);
    expect(s.forceY[a]!).toBe(0);
  });
});
