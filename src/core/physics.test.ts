import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { computeRepulsion, integrate } from './physics';
import { ScalarGene, SCALAR_GENE_COUNT } from './genome';

const W = 512;
const H = 512;

/** Set a creature's per-creature maxSpeed gene (integrate reads this for the stability clamp). */
function setMaxSpeed(s: OrganismStore, slot: number, v: number): void {
  s.scalarGenes[slot * SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED] = v;
}

describe('integrate', () => {
  it('symplectic-Euler with no force or damping just advances by velocity', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 100;
    s.y[i] = 100;
    s.vx[i] = 2;
    s.vy[i] = -3;
    setMaxSpeed(s, i, 1e9); // ceiling far above → clamp inert
    s.rebuildLive();
    integrate(s, 1, 1, true, W, H, 6, 0);
    expect(s.x[i]).toBeCloseTo(102);
    expect(s.y[i]).toBeCloseTo(97);
  });

  it('damping multiplies velocity each tick', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.vx[i] = 10;
    s.vy[i] = 0;
    setMaxSpeed(s, i, 1e9);
    s.rebuildLive();
    integrate(s, 1, 0.5, true, W, H, 6, 0);
    expect(s.vx[i]).toBeCloseTo(5);
  });

  it('stability clamp caps speed at the per-creature maxSpeed gene; OFF lets it through', () => {
    const make = (gene: number): OrganismStore => {
      const s = new OrganismStore(4);
      const i = s.alloc();
      s.vx[i] = 100;
      s.vy[i] = 0;
      setMaxSpeed(s, i, gene);
      s.rebuildLive();
      return s;
    };
    const clamped = make(6);
    integrate(clamped, 1, 1, true, W, H, 6, 0);
    expect(Math.hypot(clamped.vx[0]!, clamped.vy[0]!)).toBeCloseTo(6); // clamped to its gene

    const faster = make(12);
    integrate(faster, 1, 1, true, W, H, 6, 0);
    expect(Math.hypot(faster.vx[0]!, faster.vy[0]!)).toBeCloseTo(12); // a faster gene → higher cap

    const unclamped = make(6);
    integrate(unclamped, 1, 1, false, W, H, 6, 0);
    expect(Math.hypot(unclamped.vx[0]!, unclamped.vy[0]!)).toBeCloseTo(100); // clamp off → through
  });

  it('size taxes the speed ceiling: a 2×-size body is clamped to (1/2)^exp of its gene', () => {
    const refSize = 6;
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.vx[i] = 100;
    s.vy[i] = 0;
    setMaxSpeed(s, i, 10); // gene ceiling 10
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE] = 2 * refSize; // twice the reference size
    s.rebuildLive();
    integrate(s, 1, 1, true, W, H, refSize, 1); // exp 1 → ceiling × (refSize/size) = ×0.5
    expect(Math.hypot(s.vx[0]!, s.vy[0]!)).toBeCloseTo(5); // 10 × 0.5
  });

  it('sizeSpeedExp 0 leaves the ceiling untaxed regardless of size', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.vx[i] = 100;
    s.vy[i] = 0;
    setMaxSpeed(s, i, 8);
    s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.SIZE] = 30; // huge, but coupling off
    s.rebuildLive();
    integrate(s, 1, 1, true, W, H, 6, 0);
    expect(Math.hypot(s.vx[0]!, s.vy[0]!)).toBeCloseTo(8); // unaffected
  });

  it('wraps position toroidally', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = W - 1;
    s.y[i] = 1;
    s.vx[i] = 3;
    s.vy[i] = -3;
    setMaxSpeed(s, i, 1e9);
    s.rebuildLive();
    integrate(s, 1, 1, true, W, H, 6, 0);
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
