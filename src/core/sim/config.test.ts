import { describe, it, expect } from 'vitest';
import { defaultConfig, serializeConfig, deserializeConfig } from './config';

describe('Config', () => {
  it('provides defaults', () => {
    const c = defaultConfig();
    expect(c.seed).toBeTypeOf('number');
    expect(c.maxCells).toBeGreaterThan(0);
    expect(c.worldWidth).toBeGreaterThan(0);
    expect(c.dt).toBeGreaterThan(0);
  });

  it('applies overrides', () => {
    const c = defaultConfig({ seed: 99, maxCells: 10 });
    expect(c.seed).toBe(99);
    expect(c.maxCells).toBe(10);
  });

  it('round-trips through JSON', () => {
    const c = defaultConfig({ seed: 7 });
    const back = deserializeConfig(serializeConfig(c));
    expect(back).toEqual(c);
  });

  it('fills missing fields with defaults on deserialize', () => {
    const back = deserializeConfig('{"seed":5}');
    expect(back.seed).toBe(5);
    expect(back.maxCells).toBe(defaultConfig().maxCells);
  });

  it('provides M2 light/economy/division defaults', () => {
    const c = defaultConfig();
    expect(c.lightGridCols).toBeGreaterThanOrEqual(3);
    expect(c.lightGridRows).toBeGreaterThanOrEqual(3);
    expect(c.lightMax).toBeGreaterThan(0);
    expect(c.photoGain).toBeGreaterThan(0);
    expect(c.basalCost).toBeGreaterThan(0);
    expect(c.digestEfficiency).toBeGreaterThan(0);
    expect(c.digestEfficiency).toBeLessThan(1);
    expect(c.divideThreshold).toBeGreaterThan(c.divideCost);
    expect(c.initialPhotoFraction).toBeGreaterThan(0);
    expect(c.initialPhotoFraction).toBeLessThanOrEqual(1);
  });
});
