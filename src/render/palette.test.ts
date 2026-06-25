import { describe, it, expect } from 'vitest';
import {
  hsv2rgb,
  dietHue,
  dietColor,
  dietShape,
  lineageColor,
  energyHue,
  energyColor,
  fieldHue,
  fieldColor,
  metabSaturation,
  METAB_MIN,
  METAB_MAX,
  DIET_HUE_HERB,
  DIET_HUE_OMNI,
  DIET_HUE_PRED,
  GLOW_CORE_R,
  GLOW_CORE_G,
  GLOW_CORE_B,
} from './palette';

describe('hsv2rgb', () => {
  it('matches the GLSL formula at primaries (full s/v)', () => {
    expect(hsv2rgb(0, 1, 1)).toEqual([255, 0, 0]); // red
    expect(hsv2rgb(1 / 3, 1, 1)).toEqual([0, 255, 0]); // green
    expect(hsv2rgb(2 / 3, 1, 1)).toEqual([0, 0, 255]); // blue
  });
  it('value scales brightness, saturation pulls toward white', () => {
    expect(hsv2rgb(0, 1, 0)).toEqual([0, 0, 0]); // black at v=0
    expect(hsv2rgb(0, 0, 1)).toEqual([255, 255, 255]); // white at s=0
  });
});

describe('dietHue', () => {
  it('pins the canonical endpoints + amber midpoint (GLSL must mirror these)', () => {
    expect(dietHue(0)).toBeCloseTo(DIET_HUE_HERB, 6);
    expect(dietHue(0.5)).toBeCloseTo(DIET_HUE_OMNI, 6);
    expect(dietHue(1)).toBeCloseTo(DIET_HUE_PRED, 6);
  });
  it('clamps out-of-range input', () => {
    expect(dietHue(-1)).toBeCloseTo(DIET_HUE_HERB, 6);
    expect(dietHue(2)).toBeCloseTo(DIET_HUE_PRED, 6);
  });
  it('moves monotonically green→amber→red (hue decreases)', () => {
    for (let t = 0; t < 1; t += 0.1)
      expect(dietHue(t + 0.1)).toBeLessThanOrEqual(dietHue(t) + 1e-9);
  });
  it('the omnivore midpoint is warmer (lower hue) than a plain linear lerp would give', () => {
    // linear green→red midpoint would be (0.33+0)/2 = 0.165 (chartreuse); eased gives amber 0.11.
    expect(dietHue(0.5)).toBeLessThan(0.165);
  });
});

describe('dietColor', () => {
  it('herbivore end is green-dominant, predator end is red-dominant', () => {
    const herb = dietColor(0);
    const pred = dietColor(1);
    expect(herb[1]).toBeGreaterThan(herb[0]); // g > r
    expect(herb[1]).toBeGreaterThan(herb[2]); // g > b
    expect(pred[0]).toBeGreaterThan(pred[1]); // r > g
    expect(pred[0]).toBeGreaterThan(pred[2]); // r > b
  });
  it('omnivore middle is vivid, not muddy (R and G both high, B low)', () => {
    const omni = dietColor(0.5);
    expect(omni[0]).toBeGreaterThan(180); // red channel high (amber)
    expect(omni[1]).toBeGreaterThan(120); // green channel present
    expect(omni[2]).toBeLessThan(omni[0]); // blue suppressed → warm, not grey
  });
});

describe('dietShape', () => {
  it('buckets into herbivore / omnivore / predator', () => {
    expect(dietShape(0)).toBe(0);
    expect(dietShape(0.39)).toBe(0);
    expect(dietShape(0.4)).toBe(1);
    expect(dietShape(0.5)).toBe(1);
    expect(dietShape(0.59)).toBe(1);
    expect(dietShape(0.6)).toBe(2);
    expect(dietShape(1)).toBe(2);
  });
});

describe('lineageColor', () => {
  it('wraps hue into [0,1) so the full wheel is usable', () => {
    expect(lineageColor(0)).toEqual(lineageColor(1));
    expect(lineageColor(0.25)).toEqual(lineageColor(1.25));
  });
  it('distinct lineages get distinct colors', () => {
    expect(lineageColor(0.0)).not.toEqual(lineageColor(0.5));
  });
});

describe('energyHue', () => {
  it('starving→red, reproductive→amber, satiated→green', () => {
    expect(energyHue(0)).toBeCloseTo(0.0, 6);
    expect(energyHue(0.5)).toBeCloseTo(0.13, 6);
    expect(energyHue(1)).toBeCloseTo(0.45, 6);
  });
  it('starving is red-dominant, satiated is green-dominant', () => {
    const starving = energyColor(0);
    const full = energyColor(1);
    expect(starving[0]).toBeGreaterThan(starving[1]);
    expect(full[1]).toBeGreaterThan(full[0]);
  });
});

describe('glow core (GLSL drift guard)', () => {
  // GLOW_CORE_* are inlined as float literals into the GLOW_FRAG/GLOW_VERT shaders in renderer.ts
  // (the abyssal-cyan bloom floor). Pin the exact values so the JS source and the GLSL can't drift.
  it('pins the abyssal-cyan bloom floor', () => {
    expect(GLOW_CORE_R).toBe(0.55);
    expect(GLOW_CORE_G).toBe(0.9);
    expect(GLOW_CORE_B).toBe(1.0);
  });
  it('is a cool cyan (blue ≥ green > red) so warm creatures still read deep-sea', () => {
    expect(GLOW_CORE_B).toBeGreaterThanOrEqual(GLOW_CORE_G);
    expect(GLOW_CORE_G).toBeGreaterThan(GLOW_CORE_R);
  });
  it('every component is a valid [0,1] color coordinate', () => {
    for (const c of [GLOW_CORE_R, GLOW_CORE_G, GLOW_CORE_B]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});

describe('metabSaturation (Tier-0 ↔ Tier-1/2 lockstep)', () => {
  it('rises with metabolic efficiency', () => {
    const lo = metabSaturation(METAB_MIN, 0);
    const hi = metabSaturation(METAB_MAX, 0);
    expect(hi).toBeGreaterThan(lo);
  });
  it('is clamped to [0,1]', () => {
    expect(metabSaturation(10, 1)).toBeLessThanOrEqual(1);
    expect(metabSaturation(-10, 0)).toBeGreaterThanOrEqual(0);
  });
  it('fearsome creatures are more saturated at equal metab', () => {
    expect(metabSaturation(1, 1)).toBeGreaterThan(metabSaturation(1, 0));
  });
});

describe('fieldColor', () => {
  it('is stable per index and spreads adjacent indices apart', () => {
    expect(fieldColor(3)).toEqual(fieldColor(3)); // deterministic
    expect(Math.abs(fieldHue(0) - fieldHue(1))).toBeGreaterThan(0.2); // golden-angle separation
    expect(fieldHue(5)).toBeGreaterThanOrEqual(0);
    expect(fieldHue(5)).toBeLessThan(1);
  });
});
