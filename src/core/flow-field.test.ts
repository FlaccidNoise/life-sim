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
  it('is CFL-bounded (|v|·dt/cellW ≤ 0.25) when active', () => {
    const cfg = defaultConfig({ flowStrength: 5, dt: 1 });
    const f = new FlowField(1024, 1024, 16, 16, cfg);
    const cellW = 1024 / 16;
    for (let i = 0; i < f.flowX.length; i++)
      expect((Math.hypot(f.flowX[i]!, f.flowY[i]!) * cfg.dt) / cellW).toBeLessThanOrEqual(
        0.2500001,
      );
  });
  it('is deterministic from config.seed', () => {
    const a = new FlowField(1024, 1024, 16, 16, defaultConfig({ seed: 8, flowStrength: 2 }));
    const b = new FlowField(1024, 1024, 16, 16, defaultConfig({ seed: 8, flowStrength: 2 }));
    for (let i = 0; i < a.flowX.length; i++) expect(a.flowX[i]).toBe(b.flowX[i]);
  });
});
