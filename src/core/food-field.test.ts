import { describe, it, expect } from 'vitest';
import { FoodField } from './food-field';

const W = 128;
const H = 128;
const COLS = 16;
const ROWS = 16;
const K = 10;

describe('FoodField', () => {
  it('logistic regrowth grows biomass toward the cap', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 0.5); // start at K/2
    const before = f.sampleAt(0, 0);
    f.step(0.1, 0);
    const after = f.sampleAt(0, 0);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(K);
    // run to convergence
    for (let i = 0; i < 1000; i++) f.step(0.1, 0);
    expect(f.sampleAt(0, 0)).toBeCloseTo(K, 3);
  });

  it('regen=0 leaves biomass unchanged (food OFF)', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 0.7);
    const before = f.sampleAt(40, 40);
    f.step(0, 0);
    expect(f.sampleAt(40, 40)).toBe(before);
  });

  it('grazeAt removes up to the requested amount and returns what was taken', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 1); // full
    expect(f.grazeAt(0, 0, 3)).toBe(3); // plenty available
    expect(f.sampleAt(0, 0)).toBeCloseTo(K - 3);
    // graze more than remains → capped at the remainder
    const taken = f.grazeAt(0, 0, 100);
    expect(taken).toBeCloseTo(K - 3);
    expect(f.sampleAt(0, 0)).toBe(0);
  });

  it('diffusion reseeds a grazed-empty cell from its neighbors (no B=0 absorbing state)', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 1); // all cells full
    const cellW = W / COLS;
    const cx = cellW * 4 + cellW / 2; // a cell well inside the grid
    f.grazeAt(cx, cellW * 4 + cellW / 2, K); // empty it
    expect(f.sampleAt(cx, cellW * 4 + cellW / 2)).toBe(0);
    f.step(0, 0.1); // diffusion only
    expect(f.sampleAt(cx, cellW * 4 + cellW / 2)).toBeGreaterThan(0); // reseeded from neighbors
  });

  it('reset refills to the initial fraction', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 1);
    f.grazeAt(0, 0, K);
    f.reset(1);
    expect(f.sampleAt(0, 0)).toBe(K);
  });
});
