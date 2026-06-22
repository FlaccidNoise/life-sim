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
    for (let i = 0; i < 1000; i++) f.step(0.1, 0);
    expect(f.sampleAt(0, 0)).toBeCloseTo(K / 2, 3);
    expect(f.sampleAt2(0, 0)).toBeCloseTo(K / 2, 3);
  });

  it('asymmetric ratio gives channel B a smaller share', () => {
    const f = new FoodField(W, H, COLS, ROWS, K, 1, 2, 0.25); // B gets 25%, A gets 75%
    expect(f.sampleAt(0, 0)).toBeCloseTo(0.75 * K);
    expect(f.sampleAt2(0, 0)).toBeCloseTo(0.25 * K);
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

/** A deterministic LCG stub (mirrors the seedPatches test) — same seed → same pocket layout. */
class StubRng {
  private s: number;
  constructor(seed = 5) {
    this.s = seed;
  }
  float(): number {
    this.s = (this.s * 1103515245 + 12345) & 0x7fffffff;
    return this.s / 0x7fffffff;
  }
}
/** Like StubRng but counts float() calls — to assert the per-pocket RNG-draw gate. */
class CountingRng extends StubRng {
  calls = 0;
  override float(): number {
    this.calls++;
    return super.float();
  }
}

describe('FoodField per-pocket richness (SP1)', () => {
  it('defaults (richness 1, var 0, maxFertility 1) are byte-identical to legacy seedPatches', () => {
    const legacy = new FoodField(256, 256, 64, 64, K, 1);
    legacy.seedPatches(3, 6, 0.02, new StubRng(7)); // legacy 4-arg call
    const explicit = new FoodField(256, 256, 64, 64, K, 1);
    explicit.seedPatches(3, 6, 0.02, new StubRng(7), 1, 0, 1); // explicit legacy values
    for (let y = 2; y < 256; y += 11)
      for (let x = 2; x < 256; x += 11) expect(explicit.sampleAt(x, y)).toBe(legacy.sampleAt(x, y));
  });

  it('draws NO extra RNG when var=0 (2/pocket), one extra when var>0 (3/pocket) — the ablation gate', () => {
    const off = new CountingRng();
    new FoodField(256, 256, 64, 64, K, 1).seedPatches(5, 4, 0, off, 1, 0, 1);
    expect(off.calls).toBe(5 * 2); // x,y centre draws only

    const on = new CountingRng();
    new FoodField(256, 256, 64, 64, K, 1).seedPatches(5, 4, 0, on, 1.5, 0.3, 2);
    expect(on.calls).toBe(5 * 3); // x,y + one peak draw per pocket
  });

  it('records a world-space centre per pocket (for diagnostics)', () => {
    const f = new FoodField(256, 256, 64, 64, K, 1);
    f.seedPatches(4, 5, 0, new StubRng(3), 1, 0, 1);
    expect(f.patchCenters).toHaveLength(4);
    for (const c of f.patchCenters) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(256);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(256);
    }
    // re-seeding replaces (does not append) the centres
    f.seedPatches(2, 5, 0, new StubRng(3), 1, 0, 1);
    expect(f.patchCenters).toHaveLength(2);
  });

  it('richness>1 with maxFertility>1 deepens a pocket past K=cap (a deep reservoir)', () => {
    const base = new FoodField(256, 256, 64, 64, K, 1);
    base.seedPatches(1, 6, 0, new StubRng(3), 1, 0, 1);
    const deep = new FoodField(256, 256, 64, 64, K, 1);
    deep.seedPatches(1, 6, 0, new StubRng(3), 2.5, 0, 3); // same seed → same centre, deeper peak
    const c = deep.patchCenters[0]!;
    expect(base.sampleAt(c.x, c.y)).toBeLessThanOrEqual(K + 1e-9); // legacy: K never exceeds cap
    expect(deep.sampleAt(c.x, c.y)).toBeGreaterThan(K); // reservoir exceeds K=cap
  });

  it('maxFertility clamps: richness>1 with maxFertility=1 cannot exceed K=cap', () => {
    const f = new FoodField(256, 256, 64, 64, K, 1);
    f.seedPatches(1, 6, 0, new StubRng(3), 3, 0, 1); // rich peak but legacy clamp
    const c = f.patchCenters[0]!;
    expect(f.sampleAt(c.x, c.y)).toBeLessThanOrEqual(K + 1e-9);
  });

  it('var=0 → uniform pocket depth; var>0 → varied (predator-haven vs grazer-refuge)', () => {
    const uniform = new FoodField(512, 512, 128, 128, K, 1);
    uniform.seedPatches(6, 4, 0, new StubRng(11), 2, 0, 4);
    const uDepths = uniform.patchCenters.map((c) => uniform.sampleAt(c.x, c.y));
    const uSpread = Math.max(...uDepths) - Math.min(...uDepths);

    const varied = new FoodField(512, 512, 128, 128, K, 1);
    varied.seedPatches(6, 4, 0, new StubRng(11), 2, 0.6, 4); // same seed/centres, varied depth
    const vDepths = varied.patchCenters.map((c) => varied.sampleAt(c.x, c.y));
    const vSpread = Math.max(...vDepths) - Math.min(...vDepths);

    expect(vSpread).toBeGreaterThan(uSpread * 2); // variation creates real depth spread
  });
});
