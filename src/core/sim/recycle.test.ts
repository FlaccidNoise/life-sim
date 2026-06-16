import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

// Verified-survivable churn: producers out-earn basal, threshold is reachable,
// corpses decay → births AND deaths AND slot recycling within 150 ticks.
function churn(seed: number): World {
  const w = new World(
    defaultConfig({
      seed,
      maxCells: 3000,
      worldWidth: 1024,
      worldHeight: 1024,
      lightGridCols: 24,
      lightGridRows: 24,
      basalCost: 0.02,
      photoGain: 0.12,
      photoDepletion: 0.03,
      lightRegen: 0.15,
      divideThreshold: 140,
      digestRate: 8,
      digestEfficiency: 0.7,
      meatDecay: 3,
    }),
    false,
  );
  w.seedLife(800);
  for (let i = 0; i < 150; i++) w.tick();
  return w;
}

describe('free-list / generation recycle reproducibility', () => {
  it('is byte-identical across runs, including generation[] after slot recycling', () => {
    const a = churn(999);
    const b = churn(999);
    const cap = a.cells.capacity;
    expect(a.cells.aliveCount).toBeGreaterThan(0); // population survived (else arrays are all-zero)
    expect(Array.from(a.cells.fields.energy.slice(0, cap))).toEqual(
      Array.from(b.cells.fields.energy.slice(0, cap)),
    );
    expect(Array.from(a.cells.fields.cellType.slice(0, cap))).toEqual(
      Array.from(b.cells.fields.cellType.slice(0, cap)),
    );
    expect(Array.from(a.cells.fields.generation.slice(0, cap))).toEqual(
      Array.from(b.cells.fields.generation.slice(0, cap)),
    );
    // the run actually exercised recycling (some slot was freed → generation bumped)
    expect(Array.from(a.cells.fields.generation.slice(0, cap)).some((g) => g > 0)).toBe(true);
  });

  it('differs across seeds', () => {
    const a = churn(1);
    const b = churn(2);
    expect(a.cells.aliveCount).toBeGreaterThan(0);
    expect(b.cells.aliveCount).toBeGreaterThan(0);
    expect(Array.from(a.cells.fields.energy.slice(0, a.cells.capacity))).not.toEqual(
      Array.from(b.cells.fields.energy.slice(0, b.cells.capacity)),
    );
  });
});
