import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { SpatialHash } from './spatial-hash';
import { computeRepulsion, integrate } from './physics';
import { ScalarGene, SCALAR_GENE_COUNT } from './genome';
import { Walls } from './walls';
import { defaultConfig } from './config';

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
    integrate(s, 1, 1, true, W, H, 6, 0, null);
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
    integrate(s, 1, 0.5, true, W, H, 6, 0, null);
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
    integrate(clamped, 1, 1, true, W, H, 6, 0, null);
    expect(Math.hypot(clamped.vx[0]!, clamped.vy[0]!)).toBeCloseTo(6); // clamped to its gene

    const faster = make(12);
    integrate(faster, 1, 1, true, W, H, 6, 0, null);
    expect(Math.hypot(faster.vx[0]!, faster.vy[0]!)).toBeCloseTo(12); // a faster gene → higher cap

    const unclamped = make(6);
    integrate(unclamped, 1, 1, false, W, H, 6, 0, null);
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
    integrate(s, 1, 1, true, W, H, refSize, 1, null); // exp 1 → ceiling × (refSize/size) = ×0.5
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
    integrate(s, 1, 1, true, W, H, 6, 0, null);
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
    integrate(s, 1, 1, true, W, H, 6, 0, null);
    expect(s.x[i]).toBeCloseTo(2); // wrapped past the right edge
    expect(s.y[i]).toBeCloseTo(H - 2); // wrapped past the top
  });

  it('a creature cannot move into a solid wall cell (slide-collision)', () => {
    const cfg = defaultConfig({
      worldWidth: 1024,
      worldHeight: 1024,
      wallCols: 64,
      wallRows: 64,
      foodCols: 16,
      foodRows: 16,
      foodPatchCount: 0,
      wallRegionCount: 1,
      wallDensity: 0.5,
      seed: 11,
    });
    const walls = new Walls(1024, 1024, 64, 64, cfg);
    const cellW = 1024 / 64;
    // Find an open fine cell whose right neighbour is solid; aim the creature at it.
    let oc = -1;
    let or = -1;
    for (let r = 0; r < 64 && oc < 0; r++)
      for (let c = 0; c < 63; c++) {
        const here = (c + 0.5) * cellW;
        const next = (c + 1.5) * cellW;
        const yy = (r + 0.5) * cellW;
        if (!walls.isSolidAt(here, yy) && walls.isSolidAt(next, yy)) {
          oc = c;
          or = r;
          break;
        }
      }
    expect(oc).toBeGreaterThanOrEqual(0); // density 0.5 guarantees such a pair exists

    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = (oc + 0.5) * cellW;
    s.y[i] = (or + 0.5) * cellW;
    s.vx[i] = cellW; // one full cell/tick toward the solid neighbour
    s.vy[i] = 0;
    setMaxSpeed(s, i, 1e9); // clamp inert so the move is unimpeded by the speed ceiling
    s.rebuildLive();
    integrate(s, 1, 1, true, 1024, 1024, 6, 0, walls);
    // Every live creature must end on an OPEN cell — the wall blocked the move.
    for (let k = 0; k < s.liveCount; k++) {
      const li = s.liveIndices[k]!;
      expect(walls.isSolidAt(s.x[li]!, s.y[li]!)).toBe(false);
    }
    expect(s.vx[i]).toBe(0); // blocked x-component zeroed
  });

  it('a fast creature cannot tunnel through a 1-cell wall (swept collision)', () => {
    const cfg = defaultConfig({
      worldWidth: 1024,
      worldHeight: 1024,
      wallCols: 64,
      wallRows: 64,
      foodCols: 16,
      foodRows: 16,
      foodPatchCount: 0,
      wallRegionCount: 1,
      wallDensity: 0.5,
      seed: 1,
    });
    const walls = new Walls(1024, 1024, 64, 64, cfg);
    const cellW = 1024 / 64;
    // Open cell whose right neighbour is solid and the cell beyond is open — a thin wall to tunnel.
    let oc = -1;
    let or = -1;
    for (let r = 0; r < 64 && oc < 0; r++)
      for (let c = 0; c < 62; c++) {
        const here = (c + 0.5) * cellW;
        const wall = (c + 1.5) * cellW;
        const beyond = (c + 2.5) * cellW;
        const yy = (r + 0.5) * cellW;
        if (
          !walls.isSolidAt(here, yy) &&
          walls.isSolidAt(wall, yy) &&
          !walls.isSolidAt(beyond, yy)
        ) {
          oc = c;
          or = r;
          break;
        }
      }
    expect(oc).toBeGreaterThanOrEqual(0);

    const s = new OrganismStore(4);
    const i = s.alloc();
    const startX = (oc + 0.5) * cellW;
    s.x[i] = startX;
    s.y[i] = (or + 0.5) * cellW;
    s.vx[i] = 3 * cellW; // ≥ 2·cellW — a single-cell final-cell check would tunnel clean through
    s.vy[i] = 0;
    setMaxSpeed(s, i, 1e9); // clamp inert
    s.rebuildLive();
    integrate(s, 1, 1, true, 1024, 1024, 6, 0, walls);
    expect(walls.isSolidAt(s.x[i], s.y[i])).toBe(false); // not inside the wall
    expect(s.x[i]).toBeLessThan((oc + 1.5) * cellW); // stayed on the near side (did not pass through)
    expect(s.vx[i]).toBe(0); // blocked x-component zeroed
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
