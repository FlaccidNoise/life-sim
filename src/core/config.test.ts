import { describe, it, expect } from 'vitest';
import { defaultConfig } from './config';

describe('config — env knobs', () => {
  it('ships wall + flow knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.wallCols).toBe(512);
    expect(c.wallRegionCount).toBeGreaterThan(0);
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
