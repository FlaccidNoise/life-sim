import { describe, it, expect } from 'vitest';
import { defaultConfig } from './config';

describe('config — sight knobs default OFF', () => {
  it('defaults viewRange and viewHalfAngle to 0', () => {
    const cfg = defaultConfig();
    expect(cfg.viewRange).toBe(0);
    expect(cfg.viewHalfAngle).toBe(0);
  });
  it('round-trips through overrides', () => {
    const cfg = defaultConfig({ viewRange: 48, viewHalfAngle: Math.PI / 4 });
    expect(cfg.viewRange).toBe(48);
    expect(cfg.viewHalfAngle).toBeCloseTo(Math.PI / 4, 10);
  });
});
