import { describe, it, expect } from 'vitest';
import { LightField } from './light-field';
import { Rng } from '../math/rng';

const STREAM_DRIFT = 6;

/** Build + seed a LightField the way World does (light stream + dedicated drift substream). */
function seeded(
  seed: number,
  cols: number,
  rows: number,
  worldW: number,
  worldH: number,
  patchCount: number,
  patchRadius: number,
  lightMax: number,
): LightField {
  const lf = new LightField(cols, rows, worldW, worldH);
  const rng = new Rng(seed);
  lf.init(rng, patchCount, patchRadius, lightMax, rng.split(STREAM_DRIFT));
  return lf;
}

describe('LightField init', () => {
  it('produces a NON-uniform (patchy) field — the anti-monoculture gradient', () => {
    const lf = seeded(1, 64, 64, 4096, 4096, 32, 6, 1);
    let min = Infinity;
    let max = -Infinity;
    for (const v of lf.light) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1 + 1e-6);
    expect(max - min).toBeGreaterThan(0.1); // genuinely patchy, not flat
  });

  it('is reproducible from the same seed and differs across seeds', () => {
    const a = seeded(7, 32, 32, 4096, 4096, 16, 4, 1);
    const b = seeded(7, 32, 32, 4096, 4096, 16, 4, 1);
    const c = seeded(8, 32, 32, 4096, 4096, 16, 4, 1);
    expect(Array.from(a.light)).toEqual(Array.from(b.light));
    expect(Array.from(a.light)).not.toEqual(Array.from(c.light));
  });

  it('seeds capacity equal to the initial light (patches regen back to their shape)', () => {
    const lf = seeded(3, 16, 16, 1024, 1024, 8, 3, 1);
    expect(Array.from(lf.cap)).toEqual(Array.from(lf.light));
  });
});

describe('LightField dynamics', () => {
  it('deplete reduces a patch and clamps at zero', () => {
    const lf = seeded(1, 8, 8, 800, 800, 4, 2, 1);
    const i = lf.patchIndex(400, 400);
    const before = lf.light[i]!;
    lf.depleteAt(400, 400, before + 5); // over-deplete
    expect(lf.light[i]).toBe(0);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it('regen pushes a depleted patch back toward capacity', () => {
    const lf = seeded(1, 8, 8, 800, 800, 4, 2, 1);
    const i = lf.patchIndex(400, 400);
    lf.depleteAt(400, 400, lf.light[i]!); // empty it
    const cap = lf.cap[i]!;
    lf.step(0, 0.5); // no diffusion, strong regen
    expect(lf.light[i]).toBeGreaterThan(0);
    expect(lf.light[i]).toBeLessThanOrEqual(cap + 1e-6);
  });

  it('pure diffusion (regen=0) conserves total light', () => {
    const lf = seeded(2, 8, 8, 800, 800, 4, 2, 1);
    const sum = (a: Float32Array): number => a.reduce((s, v) => s + v, 0);
    const before = sum(lf.light);
    lf.step(0.2, 0);
    expect(sum(lf.light)).toBeCloseTo(before, 3);
  });

  it('diffusion spreads toroidally across the wrap edge', () => {
    const lf = new LightField(8, 8, 800, 800);
    // hand-set a single spike at column 0, then check column 7 (wrapped neighbour)
    lf.cap.fill(0);
    lf.light.fill(0);
    lf.light[0] = 1; // row 0, col 0
    lf.step(0.2, 0);
    expect(lf.light[7]!).toBeGreaterThan(0); // wrapped left neighbour received light
  });
});

describe('LightField.driftCap', () => {
  function freshCap(seed: number): { f: LightField; cap0: number[] } {
    const f = seeded(seed, 16, 16, 256, 256, 5, 4, 1);
    return { f, cap0: Array.from(f.cap) };
  }

  it('amplitude-0 recompute is byte-identical to the seeded cap (HARD no-op)', () => {
    const { f, cap0 } = freshCap(42);
    f.driftCap(123, 0); // amplitude 0
    expect(Array.from(f.cap)).toEqual(cap0); // cap untouched, byte-for-byte
  });

  it('amplitude-0 recompute at tick 0 also matches seed', () => {
    const { f, cap0 } = freshCap(7);
    f.driftCap(0, 0);
    expect(Array.from(f.cap)).toEqual(cap0);
  });

  it('static-center recompute (drift frozen) reproduces the seeded cap byte-for-byte', () => {
    // Amplitude>0 but tick chosen so sin/cos are NOT what we freeze; instead verify the
    // accumulation-order invariant: a recompute at the BASE centers (amplitude 0 path forced
    // via the drift math with amp 0) equals the seed. amplitude 0 already covers the no-op;
    // here we confirm gaussianSum at the retained base records == the seed even when invoked
    // through driftCap's own code path at amplitude 0.
    const { f, cap0 } = freshCap(99);
    f.driftCap(987654, 0);
    expect(Array.from(f.cap)).toEqual(cap0);
  });

  it('amplitude>0 migrates the cap (it actually changes) but stays in [0, lightMax]', () => {
    const { f, cap0 } = freshCap(99);
    f.driftCap(500, 3); // amplitude 3 grid cells, tick 500
    const cap1 = Array.from(f.cap);
    expect(cap1).not.toEqual(cap0); // the zone moved
    for (const v of cap1) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('drift is a pure deterministic f(tick): same tick → same cap', () => {
    const a = freshCap(5).f;
    const b = freshCap(5).f;
    a.driftCap(250, 3);
    b.driftCap(250, 3);
    expect(Array.from(a.cap)).toEqual(Array.from(b.cap));
  });

  it('different ticks → different cap (the center is actually moving)', () => {
    const f = freshCap(13).f;
    f.driftCap(100, 3);
    const t100 = Array.from(f.cap);
    f.driftCap(400, 3);
    const t400 = Array.from(f.cap);
    expect(t400).not.toEqual(t100);
  });
});
