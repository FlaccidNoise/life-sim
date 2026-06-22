import { describe, it, expect } from 'vitest';
import { defaultConfig } from './config';

describe('config — env knobs', () => {
  it('ships wall + flow knobs OFF by default but with sane shipping values ready to opt into', () => {
    const c = defaultConfig();
    expect(c.wallCols).toBe(512);
    // Env is OFF in defaultConfig (the no-op golden contract) — the demo opts in (src/app/main.ts).
    expect(c.wallRegionCount).toBe(0);
    expect(c.flowStrength).toBe(0);
    // The shipping tuning values are still configured so a single override turns walls on cleanly.
    expect(c.wallDensity).toBeGreaterThan(0);
    expect(c.wallDensity).toBeLessThan(1);
    expect(c.flowPushStrength).toBe(0); // push off by default
  });
  it('exposes the ablation OFF sentinels', () => {
    const c = defaultConfig({ wallRegionCount: 0, flowStrength: 0, flowPushStrength: 0 });
    expect(c.wallRegionCount).toBe(0);
    expect(c.flowStrength).toBe(0);
  });
});
