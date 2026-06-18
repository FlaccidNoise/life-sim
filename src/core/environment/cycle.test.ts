import { describe, it, expect } from 'vitest';
import { dayFraction, seasonFraction, lightMultiplier, ambientLight } from './cycle';

// ---------------------------------------------------------------------------
// dayFraction
// ---------------------------------------------------------------------------

describe('dayFraction', () => {
  it('returns values in [0, 1] for depth=1', () => {
    const dl = 600;
    for (let t = 0; t < 2000; t++) {
      const v = dayFraction(t, dl, 1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('depth=0 → always 1 (eternal noon, no night pressure)', () => {
    const dl = 600;
    for (let t = 0; t < 2000; t++) {
      expect(dayFraction(t, dl, 0)).toBe(1);
    }
  });

  it('depth=1 → hits 0 at midnight (tick aligned to night)', () => {
    const dl = 600;
    // midnight: sin(2π * tick / dl) = -1 → raw = 0 → dayFraction = 0
    // sin = -1 at 3π/2 → 2π * tick / dl = 3π/2 → tick = 0.75 * dl
    const midnight = Math.round(0.75 * dl);
    expect(dayFraction(midnight, dl, 1)).toBeCloseTo(0, 6);
  });

  it('depth=1 → 1 at midday (tick aligned to noon)', () => {
    const dl = 600;
    // noon: sin = 1 → raw = 1
    const noon = Math.round(0.25 * dl);
    expect(dayFraction(noon, dl, 1)).toBeCloseTo(1, 6);
  });

  it('depth=0.6 → night bottom ≈ 0.4 (not total darkness)', () => {
    const dl = 600;
    const midnight = Math.round(0.75 * dl);
    expect(dayFraction(midnight, dl, 0.6)).toBeCloseTo(0.4, 4);
  });

  it('is periodic with period dayLength', () => {
    const dl = 600;
    for (let t = 0; t < dl; t += 37) {
      expect(dayFraction(t, dl, 0.7)).toBeCloseTo(dayFraction(t + dl, dl, 0.7), 10);
      expect(dayFraction(t, dl, 0.7)).toBeCloseTo(dayFraction(t + 3 * dl, dl, 0.7), 10);
    }
  });
});

// ---------------------------------------------------------------------------
// seasonFraction
// ---------------------------------------------------------------------------

describe('seasonFraction', () => {
  it('returns values in [0, 1]', () => {
    const sl = 12000;
    for (let t = 0; t < sl; t += 500) {
      const v = seasonFraction(t, sl);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is periodic with period seasonLength', () => {
    const sl = 12000;
    for (let t = 0; t < sl; t += 1000) {
      expect(seasonFraction(t, sl)).toBeCloseTo(seasonFraction(t + sl, sl), 10);
      expect(seasonFraction(t, sl)).toBeCloseTo(seasonFraction(t + 7 * sl, sl), 10);
    }
  });

  it('peaks at 1 one quarter through the cycle (summer peak)', () => {
    const sl = 12000;
    const summer = Math.round(0.25 * sl);
    expect(seasonFraction(summer, sl)).toBeCloseTo(1, 6);
  });

  it('bottoms at 0 three quarters through (winter trough)', () => {
    const sl = 12000;
    const winter = Math.round(0.75 * sl);
    expect(seasonFraction(winter, sl)).toBeCloseTo(0, 6);
  });
});

// ---------------------------------------------------------------------------
// lightMultiplier
// ---------------------------------------------------------------------------

describe('lightMultiplier', () => {
  it('returns values in [0, 1] for all depths ∈ [0, 1]', () => {
    for (let t = 0; t < 5000; t += 137) {
      const m = lightMultiplier(t, 600, 0.6, 12000, 0.25);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('both depths=0 → always 1 (disabled cycle)', () => {
    for (let t = 0; t < 5000; t += 137) {
      expect(lightMultiplier(t, 600, 0, 12000, 0)).toBe(1);
    }
  });

  it('dayNightDepth=0, seasonDepth=1 → pure season swing (day is flat at 1)', () => {
    const sl = 12000;
    const winter = Math.round(0.75 * sl);
    const m = lightMultiplier(winter, 600, 0, sl, 1);
    expect(m).toBeCloseTo(0, 6); // season at winter trough * day=1
  });

  it('seasonDepth=0, dayNightDepth=1 → pure day/night swing (season flat at 1)', () => {
    const dl = 600;
    const midnight = Math.round(0.75 * dl);
    const m = lightMultiplier(midnight, dl, 1, 12000, 0);
    expect(m).toBeCloseTo(0, 6); // day at midnight * season=1
  });

  it('at midday + summer peak: lightMultiplier ≈ 1', () => {
    const dl = 600;
    const sl = 12000;
    // day peaks at t = 150 + 600k; season peaks at t = 3000 + 12000m.
    // t=3150 hits day peak (3150=150+5×600) and is only 150 ticks past
    // season peak (3000), so season ≈ 0.9985.
    const t = 3150;
    const m = lightMultiplier(t, dl, 1, sl, 1);
    expect(m).toBeGreaterThanOrEqual(0.99);
  });

  it('is a pure deterministic function — same inputs → same output', () => {
    for (let t = 0; t < 1000; t += 73) {
      const a = lightMultiplier(t, 600, 0.6, 12000, 0.25);
      const b = lightMultiplier(t, 600, 0.6, 12000, 0.25);
      expect(a).toBe(b);
    }
  });
});

// ---------------------------------------------------------------------------
// ambientLight
// ---------------------------------------------------------------------------

describe('ambientLight', () => {
  it('returns values in [0, 1]', () => {
    for (let t = 0; t < 2000; t++) {
      const v = ambientLight(t, 600, 0.6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('depth=0 → always 1', () => {
    for (let t = 0; t < 500; t += 17) {
      expect(ambientLight(t, 600, 0)).toBe(1);
    }
  });

  it('depth=1 → hits 0 at midnight, 1 at midday', () => {
    const dl = 600;
    expect(ambientLight(Math.round(0.75 * dl), dl, 1)).toBeCloseTo(0, 6);
    expect(ambientLight(Math.round(0.25 * dl), dl, 1)).toBeCloseTo(1, 6);
  });

  it('is a pure deterministic function — no state, no RNG', () => {
    for (let t = 0; t < 1000; t += 41) {
      expect(ambientLight(t, 600, 0.6)).toBe(ambientLight(t, 600, 0.6));
    }
  });
});