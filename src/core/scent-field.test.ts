import { describe, it, expect } from 'vitest';
import { ScentField, SCENT_CHANNELS, Scent } from './scent-field';

const mk = (): ScentField => new ScentField(1000, 1000, 50, 50);

describe('ScentField', () => {
  it('identity deposit splits by diet (role) and hue (signature)', () => {
    const f = mk();
    // pure grazer (diet 0), hue 0 → cos=1, sin=0
    f.deposit(500, 500, 0, 0, 10, true);
    expect(f.channel(Scent.PREY).sampleAt(500, 500)).toBeCloseTo(10); // 10·(1−0)
    expect(f.channel(Scent.PRED).sampleAt(500, 500)).toBeCloseTo(0); //  10·0
    expect(f.channel(Scent.SIG_COS).sampleAt(500, 500)).toBeCloseTo(10); // 10·(0.5+0.5·1)
    expect(f.channel(Scent.SIG_SIN).sampleAt(500, 500)).toBeCloseTo(5); //  10·(0.5+0.5·0)
  });

  it('pure hunter (diet 1) deposits into PRED, not PREY', () => {
    const f = mk();
    f.deposit(500, 500, 1, 0, 10, true);
    expect(f.channel(Scent.PREY).sampleAt(500, 500)).toBeCloseTo(0);
    expect(f.channel(Scent.PRED).sampleAt(500, 500)).toBeCloseTo(10);
  });

  it('identity-blind (false) deposits amount equally into all channels', () => {
    const f = mk();
    f.deposit(500, 500, 0.3, 0.7, 8, false);
    for (let c = 0; c < SCENT_CHANNELS; c++) {
      expect(f.channel(c).sampleAt(500, 500)).toBeCloseTo(8);
    }
  });

  it('gradientsInto writes a (gx,gy) per channel at base offset', () => {
    const f = mk();
    // deposit a blob one cell to the +x side (cell 30) so PREY has a gradient there. Sample at x=590
    // (cell 29) with step=20 (one cell): central diff reads x=610 (cell 30, blob) vs x=570 (cell 28, empty).
    f.deposit(610, 500, 0, 0, 100, true);
    const gx = new Float64Array(SCENT_CHANNELS);
    const gy = new Float64Array(SCENT_CHANNELS);
    f.gradientsInto(590, 500, 20, gx, gy, 0);
    expect(gx[Scent.PREY]).toBeGreaterThan(0); // gradient points toward the blob (+x)
    expect(gx[Scent.PRED]).toBe(0); // PRED channel empty → flat
  });

  it('stepAll + hashInto are deterministic across two identical runs', () => {
    const run = (): number[] => {
      const f = mk();
      f.deposit(500, 500, 0.4, 0.6, 5, true);
      f.deposit(520, 500, 0.4, 0.6, 5, true);
      f.stepAll(0.2, 0.02, null);
      const acc: number[] = [];
      f.hashInto({ f: (v) => acc.push(v) });
      return acc;
    };
    expect(run()).toEqual(run());
  });

  it('reset clears every channel', () => {
    const f = mk();
    f.deposit(500, 500, 0.5, 0.5, 9, true);
    f.reset();
    for (let c = 0; c < SCENT_CHANNELS; c++) expect(f.channel(c).total()).toBe(0);
  });
});
