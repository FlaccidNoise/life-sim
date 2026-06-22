import { describe, it, expect } from 'vitest';
import { FoodField } from './food-field';
import { FlowField } from './flow-field';
import { defaultConfig } from './config';

const W = 128;
const H = 128;
const COLS = 16;
const ROWS = 16;
const K = 10;

describe('FoodField', () => {
  it('logistic regrowth grows biomass toward the cap', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 0.5); // start at K/2
    const before = f.sampleAt(0, 0);
    f.step(0.1, 0, null, null);
    const after = f.sampleAt(0, 0);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThanOrEqual(K);
    // run to convergence
    for (let i = 0; i < 1000; i++) f.step(0.1, 0, null, null);
    expect(f.sampleAt(0, 0)).toBeCloseTo(K, 3);
  });

  it('regen=0 leaves biomass unchanged (food OFF)', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 0.7);
    const before = f.sampleAt(40, 40);
    f.step(0, 0, null, null);
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
    f.step(0, 0.1, null, null); // diffusion only
    expect(f.sampleAt(cx, cellW * 4 + cellW / 2)).toBeGreaterThan(0); // reseeded from neighbors
  });

  it('blocked cells hold no biomass and do not diffuse through walls', () => {
    const f = new FoodField(128, 128, 4, 4, 10, 1); // 4×4, full
    const blocked = new Uint8Array(16);
    blocked[1 * 4 + 1] = 1; // dam one interior cell
    const totalBefore = f.total();
    f.step(0.1, 0.2, null, blocked);
    // dammed cell drained to 0 (cell (1,1) is the world region [32,64)×[32,64))
    expect(f.sampleAt(1 * 32 + 16, 1 * 32 + 16)).toBe(0);
    // no biomass leaked INTO the wall: total dropped by the dammed cell's biomass (no-flux conserves the rest)
    expect(f.total()).toBeCloseTo(totalBefore - 10, 5);
  });

  it('reset refills to the initial biomass', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 1); // initFraction 1, uniform fertility
    f.grazeAt(0, 0, K);
    f.reset();
    expect(f.sampleAt(0, 0)).toBe(K);
  });

  it('single channel (default) ignores B2: sampleAt2/grazeAt2 are inert', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 1); // channels defaults to 1
    expect(f.sampleAt2(0, 0)).toBe(0); // no second channel
    expect(f.grazeAt2(0, 0, 5)).toBe(0); // grazing B2 does nothing
    expect(f.sampleAt(0, 0)).toBe(K); // channel A is the full cap (unchanged by the split)
  });

  it('two channels split the cap A/B and regrow/graze independently', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 1, 2, 0.5); // channels=2, symmetric split
    // Each channel starts at its share of the cap (initFraction 1): A=B=K/2.
    expect(f.sampleAt(0, 0)).toBeCloseTo(K / 2);
    expect(f.sampleAt2(0, 0)).toBeCloseTo(K / 2);
    // Grazing one channel leaves the other untouched.
    expect(f.grazeAt2(0, 0, 2)).toBe(2);
    expect(f.sampleAt2(0, 0)).toBeCloseTo(K / 2 - 2);
    expect(f.sampleAt(0, 0)).toBeCloseTo(K / 2); // channel A unaffected
    // Each channel regrows toward its OWN cap (K/2), not the global K.
    for (let i = 0; i < 1000; i++) f.step(0.1, 0, null, null);
    expect(f.sampleAt(0, 0)).toBeCloseTo(K / 2, 3);
    expect(f.sampleAt2(0, 0)).toBeCloseTo(K / 2, 3);
  });

  it('asymmetric ratio gives channel B a smaller share', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 1, 2, 0.25); // B gets 25%, A gets 75%
    expect(f.sampleAt(0, 0)).toBeCloseTo(0.75 * K);
    expect(f.sampleAt2(0, 0)).toBeCloseTo(0.25 * K);
  });

  it('advection conserves total biomass and respects walls', () => {
    const f = new FoodField(1024, 1024, 16, 16, 10, 1);
    const flow = new FlowField(
      1024,
      1024,
      16,
      16,
      defaultConfig({ flowStrength: 2, flowScale: 6, seed: 2 }),
    );
    const before = f.total();
    for (let t = 0; t < 50; t++) f.step(0, 0, flow, null); // pure advection (no regrow/diffuse)
    expect(f.total()).toBeCloseTo(before, 4); // mass conserved to floating-point precision
    // non-negative everywhere (CFL ≤ 0.25 keeps the donor-cell scheme positivity-preserving)
    for (let r = 0; r < 16; r++)
      for (let c = 0; c < 16; c++)
        expect(f.sampleAt(c * 64 + 32, r * 64 + 32)).toBeGreaterThanOrEqual(-1e-9);
  });

  it('advection is a no-op when flowStrength=0', () => {
    const f1 = new FoodField(1024, 1024, 16, 16, 10, 1);
    const f2 = new FoodField(1024, 1024, 16, 16, 10, 1);
    const flow = new FlowField(1024, 1024, 16, 16, defaultConfig({ flowStrength: 0 }));
    f1.step(0.05, 0.1, flow, null);
    f2.step(0.05, 0.1, null, null);
    for (let i = 0; i < 256; i++) {
      const x = (i % 16) * 64 + 32,
        y = Math.floor(i / 16) * 64 + 32;
      expect(f1.sampleAt(x, y)).toBe(f2.sampleAt(x, y)); // byte-identical when flow is zero
    }
  });

  it('seedPatches makes pockets rich and gaps near-dead', () => {
    const f = new FoodField(256, 256, 64, 64, K, 1);
    f.seedPatches(
      3,
      6,
      0.02,
      new (class {
        private s = 5;
        float(): number {
          this.s = (this.s * 1103515245 + 12345) & 0x7fffffff;
          return this.s / 0x7fffffff;
        }
      })(),
    );
    // some cell is rich (near K) and some cell is near-dead (≈ base·K)
    let maxB = 0;
    let minB = Infinity;
    for (let y = 4; y < 256; y += 8)
      for (let x = 4; x < 256; x += 8) {
        const b = f.sampleAt(x, y);
        if (b > maxB) maxB = b;
        if (b < minB) minB = b;
      }
    expect(maxB).toBeGreaterThan(0.5 * K); // a pocket
    expect(minB).toBeLessThan(0.1 * K); // dead water
  });
});
