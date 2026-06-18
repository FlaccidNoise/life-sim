import { describe, it, expect } from 'vitest';
import { CurrentField } from '../environment/current-field';
import { Rng } from '../math/rng';
import { applyCurrent } from './current-force';

/** Minimal CellArrays stub for force-only tests. */
function makeCellArrays(n: number) {
  return {
    posX: new Float64Array(n),
    posY: new Float64Array(n),
    velX: new Float32Array(n),
    velY: new Float32Array(n),
    forceX: new Float32Array(n),
    forceY: new Float32Array(n),
    radius: new Float32Array(n),
    mass: new Float32Array(n),
    energy: new Float32Array(n),
    cellType: new Uint8Array(n),
    organismId: new Uint32Array(n),
    genomeRef: new Uint32Array(n),
    brainRef: new Uint32Array(n),
    age: new Uint32Array(n),
    heading: new Float32Array(n),
    senseX: new Float32Array(n),
    senseY: new Float32Array(n),
    thrust: new Float32Array(n),
    flags: new Uint8Array(n),
    generation: new Uint32Array(n),
    localDensity: new Uint16Array(n),
    latchPrey: new Uint32Array(n),
    latchCell: new Uint32Array(n),
  };
}

describe('applyCurrent', () => {
  it('adds current force in the direction of the sampled vector', () => {
    const cf = new CurrentField(8, 8, 800, 800);
    cf.init(new Rng(9), 6, 3, 1);
    const f = makeCellArrays(2);
    f.posX[0] = 400;
    f.posY[0] = 400;
    f.posX[1] = 200;
    f.posY[1] = 200;
    f.forceX[0] = 0;
    f.forceY[0] = 0;
    f.forceX[1] = 0;
    f.forceY[1] = 0;
    const live = new Uint32Array([0, 1]);

    applyCurrent(cf, f, live, 2, 1);

    cf.sample(400, 400);
    expect(f.forceX[0]).toBe(cf.currentVx);
    expect(f.forceY[0]).toBe(cf.currentVy);

    cf.sample(200, 200);
    expect(f.forceX[1]).toBe(cf.currentVx);
    expect(f.forceY[1]).toBe(cf.currentVy);
  });

  it('zero strength produces zero force addition', () => {
    const cf = new CurrentField(8, 8, 800, 800);
    cf.init(new Rng(9), 6, 3, 1);
    const f = makeCellArrays(1);
    f.posX[0] = 400;
    f.posY[0] = 400;
    f.forceX[0] = 5; // pre-existing force
    f.forceY[0] = -3;
    const live = new Uint32Array([0]);

    applyCurrent(cf, f, live, 1, 0);

    expect(f.forceX[0]).toBe(5);
    expect(f.forceY[0]).toBe(-3);
  });

  it('toroidal sampling near edges works', () => {
    const cf = new CurrentField(8, 8, 800, 800);
    cf.init(new Rng(10), 6, 3, 1);
    const f = makeCellArrays(4);
    f.posX[0] = 5;
    f.posY[0] = 5; // near origin
    f.posX[1] = 795;
    f.posY[1] = 5; // near right edge
    f.posX[2] = 5;
    f.posY[2] = 795; // near bottom edge
    f.posX[3] = 795;
    f.posY[3] = 795; // near corner
    f.forceX.fill(0);
    f.forceY.fill(0);
    const live = new Uint32Array([0, 1, 2, 3]);

    applyCurrent(cf, f, live, 4, 1);

    for (let k = 0; k < 4; k++) {
      expect(Number.isNaN(f.forceX[k])).toBe(false);
      expect(Number.isNaN(f.forceY[k])).toBe(false);
      expect(Math.abs(f.forceX[k]!)).toBeLessThanOrEqual(1 + 1e-6);
      expect(Math.abs(f.forceY[k]!)).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('accumulates onto pre-existing forces', () => {
    const cf = new CurrentField(8, 8, 800, 800);
    cf.init(new Rng(11), 6, 3, 0.5);
    const f = makeCellArrays(1);
    f.posX[0] = 400;
    f.posY[0] = 400;
    f.forceX[0] = 10;
    f.forceY[0] = 20;
    const live = new Uint32Array([0]);

    cf.sample(400, 400);
    const expectedVx = cf.currentVx;
    const expectedVy = cf.currentVy;

    applyCurrent(cf, f, live, 1, 1);

    // Float32Array round-trips via force array — use closeTo for single-ULP tolerance
    expect(f.forceX[0]).toBeCloseTo(10 + expectedVx, 5);
    expect(f.forceY[0]).toBeCloseTo(20 + expectedVy, 5);
  });
});
