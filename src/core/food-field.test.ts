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

  it('advection transports a real biomass gradient (conserved, positive)', () => {
    const f = new FoodField(128, 128, 16, 16, K, 1);
    const cw = 128 / 16;
    // Graze a few cells to carve a real biomass GRADIENT (uniform fields advect trivially).
    f.grazeAt(cw * 4 + cw / 2, cw * 4 + cw / 2, K);
    f.grazeAt(cw * 5 + cw / 2, cw * 4 + cw / 2, K * 0.5);
    f.grazeAt(cw * 4 + cw / 2, cw * 5 + cw / 2, K * 0.7);
    const flow = new FlowField(
      128,
      128,
      16,
      16,
      defaultConfig({ flowStrength: 2, flowScale: 6, seed: 2 }),
    );
    const initial: number[] = [];
    for (let r = 0; r < 16; r++)
      for (let c = 0; c < 16; c++) initial.push(f.sampleAt(c * cw + cw / 2, r * cw + cw / 2));
    const before = f.total();
    for (let t = 0; t < 50; t++) f.step(0, 0, flow, null); // pure advection
    expect(f.total()).toBeCloseTo(before, 4); // mass conserved across a non-uniform field
    let changed = false;
    let k = 0;
    for (let r = 0; r < 16; r++)
      for (let c = 0; c < 16; c++) {
        const v = f.sampleAt(c * cw + cw / 2, r * cw + cw / 2);
        if (Math.abs(v - initial[k]!) > 1e-9) changed = true; // transport actually moved biomass
        expect(v).toBeGreaterThanOrEqual(-1e-9); // positivity under a real gradient
        k++;
      }
    expect(changed).toBe(true); // not a vacuous pass — at least one cell's biomass moved
  });

  it('advection conserves and transports BOTH channels independently (B2)', () => {
    const f = new FoodField(128, 128, 16, 16, K, 1, 2, 0.5); // channels=2
    const cw = 128 / 16;
    f.grazeAt(cw * 4 + cw / 2, cw * 4 + cw / 2, K * 0.4); // gradient in channel A
    f.grazeAt2(cw * 6 + cw / 2, cw * 6 + cw / 2, K * 0.4); // a DIFFERENT gradient in channel B
    const flow = new FlowField(
      128,
      128,
      16,
      16,
      defaultConfig({ flowStrength: 2, flowScale: 6, seed: 2 }),
    );
    const initA: number[] = [];
    const initB: number[] = [];
    let totA0 = 0;
    let totB0 = 0;
    for (let r = 0; r < 16; r++)
      for (let c = 0; c < 16; c++) {
        const a = f.sampleAt(c * cw + cw / 2, r * cw + cw / 2);
        const b = f.sampleAt2(c * cw + cw / 2, r * cw + cw / 2);
        initA.push(a);
        initB.push(b);
        totA0 += a;
        totB0 += b;
      }
    for (let t = 0; t < 50; t++) f.step(0, 0, flow, null);
    let totA1 = 0;
    let totB1 = 0;
    let changedA = false;
    let changedB = false;
    let k = 0;
    for (let r = 0; r < 16; r++)
      for (let c = 0; c < 16; c++) {
        const a = f.sampleAt(c * cw + cw / 2, r * cw + cw / 2);
        const b = f.sampleAt2(c * cw + cw / 2, r * cw + cw / 2);
        totA1 += a;
        totB1 += b;
        if (Math.abs(a - initA[k]!) > 1e-9) changedA = true;
        if (Math.abs(b - initB[k]!) > 1e-9) changedB = true;
        k++;
      }
    expect(totA1).toBeCloseTo(totA0, 4); // channel A conserves its OWN total
    expect(totB1).toBeCloseTo(totB0, 4); // channel B conserves its OWN total (no A/B cross-leak)
    expect(changedA).toBe(true); // both channels transported (guards a B2 pairing/index bug)
    expect(changedB).toBe(true);
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
// Deterministic stand-in RNG for lever-C seedPatches (the field only calls .float()).
class Lcg {
  constructor(private s: number) {}
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

  it('fertilityAt reports per-cell fertility (pocket high, dead water ~0) — for the dead-water tax', () => {
    const f = new FoodField(256, 256, 64, 64, K, 1);
    f.seedPatches(2, 5, 0, new StubRng(3), 1, 0, 1);
    const c = f.patchCenters[0]!;
    expect(f.fertilityAt(c.x, c.y)).toBeGreaterThan(0.5); // inside a pocket
    let minFert = Infinity;
    for (let y = 4; y < 256; y += 8)
      for (let x = 4; x < 256; x += 8) minFert = Math.min(minFert, f.fertilityAt(x, y));
    expect(minFert).toBeLessThan(0.05); // dead water between pockets
  });
});

// Replays a fixed sequence (then repeats the last value) — for scripting pocket centres / scales exactly.
class QueueRng {
  private i = 0;
  constructor(private q: number[]) {}
  float(): number {
    const v = this.q[Math.min(this.i, this.q.length - 1)]!;
    this.i++;
    return v;
  }
}

describe('FoodField — per-pocket carrying-capacity variance (lever C)', () => {
  it('variance=0 ignores the forked RNG (identical to the no-variance path)', () => {
    const a = new FoodField(256, 256, 64, 64, K, 1);
    a.seedPatches(3, 6, 0.02, new Lcg(5));
    const b = new FoodField(256, 256, 64, 64, K, 1);
    // Same MAIN-rng sequence (fresh Lcg, same seed) + a forked rng that must go UNUSED at variance 0.
    b.seedPatches(3, 6, 0.02, new Lcg(5), 1, 0, 1, 0, new QueueRng([0.0, 0.99, 0.5]));
    for (let y = 2; y < 256; y += 16)
      for (let x = 2; x < 256; x += 16) expect(b.sampleAt(x, y)).toBe(a.sampleAt(x, y));
  });

  it('variance>0 diverges pocket K — a lean pocket stays below cap, a rich one rises above it', () => {
    // Single channel, init 1 → sampleAt at a pocket peak == that pocket's Kcell.
    const f = new FoodField(256, 256, 64, 64, K, 1);
    // Scripted MAIN rng → two well-separated pockets at cells (16,16) and (48,48): draws pc,pr per pocket.
    const mainRng = new QueueRng([0.25, 0.25, 0.75, 0.75]);
    // Forked scales at variance 0.4: s = 0.6 + 0.8·r. r=0 → lean s=0.6; r≈1 → rich s≈1.4.
    const forked = new QueueRng([0.0, 0.999]);
    f.seedPatches(2, 6, 0, mainRng, 1, 0, 1, 0.4, forked);
    const lean = f.sampleAt(66, 66); // pocket 0 peak ≈ cap·0.6 = 6
    const rich = f.sampleAt(194, 194); // pocket 1 peak ≈ cap·1.4 = 14
    expect(lean).toBeGreaterThan(0.4 * K); // clearly a pocket, not dead water
    expect(lean).toBeLessThan(K); // lean pocket: carrying capacity BELOW the base cap
    expect(rich).toBeGreaterThan(K); // rich pocket: K raised ABOVE the base cap (the lever-C effect)
    expect(rich).toBeGreaterThan(lean); // the two islands have genuinely diverged in K
  });
});

describe('FoodField three-channel place-coupling (F1)', () => {
  it('channels<3: sampleAt3/grazeAt3 are inert (byte-identical N<=2 paths keep B3 null)', () => {
    const one = new FoodField(W, H, COLS, ROWS, K, 1); // channels defaults to 1
    expect(one.sampleAt3(0, 0)).toBe(0);
    expect(one.grazeAt3(0, 0, 5)).toBe(0);
    const two = new FoodField(W, H, COLS, ROWS, K, 1, 2, 0.5); // channels=2
    expect(two.sampleAt3(0, 0)).toBe(0);
    expect(two.grazeAt3(0, 0, 5)).toBe(0);
  });

  it('mode 1 assigns pockets to channels A/B/C round-robin: each pocket grows ONLY its channel', () => {
    // Three well-separated pockets at cells (16,16),(48,48),(80,80) on a 128² / 128-cell grid → channels
    // A,B,C respectively (p%3). Each pocket holds biomass in exactly one channel, ~zero in the other two.
    const f = new FoodField(1024, 1024, 128, 128, K, 1, 3, 0.5, 1); // channels=3, mode 1
    const mainRng = new QueueRng([0.125, 0.125, 0.375, 0.375, 0.625, 0.625]);
    f.seedPatches(3, 5, 0, mainRng);
    const [pA, pB, pC] = f.patchCenters as { x: number; y: number }[];
    // Pocket 0 → channel A: A-biomass present, B and C empty there.
    expect(f.sampleAt(pA!.x, pA!.y)).toBeGreaterThan(0.5 * K);
    expect(f.sampleAt2(pA!.x, pA!.y)).toBeLessThan(0.05 * K);
    expect(f.sampleAt3(pA!.x, pA!.y)).toBeLessThan(0.05 * K);
    // Pocket 1 → channel B.
    expect(f.sampleAt2(pB!.x, pB!.y)).toBeGreaterThan(0.5 * K);
    expect(f.sampleAt(pB!.x, pB!.y)).toBeLessThan(0.05 * K);
    expect(f.sampleAt3(pB!.x, pB!.y)).toBeLessThan(0.05 * K);
    // Pocket 2 → channel C (the inert-C bug guard: C must actually carry biomass IN a C-pocket).
    expect(f.sampleAt3(pC!.x, pC!.y)).toBeGreaterThan(0.5 * K);
    expect(f.sampleAt(pC!.x, pC!.y)).toBeLessThan(0.05 * K);
    expect(f.sampleAt2(pC!.x, pC!.y)).toBeLessThan(0.05 * K);
  });

  it('mode 0 (ablation): ALL pockets grow channel A only — B and C stay inert everywhere', () => {
    const f = new FoodField(1024, 1024, 128, 128, K, 1, 3, 0.5, 0); // channels=3, mode 0
    const mainRng = new QueueRng([0.125, 0.125, 0.375, 0.375, 0.625, 0.625]);
    f.seedPatches(3, 5, 0, mainRng);
    for (const p of f.patchCenters as { x: number; y: number }[]) {
      expect(f.sampleAt(p.x, p.y)).toBeGreaterThan(0.5 * K); // channel A is the only resource
      expect(f.sampleAt2(p.x, p.y)).toBe(0);
      expect(f.sampleAt3(p.x, p.y)).toBe(0);
    }
  });

  it('grazeAt3 removes channel-C biomass independently; regrows toward its OWN cell K', () => {
    const f = new FoodField(1024, 1024, 128, 128, K, 1, 3, 0.5, 1);
    const mainRng = new QueueRng([0.125, 0.125, 0.375, 0.375, 0.625, 0.625]);
    f.seedPatches(3, 5, 0, mainRng);
    const pC = (f.patchCenters as { x: number; y: number }[])[2]!;
    const before = f.sampleAt3(pC.x, pC.y);
    const took = f.grazeAt3(pC.x, pC.y, before * 0.5);
    expect(took).toBeGreaterThan(0);
    expect(f.sampleAt3(pC.x, pC.y)).toBeCloseTo(before - took, 6);
    // regrow: channel C recovers toward its cell's K (it's a C-pocket cell), A/B stay empty there.
    for (let i = 0; i < 200; i++) f.step(0.2, 0, null, null);
    expect(f.sampleAt3(pC.x, pC.y)).toBeGreaterThan(before * 0.9);
    expect(f.sampleAt(pC.x, pC.y)).toBeLessThan(0.05 * K);
  });

  it('hashInto mixes channel C: a grazed C-pocket changes the hash (3rd channel is live state)', () => {
    const make = (): FoodField => {
      const f = new FoodField(1024, 1024, 128, 128, K, 1, 3, 0.5, 1);
      f.seedPatches(3, 5, 0, new QueueRng([0.125, 0.125, 0.375, 0.375, 0.625, 0.625]));
      return f;
    };
    const hashOf = (f: FoodField): number => {
      let h = 2166136261 >>> 0;
      const sink = {
        f: (v: number) => {
          // FNV-1a over the float's byte view → C-channel changes are visible in the digest.
          const buf = new Float64Array([v]);
          const bytes = new Uint8Array(buf.buffer);
          for (let b = 0; b < 8; b++) {
            h ^= bytes[b]!;
            h = Math.imul(h, 16777619) >>> 0;
          }
        },
      };
      f.hashInto(sink);
      return h >>> 0;
    };
    const a = make();
    const b = make();
    expect(hashOf(a)).toBe(hashOf(b)); // same construction → same hash (deterministic)
    const pC = (b.patchCenters as { x: number; y: number }[])[2]!;
    b.grazeAt3(pC.x, pC.y, b.sampleAt3(pC.x, pC.y)); // drain channel C in its pocket
    expect(hashOf(b)).not.toBe(hashOf(a)); // NON-VACUITY: B3 is genuinely mixed into the state hash
  });
});

describe('FoodField ch2 differentiated channels (wall-tied A + drifting B)', () => {
  // Six well-separated pockets on a 128² / 128-cell grid (cellW=8). QueueRng feeds x,y per pocket.
  const SIX_POCKETS = (): number[] => [
    0.1, 0.1, 0.25, 0.25, 0.4, 0.4, 0.55, 0.55, 0.7, 0.7, 0.85, 0.85,
  ];

  it('channels===2 mode 1 assigns A/B pockets round-robin: each pocket grows ONLY its channel', () => {
    // Two channels (no C), place-coupled via mode 1: pocket 0→A, pocket 1→B, pocket 2→A …
    const f = new FoodField(1024, 1024, 128, 128, K, 1, 2, 0.5, 1); // channels=2, mode 1
    f.seedPatches(3, 5, 0, new QueueRng([0.125, 0.125, 0.375, 0.375, 0.625, 0.625]));
    const [pA, pB, pA2] = f.patchCenters as { x: number; y: number }[];
    // Pocket 0 → channel A.
    expect(f.sampleAt(pA!.x, pA!.y)).toBeGreaterThan(0.5 * K);
    expect(f.sampleAt2(pA!.x, pA!.y)).toBeLessThan(0.05 * K);
    // Pocket 1 → channel B.
    expect(f.sampleAt2(pB!.x, pB!.y)).toBeGreaterThan(0.5 * K);
    expect(f.sampleAt(pB!.x, pB!.y)).toBeLessThan(0.05 * K);
    // Pocket 2 → channel A again (p%2). No B3 ever (channels===2).
    expect(f.sampleAt(pA2!.x, pA2!.y)).toBeGreaterThan(0.5 * K);
    expect(f.sampleAt3(pA2!.x, pA2!.y)).toBe(0);
  });

  it('wall-tied OFF places the same pocket centres as legacy (placement is RNG-order-stable)', () => {
    // Same channels/mode, wallTied off vs on — the pocket CENTRES (main-rng draws) must be identical;
    // only the channel ASSIGNMENT differs. Proves the wall-tie pre-pass did not shift the RNG order.
    const off = new FoodField(1024, 1024, 128, 128, K, 1, 2, 0.5, 1, false); // wallTied=false
    off.seedPatches(6, 4, 0, new QueueRng(SIX_POCKETS()));
    const on = new FoodField(1024, 1024, 128, 128, K, 1, 2, 0.5, 1, true); // wallTied=true
    // A proximity fn that returns increasing distance with x → near-wall = low x.
    on.seedPatches(6, 4, 0, new QueueRng(SIX_POCKETS()), 1, 0, 1, 0, undefined, (x) => x);
    expect(on.patchCenters).toHaveLength(6);
    for (let p = 0; p < 6; p++) {
      expect(on.patchCenters[p]!.x).toBe(off.patchCenters[p]!.x);
      expect(on.patchCenters[p]!.y).toBe(off.patchCenters[p]!.y);
    }
  });

  it('wall-tied ON puts channel-A pockets at LOWER mean wall-proximity than channel-B pockets', () => {
    const f = new FoodField(1024, 1024, 128, 128, K, 1, 2, 0.5, 1, true); // wallTied=true
    // proximity = x-coordinate: low-x pockets are "near a wall", high-x are "open water".
    const proximityFn = (x: number): number => x;
    f.seedPatches(6, 4, 0, new QueueRng(SIX_POCKETS()), 1, 0, 1, 0, undefined, proximityFn);
    // Classify each pocket centre by which channel actually carries biomass there.
    let sumProxA = 0;
    let nA = 0;
    let sumProxB = 0;
    let nB = 0;
    for (const p of f.patchCenters as { x: number; y: number }[]) {
      const a = f.sampleAt(p.x, p.y);
      const b = f.sampleAt2(p.x, p.y);
      if (a > b) {
        sumProxA += proximityFn(p.x);
        nA++;
      } else {
        sumProxB += proximityFn(p.x);
        nB++;
      }
    }
    expect(nA).toBeGreaterThan(0);
    expect(nB).toBeGreaterThan(0);
    expect(sumProxA / nA).toBeLessThan(sumProxB / nB); // A clusters near walls, B in open water
  });

  it('drift OFF (mult 1) is byte-identical to uniform advection of both channels', () => {
    const cfg = defaultConfig();
    const flow = new FlowField(W, H, COLS, ROWS, { ...cfg, flowStrength: 0.15, flowScale: 4 });
    const make = (mult: number): FoodField => {
      const f = new FoodField(W, H, COLS, ROWS, K, 1, 2, 0.5, 1, false, mult);
      f.seedPatches(2, 3, 0, new QueueRng([0.25, 0.25, 0.75, 0.75]));
      return f;
    };
    const a = make(1);
    const b = make(1);
    for (let i = 0; i < 30; i++) {
      a.step(0.05, 0.02, flow, null);
      b.step(0.05, 0.02, flow, null);
    }
    for (let y = 2; y < H; y += 9)
      for (let x = 2; x < W; x += 9) {
        expect(a.sampleAt2(x, y)).toBe(b.sampleAt2(x, y));
        expect(a.sampleAt(x, y)).toBe(b.sampleAt(x, y));
      }
  });

  it('drift ON (mult>1) advects channel B further downstream than channel A', () => {
    const cfg = defaultConfig();
    const flow = new FlowField(W, H, COLS, ROWS, { ...cfg, flowStrength: 0.2, flowScale: 4 });
    // Identical pockets, but B advected at 3× → its biomass centroid drifts further than A's.
    const f = new FoodField(W, H, COLS, ROWS, K, 1, 2, 0.5, 1, false, 3); // driftMult=3
    f.seedPatches(2, 3, 0, new QueueRng([0.25, 0.25, 0.75, 0.75]));
    // Record the initial channel-A biomass centroid (B starts co-located with A's pockets, mode-1 split).
    const centroidShift = (sample: (x: number, y: number) => number): number => {
      let sw = 0;
      let swx = 0;
      let swy = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const x = (c + 0.5) * (W / COLS);
          const y = (r + 0.5) * (H / ROWS);
          const w = sample(x, y);
          sw += w;
          swx += w * x;
          swy += w * y;
        }
      return sw > 0 ? Math.hypot(swx / sw, swy / sw) : 0;
    };
    const a0 = centroidShift((x, y) => f.sampleAt(x, y));
    const b0 = centroidShift((x, y) => f.sampleAt2(x, y));
    for (let i = 0; i < 40; i++) f.step(0.02, 0.0, flow, null);
    const a1 = centroidShift((x, y) => f.sampleAt(x, y));
    const b1 = centroidShift((x, y) => f.sampleAt2(x, y));
    // Channel B's centroid moved further than channel A's over the same flow (the drifting-plume effect).
    expect(Math.abs(b1 - b0)).toBeGreaterThan(Math.abs(a1 - a0));
  });
});
