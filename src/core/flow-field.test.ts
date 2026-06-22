import { describe, it, expect } from 'vitest';
import { FlowField } from './flow-field';
import { defaultConfig } from './config';

describe('FlowField', () => {
  it('is zero everywhere when flowStrength=0', () => {
    const f = new FlowField(1024, 1024, 16, 16, defaultConfig({ flowStrength: 0 }));
    for (let i = 0; i < f.flowX.length; i++) {
      expect(f.flowX[i]).toBe(0);
      expect(f.flowY[i]).toBe(0);
    }
  });
  it('is CFL-bounded by the clamp (the clamp is the binding constraint, not raw-tiny curl)', () => {
    // flowStrength 500 makes the pre-clamp magnitude far exceed the ceiling, so the CFL CLAMP is what
    // enforces the bound (at flowStrength 5 the raw curl is already tiny and the bound passes trivially).
    const cfg = defaultConfig({ flowStrength: 500, dt: 1 });
    const f = new FlowField(1024, 1024, 16, 16, cfg);
    const cellW = 1024 / 16;
    let maxCfl = 0;
    for (let i = 0; i < f.flowX.length; i++) {
      const cfl = (Math.hypot(f.flowX[i]!, f.flowY[i]!) * cfg.dt) / cellW;
      expect(cfl).toBeLessThanOrEqual(0.2500001);
      if (cfl > maxCfl) maxCfl = cfl;
    }
    expect(maxCfl).toBeGreaterThan(0.24); // proves the clamp engaged (max pinned at the ceiling)
  });
  it('is deterministic from config.seed', () => {
    const a = new FlowField(1024, 1024, 16, 16, defaultConfig({ seed: 8, flowStrength: 2 }));
    const b = new FlowField(1024, 1024, 16, 16, defaultConfig({ seed: 8, flowStrength: 2 }));
    for (let i = 0; i < a.flowX.length; i++) expect(a.flowX[i]).toBe(b.flowX[i]);
  });
});
