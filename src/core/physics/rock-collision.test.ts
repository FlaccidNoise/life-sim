import { describe, it, expect } from 'vitest';
import { RockField } from '../environment/rock-field';
import { applyRockCollision } from './rock-collision';
import { type CellArrays } from '../memory/cell-store';

/** Build a minimal CellArrays with just the fields used by rock collision. */
function cell(n: number, pos: [number, number][], radius?: number[]): CellArrays {
  const posX = new Float64Array(n);
  const posY = new Float64Array(n);
  const r = new Float32Array(n);
  pos.forEach(([x, y], i) => {
    posX[i] = x;
    posY[i] = y;
    r[i] = radius ? radius[i]! : 5;
  });
  return {
    posX,
    posY,
    radius: r,
    forceX: new Float32Array(n),
    forceY: new Float32Array(n),
  } as CellArrays;
}

function makeLive(n: number): Uint32Array {
  const live = new Uint32Array(n);
  for (let i = 0; i < n; i++) live[i] = i;
  return live;
}

describe('applyRockCollision', () => {
  it('pushes a cell out of an overlapping rock', () => {
    // Place one rock at (50, 50) with radius 20
    const rf = new RockField(2, 6, 6, 400, 400);
    rf.cx[0] = 50;
    rf.cy[0] = 50;
    rf.radius[0] = 20;
    rf.rockCount = 1;
    rf.buildGrid();

    // Cell at (65, 50), radius 5 — overlaps rock (dist=15 < 25)
    const f = cell(1, [[65, 50]], [5]);
    const live = makeLive(1);

    applyRockCollision(rf, f, live, 1, 1, 400, 400);

    // Force should push cell away from rock center (rightward, positive x)
    expect(f.forceX[0]).toBeGreaterThan(0);
    // y force should be ~0 (aligned horizontally)
    expect(Math.abs(f.forceY[0]!)).toBeLessThan(1e-6);
  });

  it('applies no force when cell is clear of all rocks', () => {
    const rf = new RockField(2, 6, 6, 400, 400);
    rf.cx[0] = 10;
    rf.cy[0] = 10;
    rf.radius[0] = 5;
    rf.rockCount = 1;
    rf.buildGrid();

    // Cell far from rock
    const f = cell(1, [[300, 300]]);
    const live = makeLive(1);

    applyRockCollision(rf, f, live, 1, 1, 400, 400);

    expect(f.forceX[0]).toBe(0);
    expect(f.forceY[0]).toBe(0);
  });

  it('applies no force when no rocks exist', () => {
    const rf = new RockField(1, 6, 6, 400, 400);
    rf.rockCount = 0;
    rf.buildGrid();

    const f = cell(1, [[50, 50]]);
    const live = makeLive(1);

    applyRockCollision(rf, f, live, 1, 1, 400, 400);

    expect(f.forceX[0]).toBe(0);
    expect(f.forceY[0]).toBe(0);
  });

  it('force magnitude scales with repulsion stiffness', () => {
    const rf = new RockField(2, 6, 6, 400, 400);
    rf.cx[0] = 50;
    rf.cy[0] = 50;
    rf.radius[0] = 10;
    rf.rockCount = 1;
    rf.buildGrid();

    // Same cell position, different stiffness
    const f1 = cell(1, [[57, 50]], [5]);
    applyRockCollision(rf, f1, makeLive(1), 1, 1, 400, 400);

    const f2 = cell(1, [[57, 50]], [5]);
    applyRockCollision(rf, f2, makeLive(1), 1, 3, 400, 400);

    // f2 should be 3x f1
    expect(f2.forceX[0]).toBeCloseTo(f1.forceX[0]! * 3, 5);
  });

  it('handles toroidal wrap: rock near left edge pushes cell on the right edge', () => {
    const W = 400;
    const H = 400;
    const rf = new RockField(2, 6, 6, W, H);
    // Rock near left edge
    rf.cx[0] = 5;
    rf.cy[0] = 200;
    rf.radius[0] = 15;
    rf.rockCount = 1;
    rf.buildGrid();

    // Cell near right edge — toroidally close to the rock (distance ≈ 10)
    const f = cell(1, [[395, 200]], [5]);
    const live = makeLive(1);

    applyRockCollision(rf, f, live, 1, 1, W, H);

    // Overlap: cell radius 5 + rock radius 15 = 20.
    // Toroidal distance: |395 - 5| = 390 > 200, so wrapped = 390 - 400 = -10 → |10|.
    // dist=10 < 20, so overlap.
    // Force should push cell leftward (away from rock → negative x)
    expect(f.forceX[0]).toBeLessThan(0);
    expect(Math.abs(f.forceY[0]!)).toBeLessThan(1e-6);
  });

  it('accumulates on top of existing forces', () => {
    const rf = new RockField(2, 6, 6, 400, 400);
    rf.cx[0] = 50;
    rf.cy[0] = 50;
    rf.radius[0] = 10;
    rf.rockCount = 1;
    rf.buildGrid();

    const f = cell(1, [[57, 50]], [5]);
    f.forceX[0] = 100;
    f.forceY[0] = -50;
    const live = makeLive(1);

    applyRockCollision(rf, f, live, 1, 1, 400, 400);

    // Existing forces should be preserved + rock repulsion added
    expect(f.forceX[0]).toBeGreaterThan(100);
    expect(f.forceY[0]).toBe(-50); // no y component from this rock
  });
});